const CACHE_NAME = 'pr-desk-v3';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

// Required by Chrome/Android to show the "Install App" button
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// Handle clicking on the Native OS Outer Notification
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Close the notification on the phone
    
    // Check if the app is already open in a background tab
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus(); // Bring app to the front
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./index.html'); // Open app if completely closed
            }
        })
    );
});
