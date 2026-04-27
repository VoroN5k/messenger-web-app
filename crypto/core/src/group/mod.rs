// Group encryption using the Signal Sender Key protocol.
//
// Each sender maintains a single SenderState per group conversation and
// ratchets it forward with every outgoing message. Recipients hold one
// ReceiverState per group member and can decrypt out-of-order messages
// within the MAX_SKIP window.
//
// Security properties:
//   Forward secrecy (per sender): old message keys are deleted after use.
//   Authentication: every message carries an Ed25519 signature; recipients
//     verify before decryption to prevent signature-stripping attacks.
//   Integrity: AES-GCM tag covers the ciphertext; AAD binds the metadata
//     (key_id, iteration) so ciphertext cannot be spliced across chains.
//   No break-in recovery: unlike the Double Ratchet, sender key chains do
//     not include a DH ratchet. This is the known Signal trade-off for
//     efficient 1-to-N group delivery.

pub mod distribution;
pub mod sender_key;

use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::{
    error::CryptoError,
    utils::{aead_decrypt, aead_encrypt, serde_bytes64},
};

use sender_key::{iteration_nonce, ReceiverState, SenderState};

// ---------------------------------------------------------------------------
// Wire message
// ---------------------------------------------------------------------------

// Broadcast to every group member. The signature lets each recipient verify
// the message came from the expected sender before attempting decryption.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SenderKeyMessage {
    pub key_id: u32,
    pub iteration: u32,
    pub ciphertext: Vec<u8>,
    #[serde(with = "serde_bytes64")]
    pub signature: [u8; 64], // Ed25519 over key_id || iteration || ciphertext
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// AAD = key_id(4 BE) || iteration(4 BE).
// Binds the AES-GCM tag to the position in the chain so ciphertext from one
// iteration cannot be replayed at a different position.
fn message_aad(key_id: u32, iteration: u32) -> [u8; 8] {
    let mut aad = [0u8; 8];
    aad[..4].copy_from_slice(&key_id.to_be_bytes());
    aad[4..].copy_from_slice(&iteration.to_be_bytes());
    aad
}

// Signed payload = key_id(4) || iteration(4) || ciphertext.
// Signing the ciphertext prevents an attacker who can forge distribution
// messages from substituting ciphertexts between group members.
fn signed_payload(key_id: u32, iteration: u32, ciphertext: &[u8]) -> Vec<u8> {
    let mut payload = Vec::with_capacity(8 + ciphertext.len());
    payload.extend_from_slice(&key_id.to_be_bytes());
    payload.extend_from_slice(&iteration.to_be_bytes());
    payload.extend_from_slice(ciphertext);
    payload
}

// ---------------------------------------------------------------------------
// Encrypt
// ---------------------------------------------------------------------------

// Encrypt `plaintext` for the group, advancing the sender chain by one step.
// The returned SenderKeyMessage must be broadcast to all members.
pub fn encrypt(state: &mut SenderState, plaintext: &[u8]) -> Result<SenderKeyMessage, CryptoError> {
    let key_id = state.key_id;
    let iteration = state.iteration; // capture before next_message_key advances it
    let (mut mk, nonce) = state.next_message_key();

    let aad = message_aad(key_id, iteration);
    let ciphertext = aead_encrypt(&mk, &nonce, plaintext, &aad);
    mk.zeroize();
    let ciphertext = ciphertext?;

    let payload = signed_payload(key_id, iteration, &ciphertext);
    let signature = state.sign(&payload);

    Ok(SenderKeyMessage { key_id, iteration, ciphertext, signature })
}

// ---------------------------------------------------------------------------
// Decrypt
// ---------------------------------------------------------------------------

