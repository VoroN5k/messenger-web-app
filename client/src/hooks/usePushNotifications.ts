import { useEffect, useRef, useCallback, useState } from 'react';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/store/useAuthStore';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

export const usePushNotifications = (isAuthenticated: boolean) => {
    const [permission, setPermission] = useState<PermissionState>('idle');
    const subscriptionRef = useRef<PushSubscription | null>(null);
    const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

    // ── Читаємо accessToken зі стору ─────────────────────────────────────────
    const accessToken = useAuthStore((s) => s.accessToken);

    const isSupported =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

    // ── Реєстрація SW — запускаємо лише один раз (не залежить від токена) ────
    useEffect(() => {
        if (!isSupported || !isAuthenticated) return;

        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((reg) => {
                registrationRef.current = reg;
                // Статус дозволу
                if (Notification.permission === 'denied') setPermission('denied');
                else if (Notification.permission === 'granted') setPermission('granted');
            })
            .catch((err) => console.error('[Push] SW registration failed:', err));
    }, [isSupported, isAuthenticated]);

    // ── Відновлення підписки — ТІЛЬКИ коли є токен ───────────────────────────
    // Це вирішує проблему 401: чекаємо поки silent refresh поверне accessToken
    useEffect(() => {
        if (!isSupported || !isAuthenticated || !accessToken) return;
        if (Notification.permission !== 'granted') return;
        const reg = registrationRef.current;
        if (!reg) return;

        ensureSubscription(reg);
        // ensureSubscription навмисно не в deps — це стабільна функція
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken, isAuthenticated, isSupported]);

    // ── Надсилає підписку на сервер ───────────────────────────────────────────
    const ensureSubscription = async (
        registration: ServiceWorkerRegistration,
    ): Promise<void> => {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
            console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
            return;
        }

        // Додатковий захист: перевіряємо токен безпосередньо перед запитом
        const token = useAuthStore.getState().accessToken;
        if (!token) {
            console.warn('[Push] No access token yet, skipping subscription');
            return;
        }

        try {
            let sub = await registration.pushManager.getSubscription();
            if (!sub) {
                sub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey),
                });
            }
            subscriptionRef.current = sub;

            const subData = sub.toJSON();
            if (!subData.keys) throw new Error('Браузер не повернув ключі шифрування');

            await api.post('/push/subscribe', {
                endpoint: subData.endpoint,
                keys: { p256dh: subData.keys.p256dh, auth: subData.keys.auth },
            });

            console.log('[Push] Subscription saved to server');
        } catch (err) {
            console.error('[Push] Subscription failed:', err);
        }
    };

    // ── Запит дозволу ─────────────────────────────────────────────────────────
    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isSupported) return false;
        if (permission === 'granted') return true;

        setPermission('requesting');
        try {
            const result = await Notification.requestPermission();
            if (result === 'granted') {
                setPermission('granted');
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permission, isSupported]);

    // ── Відписатись ───────────────────────────────────────────────────────────
    const unsubscribe = useCallback(async (): Promise<void> => {
        const sub = subscriptionRef.current;
        if (!sub) return;
        try {
            await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
            await sub.unsubscribe();
            subscriptionRef.current = null;
            setPermission('idle');
        } catch (err) {
            console.error('[Push] Unsubscribe failed:', err);
        }
    }, []);

    return { isSupported, permission, requestPermission, unsubscribe };
};