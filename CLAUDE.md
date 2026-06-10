# ⚠️ RÈGLE ABSOLUE — Maintenir README.md et CLAUDE.md à jour

Après **chaque modification fonctionnelle** (nouvelle feature, changement de comportement, ajout de composant, modification d'architecture), mettre à jour **systématiquement** :

- **`CLAUDE.md`** : logique technique, composants, store, fonctions module-level, comportements
- **`README.md`** : fonctionnalités visibles par l'utilisateur, stack, structure du projet

**Ne pas attendre que l'utilisateur le demande.** Si un changement de code mérite d'être documenté, le faire dans le même commit ou dans un commit/PR dédié immédiatement après.

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

- **React 18.3.1** via CDN (pas de build tool), Babel standalone **7.29.7**
- **⚠️ CDN épinglés + SRI** : les 4 `<script>` CDN ont des versions exactes + attribut `integrity` (sha384) + `crossorigin="anonymous"`. **Ne jamais changer une version sans recalculer le hash SRI** (sinon le script est bloqué par le navigateur). Le `.wasm` de sql.js (chargé via `locateFile`) ne peut pas avoir de SRI.
- **sql.js 1.10.2** via CDN : SQLite WebAssembly — `initSqlJs({ locateFile: f => CDN + f })`
- **IndexedDB** : persistance du binaire SQLite (clé `spotifyplus_db` dans le store `db` de la base `spotifyplus`)
- **Fonts** : DM Sans (UI) + DM Mono (labels, logs, valeurs)
- **Auth** : OAuth 2.0 PKCE — 100% client-side, token stocké en `localStorage`
  - Paramètre `state` anti-CSRF généré au login (`pkce_state`), vérifié au callback avant `exchangeCode`
  - `refreshToken()` est protégé par un **mutex** (`_refreshPromise`) : les refresh tokens Spotify sont à usage unique (rotation) — deux refresh simultanés (poll player + scraping) invalideraient le compte. Le refresh token **roté est re-stocké**.
  - `apiGet` retry **une fois** après refresh sur HTTP 401
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
  liked INTEGER DEFAULT 0,  -- 1 si liké via le player (colonne migrée via ALTER TABLE)
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

async function initDB()                // charge depuis IndexedDB ou crée le schéma + migration liked
async function saveDB()                // exporte _db.export() → IndexedDB
async function importDiscoverWeekly(addLog)  // import hebdo playlist "Découvertes de la semaine"
function dbRun(sql, params=[])         // execute sans retour
function dbAll(sql, params=[])         // retourne tableau d'objets
function dbGet(sql, params=[])         // retourne le premier objet ou null
function loadListenStatsFromDB()       // retourne { remaining, remaining_ms, this_month, this_year, all_time, listened_ms }
function loadLikedTracksFromDB()       // retourne les tracks WHERE liked=1 (max 500) mappées en items feed
```

### Migrations DB (idempotentes)
`initDB()` exécute dans des try/catch après chaque chargement (nouveau ou depuis IndexedDB) — sans effet si la colonne existe déjà :
- `ALTER TABLE tracks ADD COLUMN liked INTEGER DEFAULT 0`
- `ALTER TABLE stats ADD COLUMN total_listened_ms INTEGER DEFAULT 0`

### Champs des items feed
Chaque item du feed contient : `id, spotifyUri, label, artist, title, subtitle, date, rawDate, image, isNew, liked, duration_ms`
- `rawDate` : date ISO brute (`YYYY-MM-DD`) utilisée pour le tri par date de sortie
- `liked` : 0 ou 1, synchronisé depuis DB et mis à jour en temps réel par `setTrackLiked`
- `duration_ms` : durée en millisecondes — utilisée pour le seek à 25% au clic next

### syncInitialLikes
Appelée via `useEffect` dès que `dbReady` passe à `true`. Récupère jusqu'à 300 tracks non écoutés, interroge `/me/tracks/contains` par batch de 50, met à jour `liked` en DB + feed array + `likedTracks` state.

### FeedItem — swipe mobile
- `onTouchStart` : capture `touchStartX`
- `onTouchMove` : calcule `swipeDx`, applique `translateX` + teinte de fond (rouge=gauche, accent=droite)
- `onTouchEnd` : `swipeDx < -60` → `removeFromFeed` · `swipeDx > 60` → `navigateFeed(-1)`

### Notification fin de session
Déclenchée quand `dailyCount >= 100` dans `startSync`. Utilise l'API `Notification` du navigateur (permission demandée si `'default'`, silencieuse si `'denied'`).

### Découvertes de la semaine (`importDiscoverWeekly`)
- Appelée dans l'init **avant** le chargement du feed (les tracks DW sont visibles dès le login)
- Cherche dans `GET /me/playlists` la playlist dont `owner.id === 'spotify'` et dont le nom contient `'découvertes'` ou `'discover weekly'`
- Insère les tracks avec `release_type = 'discover_weekly'`, `release_title = 'Découvertes de la semaine'`
- Skip si `localStorage('spotifyplus_dw_last_import')` < 7 jours
- Les messages sont collectés dans `initMsgs[]` et affichés dans le panneau Logs au login
- Tag **Découvertes** (violet `oklch(0.65 0.18 300)`) dans le feed, tag **DW** sur mobile

### Règles d'écriture DB
- `saveDB()` est appelé **après chaque artiste scrapé**, **après chaque écoute marquée**, **après une purge**, **à chaque fin de synchro** (`endSync`) et **quand l'app passe en arrière-plan** (`visibilitychange → hidden`)
- `saveDB()` est **sérialisé** (`_savePromise` + `_saveQueued`) : jamais deux exports/écritures IndexedDB en parallèle. Pas de debounce temporel — chaque appel garantit une écriture incluant ses données (boucle do/while qui ré-exporte si un appel est arrivé pendant l'écriture). **Ne pas remplacer par un debounce** : risque de perte de données si l'OS tue l'onglet mobile.
- Toujours utiliser `INSERT OR IGNORE` pour les tracks (UNIQUE sur `spotify_uri`)
- Toujours utiliser `INSERT OR REPLACE` pour `artists_scraped` — mais **uniquement si le fetch des albums a réussi** (sinon la fenêtre de scan est brûlée sans avoir rien scanné)

---

## Logique de scraping (dans `startSync`)

### Arrêts de synchro unifiés — `endSync(reason)` + `checkpoint()`
**Tous les chemins d'arrêt passent par `endSync(reason)`** (`'completed' | 'daily_limit' | 'error'`) :
- reset `nextCall` / `nextCallTotal` / `eta`, `setScraping(false)`, `setPaused(false)`, `setRlWaiting(false)`
- `'completed'` → supprime `spotifyplus_sync_progress` + `setResumableSession(null)`
- autres raisons → **relit le localStorage et re-set `resumableSession`** : le bouton "↩ Reprendre" apparaît immédiatement, sans reload
- `await saveDB()` final dans tous les cas

**`checkpoint()`** est attendu avant **chaque** appel API de la synchro (via `apiGetSafe`) : boucle tant que `pausedRef.current` (pause manuelle) OU `Date.now() < _rlUntil` (fenêtre rate-limit globale, posée aussi par les 429 du player). **Plus aucune requête ne part pendant une pause.**

### Gestion du rate-limit 429 (wrapper `apiGetSafe`)
Défini localement dans `startSync` :
- `await checkpoint()` en tête de chaque tentative
- Sur erreur `RATE_LIMIT` : incrémente `rl429Streak`, **abandonne après 3 429 consécutifs** → écrit `spotifyplus_blocked_until` en localStorage (`max(Retry-After, 15 min)`), `setBlockedUntil`, throw `SYNC_RATE_ABORT` → catch → `endSync('error')`. Sinon : `setRlWaiting(true)` (état **distinct** de la pause manuelle — ne l'écrase plus), countdown `setNextCall`, `sleep(waitMs)`, retry la même URL. Le streak est remis à 0 au premier appel réussi.
- Retour `null` (bloqué par `_rlUntil`) → re-checkpoint puis retry, **jamais** traité comme une réponse valide
- Body d'erreur HTTP (`data.error` : 401 non rattrapé, 403, 5xx) → **throw** (la synchro s'arrête en gardant la progression — elle ne termine plus en silence comme si tout était scanné)

Les 4 appels utilisent `apiGetSafe` : `/me`, page artistes, albums d'un artiste, tracks d'un album.

### Blocage persisté `spotifyplus_blocked_until`
- Écrit après 3 429 consécutifs — **survit au F5** (relu au login dans l'init)
- `startSync` refuse de démarrer tant qu'il est dans le futur
- `DateRangePanel` désactive Lancer/Reprendre + bandeau countdown "🚫 Rate limit Spotify — réessaie dans X min"

1. Vérifie le compte `/me` (via `apiGetSafe` — un échec **throw**, ne termine plus la synchro en silence)
2. Charge les dates de scrapping depuis `SELECT spotify_id, last_scraped_at FROM artists_scraped`
3. Pagine `/me/following?type=artist&limit=50` en streaming (échec de page → **throw**, pas `break`)
4. Pour chaque artiste :
   - `cutoff = (scrapedDates[artist.id] || '2026-03-15').slice(0, 10)` — **tronqué au jour** : une sortie publiée le jour du dernier scan mais indexée après n'est plus ratée (doublons absorbés par `INSERT OR IGNORE`)
   - `/artists/{id}/albums?include_groups=album,single&limit=20&market=FR`
   - Filtre par `cutoff ≤ release_date ≤ aujourd'hui`
   - Pour chaque album dans la période → `/albums/{id}/tracks?limit=50`
   - Dédoublonnage via `seenUris` Set + `knownUrisRef` — skip **seulement si TOUTES les pistes sont connues** (`uris.every`) : un album dont la piste 1 est sortie en single avant n'est plus sauté en entier
   - **Singles** : `INSERT OR IGNORE` d'une seule ligne (`uris[0]`, `title = album.name`, `release_title = null`)
   - **Albums** : `INSERT OR IGNORE` d'une ligne par track (`title = t.name`, `release_title = album.name`)
5. Après chaque artiste → `INSERT OR REPLACE INTO artists_scraped` **uniquement si la liste d'albums a été lue avec succès** (sinon log ⚠ et date non avancée)
6. Après chaque artiste → `saveDB()` (async) + `localStorage.setItem('spotifyplus_sync_progress', { artists_scanned, total_artists, last_artist_name })`
7. À la fin → `endSync('completed')` (saveDB final + nettoyage localStorage) + `setProgress(100)`

### Limite journalière (100 artistes/jour)
- Vérifiée en tête de boucle artiste ; à l'atteinte : log + notification navigateur + `endSync('daily_limit')` (le bouton Reprendre apparaît **immédiatement**)
- **Passage de minuit pendant une synchro** : la date est revérifiée à chaque artiste — si le jour change, `dailyCount` repart à 0 sans arrêter la synchro

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

**⚠️ Ordre critique dans l'effet URI :** l'auto-avance doit être placée **avant** `if (listenedUrisRef.current.has(prevUri)) return` — sinon elle est court-circuitée si le titre a déjà été traité dans la session.

**⚠️ Limitation Spotify :** quand un titre se termine, Spotify retourne `200 + is_playing:false` avec la même URI → `now?.uri` ne change pas ET `now?.current` est gelé → ni l'effet URI ni l'effet current ne se déclenchent.

**3 mécanismes d'auto-avance (triple couverture) :**
1. **Effet `now?.uri`** : `currentUri` est null ou hors feed → avance (cas Spotify radio/queue)
2. **Effet `now?.current`** : `remaining ≤ 3s` ET titre dans le feed → avance (fin imminente détectée en live)
3. **Effet `now?.playing`** : transition `true → false` ET `remaining ≤ 8s` ET titre dans le feed → avance **(cas principal : fin naturelle)**

`advancedForRef` (ref, pas state) empêche les doubles appels sur le même titre. Il est **remis à null dès qu'un nouveau titre démarre** (URI différente) — permet de ré-avancer si l'utilisateur réécoute le même titre plus tard dans la session. `prevNowRef` capture l'état complet (`playing`, `uri`, `current`, `duration`) du tick précédent pour détecter la transition.

**Écritures DB hors updater** : le marquage écouté (`UPDATE tracks/stats` + `saveDB`) est fait **en dehors** de l'updater `setFeed` (les updaters React doivent rester purs) — l'item est lu via `feedRef.current`.

**Poll player avec bail-out** : le tick 5s compare le nouvel état `now` au précédent et garde la même référence si rien n'a changé (lecture en pause) → pas de re-render global inutile.

---

## Statistiques

- Table `stats` avec une seule ligne (id=1) — compteurs incrémentés à chaque écoute
- `remaining` = `SELECT COUNT(*) FROM tracks WHERE listened = 0` (recalculé)
- `remaining_ms` = `SELECT SUM(duration_ms) FROM tracks WHERE listened = 0` (recalculé)
- `listened_ms` = `SELECT SUM(duration_ms) FROM tracks WHERE listened = 1` (recalculé) — affiché dans `VosEcoutesPanel` + `now.duration * 1000` pour le titre en cours
- Réinitialisation mois/année : vérifiée au démarrage via `last_reset_month` / `last_reset_year`

---

## Purge

- Bouton **"Purger les écoutés"** dans `VosEcoutesPanel` (desktop sidebar + mobile onglet Stats)
- Action : `DELETE FROM tracks WHERE listened = 1` → `saveDB()` → `setListenStats(loadListenStatsFromDB())`
- Affiche une `alert` avec le nombre de titres supprimés

---

## PWA

- `manifest.json` à la racine — `start_url: /NewSpotifyRelease/`, `display: standalone`
- `service-worker.js` (cache `spotifyplus-v2`) — **network-first pour l'app shell** (`navigate`, `/`, `/index.html`) avec fallback cache hors-ligne ; cache-first pour le reste. Handler `activate` qui purge les anciens caches + `skipWaiting`/`clients.claim`.
- **⚠️ L'ancienne stratégie cache-first servait l'index.html du cache pour toujours** → les PWA installées ne recevaient jamais les mises à jour. Ne pas revenir en cache-first pour l'app shell.
- Enregistrement dans `<head>` : `navigator.serviceWorker.register('./service-worker.js')`
- Icônes manquantes : `icon-192.png` et `icon-512.png` à ajouter à la racine du repo

---

## UI React — composants principaux

| Composant | Rôle |
|---|---|
| `StoreProvider` | Context global — auth, dbReady, scraping, stats, feed, rate-limit, player, loopEnabled |
| `Home` | Page de login (mobile + desktop) |
| `WebApp` | Layout desktop (sidebar + contenu) |
| `MobileApp` | Layout mobile — 4 onglets : Scrapping / À écouter / ❤ Likés / Stats |
| `DateRangePanel` | Bouton Reprendre (si session en cours) / Lancer ou Recommencer de 0 / Pause / Tester connexion |
| `ScrapingStatusPanel` | Stats temps réel (3 boîtes : Artistes `X/Y` + `X/100 aujourd'hui` / Sorties / Titres) |
| `NextCallPanel` | Countdown + "Temps total restant" (ETA sync) + "Temps total de la session" (temps pour finir les 100/jour) + sélecteur délai |
| `LogsPanel` | Journal en temps réel |
| `FeedList` | Feed avec filtre type (Tous/Singles/Albums/Découvertes), filtre artiste (texte), tri (ajout/date/artiste), bannière titres masqués |
| `FeedItem` | Ligne du feed : égaliseur animé, bouton × supprimer, bouton ❤ like, swipe gauche=suppr / droite=prev. **`React.memo` + props explicites** (`isNowPlaying`, `removeFromFeed`, `setTrackLiked`, `navigateFeed`) — ne consomme PAS `useStore` (sinon les ~1000 lignes re-rendent à chaque tick du poll 5s) |
| `LikerPanel` | Liste des titres likés (liked=1 en DB) avec bouton unliker et lecture |
| `VosEcoutesPanel` | Stats d'écoute (restantes, temps restant, mois, année, all-time, **temps total écouté**) + bouton Purger |
| `PlayerBar` | Barre du bas desktop — prev/play-pause/next + **bouton loop** + SeekBar + position |
| `MobilePlayer` | Player mobile **25vh** — pochette + titre + artiste + SeekBar tactile + like + contrôles + loop |
| `SeekBar` | Barre de progression cliquable/draggable — mouse ET touch (`onTouchStart/Move/End`) |

---

## Store — état global

```js
// Clés exposées dans l'api du StoreProvider
authState        // 'loading' | 'login' | 'connected'
user             // objet Spotify /me
dbReady          // boolean — DB sql.js initialisée et prête
scraping         // boolean
paused           // boolean — pause MANUELLE uniquement
rlWaiting        // boolean — pause auto rate-limit (distincte : ne s'écrasent plus mutuellement)
blockedUntil     // timestamp ms — blocage après 3×429 (localStorage spotifyplus_blocked_until)
feed             // array d'items du feed
logs             // array de logs
now              // état lecture Spotify en cours
stats            // { artists, total, releases, tracks } — compteurs sync
listenStats      // { remaining, remaining_ms, this_month, this_year, all_time, listened_ms }
likedTracks      // array d'items feed (tracks WHERE liked=1), rechargé après chaque like/unlike
loopEnabled      // boolean
delayChoice      // 10 | 20 | 30 (secondes)
dailyScrapings   // number — artistes scrapés aujourd'hui (depuis localStorage spotifyplus_daily_scrapings)
rateLimitUntil   // timestamp ms
filteredFeed     // array — feed filtré + trié (useMemo, dépend de feed + filterType + sortBy + artistSearch)
filterType       // 'all' | 'single' | 'album' | 'dw'
sortBy           // 'default' | 'date_desc' | 'artist'
artistSearch     // string — filtre texte sur artist_name

resumableSession // { artists_scanned, total_artists, last_artist_name } | null

// Méthodes
startSync({ skipCount })       // skipCount=0 par défaut, N pour reprendre
resumeSync()                   // raccourci → startSync({ skipCount: resumableSession.artists_scanned })
togglePause()
purgeListened()
removeFromFeed(uri)            // useCallback([dbReady]) — DELETE track de la DB + retire du feed (sans compter comme écouté)
setTrackLiked(uri, bool)       // useCallback([dbReady]) — UPDATE liked en DB + recharge likedTracks + met à jour feed array
syncInitialLikes()             // vérifie /me/tracks/contains par batch de 50 (max 300 tracks) au login, sleep 400ms entre batchs
navigateFeed(dir)              // useCallback([]) — dir=-1 prev, +1 next — joue le titre adjacent dans filteredFeed
resetFilters()                 // remet filterType='all', sortBy='default', artistSearch=''
logout()
seek(positionMs)
setLoopEnabled(bool)
setDelayChoice(n)
```

### Compteur journalier `dailyScrapings`
- Persisté dans `localStorage` clé `spotifyplus_daily_scrapings` : `{ date: 'YYYY-MM-DD', count: N }`
- Chargé au démarrage de l'app (dans l'init useEffect)
- Incrémenté dans `startSync` après chaque artiste scrapé
- Remise à zéro automatique si `date` ≠ aujourd'hui
- Affiché dans la carte **Artistes** de `ScrapingStatusPanel` (`X/100 aujourd'hui`)
- Utilisé dans `NextCallPanel` pour **"Temps total de la session"** : `(100 - dailyScrapings) × délai moyen (delayChoice + 2s)` — temps restant pour finir les 100 artistes du jour, affiché uniquement pendant une synchro active

