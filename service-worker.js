// v7 : ajout de Leaflet auto-hébergé (vendor/leaflet.js + .css, section Maps) au précache.
// v6 : bump de cache (force la maj des PWA installées) + le fetch réseau de l'app shell
// bypasse désormais le cache HTTP du navigateur ({ cache: 'no-cache' } depuis v378). Sinon GitHub Pages
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
// Go, Imposteur, Morpion, Motus, Osu, Puissance 4, Snake, TierList).
// v36 : bump de cache — 2 jeux de plus dans Jeux : Memory (paires) et Bataille navale (vs IA).
// v37 : bump de cache — module « Nourriture » renommé « Santé » (libellé visible ; id `food` inchangé).
// v38 : bump de cache — nouveau module « Vêtement » (vide pour le moment).
// v39 : bump de cache — nouveau module « Frigo Massy » (vide pour le moment).
// v45 : bump de cache — vrai Motus (portage du projet perso) + données de mots
// vendor/motus-words.js / motus-dico.js (chargées lazy, précachées pour l'offline).
// v46 : bump de cache — vraie TierList à images (portage du projet perso LocalTierList,
// clé partagée tierlist-v1, drag & drop tactile).
// v47 : bump de cache — nouveau jeu UnderCoverDraw (dessin & déduction 3-8 joueurs,
// portage du projet perso, 344 couples de mots inline).
// v56 : bump de cache — fix import d'images TierList (FileReader data: URL au lieu de
// blob:, bloqué par la CSP img-src).
// v57 : bump de cache — nouveau jeu Doodle Jump (solo canvas, plateformes/ressorts/
// jetpack/monstres/trous noirs).
// v58 : bump de cache — TierList : échange de 2 images par drag&drop (réordonner dans un
// rang) ; Doodle Jump ralenti ~20 % + sauter sur un monstre l'écrase et fait rebondir.
// v61 : bump de cache — module Sport : collapse par partie du corps + exos à griser.
// v62 : bump de cache — nouveau module Emploi (salaire vs secteur + offres du moment).
// v63 : bump de cache — Frigo : assistant IA (photo→ingrédients, 10 recettes, recette d'un plat)
// via Google Gemini (clé perso locale).
// v64 : bump de cache — Mot de Passe : édition d'une entrée, réordonnancement drag & drop,
// système de tags (filtre + création), le tout dans le coffre chiffré (exporté/synchro).
// v65 : bump de cache — export/import & synchro Drive/Dropbox élargis : Frigo, Vêtement
// (sans photos), Emploi, Sport, clés/pseudos API, records de jeux, préférences.
// v66 : bump de cache — Sport : sous-collapse Running vide en tête.
// v67 : bump de cache — To do : boutons ‹ › × plus gros et plus espacés.
// v68 : bump de cache — Alertes : ligne « Carte de crédit » dans la rubrique Finance.
// v69 : bump de cache — retrait de la popup « compte Spotify Free ? » (403) au changement de titre.
// v70 : bump de cache — fix nav « suivant/précédent » du feed quand le titre courant est filtré hors liste (repli sur la dernière position connue au lieu de repartir à 0).
// v71 : bump de cache — bouton Découvertes de la semaine : rappel jaune chaque lundi, couleur initiale une fois cliqué (jusqu'au lundi suivant).
// v72 : bump de cache — Vêtement : section « Mes marques » (marques aimées + types d'articles).
// v73 : bump de cache — Finance : la section CRYPTO affiche « PEPE = X % d'un BTC » (position PEPE cachée) au lieu du badge EUR/USD.
// v74 : bump de cache — nouveau module « API » (liste de toutes les API + export JSON des cochées).
// v75 : bump de cache — Note : espace « Note crypté » séparé (mot de passe global, clic sur le titre), plus de mdp par note.
// v76 : bump de cache — TV Time YouTube : tag « garder uniquement les Shorts » (affiche/notifie que les Shorts) + demande à l'ajout d'une chaine 100% Shorts.
// v84 : bump de cache — Actu : collapse « Cartographie » (au-dessus des fuites) regroupant Réseaux de Transport Paris + Feux de forêt + Guerre + Qualité de l'air.
// v85 : bump de cache — Cartographie : chaque carte a un bouton « ⛶ Plein écran » (overlay) + bouton « ← Retour » (Échap) pour revenir.
// v86 : bump de cache — Cartographie : « Feux de forêt » (EFFIS, ne s'affichait pas) remplacé par « Catastrophes naturelles » (GDACS, multi-aléas mondial).
// v87 : bump de cache — Cartographie : nouvelle carte « Qualité de l'eau » (dansmoneau.fr, eau du robinet par commune).
// v88 : bump de cache — Cartographie : nouvelle carte interactive INSEE (insee.fr).
// v89 : bump de cache — Cartographie : nouvelle carte « Santé » (odisse.santepubliquefrance.fr) + sous-collapses triés par ordre alphabétique.
// v90 : bump de cache — Cartographie : nouvelle carte « Aurores boréales » (spaceweatherlive.com).
// v91 : bump de cache — TV Time YouTube : clic sur la miniature d'une vidéo → ouvre la vidéo (nouvel onglet) + marque vue automatiquement.
// v92 : bump de cache — Cartographie : cartes réparées (refusaient l'iframe) → Aurores (image NOAA SWPC), Catastrophes naturelles (VolcanoDiscovery), Carte INSEE (mode iframe statistiques-locales), Qualité de l'eau (infoeau.fr).
// v98 : bump de cache — nouvelle destination de sauvegarde : pCloud (OAuth).
// v99 : bump de cache — connexion Google Drive/YouTube réparée : Google a coupé le flux
// OAuth implicite par redirection (« Erreur 400 : invalid_request ») → passage à Google
// Identity Services (popup, script accounts.google.com/gsi/client chargé lazy).
// v100 : bump de cache — Alertes : nouvelle ligne « Couple avec Cécile » (rubrique Anniversaire).
// v101 : bump de cache — Alertes : rappels récurrents (« Couple avec Cécile » resonne tous les
// 6 mois — la date saisie est l'origine, l'appli vise toujours la prochaine échéance).
// v102 : bump de cache — Actu > Cartographie : nouvelle carte « Espèces animales »
// (mappemonde Leaflet + densité d'observations GBIF, recherche d'espèce, sans clé).
// v103 : bump de cache — Stats > Jeux : nouveau collapse « Clash Royale » (stats de joueur
// via l'API officielle Supercell, relayée par le proxy RoyaleAPI).
// v104 : bump de cache — Stats > Jeux : nouveau collapse « Hearthstone » (stats de la base
// de cartes via HearthstoneJSON — Blizzard n'expose aucune stat de joueur pour ce jeu).
// v105 : bump de cache — Stats > Jeux : nouveau collapse « Counter-Strike » (stats CS2 à vie
// via l'API Web Steam, sur les identifiants Steam déjà saisis).
// v106 : bump de cache — fix des chips de raccourci de la carte « Espèces animales »
// (le terme cliqué n'était pas pris en compte : recherche lancée avec l'ancien état).
// v130 : bump de cache — connexion Spotify : la raison de l'échec est enfin AFFICHÉE sur
// l'écran de connexion (code refusé, state invalide, /me en 403 « compte non déclaré dans le
// Dashboard »…) au lieu d'un retour muet à la page de connexion.
// v146 : bump de cache — Musique : nouveau collapse « 🔀 Delta Playlist » (likés rangés dans
// aucune playlist, puis les titres non likés de chaque playlist ; analyse déclenchée à la main).
// v147 : bump de cache — Delta Playlist ne voyait AUCUNE playlist perso : le scope
// playlist-read-private manquait (Spotify renvoyait 200 avec les seules playlists publiques).
// Scope ajouté + bandeau « déconnecte-toi/reconnecte-toi » tant qu'il n'est pas accordé.
// v148 : bump de cache — Delta Playlist : bouton debug « Tout afficher » (contenu brut lu,
// sans filtre) + détail des réponses Spotify (entrées reçues vs titres reconnus).
// v149 : bump de cache — Delta Playlist : correctif « aucun titre trouvé dans les playlists »
// (la migration 2026 a renommé le champ track → item dans les entrées de playlist) + la
// cascade /items → /tracks n'est plus court-circuitée par une réponse « items: [] ».
// v150 : bump de cache — Finance : section RSI (24 h en crypto, journalier ailleurs) +
// nouveau mode « BullRun » (Trends, Coinbase Play, Altcoin Season, Crypto Bubbles,
// MacroÉconomie, Rainbow Chart).
// v151 : bump de cache — Démineur : appui long 2 s = drapeau, nombre de mines réglable
// de 10 à 100 via le bouton 💣 (la grille s'agrandit), drapeau réduit de 20 %.
// v152 : bump de cache — Finance : axe horizontal daté sur les graphiques (6 graduations
// « 23/03 » avec un petit trait au-dessus de chaque date).
// v153 : bump de cache — nouveau module « Collection » (4 boutons carrés Cartes /
// Displate / Pop / Autres, sans action pour l'instant).
// v223 : bump de cache — nouveau module « Histoire » (ville + photos → résumé de l'œuvre
// et lien avec la ville, via l'API Claude).
// v224 : bump de cache — Histoire : illustration des fiches par Google Images (Custom
// Search JSON API, clé + ID de moteur saisis dans le module API).
// v251 : bump de cache — MEGA retiré du projet (destination de sauvegarde supprimée,
// vendor/megajs.js supprimé du dépôt et du précache).
// v252 : bump de cache — Vêtement : « Short » renommé « Short classique » + nouveau type
// « Short de sport » (sous-catégorie Bas).
// v253 : bump de cache — Vêtement : nouveau type « Bracelet » (sous-catégorie Accessoires).
// v254 : bump de cache — la vue compacte « contrôles Spotify » (viewport court) ne
// s'applique plus que dans le module Musique.
// v255 : bump de cache — Vêtement : flèches ‹ › dans la visionneuse photo (changer de
// vêtement dans la même catégorie, avec retour au début aux extrémités).
// v377 : bump de cache — Motus : « Je donne ma langue au chat » devient « 👀 Voir la
// correction » et rejoint la barre du haut, à droite de « ↻ Nouveau mot ».
// v378 : DEUX caches au lieu d'un. Le précache mélangeait l'app shell (qui change à chaque
// commit) et les fichiers de `vendor/` (qui ne changent quasiment jamais) : bumper CACHE
// purgeait tout à l'`activate`, et l'`install` suivante retéléchargeait 1,9 Mo immuable
// (motus-dico 1,09 Mo + sql-wasm.wasm 639 Ko + Leaflet 162 Ko) — à CHAQUE déploiement, alors
// même que Motus est censé être chargé à la demande.
// v379 : bump de cache — lot de correctifs (jeton Spotify/Dropbox non écrit en silence sur
// stockage plein, clés de jour en heure locale, filtre par genre en mémoire).
// v380 : bump de cache — durcissement sécurité (no-referrer sur les images à hôte
// arbitraire, provenance des sources d'actu, garde same-origin de MapFrame, repli IA annoncé).
// v381 : bump de cache — optimisations. L'app shell n'est plus précaché qu'UNE fois
// (`ASSETS` portait './' ET './index.html' : 3,1 Mo téléchargés deux fois, dont une copie
// jamais relue) ; manifeste et icônes rejoignent le précache vendor (notification hors
// ligne sans icône) ; plafond de temps sur les appels IA ; contrôles des 3 lecteurs
// factorisés ; numéro de rang du feed rendu par compteur CSS (il levait une ReferenceError).
// v382 : bump de cache — retrait du code mort (~250 lignes) : bloc « MODULE DEV · STATS
// GITHUB » entier (doublon plus ancien de GithubStatsSection, jamais rendu), flux OAuth
// Drive implicite legacy, table HUB_CARDS (HubHome dérive de TOGGLE_MODULES), 6 schémas IA
// et une quinzaine de constantes/helpers sans consommateur.
// v383 : bump de cache — correctifs. Filet d'amorçage (l'écran d'attente ne peut plus
// rester figé sans message ni issue) ; seul accès localStorage non protégé du fichier, au
// niveau module, qui pouvait empêcher React de monter ; ordre du feed pendant une synchro ;
// feed non filtré après restauration ; échec Dropbox annoncé ; Retry-After au format date ;
// jokers LIKE échappés dans le filtre par genre.
// v384 : bump de cache — badge de repli IA. Quand la première IA n'a pas répondu et
// qu'une autre a pris le relais, un badge orange « ⤵ Gemini → Groq » (avec 📷 si la
// requête emportait une photo) s'affiche à côté du résultat : Histoire, Actu, résumé de
// vidéo, Santé. La fiche d'Histoire annonçait « rédigée par Gemini » même quand un autre
// fournisseur l'avait écrite — elle nomme désormais le bon.
// v385 : bump de cache — sécurité. `safeHref` sur toutes les URL venant d'une IA ou d'une
// API tierce (les sources d'une fiche Histoire et les offres IA de Bon Plan pouvaient
// porter un `javascript:` exécuté au clic, CSP `unsafe-inline`) ; sauvegarde chiffrable
// (l'export contenait le jeton GitHub et toutes les clés d'API en clair) ; nonce anti-CSRF
// sur Dropbox ; clé Gemini en en-tête au lieu de la query string ; form-action 'none'.
// v386 : optimisations. React auto-hébergé + polices auto-hébergées (précache vendor → bump
// VENDOR v2, avec le manifeste enrichi) ; moteur Doodle et catalogue Sport sortis d'index.html
// vers vendor/doodle.js et vendor/sport-data.js, chargés à la demande (précachés avec l'app
// shell : ils changent avec elle) ; data/*.json en stale-while-revalidate (Actu et Finance
// s'affichent hors ligne et sans attendre le réseau).
// v388 : correctifs. L'app shell n'est plus reconnu à `mode === 'navigate'` seul (n'importe
// quelle navigation same-origin — data/actu.json ouvert dans un onglet — écrasait la copie de
// l'app en cache par sa réponse) ; minuteur de la course réseau/cache libéré.
// v389 : sécurité. Sauvegardes chiffrées par défaut, clés d'API masquées (👁), code d'erreur
// OAuth seul dans le bandeau (plus de texte libre venu de l'URL), MapFrame sans
// allow-popups-to-escape-sandbox, state Dropbox legacy refusé.
// v390 : optimisations. Avancement de la synchro sorti du contexte du store (il le recréait
// 1×/s pendant un scrapping, réveillant ses 27 abonnés) ; clé PBKDF2 dérivée mise en cache
// (l'autosave d'une note cryptée repayait 600k itérations par pause de frappe) ; journal
// d'écoutes en nombres bruts + cache mémoire ; index type→fiches dans Vêtement ; sondes du
// précache vendor en parallèle.
// v391 : code mort. `progress` et `offlineReady` (deux états sans le moindre lecteur, le
// second remplacé par un bouton hors ligne toujours affiché), quatre champs exposés par le
// store que personne ne lisait, la keyframe CSS `hub-pop` et l'écriture de `ytg_scopes`.
// v392 : correctifs. L'app shell est le chemin EXACT du scope (n'importe quel dossier
// same-origin y était assimilé) ; une ressource locale absente du précache est enfin mise en
// cache (elle marchait en ligne et disparaissait hors ligne) ; la synchro des likes ne grille
// plus son cooldown de 24 h après un 429 ; localStorage bloqué ne démonte plus l'app ;
// borne de temps sur les relais LoL ; `state` OAuth à usage unique ; clés `__proto__`
// refusées à la restauration.
// v393 : sécurité. La clé Riot ne part plus vers les relais publics sans accord explicite
// (essai direct en en-tête d'abord, case à cocher ensuite) ; cours boursiers relayés
// contrôlés et leur provenance affichée ; redirections bornées à http/https côté Action ;
// origine vérifiée sur les messages du lecteur YouTube.
const CACHE  = 'spotifyplus-v443';          // app shell — bumpé à chaque déploiement
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
const ASSETS = ['./index.html', './vendor/doodle.js', './vendor/sport-data.js'];
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
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== VENDOR && k !== 'spotifyplus-compiled').map(k => caches.delete(k))))
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
    // data/*.json (Actu, indices) : STALE-WHILE-REVALIDATE. On répond tout de suite avec la
    // copie en cache s'il y en a une (Actu et Finance s'affichent hors ligne et sans attendre
    // le réseau), et le téléchargement met le cache à jour pour la prochaine fois. Rangé dans
    // CACHE (purgé à chaque déploiement, c'est sans importance : il se remplit au 1er usage).
    // ⚠ `waitUntil` : la mise à jour doit aller à son terme même quand on a déjà répondu.
    const net = fetch(e.request).then(res => {
      if (!res.ok) return res;
      const copy = res.clone();
      return caches.open(CACHE).then(c => c.put(e.request, copy)).then(() => res, () => res);
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match(e.request).then(cached => cached || net));
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
