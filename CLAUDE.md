# ⚠️ ERREUR RÉCURRENTE DE CLAUDE — Worktree vs dépôt principal

Claude travaille souvent dans un **worktree temporaire** (`\.claude\worktrees\...`) au lieu du dépôt principal.
Les modifications dans le worktree ne sont **pas visibles dans GitHub Desktop** et ne peuvent pas être committées.

**Règle absolue : toujours éditer les fichiers dans `C:\Users\petil\Documents\GitHub\NewSpotifyRelease\`**
Jamais dans `.claude\worktrees\*`.

Si des modifications ont été faites dans le worktree par erreur, les copier vers le dépôt principal avant de conclure.

---

# Spotify+ · Nouvelles Sorties — Contexte projet

## Vue d'ensemble
Application web PWA **sans backend** — toutes les données sont stockées localement via sql.js (SQLite WebAssembly) + IndexedDB. Hébergée statiquement sur GitHub Pages.

Chaque artiste est scrappé **depuis sa propre date de dernier scan** (`last_scraped_at` dans `artists_scraped`), pas depuis une date globale. Un artiste jamais scrappé repart de 2026-03-15.

L'utilisateur parcourt son feed de découverte, écoute les titres un par un via le player intégré. Quand un titre se termine, il est automatiquement marqué comme écouté, le suivant se lance automatiquement, et le titre disparaît du feed avec une animation. Aucun ajout automatique en playlist.

---

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `index.html` | **App complète** — React 18 CDN + Babel + sql.js, tout en un seul fichier |
| `manifest.json` | Config PWA (nom, icônes, display standalone) |
| `service-worker.js` | Cache app shell (`./`, `./index.html`) pour usage offline |
| `icon-192.png` | Icône PWA 192×192 (à ajouter au repo) |
| `icon-512.png` | Icône PWA 512×512 (à ajouter au repo) |

---

## Stack (`index.html`)

- **React 18** via CDN (pas de build tool), Babel standalone
- **sql.js 1.10.2** via CDN : SQLite WebAssembly — `initSqlJs({ locateFile: f => CDN + f })`
- **IndexedDB** : persistance du binaire SQLite (clé `spotifyplus_db` dans le store `db` de la base `spotifyplus`)
- **Fonts** : DM Sans (UI) + DM Mono (labels, logs, valeurs)
- **Auth** : OAuth 2.0 PKCE — 100% client-side, token stocké en `localStorage`
- **Aucun appel backend** — l'app appelle uniquement l'API Spotify + sql.js local

### Config Spotify
```js
CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES       = 'user-follow-read user-read-private user-read-currently-playing user-modify-playback-state'
```

### Délai de scraping
Le délai entre chaque artiste est configurable via un sélecteur (10 / 20 / 30s) auquel s'ajoute un **jitter aléatoire de 1 à 3 secondes**.
```js
const delay = delayChoice * 1000 + Math.random() * 2000 + 1000;
```

---

## Schéma SQL local (3 tables)

```sql
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spotify_uri TEXT UNIQUE NOT NULL,
  artist_name TEXT NOT NULL,
  title TEXT NOT NULL,
  release_title TEXT,       -- nom de l'album (null pour les singles)
  release_type TEXT,        -- 'single', 'album', 'ep'...
  release_date TEXT,
  cover_url TEXT,
  duration_ms INTEGER,
  listened INTEGER DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artists_scraped (
  spotify_id TEXT PRIMARY KEY,
  last_scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_listened INTEGER DEFAULT 0,
  listened_this_month INTEGER DEFAULT 0,
  listened_this_year INTEGER DEFAULT 0,
  last_reset_month TEXT,    -- format 'YYYY-MM'
  last_reset_year TEXT      -- format 'YYYY'
);
```

---

## Module DB (fonctions module-level dans `index.html`)

```js
let _db = null;                        // instance sql.js Database

