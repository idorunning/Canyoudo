/* Thinking About Policing — service worker.
 *
 * Goals, in order:
 *  1. Never serve a stale page after a deploy: navigations are network-first.
 *  2. Offline reading: saved-library articles are cached on demand (the page
 *     posts CACHE_URLS), and any page you've visited falls back to its cached
 *     copy when the network is gone; otherwise /offline/ renders the library.
 *  3. Speed: static assets (hashed JS/CSS, fonts, images) are cached with
 *     stale-while-revalidate — they're immutable or safely refreshable.
 *
 * Deliberately NOT handled: cross-origin requests (Supabase, Cusdis,
 * MailerLite), and anything under /admin, /keystatic, /api, /dashboard or
 * /.netlify — dynamic or authenticated surfaces the cache must never touch.
 */

const VERSION = 'tap-v2';
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const SAVED = 'tap-saved'; // survives version bumps: the reader's offline library
const OFFLINE_URL = '/offline/';

const BYPASS = [/^\/admin/, /^\/keystatic/, /^\/api\//, /^\/dashboard/, /^\/\.netlify/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll([OFFLINE_URL, '/']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== PAGES && k !== ASSETS && k !== SAVED)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// The page asks us to pin URLs for offline reading (the saved library).
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'CACHE_URLS' || !Array.isArray(msg.urls)) return;
  event.waitUntil(
    caches.open(SAVED).then((cache) =>
      Promise.allSettled(
        msg.urls.map((u) => {
          const url = new URL(u, self.location.origin);
          if (url.origin !== self.location.origin) return Promise.resolve();
          return cache.add(url.pathname);
        })
      )
    )
  );
});

async function fromCaches(request) {
  return (await caches.match(request, { cacheName: SAVED })) || (await caches.match(request));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return;

  // Navigations: network first, cache fallback, offline page last. `cache:
  // 'no-store'` bypasses the browser's own HTTP cache so "network first"
  // really means the network, not a locally cached copy from before the last
  // deploy — the origin's Cache-Control already asks for this (see
  // netlify.toml), but a stale copy already sitting in a reader's HTTP cache
  // from before that header shipped would otherwise still win here.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: 'no-store' });
          // Keep a copy so a previously-visited page still opens offline.
          const copy = fresh.clone();
          caches.open(PAGES).then((cache) => cache.put(request, copy));
          return fresh;
        } catch {
          const cached = await fromCaches(request);
          if (cached) return cached;
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  const isAsset = /\.(js|css|woff2?|png|jpe?g|webp|svg|ico|json|mp3)$/.test(url.pathname);
  if (isAsset) {
    event.respondWith(
      (async () => {
        const cached = await fromCaches(request);
        const refresh = fetch(request)
          .then((fresh) => {
            const copy = fresh.clone();
            caches.open(ASSETS).then((cache) => cache.put(request, copy));
            return fresh;
          })
          .catch(() => undefined);
        return cached || (await refresh) || Response.error();
      })()
    );
  }
});
