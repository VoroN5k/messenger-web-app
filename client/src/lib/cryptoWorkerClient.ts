// Promise-based RPC client for the crypto Web Worker.
// One worker instance per session; all calls are queued until WASM is ready.

type Resp =
    | { id: string; ok: true; result: Record<string, unknown> }
    | { id: string; ok: false; error: string };

type Pending = {
    resolve: (r: Record<string, unknown>) => void;
    reject: (e: Error) => void;
};

let instance: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let readyResolve!: () => void;
let readyReject!: (e: Error) => void;
let seq = 0;
const pending = new Map<string, Pending>();

function ensureWorker(): Worker {
    if (!instance) {
        readyPromise = new Promise<void>((res, rej) => {
            readyResolve = res;
            readyReject = rej;
        });

        const w = new Worker(
            new URL('../workers/crypto.worker.ts', import.meta.url),
            { type: 'module' },
        );

        const wasmUrl = `${window.location.origin}/wasm/messenger_crypto_wasm_bg.wasm`;

        w.onmessage = (ev: MessageEvent) => {
            const d = ev.data as { type?: string; error?: string } & Resp;
            if (d.type === '__ready__') { readyResolve(); return; }
            if (d.type === '__error__') { readyReject(new Error(d.error)); return; }
            const p = pending.get(d.id);
            if (!p) return;
            pending.delete(d.id);
            d.ok ? p.resolve(d.result) : p.reject(new Error((d as { error: string }).error));
        };
        w.onerror = (ev) => readyReject(new Error(ev.message));

        w.postMessage({ type: '__init__', wasmUrl });

        instance = w;
    }
    return instance;
}

async function call<T extends Record<string, unknown>>(
    type: string,
    payload: Record<string, unknown> = {},
): Promise<T> {
    const w = ensureWorker();
    await readyPromise;
    const id = String(++seq);
    return new Promise<T>((resolve, reject) => {
        pending.set(id, {
            resolve: (r) => resolve(r as T),
            reject,
        });
        w.postMessage({ id, type, payload });
    });
}

// Zero out a Uint8Array after use to limit key lifetime in JS heap.
export function zeroize(buf: Uint8Array): void {
    buf.fill(0);
}

