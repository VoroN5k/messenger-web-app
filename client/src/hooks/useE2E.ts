'use client';

// Vesper v2.0 - Double Ratchet (DM) + Signal Sender Key (group).
// All crypto runs in a WASM Web Worker. Session state persists to IndexedDB.
//
// Wire format - DM:
//   v2:<base64url>  where decoded = flags(1) | [x3dh_init(65) if flags&1] | dr_wire(40+ct)
//   flags=0x01 -> first message (X3DH init embedded)
//
// Wire format - group:
//   v2g:<base64url>  where decoded = key_id(4)|iteration(4)|sig(64)|ct
//

import { useAuthStore } from '@/src/store/useAuthStore';
import { useCallback, useEffect, useState } from 'react';
import api from '@/src/lib/axios';
import { wasm, zeroize } from '@/src/lib/cryptoWorkerClient';
import {
    IdentityKeys,
    clearAllCryptoState,
    deleteAllGroupReceivers,
    deleteGroupSender,
    deleteIdentityKeys,
    loadGroupReceiver,
    loadGroupSender,
    loadIdentityKeys,
    loadRatchetSession,
    saveGroupReceiver,
    saveGroupSender,
    saveIdentityKeys,
    saveRatchetSession,
} from '@/src/lib/cryptoDb';
import { legacyDecryptBinary, legacyDecryptText, legacyDeriveSharedKey } from '@/src/lib/cryptoLegacy';
import { loadPrivateKey } from '@/src/lib/crypto';

const IS_BROWSER =
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof indexedDB !== 'undefined';

// Module-level singletons

type E2EStatus = 'idle' | 'ready' | 'needs-recovery' | 'needs-setup' | 'keys-desynced';

let identity: IdentityKeys | null = null;
let currentUserId: number | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let initGeneration = 0;
let keysWereRotated = false;
let e2eStatus: E2EStatus = 'idle';
let pendingRecoveryBlob: string | null = null;
let legacyPrivKey: CryptoKey | null = null;

const legacyKeyCache = new Map<number, Promise<CryptoKey | null>>();
const peerV2Cache    = new Map<number, Promise<boolean>>();
const drLocks        = new Map<string, Promise<unknown>>();
const groupLocks     = new Map<number, Promise<unknown>>();

// Check whether a peer has published a v2 key bundle. Result is cached at module
// level so multiple components don't race. Cache is invalidated on peer key rotation.
function checkPeerHasV2(peerId: number): Promise<boolean> {
    if (!peerV2Cache.has(peerId)) {
        peerV2Cache.set(
            peerId,
            api.get(`/keys/v2/${peerId}`)
                .then(() => true)
                .catch((err: any) => {
                    if (err?.response?.status === 404) return false;
                    // transient network error — don't cache, optimistically allow
                    peerV2Cache.delete(peerId);
                    return true;
                }),
        );
    }
    return peerV2Cache.get(peerId)!;
}

let statusCallbacks: Array<(s: E2EStatus) => void> = [];
let onReadyCallbacks: Array<() => void> = [];

function broadcastStatus(s: E2EStatus) {
    e2eStatus = s;
    statusCallbacks.forEach((cb) => cb(s));
}

// Encoding

function b64Enc(buf: Uint8Array | ArrayBuffer): string {
    const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return btoa(String.fromCharCode(...a))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64Dec(s: string): Uint8Array {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    const r = atob(p.padEnd(p.length + (4 - p.length % 4) % 4, '='));
    const b = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i);
    return b;
}

function tryUtf8(buf: ArrayBuffer): string | null {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { return null; }
}

const V2_DM    = 'v2:';
const V2_GROUP = 'v2g:';
const INIT_FLAG = 0x01;

// Concurrency — serialise DR/group operations per session

function withLock<T>(map: Map<string | number, Promise<unknown>>, key: string | number, fn: () => Promise<T>): Promise<T> {
    const prev = (map.get(key) ?? Promise.resolve()) as Promise<unknown>;
    const next = prev.then(fn, () => fn());
    map.set(key, next.catch(() => {}));
    return next;
}

