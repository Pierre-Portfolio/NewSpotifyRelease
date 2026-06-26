<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Nouvelles Sorties

## Aperçu
Application web PWA pour scanner les artistes Spotify suivis, détecter leurs nouvelles sorties et les stocker **localement sur l'appareil** (sql.js + IndexedDB). Aucun serveur requis. Chaque artiste est scrappé depuis sa propre date de dernier scan. L'utilisateur explore son feed de découverte, écoute les titres un par un et les valide — aucun ajout automatique en playlist.

## Fonctionnalités

### Synchronisation
- Authentification sécurisée via OAuth 2.0 PKCE (100% client-side, paramètre `state` anti-CSRF)
- Scraping des artistes suivis avec délai configurable (10 / 20 / 30s) + jitter aléatoire 1-3s
- **Dates de scraping par artiste** : chaque artiste est scrappé depuis sa propre `last_scraped_at` (défaut : 2026-03-15) — plus de date globale à choisir
- Mise à jour automatique de `last_scraped_at` dans `artists_scraped` après chaque artiste scanné — **uniquement si le scan a réussi** (un échec réseau ne fait plus perdre de sorties)
- **Les sorties publiées le jour même du dernier scan ne sont plus ratées** (cutoff arrondi au jour)
- **Un album dont une piste était déjà sortie en single n'est plus sauté** — les 20 dernières sorties de chaque artiste sont vérifiées
- Pause / reprise de la sync en cours de session — **la pause bloque vraiment tous les appels Spotify**
- **Reprise après interruption** : si l'app est fermée ou le tel éteint en plein milieu, la progression est sauvegardée dans `localStorage`. Le bouton **"↩ Reprendre la synchro en cours"** apparaît immédiatement (plus besoin de recharger la page), avec le compteur et le dernier artiste traité
- **Reprise instantanée par curseur** : la reprise repart directement sur la bonne page d'artistes au lieu de re-parcourir toute la liste depuis le début — plus de rafale de requêtes au clic "Reprendre"
- **Protection rate-limit** : dès la **première erreur 429**, la synchro s'arrête complètement (progression conservée, bouton ↩ Reprendre) et toute l'app est bloquée pendant **15 minutes minimum** (ou le Retry-After de Spotify si plus long). Le blocage **persiste après un F5 et s'applique à TOUTE l'app** (player et imports compris, pas seulement le bouton Lancer) — évite de se faire throttle en boucle quand on relance trop tôt
- **Quota 24h vérifié avant de lancer** : si les 100 artistes de la fenêtre de 24h sont déjà consommés, la synchro refuse de démarrer **sans dépenser la moindre requête** ; un artiste dont le scan échoue ne consomme plus le quota
- **Fenêtre glissante de 24h** : atteindre 100 artistes ouvre un compte à rebours de 24h ; un **countdown du temps restant avant de pouvoir relancer** s'affiche dans la carte Artistes et le panneau Synchronisation (voir section dédiée)
- **État de synchro unifié** : un seul état interne (`idle / running / paused / rl_waiting`) — plus d'états contradictoires entre pause manuelle et pause rate-limit

### Découvertes de la semaine (auto-import hebdo)
- Au login, si la playlist Spotify **"Découvertes de la semaine"** n'a pas été importée depuis 7 jours → import automatique dans le feed
- Les titres apparaissent avec le tag **Découvertes** (violet) et le sous-titre "Découvertes de la semaine"
- La playlist est recherchée sur **toutes les pages** de tes playlists, et son contenu est lu en essayant **les deux endpoints** Spotify (`/items` puis `/tracks`) pour maximiser les chances de succès
- Après un import réussi : nouvel essai dans 7 jours. **En cas d'échec** (playlist introuvable ou contenu refusé) : nouvel essai automatique dans **6 h** seulement (au lieu d'être bloqué une semaine)
- **⚠ Dépend de l'accès accordé par Spotify** : depuis la migration de février 2026, le contenu des playlists éditoriales Spotify n'est pas toujours lisible par les apps tierces. L'app le détecte, l'explique dans les logs et réessaie automatiquement (auto-réparant si Spotify rouvre l'accès)

### Stockage local (sql.js + IndexedDB)
- Base SQLite WebAssembly chargée au démarrage depuis IndexedDB (clé `spotifyplus_db`)
- Schéma minimal en 3 tables : `tracks`, `artists_scraped`, `stats`
- Sauvegarde binaire dans IndexedDB après chaque artiste scrapé, après chaque écoute, à chaque fin de synchro **et quand l'app passe en arrière-plan** (sécurité mobile)
- Sauvegardes **sérialisées** : jamais deux écritures IndexedDB en parallèle, aucune donnée perdue en cas d'actions simultanées
- **Persistance demandée au navigateur** (`navigator.storage.persist()`) — réduit le risque d'éviction des données, surtout sur iOS
- **Garde multi-onglets** : si l'app est ouverte dans deux onglets, un bandeau d'avertissement s'affiche (les sauvegardes s'écraseraient mutuellement)
- **Bouton Purger les écoutes** : supprime **tous** les titres écoutés (likés compris, ce qui vide aussi l'Historique et l'onglet Likés des titres écoutés) — libère de la place sur le long terme. Le **% de titres likés** n'est PAS affecté (compteur indépendant dans la table `stats`)

