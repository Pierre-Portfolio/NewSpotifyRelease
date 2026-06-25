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
| `service-worker.js` | Cache app shell + vendor pour usage offline (v3, clé de cache normalisée) |
| `vendor/sql-wasm.js` | sql.js 1.10.2 **auto-hébergé** (hash sha384 vérifié = ancien SRI cdnjs) |
| `vendor/sql-wasm.wasm` | Binaire WebAssembly SQLite auto-hébergé (un .wasm ne peut pas avoir de SRI) |
| `icon-192.png` | Icône PWA 192×192 (à ajouter au repo) |
| `icon-512.png` | Icône PWA 512×512 (à ajouter au repo) |

---

## Stack (`index.html`)

- **React 18.3.1** via CDN (pas de build tool), Babel standalone **7.29.7**
- **⚠️ CDN épinglés + SRI** : les 3 `<script>` CDN restants (react, react-dom, babel — unpkg) ont des versions exactes + attribut `integrity` (sha384) + `crossorigin="anonymous"`. **Ne jamais changer une version sans recalculer le hash SRI** (sinon le script est bloqué par le navigateur).
- **sql.js 1.10.2 auto-hébergé** dans `vendor/` — `initSqlJs({ locateFile: f => './vendor/' + f })`. Le `.wasm` ne peut pas avoir de SRI : l'auto-hébergement ferme le dernier vecteur CDN.
- **⚠️ CSP** (`<meta http-equiv="Content-Security-Policy">` dans le `<head>`) : `connect-src` limité à `'self'` + `api.spotify.com` + `accounts.spotify.com` + `api.open-meteo.com` (météo) — même en cas d'XSS, le token ne peut pas être exfiltré vers un domaine attaquant. `'unsafe-inline'`/`'unsafe-eval'` requis par Babel standalone, `'wasm-unsafe-eval'` par sql.js. **Toute nouvelle origine (script, image, fetch) doit être ajoutée à la CSP sinon elle est bloquée par le navigateur.**
- **IndexedDB** : persistance du binaire SQLite (clé `spotifyplus_db` dans le store `db` de la base `spotifyplus`). Connexion **unique mise en cache** (`_idbPromise` dans `idbOpen`) — ne pas rouvrir à chaque get/set. `navigator.storage.persist()` est demandé au login (réduit le risque d'éviction iOS).
- **Fonts** : DM Sans (UI) + DM Mono (labels, logs, valeurs)
- **Auth** : OAuth 2.0 PKCE — 100% client-side, token stocké en `localStorage`
  - Paramètre `state` anti-CSRF généré au login (`pkce_state`), vérifié au callback avant `exchangeCode`
  - `refreshToken()` est protégé par un **mutex** (`_refreshPromise`) : les refresh tokens Spotify sont à usage unique (rotation) — deux refresh simultanés (poll player + scraping) invalideraient le compte. Le refresh token **roté est re-stocké**.
  - Sur `invalid_grant` (refresh token définitivement mort) : `logoutClear()` + reload — sinon le poll player enverrait des 401 toutes les 5s pour toujours
  - `apiGet`, `apiPut`, `apiPost` et `apiDel` retry **une fois** après refresh sur HTTP 401
- **Aucun appel backend** — l'app appelle uniquement l'API Spotify + sql.js local
- **Garde multi-onglets** : `BroadcastChannel('spotifyplus_tabs')` (ping/pong) — le deuxième onglet ouvert affiche un bandeau d'avertissement (`otherTab` dans le store, rendu dans `Shell`), car chaque `saveDB()` exporte toute la DB : deux onglets s'écraseraient mutuellement

### Config Spotify
```js
CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES       = 'user-follow-read user-read-private user-read-currently-playing user-modify-playback-state user-library-read user-library-modify'
```

### Version de l'app — `APP_VERSION`
Constante module-level `APP_VERSION` (ex. `'1.18.7'`), format `1.MM.U` où `MM.U` = **nombre de commits du dépôt avec un point inséré avant le dernier chiffre** (187 commits → `1.18.7`, 190 → `1.19.0`, 200 → `1.20.0`). Affichée en gris sous le bouton « 🗑 Purger les écoutes » de `VosEcoutesPanel` (« Version 1.18.5 »).
**⚠️ Pas de build tool pour l'injecter** : la incrémenter **manuellement à chaque commit** (le compteur = `git rev-list --count HEAD` après le commit ; le commit qui change `APP_VERSION` compte lui-même, donc poser la valeur du futur commit puis insérer le point avant le dernier chiffre).

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
  listened_at TEXT,         -- horodatage UTC de l'écoute (colonne migrée) — alimente l'Historique
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artists_scraped (
  spotify_id TEXT PRIMARY KEY,
  last_scraped_at TEXT NOT NULL,
  name TEXT,                            -- nom de l'artiste (depuis /me/following, colonne migrée)
  image_url TEXT,                       -- pochette artiste (images[0].url)
  popularity INTEGER,                   -- 0-100
  followers INTEGER,                    -- followers.total
  genres TEXT,                          -- JSON.stringify(genres[])
  spotify_url TEXT,                     -- external_urls.spotify
  last_release_count INTEGER DEFAULT 0, -- sorties trouvées au dernier scan (artistReleases)
  total_tracks_added INTEGER DEFAULT 0, -- cumul des titres ajoutés pour cet artiste
  last_scan_status TEXT,                -- 'ok' | 'partial' (scan interrompu par un 429) | 'error' (albums inaccessibles)
  scan_count INTEGER DEFAULT 0          -- nombre de scans réussis
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
function loadListenStatsFromDB()       // retourne { remaining, remaining_ms, this_month, this_year, all_time, listened_ms, total_liked }
function loadLikedTracksFromDB()       // retourne les tracks WHERE liked=1 (max 500) mappées en items feed
function loadHistoryFromDB()           // retourne les tracks WHERE listened=1 (max 200) ORDER BY listened_at DESC — plus récent en haut (Historique)
function loadArtistsFromDB()           // retourne tous les artists_scraped (ORDER BY last_scraped_at DESC) mappés : { id, name, image, popularity, followers, genres[], spotifyUrl, lastScrapedAt, lastReleaseCount, totalTracksAdded, lastScanStatus, scanCount } — alimente la section Artistes
function mapFeedRow(t)                  // mappe une ligne DB `tracks` → item du feed (id, spotifyUri, label, artist, title, subtitle, date, image, isNew, liked, rawDate, duration_ms)
function loadFeedFromDB({ artistSearch, filterType, sortBy })   // titres WHERE listened=0, **filtre ET tri appliqués EN SQL** puis LIMIT 1000. `filterType` → WHERE sur `release_type` ('single' / 'discover_weekly' / album = NULL ou NOT IN(single,dw)) ; `sortBy` → ORDER BY `release_date ASC` / `artist_name COLLATE NOCASE` / `id ASC` ; `artistSearch` → `LIKE '%…%'`. Comme le cap LIMIT 1000 s'applique **après** filtre+tri, **tout filtre/tri actif balaie TOUTE la base** (Singles, plus anciens, artiste recherché) même au-delà de la 1000e ligne. Appelé par le chargement initial (défauts) et par l'effet de filtres
```

### Migrations DB (idempotentes)
`initDB()` exécute dans des try/catch après chaque chargement (nouveau ou depuis IndexedDB) — sans effet si la colonne existe déjà :
- `ALTER TABLE tracks ADD COLUMN liked INTEGER DEFAULT 0`
- `ALTER TABLE tracks ADD COLUMN listened_at TEXT` — horodatage UTC posé via `datetime('now')` au moment où un titre passe `listened = 1` (marquage auto fin de titre + clic croix rouge × via `removeFromFeed`) ; alimente l'Historique
- `ALTER TABLE stats ADD COLUMN total_listened_ms INTEGER DEFAULT 0`
- `ALTER TABLE stats ADD COLUMN total_liked INTEGER DEFAULT 0` — compteur de likes posés **dans l'app** (via `setTrackLiked` uniquement, PAS par `syncInitialLikes`) ; persistant, non purgeable
- `ALTER TABLE artists_scraped ADD COLUMN name / image_url / popularity / followers / genres / spotify_url / last_release_count / total_tracks_added / last_scan_status / scan_count` — **métadonnées artiste gratuites** (déjà présentes dans l'objet `/me/following`, aucune requête en plus) + compteurs de scan. Renseignées dans l'`INSERT … ON CONFLICT` (UPSERT) après chaque artiste scrapé avec succès

### Champs des items feed
Chaque item du feed contient : `id, spotifyUri, label, artist, title, subtitle, date, rawDate, image, isNew, liked, duration_ms`
- `rawDate` : date ISO brute (`YYYY-MM-DD`) utilisée pour le tri par date de sortie
- `liked` : 0 ou 1, synchronisé depuis DB et mis à jour en temps réel par `setTrackLiked`
- `duration_ms` : durée en millisecondes — utilisée pour le seek à 25% au clic next

### syncInitialLikes
Appelée via `useEffect` dès que `dbReady` passe à `true`. Récupère jusqu'à 300 tracks non écoutés, interroge `/me/library/contains` (helper `libraryContains`) par batch de **40 URIs** (max imposé par l'API), met à jour `liked` en DB + feed array + `likedTracks` state.
**TTL 24h** (`localStorage spotifyplus_likes_synced_at`) : jusqu'à 8 requêtes par appel, inutile à chaque reload de page.

### Helpers library — migration API Spotify février 2026
`/me/tracks/contains` et `PUT/DELETE /me/tracks` ont été **supprimés** par Spotify (appliqué aux apps Development Mode existantes le 9 mars 2026). Remplaçants génériques module-level dans `index.html` :
- `libraryContains(uris)` → `GET /me/library/contains?uris=…` (max 40 URIs, retourne un tableau de booléens ou `null` si erreur/403/rate-limit)
- `librarySave(uri)` / `libraryRemove(uri)` → `PUT/DELETE /me/library?uris=…` — **URIs en query string, même pour le PUT** (pas de body)
- `libraryScopeAlert(result)` : si l'API répond `403 forbidden` (token émis avant l'ajout des scopes `user-library-read/modify`), affiche une alerte demandant une déconnexion/reconnexion et retourne `true` (le caller annule sa mise à jour d'état)
- ⚠ `apiDel` mappe désormais aussi le statut 403 sur `{ error: 'forbidden' }` (comme `apiPut`/`apiPost`)

### FeedItem — swipe mobile
- `onTouchStart` : capture `touchStartX`
- `onTouchMove` : calcule `swipeDx`, applique `translateX` + teinte de fond (rouge=gauche, accent=droite)
- `onTouchEnd` : `swipeDx < -60` → `removeFromFeed` · `swipeDx > 60` → `navigateFeed(-1)`

### Notification fin de session
Déclenchée quand `dailyCount >= QUOTA_MAX` (100) dans `startSync` via le helper module-level `notify(title, body)` (permission demandée si `'default'`, silencieuse si `'denied'`).
**⚠️ Mobile (Android Chrome)** : `new Notification()` lève `Illegal constructor` quand un service worker est actif. `notify()` passe donc par `navigator.serviceWorker.ready → reg.showNotification()` en priorité, avec fallback `new Notification()` dans un try/catch — ne jamais réintroduire un `new Notification()` direct dans la synchro.

### Découvertes de la semaine (`importDiscoverWeekly`)
- Appelée dans l'init **avant** le chargement du feed (les tracks DW sont visibles dès le login)
- Early-return si `Date.now() < _rlUntil` (fenêtre rate-limit active) — retente au prochain login
- Cherche dans `GET /me/playlists` la playlist dont `owner.id === 'spotify'` et dont le nom contient `'découvertes'` ou `'discover weekly'`
- Insère les tracks avec `release_type = 'discover_weekly'`, `release_title = 'Découvertes de la semaine'`
- Skip si `localStorage('spotifyplus_dw_last_import')` < 7 jours
- **⚠ Migration février 2026** : l'appel utilise `GET /playlists/{id}/items` (ex-`/tracks`, renommé) et lit `entry.item || entry.track` (champ renommé). Le contenu des playlists n'est renvoyé **que** pour les playlists possédées/collaboratives — "Découvertes de la semaine" appartenant à Spotify, l'API répond généralement 403 ou sans `items` : dans ce cas, log ⚠ explicite + `DW_LS_KEY` posé (nouvel essai dans 7 jours, auto-réparant si Spotify rouvre l'accès). L'import est donc **probablement inopérant** tant que Spotify n'expose plus ses playlists éditoriales aux apps tierces.
- Les messages sont collectés dans `initMsgs[]` et affichés dans le panneau Logs au login
- Tag **Découvertes** (violet `oklch(0.65 0.18 300)`) dans le feed, tag **DW** sur mobile

### Règles d'écriture DB
- `saveDB()` est appelé **après chaque artiste scrapé**, **après chaque écoute marquée**, **après une purge**, **à chaque fin de synchro** (`endSync`) et **quand l'app passe en arrière-plan** (`visibilitychange → hidden`)
- `saveDB()` est **sérialisé** (`_savePromise` + `_saveQueued`) : jamais deux exports/écritures IndexedDB en parallèle. Pas de debounce temporel — chaque appel garantit une écriture incluant ses données (boucle do/while qui ré-exporte si un appel est arrivé pendant l'écriture). **Ne pas remplacer par un debounce** : risque de perte de données si l'OS tue l'onglet mobile.
- Toujours utiliser `INSERT OR IGNORE` pour les tracks (UNIQUE sur `spotify_uri`)
- Utiliser un **UPSERT `INSERT … ON CONFLICT(spotify_id) DO UPDATE`** pour `artists_scraped` (PAS `INSERT OR REPLACE` qui effacerait les cumuls `total_tracks_added`/`scan_count`) — mais **uniquement si le fetch des albums a réussi** (sinon la fenêtre de scan est brûlée sans avoir rien scanné)

---

## Logique de scraping (dans `startSync`)

### État de synchro unifié — `syncState` (enum)
**Un seul état remplace les 3 booléens** `scraping`/`paused`/`rlWaiting` :
`syncState : 'idle' | 'running' | 'paused' (pause manuelle) | 'rl_waiting' (attente 429)`
- `setSync(st)` pose **synchroniquement** `syncStateRef.current` puis `setSyncState` — le guard anti double-clic de `startSync` et le `checkpoint()` lisent l'état réel, pas celui du dernier render
- Les booléens `scraping` (`!== 'idle'`), `paused`, `rlWaiting` sont **dérivés** et toujours exposés dans l'api du store (l'UI ne change pas)
- Pause pendant `rl_waiting` → passe à `paused` ; à la reprise, le checkpoint re-détecte la fenêtre 429 et re-pose `rl_waiting`

### Conditions de NON-démarrage — toutes en tête de `startSync`, AVANT toute requête
1. `syncStateRef.current !== 'idle'` → return (guard par **ref** : insensible au double-clic avant re-render)
2. `Date.now() < _rlUntil` (fenêtre rate-limit persistée) → log + bandeau, return
3. **Quota 24h** : fenêtre glissante encore active (`loadQuota().until > Date.now()`) → log "prochaine synchro dans X h Y min", return — avant, cliquer Lancer/Reprendre avec le quota consommé dépensait `/me` + les pages d'artistes pour rien

### Arrêts de synchro unifiés — `endSync(reason)` + `checkpoint()`
**Tous les chemins d'arrêt passent par `endSync(reason)`** (`'completed' | 'daily_limit' | 'error'`) :
- reset `nextCall` / `nextCallTotal` / `eta`, `setSync('idle')`
- `'completed'` → supprime `spotifyplus_sync_progress` + `setResumableSession(null)`
- autres raisons → **relit le localStorage et re-set `resumableSession`** : le bouton "↩ Reprendre" apparaît immédiatement, sans reload
- `await saveDB()` final dans tous les cas

**`checkpoint()`** est attendu avant **chaque** appel API de la synchro (via `apiGetSafe`). **UNE seule boucle d'attente** pour : la pause manuelle (`syncStateRef === 'paused'`) ET la fenêtre rate-limit globale (`Date.now() < _rlUntil`, posée par n'importe quel 429, player compris). Quand il attend sur la fenêtre 429, c'est lui qui pose `rl_waiting` + le countdown (`setNextCall` dérivé de `_rlUntil`) et qui repasse en `running` à l'expiration. **Plus aucune requête ne part pendant une pause, et plus de sleep parallèle dans `apiGetSafe`.**

### Gestion du rate-limit 429 (wrapper `apiGetSafe`)
Défini localement dans `startSync` :
- `await checkpoint()` en tête de chaque tentative
- Sur erreur `RATE_LIMIT` : **stop complet dès le PREMIER 429** → `_rlSet(max(Retry-After, 15 min))` (fenêtre **persistée**, partagée par tous les appels), `setBlockedUntil`, throw `SYNC_RATE_ABORT` → catch → `endSync('error')` (progression sauvegardée, bouton ↩ Reprendre immédiat). Plus de streak/disjoncteur à 3 : l'ancien comportement (pause `Retry-After` + retry jusqu'à 3 429 consécutifs) a été retiré à la demande de l'utilisateur.
- Retour `{ rate_limited: true }` (bloqué par le guard global) → `continue` : re-checkpoint puis retry, **jamais** traité comme une réponse valide
- Body d'erreur HTTP (`data.error` : 401 non rattrapé, 403, 5xx) → **throw** (la synchro s'arrête en gardant la progression — elle ne termine plus en silence comme si tout était scanné)

Les 4 appels utilisent `apiGetSafe` : `/me`, page artistes, albums d'un artiste, tracks d'un album.

### Fenêtre rate-limit persistée `spotifyplus_blocked_until` (= `_rlUntil`)
- **Une seule source de vérité** : `_rlUntil` (module-level) est écrit dans localStorage à chaque `_rlSet()` (429 player OU stop synchro min. 15 min) et **relu au chargement du module** — un blocage survit au F5 pour TOUS les appels (player, login, synchro), pas seulement pour le bouton Lancer
- `startSync` refuse de démarrer tant que `Date.now() < _rlUntil`
- `_rlNotify → setBlockedUntil` : tout 429 (player compris) affiche le bandeau et désactive Lancer
- `DateRangePanel` désactive Lancer/Reprendre + bandeau countdown "🚫 Rate limit Spotify — réessaie dans X min"
- Au boot pendant une fenêtre active : `/me` retourne `rate_limited` → l'app entre quand même en mode **connecté dégradé** (`user=null`) au lieu d'éjecter vers le login
- `Retry-After` est blindé par `_parseRetryAfterMs` (un header malformé donnait `NaN` → guard inopérant + retry immédiat sur une API qui vient de throttle)

1. Vérifie le compte `/me` (via `apiGetSafe` — un échec **throw**, ne termine plus la synchro en silence)
2. Charge les dates de scrapping depuis `SELECT spotify_id, last_scraped_at FROM artists_scraped`
3. Pagine `/me/following?type=artist&limit=50` en streaming (échec de page → **throw**, pas `break`)
4. Pour chaque artiste :
   - `cutoff = (scrapedDates[artist.id] || '2026-03-15').slice(0, 10)` — **tronqué au jour** : une sortie publiée le jour du dernier scan mais indexée après n'est plus ratée (doublons absorbés par `INSERT OR IGNORE`)
   - `/artists/{id}/albums?include_groups=album,single&limit=10&market=FR` — **⚠ limit max = 10 depuis la migration Spotify de février 2026** (appliquée aux apps existantes le 9 mars 2026 ; avant : max 50). `limit=20` → `400 "Invalid limit"`. Ne jamais remonter au-dessus de 10.
   - Filtre par `cutoff ≤ release_date ≤ aujourd'hui`
   - Pour chaque album dans la période → `/albums/{id}/tracks?limit=50`
   - Dédoublonnage via `seenUris` Set + `knownUrisRef` — skip **seulement si TOUTES les pistes sont connues** (`uris.every`) : un album dont la piste 1 est sortie en single avant n'est plus sauté en entier
   - **Singles** : `INSERT OR IGNORE` d'une seule ligne (`uris[0]`, `title = album.name`, `release_title = null`)
   - **Albums** : `INSERT OR IGNORE` d'une ligne par track (`title = t.name`, `release_title = album.name`)
5. **Dès que la liste d'albums est lue avec succès** (AVANT la boucle des pistes) → **écriture d'une ligne « légère »** : `INSERT … ON CONFLICT` qui pose les métadonnées + `last_scan_status='partial'` + `last_scraped_at = cutoffISO` (date existante ou défaut, **jamais avancée**) ; l'`ON CONFLICT` ne touche **que** les métadonnées (pas `last_scraped_at`/`scan_count`/`total_tracks_added`). Objectif : l'artiste **apparaît immédiatement** dans le panneau (avec `setArtists(loadArtistsFromDB())`) même si un **429 coupe le scan plus bas** — sans avancer sa date, donc aucun titre raté. Le statut reste `'partial'` tant que le scan n'est pas terminé.
   - Après chaque artiste **terminé** → **`INSERT … ON CONFLICT(spotify_id) DO UPDATE` (UPSERT) final** qui **avance `last_scraped_at = datetime('now')`**, passe `last_scan_status='ok'`, **cumule** `total_tracks_added` + `scan_count`, pose `last_release_count` (`artistReleases`) et rafraîchit les métadonnées. (`'partial'` n'est donc visible que pour un artiste interrompu entre les deux écritures.)
   - Si la liste d'albums est **inaccessible** (fetch échoué) → log ⚠ + `UPDATE last_scan_status='error'` qui n'affecte qu'une ligne existante (pas d'INSERT, date non avancée)
6. Après chaque artiste → `saveDB()` (async) + `localStorage.setItem('spotifyplus_sync_progress', { artists_scanned, total_artists, last_artist_name, page_url, page_offset })` — `page_url` = URL de la page `/me/following` en cours, `page_offset` = nombre d'artistes de cette page déjà traités
7. À la fin → `endSync('completed')` (saveDB final + nettoyage localStorage) + `setProgress(100)`

### Quota 100 artistes / fenêtre GLISSANTE de 24h
- **Ce n'est PLUS une limite par jour calendaire** (remise à zéro à minuit) mais une **fenêtre glissante de 24h** : atteindre 100 artistes démarre un compteur de 24h, et toute synchro suivante est refusée jusqu'à son expiration. Avant, on pouvait scraper 100 à 23h30 puis 100 de plus à 00h30.
- Helpers module-level `loadQuota()` / `saveQuota(count, until)` autour de `localStorage` clé `spotifyplus_daily_scrapings` = `{ count, until }` (`until` = timestamp ms de fin de la fenêtre 24h, `0` tant que < 100). `loadQuota()` **remet `count` à 0 si `until` est dépassé** (fenêtre expirée).
- **`ensureQuotaWindow()` (helper module-level, AUTO-RÉPARANT)** : si `count ≥ 100` sans fenêtre valide (`until` absent/expiré), ouvre et persiste une fenêtre de 24h **maintenant**, et retourne le timestamp de fin (`0` si quota non atteint). Corrige un **état hérité de l'ancien format `{ date, count:100 }`** (pré-fenêtre-glissante) qui laissait le compteur bloqué à 100 **sans `until`** : le garde `startSync` ne bloquait pas (until=0), la synchro démarrait, atteignait le quota en tête de boucle et s'arrêtait **sans jamais poser de date** → bloqué en boucle, aucun countdown affichable. Appelé aux **3 endroits** : init (expose la fenêtre au chargement), garde `startSync`, garde de boucle.
- Vérifiée en tête de boucle artiste ; à l'atteinte : log + notification navigateur + `endSync('daily_limit')` (le bouton Reprendre apparaît **immédiatement**) — et aussi vérifiée **en tête de `startSync`** via `loadQuota().count >= QUOTA_MAX` (refus avant toute requête)
- **Les deux logs de refus quota + la notification affichent la date/heure absolue de réouverture** (`toLocaleString('fr-FR', { dateStyle:'long', timeStyle:'short' })`) en plus de la durée relative
- **`dailyCount` est incrémenté APRÈS la requête albums** (pas avant) : un throw (erreur API, stop 429) ne brûle plus le quota d'un artiste qui n'a pas été scanné
- **La fenêtre 24h est gelée à l'instant exact du 100e artiste** : `until = Date.now() + 24h` est posé dans l'incrément qui atteint 100 (pas au tour de boucle suivant), `setQuotaUntil(until)` met à jour l'UI. `ensureQuotaWindow()` **ne ré-écrase pas** une fenêtre déjà active (préserve l'instant du 100e scan).
- `quotaUntil` (state + store) alimente un **bandeau de countdown** affiché à **deux endroits** (chacun avec son propre `setInterval` 1s) : dans `DateRangePanel` (désactive aussi Lancer/Reprendre via `anyBlock = blocked (429) || quotaBlocked`) ET sous la barre de progression de `ScrapingStatusPanel` (là où l'utilisateur lit déjà `X/100 sur 24h`). Texte : « ⏳ Quota de 100 artistes atteint — Prochaine synchro le **{fmtQuotaWhen(until)}** (dans {fmtRemaining(ms)}) ». Helpers module-level `fmtRemaining(ms)` (« X h Y min ») et `fmtQuotaWhen(until)` (« 19 juin à 18:10 »)

### Reprise de synchro après interruption / redémarrage
- La progression est sauvegardée dans `localStorage` (`spotifyplus_sync_progress`) après chaque artiste, **avec le curseur de pagination** (`page_url` + `page_offset`)
- Au login, si une progression existe → `setResumableSession(p)` → bouton **"↩ Reprendre"** affiché
- `resumeSync()` → `startSync({ skipCount, resumeUrl: page_url, resumeOffset: page_offset })` : la reprise **repart directement sur la bonne page** — avant, elle re-paginait `/me/following` depuis le début (~20 fetchs dos à dos sans délai pour sauter 1000 artistes = burst exactement au pire moment post-429)
- Compat : une ancienne progression sans `page_url` retombe sur l'ancien re-parcours avec saut (`globalArtistIndex <= skipCount → continue`)
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

**⚠️ Clic « Suivant » manuel (helper `markListened`) :** le retrait du feed quand on **clique** sur Suivant ne doit PAS dépendre uniquement de l'effet « URI a changé ». Le poll player n'interroge Spotify que toutes les 5s : sur un **double-clic rapide** (2 fois en < 3s), `now.uri` saute de trackA → trackC, et le titre **intermédiaire trackB n'apparaît jamais dans `now.uri`** → l'effet URI ne le voit jamais → il restait dans le feed.
- `markListened(uri)` (`useCallback([dbReady])`, exposé dans l'api du store) : même logique que l'effet URI (UPDATE `tracks`/`stats` + `saveDB` + recharge stats/history + animation de retrait), **idempotent via `listenedUrisRef`** (un titre déjà compté par le poll n'est pas recompté).
- Les 3 players (`PlayerBar`, `MobilePlayer`, `CompactPlayer`) capturent l'URI du titre quitté (`filteredFeed[currentIndex]`) **avant** de jouer le suivant, puis appellent `markListened(leaving)` après `playTrack`. `navigateFeed(+1)` fait de même. Effet de bord bienvenu : le retrait est désormais **immédiat** (plus d'attente du poll 5s), même sur un clic simple.
- Ne se déclenche que si `currentIndex !== -1` (titre du feed en cours) → un titre hors feed lancé manuellement n'est jamais marqué.

**⚠️ Ordre critique dans l'effet URI :** l'auto-avance doit être placée **avant** `if (listenedUrisRef.current.has(prevUri)) return` — sinon elle est court-circuitée si le titre a déjà été traité dans la session.

**⚠️ Limitation Spotify :** quand un titre se termine, Spotify retourne `200 + is_playing:false` avec la même URI → `now?.uri` ne change pas ET `now?.current` est gelé → ni l'effet URI ni l'effet current ne se déclenchent.

**3 mécanismes d'auto-avance (triple couverture) :**
1. **Effet `now?.uri`** : `currentUri` est null ou hors feed **ET le titre quitté était proche de sa fin** (`prevNowRef` : `duration - current ≤ 12s` au dernier tick) → avance (cas Spotify radio/queue). **⚠ Garde anti-vol de lecture** : sans la condition `nearEnd`, lancer manuellement un titre hors feed (ou stopper la lecture) en plein milieu d'un titre du feed déclenchait `playTrack` et écrasait le choix de l'utilisateur. `prevNowRef` est mis à jour par l'effet 3 (déclaré APRÈS) → il contient encore l'état du tick précédent quand l'effet 1 s'exécute.
2. **Effet `now?.current`** : `remaining ≤ 3s` ET titre dans le feed → avance (fin imminente détectée en live)
3. **Effet `now?.playing`** : transition `true → false` ET `remaining ≤ 8s` ET titre dans le feed → avance **(cas principal : fin naturelle)**

`advancedForRef` (ref, pas state) empêche les doubles appels sur le même titre. Il est **remis à null dès qu'un nouveau titre démarre** (URI différente) — permet de ré-avancer si l'utilisateur réécoute le même titre plus tard dans la session. `prevNowRef` capture l'état complet (`playing`, `uri`, `current`, `duration`) du tick précédent pour détecter la transition.

**Écritures DB hors updater** : le marquage écouté (`UPDATE tracks/stats` + `saveDB`) est fait **en dehors** de l'updater `setFeed` (les updaters React doivent rester purs) — l'item est lu via `feedRef.current`.

**Poll player avec bail-out** : le tick 5s compare le nouvel état `now` au précédent et garde la même référence si rien n'a changé (lecture en pause) → pas de re-render global inutile.

**Poll player — économie de requêtes** :
- **Onglet caché** (`visibilityState === 'hidden'`) → le tick ne fait aucun appel ; au retour (`visible`), un tick de rattrapage part immédiatement
- **Fenêtre 429 active** → `apiGet` retourne `{ rate_limited: true }` et le tick **garde l'état `now` affiché tel quel** — avant, le `null` faisait disparaître le player et polluait les effets d'auto-avance alors que la musique jouait toujours

---

## Statistiques

- Table `stats` avec une seule ligne (id=1) — compteurs incrémentés à chaque écoute
- `remaining` = `SELECT COUNT(*) FROM tracks WHERE listened = 0` (recalculé)
- `remaining_ms` = `SELECT SUM(duration_ms) FROM tracks WHERE listened = 0` (recalculé)
- `listened_ms` = `SELECT SUM(duration_ms) FROM tracks WHERE listened = 1` (recalculé) — affiché dans `VosEcoutesPanel` + `now.duration * 1000` pour le titre en cours
- `total_liked` (colonne `stats`) = compteur de likes posés **dans l'app** : +1 à chaque like, −1 (plancher 0) à chaque unlike via `setTrackLiked` — **jamais** alimenté par `syncInitialLikes` (les likes Spotify importés ne comptent pas). Affiché dans `VosEcoutesPanel` en **% likés** = `total_liked / total_listened × 100`. Persistant : la purge ne touche pas la table `stats`
- Réinitialisation mois/année : vérifiée au démarrage via `last_reset_month` / `last_reset_year`

---

## Purge

- Bouton **"Purger les écoutes"** dans `VosEcoutesPanel` (desktop sidebar + mobile onglet Stats)
- Action : `DELETE FROM tracks WHERE listened = 1` (**likés compris**) → `saveDB()` → `setListenStats` + `setLikedTracks`
- **L'onglet ❤ Likés est aussi vidé** des titres écoutés. Le **% likés** n'est PAS affecté : il vit dans la table `stats` (`total_liked / total_listened`), indépendante des lignes `tracks` supprimées
- `removeFromFeed` (bouton croix rouge × **et** swipe gauche mobile) traite le titre **comme écouté** : `listened = 1` + `listened_at` + **incrément des compteurs `stats`** (`total_listened`, `listened_this_month/year`, `total_listened_ms`) → le titre apparaît dans l'**Historique** et compte dans les **stats d'écoute**. **Plus aucun `DELETE`** : le titre (liké ou non) reste en DB avec `listened = 1` (nécessaire pour l'Historique), il sera ensuite purgé par le bouton Purger. **Idempotent via `listenedUrisRef`** : si le poll player a déjà compté le titre, il n'est pas recompté (on s'assure juste qu'il est marqué via `COALESCE(listened_at, …)`)
- Affiche une `alert` avec le nombre de titres supprimés

---

## PWA

- `manifest.json` à la racine — `start_url: /NewSpotifyRelease/`, `display: standalone`
- `service-worker.js` (cache `spotifyplus-v3`) — **network-first pour l'app shell** (`navigate`, `/`, `/index.html`) avec fallback cache hors-ligne ; cache-first pour le reste (dont `vendor/`, précaché). Handler `activate` qui purge les anciens caches + `skipWaiting`/`clients.claim`.
- **⚠️ Clé de cache NORMALISÉE** : l'app shell est toujours stocké sous `'./index.html'` (`c.put('./index.html', copy)`), jamais sous l'URL réelle de navigation — sinon le retour OAuth (`?code=...&state=...`) écrivait le code d'autorisation dans Cache Storage
- **⚠️ L'ancienne stratégie cache-first servait l'index.html du cache pour toujours** → les PWA installées ne recevaient jamais les mises à jour. Ne pas revenir en cache-first pour l'app shell.
- Enregistrement dans `<head>` : `navigator.serviceWorker.register('./service-worker.js')`
- Icônes manquantes : `icon-192.png` et `icon-512.png` à ajouter à la racine du repo

---

## UI React — composants principaux

| Composant | Rôle |
|---|---|
| `StoreProvider` | Context global — auth, dbReady, syncState (+ scraping/paused/rlWaiting dérivés), stats, feed, rate-limit, player, loopEnabled, otherTab |
| `Home` | Page de login (mobile + desktop) |
| `WebApp` | Layout desktop (sidebar + contenu) — barre du haut avec **sélecteur de vue** `view` ('scrapping' / 'artistes') : le contenu central bascule entre le feed (`ScrapingStatusPanel` + `FeedList`) et `ArtistsPanel`, les sidebars (player, stats, historique) restent visibles |
| `ArtistsPanel` | **Section Artistes** — liste des artistes scrappés (`store.artists` ← `loadArtistsFromDB`) avec **filtres** (recherche nom/id, statut Tous/OK/**Partiel**/Erreur, tri : scan récent / **scan ancien** / nom A→Z / popularité / titres ajoutés / nb de scans) + compteur `X/total`. Chaque ligne via `ArtistRow` : pochette artiste, nom (ou « Artiste inconnu »), **id Spotify** (mono), badge statut (✓ OK vert / ⏳ Partiel orange = scan coupé par un 429 / ⚠ Erreur rouge), lien ↗ Spotify, chips genres (max 3), métriques (📅 dernier scrap relatif, ★ popularité, 👥 abonnés via `fmtCompactNum`, 🔁 nb scans, 🎵 titres ajoutés, 🆕 sorties au dernier scan). Affiché en onglet sur mobile, en vue centrale sur desktop |
| `MobileApp` | Layout mobile — onglets : **3 principaux affichés** (Scrapping / En attente / ❤ Likés) + **menu « ⋯ »** (overflow) regroupant **Météo / Finance / Histo / Artistes / Stats** (dans cet ordre) pour gagner de la place en haut. `overflowTabs` = tableau `[clé, libellé, couleur?]` — **Météo et Finance ont une couleur bleue** (`METEO_BLUE` / `FINANCE_BLUE`) en 3e position, appliquée au libellé du dropdown. `menuOpen` (state local) ouvre un dropdown avec overlay de fermeture au clic extérieur ; le bouton ⋯ prend la couleur accent quand l'onglet actif est dans l'overflow |
| `CompactPlayer` | **Vue ultra-compacte** affichée à la place de `MobileApp` quand le viewport est très court (`useShortViewport`, `innerHeight < 500` — ex. fenêtre du bas en split-screen sur tel). Affiche titre/artiste + contrôles **précédent / play-pause / suivant / ❤ like**. Le bouton like reprend la logique du `MobilePlayer` (`isLiked` initialisé en local depuis `feed`/`likedTracks`, `libraryContains` seulement si le titre est inconnu ; écritures via `librarySave`/`libraryRemove` + `libraryScopeAlert` + `setTrackLiked`). Sélectionné dans `Shell` : `isMobile && shortViewport → <CompactPlayer/>` |
| `DateRangePanel` | Bouton Reprendre (si session en cours) / Lancer ou Recommencer de 0 / Pause. Bandeau countdown si blocage 429 (`blockedUntil`) **ou** quota 24h atteint (`quotaUntil`) — boutons désactivés via `anyBlock` |
| `ScrapingStatusPanel` | Stats temps réel (3 boîtes : Artistes `X/Y` + `X/100 sur 24h` / Sorties / Titres) + **countdown quota 24h** sous la barre de progression quand `quotaUntil` est actif |
| `NextCallPanel` | Countdown + "Temps total restant" (ETA sur **tous** les artistes restant à scraper, PAS plafonnée aux 100/jour) + "Temps total de la session" (temps pour finir les 100/jour) + sélecteur délai |
| `LogsPanel` | Journal en temps réel |
| `FeedList` | Feed avec filtre type (Tous/Singles/Albums/Découvertes), filtre artiste (texte), tri (ajout/date/artiste), bannière titres masqués. **Bannières de date (mobile uniquement)** : séparateur "📅 20 juin 2026" inséré à chaque changement de jour de sortie (`rawDate`) entre deux items consécutifs — actif en tri "Ordre d'ajout" et "Date sortie ↑", désactivé en tri "Artiste A→Z". La clé React est portée par un `<React.Fragment key={item.id}>` (bannière + FeedItem), les clés restent stables. **Empty-state** : « Aucune musique en attente » seulement si `feed.length === 0 && !filtersOn` — sinon (filtre/recherche actif) la toolbar reste visible (sinon impossible d'effacer une recherche à 0 résultat). **Bannière titres masqués masquée dès qu'un filtre/tri est actif** (`filtersOn`) : la requête balaie alors toute la DB (filtre+tri en SQL), le cap des 1000 ne masque plus de résultats correspondants |
| `FeedItem` | Ligne du feed : égaliseur animé, bouton × supprimer, bouton ❤ like, swipe gauche=suppr / droite=prev. **`React.memo` + props explicites** (`isNowPlaying`, `removeFromFeed`, `setTrackLiked`, `navigateFeed`) — ne consomme PAS `useStore` (sinon les ~1000 lignes re-rendent à chaque tick du poll 5s) |
| `LikerPanel` | Liste des titres likés (liked=1 en DB) avec bouton unliker et lecture |
| `HistoryPanel` | **Historique** des titres écoutés non purgés (listened=1), trié `listened_at DESC` (plus récent en haut) — horodatage relatif (`formatListenedAt`) + bouton réécouter. Desktop : sidebar droite sous VOS ÉCOUTES · Mobile : onglet **Historique** |
| `VosEcoutesPanel` | Stats d'écoute (restantes, temps restant, mois, année, all-time, **temps total écouté**, **% titres likés** via l'app) + bouton **🔄 Réinitialiser le quota 24h** (affiche `X/100` + `· bloqué` si fenêtre active, `confirm()` puis `resetQuota()`) + bouton **🗑 Purger les écoutes** + **texte gris « Version {APP_VERSION} »** centré sous le bouton Purger |
| `MeteoPanel` | **Section Météo** (titre `MÉTÉO` en bleu `METEO_BLUE = '#4ea3f5'`) — **section/onglet propre** : sidebar droite desktop (entre Météo et Historique) + **onglet dédié `meteo`** dans le menu overflow mobile (plus dans l'onglet Stats). Prévisions **3 jours** (aujourd'hui + 2) pour **3 lieux dans l'ordre** : Voisins-le-Bretonneux + Boulogne-Billancourt (coords codées en dur dans `METEO_LOCS`) puis **Ma position** (`navigator.geolocation.getCurrentPosition`, fallback « Position non autorisée » si refus/erreur). Données via **Open-Meteo** (API gratuite sans clé, du repo public-apis) : `GET https://api.open-meteo.com/v1/forecast?daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3` — **origine ajoutée à la CSP `connect-src`**. `fetchMeteo(lat,lon)` mappe `daily` en `{date,code,tmax,tmin}` ; `wmoMeteo(code)` → `[emoji, libellé FR]` (codes WMO) ; `meteoDayLabel(iso,i)` → « Auj./Lun./… ». Chaque jour : emoji + tmax (en bleu, mono) + tmin. Sous-composant `MeteoLoc` (1 lieu) ; fetch en parallèle dans un `useEffect([])` avec garde `cancelled` |
| `FinancePanel` | **Section Finance** (titre `FINANCE` en bleu `FINANCE_BLUE = '#4ea3f5'`) — **vide pour le moment** (placeholder « Section Finance — bientôt disponible »). Affichée en section propre sidebar droite desktop (sous Météo) + **onglet dédié `finance`** dans le menu overflow mobile |
| `PlayerBar` | Barre du bas desktop — prev/play-pause/next + **bouton loop** + SeekBar + position |
| `MobilePlayer` | Player mobile **25vh** — pochette + titre + artiste + SeekBar tactile + like + contrôles + loop |
| `SeekBar` | Barre de progression cliquable/draggable — mouse ET touch (`onTouchStart/Move/End`) |

---

## Store — état global

```js
// Clés exposées dans l'api du StoreProvider
authState        // 'loading' | 'login' | 'connected'
user             // objet Spotify /me (null si boot pendant une fenêtre 429 — mode dégradé)
otherTab         // boolean — un autre onglet de l'app est ouvert (bandeau d'avertissement)
dbReady          // boolean — DB sql.js initialisée et prête
syncState        // 'idle' | 'running' | 'paused' | 'rl_waiting' — source de vérité unique
scraping         // boolean DÉRIVÉ (syncState !== 'idle')
paused           // boolean DÉRIVÉ (syncState === 'paused') — pause MANUELLE
rlWaiting        // boolean DÉRIVÉ (syncState === 'rl_waiting') — attente auto 429
blockedUntil     // timestamp ms — fenêtre rate-limit persistée (localStorage spotifyplus_blocked_until = _rlUntil)
feed             // array d'items du feed
logs             // array de logs
now              // état lecture Spotify en cours
stats            // { artists, total, releases, tracks } — compteurs sync
listenStats      // { remaining, remaining_ms, this_month, this_year, all_time, listened_ms, total_liked }
likedTracks      // array d'items feed (tracks WHERE liked=1), rechargé après chaque like/unlike
history          // array d'items (tracks WHERE listened=1, max 200, plus récent en haut), rechargé à chaque écoute / removeFromFeed / purge
artists          // array d'artistes scrappés (table artists_scraped + métadonnées), rechargé au login (dbReady), après CHAQUE artiste scanné pendant la synchro (compteur en temps réel) et à chaque fin de synchro (endSync) — alimente la section Artistes
loopEnabled      // boolean — persisté dans localStorage (spotifyplus_loop, '1'/'0') : survit au changement d'onglet / F5
delayChoice      // 10 | 20 | 30 (secondes)
dailyScrapings   // number — artistes scrapés dans la fenêtre 24h en cours (localStorage spotifyplus_daily_scrapings)
quotaUntil       // timestamp ms — fin de la fenêtre glissante de 24h ouverte au 100e artiste (0 si inactive)
filteredFeed     // array — feed filtré + trié (useMemo, dépend de feed + filterType + sortBy + artistSearch)
filterType       // 'all' | 'single' | 'album' | 'dw'
sortBy           // 'default' | 'date_asc' (plus ancien en haut) | 'artist'
artistSearch     // string — filtre texte sur artist_name
// ⚠ filterType / sortBy / artistSearch : tout changement déclenche un effet debouncé 150ms qui
//   re-query la DB via loadFeedFromDB (filtre+tri EN SQL) et remplace `feed` → les filtres et
//   les tris balaient TOUTE la base, même au-delà du cap des 1000 (pas seulement les 1000 en
//   mémoire). Retour aux défauts ('all'/'default'/'') → recharge le feed de base. Garde
//   `lastQueryRef` (clé JSON [search,filterType,sortBy]) : skippe le 1er run (défauts = init) et
//   les re-renders sans changement. Deps [artistSearch, filterType, sortBy, dbReady] → pas de
//   re-query à chaque artiste pendant la synchro

resumableSession // { artists_scanned, total_artists, last_artist_name, page_url, page_offset } | null

// Méthodes
startSync({ skipCount, resumeUrl, resumeOffset })  // tous les refus (déjà en cours / fenêtre 429 / quota jour) sont en tête, AVANT toute requête
resumeSync()                   // → startSync({ skipCount, resumeUrl: page_url, resumeOffset: page_offset }) — reprise par curseur
togglePause()                  // bascule syncState entre 'paused' et 'running' (no-op si 'idle')
purgeListened()                // DELETE listened=1 AND liked=0 — les likés sont conservés
resetQuota()                   // remet le quota 24h à 0 (saveQuota(0,0) + setDailyScrapings(0) + setQuotaUntil(0)) — débloque une synchro sans attendre l'expiration. Bouton dans VosEcoutesPanel
removeFromFeed(uri)            // useCallback([dbReady]) — marque le titre écouté (UPDATE listened=1 + listened_at + incrément stats) + retire du feed → apparaît dans l'Historique et compte dans les stats. Idempotent via listenedUrisRef. Plus de DELETE
setTrackLiked(uri, bool)       // useCallback([dbReady]) — UPDATE liked en DB + stats.total_liked ±1 + recharge likedTracks/listenStats + met à jour feed array
syncInitialLikes()             // vérifie /me/library/contains par batch de 40 URIs (max 300 tracks), sleep 400ms entre batchs, TTL 24h
navigateFeed(dir)              // useCallback([markListened]) — dir=-1 prev, +1 next — joue le titre adjacent dans filteredFeed (+ markListened du titre quitté en dir>0)
markListened(uri)              // useCallback([dbReady]) — marque un titre du feed écouté (UPDATE tracks/stats + saveDB + recharge stats/history + retrait animé), idempotent via listenedUrisRef. Appelé par le clic « Suivant » des 3 players → corrige le double-clic rapide où l'URI intermédiaire échappe au poll 5s
resetFilters()                 // remet filterType='all', sortBy='default', artistSearch=''
logout()
seek(positionMs)
setLoopEnabled(bool)
setDelayChoice(n)
```

### Compteur `dailyScrapings` + fenêtre 24h `quotaUntil`
- Persisté dans `localStorage` clé `spotifyplus_daily_scrapings` : `{ count: N, until: timestamp_ms }` (helpers `loadQuota()` / `saveQuota(count, until)`)
- `until` = fin de la fenêtre glissante de 24h, posée **uniquement quand `count` atteint 100** (`0` sinon). `loadQuota()` remet `count` à 0 dès que `until` est dépassé (fenêtre expirée → nouvelle session de 100 autorisée)
- Chargé au démarrage de l'app (dans l'init useEffect) → `setDailyScrapings(q.count)` + `setQuotaUntil(q.until)` si encore actif
- Incrémenté dans `startSync` **après la requête albums de chaque artiste** (un échec ne consomme pas le quota)
- **Plus de remise à zéro à minuit** : seul l'écoulement des 24h depuis le 100e artiste réinitialise le compteur
- Affiché dans la carte **Artistes** de `ScrapingStatusPanel` (`X/100 sur 24h`)
- Utilisé dans `NextCallPanel` pour **"Temps total de la session"** : `(100 - dailyScrapings) × délai moyen (delayChoice + 2s)` — temps restant pour finir les 100 artistes de la fenêtre, affiché uniquement pendant une synchro active

---

## MobilePlayer — player 50vh

- Remplace `MiniPlayer` sur mobile (affiché quand `now` est défini)
- **Like/unlike** : au changement d'URI, `isLiked` est initialisé depuis le local (`likedTracks` + `feed`). `GET /me/library/contains` n'est appelé **que si le titre est inconnu localement** (titre hors feed) — économise 1 requête par changement de titre dans le cas courant. Écritures via `librarySave`/`libraryRemove` + `libraryScopeAlert` sur 403.
- **Clic next** : seek à 25% de `duration_ms` après 400ms (laisse le temps à Spotify de démarrer)
- **SeekBar** : support touch complet (`onTouchStart` + `touchmove`/`touchend` sur `window`, `passive:false`) + `touchAction:'none'` pour bloquer le scroll pendant le drag
- **Bouton loop** : alterne entre boucle (icône accent + "1") et auto-avance (icône muted) — partagé avec `loopEnabled` du store, synchronisé avec le PlayerBar desktop
- **Hauteur** : `25vh` avec `minHeight:160px`
- Position dans le feed affichée (`currentIndex + 1 / filteredFeed.length`)

---

## Rate limit Spotify (guard module-level, persisté)

Variables `_rlUntil` (timestamp ms, **relu depuis localStorage `spotifyplus_blocked_until` au chargement du module**) et `_rlNotify` (callback React → `setBlockedUntil`).
`apiGet`, `apiPut`, `apiPost`, `apiDel` vérifient `_rlUntil` avant chaque appel et retournent `{ error:'rate_limited', rate_limited: true }` si bloqué (jamais `null` : les callers distinguent "bloqué" de "204 rien ne joue").
Sur 429 → `_rlSet(retryMs)` **persiste la fenêtre en localStorage** et bloque TOUS les appels jusqu'à expiration — y compris après un F5.
`_parseRetryAfterMs(raw, fallback)` blinde le parsing du header `Retry-After` contre `NaN`.

---

## Bugs connus / fixes appliqués

### apiGet — HTTP 204 No Content
`/me/player/currently-playing` retourne 204 quand rien ne joue (pas de body).
Sans le guard `if (res.status === 204) return null`, `.json()` lève une exception → catch silencieux → `setNow(null)` jamais appelé → `now?.uri` ne change pas → auto-avance ne se déclenche jamais.
**Toujours retourner `null` sur 204 dans `apiGet`** — et `{ rate_limited: true }` (pas `null`) quand le guard bloque, pour que le tick puisse distinguer les deux cas.

### FeedItem — clé React stable
`key={item.id}` (l'URI, unique) et **jamais** `key={item.id + i}` : avec l'index concaténé, retirer un titre changeait la clé de tous les suivants → remount complet de centaines de lignes, `React.memo` inopérant.

### Curseur de navigation optimiste — `_effUri` (clic suivant rapide)
Le poll player n'interroge Spotify que **toutes les 5s** → `now.uri` reste périmé jusqu'à 5s après un clic suivant/précédent. Sans correctif, un **2e clic « suivant » dans cette fenêtre** recalculait `currentIndex` sur l'ANCIEN titre (`now.uri` pas encore rafraîchi) et **relançait le même titre** (re-seek à 25%) au lieu de passer au titre d'après.
**Fix** : module-level `let _navUri/_navAt` ; `playTrack()` les pose à chaque lecture (tout passe par `playTrack` : players, `navigateFeed`, bouton play de FeedItem, auto-avance). `_effUri(pollUri)` renvoie `_navUri` tant que `Date.now() - _navAt < 6500ms` (poll 5s + marge), sinon `pollUri`. **Les 3 players (`MobilePlayer`, `PlayerBar`, `CompactPlayer`) ET `navigateFeed` calculent `currentIndex` via `_effUri(now?.uri)`** — un clic rapide repart donc bien du titre réellement lancé.

### PlayerBar — tableau cohérent
`currentIndex` est calculé sur `filteredFeed` → le label doit être lu dans `filteredFeed[currentIndex]`, pas `feed[currentIndex]` (mauvais titre affiché dès qu'un filtre/tri est actif).

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
