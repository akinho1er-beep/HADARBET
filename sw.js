// ═══════════════════════════════════════════
// Service Worker HADAR BetAnalytics
// Cache les fichiers statiques pour un chargement instantané
// ═══════════════════════════════════════════
const CACHE_NAME = 'hadar-v3.2';
const STATIC_ASSETS = [
  '/',
  '/betting-analyzer.html',
  '/manifest.json',
  '/i18n.js'
];

// Installation : pré-cache les fichiers de base
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activation : nettoie les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch : stratégie "Network First" pour les données, "Cache First" pour le statique
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Les requêtes API (/results, /status, /api) → toujours réseau (jamais cache)
  if (url.pathname.startsWith('/results') || 
      url.pathname.startsWith('/status') || 
      url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/upcoming') ||
      url.pathname.startsWith('/sync')) {
    return; // Laisse le navigateur gérer normalement
  }

  // Tout le reste (HTML, CSS, JS, images) → Cache First, puis réseau
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Retourne le cache immédiatement, met à jour en arrière-plan
        fetch(event.request).then((fresh) => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, fresh.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }
      // Pas en cache → réseau
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Hors-ligne → page d'attente
        if (event.request.destination === 'document') {
          return caches.match('/betting-analyzer.html');
        }
      });
    })
  );
});
