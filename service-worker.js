// Service worker de Spotify+ — l'historique des versions de cache vit dans git, pas ici.
// Règles durables (détaillées dans le handler `fetch`) :
//  · app shell en NETWORK-FIRST plafonné (SHELL_TIMEOUT_MS), `{ cache: 'no-cache' }` —
//    jamais 'no-store' (plus de requête conditionnelle) ni un retour au cache-first (les
//    PWA installées ne recevaient plus aucune mise à jour) ;
//  · clé de cache NORMALISÉE './index.html', jamais l'URL de navigation (le retour OAuth
//    `?code=…&state=…` écrivait le code d'autorisation dans Cache Storage) ;
//  · CACHE bumpé à chaque déploiement, VENDOR seulement quand un fichier de vendor/ change.
const CACHE  = 'spotifyplus-v684';          // app shell — bumpé à chaque déploiement
// ⚠ À bumper UNIQUEMENT quand un fichier de vendor/ change (mise à jour de sql.js, de
// Leaflet, des mots de Motus). Le bumper à chaque commit annulerait tout le gain.
const VENDOR = 'spotifyplus-vendor-v2';
// ⚠ UNE SEULE entrée pour l'app shell. La liste portait aussi './' : deux URL distinctes
// pour le MÊME fichier de 3,1 Mo, donc `addAll` le téléchargeait DEUX FOIS et en gardait
// deux copies — alors que la copie sous './' n'était jamais relue (le `fetch` handler lit
// et écrit toujours la clé normalisée './index.html', et toute navigation same-origin
// finissant par '/' part de toute façon dans la branche app shell).
// + les deux scripts chargés à la demande par l'app (moteur Doodle, catalogue Sport) : ils
// changent avec index.html, ils vivent donc dans SON cache, pas dans le vendor immuable.
const ASSETS = ['./index.html', './vendor/doodle.js', './vendor/sport-data.js', './vendor/dobble-art.js'];
// Fichiers immuables et légers du shell, précachés avec le vendor : sans eux, une PWA
// lancée hors ligne n'a ni manifeste ni icône — et `notify()` affiche ses notifications
// sans le moindre visuel (elle demande ./icon-192.png, qui n'était nulle part en cache).
const VENDOR_ASSETS = ['./vendor/sql-wasm.js', './vendor/sql-wasm.wasm',
                       './vendor/react.production.min.js', './vendor/react-dom.production.min.js',
                       './vendor/fonts.css', './vendor/fonts/dmsans-var-latin.woff2',
                       './vendor/fonts/dmmono-400-latin.woff2', './vendor/fonts/dmmono-500-latin.woff2',
                       './vendor/leaflet.js', './vendor/leaflet.css',
                       './vendor/motus-words.js', './vendor/motus-dico.js',
                       './manifest.json', './icon-192.png', './icon-512.png'];

// `addAll` refetch tout ce qu'on lui donne : on ne lui passe donc QUE ce qui manque, sinon
// le simple fait de réinstaller le worker repayerait les 1,9 Mo qu'on cherche à garder.
async function primeVendor() {
  const c = await caches.open(VENDOR);
  // ⚠ Les 15 sondes EN PARALLÈLE : la boucle séquentielle payait 15 allers-retours vers
  // Cache Storage l'un après l'autre à chaque installation du worker, c'est-à-dire à chaque
  // déploiement, alors qu'elles ne dépendent pas les unes des autres.
  const hits = await Promise.all(VENDOR_ASSETS.map(u => c.match(u)));
  const missing = VENDOR_ASSETS.filter((_, i) => !hits[i]);
  if (missing.length) await c.addAll(missing);
}

self.addEventListener('install', e => {
  self.skipWaiting();
  // ⚠ Le vendor ne doit JAMAIS faire échouer l'install de l'app shell : une seule URL en
  // erreur ferait rejeter `addAll` en entier et le worker ne s'installerait pas du tout.
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c => c.addAll(ASSETS)),
    primeVendor().catch(() => {}),
  ]));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // ⚠ DEUX caches sont PRÉSERVÉS en plus du courant :
      //   · `spotifyplus-compiled` — le code JSX déjà compilé, écrit par l'amorçage
      //     d'index.html. Sans l'exception, chaque déploiement l'effacerait juste après que la
      //     page vient de l'écrire, et l'app repayerait ~20 s de compilation à l'ouverture
      //     suivante. Ce cache se purge lui-même (l'amorçage supprime les autres versions).
      //   · `VENDOR` — les fichiers immuables de vendor/ (1,9 Mo). C'est TOUT l'intérêt de
      //     l'avoir séparé : le purger ici le ferait retélécharger à chaque déploiement.
      // ⚠ Seuls les caches `spotifyplus-*` sont purgés : `caches.keys()` couvre TOUTE l'origine
      // pierre-portfolio.github.io, que partagent les autres dépôts GitHub Pages du compte —
      // effacer « tout ce qui n'est pas à nous » détruisait les caches de leurs PWA.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('spotifyplus-') && k !== CACHE && k !== VENDOR && k !== 'spotifyplus-compiled').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Chemin EXACT de l'app shell, déduit de la portée d'enregistrement du worker
