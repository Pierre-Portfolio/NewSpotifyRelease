# Spotify Raspi — Résumé complet du projet

## 🎯 Objectif
Outil personnel hébergé sur Raspberry Pi pour :
1. Scanner les nouvelles sorties des artistes Spotify suivis
2. Les stocker en base SQLite
3. Les écouter depuis une interface web responsive (mobile/desktop)

---

## 📁 Structure du projet

```
spotify-raspi/
├── package.json
├── .env.example
├── sql/
│   └── schema.sql          ← Schéma complet SQLite
├── src/
│   ├── server.js            ← Point d'entrée Express
│   ├── db/
│   │   ├── database.js      ← Connexion + init SQLite
│   │   └── init.js          ← Script d'initialisation
│   ├── spotify/
│   │   └── api.js           ← Appels API Spotify (GET, PUT, paginate, refresh token)
│   ├── scraper/
│   │   └── sync.js          ← Moteur de synchronisation (pause/resume/stop)
│   ├── routes/
│   │   └── index.js         ← Toutes les routes API REST
│   └── utils/
│       └── logger.js        ← Logger console + BDD
└── public/
    └── index.html           ← Interface web complète (SPA vanilla JS)
```

---

## 🗄️ Base de données SQLite (5 tables)

### `info_general` (1 row)
Infos du compte Spotify connecté + tokens OAuth.
Colonnes : `spotify_user_id`, `display_name`, `email`, `plan`, `avatar_url`, `access_token`, `refresh_token`, `token_expires_at`

### `tracks`
Sons trouvés lors des synchros, à écouter.
Colonnes : `spotify_track_uri` (UNIQUE), `spotify_track_id`, `spotify_album_id`, `track_name`, `artist_name`, `artist_spotify_id`, `album_name`, `album_cover_url`, `release_date`, `track_duration_ms`, `track_number`, `listened` (bool), `skipped` (bool), `listened_at`, `skipped_at`, `added_at`, `synced_from_date`

### `synchronisation`
Historique des synchros.
Colonnes : `status` (pending/running/done/error/paused), `completed` (bool), `date_from`, `date_to`, `total_artists`, `artists_scanned`, `last_artist_name`, `last_artist_spotify_id`, `last_artist_index`, `tracks_found`, `releases_found`, `started_at`, `finished_at`

### `artists_cache`
Cache local des artistes suivis (évite de re-fetcher à chaque synchro).
Colonnes : `spotify_id` (PK), `name`, `avatar_url`, `genres`, `followers`, `last_synced_at`

### `logs`
Tous les logs du scraper et de l'interface.
Colonnes : `sync_id` (FK), `level` (info/success/error/wait/warn), `source` (scraper/auth/playback/system), `message`, `artist_name`, `track_uri`, `http_status`, `created_at`

---

## 🔌 API REST (Express)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/auth/login` | Redirige vers Spotify OAuth |
| GET | `/api/auth/callback` | Callback OAuth, sauvegarde tokens |
| GET | `/api/auth/status` | Statut de connexion |
| POST | `/api/sync/start` | Lance la synchro `{dateFrom, dateTo}` |
| POST | `/api/sync/pause` | Met en pause |
| POST | `/api/sync/resume` | Reprend |
| POST | `/api/sync/stop` | Arrête |
| GET | `/api/sync/state` | État en temps réel |
| GET | `/api/sync/history` | Historique des synchros |
| GET | `/api/tracks` | Liste tracks `?listened=0&limit=50&offset=0` |
| GET | `/api/tracks/stats` | Stats (total/pending/listened/skipped) |
| PUT | `/api/tracks/:id/listened` | Marque comme écouté |
| PUT | `/api/tracks/:id/skipped` | Marque comme passé |
| POST | `/api/playback/play` | Lance un son `{uri}` |
| GET | `/api/playback/devices` | Appareils Spotify actifs |
| GET | `/api/logs` | Logs `?syncId=X&level=error&limit=100` |

---

## ⚙️ Configuration (.env)

```env
SPOTIFY_CLIENT_ID=672e41f0308f4378b4f2331844e08b20
SPOTIFY_CLIENT_SECRET=TON_CLIENT_SECRET
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
PORT=3000
HOST=0.0.0.0
DB_PATH=./data/spotify.db
DELAY_MIN_MS=11000
DELAY_MAX_MS=15000
```

---

## 🔑 Spotify OAuth

- Flow : **Authorization Code** (côté serveur, pas PKCE)
- Scopes : `user-follow-read`, `user-read-private`, `user-modify-playback-state`, `user-read-playback-state`
- ⚠️ App en **Development Mode** sur Spotify Dashboard
- ⚠️ `playlist-modify-*` bloqué en dev mode depuis mai 2025
- ✅ `user-modify-playback-state` (lancer un son) **fonctionne** en dev mode
- Client ID : `672e41f0308f4378b4f2331844e08b20`
- Redirect URI configurée : `https://pierre-portfolio.github.io/NewSpotifyRelease/` (ancienne version frontend)
- **Nouvelle redirect URI à configurer** : `http://IP_DU_RASPI:3000/api/auth/callback`

---

## 🔄 Logique du scraper

1. Appel `/me` pour vérifier le compte
2. Pagination `/me/following?type=artist&limit=50` — traitement en **streaming** (page par page, pas d'attente fin pagination)
3. Pour chaque artiste : `/artists/{id}/albums?include_groups=album,single`
4. Filtre par date (cutoff → ceiling)
5. Pour chaque sortie trouvée : `/albums/{id}/tracks`
6. Insère chaque track en BDD (`INSERT OR IGNORE` pour éviter doublons)
7. Délai aléatoire **11-15 secondes** entre chaque artiste
8. Sur erreur **429** : log Retry-After + arrêt propre
9. Pause/Resume/Stop possible à tout moment

---

## 🖥️ Interface web

- SPA vanilla JS, aucun framework
- 3 onglets : **Synchronisation** / **À écouter** / **Logs**
- Polling toutes les 1.5s pendant la synchro pour mise à jour live
- Boutons ▶ Play (lance dans Spotify) et ↪ Skip par track
- Marque automatiquement `listened=true` quand on clique Play

---

## 🍓 Déploiement Raspberry Pi

```bash
# 1. Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Cloner le projet
git clone ... && cd spotify-raspi

# 3. Installer les dépendances
npm install

# 4. Configurer
cp .env.example .env
nano .env  # remplir CLIENT_SECRET, etc.

# 5. Init BDD
npm run db:init

# 6. Démarrer
npm start

# 7. Accès depuis le réseau local
# http://IP_DU_RASPI:3000

# 8. Démarrage automatique (PM2)
npm install -g pm2
pm2 start src/server.js --name spotify-raspi
pm2 startup && pm2 save
```

---

## 📝 Points d'attention pour la suite

- Le `CLIENT_SECRET` Spotify est nécessaire pour le flow Authorization Code côté serveur (contrairement au PKCE frontend)
- Ajouter `http://IP_DU_RASPI:3000/api/auth/callback` dans les Redirect URIs du dashboard Spotify
- Pour accès hors réseau local → **Tailscale** (VPN gratuit) ou **Cloudflare Tunnel**
- Cron hebdomadaire disponible dans `server.js` (commenté), décommenter pour synchro automatique
- La gestion mobile/veille écran → prévoir une **PWA** avec Service Worker dans une prochaine itération
