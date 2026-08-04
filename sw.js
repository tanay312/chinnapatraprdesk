const CACHE_NAME = 'pr-desk-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Install the app locally
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

// Required by Chrome to show the "Install App" prompt
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

// Handle Background Push Notifications (WhatsApp style)
self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : {};
    
    const title = data.title || "Message from Admin";
    const options = {
        body: data.message || "You have a new update in your portal.",
        icon: "3b81e8eb-b9aa-4741-a15b-05089409732e(3).png",
        badge: "3b81e8eb-b9aa-4741-a15b-05089409732e(3).png",
        vibrate: [200, 100, 200], // Makes the phone vibrate like a real text message
        requireInteraction: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// When user clicks the notification in their notification panel
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('./index.html')
    );
});
