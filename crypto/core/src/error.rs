use thiserror::Error;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("invalid key material")]
    InvalidKey,

    #[error("signature verification failed")]
    SignatureVerification,

    #[error("AEAD decryption failed")]
    DecryptionFailed,

    #[error("key derivation failed")]
    KeyDerivation,

    #[error("invalid ciphertext length")]
    InvalidCiphertext,

    #[error("KEM encapsulation failed")]
    KemEncapsulation,

    #[error("KEM decapsulation failed")]
    KemDecapsulation,

    #[error("too many skipped messages: possible DoS")]
    SkipLimitExceeded,

    #[error("lz4 decompression failed")]
    DecompressionFailed,

    #[error("manifest MAC verification failed")]
    ManifestTampered,
}
