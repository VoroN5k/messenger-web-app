// PIN-protected private key encryption.
//
// Replaces PBKDF2-SHA256 (previously used in the TypeScript client) with
// Argon2id, which is memory-hard and therefore orders-of-magnitude more
// resistant to GPU and ASIC brute-force against a stolen blob.
//
// Blob wire format (little-endian for fields, big-endian for counters):
//
//   Offset  Len  Field
//   0       1    version  (0x01)
//   1       4    m_cost   (KiB, BE u32)
//   5       4    t_cost   (iterations, BE u32)
//   9       4    p_cost   (parallelism, BE u32)
//   13      16   salt     (random)
//   29      12   nonce    (random AES-GCM nonce)
//   41      var  ciphertext (plaintext + 16-byte GCM tag)
//
// The byte range [0..29] is used as AAD for AES-GCM, which authenticates
// version + KDF parameters + salt. An attacker who modifies the parameters
// in the stored blob to weaken the KDF will break decryption — the tag
// will not verify.

use argon2::{Algorithm, Argon2, Params, Version};
use rand_core::{OsRng, RngCore};
use zeroize::Zeroize;

use crate::{
    error::CryptoError,
    utils::{aead_decrypt, aead_encrypt, NONCE_LEN},
};

// ---------------------------------------------------------------------------
// Blob version
// ---------------------------------------------------------------------------

const BLOB_VERSION: u8 = 0x01;

// Header before the nonce: version(1) + m_cost(4) + t_cost(4) + p_cost(4) + salt(16) = 29 bytes.
// This entire prefix is authenticated by the GCM tag.
const HEADER_LEN: usize = 29;
const SALT_LEN: usize = 16;
const MIN_CIPHERTEXT_LEN: usize = 16; // GCM tag only (empty plaintext edge case)

// ---------------------------------------------------------------------------
// Argon2id parameter presets
// ---------------------------------------------------------------------------

// Parameters stored alongside ciphertext so they can be read back at decrypt
// time and so the caller can detect whether an upgrade is needed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EncryptParams {
    pub m_cost: u32, // memory in KiB
    pub t_cost: u32, // number of passes
    pub p_cost: u32, // parallelism
}

impl EncryptParams {
    // Suitable for most environments (native, Electron, modern mobile).
    // 64 MB, 3 passes: ~1-2 s on a 2023 laptop, ~0.5 s per GPU core → good margin.
    pub const STANDARD: Self = Self { m_cost: 65536, t_cost: 3, p_cost: 1 };

    // Reduced memory for constrained WASM environments or older mobile hardware.
    // Still far superior to PBKDF2 in practice.
    pub const WASM: Self = Self { m_cost: 32768, t_cost: 2, p_cost: 1 };

    // Only for tests — never use in production.
    #[cfg(test)]
    pub const FAST_TEST: Self = Self { m_cost: 8, t_cost: 1, p_cost: 1 };
}

// ---------------------------------------------------------------------------
// Encrypted key blob
// ---------------------------------------------------------------------------

// Opaque container returned by `encrypt_key_with_pin`.
// All fields are non-secret (ciphertext authenticated, params/salt/nonce are public).
#[derive(Clone, Debug)]
pub struct EncryptedKeyBlob {
    pub params: EncryptParams,
    pub salt: [u8; SALT_LEN],
    pub nonce: [u8; NONCE_LEN],
    pub ciphertext: Vec<u8>,
}

impl EncryptedKeyBlob {
    // True when the blob was created with parameters weaker than `target`.
    // The caller can use this to silently re-encrypt with stronger params
    // after a successful PIN unlock.
    pub fn needs_upgrade(&self, target: &EncryptParams) -> bool {
        self.params.m_cost < target.m_cost
            || self.params.t_cost < target.t_cost
            || self.params.p_cost < target.p_cost
    }
}

// ---------------------------------------------------------------------------
// Encrypt
// ---------------------------------------------------------------------------

// Derive a 32-byte AES-256-GCM key from `pin` using Argon2id, then encrypt
// `key_bytes` (the user's X25519 private key or any secret material).
//
// `pin` is accepted as bytes so callers control encoding (UTF-8 is expected).
// The caller is responsible for zeroizing the pin buffer after this call.
pub fn encrypt_key_with_pin(
    key_bytes: &[u8],
    pin: &[u8],
    params: &EncryptParams,
) -> Result<EncryptedKeyBlob, CryptoError> {
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let mut aes_key = derive_aes_key(pin, &salt, params)?;
    let aad = build_aad(params, &salt);

    let ciphertext = aead_encrypt(&aes_key, &nonce, key_bytes, &aad);
    aes_key.zeroize();
    let ciphertext = ciphertext?;

    Ok(EncryptedKeyBlob { params: *params, salt, nonce, ciphertext })
}

