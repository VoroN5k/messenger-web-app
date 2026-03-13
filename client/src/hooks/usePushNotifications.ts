import { useEffect, useRef, useCallback, useState } from 'react';
import api from '@/src/lib/axios';

// Конвертація VAPID public key з base64 у Uint8Array для підписки
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

    const isSupported =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

    // ── Реєстрація Service Worker ─────────────────────────────────────────────
    useEffect(() => {
        if (!isSupported || !isAuthenticated) return;

        const init = async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/',
                });
                registrationRef.current = registration;

                // Якщо дозвіл вже надано — відновлюємо підписку
                if (Notification.permission === 'granted') {
                    setPermission('granted');
                    await ensureSubscription(registration);
                } else if (Notification.permission === 'denied') {
                    setPermission('denied');
                }
            } catch (err) {
                console.error('[Push] SW registration failed:', err);
            }
        };

        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSupported, isAuthenticated]);

    // ── Підписка / переконатись що підписка існує ─────────────────────────────
    const ensureSubscription = async (
        registration: ServiceWorkerRegistration,
    ): Promise<void> => {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
            console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
            return;
        }

        try {
            // Перевіряємо чи є вже активна підписка
            let sub = await registration.pushManager.getSubscription();

            if (!sub) {
                sub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey),
                });
            }

            subscriptionRef.current = sub;

            // Використовуємо вбудований toJSON(), який ідеально форматує ключі
            const subData = sub.toJSON();

            if (!subData.keys) {
                throw new Error("Браузер не повернув ключі шифрування");
            }

            // Надсилаємо підписку на сервер
            await api.post('/push/subscribe', {
                endpoint: subData.endpoint,
                keys: {
                    p256dh: subData.keys.p256dh,
                    auth: subData.keys.auth,
                },
            });
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
            await api.delete('/push/unsubscribe', {
                data: { endpoint: sub.endpoint },
            });
            await sub.unsubscribe();
            subscriptionRef.current = null;
            setPermission('idle');
        } catch (err) {
            console.error('[Push] Unsubscribe failed:', err);
        }
    }, []);

    return {
        isSupported,
        permission,
        requestPermission,
        unsubscribe,
    };
};