// X3DH bundle helpers

// wire: ik_sign_pub(32)||ik_dh_pub(32)||spk_pub(32)||spk_sig(64)||opk_present(1) = 161 bytes
function buildBundle(k: IdentityKeys): Uint8Array {
    const b = new Uint8Array(161);
    b.set(k.ikSignPub, 0);
    b.set(k.ikDhPub,   32);
    b.set(k.spkPub,    64);
    b.set(k.spkSig,    96);
    b[160] = 0; // no OPK in v2.0
    return b;
}

async function fetchBundle(userId: number): Promise<Uint8Array> {
    const { data } = await api.get<{ bundle: string }>(`/keys/v2/${userId}`);
    return b64Dec(data.bundle);
}

// Identity key generation

async function generateIdentityKeys(): Promise<IdentityKeys> {
    const [dhKp, signKp, spkKp] = await Promise.all([
        wasm.generateKeyAgreementKeypair(),
        wasm.generateSigningKeypair(),
        wasm.generateKeyAgreementKeypair(),
    ]);

    const ikDhSecret = dhKp.keypair.slice(0, 32);
    const ikDhPub    = dhKp.keypair.slice(32, 64);
    const ikSignSeed = signKp.keypair.slice(0, 32);
    const ikSignPub  = signKp.keypair.slice(32, 64);
    const spkSecret  = spkKp.keypair.slice(0, 32);
    const spkPub     = spkKp.keypair.slice(32, 64);
    zeroize(dhKp.keypair); zeroize(signKp.keypair); zeroize(spkKp.keypair);

    const { sig: spkSig } = await wasm.sign(ikSignSeed, spkPub);
    return { ikDhSecret, ikDhPub, ikSignSeed, ikSignPub, spkSecret, spkPub, spkSig };
}

// DR: one session per user-pair (sorted)

function pairKey(a: number, b: number): string { return [a, b].sort().join(':'); }

async function drEncrypt(
    myId: number,
    peerId: number,
    plaintext: Uint8Array,
): Promise<string> {
    const ck = pairKey(myId, peerId);
    return withLock(drLocks, ck, async () => {
        let sessionBytes = await loadRatchetSession(ck);
        let initMsg: Uint8Array | null = null;

        if (!sessionBytes) {
            const peerBundle = await fetchBundle(peerId);
            const { result }  = await wasm.x3dhSend(identity!.ikDhSecret, peerBundle);
            const sk          = result.slice(0, 32);
            initMsg           = result.slice(32, 97); // ik_dh_pub||ek_pub||opk_used
            const spkPub      = peerBundle.slice(64, 96);
            const { sessionBytes: sb } = await wasm.ratchetInitSender(sk, spkPub);
            zeroize(sk);
            sessionBytes = sb;
        }

        const { ciphertext, newSessionBytes } = await wasm.ratchetEncrypt(
            sessionBytes, plaintext, new Uint8Array(0),
        );
        await saveRatchetSession(ck, newSessionBytes);

        const offset = initMsg ? 66 : 1;
        const wire   = new Uint8Array(offset + ciphertext.length);
        wire[0]      = initMsg ? INIT_FLAG : 0x00;
        if (initMsg) wire.set(initMsg, 1);
        wire.set(ciphertext, offset);
        return V2_DM + b64Enc(wire);
    });
}

async function drDecrypt(
    myId: number,
    senderId: number,
    content: string,
): Promise<Uint8Array | null> {
    const ck   = pairKey(myId, senderId);
    const wire = b64Dec(content.slice(V2_DM.length));
    const hasInit = (wire[0] & INIT_FLAG) !== 0;

    return withLock(drLocks, ck, async () => {
        let sessionBytes = await loadRatchetSession(ck);

        if (hasInit) {
            const initMsg = wire.slice(1, 66);
            const drWire  = wire.slice(66);
            const { sk } = await wasm.x3dhReceive(
                identity!.ikDhSecret,
                identity!.spkSecret,
                new Uint8Array(0),
                initMsg,
            );
            const { sessionBytes: sb } = await wasm.ratchetInitReceiver(sk, identity!.spkSecret);
            zeroize(sk);
            sessionBytes = sb;
            const { plaintext, newSessionBytes } = await wasm.ratchetDecrypt(
                sessionBytes, drWire, new Uint8Array(0),
            );
            await saveRatchetSession(ck, newSessionBytes);
            return plaintext;
        }

        if (!sessionBytes) return null;
        const { plaintext, newSessionBytes } = await wasm.ratchetDecrypt(
            sessionBytes, wire.slice(1), new Uint8Array(0),
        );
        await saveRatchetSession(ck, newSessionBytes);
        return plaintext;
    });
}

