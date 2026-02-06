/* Berniátor SW – jednoduché precache + offline fallbacks */
const VERSION = 'v6.0';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './service-worker.js',
  './offline.html',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './assets/icons/maskable-192.svg',
  './assets/icons/maskable-512.svg',
  './assets/icons/apple-touch-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('berniator-core-' + VERSION).then(cache => cache.addAll(CORE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(n => n.startsWith('berniator-core-') && !n.endsWith(VERSION))
          .map(n => caches.delete(n))
      );
      // Navigation preload can help on slow networks
      if ('navigationPreload' in self.registration) {
        try { await self.registration.navigationPreload.enable(); } catch {}
      }
      self.clients.claim();
    })()
  );
});

/** Network-first pro navigace -> offline fallback */
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Navigace (HTML dokumenty)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) return preload;
        const fresh = await fetch(req);
        return fresh;
      } catch (err) {
        const cache = await caches.open('berniator-core-' + VERSION);
        const cached = await cache.match('./offline.html');
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Pro ostatní – cache-first, pak síť
  e.respondWith((async () => {
    const cache = await caches.open('berniator-core-' + VERSION);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // Cache jen stejno-původní statiku
      if (req.url.startsWith(self.location.origin)) {
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      // fallback bez sítě – nic víc nevíme
      return new Response('', { status: 404 });
    }
  })());
});