### Feed de découverte
- File d'attente ordonnée par ID (les plus anciens en premier), jusqu'à **1000 titres** affichés
- **Indicateur titres masqués** : si plus de 1000 titres en DB, un bandeau orange avertit du nombre caché
- Barres égaliseur animées sur le titre en cours de lecture
- Marquage automatique comme écouté quand le titre se termine → disparition animée du feed
- **Auto-avance** : quand un titre se termine, le suivant dans le feed est lancé automatiquement — **sans voler la lecture** : lancer manuellement un autre titre (ou stopper la musique) en plein milieu ne déclenche plus l'auto-avance
- Navigation dans le feed via les flèches ← → de la barre du bas
- **Bouton × par titre** : marque le titre **comme écouté** et le retire du feed → il apparaît dans l'**Historique** et compte dans les **stats d'écoute** (même effet que « Suivant »)
- **Bouton ❤ par titre** : like/unlike directement depuis le feed (synchronisé Spotify + DB locale)
- **Filtre** par type : Tous / Singles / Albums / Découvertes
- **Filtre artiste** : champ texte (insensible à la casse) combinable avec le filtre type et le tri
- **🔎 Filtres et tris sur toute la base** : le filtre type, le filtre artiste et les tris **balaient l'intégralité des titres en attente, pas seulement les 1000 affichés** — un Single, un titre ancien ou un artiste situé au-delà du cap de 1000 apparaît bien dans les résultats (filtrage + tri effectués en base de données)
- **Bouton 🗑 reset** : réinitialise tous les filtres en un clic (visible uniquement si un filtre est actif)
- **Tri** : ordre d'ajout / date de sortie ↑ (du plus ancien au plus récent) / artiste A→Z
- **Bannières de date** (mobile) : séparateur "📅 20 juin 2026" entre chaque jour de sortie — repère visuel affiché en tri "Ordre d'ajout" et "Date sortie ↑" (pas en tri artiste)
- **Navigation filtrée** : next/prev et auto-avance respectent l'ordre du feed filtré
- **Swipe gauche** (mobile) : marque le titre écouté et le retire (→ Historique + stats) · **Swipe droite** : piste précédente

