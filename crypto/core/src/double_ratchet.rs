use std::collections::BTreeMap;

use zeroize::Zeroize;

use crate::{
    error::CryptoError,
    identity::{KeyAgreementKeyPair, KeyAgreementPublicKey},
    utils::{aead_decrypt, aead_encrypt, hkdf_expand, hkdf_extract, hmac_sha256},
};

// maximum messages we will buffer ahead per chain step (DoS guard)
const MAX_SKIP: u32 = 1000;

// KDF primitives

// HKDF(salt=rk, ikm=dh_out, info="DR_RK") -> (new_rk, new_chain_key)
// Used whenever a DH ratchet step happens.
fn kdf_rk(rk: &[u8; 32], dh_out: &[u8; 32]) -> Result<([u8; 32], [u8; 32]), CryptoError> {
    let mut prk = hkdf_extract(Some(rk), dh_out);
    let mut buf = [0u8; 64];
    let result = hkdf_expand(&prk, b"DR_RK", &mut buf);
    prk.zeroize();
    result?;

    let mut new_rk = [0u8; 32];
    let mut new_ck = [0u8; 32];
    new_rk.copy_from_slice(&buf[..32]);
    new_ck.copy_from_slice(&buf[32..]);
    buf.zeroize();
    Ok((new_rk, new_ck))
}

// HMAC-SHA-256(ck, 0x02) -> new_chain_key
// HMAC-SHA-256(ck, 0x01) -> message_key
// Signal uses HMAC here (not HKDF) to keep each step a one-way function.
fn kdf_ck(ck: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let new_ck = hmac_sha256(ck, &[0x02]);
    let mk = hmac_sha256(ck, &[0x01]);
    (new_ck, mk)
}

// Message header

// Sent in cleartext alongside each encrypted message.
// The header is also included as AAD so its integrity is authenticated.
#[derive(Clone, Debug)]
pub struct MessageHeader {
    pub dh: KeyAgreementPublicKey, // sender's current DH ratchet public key
    pub pn: u32,                   // number of messages sent in the previous sending chain
    pub n: u32,                    // message number in the current sending chain
}

// Canonical 40-byte encoding used as part of AAD.
fn encode_header(h: &MessageHeader) -> [u8; 40] {
    let mut buf = [0u8; 40];
    buf[..32].copy_from_slice(&h.dh.0);
    buf[32..36].copy_from_slice(&h.pn.to_be_bytes());
    buf[36..40].copy_from_slice(&h.n.to_be_bytes());
    buf
}

// Deterministic nonce from message number. Safe because mk is single-use.
fn message_nonce(n: u32) -> [u8; 12] {
    let mut nonce = [0u8; 12];
    nonce[..4].copy_from_slice(&n.to_be_bytes());
    nonce
}

// Full AAD = caller's additional data || encoded header.
fn build_aad(header: &MessageHeader, extra: &[u8]) -> Vec<u8> {
    let enc = encode_header(header);
    let mut aad = extra.to_vec();
    aad.extend_from_slice(&enc);
    aad
}

// Ratchet state

// Complete mutable state of one side of a Double Ratchet session.
// Must be persisted (encrypted) between application restarts.
// All secret fields are zeroized on drop.
pub struct RatchetState {
    dhs: KeyAgreementKeyPair,                         // our current DH ratchet key pair
    dhr: Option<KeyAgreementPublicKey>,               // their latest DH ratchet public key
    rk: [u8; 32],                                    // root key
    cks: Option<[u8; 32]>,                           // sending chain key
    ckr: Option<[u8; 32]>,                           // receiving chain key
    ns: u32,                                         // send message counter
    nr: u32,                                         // receive message counter
    pn: u32,                                         // messages sent in previous send chain
    // keyed by (dh_pub_bytes, message_n); bounded by MAX_SKIP per chain step
    mkskipped: BTreeMap<(Vec<u8>, u32), [u8; 32]>,
}

