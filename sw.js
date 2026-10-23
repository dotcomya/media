// Service worker de Veilleuse. Ce fichier est un modèle : au build, vite.config.ts
// y injecte la version et la liste des fichiers de l'app (marqueurs en majuscules ci-dessous).
const CACHE = 'veilleuse-de2c8f26deb2';
const PRECACHE = ["./","assets/index-Cndw4LHP.js","assets/index-CU_HFu3V.css","icons/apple-touch-icon.png","icons/favicon.svg","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","manifest.webmanifest"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.location).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Cache d'abord : l'app entière est préchargée, elle s'ouvre donc en mode avion.
// Une nouvelle version est installée en arrière-plan et prise au lancement suivant.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const shell = new URL('./', self.location).href;
    event.respondWith(caches.match(shell).then((cached) => cached || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});
