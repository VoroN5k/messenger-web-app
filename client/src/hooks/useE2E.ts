'use client';

import { useAuthStore } from "@/src/store/useAuthStore";
import { useCallback, useEffect, useState } from "react";
import {
    decryptFile,
    decryptMessage,
    deriveSharedKey,
    encryptFile,
    encryptMessage,
    generateKeyPair,
    loadPrivateKey,
    loadPublicKey,
    savePrivateKey,
    savePublicKey,
    deletePrivateKey, decryptPrivateKeyWithPin, encryptPrivateKeyWithPin,
} from "@/src/lib/crypto";
import api from "@/src/lib/axios";

const IS_BROWSER = typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof indexedDB !== 'undefined';

// Module-level singletons
const sessionKeys  = new Map<number, CryptoKey>();
const pendingEcdh  = new Map<number, Promise<CryptoKey | null>>();

const sessionKeyTimes = new Map<number, number>();
const sessionKeyPubHash = new Map<number, string>();
const SESSION_KEY_TTL_MS = 5 * 60 * 1000;

let initGeneration = 0;

// Sender Key (GROUP)
// mySenderKeys:   convId → my own AES key for that group
// peerSenderKeys: `${convId}:${senderId}` → peer's AES key (already decrypted for us)
// pendingSender:  `${convId}:${senderId}` → in-flight fetch
const mySenderKeys   = new Map<number, CryptoKey>();
const peerSenderKeys = new Map<string, CryptoKey>();
const pendingSender  = new Map<string, Promise<CryptoKey | null>>();

// Bulk fetch state: set of convIds whose keys have been loaded for this session
const prefetchedConvs = new Set<number>();

let   privateKey:  CryptoKey | null = null;
let   initialized  = false;
let   initPromise: Promise<void> | null = null;

// Recovery state
type E2EStatus = 'idle' | 'ready' | 'needs-recovery' | 'needs-setup' | 'keys-desynced';
let e2eStatus: E2EStatus = 'idle';
let keysWereRotated = false; // true when keys were regenerated this session (not loaded from storage)
let recoveryBlob: string | null = null;
let recoverySalt:     string | null = null;
let currentUserId:    number | null = null;

let onReadyCallbacks: Array<() => void> = [];
let statusCallbacks: Array<(s: E2EStatus) => void> = [];

function broadcastStatus(s: E2EStatus) {
    e2eStatus = s;
    statusCallbacks.forEach(cb => cb(s));
}

// Helpers
function bufToBase64url(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function base64urlToBuf(b64: string): ArrayBuffer {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    const raw    = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='));
    const buf    = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer as ArrayBuffer;
}

async function aesEncryptRaw(key: CryptoKey, data: Uint8Array): Promise<string> {
    const iv        = crypto.getRandomValues(new Uint8Array(12));
    const plainBuf  = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBuf);
    const combined  = new Uint8Array(12 + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), 12);
    return bufToBase64url(combined.buffer as ArrayBuffer);
}

async function aesDecryptRaw(key: CryptoKey, ciphertext: string): Promise<Uint8Array> {
    const combined  = new Uint8Array(base64urlToBuf(ciphertext));
    const iv        = new Uint8Array(combined.buffer.slice(0, 12));
    const data      = new Uint8Array(combined.buffer.slice(12));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new Uint8Array(decrypted);
}

async function generateAesKey(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey(
        'raw', raw,
        { name: 'AES-GCM' },
        true,  // exportable — щоб зашифрувати для інших
        ['encrypt', 'decrypt'],
    );
    return { key, raw };
}