---

## MobilePlayer — player 50vh

- Remplace `MiniPlayer` sur mobile (affiché quand `now` est défini)
- **Like/unlike** : au changement d'URI, `isLiked` est initialisé **immédiatement** depuis `likedTracks` (store local), puis confirmé/corrigé par `GET /me/tracks/contains`. Évite le flash "cœur vide" sur les titres déjà likés.
- **Clic next** : seek à 25% de `duration_ms` après 400ms (laisse le temps à Spotify de démarrer)
- **SeekBar** : support touch complet (`onTouchStart` + `touchmove`/`touchend` sur `window`, `passive:false`) + `touchAction:'none'` pour bloquer le scroll pendant le drag
- **Bouton loop** : alterne entre boucle (icône accent + "1") et auto-avance (icône muted) — partagé avec `loopEnabled` du store, synchronisé avec le PlayerBar desktop
- **Hauteur** : `25vh` avec `minHeight:160px`
- Position dans le feed affichée (`currentIndex + 1 / filteredFeed.length`)

---

## Rate limit Spotify (guard module-level)

Variables `_rlUntil` (timestamp ms) et `_rlNotify` (callback React).
`apiGet`, `apiPut`, `apiPost` vérifient `_rlUntil` avant chaque appel.
Sur 429 → `_rlSet(retryMs)` bloque tous les appels player jusqu'à expiration.

