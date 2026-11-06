// Service Worker mínimo: la terminal sigue abriendo y cotizando sin señal en el depósito.
//  - Navegación: network-first con fallback al index cacheado.
//  - Assets con hash (/assets/*): cache-first (inmutables).
//  - Llamadas al API o lookup: nunca se cachean en el SW, van directo a la red.
const CACHE = 'nodux-flow-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo-64.webp', '/logo-192.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar métodos no-GET, llamadas a otros orígenes o rutas dinámicas de API / padrón SUNAT
  if (
    req.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/lookup/') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