// Hook
export function useE2E() {
    const { user, accessToken } = useAuthStore();
    const [isReady, setIsReady] = useState(initialized && !!privateKey);
    const [status, setStatus] = useState<E2EStatus>(e2eStatus)

    if(!IS_BROWSER) {
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
        }
    }

    useEffect(() => {
        if(e2eStatus !== 'idle') setStatus(e2eStatus);
        if (initialized && privateKey) setIsReady(true);

        const cb = (s: E2EStatus) => {
            setStatus(s);
            if (s === 'ready' || s === 'needs-setup' || s === 'keys-desynced') setIsReady(true);
        };
        statusCallbacks.push(cb);
        return () => { statusCallbacks = statusCallbacks.filter(x => x !== cb); };
    }, []);

    useEffect(() => {
        if (!user?.id || !accessToken) return;
        if (initialized && privateKey) return;
        if (initPromise) return;

        currentUserId = user.id;
        broadcastStatus('idle');

        initPromise = (async () => {
            const myGen = ++initGeneration;
            try {
                let privKey = await loadPrivateKey(user.id);

                if (myGen !== initGeneration) { initPromise = null; return; }

                if (!privKey) {
                    // No local private key — check recovery first
                    try {
                        const { data } = await api.get('/keys/recovery/me');
                        recoveryBlob = data.encryptedBlob;
                        recoverySalt = data.salt;
                        broadcastStatus('needs-recovery');
                        return;
                    } catch (err: unknown) {
                        const status = (err as { response?: { status?: number } })?.response?.status;
                        if (status === 404) {
                            // Truly first setup — generate and publish
                            const { publicKey, privateKey: newPriv } = await generateKeyPair();
                            await savePrivateKey(user.id, newPriv);
                            await savePublicKey(user.id, publicKey);
                            privKey = newPriv;
                            await api.post('/keys', { publicKey });
                            keysWereRotated = true;
                            broadcastStatus('needs-setup');
                        } else {
                            // Network error or other transient issue — never generate new keys
                            console.error('[E2E] Cannot check recovery (network?). Will retry on next load.', err);
                            initPromise = null;
                            return;
                        }
                    }
                } else {
                    // Have local private key — check recovery setup
                    try {
                        await api.get('/keys/recovery/me');
                    } catch {
                        broadcastStatus('needs-setup');
                    }

                    // Verify server has our public key and it matches local
                    try {
                        const { data: serverKey } = await api.get(`/keys/${user.id}`);
                        const localPubKey = await loadPublicKey(user.id);
                        if (localPubKey && serverKey.publicKey !== localPubKey) {
                            // Keys desynced — never auto-regenerate, show warning
                            console.warn('[E2E] Local public key differs from server. Keys desynced!');
                            broadcastStatus('keys-desynced');
                        }
                    } catch (err: unknown) {
                        const status = (err as { response?: { status?: number } })?.response?.status;
                        if (status === 404) {
                            // Server lost our public key — try to re-publish existing one
                            const localPubKey = await loadPublicKey(user.id);
                            if (localPubKey) {
                                try {
                                    await api.post('/keys', { publicKey: localPubKey });
                                    console.info('[E2E] Re-published public key to server');
                                } catch (pubErr) {
                                    console.error('[E2E] Failed to re-publish public key:', pubErr);
                                }
                            } else {
                                // Old device: private key exists but public key was never cached locally
                                console.warn('[E2E] Server key missing and no local public key stored. Reset PIN to recover.');
                                broadcastStatus('keys-desynced');
                            }
                        }
                        // else: network error — continue with local key, don't block
                    }
                }

                if (myGen !== initGeneration) { initPromise = null; return; }

                privateKey  = privKey!;
                initialized = true;

                if (e2eStatus !== 'needs-setup' && e2eStatus !== 'keys-desynced') {
                    broadcastStatus('ready');
                }

                onReadyCallbacks.forEach(cb => cb());
                onReadyCallbacks = [];
            } catch (error) {
                console.error('[E2E] Критична помилка ініціалізації:', error);
            } finally {
                initPromise = null;
            }
        })();
    }, [user?.id, accessToken]);

    useEffect(() => {
        if (!user?.id) {
            privateKey       = null;
            initialized      = false;
            initPromise      = null;
            recoveryBlob     = null;
            recoverySalt     = null;
            currentUserId    = null;
            keysWereRotated  = false;
            sessionKeys.clear();
            pendingEcdh.clear();
            sessionKeyTimes.clear();
            sessionKeyPubHash.clear();
            mySenderKeys.clear();
            peerSenderKeys.clear();
            pendingSender.clear();
            prefetchedConvs.clear();
            onReadyCallbacks = [];
            broadcastStatus('idle');
            setIsReady(false);
        }
    }, [user?.id]);

    const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
        if (!recoveryBlob || !recoverySalt || !currentUserId) return false;
        try {
            const privKey = await decryptPrivateKeyWithPin(recoveryBlob, recoverySalt, pin);
            await savePrivateKey(currentUserId, privKey);
            // Cache server's public key locally so we can re-publish if server loses it
            try {
                const { data } = await api.get(`/keys/${currentUserId}`);
                await savePublicKey(currentUserId, data.publicKey);
            } catch {
                // Non-critical — will be resolved on next init check
            }
            privateKey  = privKey;
            initialized = true;
            recoveryBlob  = null;
            recoverySalt  = null;
            broadcastStatus('ready');
            onReadyCallbacks.forEach(cb => cb());
            onReadyCallbacks = [];
            return true;
        } catch {
            return false; // Wrong PIN — AES-GCM auth tag mismatch
        }
    }, []);

    const setupRecovery = useCallback(async (
        pin: string,
        options?: { isReset?: boolean; twoFactorCode?: string }
    ): Promise<void> => {
        if (!privateKey || !initialized) throw new Error('E2E not initialized');
        const { encryptedBlob, salt } = await encryptPrivateKeyWithPin(privateKey, pin);
        await api.post('/keys/recovery', {
            encryptedBlob,
            salt,
            isReset:      options?.isReset      ?? false,
            twoFactorCode: options?.twoFactorCode,
        });
        broadcastStatus('ready');
    }, []);

    const resetToNewKeys = useCallback(async (): Promise<void> => {
        const myUserId = useAuthStore.getState().user?.id;
        if (!myUserId) throw new Error('Not authenticated');

        initGeneration++;
        initPromise = null;

        // Clear all existing key material (both in-memory and on-disk)
        sessionKeys.clear();
        pendingEcdh.clear();
        sessionKeyTimes.clear();
        sessionKeyPubHash.clear();
        mySenderKeys.clear();
        peerSenderKeys.clear();
        pendingSender.clear();
        prefetchedConvs.clear();

        const { publicKey, privateKey: newPriv } = await generateKeyPair();

        await savePrivateKey(myUserId, newPriv);
        await savePublicKey(myUserId, publicKey);

        try {
            await api.post('/keys', { publicKey });
        } catch (e) {
            console.error('[E2E] resetToNewKeys: не вдалося опублікувати публічний ключ', e);
            throw new Error('Не вдалося опублікувати новий публічний ключ');
        }

        // Видаляємо застарілі GroupSenderKey (зашифровані старим ECDH-ключем).
        // Після цього peers отримають запит на перерозподіл при наступному відкритті групи.
        try {
            await api.delete('/conversations/sender-keys/mine-all');
        } catch (e) {
            console.warn('[E2E] resetToNewKeys: не вдалося видалити старі sender keys', e);
        }

        privateKey  = newPriv;
        initialized = true;
        keysWereRotated = true;

        broadcastStatus('needs-setup');
    }, [])

    // ECDH session key (DIRECT)
    const getSessionKey = useCallback(async (
        targetUserId: number,
        forceRefresh = false,   // ← NEW parameter
    ): Promise<CryptoKey | null> => {
        if (!privateKey || !initialized) return null;
        if (!useAuthStore.getState().accessToken) return null;

        if (!forceRefresh) {
            const cached = sessionKeys.get(targetUserId);
            const ts     = sessionKeyTimes.get(targetUserId) ?? 0;
            // Повертаємо кеш тільки якщо він свіжий
            if (cached && Date.now() - ts < SESSION_KEY_TTL_MS) return cached;
        }

        // Застарілий або примусовий рефреш — видаляємо
        sessionKeys.delete(targetUserId);
        sessionKeyTimes.delete(targetUserId);

        const inflight = pendingEcdh.get(targetUserId);
        if (inflight) return inflight;

        const promise = (async () => {
            try {
                const { data } = await api.get(`/keys/${targetUserId}`, {
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                });

                // Виявляємо ротацію ключа: якщо publicKey змінився — чистимо
                // зашифровані sender-ключі груп (вони тепер нечитабельні)
                const prevHash = sessionKeyPubHash.get(targetUserId);
                const newHash  = data.publicKey as string;
                if (prevHash && prevHash !== newHash) {
                    for (const k of peerSenderKeys.keys()) {
                        if (k.endsWith(`:${targetUserId}`)) peerSenderKeys.delete(k);
                    }
                    prefetchedConvs.clear(); // перечитати sender-ключі груп
                }

                const aesKey = await deriveSharedKey(privateKey!, newHash);
                sessionKeys.set(targetUserId, aesKey);
                sessionKeyTimes.set(targetUserId, Date.now());
                sessionKeyPubHash.set(targetUserId, newHash);
                return aesKey;
            } catch {
                return null;
            } finally {
                pendingEcdh.delete(targetUserId);
            }
        })();

        pendingEcdh.set(targetUserId, promise);
        return promise;
    }, []);

    // DIRECT encrypt / decrypt
    const encrypt = useCallback(async (content: string, targetUserId: number): Promise<string> => {
        const key = await getSessionKey(targetUserId);
        if (!key) return content;
        return encryptMessage(key, content);
    }, [getSessionKey]);

    const decrypt = useCallback(async (ciphertext: string, senderUserId: number): Promise<string> => {
        const key = await getSessionKey(senderUserId);
        if (!key) return ciphertext;
        try {
            return await decryptMessage(key, ciphertext);
        } catch {

            try {
                const freshKey = await getSessionKey(senderUserId, true /* forceRefresh */);
                if (!freshKey) return '[🔒 Не вдалося розшифрувати]';
                return await decryptMessage(freshKey, ciphertext);
            } catch {
                return '[🔒 Не вдалося розшифрувати]';
            }
        }
    }, [getSessionKey]);

    const encryptBinary = useCallback(async (data: ArrayBuffer, targetUserId: number): Promise<ArrayBuffer> => {
        const key = await getSessionKey(targetUserId);
        if (!key) return data;
        return encryptFile(key, data);
    }, [getSessionKey]);

    const decryptBinary = useCallback(async (data: ArrayBuffer, peerUserId: number): Promise<ArrayBuffer> => {
        const key = await getSessionKey(peerUserId);
        if (!key) return data;
        try {
            return await decryptFile(key, data);
        } catch {
            try {
                const freshKey = await getSessionKey(peerUserId, true);
                if (!freshKey) return data;
                return await decryptFile(freshKey, data);
            } catch {
                return data;
            }
        }
    }, [getSessionKey]);

    // GROUP: отримати/закешувати peer sender key
    // Ключ senderId-а, зашифрований для нас. Потрібно розшифрувати через ECDH з senderId.
    const getPeerSenderKey = useCallback(async (
        conversationId: number,
        senderId: number,
        forceRefresh = false,
    ): Promise<CryptoKey | null> => {
        const cacheKey = `${conversationId}:${senderId}`;

        if(!forceRefresh) {
            const cached = peerSenderKeys.get(cacheKey);
            if (cached) return cached;
        } else {
            peerSenderKeys.delete(cacheKey);
            pendingSender.delete(cacheKey);
            prefetchedConvs.delete(conversationId);
        }

        const inflight = pendingSender.get(cacheKey);
        if (inflight) return inflight;

        const promise = (async () => {
            try {
                // Завантажуємо всі sender keys для нас в цій групі (один запит = всі учасники)
                const { data } = await api.get<{ senderId: number; encryptedKey: string }[]>(
                    `/conversations/${conversationId}/sender-keys/for-me`,
                );

                // Декриптуємо і кешуємо всі одночасно
                await Promise.all(
                    data.map(async ({ senderId: sid, encryptedKey }) => {
                        const k = `${conversationId}:${sid}`;
                        if (peerSenderKeys.has(k)) return;
                        try {
                            const sessionKey = await getSessionKey(sid);
                            if (!sessionKey) return;
                            const rawKey = await aesDecryptRaw(sessionKey, encryptedKey);
                            const aesKey = await crypto.subtle.importKey(
                                'raw',
                                rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer,
                                { name: 'AES-GCM' },
                                false,
                                ['encrypt', 'decrypt'],
                            );
                            peerSenderKeys.set(k, aesKey);
                        } catch {}
                    }),
                );

                return peerSenderKeys.get(cacheKey) ?? null;
            } catch {
                return null;
            } finally {
                pendingSender.delete(cacheKey);
            }
        })();

        pendingSender.set(cacheKey, promise);
        return promise;
    }, [getSessionKey]);

    // GROUP: отримати мій власний sender key
    // Якщо ще не існує — генеруємо і розповсюджуємо по всіх учасниках групи.
    const getOrCreateMySenderKey = useCallback(async (
        conversationId: number,
    ): Promise<CryptoKey | null> => {
        const cached = mySenderKeys.get(conversationId);
        if (cached) return cached;

        const myUserId = useAuthStore.getState().user?.id;
        if (!myUserId) return null;

        // Спочатку пробуємо завантажити з сервера (ключ може вже існувати на іншому пристрої)
        try {
            const { data } = await api.get<{ senderId: number; encryptedKey: string }[]>(
                `/conversations/${conversationId}/sender-keys/for-me`,
            );
            const myEntry = data.find(k => k.senderId === myUserId);

            if (myEntry) {
                // Мій ключ вже є на сервері — розшифровуємо його (зашифрований для нас нами ж)
                const selfSessionKey = await getSessionKey(myUserId);
                if (!selfSessionKey) return null;
                const rawKey = await aesDecryptRaw(selfSessionKey, myEntry.encryptedKey);
                const aesKey = await crypto.subtle.importKey(
                    'raw',
                    rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer,
                    { name: 'AES-GCM' },
                    false,
                    ['encrypt', 'decrypt'],
                );
                mySenderKeys.set(conversationId, aesKey);
                return aesKey;
            }
        } catch {}


        return null;
    }, [getSessionKey]);

    // GROUP: згенерувати і розповсюдити мій sender key
    // Викликається: при вході в групу вперше, або при ротації (після зміни учасників).
    const distributeMySenderKey = useCallback(async (
        conversationId: number,
        memberUserIds: number[], // всі учасники включаючи мене
    ): Promise<void> => {
        if (!privateKey || !initialized) return;

        const myUserId = useAuthStore.getState().user?.id;
        if (!myUserId) return;

        const { key, raw } = await generateAesKey();
        mySenderKeys.set(conversationId, key);

        // Шифруємо мій AES ключ для кожного учасника через ECDH
        const encryptedKeys: Array<{ recipientId: number; encryptedKey: string }> = [];

        await Promise.all(
            memberUserIds.map(async (memberId) => {
                try {
                    const sessionKey = await getSessionKey(memberId);
                    if (!sessionKey) {
                        console.warn(`[E2E] No ECDH key for member ${memberId}, skipping`);
                        return;
                    }
                    const encryptedKey = await aesEncryptRaw(sessionKey, raw);
                    encryptedKeys.push({ recipientId: memberId, encryptedKey });
                } catch (err) {
                    console.warn(`[E2E] Failed to encrypt sender key for user ${memberId}:`, err);
                }
            }),
        );

        if (!encryptedKeys.length) return;

        await api.post(`/conversations/${conversationId}/sender-keys`, { keys: encryptedKeys });
        console.log(`[E2E] Sender key distributed to ${encryptedKeys.length} members in conv ${conversationId}`);
    }, [getSessionKey]);

    // GROUP: prefetch всіх ключів при відкритті групи
    // Завантажує всі sender keys учасників одним запитом і кешує.
    const prefetchGroupSenderKeys = useCallback(async (
        conversationId: number,
        memberUserIds: number[],
        socket?: { emit: (event: string, data: unknown) => void } | null,
    ): Promise<void> => {
        if (prefetchedConvs.has(conversationId)) return;
        prefetchedConvs.add(conversationId);

        const myUserId = useAuthStore.getState().user?.id;
        if (!myUserId) return;

        try {
            const {data} = await api.get<{ senderId: number; encryptedKey: string }[]>(
                `/conversations/${conversationId}/sender-keys/for-me`,
            );

            let hasMySenderKey = false;
            let decryptFailCount = 0;
            // Tracks whether own key failed because AES-GCM tag mismatched (genuine wrong key)
            // vs getSessionKey returned null (transient network error).
            // Only redistribute when genuinely wrong — a transient error must never generate a new key
            // because that permanently breaks old message history.
            let myKeyGenuinelyBroken = false;

            const tryDecrypt = async (senderId: number, encryptedKey: string, forceRefresh = false) => {
                const cacheKey = `${conversationId}:${senderId}`;
                if (peerSenderKeys.has(cacheKey)) return true;
                const sessionKey = await getSessionKey(senderId, forceRefresh);
                if (!sessionKey) return false; // transient — no session key available
                const rawKey = await aesDecryptRaw(sessionKey, encryptedKey); // throws on wrong key
                const aesKey = await crypto.subtle.importKey(
                    'raw',
                    rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer,
                    { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
                );
                peerSenderKeys.set(cacheKey, aesKey);
                if (senderId === myUserId) {
                    mySenderKeys.set(conversationId, aesKey);
                    hasMySenderKey = true;
                }
                return true;
            };

            await Promise.all(
                data.map(async ({ senderId, encryptedKey }) => {
                    try {
                        const ok = await tryDecrypt(senderId, encryptedKey);
                        if (!ok) decryptFailCount++;
                    } catch {
                        // AES-GCM auth tag mismatch — session key was valid but key is wrong
                        decryptFailCount++;
                        if (senderId === myUserId) myKeyGenuinelyBroken = true;
                    }
                }),
            );

            // Retry with force-refresh for keys that failed
            if (decryptFailCount > 0) {
                await Promise.all(
                    data.map(async ({ senderId, encryptedKey }) => {
                        if (peerSenderKeys.has(`${conversationId}:${senderId}`)) return;
                        try {
                            const ok = await tryDecrypt(senderId, encryptedKey, true);
                            if (!ok) return;
                            if (senderId === myUserId) myKeyGenuinelyBroken = false;
                        } catch {
                            // Still failing with a fresh session key → key is genuinely wrong
                            if (senderId === myUserId) myKeyGenuinelyBroken = true;
                        }
                    }),
                );

                // Request redistribution for peers whose keys are still undecryptable.
                // Remove from prefetchedConvs so we re-fetch after they respond.
                if (socket) {
                    let requestedRedistribution = false;
                    for (const { senderId } of data) {
                        if (senderId === myUserId) continue;
                        if (!peerSenderKeys.has(`${conversationId}:${senderId}`)) {
                            socket.emit('requestSenderKeyRedistribution', { conversationId, targetUserId: senderId });
                            requestedRedistribution = true;
                        }
                    }
                    if (requestedRedistribution) {
                        // Allow re-prefetch after the peer has had time to redistribute
                        prefetchedConvs.delete(conversationId);
                    }
                }
            }

            const mySenderKeyExistsOnServer = data.some(({ senderId }) => senderId === myUserId);

            if (!hasMySenderKey && !mySenderKeyExistsOnServer) {
                // No key at all — first entry into group or new member
                await distributeMySenderKey(conversationId, memberUserIds);
            } else if (!hasMySenderKey && mySenderKeyExistsOnServer) {
                if (myKeyGenuinelyBroken) {
                    // Have a session key but AES-GCM still fails → key on server is wrong → redistribute
                    console.warn(`[E2E] Own sender key genuinely broken for conv ${conversationId}, redistributing`);
                    await distributeMySenderKey(conversationId, memberUserIds);
                } else {
                    // Session key was unavailable (transient network error) → do NOT redistribute
                    // Allow retry on next open
                    console.warn(`[E2E] Own sender key: session key unavailable (transient), will retry next open`);
                    prefetchedConvs.delete(conversationId);
                }
            }
        } catch (err) {
            console.warn(`[E2E] prefetchGroupSenderKeys failed for conv ${conversationId}:`, err);
            prefetchedConvs.delete(conversationId); // retry on next open
        }
    }, [getSessionKey, distributeMySenderKey]);

    // GROUP encrypt / decrypt (text)
    const encryptForGroup = useCallback(async (
        content: string,
        conversationId: number,
    ): Promise<string> => {
        let key = mySenderKeys.get(conversationId);
        if (!key) {
            key = await getOrCreateMySenderKey(conversationId) ?? undefined;
        }
        if (!key) return content;
        return encryptMessage(key, content);
    }, [getOrCreateMySenderKey]);

    // senderId тепер обов'язковий — кожен учасник шифрує своїм ключем
    const decryptFromGroup = useCallback(async (
        ciphertext: string,
        conversationId: number,
        senderId: number,
    ): Promise<string> => {
        const myUserId = useAuthStore.getState().user?.id;

        // Якщо це моє повідомлення — беремо мій sender key
        if (senderId === myUserId) {
            let key = mySenderKeys.get(conversationId);
            if (!key) {
                // Cache miss — try to load from server (e.g. after page reload before prefetch)
                key = await getOrCreateMySenderKey(conversationId) ?? undefined;
            }
            if (!key) return ciphertext;
            try { return await decryptMessage(key, ciphertext); }
            catch { return '[🔒 Не вдалося розшифрувати]'; }
        }

        // Чуже повідомлення — беремо ключ відправника
        const key = await getPeerSenderKey(conversationId, senderId);
        if (!key) {
            // Sender key не знайдено — спробуємо force-refresh
            const freshKey = await getPeerSenderKey(conversationId, senderId, true);
            if (!freshKey) return ciphertext; // тримаємо ciphertext (не вічне повідомлення про помилку)
            try { return await decryptMessage(freshKey, ciphertext); }
            catch { return '[🔒 Не вдалося розшифрувати]'; }
        }

        try { return await decryptMessage(key, ciphertext); }
        catch {
            try {
                const freshKey = await getPeerSenderKey(conversationId, senderId, true);
                if (!freshKey) return '[🔒 Не вдалося розшифрувати]';
                return await decryptMessage(freshKey, ciphertext);
            } catch {
                return '[🔒 Не вдалося розшифрувати]';
            }
        }
    }, [getPeerSenderKey]);

    // GROUP encrypt / decrypt (binary files / voice)
    const encryptBinaryForGroup = useCallback(async (
        data: ArrayBuffer,
        conversationId: number,
        memberIds?: number[],
    ): Promise<ArrayBuffer> => {
        let key = mySenderKeys.get(conversationId);
        if (!key) {
            key = await getOrCreateMySenderKey(conversationId) ?? undefined;
        }

        if (!key && memberIds?.length) {
            await distributeMySenderKey(conversationId, memberIds);
            key = mySenderKeys.get(conversationId);
        }

        if (!key) {
            console.error('[E2E] No sender key for group', conversationId);
            return data;
        }

        return encryptFile(key, data);
    }, [getOrCreateMySenderKey, distributeMySenderKey]);

    const decryptBinaryFromGroup = useCallback(async (
        data: ArrayBuffer,
        conversationId: number,
        senderId: number,
    ): Promise<ArrayBuffer> => {
        const myUserId = useAuthStore.getState().user?.id;

        let key = senderId === myUserId
            ? mySenderKeys.get(conversationId)
            : await getPeerSenderKey(conversationId, senderId);

        if (!key && senderId === myUserId) {
            key = await getOrCreateMySenderKey(conversationId) ?? undefined;
        }

        if (!key) return data;
        try { return await decryptFile(key, data); }
        catch { return data; }
    }, [getPeerSenderKey, getOrCreateMySenderKey]);

    // Invalidate session key for a specific peer (call on peerKeyRotated socket event)
    const invalidatePeerKey = useCallback((userId: number) => {
        sessionKeys.delete(userId);
        sessionKeyTimes.delete(userId);
        sessionKeyPubHash.delete(userId);
        // Also clear any sender keys encrypted by this peer
        for (const k of peerSenderKeys.keys()) {
            if (k.endsWith(`:${userId}`)) peerSenderKeys.delete(k);
        }
        prefetchedConvs.clear();
    }, []);

    // Invalidate sender key cache (після зміни учасників)
    const invalidateGroupKeys = useCallback((conversationId: number) => {
        mySenderKeys.delete(conversationId);
        prefetchedConvs.delete(conversationId);
        // Чистимо peer keys для цієї групи
        for (const k of peerSenderKeys.keys()) {
            if (k.startsWith(`${conversationId}:`)) peerSenderKeys.delete(k);
        }
        for (const k of pendingSender.keys()) {
            if (k.startsWith(`${conversationId}:`)) pendingSender.delete(k);
        }
    }, []);

    return {
        // DIRECT
        encrypt, decrypt, encryptBinary, decryptBinary,
        // GROUP
        encryptForGroup, decryptFromGroup,
        encryptBinaryForGroup, decryptBinaryFromGroup,
        distributeMySenderKey, prefetchGroupSenderKeys, invalidateGroupKeys,
        // Recovery
        unlockWithPin,
        setupRecovery,
        resetToNewKeys,
        // Peer key rotation
        invalidatePeerKey,
        keysJustRotated: keysWereRotated,
        // Meta
        isReady,
        status,
        needsRecovery:      status === 'needs-recovery',
        needsRecoverySetup: status === 'needs-setup',
        keysDesynced:       status === 'keys-desynced',
        clearAllKeyMaterial: () => user?.id ? deletePrivateKey(user.id) : Promise.resolve(),
    };
}