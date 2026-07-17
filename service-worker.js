/* Berniátor SW – offline režim + spolehlivé načtení Media Session */
const VERSION = 'v15-media-session-direct';
const CACHE_NAME = 'berniator-core-' + VERSION;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './media-session.js?v=15',
  './offline.html',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith('berniator-core-') && name !== CACHE_NAME)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

async function addMediaSessionScript(response) {
  if (!response || !response.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();

  // Stejně jako v aplikaci Šumy musí být skript běžnou součástí stránky
  // a načíst se až po hlavním skriptu aplikace.
  if (!html.includes('media-session.js?v=15')) {
    const tag = '<script src="./media-session.js?v=15"></script>';
    html = html.includes('</body>')
      ? html.replace('</body>', `${tag}\n</body>`)
      : `${html}\n${tag}`;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        // Navigace je network-first, aby se starý index nezasekl v cache.
        const networkResponse = await fetch(request, { cache: 'no-store' });
        if (networkResponse && networkResponse.ok) {
          try { await cache.put('./index.html', networkResponse.clone()); } catch (_) {}
          return addMediaSessionScript(networkResponse);
        }
      } catch (_) {}

      const cachedIndex = await cache.match('./index.html');
      if (cachedIndex) return addMediaSessionScript(cachedIndex);

      const offline = await cache.match('./offline.html');
      return offline || new Response('Offline', { status: 503 });
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Media Session skript vždy zkusíme vzít čerstvý, aby se neopakovala
    // stará nefunkční verze.
    if (new URL(request.url).pathname.endsWith('/media-session.js')) {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          try { await cache.put(request, fresh.clone()); } catch (_) {}
          return fresh;
        }
      } catch (_) {}
    }

    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok && request.url.startsWith(self.location.origin)) {
        try { await cache.put(request, response.clone()); } catch (_) {}
      }
      return response;
    } catch (_) {
      return new Response('', { status: 404 });
    }
  })());
});