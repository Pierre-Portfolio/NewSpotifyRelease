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
- **Quota journalier vérifié avant de lancer** : si les 100 artistes du jour sont déjà consommés, la synchro refuse de démarrer **sans dépenser la moindre requête** ; un artiste dont le scan échoue ne consomme plus le quota
- **Compteur journalier à minuit local** : remise à zéro à minuit (heure locale), plus à 2h du matin (minuit UTC)
- **État de synchro unifié** : un seul état interne (`idle / running / paused / rl_waiting`) — plus d'états contradictoires entre pause manuelle et pause rate-limit

### Découvertes de la semaine (auto-import hebdo)
- Au login, si la playlist Spotify **"Découvertes de la semaine"** n'a pas été importée depuis 7 jours → import automatique dans le feed
- Les titres apparaissent avec le tag **Découvertes** (violet) et le sous-titre "Découvertes de la semaine"
- La date du dernier import est sauvegardée dans `localStorage` (`spotifyplus_dw_last_import`)
- **⚠ Probablement inopérant depuis la migration Spotify de février 2026** : le contenu des playlists éditoriales Spotify n'est plus lisible par les apps tierces. L'app le détecte, l'explique dans les logs et réessaie automatiquement chaque semaine (auto-réparant si Spotify rouvre l'accès)

### Stockage local (sql.js + IndexedDB)
- Base SQLite WebAssembly chargée au démarrage depuis IndexedDB (clé `spotifyplus_db`)
- Schéma minimal en 3 tables : `tracks`, `artists_scraped`, `stats`
- Sauvegarde binaire dans IndexedDB après chaque artiste scrapé, après chaque écoute, à chaque fin de synchro **et quand l'app passe en arrière-plan** (sécurité mobile)
- Sauvegardes **sérialisées** : jamais deux écritures IndexedDB en parallèle, aucune donnée perdue en cas d'actions simultanées
- **Persistance demandée au navigateur** (`navigator.storage.persist()`) — réduit le risque d'éviction des données, surtout sur iOS
- **Garde multi-onglets** : si l'app est ouverte dans deux onglets, un bandeau d'avertissement s'affiche (les sauvegardes s'écraseraient mutuellement)
- **Bouton Purger les écoutés** : supprime les titres écoutés **sauf les likés** (ils portent le like local) — libère de la place sur le long terme

### Feed de découverte
- File d'attente ordonnée par ID (les plus anciens en premier), jusqu'à **1000 titres** affichés
- **Indicateur titres masqués** : si plus de 1000 titres en DB, un bandeau orange avertit du nombre caché
- Barres égaliseur animées sur le titre en cours de lecture
- Marquage automatique comme écouté quand le titre se termine → disparition animée du feed
- **Auto-avance** : quand un titre se termine, le suivant dans le feed est lancé automatiquement — **sans voler la lecture** : lancer manuellement un autre titre (ou stopper la musique) en plein milieu ne déclenche plus l'auto-avance
- Navigation dans le feed via les flèches ← → de la barre du bas
- **Bouton × par titre** : supprime définitivement un titre de la file d'attente sans le compter comme écouté (un titre liké est conservé en base, il sort juste du feed)
- **Bouton ❤ par titre** : like/unlike directement depuis le feed (synchronisé Spotify + DB locale)
- **Filtre** par type : Tous / Singles / Albums / Découvertes
- **Filtre artiste** : champ texte (insensible à la casse) combinable avec le filtre type et le tri
- **Bouton 🗑 reset** : réinitialise tous les filtres en un clic (visible uniquement si un filtre est actif)
- **Tri** : ordre d'ajout / date de sortie ↓ / artiste A→Z
- **Navigation filtrée** : next/prev et auto-avance respectent l'ordre du feed filtré
- **Swipe gauche** (mobile) : supprime le titre · **Swipe droite** : piste précédente

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
- Réinitialisation automatique des compteurs mois/année au démarrage si la période a changé
- Accessible sur mobile via l'onglet **Stats**

### Compteur journalier de scraping (limite Spotify 100/jour)
- Compteur de scrapings effectués aujourd'hui affiché dans la carte **Artistes** (`X/100 aujourd'hui`)
- Persisté dans `localStorage` (`spotifyplus_daily_scrapings`) avec la date du jour — remise à zéro automatique le lendemain
- **"Temps total de la session"** dans le panneau NextCall : temps restant pour finir les 100 artistes d'aujourd'hui (`(100 − scrapés) × délai moyen`)

### Titres likés (onglet ❤ Likés)
- Onglet **❤ Likés** sur mobile (entre "À écouter" et "Stats") avec badge du nombre de likés
- Like/unlike depuis le **player mobile**, depuis le **feed** (bouton ❤ sur chaque titre), ou depuis l'onglet Likés
- **Sync initiale au login** : l'app vérifie automatiquement les likes Spotify pour les 300 premiers titres du feed (`/me/library/contains`, par lots de 40) — les titres likés avant cette session apparaissent directement dans l'onglet (1× par 24h max)
- La liste est persistée dans la table `tracks` (colonne `liked`) et chargée au démarrage
- Unliker retire le like sur Spotify ET met à jour la base locale
- **⚠ Si tu étais déjà connecté avant la mise à jour** : les likes nécessitent désormais les permissions Spotify `user-library-read/modify` — déconnecte-toi puis reconnecte-toi une fois pour les accorder (l'app affiche une alerte si besoin)

### Notifications
- **Fin de session** (100 artistes/jour atteints) : notification navigateur envoyée automatiquement (permission demandée si nécessaire)

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
- Responsive — desktop (sidebar) et mobile (4 onglets : Scrapping / À écouter / ❤ Likés / Stats)
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
        listened DEFAULT 0, liked DEFAULT 0,
        added_at DEFAULT datetime('now'))

-- Dates de dernier scraping par artiste
artists_scraped (spotify_id PRIMARY KEY, last_scraped_at)

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
