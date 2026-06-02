<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Nouvelles Sorties

> ⏰ **TODO (à partir du 04/06/2026)** — Ajouter une fonctionnalité qui importe automatiquement une fois par semaine la playlist "Découvertes de la semaine" Spotify dans la file d'attente du feed.

## Aperçu
Application web PWA pour scanner les artistes Spotify suivis, détecter leurs nouvelles sorties et les stocker **localement sur l'appareil** (sql.js + IndexedDB). Aucun serveur requis. Chaque artiste est scrappé depuis sa propre date de dernier scan. L'utilisateur explore son feed de découverte, écoute les titres un par un et les valide — aucun ajout automatique en playlist.

## Fonctionnalités

### Synchronisation
- Authentification sécurisée via OAuth 2.0 PKCE (100% client-side)
- Scraping des artistes suivis avec délai configurable (10 / 20 / 30s) + jitter aléatoire 1-3s
- **Dates de scraping par artiste** : chaque artiste est scrappé depuis sa propre `last_scraped_at` (défaut : 2026-03-15) — plus de date globale à choisir
- Mise à jour automatique de `last_scraped_at` dans `artists_scraped` après chaque artiste scanné
- Pause / reprise de la sync en cours de session
- **Reprise après interruption** : si l'app est fermée ou le tel éteint en plein milieu, la progression est sauvegardée dans `localStorage`. Au prochain login, un bouton **"↩ Reprendre la synchro en cours"** apparaît avec le compteur et le dernier artiste traité
- Protection rate-limit : sur erreur 429, tous les appels Spotify sont bloqués jusqu'à expiration du cooldown

### Stockage local (sql.js + IndexedDB)
- Base SQLite WebAssembly chargée au démarrage depuis IndexedDB (clé `spotifyplus_db`)
- Schéma minimal en 3 tables : `tracks`, `artists_scraped`, `stats`
- Sauvegarde binaire dans IndexedDB après chaque artiste scrapé et après chaque écoute
- **Bouton Purger les écoutés** : `DELETE FROM tracks WHERE listened = 1` — libère de la place sur le long terme

### Feed de découverte
- File d'attente ordonnée par ID (les plus anciens en premier), jusqu'à **1000 titres** affichés
- Barres égaliseur animées sur le titre en cours de lecture
- Marquage automatique comme écouté quand le titre se termine → disparition animée du feed
- **Auto-avance** : quand un titre se termine, le suivant dans le feed est lancé automatiquement
- Navigation dans le feed via les flèches ← → de la barre du bas

### Player
- Barre de lecture en temps réel (poll toutes les 5s)
- Boutons **précédent / play-pause / suivant** branchés sur le feed de nouveautés
- **Bouton loop** : répète le titre en cours (`repeat?state=track`) — désactivé par défaut
- **Barre de progression cliquable et draggable** — clic ou glissement pour se déplacer dans le titre
- Compteur de position dans le feed (ex: `3 / 25`)

### Stats
- Compteurs incrémentaux depuis la table `stats` : restantes / **temps d'écoute restant (HH:MM)** / ce mois-ci / cette année / depuis toujours
- Réinitialisation automatique des compteurs mois/année au démarrage si la période a changé
- Accessible sur mobile via l'onglet **Stats**

### PWA
- Installable sur écran d'accueil Android (Chrome) — bouton "Ajouter à l'écran d'accueil"
- `manifest.json` + `service-worker.js` — cache l'app shell pour usage offline

### Interface
- Responsive — desktop (sidebar) et mobile (3 onglets : Scrapping / À écouter / Stats)
- Logs en temps réel pendant la sync
- Countdown avant le prochain appel Spotify

## Technologies
- React 18 (CDN) + Babel Standalone
- **sql.js 1.10.2** (SQLite WebAssembly) via CDN
- **IndexedDB** (persistance locale du binaire SQLite)
- Spotify Web API
- OAuth 2.0 PKCE
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
  service-worker.js   → Cache app shell pour offline
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
        listened DEFAULT 0, added_at DEFAULT datetime('now'))

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

// Vérifier les stats
dbGet("SELECT * FROM stats WHERE id = 1")

// Vérifier les dates de scraping
dbAll("SELECT * FROM artists_scraped ORDER BY last_scraped_at DESC LIMIT 10")

// Compter les tracks par état
dbAll("SELECT listened, COUNT(*) as c FROM tracks GROUP BY listened")
```

## Aperçu de l'interface
<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur
- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)

---

<p align="center">Projet réalisé en 2026.</p>
