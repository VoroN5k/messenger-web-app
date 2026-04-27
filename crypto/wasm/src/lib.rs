use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

use messenger_crypto_core::{
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
