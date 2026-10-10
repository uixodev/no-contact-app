/* No Contact Dude service worker (cache names keep their old prefix so old caches still get cleaned up)
 * Strategy:
 *  - App shell: precached on install, served cache-first (works fully offline).
 *  - Navigations: network-first with cached index.html fallback.
 *  - Google Fonts: stale-while-revalidate runtime cache.
 *  - Everything else same-origin: cache-first, then network (and cache it).
 * Bump CACHE_VERSION whenever you change any precached file.
 */
const CACHE_VERSION = 'v3.8.0';
const SHELL_CACHE = `clear-days-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `clear-days-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/db.js',
  './js/streaks.js',
  './js/rescue.js',
  './js/tags.js',
  './js/charts.js',
  './js/fx.js',
  './js/days.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  // Don't skipWaiting automatically — the page shows an "Update ready" prompt.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('clear-days-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
        .map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 1. Page navigations: network-first, fall back to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html', { ignoreSearch: true }))
            || (await caches.match('./offline.html'));
      }
    })());
    return;
  }

  // 2. Google Fonts: stale-while-revalidate.
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 3. Same-origin static assets: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(request);
        if (res.ok) (await caches.open(RUNTIME_CACHE)).put(request, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || network;
}
