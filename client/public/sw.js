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
                    (c) => c.visibilityState === 'visible',
                );

                // Якщо вкладка активна — не показуємо сповіщення
                // (користувач вже бачить повідомлення в чаті)
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