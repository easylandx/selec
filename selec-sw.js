/* Selectric service worker — scope: /selec/ only (registered from ./selec-sw.js) */
const CACHE = 'selec-v1';
const FONT_CACHE = 'selec-fonts-v1';
const CORE = [
  './',
  './index.html',
  './selec.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Cache Storage is shared across the whole origin, so only touch our own "selec-" caches.
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('selec-') && k !== CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request, fallbackUrl, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () =>
      caches.open(CACHE)
        .then((c) => c.match(request, { ignoreSearch: true }).then((r) => r || (fallbackUrl && c.match(fallbackUrl))))
        .then((r) => r || Response.error());
    const timer = setTimeout(() => { if (!settled) fromCache().then((r) => { if (!settled) { settled = true; resolve(r); } }); }, timeoutMs);
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        if (!settled) fromCache().then((r) => { if (!settled) { settled = true; resolve(r); } });
      });
  });
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const net = fetch(request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts (Courier Prime): cache so the typewriter face works offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // HTML: network-first so updates show up quickly, cache as the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html', 4000));
    return;
  }

  // Everything else from our own folder: network-first with cache fallback.
  event.respondWith(networkFirst(req, null, 4000));
});
