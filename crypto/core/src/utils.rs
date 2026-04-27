use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use sha2::Sha256;

use crate::error::CryptoError;

pub const NONCE_LEN: usize = 12;
pub const KEY_LEN: usize = 32;

//
// HKDF-SHA-256
//

/// HKDF-Extract: `ikm` + optional `salt` → 32-byte PRK.
pub fn hkdf_extract(salt: Option<&[u8]>, ikm: &[u8]) -> [u8; KEY_LEN] {
    let (prk, _) = Hkdf::<Sha256>::extract(salt, ikm);
    prk.into()
}

/// HKDF-Expand: fills `out` from `prk` and `info`.
pub fn hkdf_expand(prk: &[u8; KEY_LEN], info: &[u8], out: &mut [u8]) -> Result<(), CryptoError> {
    Hkdf::<Sha256>::from_prk(prk)
        .map_err(|_| CryptoError::KeyDerivation)?
        .expand(info, out)
        .map_err(|_| CryptoError::KeyDerivation)
}

/// Convenience: extract + expand in one call → fixed-size output array.
pub fn hkdf<const N: usize>(
    salt: Option<&[u8]>,
    ikm: &[u8],
    info: &[u8],
) -> Result<[u8; N], CryptoError> {
    let prk = hkdf_extract(salt, ikm);
    let mut out = [0u8; N];
    hkdf_expand(&prk, info, &mut out)?;
    Ok(out)
}

//
// AES-256-GCM
//

/// Generate a random 12-byte nonce using the OS RNG.
pub fn random_nonce() -> [u8; NONCE_LEN] {
    let mut n = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut n);
    n
}

/// AES-256-GCM encrypt with explicit nonce and additional authenticated data.
/// Returns ciphertext || 16-byte GCM tag (standard aes-gcm output).
pub fn aead_encrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key))
        .encrypt(
            Nonce::from_slice(nonce),
            Payload { msg: plaintext, aad },
        )
        .map_err(|_| CryptoError::DecryptionFailed)
}

/// AES-256-GCM decrypt. `ciphertext` must be the raw output of `aead_encrypt`
/// (i.e., it already includes the 16-byte GCM tag, without a prepended nonce).
pub fn aead_decrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if ciphertext.len() < 16 {
        return Err(CryptoError::InvalidCiphertext);
    }
    Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key))
        .decrypt(
            Nonce::from_slice(nonce),
            Payload { msg: ciphertext, aad },
        )
        .map_err(|_| CryptoError::DecryptionFailed)
}

//
// Tests
//

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hkdf_extract_expand_roundtrip() {
        let prk = hkdf_extract(Some(b"salt"), b"input key material");
        let mut out = [0u8; 32];
        hkdf_expand(&prk, b"info", &mut out).unwrap();
        assert_ne!(out, [0u8; 32]);
    }

    #[test]
    fn hkdf_convenience_deterministic() {
        let a: [u8; 32] = hkdf(Some(b"s"), b"ikm", b"info").unwrap();
        let b: [u8; 32] = hkdf(Some(b"s"), b"ikm", b"info").unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn aead_encrypt_decrypt_roundtrip() {
        let key = [0x42u8; 32];
        let nonce = random_nonce();
        let plaintext = b"hello vesper";
        let aad = b"associated data";

        let ct = aead_encrypt(&key, &nonce, plaintext, aad).unwrap();
        let pt = aead_decrypt(&key, &nonce, &ct, aad).unwrap();
        assert_eq!(pt, plaintext);
    }

    #[test]
    fn aead_rejects_wrong_key() {
        let key = [0x42u8; 32];
        let bad_key = [0x00u8; 32];
        let nonce = random_nonce();
        let ct = aead_encrypt(&key, &nonce, b"secret", b"").unwrap();
        assert!(aead_decrypt(&bad_key, &nonce, &ct, b"").is_err());
    }

    #[test]
    fn aead_rejects_tampered_ciphertext() {
        let key = [0x11u8; 32];
        let nonce = random_nonce();
        let mut ct = aead_encrypt(&key, &nonce, b"data", b"").unwrap();
        ct[0] ^= 0xff;
        assert!(aead_decrypt(&key, &nonce, &ct, b"").is_err());
    }

    #[test]
    fn aead_rejects_wrong_aad() {
        let key = [0xAAu8; 32];
        let nonce = random_nonce();
        let ct = aead_encrypt(&key, &nonce, b"msg", b"real aad").unwrap();
        assert!(aead_decrypt(&key, &nonce, &ct, b"wrong aad").is_err());
    }
}
