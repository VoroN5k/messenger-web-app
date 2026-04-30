import init, * as wasmBindings from '../wasm/messenger_crypto_wasm';

type Payload = Record<string, unknown>;
type Req = { id: string; type: string; payload: Payload };
type Resp =
    | { id: string; ok: true; result: Record<string, unknown> }
    | { id: string; ok: false; error: string };

// Використовуємо typeof для типізації, але mod ініціалізуємо через bindings
let mod: typeof wasmBindings;

self.onmessage = async (ev: MessageEvent) => {
    const data = ev.data;

    // 1. Обробка ініціалізації
    if (data.type === '__init__') {
        try {
            // Визначаємо URL до бінарника в public папці.
            // self.location.origin гарантує абсолютний шлях навіть у воркері.
            const wasmUrl = new URL('/wasm/messenger_crypto_wasm_bg.wasm', self.location.origin).href;

            // Ініціалізуємо WASM. Оскільки ми зібрали з --target web,
            // функція init (default export) приймає рядок-URL і сама робить fetch.
            await init(wasmUrl);

            // Після ініціалізації зберігаємо bindings для викликів у dispatch
            mod = wasmBindings;

            self.postMessage({ type: '__ready__' });
        } catch (err) {
            console.error('WASM Worker Initialization Failed:', err);
            self.postMessage({ type: '__error__', error: String(err) });
        }
        return;
    }

    // 2. Захист від викликів до ініціалізації
    if (!mod) {
        console.error('WASM worker called before __init__');
        return;
    }

    // 3. Обробка крипто-викликів
    const { id, type, payload: p } = data as Req;
    let resp: Resp;

    try {
        const result = dispatch(type, p);
        resp = { id, ok: true, result };
    } catch (e) {
        resp = {
            id,
            ok: false,
            error: e instanceof Error ? e.message : String(e)
        };
    }

    (self as unknown as Worker).postMessage(resp);
};

// Хелпер для перевірки Uint8Array
function u8(v: unknown, name: string): Uint8Array {
    if (v instanceof Uint8Array) return v;
    throw new Error(`${name}: expected Uint8Array, got ${typeof v}`);
}

function dispatch(type: string, p: Payload): Record<string, unknown> {
    switch (type) {
        // --- Keys ---
        case 'generateKeyAgreementKeypair':
            return { keypair: mod.generateKeyAgreementKeypair() };
        case 'generateSigningKeypair':
            return { keypair: mod.generateSigningKeypair() };

        // --- Auth & Security ---
        case 'sign':
            return { sig: mod.sign(u8(p.seed, 'seed'), u8(p.message, 'message')) };
        case 'verifySignature':
            return { valid: mod.verifySignature(u8(p.pubKey, 'pubKey'), u8(p.message, 'message'), u8(p.sig, 'sig')) };
        case 'encryptKeyWithPin':
            return { blob: mod.encryptKeyWithPin(u8(p.keyBytes, 'keyBytes'), u8(p.pin, 'pin')) };
        case 'decryptKeyWithPin':
            return { keyBytes: mod.decryptKeyWithPin(u8(p.blobBytes, 'blobBytes'), u8(p.pin, 'pin')) };

        // --- X3DH ---
        case 'x3dhSend':
            return { result: mod.x3dhSend(u8(p.ourIkDhSecret, 'ourIkDhSecret'), u8(p.bundleBytes, 'bundleBytes')) };
        case 'x3dhReceive':
            return {
                sk: mod.x3dhReceive(
                    u8(p.ourIkDhSecret, 'ourIkDhSecret'),
                    u8(p.ourSpkSecret, 'ourSpkSecret'),
                    u8(p.ourOpkSecret, 'ourOpkSecret'),
                    u8(p.initMsgBytes, 'initMsgBytes'),
                ),
            };

        // --- Double Ratchet ---
        case 'ratchetInitSender': {
            const s = mod.RatchetSession.initSender(u8(p.sk, 'sk'), u8(p.bobDhPub, 'bobDhPub'));
            try { return { sessionBytes: s.toBytes() }; } finally { s.free(); }
        }
        case 'ratchetInitReceiver': {
            const s = mod.RatchetSession.initReceiver(u8(p.sk, 'sk'), u8(p.ourDhSecret, 'ourDhSecret'));
            try { return { sessionBytes: s.toBytes() }; } finally { s.free(); }
        }
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

        // --- Groups ---
        case 'groupSenderGenerate': {
            const s = mod.GroupSenderSession.generate();
            try { return { senderBytes: s.toBytes(), distMsg: s.createDistributionMessage() }; } finally { s.free(); }
        }
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

        // ── Device Sync (VSP-1) ─────────────────────────────────────────────────
        case 'syncGenerateOtp':
            return { otp: mod.syncGenerateOtp() };
        case 'syncGenerateSessionId':
            return { sessionId: mod.syncGenerateSessionId() };
        case 'syncGenerateKeypair':
            return { keypair: mod.syncGenerateKeypair() };
        case 'syncDeriveKeys':
            return {
                keys: mod.syncDeriveKeys(
                    u8(p.secret,  'secret'),
                    u8(p.peerPub, 'peerPub'),
                    u8(p.otp,     'otp'),
                ),
            };
        case 'syncSealChunk':
            return {
                sealed: mod.syncSealChunk(
                    u8(p.keys,      'keys'),
                    p.seq as number,
                    u8(p.plaintext, 'plaintext'),
                ),
            };
        case 'syncOpenChunk':
            return {
                plain: mod.syncOpenChunk(
                    u8(p.keys, 'keys'),
                    p.seq as number,
                    u8(p.data, 'data'),
                ),
            };
        case 'syncBuildManifest':
            return {
                manifest: mod.syncBuildManifest(
                    u8(p.macKey,  'macKey'),
                    u8(p.ids,    'ids'),
                    u8(p.hashes, 'hashes'),
                ),
            };
        case 'syncVerifyManifest':
            return {
                entries: mod.syncVerifyManifest(
                    u8(p.macKey,   'macKey'),
                    u8(p.manifest, 'manifest'),
                ),
            };

        default:
            throw new Error(`Unknown crypto operation: ${type}`);
    }
}

export {};