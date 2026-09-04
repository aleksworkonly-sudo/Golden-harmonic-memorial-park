// admin-sw.js
//
// Minimal service worker — exists mainly so browsers treat admin.html as an
// installable app (many browsers require a registered service worker with a
// fetch handler before showing the "Install" option). This does a simple
// network-first pass-through; it doesn't cache anything for offline use,
// since the admin panel genuinely needs a live connection to Firestore to
// be useful anyway.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
