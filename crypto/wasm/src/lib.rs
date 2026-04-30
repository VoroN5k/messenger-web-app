use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

use messenger_crypto_core::{
    device_sync::{self, ManifestEntry, SyncKeypair, SyncKeys},
    double_ratchet::{self, MessageHeader, RatchetState},
    group::{
        self,
        distribution::{self, SenderKeyDistributionMessage},
        sender_key::{ReceiverState, SenderState},
        SenderKeyMessage,
    },
    identity::{IdentityKeyPair, IdentityPublicKey, KeyAgreementKeyPair, KeyAgreementPublicKey},
    pin_key::{self, EncryptParams},
    x3dh::{self, X3dhBundle, X3dhInitMessage},
};

// Helpers

fn js_err(e: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&e.to_string())
}

fn to32(b: &[u8]) -> Result<[u8; 32], JsValue> {
    b.try_into().map_err(|_| JsValue::from_str("expected 32 bytes"))
}

fn to64(b: &[u8]) -> Result<[u8; 64], JsValue> {
    b.try_into().map_err(|_| JsValue::from_str("expected 64 bytes"))
}

fn u32_be(b: &[u8]) -> u32 {
    u32::from_be_bytes(b.try_into().unwrap())
}

// Key generation

// returns secret(32) || public(32)
#[wasm_bindgen(js_name = generateKeyAgreementKeypair)]
pub fn generate_key_agreement_keypair() -> Uint8Array {
    console_error_panic_hook::set_once();
    let kp = KeyAgreementKeyPair::generate();
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&kp.to_bytes());
    out[32..].copy_from_slice(&kp.public_key().0);
    Uint8Array::from(out.as_ref())
}

#[wasm_bindgen(js_name = keyAgreementPublicFromSecret)]
pub fn key_agreement_public_from_secret(secret: &[u8]) -> Result<Uint8Array, JsValue> {
    let kp = KeyAgreementKeyPair::from_bytes(to32(secret)?);
    Ok(Uint8Array::from(kp.public_key().0.as_ref()))
}

// returns seed(32) || public(32)
#[wasm_bindgen(js_name = generateSigningKeypair)]
pub fn generate_signing_keypair() -> Uint8Array {
    console_error_panic_hook::set_once();
    let kp = IdentityKeyPair::generate();
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&kp.to_bytes());
    out[32..].copy_from_slice(&kp.public_key().0);
    Uint8Array::from(out.as_ref())
}

#[wasm_bindgen(js_name = signingPublicFromSeed)]
pub fn signing_public_from_seed(seed: &[u8]) -> Result<Uint8Array, JsValue> {
    let kp = IdentityKeyPair::from_bytes(&to32(seed)?);
    Ok(Uint8Array::from(kp.public_key().0.as_ref()))
}

// returns 64-byte Ed25519 signature
#[wasm_bindgen]
pub fn sign(seed: &[u8], message: &[u8]) -> Result<Uint8Array, JsValue> {
    let kp = IdentityKeyPair::from_bytes(&to32(seed)?);
    Ok(Uint8Array::from(kp.sign(message).as_ref()))
}

// returns true if valid, false if invalid signature (only throws on bad key bytes)
#[wasm_bindgen(js_name = verifySignature)]
pub fn verify_signature(pub_key: &[u8], message: &[u8], sig: &[u8]) -> Result<bool, JsValue> {
    let pk = IdentityPublicKey(to32(pub_key)?);
    let sig_arr = to64(sig)?;
    Ok(pk.verify(message, &sig_arr).is_ok())
}

// PIN key encryption (Argon2id)

// returns serialised EncryptedKeyBlob bytes
#[wasm_bindgen(js_name = encryptKeyWithPin)]
pub fn encrypt_key_with_pin(key_bytes: &[u8], pin: &[u8]) -> Result<Uint8Array, JsValue> {
    let blob = pin_key::encrypt_key_with_pin(key_bytes, pin, &EncryptParams::WASM)
        .map_err(js_err)?;
    Ok(Uint8Array::from(pin_key::serialize_blob(&blob).as_slice()))
}

// returns original key bytes
#[wasm_bindgen(js_name = decryptKeyWithPin)]
pub fn decrypt_key_with_pin(blob_bytes: &[u8], pin: &[u8]) -> Result<Uint8Array, JsValue> {
    let blob = pin_key::deserialize_blob(blob_bytes).map_err(js_err)?;
    let key = pin_key::decrypt_key_with_pin(&blob, pin).map_err(js_err)?;
    Ok(Uint8Array::from(key.as_slice()))
}

