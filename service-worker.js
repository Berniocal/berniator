/* Berniátor SW – offline + vložení Android Media Session ovládání */
const VERSION = 'v14-media-session-fix';
const CACHE_NAME = 'berniator-core-' + VERSION;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './service-worker.js',
  './media-session.js',
  './offline.html',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(n => n.startsWith('berniator-core-') && n !== CACHE_NAME)
        .map(n => caches.delete(n))
    );
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

async function withMediaSessionScript(response) {
  if (!response || !response.ok) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;

  let html = await response.text();
  if (!html.includes('media-session.js')) {
    const script = '<script src="./media-session.js?v=14"></script>';
    html = html.includes('</body>')
      ? html.replace('</body>', script + '\n</body>')
      : html + script;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        const fresh = preload || await fetch(req);

        const cache = await caches.open(CACHE_NAME);
        try { await cache.put('./index.html', fresh.clone()); } catch {}

        return await withMediaSessionScript(fresh);
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        const cachedIndex = await cache.match('./index.html');
        if (cachedIndex) return await withMediaSessionScript(cachedIndex);
        const offline = await cache.match('./offline.html');
        return offline || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Skript mediálního mostu vždy zkus načíst ze sítě, aby se opravy nezasekly ve staré cache.
    if (new URL(req.url).pathname.endsWith('/media-session.js')) {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh.ok) {
          try { await cache.put(req, fresh.clone()); } catch {}
          return fresh;
        }
      } catch {}
    }

    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (req.url.startsWith(self.location.origin) && res.ok) {
        try { await cache.put(req, res.clone()); } catch {}
      }
      return res;
    } catch {
      return new Response('', { status: 404 });
    }
  })());
});