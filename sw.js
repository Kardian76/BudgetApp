/* sw.js — Budget Tracker PWA */

const CACHE_VERSION = '2026-01-10-2';
const CACHE_NAME = `budget-tracker-${CACHE_VERSION}`;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './Nova_192.png',
  './Nova_512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) Never try to cache or handle non-GET requests (POST/PUT/etc.).
  //    This prevents "Request method 'POST' is unsupported" from Cache.put().
  if (req.method !== 'GET') {
    event.respondWith(fetch(req));
    return;
  }

  // 2) For navigation requests: network-first, fallback to cached shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        // Cache the app shell under a stable key
        cache.put('./', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./')) || (await cache.match('./index.html'));
      }
    })());
    return;
  }

  // 3) For same-origin static assets: cache-first
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    })());
    return;
  }

  // 4) For cross-origin GET requests (e.g., your Apps Script API, fonts, etc.):
  //    do NOT cache, just pass through.
  event.respondWith(fetch(req));
});

