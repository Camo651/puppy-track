// Puppy Track service worker: surfaces predicted-event notifications even when
// the app is closed, and focuses/opens the app when a notification is tapped.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'Puppy Track', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'Puppy Track';
    const options = {
        body: data.body || '',
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: data.url || '/' },
        icon: '/icon-192.png',
        badge: '/icon-192.png',
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    if ('navigate' in client) {
                        client.navigate(targetUrl).catch(() => {});
                    }
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
            return undefined;
        })
    );
});
