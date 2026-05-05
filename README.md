<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Nouvelles Sorties

## Aperçu
Application web pour scanner les artistes Spotify suivis, détecter leurs nouvelles sorties et les stocker en base de données. Chaque artiste est scrappé depuis sa propre date de dernier scan — plus de plage de dates manuelle. L'utilisateur explore ensuite son feed de découverte, écoute les titres un par un et les valide ou les ignore — aucun ajout automatique en playlist.

## Fonctionnalités

### Synchronisation
- Authentification sécurisée via OAuth 2.0 PKCE
- Scraping des artistes suivis avec délai configurable (10 / 20 / 30s) + jitter aléatoire 1-3s
- **Dates de scraping par artiste** : chaque artiste est scrappé depuis sa propre `last_scraped_at` (défaut : 2016-01-01) — plus de date globale à choisir
- Mise à jour automatique de `last_scraped_at` après chaque artiste scanné
- Pause / reprise de la sync en cours de session
- **Reprise après interruption** : si la page est fermée, la sync repart du dernier artiste scanné au prochain login
- Protection rate-limit : sur erreur 429, tous les appels Spotify sont bloqués jusqu'à expiration du cooldown avec affichage d'un warning

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
- Compteurs en temps réel : restantes à écouter / **temps d'écoute restant (HH:MM)** / ce mois-ci / cette année / depuis toujours
- Accessible sur mobile via l'onglet **Stats**

### Interface
- Responsive — desktop (sidebar) et mobile (3 onglets : Scrapping / À écouter / Stats)
- Logs en temps réel pendant la sync
- Countdown avant le prochain appel Spotify

## Technologies
- React 18 (CDN) + Babel Standalone
- Node.js / Express
- MySQL 8
- Spotify Web API
- OAuth 2.0 PKCE
- GitHub Pages (frontend) + Raspberry Pi optionnel (backend)

## Installation

### Base de données
Voir le tuto complet : **[sql/InstallDataBase.txt](sql/InstallDataBase.txt)**

```bash
# 1. Créer la base dans MySQL Workbench
# 2. Importer le schéma complet
mysql -u root -p spotifyplus < sql/create.sql

# 3. Si mise à jour d'une base existante (appliquer dans l'ordre)
mysql -u root -p spotifyplus < sql/migrations/001_add_last_artist_name.sql
mysql -u root -p spotifyplus < sql/migrations/002_add_last_scraped_at.sql

# 4. Reset des données scrapées (optionnel — repart de zéro)
mysql -u root -p spotifyplus < sql/reset_scraped_data.sql
```

### Backend
```bash
cd server
cp .env.example .env      # remplir DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, FRONTEND_URL
npm install
npm run dev               # nodemon sur port 3001
```

Vérifier : `http://localhost:3001/api/health`

## Structure du projet
```
NewSpotifyRelease/
  index.html                    → Frontend complet (React 18 CDN)
  CLAUDE.md                     → Documentation technique pour Claude
  sql/
    create.sql                  → Schéma MySQL (8 tables)
    InstallDataBase.txt         → Tuto d'installation complet
    reset_scraped_data.sql      → Vide les données scrapées (tracks/releases/sessions)
    migrations/
      001_add_last_artist_name.sql
      002_add_last_scraped_at.sql
  server/
    server.js                   → Backend Express (port 3001)
    db.js                       → Pool MySQL
    .env.example                → Template variables d'environnement
    package.json
    routes/
      users.js                  → Upsert utilisateur Spotify
      sync.js                   → Sessions de sync, logs, reprise, last_scraped_at
      releases.js               → Sauvegarde releases et tracks
      feed.js                   → Feed, stats (avec remaining_ms), file d'attente
      artists.js                → Dates de scraping par artiste
  assets/
    images/github/              → Images README
```

## Aperçu de l'interface
<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur
- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)

---

<p align="center">Projet réalisé en 2026.</p>
