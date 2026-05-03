# ⚠️ PRIORITÉ ABSOLUE — Version du build serveur

La constante `VERSION` dans `server/server.js` doit être incrémentée à **chaque modification du backend**.
Format : `1.0.X` — X = numéro de patch, à incrémenter de 1 à chaque PR / session de fix.

**Version actuelle : `1.0.7`**

Au démarrage, le serveur affiche :
```
Spotify+ backend v1.0.7 → http://localhost:3001
```
Et `GET /api/health` retourne `{ "version": "1.0.7", ... }`.
→ Toujours vérifier que la version affichée correspond avant de tester.

**⚠️ ERREUR RÉCURRENTE :** À chaque incrément de VERSION, mettre à jour **les 3 endroits simultanément** :
1. `const VERSION = '1.0.X'` dans `server/server.js`
2. `**Version actuelle : \`1.0.X\`**` dans ce fichier CLAUDE.md
3. Le bloc d'exemple ` ```Spotify+ backend v1.0.X``` ` juste au-dessus

---

# ⚠️ ERREUR RÉCURRENTE DE CLAUDE — Worktree vs dépôt principal

Claude travaille souvent dans un **worktree temporaire** (`\.claude\worktrees\...`) au lieu du dépôt principal.
Les modifications dans le worktree ne sont **pas visibles dans GitHub Desktop** et ne peuvent pas être committées.

**Règle absolue : toujours éditer les fichiers dans `C:\Users\petil\Documents\GitHub\NewSpotifyRelease\`**
Jamais dans `.claude\worktrees\*`.

Si des modifications ont été faites dans le worktree par erreur, les copier vers le dépôt principal avant de conclure.

---

# Spotify+ · Nouvelles Sorties — Contexte projet

## Vue d'ensemble
Application web permettant de scanner les artistes Spotify suivis par l'utilisateur, de détecter leurs nouvelles sorties (albums / singles) sur une période donnée, et de les stocker en base de données pour les découvrir dans l'interface Spotify+.

L'utilisateur parcourt son feed de découverte, écoute les titres un par un via le player intégré. Quand un titre se termine, il est automatiquement marqué comme écouté et disparaît du feed avec une animation. Aucun ajout automatique en playlist.

---

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `index.html` | **Front principal** — React 18 CDN, app complète en un seul fichier |
| `sql/create.sql` | Schéma MySQL complet (8 tables) |
| `sql/migrations/001_add_last_artist_name.sql` | Migration : ajout colonne `last_artist_name` |
| `sql/InstallDataBase.txt` | Tuto d'installation MySQL + backend |
| `server/server.js` | Entry point Express — `npm run dev` |
| `server/db.js` | Pool MySQL (mysql2) |
| `server/routes/users.js` | `POST /api/users/upsert` |
| `server/routes/sync.js` | Sessions de sync + logs + reprise |
| `server/routes/releases.js` | Sauvegarde releases + tracks |
| `server/routes/feed.js` | Feed de découverte + stats + file d'attente |
| `server/.env.example` | Template variables d'environnement |

---

## Stack frontend (`index.html`)

- **React 18** via CDN (pas de build tool), Babel standalone
- **Fonts** : DM Sans (UI) + DM Mono (labels, logs, valeurs)
- **Auth** : OAuth 2.0 PKCE — 100% client-side, token stocké en `localStorage`
- **Backend** : tous les appels DB passent par `http://localhost:3001`

### Config Spotify
```js
CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES       = 'user-follow-read user-read-private user-read-currently-playing user-modify-playback-state'
API_BASE     = 'http://localhost:3001'  // → IP du Raspi en prod
```

### Délai de scraping
Le délai entre chaque artiste est configurable via un sélecteur (10 / 20 / 30s) auquel s'ajoute un **jitter aléatoire de 1 à 3 secondes** pour éviter les patterns réguliers détectés par Spotify.
```js
const delay = delayChoice * 1000 + Math.random() * 2000 + 1000;
```

