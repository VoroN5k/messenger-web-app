use serde::{Deserialize, Serialize};

use crate::{
    error::CryptoError,
    identity::{IdentityPublicKey, KeyAgreementKeyPair, KeyAgreementPublicKey},
    utils::hkdf,
};

// serde helper for [u8; 64] since serde only auto-derives up to [T; 32]
mod serde_sig64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(v: &[u8; 64], s: S) -> Result<S::Ok, S::Error> {
        v.as_slice().serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 64], D::Error> {
        let bytes = Vec::<u8>::deserialize(d)?;
        bytes.try_into().map_err(|_| serde::de::Error::custom("expected 64 bytes"))
    }
}

// prepended to DH outputs before KDF, per Signal X3DH spec
const F: [u8; 32] = [0xFF; 32];
const SALT: [u8; 32] = [0x00; 32];
const INFO: &[u8] = b"X3DH";

// Bob's key bundle fetched from the server before starting a session.
// ik_sign is Ed25519 (verifies spk_sig); ik_dh and spk are X25519 (used in DH).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct X3dhBundle {
    pub ik_sign: IdentityPublicKey,
    pub ik_dh: KeyAgreementPublicKey,
    pub spk: KeyAgreementPublicKey,
    #[serde(with = "serde_sig64")]
    pub spk_sig: [u8; 64],
    pub opk: Option<KeyAgreementPublicKey>,
}

// Sent by Alice to Bob alongside the first encrypted message.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct X3dhInitMessage {
    pub ik_dh: KeyAgreementPublicKey,
    pub ek: KeyAgreementPublicKey,
    pub opk_used: bool,
}

pub struct X3dhSenderOutput {
    pub sk: [u8; 32],
    pub init: X3dhInitMessage,
}

// Alice's side: verify SPK, run 3 or 4 DH rounds, derive shared key.
pub fn x3dh_send(
    our_ik_dh: &KeyAgreementKeyPair,
    bundle: &X3dhBundle,
) -> Result<X3dhSenderOutput, CryptoError> {
    bundle.ik_sign.verify(&bundle.spk.0, &bundle.spk_sig)?;

    let ek = KeyAgreementKeyPair::generate();

    let dh1 = our_ik_dh.diffie_hellman(&bundle.spk); // IK_A x SPK_B
    let dh2 = ek.diffie_hellman(&bundle.ik_dh); // EK_A x IK_B
    let dh3 = ek.diffie_hellman(&bundle.spk); // EK_A x SPK_B

    let sk = match &bundle.opk {
        Some(opk) => {
            let dh4 = ek.diffie_hellman(opk); // EK_A x OPK_B
            derive_sk(&[dh1.as_bytes(), dh2.as_bytes(), dh3.as_bytes(), dh4.as_bytes()])
        }
        None => derive_sk(&[dh1.as_bytes(), dh2.as_bytes(), dh3.as_bytes()]),
    }?;

    Ok(X3dhSenderOutput {
        sk,
        init: X3dhInitMessage {
            ik_dh: our_ik_dh.public_key(),
            ek: ek.public_key(),
            opk_used: bundle.opk.is_some(),
        },
    })
}

// Bob's side: mirror the same DH rounds and derive the same shared key.
// our_opk must be Some iff init.opk_used is true.
pub fn x3dh_receive(
    our_ik_dh: &KeyAgreementKeyPair,
    our_spk: &KeyAgreementKeyPair,
    our_opk: Option<&KeyAgreementKeyPair>,
    init: &X3dhInitMessage,
) -> Result<[u8; 32], CryptoError> {
    if init.opk_used != our_opk.is_some() {
        return Err(CryptoError::InvalidKey);
    }

    let dh1 = our_spk.diffie_hellman(&init.ik_dh); // SPK_B x IK_A
    let dh2 = our_ik_dh.diffie_hellman(&init.ek); // IK_B x EK_A
    let dh3 = our_spk.diffie_hellman(&init.ek); // SPK_B x EK_A

    match our_opk {
        Some(opk) => {
            let dh4 = opk.diffie_hellman(&init.ek); // OPK_B x EK_A
            derive_sk(&[dh1.as_bytes(), dh2.as_bytes(), dh3.as_bytes(), dh4.as_bytes()])
        }
        None => derive_sk(&[dh1.as_bytes(), dh2.as_bytes(), dh3.as_bytes()]),
    }
}