// X3DH

// bundle wire: ik_sign_pub(32) || ik_dh_pub(32) || spk_pub(32) || spk_sig(64) ||
//              opk_present(1) || [opk_pub(32)]
fn parse_bundle(bytes: &[u8]) -> Result<X3dhBundle, JsValue> {
    if bytes.len() < 161 {
        return Err(JsValue::from_str("bundle too short"));
    }
    let ik_sign = IdentityPublicKey(to32(&bytes[..32])?);
    let ik_dh = KeyAgreementPublicKey(to32(&bytes[32..64])?);
    let spk = KeyAgreementPublicKey(to32(&bytes[64..96])?);
    let spk_sig: [u8; 64] = bytes[96..160].try_into().unwrap();
    let opk = if bytes[160] != 0 {
        if bytes.len() < 193 {
            return Err(JsValue::from_str("bundle: opk_present=1 but no opk bytes"));
        }
        Some(KeyAgreementPublicKey(to32(&bytes[161..193])?))
    } else {
        None
    };
    Ok(X3dhBundle { ik_sign, ik_dh, spk, spk_sig, opk })
}

// returns sk(32) || ik_dh_pub(32) || ek_pub(32) || opk_used(1) = 97 bytes
#[wasm_bindgen(js_name = x3dhSend)]
pub fn x3dh_send(our_ik_dh_secret: &[u8], bundle_bytes: &[u8]) -> Result<Uint8Array, JsValue> {
    console_error_panic_hook::set_once();
    let our_ik_dh = KeyAgreementKeyPair::from_bytes(to32(our_ik_dh_secret)?);
    let bundle = parse_bundle(bundle_bytes)?;
    let out = x3dh::x3dh_send(&our_ik_dh, &bundle).map_err(js_err)?;
    let mut result = Vec::with_capacity(97);
    result.extend_from_slice(&out.sk);
    result.extend_from_slice(&out.init.ik_dh.0);
    result.extend_from_slice(&out.init.ek.0);
    result.push(out.init.opk_used as u8);
    Ok(Uint8Array::from(result.as_slice()))
}

// init_msg_bytes: ik_dh_pub(32) || ek_pub(32) || opk_used(1) = 65 bytes
// our_opk_secret: 32 bytes if opk was used, empty slice otherwise
// returns sk(32)
#[wasm_bindgen(js_name = x3dhReceive)]
pub fn x3dh_receive(
    our_ik_dh_secret: &[u8],
    our_spk_secret: &[u8],
    our_opk_secret: &[u8],
    init_msg_bytes: &[u8],
) -> Result<Uint8Array, JsValue> {
    console_error_panic_hook::set_once();
    if init_msg_bytes.len() < 65 {
        return Err(JsValue::from_str("init message too short"));
    }
    let our_ik_dh = KeyAgreementKeyPair::from_bytes(to32(our_ik_dh_secret)?);
    let our_spk = KeyAgreementKeyPair::from_bytes(to32(our_spk_secret)?);
    let our_opk = if our_opk_secret.is_empty() {
        None
    } else {
        Some(KeyAgreementKeyPair::from_bytes(to32(our_opk_secret)?))
    };
    let init = X3dhInitMessage {
        ik_dh: KeyAgreementPublicKey(to32(&init_msg_bytes[..32])?),
        ek: KeyAgreementPublicKey(to32(&init_msg_bytes[32..64])?),
        opk_used: init_msg_bytes[64] != 0,
    };
    let sk = x3dh::x3dh_receive(&our_ik_dh, &our_spk, our_opk.as_ref(), &init)
        .map_err(js_err)?;
    Ok(Uint8Array::from(sk.as_ref()))
}

// Double Ratchet session

#[wasm_bindgen]
pub struct RatchetSession {
    state: RatchetState,
}

#[wasm_bindgen]
impl RatchetSession {
    // Alice's side — call after x3dh_send
    // bob_dh_pub: Bob's SPK public key (32 bytes)
    #[wasm_bindgen(js_name = initSender)]
    pub fn init_sender(sk: &[u8], bob_dh_pub: &[u8]) -> Result<RatchetSession, JsValue> {
        console_error_panic_hook::set_once();
        let state = double_ratchet::init_sender(
            to32(sk)?,
            KeyAgreementPublicKey(to32(bob_dh_pub)?),
        )
        .map_err(js_err)?;
        Ok(RatchetSession { state })
    }