// Verify the sender's Ed25519 signature, then decrypt the message.
// Signature is checked BEFORE key derivation to avoid oracle-style attacks
// where an attacker learns whether a forged ciphertext decrypts correctly.
pub fn decrypt(state: &mut ReceiverState, msg: &SenderKeyMessage) -> Result<Vec<u8>, CryptoError> {
    let payload = signed_payload(msg.key_id, msg.iteration, &msg.ciphertext);
    state.signing_pub.verify(&payload, &msg.signature)?;

    let mut mk = state.message_key_for(msg.iteration)?;
    let nonce = iteration_nonce(msg.iteration);
    let aad = message_aad(msg.key_id, msg.iteration);

    let result = aead_decrypt(&mk, &nonce, &msg.ciphertext, &aad);
    mk.zeroize();
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use distribution::{create_distribution_message, process_distribution_message};

    fn make_group(members: usize) -> (SenderState, Vec<ReceiverState>) {
        let sender = SenderState::generate();
        let dist = create_distribution_message(&sender);
        let receivers = (0..members).map(|_| process_distribution_message(&dist)).collect();
        (sender, receivers)
    }

    #[test]
    fn single_receiver_decrypts() {
        let (mut sender, mut receivers) = make_group(1);
        let msg = encrypt(&mut sender, b"hello group").unwrap();
        let pt = decrypt(&mut receivers[0], &msg).unwrap();
        assert_eq!(pt, b"hello group");
    }

    #[test]
    fn multiple_receivers_all_decrypt() {
        let (mut sender, mut receivers) = make_group(3);
        let msg = encrypt(&mut sender, b"broadcast").unwrap();
        for r in &mut receivers {
            assert_eq!(decrypt(r, &msg).unwrap(), b"broadcast");
        }
    }

    #[test]
    fn sequential_messages() {
        let (mut sender, mut receivers) = make_group(1);
        for i in 0u8..10 {
            let msg = encrypt(&mut sender, &[i; 4]).unwrap();
            assert_eq!(decrypt(&mut receivers[0], &msg).unwrap(), &[i; 4]);
        }
    }

    #[test]
    fn out_of_order_delivery() {
        let (mut sender, mut receivers) = make_group(1);
        let m0 = encrypt(&mut sender, b"zero").unwrap();
        let m1 = encrypt(&mut sender, b"one").unwrap();
        let m2 = encrypt(&mut sender, b"two").unwrap();

        // deliver 2 → 0 → 1
        assert_eq!(decrypt(&mut receivers[0], &m2).unwrap(), b"two");
        assert_eq!(decrypt(&mut receivers[0], &m0).unwrap(), b"zero");
        assert_eq!(decrypt(&mut receivers[0], &m1).unwrap(), b"one");
    }

    #[test]
    fn skipped_key_removed_after_use() {
        let (mut sender, mut receivers) = make_group(1);
        let m0 = encrypt(&mut sender, b"a").unwrap();
        let m1 = encrypt(&mut sender, b"b").unwrap();

        decrypt(&mut receivers[0], &m1).unwrap(); // skips m0
        assert_eq!(receivers[0].skipped.len(), 1);

        decrypt(&mut receivers[0], &m0).unwrap(); // consumes cached key
        assert_eq!(receivers[0].skipped.len(), 0);
    }

    #[test]
    fn tampered_ciphertext_rejected() {
        let (mut sender, mut receivers) = make_group(1);
        let mut msg = encrypt(&mut sender, b"secret").unwrap();
        msg.ciphertext[0] ^= 0xff;
        // signature now covers original ciphertext — verify fails first
        assert!(decrypt(&mut receivers[0], &msg).is_err());
    }

    #[test]
    fn tampered_signature_rejected() {
        let (mut sender, mut receivers) = make_group(1);
        let mut msg = encrypt(&mut sender, b"msg").unwrap();
        msg.signature[0] ^= 0xff;
        assert!(matches!(
            decrypt(&mut receivers[0], &msg),
            Err(CryptoError::SignatureVerification)
        ));
    }

    #[test]
    fn replay_rejected() {
        let (mut sender, mut receivers) = make_group(1);
        let msg = encrypt(&mut sender, b"once").unwrap();
        decrypt(&mut receivers[0], &msg).unwrap();
        // second delivery of the same message must fail
        assert!(decrypt(&mut receivers[0], &msg).is_err());
    }

    #[test]
    fn skip_limit_enforced() {
        let (mut sender, mut receivers) = make_group(1);
        // produce MAX_SKIP + 2 messages, deliver only the last one
        let mut last = None;
        for _ in 0..sender_key::MAX_SKIP + 2 {
            last = Some(encrypt(&mut sender, b"x").unwrap());
        }
        assert!(matches!(
            decrypt(&mut receivers[0], last.as_ref().unwrap()),
            Err(CryptoError::SkipLimitExceeded)
        ));
    }

    #[test]
    fn late_joiner_cannot_decrypt_past_messages() {
        let (mut sender, _) = make_group(0);

        let old_msg = encrypt(&mut sender, b"before join").unwrap();

        // late joiner receives distribution message now (after old_msg was sent)
        let dist = create_distribution_message(&sender);
        let mut late = process_distribution_message(&dist);

        let new_msg = encrypt(&mut sender, b"after join").unwrap();

        // can decrypt messages sent after the distribution message
        assert_eq!(decrypt(&mut late, &new_msg).unwrap(), b"after join");
        // cannot decrypt messages sent before receiving the distribution message
        assert!(decrypt(&mut late, &old_msg).is_err());
    }

    #[test]
    fn wrong_sender_key_rejected() {
        let (_sender_a, mut receivers_a) = make_group(1);
        let (mut sender_b, _) = make_group(0);

        let msg_b = encrypt(&mut sender_b, b"from B").unwrap();
        // receiver_a has sender_a's signing key — B's signature is invalid
        assert!(matches!(
            decrypt(&mut receivers_a[0], &msg_b),
            Err(CryptoError::SignatureVerification)
        ));
    }
}