// HKDF(F || dh1 || ... || dhN, salt=0x00*32, info="X3DH")
fn derive_sk(dh_outputs: &[&[u8; 32]]) -> Result<[u8; 32], CryptoError> {
    let mut ikm = F.to_vec();
    for dh in dh_outputs {
        ikm.extend_from_slice(*dh);
    }
    hkdf::<32>(Some(&SALT), &ikm, INFO)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::IdentityKeyPair;

    fn make_bundle(with_opk: bool) -> (X3dhBundle, KeyAgreementKeyPair, KeyAgreementKeyPair, Option<KeyAgreementKeyPair>) {
        let ik_sign = IdentityKeyPair::generate();
        let ik_dh = KeyAgreementKeyPair::generate();
        let spk = KeyAgreementKeyPair::generate();
        let spk_sig = ik_sign.sign(&spk.public_key().0);
        let opk = if with_opk { Some(KeyAgreementKeyPair::generate()) } else { None };

        let bundle = X3dhBundle {
            ik_sign: ik_sign.public_key(),
            ik_dh: ik_dh.public_key(),
            spk: spk.public_key(),
            spk_sig,
            opk: opk.as_ref().map(|k| k.public_key()),
        };

        (bundle, ik_dh, spk, opk)
    }

    #[test]
    fn shared_key_matches_without_opk() {
        let alice_ik_dh = KeyAgreementKeyPair::generate();
        let (bundle, bob_ik_dh, bob_spk, _) = make_bundle(false);

        let sender = x3dh_send(&alice_ik_dh, &bundle).unwrap();
        let receiver_sk = x3dh_receive(&bob_ik_dh, &bob_spk, None, &sender.init).unwrap();

        assert_eq!(sender.sk, receiver_sk);
    }

    #[test]
    fn shared_key_matches_with_opk() {
        let alice_ik_dh = KeyAgreementKeyPair::generate();
        let (bundle, bob_ik_dh, bob_spk, bob_opk) = make_bundle(true);

        let sender = x3dh_send(&alice_ik_dh, &bundle).unwrap();
        let receiver_sk = x3dh_receive(&bob_ik_dh, &bob_spk, bob_opk.as_ref(), &sender.init).unwrap();

        assert_eq!(sender.sk, receiver_sk);
    }

    #[test]
    fn send_rejects_bad_spk_signature() {
        let alice_ik_dh = KeyAgreementKeyPair::generate();
        let (mut bundle, _, _, _) = make_bundle(false);
        bundle.spk_sig[0] ^= 0xff; // tamper the signature

        assert!(x3dh_send(&alice_ik_dh, &bundle).is_err());
    }

    #[test]
    fn receive_rejects_opk_mismatch() {
        let alice_ik_dh = KeyAgreementKeyPair::generate();
        let (bundle, bob_ik_dh, bob_spk, _) = make_bundle(false);

        let sender = x3dh_send(&alice_ik_dh, &bundle).unwrap();
        // init.opk_used is false but we pass an OPK anyway
        let orphan_opk = KeyAgreementKeyPair::generate();
        assert!(x3dh_receive(&bob_ik_dh, &bob_spk, Some(&orphan_opk), &sender.init).is_err());
    }

    #[test]
    fn different_sessions_produce_different_keys() {
        let alice_ik_dh = KeyAgreementKeyPair::generate();
        let (bundle, bob_ik_dh, bob_spk, _) = make_bundle(false);

        let s1 = x3dh_send(&alice_ik_dh, &bundle).unwrap();
        let s2 = x3dh_send(&alice_ik_dh, &bundle).unwrap();

        // ephemeral keys differ each call, so SKs must differ
        assert_ne!(s1.sk, s2.sk);

        let r1 = x3dh_receive(&bob_ik_dh, &bob_spk, None, &s1.init).unwrap();
        let r2 = x3dh_receive(&bob_ik_dh, &bob_spk, None, &s2.init).unwrap();
        assert_eq!(s1.sk, r1);
        assert_eq!(s2.sk, r2);
    }
}
