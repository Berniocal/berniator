/* Berniátor SW – robustní offline režim + Media Session */
const VERSION = 'v17-media-session-robust';
const CACHE_NAME = 'berniator-core-' + VERSION;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const urls = [
      './',
      './index.html',
      './manifest.webmanifest',
      './media-session.js?v=17',
      './offline.html',
      './assets/icons/icon-192.png',
      './assets/icons/icon-512.png',
      './assets/icons/apple-touch-180.png'
    ];

    // Jeden chybějící soubor už nezruší instalaci celého service workeru.
    await Promise.allSettled(urls.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (_) {}
    }));
  })());

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

async function injectMediaSession(response) {
  if (!response || !response.ok) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  const tag = '<script src="./media-session.js?v=17"></script>';

  if (!html.includes('media-session.js?v=17')) {
    html = html.includes('</body>')
      ? html.replace('</body>', `${tag}\n</body>`)
      : `${html}\n${tag}`;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
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
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh.ok) {
          try { await cache.put('./index.html', fresh.clone()); } catch (_) {}
          return injectMediaSession(fresh);
        }
      } catch (_) {}

      const cached = await cache.match('./index.html');
      if (cached) return injectMediaSession(cached);

      const offline = await cache.match('./offline.html');
      return offline || new Response('Offline', { status: 503 });
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const url = new URL(request.url);

    if (url.pathname.endsWith('/media-session.js')) {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh.ok) {
          try { await cache.put(request, fresh.clone()); } catch (_) {}
          return fresh;
        }
      } catch (_) {}
    }

    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const fresh = await fetch(request);
      if (fresh.ok && request.url.startsWith(self.location.origin)) {
        try { await cache.put(request, fresh.clone()); } catch (_) {}
      }
      return fresh;
    } catch (_) {
      return new Response('', { status: 404 });
    }
  })());
});