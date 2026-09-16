// TribeStudio's app shell is static, but its creator data and Firebase APIs are
// private. Never cache documents, API responses, uploads, or cross-origin URLs.
const CACHE_NAME = 'tribestudio-static-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name.startsWith('tribestudio-static-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Route HTML always comes from the network. No authenticated view is
  // persisted; a cold offline launch gets a clear, preloaded fallback page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  // Vite fingerprints built JS/CSS. Only those files and public PWA assets
  // are safe to reuse; even a same-origin future API path is not intercepted.
  if (!url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/icons/')
      && url.pathname !== '/favicon.svg' && url.pathname !== '/manifest.webmanifest') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  })());
});
