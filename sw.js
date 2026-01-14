/* sw.js — Budget Tracker PWA */

const CACHE_VERSION = '2026-01-14-1'; // BUMP THIS when you change index.html/behavior
const CACHE_NAME = `budget-tracker-${CACHE_VERSION}`;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest', // if you always serve manifest.webmanifest?v=..., this is still fine
  './Nova_192.png',
  './Nova_512.png'
];

// Your Worker API base (explicit bypass; not cached)
const API_ORIGIN = 'https://budgetapp-api.kardian.workers.dev';

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

  // 0) Explicitly bypass API requests (always network)
  // (Your current cross-origin rule already does this; this prevents future regressions.)
  try {
    const url = new URL(req.url);
    if (url.origin === API_ORIGIN) {
      event.respondWith(fetch(req));
      return;
    }
  } catch {
    // ignore URL parse errors
  }

  // 1) Never try to cache or handle non-GET requests (POST/PUT/etc.).
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

  // 4) For cross-origin GET requests: do NOT cache, just pass through.
  event.respondWith(fetch(req));
});
