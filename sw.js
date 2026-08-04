const CACHE_NAME = 'pr-desk-v5';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

// 1. THIS MAKES THE "INSTALL APP" BUTTON WORK
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// 2. THIS OPENS THE APP WHEN YOU CLICK THE OUTER NOTIFICATION FROM LOCK SCREEN
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});
