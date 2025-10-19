const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `calendar-app-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/guide.html',
  '/tour-details.html',
  '/manager.html',
  '/manager-assignments.html',
  '/manager-guides.html',
  '/manager-vendors.html',
  '/my-invoices.html',
  '/login.html',
  '/completar-registro.html',
  '/css/styles.css',
  '/js/guide.js',
  '/js/tour-details.js',
  '/js/manager-dashboard.js',
  '/js/manager-assignments.js',
  '/js/manager-guides.js',
  '/js/manager-vendors.js',
  '/js/guide-invoices.js',
  '/js/completar-registro.js',
  '/js/firebase-config.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});