// v7 : ajout de Leaflet auto-hébergé (vendor/leaflet.js + .css, section Maps) au précache.
// v6 : bump de cache (force la maj des PWA installées) + le fetch réseau de l'app shell
// bypasse désormais le cache HTTP du navigateur ({ cache: 'no-store' }). Sinon GitHub Pages
// sert l'index.html avec Cache-Control: max-age=600, et le network-first du SW récupérait
// une copie PÉRIMÉE depuis le cache HTTP → la version affichée restait figée (ex. 3.0.0)
// malgré un nouveau déploiement.
// network-first pour l'app shell (v2) + clé de cache NORMALISÉE : on stocke toujours
// sous './index.html', jamais sous l'URL réelle de navigation — sinon le retour OAuth
// (?code=...&state=...) écrivait le code d'autorisation dans Cache Storage.
// L'ancienne stratégie cache-first (v1) servait l'index.html du cache pour toujours
// → les utilisateurs PWA ne recevaient jamais les mises à jour. Ne pas y revenir.
// v8 : bump de cache pour forcer la maj des PWA installées (renommage sections Stats).
// v9 : bump de cache — purge des caches SW après la rafale de déploiements 5.0.x
// (sections Actu/Bon plan) : un client ayant chargé l'app en plein milieu d'un
// déploiement GitHub Pages pouvait garder un shell incohérent (écran noir) jusqu'à
// expiration ; le bump force réinstallation + purge des anciens caches à l'activate.
// v10 : bump de cache — module Nourriture (suivi calories façon Lifesum).
// v11 : bump de cache — sous-collapse Cyber Secu dans Actu > Actualité.
// v12 : bump de cache — mode Calculatrice dans Finance (entre Full et Mes Actifs).
// v13 : bump de cache — refonte Bon Plan (promos du moment + liste de suivi).
// v14 : bump de cache — demande d'accès Google auto (Actu/À propos) + garde layout mobile.
// v15 : bump de cache — bouton d'accès direct « Découvertes de la semaine » (Scrapping).
// v16 : bump de cache — stats LoL via l'API op.gg sans clé (Riot en repli optionnel).
// v32 : bump de cache — lot 6.4.6 → 6.5.3 (fond blanc icônes fuites, Promos repliées,
// recherche Nourriture résiliente + édition 7 j/historique 30 j, module Note,
// calculatrice page de connexion, ordre GitHub, collapse Classement LoL).
// v33 : bump de cache — Note & Calculatrice intégrées à la grille de tuiles de la page
// de connexion (mêmes chips animées que les autres modules, cliquables).
// v34 : bump de cache — nouvelle section Jeux (selectbox 11 mini-jeux, en cours de construction).
// v35 : bump de cache — les 11 mini-jeux sont développés et jouables (2048, Démineur, Flappy,
// Go, Inposteur, Morpion, Motus, Osu, Puissance 4, Snake, TierList).
// v36 : bump de cache — 2 jeux de plus dans Jeux : Memory (paires) et Bataille navale (vs IA).
// v37 : bump de cache — module « Nourriture » renommé « Santé » (libellé visible ; id `food` inchangé).
// v38 : bump de cache — nouveau module « Vêtement » (vide pour le moment).
const CACHE  = 'spotifyplus-v38';
const ASSETS = ['./', './index.html', './vendor/sql-wasm.js', './vendor/sql-wasm.wasm',
                './vendor/leaflet.js', './vendor/leaflet.css'];

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
    // Network-first : version fraîche si en ligne, cache en secours hors-ligne.
    // { cache: 'no-store' } → on court-circuite le cache HTTP du navigateur (max-age=600
    // de GitHub Pages) pour toujours récupérer le dernier index.html déployé. On fetch par
    // URL (pas e.request) car une Request en mode 'navigate' + init lève une exception.
    e.respondWith(
      fetch(e.request.url, { cache: 'no-store' })
        .then(res => {
          // Ne mettre en cache QUE les réponses OK : sinon une page 404/5xx (GitHub Pages
          // en maintenance, erreur transitoire) écraserait './index.html' en cache et serait
          // servie hors-ligne à la place de l'app.
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
  } else {
    // Autres ressources : cache-first comme avant
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
