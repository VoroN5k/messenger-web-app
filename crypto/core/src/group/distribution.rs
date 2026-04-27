// Sender Key Distribution
//
// When a user joins a group (or when the sender rotates their key), they send
// a SenderKeyDistributionMessage to every other member over an individually
// authenticated channel — i.e., inside a Double Ratchet encrypted message.
// The distribution message is NOT self-authenticating: the security of group
// encryption depends entirely on the authenticity of the delivery channel.
//
// Upon receipt, each member calls process_distribution_message and stores the
// resulting ReceiverState keyed by (conversation_id, sender_id).

use serde::{Deserialize, Serialize};

use crate::identity::IdentityPublicKey;

use super::sender_key::{ReceiverState, SenderState};

// Transmitted to each group member to initialise their receiver state.
// Contains the public signing key and the current position in the sender's
// chain; recipients can decrypt all messages sent at `iteration` or later.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SenderKeyDistributionMessage {
    pub key_id: u32,
    pub iteration: u32,
    pub chain_key: [u8; 32],
    pub signing_pub: IdentityPublicKey,
}

// Build a distribution message from the sender's current state.
// Send this over a Double Ratchet channel to each group member.
pub fn create_distribution_message(state: &SenderState) -> SenderKeyDistributionMessage {
    let (key_id, iteration, chain_key, signing_pub) = state.snapshot();
    SenderKeyDistributionMessage { key_id, iteration, chain_key, signing_pub }
}

// Initialise a ReceiverState from a distribution message received over a
// trusted channel. Store the result keyed by the sender's user ID.
pub fn process_distribution_message(msg: &SenderKeyDistributionMessage) -> ReceiverState {
    ReceiverState::new(msg.key_id, msg.iteration, msg.chain_key, msg.signing_pub.clone())
}