async function initDB()                // charge depuis IndexedDB ou crée le schéma
async function saveDB()                // exporte _db.export() → IndexedDB
function dbRun(sql, params=[])         // execute sans retour
function dbAll(sql, params=[])         // retourne tableau d'objets
function dbGet(sql, params=[])         // retourne le premier objet ou null
function loadListenStatsFromDB()       // retourne { remaining, remaining_ms, this_month, this_year, all_time }
```

### Règles d'écriture DB
- `saveDB()` est appelé **après chaque artiste scrapé** et **après chaque écoute marquée** et **après une purge**
- Toujours utiliser `INSERT OR IGNORE` pour les tracks (UNIQUE sur `spotify_uri`)
- Toujours utiliser `INSERT OR REPLACE` pour `artists_scraped`

---

## Logique de scraping (dans `startSync`)

1. Vérifie le compte `/me`
2. Charge les dates de scrapping depuis `SELECT spotify_id, last_scraped_at FROM artists_scraped`
3. Pagine `/me/following?type=artist&limit=50` en streaming
4. Pour chaque artiste :
   - `cutoff = scrapedDates[artist.id] || '2026-03-15'`
   - `/artists/{id}/albums?include_groups=album,single&limit=10&market=FR`
   - Filtre par `cutoff ≤ release_date ≤ aujourd'hui`
   - Pour chaque album dans la période → `/albums/{id}/tracks?limit=50`
   - Dédoublonnage via `seenUris` Set + `knownUrisRef`
   - **Singles** : `INSERT OR IGNORE` d'une seule ligne (`uris[0]`, `title = album.name`, `release_title = null`)
   - **Albums** : `INSERT OR IGNORE` d'une ligne par track (`title = t.name`, `release_title = album.name`)
5. Après chaque artiste → `INSERT OR REPLACE INTO artists_scraped (spotify_id, last_scraped_at) VALUES (?, datetime('now'))`
6. Après chaque artiste → `saveDB()` (async) + `localStorage.setItem('spotifyplus_sync_progress', { artists_scanned, total_artists, last_artist_name })`
7. À la fin → `saveDB()` final + `localStorage.removeItem('spotifyplus_sync_progress')` + `setProgress(100)`

### Reprise de synchro après interruption / redémarrage
- La progression est sauvegardée dans `localStorage` (`spotifyplus_sync_progress`) après chaque artiste
- Au login, si une progression existe → `setResumableSession(p)` → bouton **"↩ Reprendre"** affiché
- `startSync({ skipCount: N })` utilise `globalArtistIndex` pour sauter les N premiers artistes
- `localStorage` nettoyé quand la sync se termine normalement

### UX DateRangePanel — quand `resumableSession` existe
- Bouton **"↩ Reprendre la synchro en cours"** affiché **en premier**, pleine largeur, avec `artists_scanned / total_artists` et `last_artist_name`
- Bouton "Lancer" devient **"↺ Recommencer la synchro de 0"** (rouge foncé) avec `confirm()` avant d'exécuter

---

## Comportement "marquer comme écouté" + auto-avance

- `prevUriRef` stocke l'URI du son précédent
- Quand `now?.uri` change → l'URI précédente vient de se terminer
- Si elle est dans le feed **et que `dbReady` est true** :
  - `UPDATE tracks SET listened = 1 WHERE spotify_uri = ?`
  - `UPDATE stats SET total_listened = total_listened + 1, listened_this_month = ..., listened_this_year = ... WHERE id = 1`
  - `saveDB()` (async)
  - `setListenStats(loadListenStatsFromDB())`
- Animation slide-right + suppression du feed après 600ms
- `listenedUrisRef` évite les doubles appels dans la même session
- **Auto-avance** : si `now` devient `null` et que l'URI précédente était dans le feed → le titre suivant est lancé automatiquement (sauf si loop activé)
- **Détection redémarrage** : si la position repasse à 0 après avoir été proche de la fin sur le même URI → auto-avance (sauf loop)

**Important** : les items ajoutés pendant la sync courante SONT immédiatement en DB et peuvent être marqués écoutés dans la même session.

---

## Statistiques

- Table `stats` avec une seule ligne (id=1) — compteurs incrémentés à chaque écoute
- `remaining` = `SELECT COUNT(*) FROM tracks WHERE listened = 0` (recalculé)
- `remaining_ms` = `SELECT SUM(duration_ms) FROM tracks WHERE listened = 0` (recalculé)
- Réinitialisation mois/année : vérifiée au démarrage via `last_reset_month` / `last_reset_year`

---

## Purge

- Bouton **"Purger les écoutés"** dans `VosEcoutesPanel` (desktop sidebar + mobile onglet Stats)
- Action : `DELETE FROM tracks WHERE listened = 1` → `saveDB()` → `setListenStats(loadListenStatsFromDB())`
- Affiche une `alert` avec le nombre de titres supprimés

