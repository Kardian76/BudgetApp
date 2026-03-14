/* Service Worker for Purrfect Budget PWA */
const CACHE_NAME = 'purrfect-budget-v19';
const OFFLINE_URL = 'index.html';

// Files to cache for offline use
const urlsToCache = [
  './',
  './index.html',
  './manifest.webmanifest'
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches, then notify all open tabs to reload
// so they immediately pick up the new version without manual cache clearing.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Tell every open tab that a new version is live so it can reload.
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-http requests (chrome-extension, etc.)
  if (!request.url.startsWith('http')) {
    return;
  }

  // API requests: NETWORK ONLY — never cache auth tokens or budget data.
  // Serving stale API responses leads to incorrect balances and ghost transactions.
  if (request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // App shell (HTML, assets): cache-first, falling back to network,
  // falling back to offline page for navigation requests.
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(request).then((networkResponse) => {
          // Only cache valid responses
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        });
      })
      .catch(() => {
        // Both cache and network failed — return offline page for navigations
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      })
  );
});