impl Drop for RatchetState {
    fn drop(&mut self) {
        self.rk.zeroize();
        if let Some(ref mut ck) = self.cks {
            ck.zeroize();
        }
        if let Some(ref mut ck) = self.ckr {
            ck.zeroize();
        }
        for mk in self.mkskipped.values_mut() {
            mk.zeroize();
        }
    }
}

// Initialization

// Alice's side after completing X3DH.
// bob_dh_pub is the DH key Bob used to accept the X3DH session (his SPK or
// the key published in his bundle); it becomes our first remote ratchet key.
pub fn init_sender(
    sk: [u8; 32],
    bob_dh_pub: KeyAgreementPublicKey,
) -> Result<RatchetState, CryptoError> {
    let dhs = KeyAgreementKeyPair::generate();
    let dh_out = dhs.diffie_hellman(&bob_dh_pub);
    let (rk, cks) = kdf_rk(&sk, dh_out.as_bytes())?;

    Ok(RatchetState {
        dhs,
        dhr: Some(bob_dh_pub),
        rk,
        cks: Some(cks),
        ckr: None,
        ns: 0,
        nr: 0,
        pn: 0,
        mkskipped: BTreeMap::new(),
    })
}

// Bob's side after completing X3DH.
// our_dh_pair is the key pair Bob published (SPK); the shared key sk
// becomes the root key. Bob will ratchet forward on the first received message.
pub fn init_receiver(sk: [u8; 32], our_dh_pair: KeyAgreementKeyPair) -> RatchetState {
    RatchetState {
        dhs: our_dh_pair,
        dhr: None,
        rk: sk,
        cks: None,
        ckr: None,
        ns: 0,
        nr: 0,
        pn: 0,
        mkskipped: BTreeMap::new(),
    }
}

// DH ratchet step

// Called when a message arrives with a new DH key from the remote party.
// Derives a new receive chain (using the old dhs) then a new send chain
// (using a freshly generated dhs), updating the root key twice.
fn dh_ratchet(state: &mut RatchetState, dhr_new: &KeyAgreementPublicKey) -> Result<(), CryptoError> {
    state.pn = state.ns;
    state.ns = 0;
    state.nr = 0;
    state.dhr = Some(dhr_new.clone());

    // receive chain: old dhs + their new pub
    let dh_recv = state.dhs.diffie_hellman(dhr_new);
    let (rk1, ckr) = kdf_rk(&state.rk, dh_recv.as_bytes())?;
    state.rk = rk1;
    state.ckr = Some(ckr);

    // send chain: fresh dhs + their new pub
    state.dhs = KeyAgreementKeyPair::generate();
    let dh_send = state.dhs.diffie_hellman(dhr_new);
    let (rk2, cks) = kdf_rk(&state.rk, dh_send.as_bytes())?;
    state.rk = rk2;
    state.cks = Some(cks);

    Ok(())
}

// Skip buffering

// Advance the receiving chain up to (but not including) `until`, caching
// the skipped message keys. Enforces MAX_SKIP to prevent memory exhaustion.
fn skip_message_keys(state: &mut RatchetState, until: u32) -> Result<(), CryptoError> {
    if until <= state.nr {
        return Ok(());
    }
    if state.nr.saturating_add(MAX_SKIP) < until {
        return Err(CryptoError::SkipLimitExceeded);
    }

    let ckr_init = match state.ckr {
        Some(ck) => ck,
        // no receive chain yet — nothing to skip
        None => return Ok(()),
    };

    // invariant: ckr is Some => dhr is Some (set together in dh_ratchet)
    let dhr_key = state
        .dhr
        .as_ref()
        .expect("receive chain key exists but remote DH key is missing")
        .0
        .to_vec();

    let mut ckr = ckr_init;
    while state.nr < until {
        let (new_ck, mut mk) = kdf_ck(&ckr);
        ckr.zeroize();
        ckr = new_ck;
        state.mkskipped.insert((dhr_key.clone(), state.nr), mk);
        mk.zeroize(); // clear the stack copy; map holds the authoritative value
        state.nr += 1;
    }
    state.ckr = Some(ckr);
    Ok(())
}

// Encrypt / Decrypt

