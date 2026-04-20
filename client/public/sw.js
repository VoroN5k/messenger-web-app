/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'vesper-v1';
const PRECACHE = ['/', '/chat', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
        ),
    );
    self.clients.claim();
});

// Network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET') return;
    if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) return;

    event.respondWith(
        fetch(event.request)
            .then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return res;
            })
            .catch(() => caches.match(event.request)),
    );
});

// ── Push-сповіщення ──────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'Нове повідомлення', body: event.data.text() };
    }

    event.waitUntil(
        // Перевіряємо чи є активна (видима) вкладка з нашим додатком
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                const hasVisibleTab = clients.some(
                    (c) => c.visibilityState === 'visible' && c.focused,
                );

                if (hasVisibleTab) return;

                return self.registration.showNotification(payload.title ?? 'Новe повідомлення', {
                    body:      payload.body   ?? '',
                    icon:      '/icon-192.png',
                    badge:     '/icon-72.png',
                    // tag групує сповіщення від одного відправника
                    tag:       `chat-${payload.senderId ?? 'msg'}`,
                    renotify:  true,
                    vibrate:   [200, 100, 200],
                    data: {
                        url:      payload.url ?? '/chat',
                        senderId: payload.senderId,
                    },
                });
            }),
    );
});

// ── Клік по сповіщенню ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url ?? '/chat';

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                // Якщо вкладка вже відкрита — фокусуємо її
                const existing = clients.find((c) => c.url.includes('/chat'));
                if (existing) return existing.focus();
                // Інакше відкриваємо нову
                return self.clients.openWindow(targetUrl);
            }),
    );
});

// ── Activate: одразу беремо контроль над сторінками ──────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});