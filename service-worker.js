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
// v98 : bump de cache — 2 nouvelles destinations de sauvegarde : pCloud (OAuth) et MEGA (email+mdp, megajs vendorisé et précaché).
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
const CACHE  = 'spotifyplus-v169';
const ASSETS = ['./', './index.html', './vendor/sql-wasm.js', './vendor/sql-wasm.wasm',
                './vendor/leaflet.js', './vendor/leaflet.css',
                './vendor/motus-words.js', './vendor/motus-dico.js',
                './vendor/megajs.js'];

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