// Encrypt `plaintext` and advance the sending chain by one step.
// Returns the header (must be transmitted to the recipient) and the ciphertext.
// `aad` is authenticated but not encrypted; pass an empty slice if unused.
pub fn encrypt(
    state: &mut RatchetState,
    plaintext: &[u8],
    aad: &[u8],
) -> Result<(MessageHeader, Vec<u8>), CryptoError> {
    let cks = state.cks.as_ref().ok_or(CryptoError::InvalidKey)?;
    let (new_cks, mut mk) = kdf_ck(cks);
    state.cks = Some(new_cks);

    let header = MessageHeader {
        dh: state.dhs.public_key(),
        pn: state.pn,
        n: state.ns,
    };
    state.ns += 1;

    let nonce = message_nonce(header.n);
    let full_aad = build_aad(&header, aad);
    let ct = aead_encrypt(&mk, &nonce, plaintext, &full_aad);
    mk.zeroize();
    ct.map(|c| (header, c))
}

// Decrypt a message. Returns the plaintext on success.
// Handles out-of-order delivery and performs a DH ratchet step when the
// remote party's ratchet key changes.
pub fn decrypt(
    state: &mut RatchetState,
    header: &MessageHeader,
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    // check if this is a buffered out-of-order message
    let cache_key = (header.dh.0.to_vec(), header.n);
    if let Some(mut mk) = state.mkskipped.remove(&cache_key) {
        let result = decrypt_with_mk(&mk, header, ciphertext, aad);
        mk.zeroize();
        return result;
    }

    // if the remote DH key changed, perform a DH ratchet step
    let remote_key_changed = state
        .dhr
        .as_ref()
        .map_or(true, |dhr| dhr.0 != header.dh.0);

    if remote_key_changed {
        // buffer any remaining messages in the current receive chain
        skip_message_keys(state, header.pn)?;
        dh_ratchet(state, &header.dh)?;
    }

    // buffer any messages before this one in the new receive chain
    skip_message_keys(state, header.n)?;

    // advance chain by one to get the key for this message
    let ckr = state.ckr.as_ref().ok_or(CryptoError::InvalidKey)?;
    let (new_ckr, mut mk) = kdf_ck(ckr);
    state.ckr = Some(new_ckr);
    state.nr += 1;

    let result = decrypt_with_mk(&mk, header, ciphertext, aad);
    mk.zeroize();
    result
}

fn decrypt_with_mk(
    mk: &[u8; 32],
    header: &MessageHeader,
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let nonce = message_nonce(header.n);
    let full_aad = build_aad(header, aad);
    aead_decrypt(mk, &nonce, ciphertext, &full_aad)
}

// Tests

#[cfg(test)]
mod tests {
    use super::*;

    // initialise a matched Alice/Bob pair from a shared secret
    fn make_pair(sk: [u8; 32]) -> (RatchetState, RatchetState) {
        let bob_dh = KeyAgreementKeyPair::generate();
        let bob_pub = bob_dh.public_key();
        // bob keeps the key pair; alice gets only the public half
        let alice = init_sender(sk, bob_pub).unwrap();
        let bob = init_receiver(sk, bob_dh);
        (alice, bob)
    }

    #[test]
    fn alice_to_bob_single_message() {
        let (mut alice, mut bob) = make_pair([0u8; 32]);
        let (hdr, ct) = encrypt(&mut alice, b"hello", b"").unwrap();
        let pt = decrypt(&mut bob, &hdr, &ct, b"").unwrap();
        assert_eq!(pt, b"hello");
    }

    #[test]
    fn bob_to_alice_single_message() {
        let (mut alice, mut bob) = make_pair([0u8; 32]);
        // alice sends first to trigger bob's DH ratchet
        let (h, c) = encrypt(&mut alice, b"ping", b"").unwrap();
        decrypt(&mut bob, &h, &c, b"").unwrap();

        let (h2, c2) = encrypt(&mut bob, b"pong", b"").unwrap();
        let pt = decrypt(&mut alice, &h2, &c2, b"").unwrap();
        assert_eq!(pt, b"pong");
    }

