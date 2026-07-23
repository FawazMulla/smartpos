/* SmartPOS Service Worker v2 */
const CACHE_NAME = 'smartpos-v2';
const ASSETS = [
  '/',
  '/mobile',
  '/static/style.css',
  '/static/script.js',
  '/static/mobile.css',
  '/static/mobile.js',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/apple-touch-icon.png',
  '/static/favicon.png',
  '/manifest.json'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  // Network-first strategy for API calls
  if (evt.request.url.includes('/api/')) {
    evt.respondWith(
      fetch(evt.request).catch(() => caches.match(evt.request))
    );
    return;
  }

  // Network-first for HTML pages so user gets latest role checks/updates, falling back to cache
  if (evt.request.mode === 'navigate' || evt.request.headers.get('accept')?.includes('text/html')) {
    evt.respondWith(
      fetch(evt.request).catch(() => caches.match(evt.request))
    );
    return;
  }

  // Cache-first strategy for static assets
  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      return cached || fetch(evt.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(evt.request, responseToCache);
        });
        return response;
      });
    })
  );
});
