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
    savePrivateKey,
} from "@/src/lib/crypto";
import api from "@/src/lib/axios";

// ── Module-level singletons ───────────────────────────────────────────────────
const sessionKeys  = new Map<number, CryptoKey>();          // userId = shared ECDH key
const pendingKeys  = new Map<number, Promise<CryptoKey | null>>();
const groupKeys    = new Map<number, CryptoKey>();          // conversationId = group AES key
const pendingGroup = new Map<number, Promise<CryptoKey | null>>();

let   privateKey:  CryptoKey | null = null;
let   initialized  = false;
let   initPromise: Promise<void> | null = null;
let   onReadyCallbacks: Array<() => void> = [];

// ── Helpers (module-level, no React deps) ─────────────────────────────────────
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

// Encrypt arbitrary bytes with an AES-GCM key → base64url string
async function aesEncryptRaw(key: CryptoKey, data: Uint8Array): Promise<string> {
    const iv        = crypto.getRandomValues(new Uint8Array(12));
    // Копіюємо data в чистий ArrayBuffer щоб WebCrypto не скаржився
    const plainBuf  = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBuf);
    const combined  = new Uint8Array(12 + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), 12);
    return bufToBase64url(combined.buffer as ArrayBuffer);
}

// Decrypt base64url string with AES-GCM key → raw bytes
async function aesDecryptRaw(key: CryptoKey, ciphertext: string): Promise<Uint8Array> {
    const combined  = new Uint8Array(base64urlToBuf(ciphertext));
    const iv        = new Uint8Array(combined.buffer.slice(0, 12));
    const data      = new Uint8Array(combined.buffer.slice(12));
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data,
    );
    return new Uint8Array(decrypted);
}

