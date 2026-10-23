// Service worker de Veilleuse. Ce fichier est un modèle : au build, vite.config.ts
// y injecte la version et la liste des fichiers de l'app (marqueurs en majuscules ci-dessous).
const CACHE = 'veilleuse-__VERSION__';
const PRECACHE = __PRECACHE__;

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

// Page : réseau d'abord, pour qu'une nouvelle version s'affiche dès l'ouverture.
// Hors ligne, ou si le réseau ne répond pas en 3 s, on sert la copie préchargée.
const NETWORK_TIMEOUT_MS = 3000;

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(reject, NETWORK_TIMEOUT_MS);
    fetch(request).then((response) => {
      clearTimeout(timer);
      response.ok ? resolve(response) : reject(response);
    }, reject);
  });
}

// Le reste (scripts, styles, icônes, aux noms versionnés) : cache d'abord.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const shell = new URL('./', self.location).href;
    event.respondWith(fromNetwork(request).catch(() => caches.match(shell).then((cached) => cached || fetch(request))));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});