    // Bob's side — call after x3dh_receive
    // our_dh_secret: Bob's SPK secret key (32 bytes)
    #[wasm_bindgen(js_name = initReceiver)]
    pub fn init_receiver(sk: &[u8], our_dh_secret: &[u8]) -> Result<RatchetSession, JsValue> {
        console_error_panic_hook::set_once();
        let kp = KeyAgreementKeyPair::from_bytes(to32(our_dh_secret)?);
        let state = double_ratchet::init_receiver(to32(sk)?, kp);
        Ok(RatchetSession { state })
    }

    #[wasm_bindgen(js_name = fromBytes)]
    pub fn from_bytes(data: &[u8]) -> Result<RatchetSession, JsValue> {
        let state = RatchetState::from_bytes(data).map_err(js_err)?;
        Ok(RatchetSession { state })
    }

    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Uint8Array {
        Uint8Array::from(self.state.to_bytes().as_slice())
    }

    // returns dh_pub(32) || pn(4 BE) || n(4 BE) || ciphertext
    pub fn encrypt(&mut self, plaintext: &[u8], aad: &[u8]) -> Result<Uint8Array, JsValue> {
        let (hdr, ct) =
            double_ratchet::encrypt(&mut self.state, plaintext, aad).map_err(js_err)?;
        let mut out = Vec::with_capacity(40 + ct.len());
        out.extend_from_slice(&hdr.dh.0);
        out.extend_from_slice(&hdr.pn.to_be_bytes());
        out.extend_from_slice(&hdr.n.to_be_bytes());
        out.extend_from_slice(&ct);
        Ok(Uint8Array::from(out.as_slice()))
    }

    // input: dh_pub(32) || pn(4 BE) || n(4 BE) || ciphertext
    pub fn decrypt(&mut self, data: &[u8], aad: &[u8]) -> Result<Uint8Array, JsValue> {
        if data.len() < 40 {
            return Err(JsValue::from_str("message too short"));
        }
        let hdr = MessageHeader {
            dh: KeyAgreementPublicKey(to32(&data[..32])?),
            pn: u32_be(&data[32..36]),
            n: u32_be(&data[36..40]),
        };
        let pt = double_ratchet::decrypt(&mut self.state, &hdr, &data[40..], aad)
            .map_err(js_err)?;
        Ok(Uint8Array::from(pt.as_slice()))
    }
}

// Group sender session

#[wasm_bindgen]
pub struct GroupSenderSession {
    state: SenderState,
}

#[wasm_bindgen]
impl GroupSenderSession {
    pub fn generate() -> GroupSenderSession {
        console_error_panic_hook::set_once();
        GroupSenderSession { state: SenderState::generate() }
    }

    #[wasm_bindgen(js_name = fromBytes)]
    pub fn from_bytes(data: &[u8]) -> Result<GroupSenderSession, JsValue> {
        let state = SenderState::from_bytes(data).map_err(js_err)?;
        Ok(GroupSenderSession { state })
    }

    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Uint8Array {
        Uint8Array::from(self.state.to_bytes().as_slice())
    }

    // returns key_id(4 BE) || iteration(4 BE) || chain_key(32) || signing_pub(32) = 72 bytes
    #[wasm_bindgen(js_name = createDistributionMessage)]
    pub fn create_distribution_message(&self) -> Uint8Array {
        let d = distribution::create_distribution_message(&self.state);
        let mut out = [0u8; 72];
        out[..4].copy_from_slice(&d.key_id.to_be_bytes());
        out[4..8].copy_from_slice(&d.iteration.to_be_bytes());
        out[8..40].copy_from_slice(&d.chain_key);
        out[40..72].copy_from_slice(&d.signing_pub.0);
        Uint8Array::from(out.as_ref())
    }

    // returns key_id(4 BE) || iteration(4 BE) || sig(64) || ciphertext
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Uint8Array, JsValue> {
        let msg = group::encrypt(&mut self.state, plaintext).map_err(js_err)?;
        let mut out = Vec::with_capacity(72 + msg.ciphertext.len());
        out.extend_from_slice(&msg.key_id.to_be_bytes());
        out.extend_from_slice(&msg.iteration.to_be_bytes());
        out.extend_from_slice(&msg.signature);
        out.extend_from_slice(&msg.ciphertext);
        Ok(Uint8Array::from(out.as_slice()))
    }
}

// Group receiver session

#[wasm_bindgen]
pub struct GroupReceiverSession {
    state: ReceiverState,
}