// Legacy v1 key cache

async function legacyKey(peerId: number): Promise<CryptoKey | null> {
    if (!legacyPrivKey) return null;
    if (!legacyKeyCache.has(peerId)) {
        legacyKeyCache.set(peerId, (async () => {
            try {
                const { data } = await api.get<{ publicKey: string }>(`/keys/${peerId}`);
                return legacyDeriveSharedKey(legacyPrivKey!, data.publicKey);
            } catch { return null; }
        })());
    }
    return legacyKeyCache.get(peerId)!;
}

// Group distribution message encryption
// envelope wire: x3dh_init(65) | nonce(12) | aes-gcm-ct(72+16=88) = 165 bytes

async function sealDistMsg(distMsg: Uint8Array, recipientBundle: Uint8Array): Promise<Uint8Array> {
    const { result } = await wasm.x3dhSend(identity!.ikDhSecret, recipientBundle);
    const sk         = result.slice(0, 32);
    const initMsg    = result.slice(32, 97);
    const aesKey     = await crypto.subtle.importKey('raw', new Uint8Array(sk), 'AES-GCM', false, ['encrypt']);
    sk.fill(0);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new Uint8Array(distMsg));
    const env = new Uint8Array(65 + 12 + ct.byteLength);
    env.set(initMsg, 0); env.set(iv, 65); env.set(new Uint8Array(ct), 77);
    return env;
}

async function openDistMsg(envelope: Uint8Array): Promise<Uint8Array | null> {
    try {
        const { sk } = await wasm.x3dhReceive(
            identity!.ikDhSecret,
            identity!.spkSecret,
            new Uint8Array(0),
            envelope.slice(0, 65),
        );
        const aesKey = await crypto.subtle.importKey('raw', new Uint8Array(sk), 'AES-GCM', false, ['decrypt']);
        sk.fill(0);
        const pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: envelope.slice(65, 77) },
            aesKey,
            envelope.slice(77),
        );
        return new Uint8Array(pt);
    } catch { return null; }
}

// Module-level impl - called both from the distributeMySenderKey callback (with lock)
// and from encryptBinaryForGroup (already holding the lock).
async function doDistribute(
    conversationId: number,
    memberUserIds: number[],
): Promise<void> {
    if (!identity || !initialized) return;

    const { senderBytes, distMsg } = await wasm.groupSenderGenerate();
    await saveGroupSender(conversationId, senderBytes);

    const payloads: Array<{ recipientId: number; encryptedKey: string }> = [];
    await Promise.allSettled(
        memberUserIds.map(async (memberId) => {
            try {
                const bundle   = await fetchBundle(memberId);
                const envelope = await sealDistMsg(distMsg, bundle);
                payloads.push({ recipientId: memberId, encryptedKey: b64Enc(envelope) });
            } catch (e) {
                console.warn(`[E2E] dist failed for ${memberId}:`, e);
            }
        }),
    );

    if (payloads.length) {
        await api.post(`/conversations/${conversationId}/sender-keys`, { version: 2, keys: payloads });
    }
}

// Hook