// (ex. '/NewSpotifyRelease/'). ⚠ Le test précédent était `pathname.endsWith('/')`, donc
// N'IMPORTE QUEL dossier same-origin — '/NewSpotifyRelease/data/' ou '/vendor/' — était
// traité comme l'app shell et sa réponse écrite sous la clé './index.html'. C'est le même
// trou que v388 a bouché pour `mode === 'navigate'`, en plus étroit : on le ferme pour de bon.
const SCOPE_PATH = new URL(self.registration.scope).pathname;

// Au-delà de ce délai, on sert l'app shell en cache plutôt que de continuer à attendre.
// 1,5 s : au-dessus du temps de réponse habituel en Wi-Fi (l'utilisateur reçoit alors la
// version fraîche), en dessous du seuil où l'attente devient une panne perçue.
const SHELL_TIMEOUT_MS = 1500;

// Signature d'une réponse, pour reconnaître un app shell différent SANS relire 3,2 Mo :
// l'ETag de GitHub Pages, à défaut Last-Modified. `null` = impossible à comparer.
const shellTag = r => (r && (r.headers.get('ETag') || r.headers.get('Last-Modified'))) || null;
// Prévient UNE page précise qu'elle tourne sur une version périmée.
// ⚠ Surtout pas `clients.matchAll()` : un téléchargement de fond peut se terminer APRÈS la
// fermeture de la page qui l'a lancé, et le bandeau s'afficherait alors sur la page suivante
// — qui a justement déjà la version fraîche. On ne parle qu'au client servi (`id`), et s'il
// n'existe plus, personne n'est prévenu : c'est le comportement voulu.
async function notifyShellUpdated(id) {
  if (!id) return;
  const c = await self.clients.get(id);
  if (c) { try { c.postMessage({ type: 'shell-updated' }); } catch (_) {} }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // ⚠ UNIQUEMENT la racine ou index.html. Avant : `mode === 'navigate' || …`, donc N'IMPORTE
  // QUELLE navigation same-origin (data/actu.json ou service-worker.js ouverts dans un onglet)
  // était traitée comme l'app shell et sa réponse écrite sous la clé './index.html' — le shell
  // en cache devenait ce JSON, servi comme app au premier lancement sur réseau lent.
  const isAppShell = url.origin === location.origin &&
    (url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH + 'index.html');

  if (isAppShell) {
    // Network-first AVEC PLAFOND DE TEMPS.
    // Avant : on attendait le réseau sans limite. L'app shell fait 3,2 Mo (~0,95 Mo compressé)
    // et il est revalidé à CHAQUE lancement (`no-cache`, voir plus bas) : sur un réseau
    // lent l'app restait bloquée aussi longtemps qu'il le fallait, et le `.catch` ne servait
    // à rien puisqu'il ne se déclenche que sur une VRAIE erreur, jamais sur la lenteur.
    // Maintenant : au-delà de SHELL_TIMEOUT_MS, on sert la copie en cache et le téléchargement
    // CONTINUE en arrière-plan pour mettre le cache à jour.
    // ⚠ Ce n'est PAS un retour au cache-first (interdit, voir l'en-tête) : la version fraîche
    // est demandée à chaque lancement et remplace toujours le cache. Le seul effet est qu'une
    // mise à jour arrivée trop tard s'applique au lancement SUIVANT — d'où le message
    // « shell-updated » ci-dessous, qui permet à la page de le signaler tout de suite.
    // ⚠ S'il n'y a RIEN en cache (toute première visite), on attend le réseau sans plafond :
    // il n'y a rien d'autre à servir.
    // { cache: 'no-cache' } → le cache HTTP du navigateur ne peut plus servir une copie
    // périmée sans contrôle (c'est le but : GitHub Pages envoie max-age=600), mais la requête
    // reste CONDITIONNELLE — If-None-Match part avec l'ETag connu, et un shell inchangé
    // revient en 304 de quelques centaines d'octets.
    // ⚠ Surtout PAS 'no-store' (l'ancien réglage) : il fait comme s'il n'existait aucun cache
    // HTTP, donc aucun en-tête conditionnel n'est envoyé et les 3,1 Mo repartaient EN ENTIER
    // à chaque lancement, y compris quand rien n'avait changé.
    // On fetch par URL (pas e.request) car une Request en mode 'navigate' + init lève une exception.
    const net = fetch(e.request.url, { cache: 'no-cache' }).then(res => {
      // Ne mettre en cache QUE les réponses OK : sinon une page 404/5xx (GitHub Pages
      // en maintenance, erreur transitoire) écraserait './index.html' en cache et serait
      // servie hors-ligne à la place de l'app.
      if (!res.ok) return res;
      const copy = res.clone();
      return caches.open(CACHE).then(c => c.put('./index.html', copy)).then(() => res, () => res);
    });
    // ⚠ waitUntil appelé SYNCHRONEMENT (comme respondWith) : le téléchargement doit aller à
    // son terme même quand on a déjà répondu depuis le cache, sinon le navigateur peut
    // arrêter le service worker avant que la mise à jour soit écrite.
    e.waitUntil(net.catch(() => {}));
    e.respondWith((async () => {
      const cached = await caches.match('./index.html');
      if (!cached) return net;   // toute première visite : rien d'autre à servir
      let raceTimer = null;
      const fresh = await Promise.race([
        net.then(r => (r && r.ok) ? r : null, () => null),
        new Promise(r => { raceTimer = setTimeout(() => r(null), SHELL_TIMEOUT_MS); }),
      ]);
      clearTimeout(raceTimer);
      if (fresh) return fresh;   // le réseau a gagné : l'utilisateur a déjà la version fraîche
      // On sert le cache. Si le téléchargement en cours rapporte un shell DIFFÉRENT de celui
      // qu'on vient de servir, la page tourne sur une version périmée → on le lui dit.
      // ⚠ Comparaison avec la copie RÉELLEMENT SERVIE, et pas avec le téléchargement
      // précédent : sinon le bandeau s'afficherait alors que l'utilisateur a déjà le neuf.
      const servedTag = shellTag(cached);
      // Sur une navigation, la page qu'on est en train de servir n'existe pas encore :
      // son identifiant est `resultingClientId` (`clientId` pour une sous-ressource).
      const servedId = e.resultingClientId || e.clientId;
      net.then(res => {
        const tag = res && res.ok ? shellTag(res) : null;
        if (tag && servedTag && tag !== servedTag) notifyShellUpdated(servedId);
      }).catch(() => {});
      return cached;
    })());
  } else if (url.origin === location.origin && url.pathname.includes('/data/')) {
    // data/*.json (Actu, indices, calendrier macro) : RÉSEAU D'ABORD, repli sur la dernière
    // copie en cache (Actu et Finance restent lisibles hors ligne). Rangé dans CACHE (purgé à
    // chaque déploiement, sans importance : il se remplit au 1er usage).
    // ⚠ Clé = le chemin SANS la query : l'app demande `actu.json?_=<horodatage>`, chaque
    // appel était une URL neuve — aucune copie n'était jamais retrouvée (ni repli hors ligne)
    // et chaque ouverture ajoutait ~140 Ko au cache jusqu'au déploiement suivant.
    // ⚠ Réseau d'abord et non l'inverse : l'app lit ces fichiers en `no-store` parce qu'elle
    // veut le DERNIER relevé commité ; servir la copie de la visite précédente le retarderait.
    const key = new Request(url.origin + url.pathname);
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {}));
        return res;
      }
      return caches.match(key).then(cached => cached || res);
    }, err => caches.match(key).then(cached => { if (cached) return cached; throw err; })));
  } else if (url.origin === location.origin) {
    // Ressources locales (vendor/, icônes) : cache-first, tous caches confondus —
    // `caches.match` sans option balaie aussi bien CACHE que VENDOR.
    // ⚠ Un MISS est désormais MIS EN CACHE. Avant, la réponse réseau était servie telle
    // quelle sans être écrite : tout fichier de vendor/ oublié dans VENDOR_ASSETS marchait
    // en ligne et disparaissait hors ligne, sans le moindre signal. On l'écrit dans CACHE
    // (et non VENDOR) : il est purgé au déploiement suivant, donc une version périmée ne
    // peut pas s'installer à demeure — c'est précisément ce que VENDOR, lui, assume.
    // ⚠ Le worker lui-même est EXCLU : le navigateur doit toujours aller le chercher au
    // réseau pour détecter une mise à jour.
    const isWorker = url.pathname === SCOPE_PATH + 'service-worker.js';
    e.respondWith(caches.match(e.request).then(r => {
      if (r) return r;
      return fetch(e.request).then(res => {
        if (isWorker || !res.ok || res.type !== 'basic') return res;
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}));
        return res;
      });
    }));
  }
  // ⚠ Tout ce qui est CROSS-ORIGIN sort du worker sans être touché. Avant, ces requêtes
  // passaient elles aussi par `caches.match()` : le poll player toutes les 5 s, les appels
  // IA, TMDB, les pochettes scdn.co et les tuiles OSM payaient un aller-retour vers Cache
  // Storage pour un résultat toujours vide — rien de tout cela n'est jamais mis en cache.
});
