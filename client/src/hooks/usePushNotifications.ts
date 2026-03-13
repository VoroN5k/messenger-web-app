import { useEffect, useRef, useCallback, useState } from 'react';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/store/useAuthStore';

// Повертає ArrayBuffer (не ArrayBufferLike) — без TS помилки в applicationServerKey
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i++) {
        view[i] = rawData.charCodeAt(i);
    }
    return buffer;
}

type PermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

export const usePushNotifications = (isAuthenticated: boolean) => {
    const [permission, setPermission] = useState<PermissionState>('idle');
    const subscriptionRef  = useRef<PushSubscription | null>(null);
    const registrationRef  = useRef<ServiceWorkerRegistration | null>(null);
    const subscribedRef    = useRef(false); // щоб не дублювати POST /push/subscribe

    const isSupported =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

    // ── 1. Реєстрація SW ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!isSupported || !isAuthenticated) return;

        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((reg) => {
                registrationRef.current = reg;
                if (Notification.permission === 'denied')  setPermission('denied');
                else if (Notification.permission === 'granted') setPermission('granted');
            })
            .catch((err) => console.error('[Push] SW registration failed:', err));
    }, [isSupported, isAuthenticated]);

    // ── 2. Надсилає підписку на сервер ───────────────────────────────────────
    const ensureSubscription = useCallback(async (
        registration: ServiceWorkerRegistration,
    ): Promise<void> => {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
            console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
            return;
        }

        try {
            let sub = await registration.pushManager.getSubscription();
            if (!sub) {
                sub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToArrayBuffer(vapidKey), // ← ArrayBuffer, без TS помилки
                });
            }
            subscriptionRef.current = sub;

            // Не надсилаємо повторно якщо вже підписали в цій сесії
            if (subscribedRef.current) return;

            const subData = sub.toJSON();
            if (!subData.keys) throw new Error('Браузер не повернув ключі шифрування');

            await api.post('/push/subscribe', {
                endpoint: subData.endpoint,
                keys: { p256dh: subData.keys.p256dh, auth: subData.keys.auth },
            });

            subscribedRef.current = true;
            console.log('[Push] Subscription saved to server');
        } catch (err) {
            console.error('[Push] Subscription failed:', err);
        }
    }, []);

    // ── 3. Відновлення підписки після отримання токена ───────────────────────
    // Використовуємо useAuthStore.subscribe замість useEffect на accessToken,
    // щоб не викликати зайвих ре-рендерів і не словити Request aborted
    useEffect(() => {
        if (!isSupported || !isAuthenticated) return;
        if (Notification.permission !== 'granted') return;

        // Підписуємось на зміну accessToken у сторі (без ре-рендеру компонента)
        const unsubscribe = useAuthStore.subscribe(
            (s) => s.accessToken,
            (token) => {
                if (!token || subscribedRef.current) return;
                const reg = registrationRef.current;
                if (reg) ensureSubscription(reg);
            },
        );

        // Якщо токен вже є — запускаємо одразу
        const currentToken = useAuthStore.getState().accessToken;
        if (currentToken && !subscribedRef.current) {
            const reg = registrationRef.current;
            if (reg) ensureSubscription(reg);
        }

        return () => unsubscribe();
    }, [isSupported, isAuthenticated, ensureSubscription]);

    // ── 4. Запит дозволу ─────────────────────────────────────────────────────
    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isSupported) return false;
        if (permission === 'granted') return true;

        setPermission('requesting');
        try {
            const result = await Notification.requestPermission();
            if (result === 'granted') {
                setPermission('granted');
                subscribedRef.current = false; // дозволити повторну підписку
                const reg = registrationRef.current;
                if (reg) await ensureSubscription(reg);
                return true;
            } else {
                setPermission('denied');
                return false;
            }
        } catch (err) {
            console.error('[Push] Permission request failed:', err);
            setPermission('idle');
            return false;
        }
    }, [permission, isSupported, ensureSubscription]);

    // ── 5. Відписатись ───────────────────────────────────────────────────────
    const unsubscribe = useCallback(async (): Promise<void> => {
        const sub = subscriptionRef.current;
        if (!sub) return;
        try {
            await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
            await sub.unsubscribe();
            subscriptionRef.current = null;
            subscribedRef.current = false;
            setPermission('idle');
        } catch (err) {
            console.error('[Push] Unsubscribe failed:', err);
        }
    }, []);

    return { isSupported, permission, requestPermission, unsubscribe };
};