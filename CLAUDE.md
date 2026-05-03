# Spotify+ · Nouvelles Sorties — Contexte projet

## Vue d'ensemble
Application web permettant de scanner les artistes Spotify suivis par l'utilisateur, de détecter leurs nouvelles sorties (albums / singles) sur une période donnée, et de les stocker en base de données pour les découvrir dans l'interface Spotify+.

L'utilisateur parcourt ensuite son feed de découverte, écoute les titres un par un, et ajoute manuellement ce qu'il aime à ses propres playlists Spotify. Aucun ajout automatique en playlist.

---

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `index.html` | **Front principal** — design React (DM Sans + DM Mono), app complète |
| `indexxx.html` | Ancien design vanilla JS — gardé comme référence du code de scraping |
| `Old_index.html` | Version encore plus ancienne — ne pas utiliser |
| `sql/create.sql` | Schéma MySQL complet — version ASCII safe (sans caractères spéciaux) |
| `sql/InstallDataBase.txt` | Tuto d'installation complet MySQL + backend |
| `server/server.js` | Entry point Express — lance avec `npm run dev` |
| `server/db.js` | Pool MySQL (mysql2) |
| `server/routes/users.js` | `POST /api/users/upsert` |
| `server/routes/sync.js` | Sessions de sync + logs |
| `server/routes/releases.js` | Sauvegarde releases + tracks |
| `server/routes/feed.js` | Feed de découverte + file d'attente |
| `server/.env.example` | Template des variables d'environnement |

---

## Stack frontend (`index.html`)

- **React 18** via CDN (pas de build tool), Babel standalone
- **Fonts** : DM Sans (UI) + DM Mono (labels, logs, valeurs)
- **Auth** : OAuth 2.0 PKCE — 100% client-side, token stocké en `localStorage`
- **Pas de serveur** actuellement — tous les appels partent directement vers l'API Spotify

### Config Spotify
```js
CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES       = 'user-follow-read user-read-private user-read-currently-playing'
API_BASE     = 'http://localhost:3001'  // → IP du Raspi en prod
```

### Délais de scraping
```js
DELAY_MIN = 30000   // 30s
DELAY_MAX = 35000   // 35s
```
Délai aléatoire entre chaque artiste pour éviter le rate limit Spotify (429).

---

## Logique de scraping (dans `startSync`)

