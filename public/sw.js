const CACHE_NAME = 'sfs-calendar-v2';  // ← CAMBIAR DE v1 A v2
const OFFLINE_PAGE = '/login.html';

// Archivos críticos para cache
const CORE_ASSETS = [
  '/',
  '/login.html',
  '/manager.html',
  '/guide.html',
  '/css/tailwind.min.css',
  '/js/auth.js',
  '/js/firebase-config.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/logo-sfs.png',
  '/manifest.json'
];

// Install: cachear assets core
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: estrategia Network-First para Firestore, Cache-First para assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firestore: siempre network-first (datos actualizados)
  if (url.hostname === 'firestore.googleapis.com') {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Sin conexión' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Solo cachear GET y respuestas válidas
        if (request.method !== 'GET' || !response || response.status !== 200) {
          return response;
        }

        // Clonar para cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Offline fallback
        if (request.destination === 'document') {
          return caches.match(OFFLINE_PAGE);
        }
      });
    })
  );
});