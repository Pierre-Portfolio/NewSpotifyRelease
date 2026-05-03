<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Nouvelles Sorties

## Aperçu
Application web pour scanner les artistes Spotify suivis, détecter leurs nouvelles sorties sur une période donnée et les stocker en base de données. L'utilisateur explore ensuite son feed de découverte, écoute les titres un par un et les valide ou les ignore — aucun ajout automatique en playlist.

## Fonctionnalités

### Synchronisation
- Authentification sécurisée via OAuth 2.0 PKCE
- Scraping des artistes suivis avec délai configurable (10 / 20 / 30s) + jitter aléatoire 1-3s
- Détection des nouvelles sorties (albums, singles) par plage de dates
- Pause / reprise de la sync en cours de session
- **Reprise après interruption** : si la page est fermée, la sync repart du dernier artiste scanné au prochain login
- Protection rate-limit : sur erreur 429, tous les appels Spotify sont bloqués jusqu'à expiration du cooldown avec affichage d'un warning

### Feed de découverte
- File d'attente ordonnée par date d'ajout
- Barres égaliseur animées sur le titre en cours de lecture
- Marquage automatique comme écouté quand le titre se termine → disparition animée du feed
- Navigation dans le feed via les flèches ← → de la barre du bas

### Player
- Barre de lecture en temps réel (poll toutes les 5s)
- Boutons **précédent / play-pause / suivant** branchés sur le feed de nouveautés
- **Barre de progression cliquable et draggable** — clic ou glissement pour se déplacer dans le titre
- Compteur de position dans le feed (ex: `3 / 25`)

### Stats
- Compteurs en temps réel : restantes à écouter / ce mois-ci / cette année / depuis toujours
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
# 2. Importer le schéma
mysql -u root -p spotifyplus < sql/create.sql

# 3. Si mise à jour d'une base existante
mysql -u root -p spotifyplus < sql/migrations/001_add_last_artist_name.sql
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
    migrations/
      001_add_last_artist_name.sql
  server/
    server.js                   → Backend Express (port 3001)
    db.js                       → Pool MySQL
    .env.example                → Template variables d'environnement
    package.json
    routes/
      users.js                  → Upsert utilisateur Spotify
      sync.js                   → Sessions de sync, logs, reprise
      releases.js               → Sauvegarde releases et tracks
      feed.js                   → Feed, stats, file d'attente
  assets/
    images/github/              → Images README
```

## Aperçu de l'interface
<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur
- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)

---

<p align="center">Projet réalisé en 2026.</p>
