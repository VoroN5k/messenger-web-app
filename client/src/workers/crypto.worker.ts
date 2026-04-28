// WASM crypto worker. All sensitive operations run here, never on the main thread.

type Payload = Record<string, unknown>;
type Req = { id: string; type: string; payload: Payload };
type Resp =
    | { id: string; ok: true; result: Record<string, unknown> }
    | { id: string; ok: false; error: string };

type WasmMod = typeof import('../wasm/messenger_crypto_wasm');
let mod: WasmMod;

try {
    mod = await import('../wasm/messenger_crypto_wasm');
    self.postMessage({ type: '__ready__' });
} catch (err) {
    self.postMessage({ type: '__error__', error: String(err) });
    throw err;
}

self.onmessage = (ev: MessageEvent<Req>) => {
    const { id, type, payload: p } = ev.data;
    let resp: Resp;
    try {
        resp = { id, ok: true, result: dispatch(type, p) };
    } catch (e) {
        resp = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    (self as unknown as Worker).postMessage(resp);
};

function u8(v: unknown, name: string): Uint8Array {
    if (v instanceof Uint8Array) return v;
    throw new Error(`${name}: expected Uint8Array`);
}

function dispatch(type: string, p: Payload): Record<string, unknown> {
    switch (type) {
        // key generation
        case 'generateKeyAgreementKeypair':
            return { keypair: mod.generateKeyAgreementKeypair() };
        case 'generateSigningKeypair':
            return { keypair: mod.generateSigningKeypair() };

        // sign / verify
        case 'sign':
            return { sig: mod.sign(u8(p.seed, 'seed'), u8(p.message, 'message')) };
        case 'verifySignature':
            return { valid: mod.verifySignature(u8(p.pubKey, 'pubKey'), u8(p.message, 'message'), u8(p.sig, 'sig')) };
        // PIN (Argon2id)
        case 'encryptKeyWithPin':
            return { blob: mod.encryptKeyWithPin(u8(p.keyBytes, 'keyBytes'), u8(p.pin, 'pin')) };
        case 'decryptKeyWithPin':
            return { keyBytes: mod.decryptKeyWithPin(u8(p.blobBytes, 'blobBytes'), u8(p.pin, 'pin')) };

        // X3DH
        // returns: sk(32)||ik_dh_pub(32)||ek_pub(32)||opk_used(1) = 97 bytes
        case 'x3dhSend':
            return { result: mod.x3dhSend(u8(p.ourIkDhSecret, 'ourIkDhSecret'), u8(p.bundleBytes, 'bundleBytes')) };
        // initMsgBytes: ik_dh_pub(32)||ek_pub(32)||opk_used(1) = 65 bytes -> returns sk(32)
        case 'x3dhReceive':
            return {
                sk: mod.x3dhReceive(
                    u8(p.ourIkDhSecret, 'ourIkDhSecret'),
                    u8(p.ourSpkSecret, 'ourSpkSecret'),
                    u8(p.ourOpkSecret, 'ourOpkSecret'),
                    u8(p.initMsgBytes, 'initMsgBytes'),
                ),
            };

        // Double Ratchet
        case 'ratchetInitSender': {
            const s = mod.RatchetSession.initSender(u8(p.sk, 'sk'), u8(p.bobDhPub, 'bobDhPub'));
            try { return { sessionBytes: s.toBytes() }; } finally { s.free(); }
        }
        case 'ratchetInitReceiver': {
            const s = mod.RatchetSession.initReceiver(u8(p.sk, 'sk'), u8(p.ourDhSecret, 'ourDhSecret'));
            try { return { sessionBytes: s.toBytes() }; } finally { s.free(); }
        }
        // output: dh_pub(32)||pn(4)||n(4)||ciphertext - header embedded
        case 'ratchetEncrypt': {
            const s = mod.RatchetSession.fromBytes(u8(p.sessionBytes, 'sessionBytes'));
            try {
                const ciphertext = s.encrypt(u8(p.plaintext, 'plaintext'), u8(p.aad, 'aad'));
                return { ciphertext, newSessionBytes: s.toBytes() };
            } finally { s.free(); }
        }
        case 'ratchetDecrypt': {
            const s = mod.RatchetSession.fromBytes(u8(p.sessionBytes, 'sessionBytes'));
            try {
                const plaintext = s.decrypt(u8(p.data, 'data'), u8(p.aad, 'aad'));
                return { plaintext, newSessionBytes: s.toBytes() };
            } finally { s.free(); }
        }

        // Group sender
        case 'groupSenderGenerate': {
            const s = mod.GroupSenderSession.generate();
            try { return { senderBytes: s.toBytes(), distMsg: s.createDistributionMessage() }; } finally { s.free(); }
        }
        // output: key_id(4)||iteration(4)||sig(64)||ciphertext
        case 'groupSenderEncrypt': {
            const s = mod.GroupSenderSession.fromBytes(u8(p.senderBytes, 'senderBytes'));
            try {
                const ciphertext = s.encrypt(u8(p.plaintext, 'plaintext'));
                return { ciphertext, newSenderBytes: s.toBytes() };
            } finally { s.free(); }
        }
        case 'groupSenderDistMsg': {
            const s = mod.GroupSenderSession.fromBytes(u8(p.senderBytes, 'senderBytes'));
            try { return { distMsg: s.createDistributionMessage() }; } finally { s.free(); }
        }

        // Group receiver
        // distMsgBytes: key_id(4)||iteration(4)||chain_key(32)||signing_pub(32) = 72 bytes
        case 'groupReceiverFromDist': {
            const s = mod.GroupReceiverSession.fromDistributionMessage(u8(p.distMsgBytes, 'distMsgBytes'));
            try { return { receiverBytes: s.toBytes() }; } finally { s.free(); }
        }
        case 'groupReceiverDecrypt': {
            const s = mod.GroupReceiverSession.fromBytes(u8(p.receiverBytes, 'receiverBytes'));
            try {
                const plaintext = s.decrypt(u8(p.data, 'data'));
                return { plaintext, newReceiverBytes: s.toBytes() };
            } finally { s.free(); }
        }

        default:
            throw new Error(`unknown op: ${type}`);
    }
}

export {};