export const wasm = {
    // key generation
    generateKeyAgreementKeypair: () =>
        call<{ keypair: Uint8Array }>('generateKeyAgreementKeypair'),
    generateSigningKeypair: () =>
        call<{ keypair: Uint8Array }>('generateSigningKeypair'),

    // sign / verify
    sign: (seed: Uint8Array, message: Uint8Array) =>
        call<{ sig: Uint8Array }>('sign', { seed, message }),
    verifySignature: (pubKey: Uint8Array, message: Uint8Array, sig: Uint8Array) =>
        call<{ valid: boolean }>('verifySignature', { pubKey, message, sig }),

    // PIN (Argon2id — runs synchronously in worker, never blocks main thread)
    encryptKeyWithPin: (keyBytes: Uint8Array, pin: Uint8Array) =>
        call<{ blob: Uint8Array }>('encryptKeyWithPin', { keyBytes, pin }),
    decryptKeyWithPin: (blobBytes: Uint8Array, pin: Uint8Array) =>
        call<{ keyBytes: Uint8Array }>('decryptKeyWithPin', { blobBytes, pin }),

    // X3DH
    x3dhSend: (ourIkDhSecret: Uint8Array, bundleBytes: Uint8Array) =>
        call<{ result: Uint8Array }>('x3dhSend', { ourIkDhSecret, bundleBytes }),
    x3dhReceive: (
        ourIkDhSecret: Uint8Array,
        ourSpkSecret: Uint8Array,
        ourOpkSecret: Uint8Array,
        initMsgBytes: Uint8Array,
    ) => call<{ sk: Uint8Array }>('x3dhReceive', { ourIkDhSecret, ourSpkSecret, ourOpkSecret, initMsgBytes }),

    // Double Ratchet
    ratchetInitSender: (sk: Uint8Array, bobDhPub: Uint8Array) =>
        call<{ sessionBytes: Uint8Array }>('ratchetInitSender', { sk, bobDhPub }),
    ratchetInitReceiver: (sk: Uint8Array, ourDhSecret: Uint8Array) =>
        call<{ sessionBytes: Uint8Array }>('ratchetInitReceiver', { sk, ourDhSecret }),
    ratchetEncrypt: (sessionBytes: Uint8Array, plaintext: Uint8Array, aad: Uint8Array) =>
        call<{ ciphertext: Uint8Array; newSessionBytes: Uint8Array }>('ratchetEncrypt', { sessionBytes, plaintext, aad }),
    ratchetDecrypt: (sessionBytes: Uint8Array, data: Uint8Array, aad: Uint8Array) =>
        call<{ plaintext: Uint8Array; newSessionBytes: Uint8Array }>('ratchetDecrypt', { sessionBytes, data, aad }),

    // Group sender
    groupSenderGenerate: () =>
        call<{ senderBytes: Uint8Array; distMsg: Uint8Array }>('groupSenderGenerate'),
    groupSenderEncrypt: (senderBytes: Uint8Array, plaintext: Uint8Array) =>
        call<{ ciphertext: Uint8Array; newSenderBytes: Uint8Array }>('groupSenderEncrypt', { senderBytes, plaintext }),
    groupSenderDistMsg: (senderBytes: Uint8Array) =>
        call<{ distMsg: Uint8Array }>('groupSenderDistMsg', { senderBytes }),

    // Group receiver
    groupReceiverFromDist: (distMsgBytes: Uint8Array) =>
        call<{ receiverBytes: Uint8Array }>('groupReceiverFromDist', { distMsgBytes }),
    groupReceiverDecrypt: (receiverBytes: Uint8Array, data: Uint8Array) =>
        call<{ plaintext: Uint8Array; newReceiverBytes: Uint8Array }>('groupReceiverDecrypt', { receiverBytes, data }),

    // ── Device Sync (VSP-1) ────────────────────────────────────────────────
    // All crypto runs in the worker — no lz4/AES on the main thread.

    syncGenerateOtp: () =>
        call<{ otp: Uint8Array }>('syncGenerateOtp'),
    syncGenerateSessionId: () =>
        call<{ sessionId: Uint8Array }>('syncGenerateSessionId'),

    // Returns secret(32) || public(32) = 64 bytes
    syncGenerateKeypair: () =>
        call<{ keypair: Uint8Array }>('syncGenerateKeypair'),

    // Returns chunk_key(32) || mac_key(32) = 64 bytes
    syncDeriveKeys: (secret: Uint8Array, peerPub: Uint8Array, otp: Uint8Array) =>
        call<{ keys: Uint8Array }>('syncDeriveKeys', { secret, peerPub, otp }),

    // Returns nonce(12) || AES-GCM(lz4(plaintext), aad=seq)
    syncSealChunk: (keys: Uint8Array, seq: number, plaintext: Uint8Array) =>
        call<{ sealed: Uint8Array }>('syncSealChunk', { keys, seq, plaintext }),

    // Returns decompressed plaintext; throws on AEAD/decompression failure
    syncOpenChunk: (keys: Uint8Array, seq: number, data: Uint8Array) =>
        call<{ plain: Uint8Array }>('syncOpenChunk', { keys, seq, data }),

    // ids = u64[] as packed BE bytes (n×8), hashes = sha256[] as packed bytes (n×32)
    syncBuildManifest: (macKey: Uint8Array, ids: Uint8Array, hashes: Uint8Array) =>
        call<{ manifest: Uint8Array }>('syncBuildManifest', { macKey, ids, hashes }),

    // Returns [id(8 BE) || sha256(32)] × count, or throws on HMAC failure
    syncVerifyManifest: (macKey: Uint8Array, manifest: Uint8Array) =>
        call<{ entries: Uint8Array }>('syncVerifyManifest', { macKey, manifest }),
};