// ---------------------------------------------------------------------------
// Decrypt
// ---------------------------------------------------------------------------

// Verify the PIN and decrypt the blob. Returns the original key bytes on
// success, or `CryptoError::DecryptionFailed` on wrong PIN or tampered data.
//
// The GCM tag covers the ciphertext AND the KDF parameters (via AAD), so a
// tampered m_cost / t_cost / p_cost field will cause decryption to fail.
pub fn decrypt_key_with_pin(
    blob: &EncryptedKeyBlob,
    pin: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if blob.ciphertext.len() < MIN_CIPHERTEXT_LEN {
        return Err(CryptoError::InvalidCiphertext);
    }

    let mut aes_key = derive_aes_key(pin, &blob.salt, &blob.params)?;
    let aad = build_aad(&blob.params, &blob.salt);

    let result = aead_decrypt(&aes_key, &blob.nonce, &blob.ciphertext, &aad);
    aes_key.zeroize();
    result
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

// Serialize to the wire format described at the top of this file.
pub fn serialize_blob(blob: &EncryptedKeyBlob) -> Vec<u8> {
    let mut out = Vec::with_capacity(HEADER_LEN + NONCE_LEN + blob.ciphertext.len());
    out.extend_from_slice(&build_aad(&blob.params, &blob.salt)); // [0..29]
    out.extend_from_slice(&blob.nonce); // [29..41]
    out.extend_from_slice(&blob.ciphertext); // [41..]
    out
}

// Deserialize from the wire format. Returns an error if the buffer is too
// short or the version byte is unrecognized.
pub fn deserialize_blob(data: &[u8]) -> Result<EncryptedKeyBlob, CryptoError> {
    const MIN_LEN: usize = HEADER_LEN + NONCE_LEN + MIN_CIPHERTEXT_LEN;
    if data.len() < MIN_LEN {
        return Err(CryptoError::InvalidCiphertext);
    }

    if data[0] != BLOB_VERSION {
        return Err(CryptoError::InvalidKey);
    }

    let m_cost = u32::from_be_bytes(data[1..5].try_into().unwrap());
    let t_cost = u32::from_be_bytes(data[5..9].try_into().unwrap());
    let p_cost = u32::from_be_bytes(data[9..13].try_into().unwrap());

    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&data[13..29]);

    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(&data[29..41]);

    let ciphertext = data[41..].to_vec();

    Ok(EncryptedKeyBlob {
        params: EncryptParams { m_cost, t_cost, p_cost },
        salt,
        nonce,
        ciphertext,
    })
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

// Run Argon2id and write a 32-byte key into `out`.
fn derive_aes_key(
    pin: &[u8],
    salt: &[u8; SALT_LEN],
    params: &EncryptParams,
) -> Result<[u8; 32], CryptoError> {
    let argon2_params =
        Params::new(params.m_cost, params.t_cost, params.p_cost, Some(32))
            .map_err(|_| CryptoError::KeyDerivation)?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(pin, salt.as_slice(), &mut key)
        .map_err(|_| CryptoError::KeyDerivation)?;
    Ok(key)
}

// Build the 29-byte AAD block that covers version + params + salt.
// Matches the [0..29] prefix of the wire format exactly.
fn build_aad(params: &EncryptParams, salt: &[u8; SALT_LEN]) -> [u8; HEADER_LEN] {
    let mut aad = [0u8; HEADER_LEN];
    aad[0] = BLOB_VERSION;
    aad[1..5].copy_from_slice(&params.m_cost.to_be_bytes());
    aad[5..9].copy_from_slice(&params.t_cost.to_be_bytes());
    aad[9..13].copy_from_slice(&params.p_cost.to_be_bytes());
    aad[13..29].copy_from_slice(salt);
    aad
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Always use FAST_TEST params in tests — same code path, milliseconds not seconds.
    fn p() -> &'static EncryptParams {
        &EncryptParams::FAST_TEST
    }

    #[test]
    fn round_trip() {
        let key = b"my 32-byte private key material!";
        let blob = encrypt_key_with_pin(key, b"correct-pin-123", p()).unwrap();
        let recovered = decrypt_key_with_pin(&blob, b"correct-pin-123").unwrap();
        assert_eq!(recovered, key);
    }

    #[test]
    fn wrong_pin_fails() {
        let blob = encrypt_key_with_pin(b"secret", b"right", p()).unwrap();
        assert!(matches!(
            decrypt_key_with_pin(&blob, b"wrong"),
            Err(CryptoError::DecryptionFailed)
        ));
    }

    #[test]
    fn serialize_deserialize_round_trip() {
        let key = b"arbitrary secret bytes";
        let blob = encrypt_key_with_pin(key, b"mypin", p()).unwrap();
        let bytes = serialize_blob(&blob);
        let blob2 = deserialize_blob(&bytes).unwrap();

        assert_eq!(blob2.params.m_cost, blob.params.m_cost);
        assert_eq!(blob2.params.t_cost, blob.params.t_cost);
        assert_eq!(blob2.params.p_cost, blob.params.p_cost);
        assert_eq!(blob2.salt, blob.salt);
        assert_eq!(blob2.nonce, blob.nonce);
        assert_eq!(blob2.ciphertext, blob.ciphertext);

        let recovered = decrypt_key_with_pin(&blob2, b"mypin").unwrap();
        assert_eq!(recovered, key);
    }

    #[test]
    fn tampered_ciphertext_rejected() {
        let blob = encrypt_key_with_pin(b"key", b"pin", p()).unwrap();
        let mut bytes = serialize_blob(&blob);
        *bytes.last_mut().unwrap() ^= 0xff;
        let blob2 = deserialize_blob(&bytes).unwrap();
        assert!(decrypt_key_with_pin(&blob2, b"pin").is_err());
    }

    #[test]
    fn tampered_m_cost_rejected() {
        // Lowering m_cost in the serialized blob must break authentication.
        let blob = encrypt_key_with_pin(b"key", b"pin", p()).unwrap();
        let mut bytes = serialize_blob(&blob);
        // m_cost is at bytes [1..5]; flip a bit to change it
        bytes[4] ^= 0x01;
        let blob2 = deserialize_blob(&bytes).unwrap();
        // Wrong params → wrong AAD → GCM tag fails
        assert!(decrypt_key_with_pin(&blob2, b"pin").is_err());
    }

    #[test]
    fn tampered_salt_rejected() {
        let blob = encrypt_key_with_pin(b"key", b"pin", p()).unwrap();
        let mut bytes = serialize_blob(&blob);
        // salt starts at byte 13
        bytes[13] ^= 0xff;
        let blob2 = deserialize_blob(&bytes).unwrap();
        assert!(decrypt_key_with_pin(&blob2, b"pin").is_err());
    }

    #[test]
    fn needs_upgrade_detects_weak_params() {
        let weak = EncryptParams { m_cost: 8, t_cost: 1, p_cost: 1 };
        let blob = encrypt_key_with_pin(b"key", b"pin", &weak).unwrap();
        assert!(blob.needs_upgrade(&EncryptParams::WASM));
        assert!(blob.needs_upgrade(&EncryptParams::STANDARD));
    }

    #[test]
    fn needs_upgrade_false_for_equal_or_stronger() {
        let blob = encrypt_key_with_pin(b"key", b"pin", &EncryptParams::STANDARD).unwrap();
        assert!(!blob.needs_upgrade(&EncryptParams::STANDARD));
        assert!(!blob.needs_upgrade(&EncryptParams::WASM));
    }

    #[test]
    fn different_pins_produce_different_blobs() {
        let a = encrypt_key_with_pin(b"key", b"pin1", p()).unwrap();
        let b = encrypt_key_with_pin(b"key", b"pin2", p()).unwrap();
        // Ciphertexts must differ (different derived keys + different nonces)
        assert_ne!(a.ciphertext, b.ciphertext);
    }

    #[test]
    fn empty_key_round_trip() {
        let blob = encrypt_key_with_pin(b"", b"pin", p()).unwrap();
        let recovered = decrypt_key_with_pin(&blob, b"pin").unwrap();
        assert!(recovered.is_empty());
    }

    #[test]
    fn deserialize_rejects_unknown_version() {
        let blob = encrypt_key_with_pin(b"key", b"pin", p()).unwrap();
        let mut bytes = serialize_blob(&blob);
        bytes[0] = 0xFF; // unknown version
        assert!(matches!(deserialize_blob(&bytes), Err(CryptoError::InvalidKey)));
    }

    #[test]
    fn deserialize_rejects_truncated_blob() {
        let bytes = vec![0u8; 10]; // shorter than MIN_LEN
        assert!(deserialize_blob(&bytes).is_err());
    }
}
