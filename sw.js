// Service Worker: показывает push, когда приложение закрыто, и открывает чат по нажатию.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) {}
    event.waitUntil((async () => {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (list.some(c => c.visibilityState === 'visible')) return; // приложение открыто — покажет баннер само
        await self.registration.showNotification(d.title || 'Новое сообщение', {
            body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
            tag: d.tag || undefined, renotify: !!d.tag, data: { open: d.open || '' }
        });
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const open = (event.notification.data && event.notification.data.open) || '';
    event.waitUntil((async () => {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (list.length) {
            const c = list[0];
            await c.focus();
            c.postMessage({ type: 'open', open });
            return;
        }
        await self.clients.openWindow('./' + (open ? '?open=' + encodeURIComponent(open) : ''));
    })());
});
