import { useAuthStore } from "@/src/store/useAuthStore";
import { useCallback, useEffect } from "react";
import {
    decryptMessage, deriveSharedKey, encryptMessage,
    generateKeyPair, loadPrivateKey, savePrivateKey,
} from "@/src/lib/crypto";
import api from "@/src/lib/axios";

// ── Module-level singletons (shared across all useE2E() calls) ───────────────
const sessionKeys  = new Map<number, CryptoKey>();
const pendingKeys = new Map<number, Promise<CryptoKey | null>>();
let   privateKey:  CryptoKey | null = null;
let   initialized  = false;
let   initPromise: Promise<void> | null = null;

const RETRY_AFTER_MS = 30_000; // If key fetch fails, retry after 30s

export function useE2E() {
    const { user, accessToken } = useAuthStore();

    useEffect(() => {
        if (!user?.id || !accessToken) return;

        // Already initialized for this user — skip
        if (initialized && privateKey) return;

        // Deduplicate concurrent init calls
        if (initPromise) return;

        initPromise = (async () => {
            try {
                let privKey = await loadPrivateKey(user.id);

                if (!privKey) {
                    const { publicKey, privateKey: newPriv } = await generateKeyPair();
                    await savePrivateKey(user.id, newPriv);
                    privKey = newPriv;
                    await api.post('/keys', { publicKey });
                    console.log('[E2E] New keypair generated and published');
                } else {
                    try {
                        await api.get(`/keys/${user.id}`);
                        console.log('[E2E] Public key already on server');
                    } catch {
                        console.warn('[E2E] Key missing on server, republishing...');
                        const { publicKey, privateKey: newPriv } = await generateKeyPair();
                        await savePrivateKey(user.id, newPriv);
                        privKey = newPriv;
                        await api.post('/keys', { publicKey });
                        console.log('[E2E] Keypair regenerated and published');
                    }
                }

                privateKey  = privKey;
                initialized = true;
                // Clear stale cache so peer keys are re-fetched
                sessionKeys.clear();
                pendingKeys.clear();
            } finally {
                initPromise = null;
            }
        })();
    }, [user?.id, accessToken]);

    // Reset singletons on logout
    useEffect(() => {
        if (!user?.id) {
            privateKey  = null;
            initialized = false;
            initPromise = null;
            sessionKeys.clear();
            pendingKeys.clear();
        }
    }, [user?.id]);

    const getSessionKey = useCallback(async (targetUserId: number): Promise<CryptoKey | null> => {
        if (!privateKey || !initialized) return null;
        if (!useAuthStore.getState().accessToken) return null;

        const cached = sessionKeys.get(targetUserId);
        if (cached) return cached;

        const inflight = pendingKeys.get(targetUserId);
        if (inflight) return inflight;

        const promise = (async () => {
            try {
                const { data } = await api.get(`/keys/${targetUserId}`);
                const aesKey = await deriveSharedKey(privateKey!, data.publicKey);
                sessionKeys.set(targetUserId, aesKey);
                return aesKey;
            } catch {
                console.warn(`[E2E] No public key for user ${targetUserId}`);
                return null;
            } finally {
                pendingKeys.delete(targetUserId);
            }
    })();

        pendingKeys.set(targetUserId, promise);
        return promise;
    }, []);

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
            return '[🔒 Не вдалося розшифрувати]';
        }
    }, [getSessionKey]);

    return { encrypt, decrypt };
}