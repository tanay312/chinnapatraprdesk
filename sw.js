const CACHE_NAME = 'pr-desk-v2';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

// Required to trigger the "Install App" button on mobile/desktop
self.addEventListener('fetch', event => {
    // Basic network-first strategy
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

// Handle clicking on the Native OS Notification
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Close the notification on the phone
    
    // Check if the app is already open in a background tab
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                // If it's already open, bring it to the front
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // If the app is fully minimized/closed, open it!
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});
       
