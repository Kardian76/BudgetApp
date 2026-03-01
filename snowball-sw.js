// Service Worker for Debt Snowball Tracker PWA
const CACHE_NAME = 'debt-snowball-v1';
const urlsToCache = [
  '/',
  '/snowball.html',
  '/snowball-app.js',
  '/snowball-manifest.json',
  '/snowball-icon-128.png',
  '/snowball-icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600&display=swap'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache install error:', err);
      })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        }).catch(err => {
          console.log('Fetch error:', err);
          // You could return a custom offline page here
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  self.clients.claim();
});

// Background sync for data persistence (when Cloudflare integration is added)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-debts') {
    event.waitUntil(syncDebts());
  }
});

async function syncDebts() {
  // This will be implemented when Cloudflare Workers/D1 integration is added
  console.log('Background sync triggered');
}

// Push notification support (optional future feature)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Debt payment reminder',
    icon: 'icon-128.png',
    badge: 'icon-128.png',
    vibrate: [200, 100, 200],
    tag: 'debt-reminder'
  };
  
  event.waitUntil(
    self.registration.showNotification('Debt Snowball', options)
  );
});
