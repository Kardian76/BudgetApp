/* sw.js — Purrfect Budget
   Goals:
   - Always pick up new releases quickly
   - Cache the app shell for offline launch
   - Avoid caching API responses (keeps data correctness simple)
*/

const SW_VERSION = "2026-01-14-1";
const CACHE_NAME = `purrfect-budget-shell-${SW_VERSION}`;

// Adjust if your file names differ
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./Icon_192.png",
  "./Icon_512.png",
];

// Install: pre-cache the app shell and activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    const results = await Promise.allSettled(
      APP_SHELL.map((u) => fetch(u, { cache: "reload" })
        .then((r) => {
          if (!r.ok) throw new Error(`${u} -> ${r.status}`);
          return cache.put(u, r);
        })
      )
    );

    const failed = results
      .map((r, i) => ({ r, u: APP_SHELL[i] }))
      .filter(x => x.r.status === "rejected");

    if (failed.length) {
      // Visible in DevTools > Application > Service Workers > "Inspect"
      console.warn("SW precache failures:", failed.map(f => String(f.u)));
    }

    await self.skipWaiting();
  })());
});


// Activate: remove old caches and take control of pages immediately
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("purrfect-budget-shell-") && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Optional: allow page code to request an immediate SW activation
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch strategy:
// - Navigation requests: network-first, fallback to cached index.html (offline app launch)
// - Same-origin static assets: cache-first
// - Cross-origin (e.g., your API): network-only (do not cache)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Cross-origin requests (API, CDN, etc.) -> do not cache
  if (!sameOrigin) return;

  // Navigation (SPA / app shell)
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // Network first to pick up new deployments quickly
        const fresh = await fetch(req, { cache: "no-store" });
        // Update cached index.html opportunistically
        const cache = await caches.open(CACHE_NAME);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("./index.html");
        return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // Static assets: cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    const fresh = await fetch(req);
    // Cache successful, basic responses only
    if (fresh && fresh.ok && fresh.type === "basic") {
      cache.put(req, fresh.clone());
    }
    return fresh;
  })());
});
