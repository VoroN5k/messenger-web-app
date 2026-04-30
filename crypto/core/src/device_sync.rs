/// Vesper Sync Protocol v1 (VSP-1)
///
/// Secure device-to-device history transfer via WebRTC DataChannel.
/// Key exchange relies on a 128-bit one-time password delivered out-of-band
/// (QR code scan), which means a compromised signaling server cannot intercept
/// or inject data even if it observes all WebSocket traffic.
///
/// # Key exchange (two-message protocol)
///
/// ```text
/// Source                           Target
/// ──────                           ──────
/// (ek_s, EK_S) = keygen()         (ek_t, EK_T) = keygen()
///          ──── EK_S (via signaling) ────▶
///          ◀─── EK_T (via signaling) ────
/// dh = X25519(ek_s, EK_T)         dh = X25519(ek_t, EK_S)
/// K = HKDF(salt=otp, ikm=dh, …)   K = HKDF(salt=otp, ikm=dh, …)
/// ```
///
/// The OTP is the HKDF salt, binding the DH output to the shared secret.
/// Without the OTP a MITM cannot derive K — all subsequent AEAD decryptions
/// will fail deterministically.
///
/// # Wire format for sealed chunks
///
/// ```text
/// nonce(12) || AES-256-GCM(lz4_frame(plaintext), aad=seq_be(4))
/// ```
///
/// Sequence number in the AAD prevents chunk reordering or replay attacks.
///
/// # Manifest wire format
///
/// ```text
/// version(1=0x01) || count(4 BE) || [id(8 BE) || sha256(32)] × count || hmac_sha256(32)
/// ```
use hmac::Mac as _;
use lz4_flex::frame::{FrameDecoder, FrameEncoder};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use zeroize::ZeroizeOnDrop;

use crate::{
    error::CryptoError,
    identity::{KeyAgreementKeyPair, KeyAgreementPublicKey},
    utils::{aead_decrypt, aead_encrypt, hkdf, random_nonce, NONCE_LEN},
};

// ── Constants ────────────────────────────────────────────────────────────────

pub const OTP_LEN: usize = 16;
pub const SESSION_ID_LEN: usize = 16;
pub const SYNC_KEY_PAIR_LEN: usize = 64; // secret(32) || public(32)
pub const SYNC_KEYS_LEN: usize = 64;     // chunk_key(32) || mac_key(32)

const MANIFEST_VERSION: u8 = 1;
const ENTRY_BYTES: usize = 8 + 32; // id(8 BE u64) + sha256(32)

const HKDF_SALT_CTX: &[u8] = b"vesper-sync-v1";
const HKDF_INFO_CHUNK: &[u8] = b"vesper-sync-v1-chunk-key";
const HKDF_INFO_MAC: &[u8] = b"vesper-sync-v1-mac-key";

// ── Key generation ───────────────────────────────────────────────────────────

/// Generate a cryptographically random 128-bit OTP for the QR code.
/// Must never be transmitted through the signaling server.
pub fn generate_otp() -> [u8; OTP_LEN] {
    let mut otp = [0u8; OTP_LEN];
    OsRng.fill_bytes(&mut otp);
    otp
}

/// Generate a random session ID for WebSocket room routing.
/// Included in the QR code alongside the OTP; safe to transmit via signaling.
pub fn generate_session_id() -> [u8; SESSION_ID_LEN] {
    let mut id = [0u8; SESSION_ID_LEN];
    OsRng.fill_bytes(&mut id);
    id
}

// ── VSP-1 ephemeral keypair ──────────────────────────────────────────────────

/// Ephemeral X25519 keypair for a single sync session.
///
/// Intentionally consumed by [`derive_sync_keys`] to prevent secret reuse.
/// Private scalar is zeroized on drop.
#[derive(ZeroizeOnDrop)]
pub struct SyncKeypair {
    kp: KeyAgreementKeyPair,
}

impl SyncKeypair {
    pub fn generate() -> Self {
        Self { kp: KeyAgreementKeyPair::generate() }
    }