---

## Logique de scraping (dans `startSync`)

Accepte un paramètre optionnel `options = { skipCount, resumeDateFrom }` pour la reprise.

1. Vérifie le compte `/me`
2. Crée une session en DB via `POST /api/sync/start`
3. Pagine `/me/following?type=artist&limit=50` en streaming
4. Pour chaque artiste (en sautant les `skipCount` premiers si reprise) :
   - `/artists/{id}/albums?include_groups=album,single&limit=10&market=FR`
   - Filtre par période choisie
   - Pour chaque album dans la période → `/albums/{id}/tracks?limit=50`
   - Dédoublonnage via `seenUris` Set + `knownUrisRef` (URIs déjà en DB)
   - `POST /api/releases` → sauvegarde release + artiste
   - `POST /api/releases/:id/tracks` → sauvegarde les tracks
5. Après chaque artiste → `PATCH /api/sync/:id` avec `last_artist_name` (permet la reprise)
6. À la fin → `PATCH /api/sync/:id` avec `status: 'completed'`

### Reprise de synchro (`resumeSync`)
Si une session a le statut `running` ou `error` avec `artists_scanned > 0`, le bouton **"Reprendre la synchro en cours"** apparaît au login. Il recharge la `date_from` et saute les artistes déjà scannés.

### Bouton "Tester la connexion"
Lance Kaza — "Connexion" via `apiPut /me/player/play`. Recherche via `/search?q=track:connexion artist:kaza`.

---

## Architecture backend (Node.js + Express + MySQL)

```
Browser
  ├── Spotify API        (OAuth PKCE, artistes/albums/tracks, player controls)
  └── http://localhost:3001
        ├── POST   /api/users/upsert
        ├── POST   /api/sync/start
        ├── PATCH  /api/sync/:id                    ← stats + last_artist_name + status
        ├── POST   /api/sync/:id/log
        ├── GET    /api/sync/resumable/:user_id      ← session reprise possible ?
        ├── GET    /api/sync/history/:user_id
        ├── GET    /api/sync/:id/logs
        ├── POST   /api/releases
        ├── POST   /api/releases/:id/tracks
        ├── GET    /api/feed/:user_id                ← releases (filtre status)
        ├── GET    /api/feed/:user_id/tracks         ← tracks non écoutées (avec dbId)
        ├── GET    /api/feed/:user_id/uris           ← URIs déjà en base (dédup)
        ├── GET    /api/feed/:user_id/stats          ← artists_total + releases + tracks
        ├── GET    /api/feed/:user_id/listen-stats   ← remaining / mois / année / all-time
        ├── GET    /api/feed/:user_id/next           ← prochain titre à écouter
        ├── PATCH  /api/feed/tracks/:id/listened     ← marquer écouté (auto au changement de son)
        ├── PATCH  /api/feed/releases/:id/status     ← unseen/seen/liked/skipped
        └── GET    /api/health
```

### Lancer le backend
```bash
cd server
cp .env.example .env      # remplir DB_PASSWORD etc.
npm install
npm run dev               # nodemon — redémarre auto
```

---

## Schéma base de données (`create.sql`)

| Table | Rôle |
|---|---|
| `users` | Compte Spotify (spotify_id, display_name, avatar, product) |
| `sync_sessions` | Historique des syncs — inclut `last_artist_name` pour la reprise |
| `sync_logs` | Logs ligne par ligne (level: info/ok/warn/error/wait) |
| `artists` | Cache des artistes suivis |
| `user_artists` | Liaison user ↔ artistes suivis |
| `releases` | Albums/singles trouvés |
| `tracks` | File d'attente de découverte (`listened` BOOLEAN + `listened_at`) |
| `discovery_status` | Statut user × release (unseen/seen/liked/skipped) |