    #[test]
    fn multiple_round_trips() {
        let (mut alice, mut bob) = make_pair([1u8; 32]);
        for i in 0u8..10 {
            let msg = [i; 8];
            let (h, c) = encrypt(&mut alice, &msg, b"ad").unwrap();
            assert_eq!(decrypt(&mut bob, &h, &c, b"ad").unwrap(), msg);

            let (h2, c2) = encrypt(&mut bob, &msg, b"ad").unwrap();
            assert_eq!(decrypt(&mut alice, &h2, &c2, b"ad").unwrap(), msg);
        }
    }

    #[test]
    fn out_of_order_delivery() {
        let (mut alice, mut bob) = make_pair([2u8; 32]);

        let (h0, c0) = encrypt(&mut alice, b"msg0", b"").unwrap();
        let (h1, c1) = encrypt(&mut alice, b"msg1", b"").unwrap();
        let (h2, c2) = encrypt(&mut alice, b"msg2", b"").unwrap();

        // deliver out of order: 2, 0, 1
        assert_eq!(decrypt(&mut bob, &h2, &c2, b"").unwrap(), b"msg2");
        assert_eq!(decrypt(&mut bob, &h0, &c0, b"").unwrap(), b"msg0");
        assert_eq!(decrypt(&mut bob, &h1, &c1, b"").unwrap(), b"msg1");
    }

    #[test]
    fn skipped_keys_are_removed_after_use() {
        let (mut alice, mut bob) = make_pair([3u8; 32]);
        let (h0, c0) = encrypt(&mut alice, b"first", b"").unwrap();
        let (h1, c1) = encrypt(&mut alice, b"second", b"").unwrap();

        decrypt(&mut bob, &h1, &c1, b"").unwrap(); // skips h0
        assert_eq!(bob.mkskipped.len(), 1);

        decrypt(&mut bob, &h0, &c0, b"").unwrap(); // uses cached key
        assert_eq!(bob.mkskipped.len(), 0); // entry removed
    }

    #[test]
    fn tampered_ciphertext_rejected() {
        let (mut alice, mut bob) = make_pair([4u8; 32]);
        let (h, mut c) = encrypt(&mut alice, b"secret", b"").unwrap();
        c[0] ^= 0xff;
        assert!(decrypt(&mut bob, &h, &c, b"").is_err());
    }

    #[test]
    fn tampered_aad_rejected() {
        let (mut alice, mut bob) = make_pair([5u8; 32]);
        let (h, c) = encrypt(&mut alice, b"msg", b"real").unwrap();
        assert!(decrypt(&mut bob, &h, &c, b"fake").is_err());
    }

    #[test]
    fn skip_limit_enforced() {
        let (mut alice, mut bob) = make_pair([6u8; 32]);

        // encrypt MAX_SKIP + 2 messages without delivering any
        let mut headers_and_cts = Vec::new();
        for _ in 0..MAX_SKIP + 2 {
            headers_and_cts.push(encrypt(&mut alice, b"x", b"").unwrap());
        }

        // delivering the last message should fail: gap exceeds MAX_SKIP
        let (h_last, c_last) = headers_and_cts.last().unwrap();
        assert!(matches!(
            decrypt(&mut bob, h_last, c_last, b""),
            Err(CryptoError::SkipLimitExceeded)
        ));
    }

    #[test]
    fn forward_secrecy_old_key_unusable() {
        let (mut alice, mut bob) = make_pair([7u8; 32]);

        let (h0, c0) = encrypt(&mut alice, b"past", b"").unwrap();
        decrypt(&mut bob, &h0, &c0, b"").unwrap();

        // exchange several more messages to advance the ratchet
        for _ in 0..3 {
            let (h, c) = encrypt(&mut alice, b"x", b"").unwrap();
            decrypt(&mut bob, &h, &c, b"").unwrap();
            let (h2, c2) = encrypt(&mut bob, b"y", b"").unwrap();
            decrypt(&mut alice, &h2, &c2, b"").unwrap();
        }

        // replaying the very first ciphertext must fail — the key is gone
        assert!(decrypt(&mut bob, &h0, &c0, b"").is_err());
    }
}
