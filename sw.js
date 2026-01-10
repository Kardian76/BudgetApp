/* sw.js — Budget Tracker PWA */

const CACHE_VERSION = '2026-01-10-1';
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

  // Navigation requests: network-first, fallback to cache
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

  // Other requests: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    const fresh = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  })());
});