---

## PWA

- `manifest.json` à la racine — `start_url: /NewSpotifyRelease/`, `display: standalone`
- `service-worker.js` — cache `./` et `./index.html` au `install`, réseau sinon
- Enregistrement dans `<head>` : `navigator.serviceWorker.register('./service-worker.js')`
- Icônes manquantes : `icon-192.png` et `icon-512.png` à ajouter à la racine du repo

---

## UI React — composants principaux

| Composant | Rôle |
|---|---|
| `StoreProvider` | Context global — auth, dbReady, scraping, stats, feed, rate-limit, player, loopEnabled |
| `Home` | Page de login (mobile + desktop) |
| `WebApp` | Layout desktop (sidebar + contenu) |
| `MobileApp` | Layout mobile — 3 onglets : Scrapping / À écouter / Stats |
| `DateRangePanel` | Bouton Reprendre (si session en cours) / Lancer ou Recommencer de 0 / Pause / Tester connexion |
| `ScrapingStatusPanel` | Stats temps réel (3 boîtes : Artistes / Sorties / Titres) |
| `NextCallPanel` | Countdown + sélecteur délai (10/20/30s + jitter 1-3s) |
| `LogsPanel` | Journal en temps réel |
| `FeedList` / `FeedItem` | Feed avec barres égaliseur animées sur le son en cours (limite 1000) |
| `VosEcoutesPanel` | Stats d'écoute + bouton Purger les écoutés |
| `PlayerBar` | Barre du bas desktop — prev/play-pause/next + **bouton loop** + SeekBar + position |
| `SeekBar` | Barre de progression cliquable/draggable → `PUT /me/player/seek` |
| `MiniPlayer` | Barre compacte mobile — lecture en cours |

---

## Store — état global

```js
// Clés exposées dans l'api du StoreProvider
authState        // 'loading' | 'login' | 'connected'
user             // objet Spotify /me
dbReady          // boolean — DB sql.js initialisée et prête
scraping         // boolean
paused           // boolean
feed             // array d'items du feed
logs             // array de logs
now              // état lecture Spotify en cours
stats            // { artists, total, releases, tracks } — compteurs sync
listenStats      // { remaining, remaining_ms, this_month, this_year, all_time }
loopEnabled      // boolean
delayChoice      // 10 | 20 | 30 (secondes)
rateLimitUntil   // timestamp ms

resumableSession // { artists_scanned, total_artists, last_artist_name } | null

// Méthodes
startSync({ skipCount })  // skipCount=0 par défaut, N pour reprendre
resumeSync()              // raccourci → startSync({ skipCount: resumableSession.artists_scanned })
togglePause()
purgeListened()
logout()
seek(positionMs)
setLoopEnabled(bool)
setDelayChoice(n)
```

---

## Rate limit Spotify (guard module-level)

Variables `_rlUntil` (timestamp ms) et `_rlNotify` (callback React).
`apiGet`, `apiPut`, `apiPost` vérifient `_rlUntil` avant chaque appel.
Sur 429 → `_rlSet(retryMs)` bloque tous les appels player jusqu'à expiration.

---

## Bugs connus / fixes appliqués

### SeekBar — race condition useEffect
Les listeners `mousemove`/`mouseup` doivent être attachés **directement dans `onMouseDown`**, pas dans un `useEffect`. Sinon un clic rapide (mousedown + mouseup) se termine avant que React ait re-rendu et attaché les listeners.

### sql.js — params positionnels
`_db.run(sql, params)` attend un tableau de valeurs positionnelles pour les `?`. Ne jamais passer un objet `{ key: val }`.

### Babel — var hoisting
Babel compile `const`/`let` en `var`. Les `useEffect` qui référencent des variables déclarées plus bas dans la même fonction body fonctionnent car les callbacks sont exécutés après le rendu complet (les vars sont initialisées). Ne pas déplacer les useEffect après leurs dépendances.

### Limites connues
- iOS/Safari : stockage IndexedDB limité à ~50 Mo, purge automatique si l'app n'est pas ouverte 7 jours → privilégier Android
- sql.js charge toute la DB en RAM au démarrage — purger régulièrement les `listened = 1`
- Données sur un seul appareil, pas de sync multi-devices
