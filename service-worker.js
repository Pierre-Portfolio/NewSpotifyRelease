// v4 : bump de cache (force la maj des PWA installées) — sinon l'ancien index.html
// pouvait persister et le code Finance/Twelve Data n'arrivait jamais à l'appareil.
// network-first pour l'app shell (v2) + clé de cache NORMALISÉE : on stocke toujours
// sous './index.html', jamais sous l'URL réelle de navigation — sinon le retour OAuth
// (?code=...&state=...) écrivait le code d'autorisation dans Cache Storage.
// L'ancienne stratégie cache-first (v1) servait l'index.html du cache pour toujours
// → les utilisateurs PWA ne recevaient jamais les mises à jour. Ne pas y revenir.
const CACHE  = 'spotifyplus-v4';
const ASSETS = ['./', './index.html', './vendor/sql-wasm.js', './vendor/sql-wasm.wasm'];

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
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
  } else {
    // Autres ressources : cache-first comme avant
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