---

## Bugs connus / fixes appliqués

### apiGet — HTTP 204 No Content
`/me/player/currently-playing` retourne 204 quand rien ne joue (pas de body).
Sans le guard `if (res.status === 204) return null`, `.json()` lève une exception → catch silencieux → `setNow(null)` jamais appelé → `now?.uri` ne change pas → auto-avance ne se déclenche jamais.
**Toujours retourner `null` sur 204 dans `apiGet`.**

### SeekBar — race condition useEffect
Les listeners `mousemove`/`mouseup` doivent être attachés **directement dans `onMouseDown`**, pas dans un `useEffect`. Sinon un clic rapide (mousedown + mouseup) se termine avant que React ait re-rendu et attaché les listeners.

### sql.js — params positionnels
`_db.run(sql, params)` attend un tableau de valeurs positionnelles pour les `?`. Ne jamais passer un objet `{ key: val }`.

### Babel — var hoisting
Babel compile `const`/`let` en `var`. Les **callbacks** de `useEffect` qui référencent des variables déclarées plus bas dans la même fonction body fonctionnent car ils sont exécutés après le rendu complet (les vars sont initialisées).

**⚠️ MAIS le tableau de deps est évalué PENDANT le rendu** : `useEffect(() => {...}, [feed])` placé **avant** `const [feed] = useState(...)` reçoit `[undefined]` à chaque rendu → React croit que les deps ne changent jamais → l'effet ne tourne qu'une fois. C'était le bug de `feedRef` (figé sur `[]` pour toujours). **Règle : tout hook avec un tableau de deps doit être déclaré APRÈS les variables qu'il liste.**

**⚠️ `useMemo` est encore plus strict** : son callback s'exécute **pendant le rendu**, pas après. Les variables référencées doivent donc être déclarées **avant** le `useMemo` dans le source. Ex : `filteredFeed` (useMemo) doit être déclaré après `feed` (useState), sinon `feed` vaut `undefined` au premier rendu.

### Limites connues
- iOS/Safari : stockage IndexedDB limité à ~50 Mo, purge automatique si l'app n'est pas ouverte 7 jours → privilégier Android
- sql.js charge toute la DB en RAM au démarrage — purger régulièrement les `listened = 1`
- Données sur un seul appareil, pas de sync multi-devices
