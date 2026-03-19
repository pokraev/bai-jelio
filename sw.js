const CACHE_VERSION = '2.0.1';
const CACHE_NAME = 'bai-zhelyo-v' + CACHE_VERSION;
const ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/avatar.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Skip non-GET requests (POST, etc.)
  if (e.request.method !== 'GET') return;

  // Never cache version.json — always fetch fresh
  if (e.request.url.includes('version.json')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{}', { status: 503 }))
    );
    return;
  }

  // Network-first for everything else
  e.respondWith(
    fetch(e.request)
      .then(r => {
        // Cache successful responses for offline use
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request)
          .then(r => r || new Response('Offline', { status: 503 }))
      )
  );
});
