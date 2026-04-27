use std::collections::BTreeMap;

use rand_core::{OsRng, RngCore};
use zeroize::Zeroize;

use crate::{
    error::CryptoError,
    identity::{IdentityKeyPair, IdentityPublicKey},
    utils::hmac_sha256,
};

pub const MAX_SKIP: u32 = 2000;

// ---------------------------------------------------------------------------
// Chain ratchet
// ---------------------------------------------------------------------------

// Same HMAC-based construction as the Double Ratchet symmetric ratchet.
// new_chain_key = HMAC-SHA-256(ck, 0x02)
// message_key   = HMAC-SHA-256(ck, 0x01)
fn advance(chain_key: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let new_ck = hmac_sha256(chain_key, &[0x02]);
    let mk = hmac_sha256(chain_key, &[0x01]);
    (new_ck, mk)
}

// Deterministic AES-GCM nonce: 4-byte BE iteration || 8 zero bytes.
// Safe because every (chain_key, iteration) pair is unique by construction.
pub fn iteration_nonce(n: u32) -> [u8; 12] {
    let mut nonce = [0u8; 12];
    nonce[..4].copy_from_slice(&n.to_be_bytes());
    nonce
}

// ---------------------------------------------------------------------------
// Sender state  (message author)
// ---------------------------------------------------------------------------

// One instance per conversation for the local user when they are a sender.
// Must be persisted and re-loaded across application restarts (encrypted).
pub struct SenderState {
    pub key_id: u32,
    pub iteration: u32,
    chain_key: [u8; 32],
    signing_key: IdentityKeyPair, // Ed25519; private half stays local
}

impl SenderState {
    // Create a fresh sender state with a random chain key and signing key.
    pub fn generate() -> Self {
        let mut chain_key = [0u8; 32];
        OsRng.fill_bytes(&mut chain_key);
        Self {
            key_id: OsRng.next_u32(),
            iteration: 0,
            chain_key,
            signing_key: IdentityKeyPair::generate(),
        }
    }

    // Advance the chain by one step and return the message key + nonce.
    // Call once per outgoing message; do not call it more than once per message.
    pub fn next_message_key(&mut self) -> ([u8; 32], [u8; 12]) {
        let nonce = iteration_nonce(self.iteration);
        let (new_ck, mk) = advance(&self.chain_key);
        self.chain_key.zeroize();
        self.chain_key = new_ck;
        self.iteration += 1;
        (mk, nonce)
    }

    // Sign `data` with the Ed25519 signing key.
    pub fn sign(&self, data: &[u8]) -> [u8; 64] {
        self.signing_key.sign(data)
    }

    // Public signing key shared in the distribution message so recipients can
    // verify signatures without knowing the private key.
    pub fn signing_public_key(&self) -> IdentityPublicKey {
        self.signing_key.public_key()
    }

    // Snapshot used by distribution::create_distribution_message.
    // Returns (key_id, iteration, chain_key, signing_pub).
    // The chain_key in the snapshot is the CURRENT key; the receiver will
    // be able to decrypt messages sent from `iteration` onward.
    pub(crate) fn snapshot(&self) -> (u32, u32, [u8; 32], IdentityPublicKey) {
        (self.key_id, self.iteration, self.chain_key, self.signing_key.public_key())
    }
}

impl Drop for SenderState {
    fn drop(&mut self) {
        self.chain_key.zeroize();
    }
}

// ---------------------------------------------------------------------------
// Receiver state  (one per group member, on the recipient's side)
// ---------------------------------------------------------------------------

// Each participant in a group maintains one ReceiverState per other sender.
// Created by processing a SenderKeyDistributionMessage (see distribution.rs).
pub struct ReceiverState {
    pub key_id: u32,
    iteration: u32,
    chain_key: [u8; 32],
    pub signing_pub: IdentityPublicKey, // used to verify message signatures
    pub skipped: BTreeMap<u32, [u8; 32]>, // iteration -> message_key cache
}

impl ReceiverState {
    pub fn new(
        key_id: u32,
        iteration: u32,
        chain_key: [u8; 32],
        signing_pub: IdentityPublicKey,
    ) -> Self {
        Self { key_id, iteration, chain_key, signing_pub, skipped: BTreeMap::new() }
    }

    // Obtain the message key for `target` iteration.
    //
    // If target > current: advance the chain, caching skipped keys (bounded
    //   by MAX_SKIP to prevent memory exhaustion).
    // If target < current: look up the skipped-key cache (out-of-order delivery).
    // If target == current: advance by one step and return the key.
    pub fn message_key_for(&mut self, target: u32) -> Result<[u8; 32], CryptoError> {
        // fast path: buffered out-of-order key
        if let Some(mut mk) = self.skipped.remove(&target) {
            // return a copy; the map entry is already erased
            let copy = mk;
            mk.zeroize();
            return Ok(copy);
        }

        if target < self.iteration {
            // key already consumed and not in cache — replay or gap too large
            return Err(CryptoError::DecryptionFailed);
        }

        let gap = target - self.iteration;
        if gap > MAX_SKIP {
            return Err(CryptoError::SkipLimitExceeded);
        }

        // advance chain, caching every key we skip over
        while self.iteration < target {
            let (new_ck, mut mk) = advance(&self.chain_key);
            self.chain_key.zeroize();
            self.chain_key = new_ck;
            self.skipped.insert(self.iteration, mk);
            mk.zeroize(); // clear stack copy; map owns the authoritative value
            self.iteration += 1;
        }

        // self.iteration == target: get the actual message key
        let (new_ck, mk) = advance(&self.chain_key);
        self.chain_key.zeroize();
        self.chain_key = new_ck;
        self.iteration += 1;
        Ok(mk)
    }
}

impl Drop for ReceiverState {
    fn drop(&mut self) {
        self.chain_key.zeroize();
        for mk in self.skipped.values_mut() {
            mk.zeroize();
        }
    }
}
