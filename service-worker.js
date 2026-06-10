// v2 : network-first pour l'app shell. L'ancienne stratégie cache-first servait
// l'index.html du cache pour toujours → les utilisateurs PWA ne recevaient jamais les mises à jour.
const CACHE  = 'spotifyplus-v2';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isAppShell = e.request.mode === 'navigate' ||
    (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));

  if (isAppShell) {
    // Network-first : version fraîche si en ligne, cache en secours hors-ligne
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else {
    // Autres ressources : cache-first comme avant
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
