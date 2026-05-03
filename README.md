<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Nouvelles Sorties

## Aperçu
Application web pour scanner les artistes Spotify suivis, détecter leurs nouvelles sorties sur une période donnée et les stocker en base de données. L'utilisateur explore ensuite son feed de découverte dans Spotify+, écoute les titres un par un et ajoute manuellement ce qu'il aime à ses propres playlists.

## Fonctionnalités
- Authentification sécurisée via OAuth 2.0 PKCE (Spotify)
- Scraping des artistes suivis avec délai anti-rate-limit (30–35s/artiste)
- Détection des nouvelles sorties (albums, singles) par plage de dates
- Stockage en base de données MySQL (releases, tracks, logs de sync)
- Feed de découverte avec file d'attente (premier titre non écouté en priorité)
- Interface React responsive — mobile et desktop
- Player bar en temps réel (lecture en cours sur Spotify)
- Backend Node.js + Express connecté à MySQL

## Technologies
- React 18 (CDN) + Babel Standalone
- Node.js / Express
- MySQL 8
- Spotify Web API
- OAuth 2.0 PKCE
- GitHub Pages (frontend) + Raspberry Pi optionnel (backend)

## Installation de la base de données
Voir le tuto complet : **[sql/InstallDataBase.txt](sql/InstallDataBase.txt)**

En résumé :
1. Installer MySQL (voir tuto)
2. Créer la base `spotifyplus` dans MySQL Workbench
3. Importer `sql/create.sql`
4. Copier `server/.env.example` → `server/.env` et remplir les valeurs
5. `cd server && npm install && npm run dev`
6. Vérifier sur `http://localhost:3001/api/health`

## Structure du projet
```
NewSpotifyRelease/
  index.html                  -> Frontend principal (React)
  indexxx.html                -> Ancien design (référence)
  sql/
    create.sql                -> Schema MySQL (8 tables)
    InstallDataBase.txt       -> Tuto d'installation complet
  server/
    server.js                 -> Backend Express (port 3001)
    db.js                     -> Connexion MySQL (pool)
    .env.example              -> Template variables d'environnement
    .gitignore                -> Exclut .env et node_modules
    package.json
    routes/
      users.js                -> POST /api/users/upsert
      sync.js                 -> Sessions de sync + logs
      releases.js             -> Sauvegarde releases + tracks
      feed.js                 -> Feed decouverte + file d'attente
  assets/
    images/github/            -> Images README
```

## Architecture
```
Browser
  ├── Spotify API    (OAuth PKCE, artistes, albums, tracks, player)
  └── Backend local  (http://localhost:3001 ou Raspberry Pi)
        └── MySQL    (users, releases, tracks, discovery_status...)
```

## Aperçu de l'interface
<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur
- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)

---

<p align="center">Projet réalisé en 2026.</p>
