use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use x25519_dalek::{PublicKey as X25519Public, SharedSecret, StaticSecret};
use zeroize::ZeroizeOnDrop;

use crate::error::CryptoError;

// ---------------------------------------------------------------------------
// Ed25519 identity — long-term signing key
// ---------------------------------------------------------------------------

/// Long-term identity key pair (Ed25519).
/// The private key is zeroized from memory on drop.
#[derive(ZeroizeOnDrop)]
pub struct IdentityKeyPair {
    signing_key: SigningKey,
}

/// Serialisable public portion of an Ed25519 identity key.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdentityPublicKey(pub [u8; 32]);

impl IdentityKeyPair {
    /// Generate a fresh random identity key pair using the OS RNG.
    pub fn generate() -> Self {
        Self {
            signing_key: SigningKey::generate(&mut OsRng),
        }
    }

    /// Restore a key pair from a 32-byte secret seed.
    pub fn from_bytes(seed: &[u8; 32]) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(seed),
        }
    }

    /// Export the 32-byte secret seed.
    /// **Handle with care** — store only in encrypted / secure storage.
    pub fn to_bytes(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }

    pub fn public_key(&self) -> IdentityPublicKey {
        IdentityPublicKey(self.signing_key.verifying_key().to_bytes())
    }

    /// Sign `message` and return the 64-byte Ed25519 signature.
    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        self.signing_key.sign(message).to_bytes()
    }
}

impl IdentityPublicKey {
    /// Verify an Ed25519 signature produced by the corresponding private key.
    pub fn verify(&self, message: &[u8], signature: &[u8; 64]) -> Result<(), CryptoError> {
        let verifying_key =
            VerifyingKey::from_bytes(&self.0).map_err(|_| CryptoError::InvalidKey)?;
        let sig = Signature::from_bytes(signature);
        verifying_key
            .verify(message, &sig)
            .map_err(|_| CryptoError::SignatureVerification)
    }
}

// ---------------------------------------------------------------------------
// X25519 key agreement — per-device / per-session DH key pair
// ---------------------------------------------------------------------------

/// Static X25519 key pair used for Diffie–Hellman key agreement.
/// The private scalar is zeroized from memory on drop.
#[derive(ZeroizeOnDrop)]
pub struct KeyAgreementKeyPair {
    secret: StaticSecret,
}

/// Serialisable public portion of an X25519 key agreement key.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyAgreementPublicKey(pub [u8; 32]);

impl KeyAgreementKeyPair {
    /// Generate a fresh random key pair using the OS RNG.
    pub fn generate() -> Self {
        Self {
            secret: StaticSecret::random_from_rng(OsRng),
        }
    }

    /// Restore a key pair from raw bytes.
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self {
            secret: StaticSecret::from(bytes),
        }
    }

    /// Export the raw 32-byte secret scalar.
    /// **Handle with care** — store only in encrypted / secure storage.
    pub fn to_bytes(&self) -> [u8; 32] {
        self.secret.to_bytes()
    }

    pub fn public_key(&self) -> KeyAgreementPublicKey {
        KeyAgreementPublicKey(X25519Public::from(&self.secret).to_bytes())
    }

    /// Perform X25519 Diffie–Hellman with `their_public`.
    ///
    /// The returned [`SharedSecret`] is zeroized on drop; feed its bytes
    /// directly into HKDF and discard immediately.
    pub fn diffie_hellman(&self, their_public: &KeyAgreementPublicKey) -> SharedSecret {
        let their_pub = X25519Public::from(their_public.0);
        self.secret.diffie_hellman(&their_pub)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_sign_verify_roundtrip() {
        let kp = IdentityKeyPair::generate();
        let pk = kp.public_key();
        let msg = b"hello vesper";
        let sig = kp.sign(msg);
        pk.verify(msg, &sig).expect("valid signature must verify");
    }

    #[test]
    fn identity_verify_rejects_tampered_message() {
        let kp = IdentityKeyPair::generate();
        let pk = kp.public_key();
        let sig = kp.sign(b"original");
        assert!(pk.verify(b"tampered", &sig).is_err());
    }

    #[test]
    fn identity_seed_roundtrip() {
        let kp = IdentityKeyPair::generate();
        let seed = kp.to_bytes();
        let pk_before = kp.public_key();

        let kp2 = IdentityKeyPair::from_bytes(&seed);
        assert_eq!(kp2.public_key(), pk_before);
    }

    #[test]
    fn key_agreement_dh_is_symmetric() {
        let alice = KeyAgreementKeyPair::generate();
        let bob = KeyAgreementKeyPair::generate();

        let alice_shared = alice.diffie_hellman(&bob.public_key());
        let bob_shared = bob.diffie_hellman(&alice.public_key());

        assert_eq!(alice_shared.as_bytes(), bob_shared.as_bytes());
    }

    #[test]
    fn key_agreement_seed_roundtrip() {
        let kp = KeyAgreementKeyPair::generate();
        let bytes = kp.to_bytes();
        let pk_before = kp.public_key();

        let kp2 = KeyAgreementKeyPair::from_bytes(bytes);
        assert_eq!(kp2.public_key(), pk_before);
    }
}