// ─────────────────────────────────────────────────────────────────────────────
export function useE2E() {
    const { user, accessToken } = useAuthStore();
    const [isReady, setIsReady] = useState(initialized && !!privateKey);

    useEffect(() => {
        if (initialized && privateKey) { setIsReady(true); return; }
        const cb = () => setIsReady(true);
        onReadyCallbacks.push(cb);
        return () => { onReadyCallbacks = onReadyCallbacks.filter(x => x !== cb); };
    }, []);

    useEffect(() => {
        if (!user?.id || !accessToken) return;
        if (initialized && privateKey) return;
        if (initPromise) return;

        initPromise = (async () => {
            try {
                let privKey = await loadPrivateKey(user.id);
                if (!privKey) {
                    const { publicKey, privateKey: newPriv } = await generateKeyPair();
                    await savePrivateKey(user.id, newPriv);
                    privKey = newPriv;
                    await api.post('/keys', { publicKey });
                } else {
                    try {
                        await api.get(`/keys/${user.id}`);
                    } catch {
                        const { publicKey, privateKey: newPriv } = await generateKeyPair();
                        await savePrivateKey(user.id, newPriv);
                        privKey = newPriv;
                        await api.post('/keys', { publicKey });
                    }
                }
                privateKey  = privKey;
                initialized = true;
                sessionKeys.clear();
                pendingKeys.clear();
                groupKeys.clear();
                pendingGroup.clear();
                onReadyCallbacks.forEach(cb => cb());
                onReadyCallbacks = [];
            } finally {
                initPromise = null;
            }
        })();
    }, [user?.id, accessToken]);

    useEffect(() => {
        if (!user?.id) {
            privateKey  = null;
            initialized = false;
            initPromise = null;
            sessionKeys.clear();
            pendingKeys.clear();
            groupKeys.clear();
            pendingGroup.clear();
            onReadyCallbacks = [];
            setIsReady(false);
        }
    }, [user?.id]);

    // ── ECDH session key (DIRECT) ─────────────────────────────────────────────
    const getSessionKey = useCallback(async (targetUserId: number): Promise<CryptoKey | null> => {
        if (!privateKey || !initialized) return null;
        if (!useAuthStore.getState().accessToken) return null;

        const cached = sessionKeys.get(targetUserId);
        if (cached) return cached;
        const inflight = pendingKeys.get(targetUserId);
        if (inflight) return inflight;

        const promise = (async () => {
            try {
                const { data } = await api.get(`/keys/${targetUserId}`, {
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                });
                const aesKey = await deriveSharedKey(privateKey!, data.publicKey);
                sessionKeys.set(targetUserId, aesKey);
                return aesKey;
            } catch {
                return null;
            } finally {
                pendingKeys.delete(targetUserId);
            }
        })();

        pendingKeys.set(targetUserId, promise);
        return promise;
    }, []);

    // ── DIRECT encrypt/decrypt ────────────────────────────────────────────────
    const encrypt = useCallback(async (content: string, targetUserId: number): Promise<string> => {
        const key = await getSessionKey(targetUserId);
        if (!key) return content;
        return encryptMessage(key, content);
    }, [getSessionKey]);

    const decrypt = useCallback(async (ciphertext: string, senderUserId: number): Promise<string> => {
        const key = await getSessionKey(senderUserId);
        if (!key) return ciphertext;
        try { return await decryptMessage(key, ciphertext); }
        catch { return '[🔒 Не вдалося розшифрувати]'; }
    }, [getSessionKey]);

    const encryptBinary = useCallback(async (data: ArrayBuffer, targetUserId: number): Promise<ArrayBuffer> => {
        const key = await getSessionKey(targetUserId);
        if (!key) return data;
        return encryptFile(key, data);
    }, [getSessionKey]);

    const decryptBinary = useCallback(async (data: ArrayBuffer, peerUserId: number): Promise<ArrayBuffer> => {
        const key = await getSessionKey(peerUserId);
        if (!key) return data;
        try { return await decryptFile(key, data); }
        catch { return data; }
    }, [getSessionKey]);

    // ── GROUP: отримати/закешувати груповий AES-ключ ──────────────────────────
    const getOrFetchGroupKey = useCallback(async (conversationId: number): Promise<CryptoKey | null> => {
        if (!privateKey || !initialized) return null;

        const cached = groupKeys.get(conversationId);
        if (cached) return cached;
        const inflight = pendingGroup.get(conversationId);
        if (inflight) return inflight;

        const promise = (async () => {
            try {
                const { data } = await api.get(`/conversations/${conversationId}/group-keys/me`);
                if (!data) return null; // ключ ще не розповсюджено

                // Розшифровуємо груповий ключ через ECDH shared key з creatorId
                const sessionKey = await getSessionKey(data.creatorId);
                if (!sessionKey) return null;

                const rawGroupKey = await aesDecryptRaw(sessionKey, data.encryptedKey);
                const groupKey    = await crypto.subtle.importKey(
                    'raw',
                    rawGroupKey.buffer.slice(rawGroupKey.byteOffset, rawGroupKey.byteOffset + rawGroupKey.byteLength) as ArrayBuffer,
                    { name: 'AES-GCM' },
                    false,
                    ['encrypt', 'decrypt'],
                );
                groupKeys.set(conversationId, groupKey);
                return groupKey;
            } catch (err) {
                console.warn(`[E2E] getOrFetchGroupKey failed for conv ${conversationId}:`, err);
                return null;
            } finally {
                pendingGroup.delete(conversationId);
            }
        })();

        pendingGroup.set(conversationId, promise);
        return promise;
    }, [getSessionKey]);

    // ── GROUP: генерувати та розповсюджувати груповий ключ ────────────────────
    // Викликається після створення групи або додавання нових учасників.
    // memberUserIds — масив userId всіх учасників (включаючи поточного юзера)
    const createAndDistributeGroupKey = useCallback(async (
        conversationId: number,
        memberUserIds:  number[],
    ): Promise<void> => {
        if (!privateKey || !initialized) return;

        // Генеруємо випадковий 32-байтовий груповий ключ
        const rawGroupKey = crypto.getRandomValues(new Uint8Array(32));
        const groupKey    = await crypto.subtle.importKey(
            'raw', rawGroupKey,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt'],
        );

        // Кешуємо одразу
        groupKeys.set(conversationId, groupKey);

        // Для кожного учасника: шифруємо груповий ключ через ECDH
        const encryptedKeys: Array<{ userId: number; encryptedKey: string }> = [];

        await Promise.all(
            memberUserIds.map(async (memberId) => {
                try {
                    const sessionKey = await getSessionKey(memberId);
                    if (!sessionKey) {
                        console.warn(`[E2E] No public key for member ${memberId}, skipping`);
                        return;
                    }
                    const encryptedKey = await aesEncryptRaw(sessionKey, rawGroupKey);
                    encryptedKeys.push({ userId: memberId, encryptedKey });
                } catch (err) {
                    console.warn(`[E2E] Failed to encrypt group key for user ${memberId}:`, err);
                }
            }),
        );

        if (!encryptedKeys.length) return;

        await api.post(`/conversations/${conversationId}/group-keys`, { keys: encryptedKeys });
        console.log(`[E2E] Group key distributed to ${encryptedKeys.length} members`);
    }, [getSessionKey]);

    // ── Invalidate group key cache (після зміни учасників) ───────────────────
    const invalidateGroupKey = useCallback((conversationId: number) => {
        groupKeys.delete(conversationId);
        pendingGroup.delete(conversationId);
    }, []);

    // ── GROUP encrypt/decrypt ─────────────────────────────────────────────────
    const encryptForGroup = useCallback(async (content: string, conversationId: number): Promise<string> => {
        const key = await getOrFetchGroupKey(conversationId);
        if (!key) return content; // fallback: plaintext (ключ ще не розповсюджено)
        return encryptMessage(key, content);
    }, [getOrFetchGroupKey]);

    const decryptFromGroup = useCallback(async (ciphertext: string, conversationId: number): Promise<string> => {
        const key = await getOrFetchGroupKey(conversationId);
        if (!key) return ciphertext;
        try { return await decryptMessage(key, ciphertext); }
        catch { return '[🔒 Не вдалося розшифрувати]'; }
    }, [getOrFetchGroupKey]);

    const encryptBinaryForGroup = useCallback(async (data: ArrayBuffer, conversationId: number): Promise<ArrayBuffer> => {
        const key = await getOrFetchGroupKey(conversationId);
        if (!key) return data;
        return encryptFile(key, data);
    }, [getOrFetchGroupKey]);

    const decryptBinaryFromGroup = useCallback(async (data: ArrayBuffer, conversationId: number): Promise<ArrayBuffer> => {
        const key = await getOrFetchGroupKey(conversationId);
        if (!key) return data;
        try { return await decryptFile(key, data); }
        catch { return data; }
    }, [getOrFetchGroupKey]);

    return {
        // DIRECT
        encrypt, decrypt, encryptBinary, decryptBinary,
        // GROUP
        encryptForGroup, decryptFromGroup,
        encryptBinaryForGroup, decryptBinaryFromGroup,
        createAndDistributeGroupKey, invalidateGroupKey,
        // meta
        isReady,
    };
}