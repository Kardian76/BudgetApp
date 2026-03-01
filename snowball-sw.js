// ===== VERSIONING =====
const VERSION = 'v7'; // Bump this on every deploy
const STATIC_CACHE = `static-${VERSION}`;
const APP_SHELL = [
  '/',
  '/snowball.html',
  '/snowball-app.js',
  '/snowball-manifest.json',
  '/snowball-icon-128.png',
  '/snowball-icon-512.png'
];

// ===== INSTALL =====
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== STATIC_CACHE)
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ===== NETWORK FIRST STRATEGY =====
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // Never cache API or auth requests
    if (!request.url.includes('/api/') &&
        !request.headers.has('Authorization') &&
        networkResponse.ok &&
        networkResponse.headers.get('Cache-Control') !== 'no-store') {

      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;

  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      return caches.match('/snowball.html');
    }

    return new Response('Offline', { status: 503 });
  }
}

// ===== FETCH =====
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always Network First for everything
  event.respondWith(networkFirst(event.request));
});
