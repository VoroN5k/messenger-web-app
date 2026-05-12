# Vesper — Crypto Library

A pure Rust cryptographic library implementing the full Signal Protocol stack, compiled to WebAssembly for use in the browser. Designed for auditability, correctness, and safe key handling.

---

## Crate Structure

```
crypto/
├── core/          # Platform-agnostic protocol implementation
│   └── src/
│       ├── lib.rs
│       ├── identity.rs       # X25519 + Ed25519 key pairs
│       ├── x3dh.rs           # Extended Triple Diffie-Hellman
│       ├── double_ratchet.rs # Signal Double Ratchet
│       ├── group/
│       │   ├── mod.rs        # Group encrypt/decrypt
│       │   ├── sender_key.rs # Sender chain state
│       │   └── distribution.rs  # Key distribution messages
│       ├── pin_key.rs        # Argon2id PIN-protected key vault
│       ├── device_sync.rs    # VSP-1 device history transfer
│       ├── error.rs          # CryptoError enum
│       └── utils.rs          # AES-GCM, HKDF, HMAC, ByteParser
│
├── wasm/          # wasm-bindgen bindings (browser target)
│   └── src/lib.rs
│
├── napi/          # Node.js native addon (placeholder)
└── mobile/        # Mobile target (placeholder)
```

---

## Modules

### `identity`

X25519 key agreement and Ed25519 signing, wrapping `x25519-dalek` and `ed25519-dalek`. All private key types implement `ZeroizeOnDrop` — secret material is scrubbed from memory when the struct is dropped.

```rust
let alice = KeyAgreementKeyPair::generate();
let bob   = KeyAgreementKeyPair::generate();
let shared = alice.diffie_hellman(&bob.public_key());

let ik = IdentityKeyPair::generate();
let sig = ik.sign(b"message");
ik.public_key().verify(b"message", &sig)?;
```

### `x3dh`

Extended Triple Diffie-Hellman key exchange. `x3dh_send` returns a 32-byte shared secret plus a 65-byte init message (`ik_dh_pub || ek_pub || opk_used`). `x3dh_receive` mirrors the DH computation to reproduce the same secret. The SPK signature is verified before any DH computation.

### `double_ratchet`

Full Signal Double Ratchet with:

- DH ratchet step on every incoming message with a new remote key
- Symmetric ratchet: HMAC-SHA256 chain key advance per message (`KDF_CK`)
- Out-of-order delivery: skipped message keys cached in `BTreeMap`, bounded by `MAX_SKIP=1000`
- Forward secrecy: old message keys zeroized immediately after use
- Binary serialisation (`to_bytes` / `from_bytes`) for IndexedDB persistence

### `group` — Signal Sender Key

Each sender maintains a `SenderState` with a ratcheting chain key and an Ed25519 signing key. Recipients hold a `ReceiverState` initialised from a `SenderKeyDistributionMessage`.

Every broadcast message carries an Ed25519 signature over `key_id || iteration || ciphertext`. The signature is verified **before** decryption to prevent ciphertext oracle attacks. Out-of-order delivery is supported up to `MAX_SKIP=2000`.

### `pin_key`

Argon2id-based PIN vault for encrypting identity key material at rest.

```
Blob wire format:
  version(1) | m_cost(4 BE) | t_cost(4 BE) | p_cost(4 BE) | salt(16) | nonce(12) | AES-GCM-CT

AAD = bytes [0..29]  (version + KDF params + salt)
```

The AAD covers the KDF parameters — any modification to `m_cost`, `t_cost`, or `p_cost` in the stored blob causes AEAD failure, preventing parameter-downgrade attacks.

**Parameter presets:**
- `STANDARD`: 64 MB, 3 passes — for native / Electron
- `WASM`: 32 MB, 2 passes — for browser WASM context

### `device_sync` — VSP-1

Secure device-to-device history transfer. Key derivation: `X25519(ek_self, EK_peer)` → `HKDF(salt=OTP, ikm=dh, info=…)` → `chunk_key(32) || mac_key(32)`.

Chunks: `nonce(12) || AES-256-GCM(lz4_frame(plaintext), aad=seq_be(4))`

Manifest: `version(1) || count(4 BE) || [id(8) || sha256(32)]×N || HMAC-SHA256(32)` — verified with constant-time comparison.

---

## Building

### WebAssembly (browser)

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

cd wasm
wasm-pack build --target web --out-dir ../../client/src/wasm
```

### Running tests

```bash
cd core
cargo test                    # all tests
cargo test double_ratchet     # DR module only
cargo test group              # Sender Key module only
cargo test pin_key            # Argon2id vault
cargo test device_sync        # VSP-1 protocol
cargo test -- --nocapture     # show stdout
```

---

## Dependencies

| Crate | Purpose |
|---|---|
| `x25519-dalek` | X25519 Diffie-Hellman |
| `ed25519-dalek` | Ed25519 signatures |
| `aes-gcm` | AES-256-GCM authenticated encryption |
| `hkdf` | HKDF-SHA256 key derivation |
| `sha2` | SHA-256 |
| `hmac` | HMAC-SHA256 |
| `argon2` | Argon2id password hashing |
| `lz4_flex` | LZ4 frame compression (device sync) |
| `zeroize` | Guaranteed memory scrubbing for secret types |
| `rand_core` | CSPRNG (`crypto.getRandomValues` in WASM) |
| `serde` | Serialisation for distribution messages |

---

## Security Notes

- All secret types are `ZeroizeOnDrop` or explicitly zeroized after use.
- There are no `unsafe` blocks in `crypto/core`.
- Random number generation uses `OsRng` — backed by `crypto.getRandomValues` in WASM.
- Constant-time comparisons are used for HMAC verification (`verify_manifest`) and Argon2id output comparison via the `subtle` crate.
- The `wasm` crate uses `wasm-bindgen` FFI — unavoidable for WASM interop, but this is a well-audited boundary.