#[wasm_bindgen]
impl GroupReceiverSession {
    // dist_msg: key_id(4 BE) || iteration(4 BE) || chain_key(32) || signing_pub(32) = 72 bytes
    #[wasm_bindgen(js_name = fromDistributionMessage)]
    pub fn from_distribution_message(dist_msg: &[u8]) -> Result<GroupReceiverSession, JsValue> {
        console_error_panic_hook::set_once();
        if dist_msg.len() < 72 {
            return Err(JsValue::from_str("distribution message too short"));
        }
        let d = SenderKeyDistributionMessage {
            key_id: u32_be(&dist_msg[..4]),
            iteration: u32_be(&dist_msg[4..8]),
            chain_key: dist_msg[8..40].try_into().unwrap(),
            signing_pub: IdentityPublicKey(dist_msg[40..72].try_into().unwrap()),
        };
        Ok(GroupReceiverSession { state: distribution::process_distribution_message(&d) })
    }

    #[wasm_bindgen(js_name = fromBytes)]
    pub fn from_bytes(data: &[u8]) -> Result<GroupReceiverSession, JsValue> {
        let state = ReceiverState::from_bytes(data).map_err(js_err)?;
        Ok(GroupReceiverSession { state })
    }

    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Uint8Array {
        Uint8Array::from(self.state.to_bytes().as_slice())
    }

    // input: key_id(4 BE) || iteration(4 BE) || sig(64) || ciphertext
    pub fn decrypt(&mut self, data: &[u8]) -> Result<Uint8Array, JsValue> {
        if data.len() < 72 {
            return Err(JsValue::from_str("group message too short"));
        }
        let msg = SenderKeyMessage {
            key_id: u32_be(&data[..4]),
            iteration: u32_be(&data[4..8]),
            signature: data[8..72].try_into().unwrap(),
            ciphertext: data[72..].to_vec(),
        };
        let pt = group::decrypt(&mut self.state, &msg).map_err(js_err)?;
        Ok(Uint8Array::from(pt.as_slice()))
    }
}

// ── Device Sync (VSP-1) ───────────────────────────────────────────────────────

/// Generate a 128-bit OTP for the QR code.
/// Returns 16 bytes. Never send through the signaling server.
#[wasm_bindgen(js_name = syncGenerateOtp)]
pub fn sync_generate_otp() -> Uint8Array {
    console_error_panic_hook::set_once();
    Uint8Array::from(device_sync::generate_otp().as_ref())
}

/// Generate a 128-bit random session ID for WebSocket room routing.
/// Returns 16 bytes. Safe to include in QR code alongside OTP.
#[wasm_bindgen(js_name = syncGenerateSessionId)]
pub fn sync_generate_session_id() -> Uint8Array {
    console_error_panic_hook::set_once();
    Uint8Array::from(device_sync::generate_session_id().as_ref())
}

/// Generate an ephemeral X25519 keypair for VSP-1.
/// Returns `secret(32) || public(32)` = 64 bytes.
/// `public(32)` is sent to the peer via signaling; `secret(32)` stays local.
#[wasm_bindgen(js_name = syncGenerateKeypair)]
pub fn sync_generate_keypair() -> Uint8Array {
    console_error_panic_hook::set_once();
    let kp = SyncKeypair::generate();
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&kp.secret_bytes());
    out[32..].copy_from_slice(&kp.public_key_bytes());
    Uint8Array::from(out.as_ref())
}

/// VSP-1 key derivation.
///
/// - `secret`: 32-byte ephemeral X25519 secret from `syncGenerateKeypair`
/// - `peer_pub`: 32-byte ephemeral X25519 public key received from the peer
/// - `otp`: 16-byte OTP from the QR code
///
/// Returns `chunk_key(32) || mac_key(32)` = 64 bytes.
/// Both sides must call this — they get identical keys if OTP is correct.
#[wasm_bindgen(js_name = syncDeriveKeys)]
pub fn sync_derive_keys(
    secret: &[u8],
    peer_pub: &[u8],
    otp: &[u8],
) -> Result<Uint8Array, JsValue> {
    console_error_panic_hook::set_once();
    let secret_arr = to32(secret)?;
    let peer_arr = to32(peer_pub)?;
    let otp_arr: [u8; 16] = otp.try_into().map_err(|_| JsValue::from_str("otp must be 16 bytes"))?;

    let kp = SyncKeypair::from_secret(secret_arr);
    let keys = kp.derive_sync_keys(&peer_arr, &otp_arr).map_err(js_err)?;
    Ok(Uint8Array::from(keys.to_bytes().as_ref()))
}