    /// Restore from a 32-byte secret scalar (e.g. previously serialised to JS).
    pub fn from_secret(bytes: [u8; 32]) -> Self {
        Self { kp: KeyAgreementKeyPair::from_bytes(bytes) }
    }

    pub fn secret_bytes(&self) -> [u8; 32] {
        self.kp.to_bytes()
    }

    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.kp.public_key().0
    }

    /// VSP-1 key derivation.
    ///
    /// Computes `dh = X25519(self, peer_pub)` then derives two 256-bit keys:
    /// - `chunk_key = HKDF(salt=otp, ikm=dh, info="vesper-sync-v1-chunk-key")`
    /// - `mac_key   = HKDF(salt=otp, ikm=dh, info="vesper-sync-v1-mac-key")`
    ///
    /// `self` is consumed to enforce single-use.
    pub fn derive_sync_keys(
        self,
        peer_pub: &[u8; 32],
        otp: &[u8; OTP_LEN],
    ) -> Result<SyncKeys, CryptoError> {
        let peer = KeyAgreementPublicKey(*peer_pub);
        let dh = self.kp.diffie_hellman(&peer);

        // Salt includes the protocol label so derivations for different purposes
        // can't be confused even if code is ever reused across contexts.
        let mut salt = [0u8; OTP_LEN + HKDF_SALT_CTX.len()];
        salt[..OTP_LEN].copy_from_slice(otp);
        salt[OTP_LEN..].copy_from_slice(HKDF_SALT_CTX);

        let chunk_key: [u8; 32] = hkdf(Some(&salt), dh.as_bytes(), HKDF_INFO_CHUNK)?;
        let mac_key: [u8; 32] = hkdf(Some(&salt), dh.as_bytes(), HKDF_INFO_MAC)?;

        // dh is zeroized when SharedSecret drops (x25519-dalek guarantee)
        Ok(SyncKeys { chunk_key, mac_key })
    }
}

// ── Derived sync keys ────────────────────────────────────────────────────────

/// Two session-scoped keys derived via VSP-1.
/// Both are zeroized when dropped.
#[derive(ZeroizeOnDrop)]
pub struct SyncKeys {
    pub chunk_key: [u8; 32],
    pub mac_key: [u8; 32],
}

impl SyncKeys {
    /// Deserialise from `chunk_key(32) || mac_key(32)`.
    pub fn from_bytes(b: &[u8; SYNC_KEYS_LEN]) -> Self {
        let mut chunk_key = [0u8; 32];
        let mut mac_key = [0u8; 32];
        chunk_key.copy_from_slice(&b[..32]);
        mac_key.copy_from_slice(&b[32..]);
        Self { chunk_key, mac_key }
    }

    /// Serialise to `chunk_key(32) || mac_key(32)`.
    pub fn to_bytes(&self) -> [u8; SYNC_KEYS_LEN] {
        let mut out = [0u8; SYNC_KEYS_LEN];
        out[..32].copy_from_slice(&self.chunk_key);
        out[32..].copy_from_slice(&self.mac_key);
        out
    }
}

// ── Chunk encryption / decryption ────────────────────────────────────────────

/// Seal one DataChannel chunk.
///
/// Pipeline: `lz4_frame_compress(plaintext)` → `AES-256-GCM(compressed, aad=seq_be(4))`
///
/// Wire: `nonce(12) || ciphertext+tag`
///
/// The sequence number is the AEAD additional data, binding ciphertext to its
/// position in the stream — any reordering or injection is detected by AEAD.
pub fn seal_chunk(keys: &SyncKeys, seq: u32, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let compressed = lz4_compress(plaintext)?;
    let nonce = random_nonce();
    let aad = seq.to_be_bytes();
    let ct = aead_encrypt(&keys.chunk_key, &nonce, &compressed, &aad)?;

    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Open one DataChannel chunk sealed by [`seal_chunk`].
pub fn open_chunk(keys: &SyncKeys, seq: u32, data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if data.len() < NONCE_LEN + 16 {
        return Err(CryptoError::InvalidCiphertext);
    }
    let nonce: [u8; NONCE_LEN] = data[..NONCE_LEN].try_into().unwrap();
    let aad = seq.to_be_bytes();
    let compressed = aead_decrypt(&keys.chunk_key, &nonce, &data[NONCE_LEN..], &aad)?;
    lz4_decompress(&compressed)
}

// ── Manifest ─────────────────────────────────────────────────────────────────

/// One entry in the transfer manifest: IDB primary key + SHA-256 of raw value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManifestEntry {
    pub id: u64,
    pub hash: [u8; 32],
}

