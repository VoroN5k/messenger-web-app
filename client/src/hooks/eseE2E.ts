import {useAuthStore} from "@/src/store/useAuthStore";
import {useCallback, useEffect, useRef} from "react";
import {
    decryptMessage,
    deriveSharedKey,
    encryptMessage,
    generateKeyPair,
    loadPrivateKey,
    savePrivateKey
} from "@/src/lib/crypto";
import api from "@/src/lib/axios";

export function useE2E() {
    const { user } = useAuthStore();
    const sessionKeysRef = useRef<Map<number, CryptoKey>>(new Map());
    const failedKeysRef = useRef<Set<number>>(new Set()); // Кеш для користувачів, з якими не вдалося встановити сесію (відсутній публічний ключ)
    const privateKeyRef = useRef<CryptoKey | null>(null);

    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            let privKey = await loadPrivateKey(user.id);

            if (!privKey) {
                const { publicKey, privateKey } = await generateKeyPair();
                await savePrivateKey(user.id, privateKey);
                privKey = privateKey;
                await api.post('/keys', { publicKey });
                console.log('[E2E] New keypair generated and published');
            } else {
                try {
                    await api.get(`keys/${user.id}`);
                    console.log('[E2E] Public key already on server');
                } catch {
                    console.warn('[E2E] Key missing on server, republishing...');
                    const { publicKey, privateKey } = await generateKeyPair();
                    await savePrivateKey(user.id, privateKey);
                    privKey = privateKey;
                    await api.post('/keys', { publicKey });
                    console.log('[E2E] Keypair regenerated and published');
                }
            }

            privateKeyRef.current = privKey;
        })();
    }, [user?.id]);

    const getSessionKey = useCallback(async (targetUserId: number): Promise<CryptoKey | null> => {
        if (!privateKeyRef.current) return null;

        if(failedKeysRef.current.has(targetUserId)) return null; // Якщо раніше не вдалося отримати ключ для цього користувача, не намагатися знову

        const cached = sessionKeysRef.current.get(targetUserId);
        if (cached) return cached;

        try {
            const { data } = await api.get(`/keys/${targetUserId}`);
            const aesKey = await deriveSharedKey(privateKeyRef.current, data.publicKey)
            sessionKeysRef.current.set(targetUserId, aesKey);
            return aesKey;
        } catch {
            console.warn(`[E2E] No public key for user ${targetUserId}`);
            return null;
        }
    }, []);

    const encrypt = useCallback(async (
        content: string,
        targetUserId: number,
    ): Promise<string> => {
        const key = await getSessionKey(targetUserId);
        if (!key) return content;
        return encryptMessage(key ,content);
    }, [getSessionKey]);

    const decrypt = useCallback(async (
        ciphertext: string,
        senderUserId: number,
    ): Promise<string> => {
        const key = await getSessionKey(senderUserId);
        if (!key) return ciphertext;
        try {
            return await decryptMessage(key, ciphertext);
        } catch {
            return '[🔒 Не вдалося розшифрувати]'
        }
    }, [getSessionKey]);

    useEffect(() => {
        if(privateKeyRef.current){
            failedKeysRef.current.clear();
        }
    }, []);

    return { encrypt, decrypt };
}