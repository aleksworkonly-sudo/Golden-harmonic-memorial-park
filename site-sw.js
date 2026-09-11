// Minimal service worker — required for the site to be installable as a PWA.
// Does not cache aggressively; just passes requests through, so your site
// always shows the latest content while still being installable.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