### Player
- Barre de lecture en temps réel (poll toutes les 5s — **suspendu quand l'onglet est caché**, reprise immédiate au retour : économise des centaines de requêtes/heure)
- Boutons **précédent / play-pause / suivant** branchés sur le feed de nouveautés
- **Clic next → démarre à 25%** : le titre suivant commence automatiquement à 25% de sa durée
- **Bouton loop** : répète le titre en cours (`repeat?state=track`) — désactivé par défaut
- **Barre de progression cliquable et draggable** — clic ou glissement pour se déplacer dans le titre
- Compteur de position dans le feed (ex: `3 / 25`)

### Stats
- Compteurs incrémentaux depuis la table `stats` : restantes / **temps d'écoute restant (HH:MM)** / ce mois-ci / cette année / depuis toujours
- **⌛ Temps total écouté** : `SUM(duration_ms) WHERE listened=1` + durée du titre en cours — affiché en `Xh Ymin`
- **❤ % de titres likés** : pourcentage des écoutes likées **via l'app** (`total_liked / écoutes all-time`) — compteur persistant dans la table `stats`, **non affecté par la purge** et indépendant des titres likés sur Spotify avant/hors de l'app
- Réinitialisation automatique des compteurs mois/année au démarrage si la période a changé
- Accessible sur mobile via l'onglet **Stats**
- **Numéro de version** affiché en gris sous le bouton « Purger les écoutes » (ex. `Version 2.0.4`) — basé sur le nombre de commits du dépôt (format `MAJ.MIN.U` : derniers chiffres = patch/minor, le reste = major ; ex. 204 commits → `2.0.4`, 1001 → `10.0.1`)

### Météo
- Section **Météo** dédiée (titre en bleu) — barre latérale droite sur desktop, **onglet propre** dans le menu « ⋯ » sur mobile (avant Historique)
- Prévisions sur **3 jours** (aujourd'hui + 2) pour **4 lieux** : **Voisins-le-Bretonneux**, **Massy**, **Boulogne-Billancourt**, puis **votre position actuelle** (géolocalisation du navigateur — affiche « Position non autorisée » si l'accès est refusé)
- Le dernier lieu s'affiche **« Ma position (ville) »**, la ville étant détectée à partir des coordonnées GPS (reverse-geocoding via [BigDataCloud](https://www.bigdatacloud.com/), gratuit sans clé — repli sur « Ma position » si indisponible)
- Chaque jour : icône météo + température max (en bleu) et min
- **Clic sur un jour** → fiche détaillée : température ressentie, probabilité et cumul de pluie, heures de pluie, vent max + rafales + direction, indice UV, lever/coucher du soleil, et le **détail heure par heure** (température, proba de pluie, météo)
- Données météo via **[Open-Meteo](https://open-meteo.com/)**, API gratuite sans clé (issue du repo [public-apis](https://github.com/public-apis/public-apis)) — aucun backend, appel direct côté client

### Finance
- Section **Finance** dédiée (titre en bleu) — desktop (sidebar droite, sous Météo) et menu « ⋯ » sur mobile
- Données live via **APIs gratuites sans clé** ; chaque sous-section affiche le taux **EUR/USD** ([Frankfurter](https://www.frankfurter.app/), données BCE)
- **Bouton Light / Full** (Light par défaut) : en mode **Light** seules les valeurs essentielles sont affichées (**Bitcoin, PEPE, Or, NASDAQ, NVIDIA**) ; le mode **Full** affiche tout. Choix mémorisé.
- **Crypto** : Bitcoin, Ethereum, Solana, TAO, XRP, PEPE (prix USD + variation 24h) via **[CoinGecko](https://www.coingecko.com/en/api)**
- **Matières premières** : Pétrole (WTI) via **[Stooq](https://stooq.com/)** (sans clé ; peut afficher « — » si l'accès CORS est bloqué) et Or via **[gold-api.com](https://gold-api.com/)**
- **ETF / indices** : S&P 500, NASDAQ, CAC 40 via **[Stooq](https://stooq.com/)** (même réserve CORS)
- **Stock picking** (Full) : NVIDIA, Take-Two (TTWO), Google (GOOGL), Microsoft (MSFT), Amazon (AMZN), Tesla (TSLA) via **Twelve Data** (clé) + repli **[Stooq](https://stooq.com/)**

### To do
- Section **To do** dédiée (titre en violet) — desktop (sidebar droite, sous Finance) et onglet propre dans le menu « ⋯ » sur mobile
- Ajout / suppression de tâches, classées par échéance via un **carrousel** : **Aujourd'hui**, **Dans la semaine**, **Dans le mois**, **Dans l'année**, **À faire un jour**
- Flèches ‹ › (ou points indicateurs) pour parcourir les échéances ; chaque tâche peut être **déplacée** d'un cran d'échéance ou **supprimée**
- Tâches mémorisées localement (aucun backend)

### Quota de scraping : 100 artistes par fenêtre glissante de 24h
- Limité à **100 artistes toutes les 24 heures** (et non par jour calendaire) : atteindre 100 démarre un compteur de 24h, et la prochaine synchro est refusée jusqu'à son expiration
- Compteur affiché dans la carte **Artistes** (`X/100 sur 24h`)
- Persisté dans `localStorage` (`spotifyplus_daily_scrapings` = `{ count, until }`) — le compteur repart à 0 dès que les 24h écoulées
- **Date et compte à rebours** avant de pouvoir relancer, affichés à deux endroits : directement sous le compteur de la carte **Artistes** (`SCRAPING EN ATTENTE`) et dans le panneau **Synchronisation** — texte « ⏳ Quota de 100 artistes atteint — Prochaine synchro le 19 juin à 18:10 (dans X h Y min) », rafraîchi chaque seconde
- Boutons Lancer/Reprendre désactivés tant que la fenêtre est active
- **Bouton 🔄 Réinitialiser le quota 24h** dans l'onglet **Stats** (au-dessus de Purger) : remet le compteur à `0/100` et débloque une synchro immédiatement, sans attendre l'expiration des 24h (avec confirmation)
- Notification navigateur de fin de session (compatible mobile via le service worker)
- **"Temps total de la session"** dans le panneau NextCall : temps restant pour finir les 100 artistes de la fenêtre (`(100 − scrapés) × délai moyen`)
- **"Temps total restant"** dans le panneau NextCall : ETA pour scraper **tous** les artistes restants de la synchro (non plafonnée aux 100/24h)

### Titres likés (onglet ❤ Likés)
- Onglet **❤ Likés** sur mobile (entre "À écouter" et "Historique")
- Like/unlike depuis le **player mobile**, depuis le **feed** (bouton ❤ sur chaque titre), ou depuis l'onglet Likés
- **Sync initiale au login** : l'app vérifie automatiquement les likes Spotify pour les 300 premiers titres du feed (`/me/library/contains`, par lots de 40) — les titres likés avant cette session apparaissent directement dans l'onglet (1× par 24h max)
- La liste est persistée dans la table `tracks` (colonne `liked`) et chargée au démarrage
- Unliker retire le like sur Spotify ET met à jour la base locale
- **⚠ Si tu étais déjà connecté avant la mise à jour** : les likes nécessitent désormais les permissions Spotify `user-library-read/modify` — déconnecte-toi puis reconnecte-toi une fois pour les accorder (l'app affiche une alerte si besoin)

### Historique (onglet Historique)
- Liste des **derniers titres écoutés** non purgés, le **plus récent en haut**
- Chaque ligne affiche le titre, l'artiste, l'horodatage relatif de l'écoute (« il y a 5 min », « hier »…) et un bouton **réécouter**
- Desktop : section **Historique** dans la barre latérale droite (sous « Vos écoutes ») · Mobile : onglet **Historique**
- L'historique est vidé par le bouton **Purger les écoutes**

### Artistes (section / onglet Artistes)
- **Liste de tous les artistes scannés** lors des synchros, avec leurs métadonnées récupérées de Spotify (sans aucune requête supplémentaire)
- Chaque artiste affiche : sa **pochette**, son **nom**, son **identifiant Spotify**, la **date du dernier scrapping** (relative), ses **genres**, sa **popularité** (★ 0-100), son nombre d'**abonnés**, son **nombre de scans**, le **total de titres ajoutés** et le **nombre de sorties trouvées au dernier scan** — plus un badge de statut (**✓ OK** / **⏳ Partiel** / **⚠ Erreur**) et un lien ↗ vers Spotify
- Un artiste apparaît dès que ses albums ont été lus, **même si un rate-limit (429) interrompt le scan ensuite** : il s'affiche alors en **⏳ Partiel** (ses titres déjà trouvés sont ajoutés, et il sera repris au prochain scan sans rien rater)
- **Filtres** comme le feed : recherche par nom ou id, filtre par statut (Tous / OK / **Partiel** / Erreur), tri (scan récent, **scan ancien**, nom A→Z, popularité, titres ajoutés, nombre de scans)
- Desktop : bouton **Artistes** dans la barre du haut (à côté de Scrapping) · Mobile : onglet **Artistes**

### Notifications
- **Fin de session** (100 artistes/jour atteints) : notification navigateur envoyée automatiquement (permission demandée si nécessaire)
- **Scraping de nouveau disponible** : quand le quota 24h ou un blocage rate-limit (429) expire, une notification Chrome prévient que tu peux relancer une synchro

### PWA
- Installable sur écran d'accueil Android (Chrome) — bouton "Ajouter à l'écran d'accueil"
- `manifest.json` + `service-worker.js` — **network-first** : les mises à jour de l'app sont reçues dès qu'on est en ligne, le cache ne sert qu'en mode hors-ligne

### Player mobile (50vh)
- Quand une musique joue, le bas de l'écran affiche un **player plein format (50% de hauteur)**
- Pochette + titre + artiste + position dans le feed (`3 / 25`)
- **Barre de progression draggable** (touch) pour se déplacer dans le titre
- Bouton **❤️ like/unlike** — synchronisé avec les titres likés Spotify
- Boutons **précédent / play-pause / suivant** dans le feed
- Bouton **loop / auto-avance** : alterne entre répéter le titre en cours et passer automatiquement au suivant
- Bouton **+1:00** : avance de 1 minute dans le titre en cours

### Interface
- Responsive — desktop (sidebar) et mobile : 3 onglets principaux (Scrapping / En attente / ❤ Likés) + un menu **« ⋯ »** regroupant Historique / Artistes / Stats pour gagner de la place en haut
- **Mode compact (split-screen)** : quand l'app est placée dans une petite fenêtre (ex. multi-fenêtres sur téléphone, ton projet en bas et une autre app en haut), l'interface se réduit automatiquement à **une barre de contrôles** : titre en cours + **précédent / lecture-pause / suivant / ❤ like**
- Logs en temps réel pendant la sync
- Countdown avant le prochain appel Spotify

## Technologies
- React 18.3.1 (CDN) + Babel Standalone 7.29.7 — **versions épinglées + SRI** (un CDN compromis ne peut plus injecter de code)
- **Content-Security-Policy** : même en cas de faille XSS, le token Spotify ne peut pas être exfiltré vers un domaine tiers (`connect-src` verrouillé sur l'API Spotify)
- **sql.js 1.10.2** (SQLite WebAssembly) **auto-hébergé** dans `vendor/` — le `.wasm` ne pouvant pas avoir de SRI, l'auto-hébergement ferme le dernier vecteur d'attaque CDN
- `apiDel()` — helper DELETE pour l'API Spotify (unlike)
- **IndexedDB** (persistance locale du binaire SQLite, connexion unique réutilisée)
- Spotify Web API (refresh token avec rotation + mutex — plus de déconnexions aléatoires ; retry automatique sur 401 pour tous les verbes HTTP)
- OAuth 2.0 PKCE (le code d'autorisation n'est plus écrit dans le cache du service worker)
- GitHub Pages (hébergement statique — aucun serveur)

## Installation

**Aucune installation nécessaire.** L'app est entièrement statique et hébergée sur GitHub Pages :

👉 **https://pierre-portfolio.github.io/NewSpotifyRelease/**

Au premier lancement, la base de données est créée vide dans le navigateur. La sync Spotify peut démarrer immédiatement après la connexion OAuth.

## Structure du projet
```
NewSpotifyRelease/
  index.html          → App complète (React 18 CDN + sql.js)
  manifest.json       → Config PWA (nom, icônes, display standalone)
  service-worker.js   → Cache app shell + vendor pour offline (v3)
  vendor/
    sql-wasm.js       → sql.js auto-hébergé
    sql-wasm.wasm     → Binaire SQLite WebAssembly auto-hébergé
  icon-192.png        → Icône PWA 192×192 (à ajouter)
  icon-512.png        → Icône PWA 512×512 (à ajouter)
  CLAUDE.md           → Documentation technique pour Claude
  assets/
    images/github/    → Images README
```

## Schéma de la base locale (sql.js)

```sql
-- Titres à écouter (feed)
tracks (id, spotify_uri UNIQUE, artist_name, title, release_title,
        release_type, release_date, cover_url, duration_ms,
        listened DEFAULT 0, liked DEFAULT 0, listened_at,
        added_at DEFAULT datetime('now'))

-- Artistes scrappés : date de dernier scan + métadonnées Spotify + compteurs
artists_scraped (spotify_id PRIMARY KEY, last_scraped_at,
                 name, image_url, popularity, followers, genres, spotify_url,
                 last_release_count, total_tracks_added, last_scan_status, scan_count)

-- Compteurs d'écoute (ligne unique id=1)
stats (id=1, total_listened, listened_this_month, listened_this_year,
       last_reset_month, last_reset_year)
```

## Requêtes locales utiles (console DevTools)

```js
// Afficher les tracks non écoutées
dbAll("SELECT * FROM tracks WHERE listened = 0 ORDER BY id ASC LIMIT 20")

// Afficher les tracks likées
dbAll("SELECT * FROM tracks WHERE liked = 1 ORDER BY id DESC LIMIT 20")

// Vérifier les stats
dbGet("SELECT * FROM stats WHERE id = 1")

// Vérifier les dates de scraping
dbAll("SELECT * FROM artists_scraped ORDER BY last_scraped_at DESC LIMIT 10")

// Compter les tracks par état
dbAll("SELECT listened, liked, COUNT(*) as c FROM tracks GROUP BY listened, liked")
```

## Aperçu de l'interface
<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur
- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)

---

<p align="center">Projet réalisé en 2026.</p>