export function useE2E() {
    const { user, accessToken } = useAuthStore();
    const [isReady, setIsReady] = useState(initialized && !!identity);
    const [status, setStatus]   = useState<E2EStatus>(e2eStatus);

    if (!IS_BROWSER) {
        return {
            encrypt: async (c: string) => c,
            decrypt: async (c: string) => c,
            encryptBinary: async (d: ArrayBuffer) => d,
            decryptBinary: async (d: ArrayBuffer) => d,
            encryptForGroup: async (c: string) => c,
            decryptFromGroup: async (c: string) => c,
            encryptBinaryForGroup: async (d: ArrayBuffer) => d,
            decryptBinaryFromGroup: async (d: ArrayBuffer) => d,
            distributeMySenderKey: async () => {},
            prefetchGroupSenderKeys: async () => {},
            invalidateGroupKeys: () => {},
            invalidatePeerKey: () => {},
            checkPeerHasV2: async (_: number) => true,
            keysJustRotated: false,
            unlockWithPin: async () => false,
            setupRecovery: async () => {},
            resetToNewKeys: async () => {},
            isReady: false,
            status: 'idle' as E2EStatus,
            needsRecovery: false,
            needsRecoverySetup: false,
            keysDesynced: false,
            clearAllKeyMaterial: async () => {},
        };
    }

    useEffect(() => {
        if (e2eStatus !== 'idle') setStatus(e2eStatus);
        if (initialized && identity) setIsReady(true);
        const cb = (s: E2EStatus) => {
            setStatus(s);
            if (s !== 'idle' && s !== 'needs-recovery') setIsReady(true);
        };
        statusCallbacks.push(cb);
        return () => { statusCallbacks = statusCallbacks.filter((x) => x !== cb); };
    }, []);

    useEffect(() => {
        if (!user?.id || !accessToken) return;
        if (initialized && identity) return;
        if (initPromise) return;

        currentUserId = user.id;
        broadcastStatus('idle');

        initPromise = (async () => {
            const gen = ++initGeneration;
            try {
                let keys = await loadIdentityKeys(user.id);
                if (gen !== initGeneration) return;

                if (!keys) {
                    try {
                        const { data } = await api.get<{ encryptedBlob: string }>('/keys/v2/recovery');
                        pendingRecoveryBlob = data.encryptedBlob;
                        broadcastStatus('needs-recovery');
                        return;
                    } catch (err: unknown) {
                        const code = (err as { response?: { status?: number } })?.response?.status;
                        if (code === 404) {
                            keys = await generateIdentityKeys();
                            await saveIdentityKeys(user.id, keys);
                            await api.post('/keys/v2', { bundle: b64Enc(buildBundle(keys)) });
                            keysWereRotated = true;
                            broadcastStatus('needs-setup');
                        } else {
                            console.error('[E2E] Cannot check v2 recovery (network?). Will retry.', err);
                            return;
                        }
                    }
                } else {
                    try { await api.get('/keys/v2/recovery'); }
                    catch { broadcastStatus('needs-setup'); }
                }

                if (gen !== initGeneration) return;

                legacyPrivKey = await loadPrivateKey(user.id).catch(() => null);
                identity      = keys!;
                initialized   = true;

                if (e2eStatus !== 'needs-setup' && e2eStatus !== 'keys-desynced') {
                    broadcastStatus('ready');
                }
                onReadyCallbacks.forEach((cb) => cb());
                onReadyCallbacks = [];
            } catch (err) {
                console.error('[E2E] Init failed:', err);
            } finally {
                initPromise = null;
            }
        })();
    }, [user?.id, accessToken]);

    useEffect(() => {
        if (!user?.id) {
            identity = null; legacyPrivKey = null; initialized = false;
            initPromise = null; currentUserId = null; keysWereRotated = false;
            pendingRecoveryBlob = null;
            legacyKeyCache.clear(); peerV2Cache.clear(); drLocks.clear(); groupLocks.clear();
            onReadyCallbacks = [];
            broadcastStatus('idle');
            setIsReady(false);
        }
    }, [user?.id]);

    // DM

    const encrypt = useCallback(async (content: string, targetUserId: number): Promise<string> => {
        if (!identity || !initialized || !currentUserId) return content;
        // No silent fallback: throw so callers never send plaintext when encryption fails
        return drEncrypt(currentUserId, targetUserId, new TextEncoder().encode(content));
    }, []);

    const decrypt = useCallback(async (ciphertext: string, senderUserId: number): Promise<string> => {
        if (!initialized || !currentUserId) {
            if (ciphertext.startsWith(V2_DM) || ciphertext.startsWith(V2_GROUP)) return '[🔒 Не вдалося розшифрувати]';
            return ciphertext;
        }
        if (ciphertext.startsWith(V2_DM) && identity) {
            try {
                const pt = await drDecrypt(currentUserId, senderUserId, ciphertext);
                return pt ? new TextDecoder().decode(pt) : '[🔒 Не вдалося розшифрувати]';
            } catch { return '[🔒 Не вдалося розшифрувати]'; }
        }
        try {
            const key = await legacyKey(senderUserId);
            if (!key) return ciphertext;
            return (await legacyDecryptText(key, ciphertext)) ?? '[🔒 Не вдалося розшифрувати]';
        } catch { return '[🔒 Не вдалося розшифрувати]'; }
    }, []);

    const encryptBinary = useCallback(async (data: ArrayBuffer, targetUserId: number): Promise<ArrayBuffer> => {
        if (!identity || !initialized || !currentUserId) return data;
        // No silent fallback: throw so callers never upload unencrypted data
        const wire = await drEncrypt(currentUserId, targetUserId, new Uint8Array(data));
        return new TextEncoder().encode(wire).buffer as ArrayBuffer;
    }, []);

    const decryptBinary = useCallback(async (data: ArrayBuffer, peerUserId: number): Promise<ArrayBuffer> => {
        if (!initialized || !currentUserId) return data;
        const text = tryUtf8(data);
        if (text?.startsWith(V2_DM) && identity) {
            try {
                const pt = await drDecrypt(currentUserId, peerUserId, text);
                return pt ? (pt.buffer as ArrayBuffer) : data;
            } catch { return data; }
        }
        try {
            const key = await legacyKey(peerUserId);
            if (!key) return data;
            return (await legacyDecryptBinary(key, data)) ?? data;
        } catch { return data; }
    }, []);

    // Group

    const encryptForGroup = useCallback(async (content: string, conversationId: number): Promise<string> => {
        if (!identity || !initialized) return content;
        return withLock(groupLocks, conversationId, async () => {
            const senderBytes = await loadGroupSender(conversationId);
            if (!senderBytes) return content;
            const { ciphertext, newSenderBytes } = await wasm.groupSenderEncrypt(
                senderBytes, new TextEncoder().encode(content),
            );
            await saveGroupSender(conversationId, newSenderBytes);
            return V2_GROUP + b64Enc(ciphertext);
        });
    }, []);

    const decryptFromGroup = useCallback(async (
        ciphertext: string,
        conversationId: number,
        senderId: number,
    ): Promise<string> => {
        if (!initialized) {
            if (ciphertext.startsWith(V2_DM) || ciphertext.startsWith(V2_GROUP)) return '[🔒 Не вдалося розшифрувати]';
            return ciphertext;
        }
        if (ciphertext.startsWith(V2_GROUP) && identity) {
            try {
                const data = b64Dec(ciphertext.slice(V2_GROUP.length));
                const receiverBytes = await loadGroupReceiver(conversationId, senderId);
                if (!receiverBytes) return '[🔒 Немає ключа відправника]';
                const { plaintext, newReceiverBytes } = await wasm.groupReceiverDecrypt(receiverBytes, data);
                await saveGroupReceiver(conversationId, senderId, newReceiverBytes);
                return new TextDecoder().decode(plaintext);
            } catch { return '[🔒 Не вдалося розшифрувати]'; }
        }
        // v1 group
        try {
            const key = await legacyKey(senderId);
            if (!key) return ciphertext;
            return (await legacyDecryptText(key, ciphertext)) ?? '[🔒 Не вдалося розшифрувати]';
        } catch { return '[🔒 Не вдалося розшифрувати]'; }
    }, []);

    const encryptBinaryForGroup = useCallback(async (
        data: ArrayBuffer,
        conversationId: number,
        memberIds?: number[],
    ): Promise<ArrayBuffer> => {
        if (!identity || !initialized) return data;
        return withLock(groupLocks, conversationId, async () => {
            let senderBytes = await loadGroupSender(conversationId);
            if (!senderBytes) {
                if (!memberIds?.length) return data;
                await doDistribute(conversationId, memberIds); // already inside lock
                senderBytes = await loadGroupSender(conversationId);
                if (!senderBytes) return data;
            }
            const { ciphertext, newSenderBytes } = await wasm.groupSenderEncrypt(senderBytes, new Uint8Array(data));
            await saveGroupSender(conversationId, newSenderBytes);
            return new TextEncoder().encode(V2_GROUP + b64Enc(ciphertext)).buffer as ArrayBuffer;
        });
    }, []);

    const decryptBinaryFromGroup = useCallback(async (
        data: ArrayBuffer,
        conversationId: number,
        senderId: number,
    ): Promise<ArrayBuffer> => {
        const text = tryUtf8(data);
        if (text?.startsWith(V2_GROUP)) {
            try {
                const s = await decryptFromGroup(text, conversationId, senderId);
                return new TextEncoder().encode(s).buffer as ArrayBuffer;
            } catch { return data; }
        }
        try {
            const key = await legacyKey(senderId);
            if (!key) return data;
            return (await legacyDecryptBinary(key, data)) ?? data;
        } catch { return data; }
    }, [decryptFromGroup]);

    const distributeMySenderKey = useCallback(async (
        conversationId: number,
        memberUserIds: number[],
    ): Promise<void> => {
        return withLock(groupLocks, conversationId, () => doDistribute(conversationId, memberUserIds));
    }, []);

    const prefetchGroupSenderKeys = useCallback(async (
        conversationId: number,
        memberUserIds: number[],
        socket?: { emit: (event: string, data: unknown) => void } | null,
    ): Promise<void> => {
        if (!identity || !initialized || !currentUserId) return;

        type Entry = { senderId: number; version?: number; encryptedKey?: string };
        let entries: Entry[] = [];
        try {
            const { data } = await api.get<Entry[]>(`/conversations/${conversationId}/sender-keys/for-me`);
            entries = data;
        } catch { return; }

        let hasMySenderKey = false;
        const failedSenders: number[] = [];

        await Promise.allSettled(
            entries.map(async ({ senderId, version, encryptedKey }) => {
                // encryptedKey stores the X3DH distribution envelope for v2 entries
                if (version !== 2 || !encryptedKey) return;
                if (await loadGroupReceiver(conversationId, senderId)) {
                    if (senderId === currentUserId) hasMySenderKey = true;
                    return;
                }
                const distMsg = await openDistMsg(b64Dec(encryptedKey));
                if (!distMsg) { if (senderId !== currentUserId) failedSenders.push(senderId); return; }
                const { receiverBytes } = await wasm.groupReceiverFromDist(distMsg);
                await saveGroupReceiver(conversationId, senderId, receiverBytes);
                if (senderId === currentUserId) hasMySenderKey = true;
            }),
        );

        if (socket) {
            for (const sid of failedSenders) {
                socket.emit('requestSenderKeyRedistribution', { conversationId, targetUserId: sid });
            }
        }

        const myEntryExists = entries.some((e) => e.senderId === currentUserId && e.version === 2);
        if (!hasMySenderKey && !myEntryExists) {
            await distributeMySenderKey(conversationId, memberUserIds);
        }
    }, [distributeMySenderKey]);

    const invalidatePeerKey = useCallback((userId: number) => {
        legacyKeyCache.delete(userId);
        peerV2Cache.delete(userId);
    }, []);

    const invalidateGroupKeys = useCallback((conversationId: number) => {
        deleteGroupSender(conversationId).catch(() => {});
        deleteAllGroupReceivers(conversationId).catch(() => {});
    }, []);

    const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
        if (!pendingRecoveryBlob || !currentUserId) return false;
        try {
            const pinBytes  = new TextEncoder().encode(pin);
            const { keyBytes } = await wasm.decryptKeyWithPin(b64Dec(pendingRecoveryBlob), pinBytes);
            zeroize(pinBytes);
            // layout: ikDhSecret(32)||ikSignSeed(32)||spkSecret(32)||ikDhPub(32)||ikSignPub(32)||spkPub(32)||spkSig(64) = 256
            const keys: IdentityKeys = {
                ikDhSecret: keyBytes.slice(0, 32),   ikSignSeed: keyBytes.slice(32, 64),
                spkSecret:  keyBytes.slice(64, 96),  ikDhPub:    keyBytes.slice(96, 128),
                ikSignPub:  keyBytes.slice(128, 160), spkPub:    keyBytes.slice(160, 192),
                spkSig:     keyBytes.slice(192, 256),
            };
            zeroize(keyBytes);
            await saveIdentityKeys(currentUserId, keys);
            legacyPrivKey = await loadPrivateKey(currentUserId).catch(() => null);
            identity = keys; initialized = true; pendingRecoveryBlob = null;
            broadcastStatus('ready');
            onReadyCallbacks.forEach((cb) => cb());
            onReadyCallbacks = [];
            return true;
        } catch { return false; }
    }, []);

    const setupRecovery = useCallback(async (
        pin: string,
        options?: { isReset?: boolean; twoFactorCode?: string },
    ): Promise<void> => {
        if (!identity || !initialized || !currentUserId) throw new Error('E2E not initialized');
        // Pack: ikDhSecret(32)||ikSignSeed(32)||spkSecret(32)||ikDhPub(32)||ikSignPub(32)||spkPub(32)||spkSig(64)
        const blob = new Uint8Array(256);
        blob.set(identity.ikDhSecret, 0);   blob.set(identity.ikSignSeed, 32);
        blob.set(identity.spkSecret,  64);  blob.set(identity.ikDhPub,    96);
        blob.set(identity.ikSignPub,  128); blob.set(identity.spkPub,     160);
        blob.set(identity.spkSig,     192);
        const pinBytes = new TextEncoder().encode(pin);
        const { blob: encBlob } = await wasm.encryptKeyWithPin(blob, pinBytes);
        blob.fill(0); zeroize(pinBytes);
        await api.post('/keys/v2/recovery', {
            encryptedBlob: b64Enc(encBlob),
            isReset:       options?.isReset ?? false,
            twoFactorCode: options?.twoFactorCode,
        });
        if (e2eStatus === 'needs-setup') broadcastStatus('ready');
    }, []);

    const resetToNewKeys = useCallback(async (): Promise<void> => {
        const myUserId = useAuthStore.getState().user?.id;
        if (!myUserId) throw new Error('Not authenticated');
        initGeneration++; initPromise = null;
        drLocks.clear(); groupLocks.clear(); legacyKeyCache.clear();
        const keys = await generateIdentityKeys();
        await saveIdentityKeys(myUserId, keys);
        await api.post('/keys/v2', { bundle: b64Enc(buildBundle(keys)) });
        try { await api.delete('/conversations/sender-keys/mine-all'); } catch {}
        identity = keys; initialized = true; keysWereRotated = true;
        broadcastStatus('needs-setup');
    }, []);

    const clearAllKeyMaterial = useCallback(async () => {
        if (!user?.id) return;
        await clearAllCryptoState(user.id);
        await deleteIdentityKeys(user.id);
    }, [user?.id]);

    return {
        encrypt, decrypt, encryptBinary, decryptBinary,
        encryptForGroup, decryptFromGroup, encryptBinaryForGroup, decryptBinaryFromGroup,
        distributeMySenderKey, prefetchGroupSenderKeys, invalidateGroupKeys,
        unlockWithPin, setupRecovery, resetToNewKeys,
        invalidatePeerKey,
        checkPeerHasV2,
        keysJustRotated: keysWereRotated,
        isReady, status,
        needsRecovery:      status === 'needs-recovery',
        needsRecoverySetup: status === 'needs-setup',
        keysDesynced:       status === 'keys-desynced',
        clearAllKeyMaterial,
    };
}

