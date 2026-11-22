/* Szervóra service worker – v2
   - robusztus precache: egy hiányzó fájl nem szedi ki a többit (addAll -> egyenként, allSettled)
   - futásidejű cache: same-origin GET (cache-first, háttérfrissítéssel), Google Fonts (cache-first)
   - navigáció: offline fallback az index.html cache-elt példányára */
const VERSION = 'v2';
const CACHE = 'szervora-' + VERSION;
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(async (p) => {
      const req = new Request(p, { cache: 'reload' });
      const res = await fetch(req).catch(() => null);
      if (res && (res.ok || res.type === 'opaque')) await cache.put(req, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isFont = (url) => FONT_HOSTS.includes(url.hostname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (err) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === location.origin || isFont(url)) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) {
        fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) caches.open(CACHE).then((c) => c.put(req, res)); }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { const c = await caches.open(CACHE); c.put(req, res.clone()).catch(() => {}); }
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
  }
});
