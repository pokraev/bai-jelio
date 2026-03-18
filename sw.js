const CACHE_VERSION = '2.0.0';
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
  // Never cache version.json — always fetch fresh
  if (e.request.url.includes('version.json')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Network-first for everything else
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