### Migration base existante
```sql
-- sql/migrations/001_add_last_artist_name.sql
ALTER TABLE sync_sessions
  ADD COLUMN last_artist_name VARCHAR(255) DEFAULT NULL AFTER tracks_added;
```

---

## UI React — composants principaux

| Composant | Rôle |
|---|---|
| `StoreProvider` | Context global — auth, scraping, stats, feed, rate-limit, player |
| `Home` | Page de login (mobile + desktop) |
| `WebApp` | Layout desktop (sidebar + contenu) |
| `MobileApp` | Layout mobile — 3 onglets : Scrapping / À écouter / Stats |
| `DateRangePanel` | Date + bouton Lancer / Reprendre la synchro / Tester connexion |
| `ScrapingStatusPanel` | Stats temps réel (3 boîtes égales : Artistes / Sorties / Titres) |
| `NextCallPanel` | Countdown + sélecteur délai (10/20/30s + jitter 1-3s) |
| `LogsPanel` | Journal en temps réel |
| `FeedList` / `FeedItem` | Feed avec barres égaliseur animées sur le son en cours |
| `VosEcoutesPanel` | Stats d'écoute (restantes / mois / année / all-time) |
| `PlayerBar` | Barre du bas desktop — prev/play-pause/next (feed) + SeekBar + position |
| `SeekBar` | Barre de progression cliquable/draggable → `PUT /me/player/seek` |
| `MiniPlayer` | Barre compacte mobile — lecture en cours |

---

## Rate limit Spotify (guard module-level)

Variables `_rlUntil` (timestamp ms) et `_rlNotify` (callback React).  
`apiGet`, `apiPut`, `apiPost` vérifient `_rlUntil` avant chaque appel.  
Sur 429 → `_rlSet(retryMs)` bloque tous les appels player jusqu'à expiration.  
L'UI affiche un warning avec countdown dans le PlayerBar.

---

## Comportement "marquer comme écouté"

- `prevUriRef` stocke l'URI du son précédent
- Quand `now?.uri` change → l'URI précédente vient de se terminer
- Si elle est dans le feed ET a un `dbId` → `PATCH /api/feed/tracks/:id/listened`
- Animation slide-right + suppression du feed après 600ms
- Stats "Vos écoutes" rafraîchies automatiquement
- `listenedUrisRef` évite les doubles appels dans la même session

**Important :** seuls les items chargés depuis la DB au login ont un `dbId`. Les items ajoutés pendant la sync courante seront marqués au login suivant.

---

## Bugs connus / fixes appliqués

### mysql2 — params toujours string
`req.params.user_id` est une string en Express, MySQL attend un INT.
```js
const userId = parseInt(req.params.user_id, 10);
if (isNaN(userId)) return res.status(400).json({ error: 'user_id invalide (entier attendu)' });
```
Appliqué dans tous les endpoints de `feed.js` et `sync.js`.

### SeekBar — race condition useEffect
Les listeners `mousemove`/`mouseup` doivent être attachés **directement dans `onMouseDown`**, pas dans un `useEffect`. Sinon un clic rapide (mousedown + mouseup) se termine avant que React ait re-rendu et attaché les listeners.

### Requêtes SQL utiles
```sql
-- Derniers logs de sync
SELECT sl.id, ss.id AS session_id, sl.level, sl.message, sl.created_at
FROM sync_logs sl JOIN sync_sessions ss ON ss.id = sl.session_id
ORDER BY sl.created_at DESC LIMIT 50;

-- Sessions d'un user
SELECT * FROM sync_sessions WHERE user_id = 1 ORDER BY started_at DESC;

-- Tracks écoutées / non écoutées
SELECT t.title, a.name AS artist, t.listened, t.listened_at
FROM tracks t
JOIN releases r ON r.id = t.release_id
JOIN artists a ON a.id = r.artist_id
WHERE t.user_id = 1 ORDER BY t.id ASC;
```
