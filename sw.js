/* No Contact Dude service worker (cache names keep their old prefix so old caches still get cleaned up)
 * Strategy:
 *  - App shell: precached on install, served cache-first (works fully offline).
 *  - Navigations: network-first with cached index.html fallback.
 *  - Google Fonts: stale-while-revalidate runtime cache.
 *  - Everything else same-origin: cache-first, then network (and cache it).
 * Bump CACHE_VERSION whenever you change any precached file.
 */
const CACHE_VERSION = 'v3.22.0';
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
  './js/games.js',
  './js/checkup.js',
  './js/games/store.js',
  './js/games/echo.js',
  './js/games/sort.js',
  './js/games/bubbles.js',
  './js/games/swipe.js',
  './js/mosaic.js',
  './js/vendor/p5.min.js',
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
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))   // 'reload': never precache a stale copy from the browser's HTTP cache
  );
  // Take over as soon as the new files are cached. Waiting left the new HTML running on the old cached scripts,
  // which crashed the app after a deploy and hid the "update ready" prompt.
  self.skipWaiting();
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

  // 3. Same-origin code (html, js, css, manifest): network-first, so a page and its scripts always come from the
  //    same deploy. The cache is only the offline fallback.
  if (url.origin === self.location.origin && /\.(js|css|html|webmanifest)$/.test(url.pathname) && !url.pathname.includes('/vendor/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 4. Everything else on this origin (icons, bundled p5): cache-first.
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

/** Try the network for up to 5 seconds (fresh from the server), then fall back to what is cached. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(request, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow network')), 5000)),
    ]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await caches.match(request, { ignoreSearch: true }))
      || new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || network;
}