/// Seal one DataChannel chunk.
///
/// - `chunk_key`: 32 bytes (first half of syncDeriveKeys output)
/// - `mac_key`: 32 bytes (second half of syncDeriveKeys output, unused here — kept for API symmetry)
/// - `seq`: monotonically increasing sequence number (prevents reordering)
/// - `plaintext`: raw IDB record bytes
///
/// Returns `nonce(12) || AES-256-GCM(lz4_frame(plaintext), aad=seq_be(4))`.
#[wasm_bindgen(js_name = syncSealChunk)]
pub fn sync_seal_chunk(
    keys_bytes: &[u8],
    seq: u32,
    plaintext: &[u8],
) -> Result<Uint8Array, JsValue> {
    let keys_arr: [u8; 64] = keys_bytes
        .try_into()
        .map_err(|_| JsValue::from_str("keys must be 64 bytes"))?;
    let keys = SyncKeys::from_bytes(&keys_arr);
    let sealed = device_sync::seal_chunk(&keys, seq, plaintext).map_err(js_err)?;
    Ok(Uint8Array::from(sealed.as_slice()))
}

/// Open one DataChannel chunk sealed by `syncSealChunk`.
///
/// Returns the original plaintext. Throws if the MAC is invalid, the sequence
/// number is wrong, or the lz4 stream is corrupt.
#[wasm_bindgen(js_name = syncOpenChunk)]
pub fn sync_open_chunk(
    keys_bytes: &[u8],
    seq: u32,
    data: &[u8],
) -> Result<Uint8Array, JsValue> {
    let keys_arr: [u8; 64] = keys_bytes
        .try_into()
        .map_err(|_| JsValue::from_str("keys must be 64 bytes"))?;
    let keys = SyncKeys::from_bytes(&keys_arr);
    let plain = device_sync::open_chunk(&keys, seq, data).map_err(js_err)?;
    Ok(Uint8Array::from(plain.as_slice()))
}

/// Compute SHA-256 of an IDB record value for manifest inclusion.
/// Returns 32 bytes.
#[wasm_bindgen(js_name = syncHashEntry)]
pub fn sync_hash_entry(data: &[u8]) -> Uint8Array {
    Uint8Array::from(device_sync::hash_entry(data).as_ref())
}

/// Build an HMAC-SHA256-authenticated transfer manifest.
///
/// - `mac_key`: 32 bytes (second half of syncDeriveKeys output)
/// - `ids`: packed u64 big-endian array, `n × 8` bytes — one per IDB record
/// - `hashes`: packed SHA-256 array, `n × 32` bytes — from `syncHashEntry`
///
/// Returns the manifest bytes to send over DataChannel after all chunks.
#[wasm_bindgen(js_name = syncBuildManifest)]
pub fn sync_build_manifest(
    mac_key: &[u8],
    ids: &[u8],
    hashes: &[u8],
) -> Result<Uint8Array, JsValue> {
    let mac_arr = to32(mac_key)?;

    if ids.len() % 8 != 0 {
        return Err(JsValue::from_str("ids must be n×8 bytes"));
    }
    if hashes.len() % 32 != 0 {
        return Err(JsValue::from_str("hashes must be n×32 bytes"));
    }
    let n = ids.len() / 8;
    if hashes.len() / 32 != n {
        return Err(JsValue::from_str("ids and hashes counts must match"));
    }

    let entries: Vec<ManifestEntry> = (0..n)
        .map(|i| {
            let id = u64::from_be_bytes(ids[i * 8..i * 8 + 8].try_into().unwrap());
            let hash: [u8; 32] = hashes[i * 32..i * 32 + 32].try_into().unwrap();
            ManifestEntry { id, hash }
        })
        .collect();

    let manifest = device_sync::build_manifest(&mac_arr, &entries);
    Ok(Uint8Array::from(manifest.as_slice()))
}

/// Verify the manifest HMAC and parse entries.
///
/// - `mac_key`: 32 bytes
/// - `manifest`: bytes received from the source device
///
/// Returns `[id(8 BE) || sha256(32)] × count` = packed entries, or throws on
/// MAC failure / format error.
#[wasm_bindgen(js_name = syncVerifyManifest)]
pub fn sync_verify_manifest(
    mac_key: &[u8],
    manifest: &[u8],
) -> Result<Uint8Array, JsValue> {
    let mac_arr = to32(mac_key)?;
    let entries = device_sync::verify_manifest(&mac_arr, manifest).map_err(js_err)?;

    let mut out = Vec::with_capacity(entries.len() * 40);
    for e in &entries {
        out.extend_from_slice(&e.id.to_be_bytes());
        out.extend_from_slice(&e.hash);
    }
    Ok(Uint8Array::from(out.as_slice()))
}