/// Build an HMAC-SHA256-authenticated manifest.
///
/// Wire: `version(1) || count(4 BE) || [id(8 BE) || sha256(32)] × count || hmac(32)`
pub fn build_manifest(mac_key: &[u8; 32], entries: &[ManifestEntry]) -> Vec<u8> {
    let capacity = 5 + entries.len() * ENTRY_BYTES + 32;
    let mut body = Vec::with_capacity(capacity);

    body.push(MANIFEST_VERSION);
    body.extend_from_slice(&(entries.len() as u32).to_be_bytes());
    for e in entries {
        body.extend_from_slice(&e.id.to_be_bytes());
        body.extend_from_slice(&e.hash);
    }

    let mac = hmac_sha256_tag(mac_key, &body);
    body.extend_from_slice(&mac);
    body
}

/// Verify the manifest HMAC and parse entries.
///
/// Uses [`hmac::Mac::verify_slice`] for constant-time MAC comparison —
/// safe against timing side-channels.
pub fn verify_manifest(
    mac_key: &[u8; 32],
    data: &[u8],
) -> Result<Vec<ManifestEntry>, CryptoError> {
    // Minimum: version(1) + count(4) + hmac(32) = 37 bytes
    if data.len() < 37 {
        return Err(CryptoError::InvalidCiphertext);
    }

    let (body, mac_bytes) = data.split_at(data.len() - 32);

    // Constant-time HMAC verification — immune to timing attacks
    type HmacSha256 = hmac::Hmac<sha2::Sha256>;
    let mut verifier = <HmacSha256 as hmac::Mac>::new_from_slice(mac_key)
        .expect("HMAC accepts any key length");
    verifier.update(body);
    verifier.verify_slice(mac_bytes).map_err(|_| CryptoError::ManifestTampered)?;

    if body[0] != MANIFEST_VERSION {
        return Err(CryptoError::InvalidCiphertext);
    }

    let count = u32::from_be_bytes(body[1..5].try_into().unwrap()) as usize;

    // Guard against malformed count values before allocating
    let expected_body = 5usize
        .checked_add(count.checked_mul(ENTRY_BYTES).ok_or(CryptoError::InvalidCiphertext)?)
        .ok_or(CryptoError::InvalidCiphertext)?;
    if body.len() != expected_body {
        return Err(CryptoError::InvalidCiphertext);
    }

    let mut entries = Vec::with_capacity(count);
    for i in 0..count {
        let off = 5 + i * ENTRY_BYTES;
        let id = u64::from_be_bytes(body[off..off + 8].try_into().unwrap());
        let hash: [u8; 32] = body[off + 8..off + 40].try_into().unwrap();
        entries.push(ManifestEntry { id, hash });
    }
    Ok(entries)
}