1. Vérifie le compte `/me`
2. Vérifie la playlist cible (héritage — à supprimer avec le backend)
3. Pagine `/me/following?type=artist&limit=50` en streaming
4. Pour chaque artiste → `/artists/{id}/albums?include_groups=album,single&limit=10&market=FR`
5. Filtre les albums dans la période choisie
6. Pour chaque album dans la période → `/albums/{id}/tracks?limit=50`
7. `const uris = tracksData.items.map(t => t.uri)` — récupère tous les URIs
8. Dédoublonnage sur `uris[0]` (premier track = signature de l'album)
9. **Actuellement** : `apiPost` vers playlist Spotify — **à remplacer** par appel backend → MySQL

### Bouton "Tester la connexion"
Lance Kaza — "Connexion" via `apiPut /me/player/play` pour vérifier que le playback fonctionne.
Recherche le titre via `/search?q=track:connexion artist:kaza`.

---

## Architecture backend (Node.js + Express + MySQL)

```
Browser
  ├── Spotify API        (OAuth PKCE, lecture artistes/albums/tracks, player)
  └── http://localhost:3001
        ├── POST   /api/users/upsert                ← à chaque login
        ├── POST   /api/sync/start                  ← début du scraping
        ├── PATCH  /api/sync/:id                    ← maj stats en cours
        ├── POST   /api/sync/:id/log                ← logs importants (ok/error/warn)
        ├── GET    /api/sync/history/:user_id        ← historique sessions
        ├── GET    /api/sync/:id/logs               ← logs d'une session
        ├── POST   /api/releases                    ← save release + artiste
        ├── POST   /api/releases/:id/tracks         ← save tracks d'une release
        ├── GET    /api/feed/:user_id               ← feed (unseen par défaut)
        ├── GET    /api/feed/:user_id/next          ← prochain titre à écouter
        ├── PATCH  /api/feed/tracks/:id/listened    ← marquer écouté
        ├── PATCH  /api/feed/releases/:id/status    ← liked/skipped/seen
        └── GET    /api/health                      ← check serveur actif
```

### Lancer le backend
```bash
cd server
cp .env.example .env      # puis remplir DB_PASSWORD etc.
npm install
npm run dev               # nodemon — redémarre auto sur changement
```

---

## Schéma base de données (`create.sql`)

### Tables

| Table | Rôle |
|---|---|
| `users` | Compte Spotify (spotify_id, display_name, avatar, product) |
| `sync_sessions` | Historique des syncs (dates, stats, status running/completed/error) |
| `sync_logs` | Logs ligne par ligne de chaque session (level: info/ok/warn/error/wait) |
| `artists` | Cache des artistes suivis (évite de re-fetcher) |
| `user_artists` | Liaison user ↔ artistes suivis |
| `releases` | Albums/singles trouvés (titre, type, date, cover, spotify_url) |
| `tracks` | Titres individuels d'une release — **file d'attente de découverte** |
| `discovery_status` | Statut user × release (unseen / seen / liked / skipped) |

### File d'attente de découverte
`tracks.listened` (BOOLEAN, défaut `false`) + `tracks.listened_at` (DATETIME, défaut NULL).

```sql
-- Prochain titre à écouter
SELECT * FROM tracks
WHERE user_id = ? AND listened = false
ORDER BY id ASC
LIMIT 1;
```

Le plus petit `id` avec `listened = false` = prochain titre à découvrir.
Passe à `true` dès que l'utilisateur l'a écouté → le suivant remonte automatiquement.

---

## UI React — composants principaux

| Composant | Rôle |
|---|---|
| `StoreProvider` | Context global — auth, scraping state, stats, logs, feed |
| `Home` | Page de login (mobile + desktop) |
| `WebApp` | Layout desktop (sidebar gauche + contenu principal) |
| `MobileApp` | Layout mobile avec onglets (Scrapping / À écouter) |
| `DateRangePanel` | Sélecteur de date + bouton lancer sync |
| `ScrapingStatusPanel` | Stats en temps réel (artistes, sorties, titres, progress) |
| `NextCallPanel` | Countdown avant le prochain appel API |
| `LogsPanel` | Journal en temps réel |
| `FeedList` / `FeedItem` | Feed des sorties trouvées |
| `PlayerBar` / `MiniPlayer` | Lecture en cours via `currently-playing` (poll toutes les 5s) |

---

## Points d'attention

- Le `PLAYLIST_ID` et les scopes `playlist-modify-*` sont des héritages à supprimer une fois le backend en place
- La déduplication se fait aujourd'hui en mémoire (`addedUris` Set) → à déporter en DB côté backend
- `user-read-currently-playing` est utilisé par le player bar (poll 5s) — à conserver
- Le scraping est entièrement client-side, ce qui force les délais longs (rate limit) — avec un backend on pourrait optimiser

---

## Bugs connus / fixes appliqués

### mysql2 — `req.params` toujours string → `Incorrect arguments to mysqld_stmt_execute`
mysql2 en mode `execute()` (prepared statements) est strict sur les types. `req.params.user_id` et `req.params.id` sont toujours des **strings** en Express, mais MySQL attend un `INT`. Il faut systématiquement caster avec `parseInt(req.params.user_id, 10)` avant de passer la valeur à `db.execute()`. Même chose pour `req.body.user_id` dans les endpoints PATCH.

**Fichiers corrigés :** `server/routes/feed.js` (tous les endpoints), `server/routes/sync.js` (`GET /history/:user_id`).

**Pattern à appliquer partout :**
```js
const userId = parseInt(req.params.user_id, 10);
if (isNaN(userId)) return res.status(400).json({ error: 'user_id invalide (entier attendu)' });
```

### Requêtes SQL utiles pour débugger
```sql
-- Derniers logs de sync (toutes sessions)
SELECT sl.id, ss.id AS session_id, ss.user_id, sl.level, sl.message, sl.created_at
FROM sync_logs sl
JOIN sync_sessions ss ON ss.id = sl.session_id
ORDER BY sl.created_at DESC
LIMIT 50;

-- Historique sessions d'un user (remplacer 1 par l'id MySQL du user)
SELECT * FROM sync_sessions WHERE user_id = 1 ORDER BY started_at DESC;
```