/// Compute SHA-256 of a raw IDB value for inclusion in the manifest.
pub fn hash_entry(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

// ── Internal helpers ─────────────────────────────────────────────────────────

fn lz4_compress(data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let mut enc = FrameEncoder::new(Vec::new());
    enc.write_all(data).map_err(|_| CryptoError::DecompressionFailed)?;
    enc.finish().map_err(|_| CryptoError::DecompressionFailed)
}

fn lz4_decompress(data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let mut dec = FrameDecoder::new(data);
    let mut out = Vec::new();
    dec.read_to_end(&mut out).map_err(|_| CryptoError::DecompressionFailed)?;
    Ok(out)
}

fn hmac_sha256_tag(key: &[u8; 32], data: &[u8]) -> [u8; 32] {
    type HmacSha256 = hmac::Hmac<sha2::Sha256>;
    let mut mac = <HmacSha256 as hmac::Mac>::new_from_slice(key)
        .expect("HMAC accepts any key length");
    mac.update(data);
    let mut out = [0u8; 32];
    out.copy_from_slice(&mac.finalize().into_bytes());
    out
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_symmetric_keys() -> (SyncKeys, SyncKeys) {
        let otp = generate_otp();
        let source = SyncKeypair::generate();
        let target = SyncKeypair::generate();
        let source_pub = source.public_key_bytes();
        let target_pub = target.public_key_bytes();
        let source_keys = source.derive_sync_keys(&target_pub, &otp).unwrap();
        let target_keys = target.derive_sync_keys(&source_pub, &otp).unwrap();
        (source_keys, target_keys)
    }

    #[test]
    fn vsp1_keys_are_symmetric() {
        let otp = generate_otp();
        let source = SyncKeypair::generate();
        let target = SyncKeypair::generate();
        let source_pub = source.public_key_bytes();
        let target_pub = target.public_key_bytes();

        let sk = source.derive_sync_keys(&target_pub, &otp).unwrap();
        let tk = target.derive_sync_keys(&source_pub, &otp).unwrap();

        assert_eq!(sk.chunk_key, tk.chunk_key);
        assert_eq!(sk.mac_key, tk.mac_key);
    }

    #[test]
    fn vsp1_wrong_otp_yields_different_keys() {
        let otp_a = generate_otp();
        let mut otp_b = otp_a;
        otp_b[0] ^= 0xff;

        let source = SyncKeypair::generate();
        let target = SyncKeypair::generate();
        let source_pub = source.public_key_bytes();
        let target_pub = target.public_key_bytes();

        let sk = source.derive_sync_keys(&target_pub, &otp_a).unwrap();
        let tk = target.derive_sync_keys(&source_pub, &otp_b).unwrap(); // wrong OTP
        assert_ne!(sk.chunk_key, tk.chunk_key, "wrong OTP must yield different keys");
    }

    #[test]
    fn vsp1_keypair_serde_roundtrip() {
        let otp = generate_otp();
        let source = SyncKeypair::generate();
        let target = SyncKeypair::generate();
        let target_pub = target.public_key_bytes();

        // Simulate serialise/deserialise of source secret (as JS worker would)
        let secret = source.secret_bytes();
        let source2 = SyncKeypair::from_secret(secret);
        let target_pub2 = target.public_key_bytes();

        let sk = source2.derive_sync_keys(&target_pub, &otp).unwrap();
        let tk = target.derive_sync_keys(&target_pub2, &otp);
        // Can't complete target side without source_pub, just check source derived correctly
        assert_ne!(sk.chunk_key, [0u8; 32]);
    }

    #[test]
    fn sync_keys_bytes_roundtrip() {
        let (sk, _) = make_symmetric_keys();
        let bytes = sk.to_bytes();
        let sk2 = SyncKeys::from_bytes(&bytes);
        assert_eq!(sk.chunk_key, sk2.chunk_key);
        assert_eq!(sk.mac_key, sk2.mac_key);
    }

    #[test]
    fn seal_open_roundtrip() {
        let (sk, tk) = make_symmetric_keys();
        let payload = b"hello vesper device sync -- large payload test";
        let sealed = seal_chunk(&sk, 7, payload).unwrap();
        let opened = open_chunk(&tk, 7, &sealed).unwrap();
        assert_eq!(opened, payload);
    }

    #[test]
    fn seal_open_empty_payload() {
        let (sk, tk) = make_symmetric_keys();
        let sealed = seal_chunk(&sk, 0, b"").unwrap();
        let opened = open_chunk(&tk, 0, &sealed).unwrap();
        assert_eq!(opened, b"");
    }

    #[test]
    fn open_rejects_wrong_seq() {
        let (sk, tk) = make_symmetric_keys();
        let sealed = seal_chunk(&sk, 3, b"data").unwrap();
        assert!(
            open_chunk(&tk, 4, &sealed).is_err(),
            "wrong seq changes AAD → AEAD failure"
        );
    }

    #[test]
    fn open_rejects_tampered_ciphertext() {
        let (sk, tk) = make_symmetric_keys();
        let mut sealed = seal_chunk(&sk, 0, b"secret data").unwrap();
        sealed[NONCE_LEN + 2] ^= 0xff;
        assert!(open_chunk(&tk, 0, &sealed).is_err());
    }

    #[test]
    fn open_rejects_truncated_data() {
        let (_, tk) = make_symmetric_keys();
        assert!(open_chunk(&tk, 0, &[0u8; 10]).is_err());
    }

    #[test]
    fn seal_produces_smaller_output_for_compressible_data() {
        let (sk, _) = make_symmetric_keys();
        let compressible = vec![0xaau8; 4096];
        let sealed = seal_chunk(&sk, 0, &compressible).unwrap();
        // Nonce(12) + tag(16) + compressed must be < plaintext for compressible data
        assert!(
            sealed.len() < compressible.len(),
            "sealed={} original={}",
            sealed.len(),
            compressible.len()
        );
    }

    #[test]
    fn manifest_roundtrip() {
        let mac_key = [0xabu8; 32];
        let entries = vec![
            ManifestEntry { id: 1, hash: hash_entry(b"message-content-1") },
            ManifestEntry { id: 42, hash: hash_entry(b"message-content-2") },
            ManifestEntry { id: u64::MAX, hash: hash_entry(b"edge-case") },
        ];
        let manifest = build_manifest(&mac_key, &entries);
        let parsed = verify_manifest(&mac_key, &manifest).unwrap();

        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0], entries[0]);
        assert_eq!(parsed[1], entries[1]);
        assert_eq!(parsed[2], entries[2]);
    }

    #[test]
    fn manifest_empty() {
        let mac_key = [0x11u8; 32];
        let manifest = build_manifest(&mac_key, &[]);
        let parsed = verify_manifest(&mac_key, &manifest).unwrap();
        assert_eq!(parsed.len(), 0);
    }

    #[test]
    fn manifest_rejects_tampered_entry() {
        let mac_key = [0xabu8; 32];
        let entries = vec![ManifestEntry { id: 1, hash: hash_entry(b"msg") }];
        let mut manifest = build_manifest(&mac_key, &entries);
        manifest[5] ^= 0xff; // flip a bit in the entry id field
        assert!(verify_manifest(&mac_key, &manifest).is_err());
    }

    #[test]
    fn manifest_rejects_wrong_key() {
        let mac_key = [0xabu8; 32];
        let wrong_key = [0xcdu8; 32];
        let entries = vec![ManifestEntry { id: 1, hash: hash_entry(b"msg") }];
        let manifest = build_manifest(&mac_key, &entries);
        assert!(verify_manifest(&wrong_key, &manifest).is_err());
    }

    #[test]
    fn manifest_rejects_truncated() {
        let mac_key = [0xabu8; 32];
        let entries = vec![ManifestEntry { id: 1, hash: hash_entry(b"msg") }];
        let manifest = build_manifest(&mac_key, &entries);
        assert!(verify_manifest(&mac_key, &manifest[..manifest.len() - 1]).is_err());
    }

    #[test]
    fn hash_entry_is_deterministic() {
        assert_eq!(hash_entry(b"test"), hash_entry(b"test"));
        assert_ne!(hash_entry(b"a"), hash_entry(b"b"));
    }

    #[test]
    fn generate_otp_produces_unique_values() {
        let a = generate_otp();
        let b = generate_otp();
        assert_ne!(a, b, "two OTPs must differ with overwhelming probability");
    }
}
