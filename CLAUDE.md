# ⚠️ RÈGLES ABSOLUES

- **Git** : committer et pousser directement sur `main` (pas de branche), sauf demande contraire. **Un commit distinct par demande.**
- **Docs** : après toute modif fonctionnelle, mettre à jour `CLAUDE.md` (technique) et `README.md` (utilisateur) dans le même commit. **Les garder COURTS** : décrire l'état actuel et les pièges, jamais l'historique des correctifs (il est dans git).
- **Éditer le dépôt principal**, jamais un worktree temporaire (`.claude/worktrees/*`).
- **⚠ Pas de build tool** : toute l'app est UN seul `<script type="text/babel">` compilé au runtime. La moindre erreur de syntaxe fait échouer la compilation entière → `#root` vide → **écran tout noir**, sans message. **Après toute modif d'`index.html`, vérifier que la page monte avant de commit.**
- `APP_VERSION` (constante module-level, actuellement `'9.2.1'`) : **à incrémenter à la main à chaque commit**. Format `MAJ.MIN.U` dérivé du nombre de commits **du projet** (~711) : `patch = N%10`, `minor = floor(N/10)%10`, `major = floor(N/100)`.

---

# Spotify+ · Hub de Pierre

## Vue d'ensemble

PWA **sans backend**, hébergée statiquement sur GitHub Pages. Toutes les données sont locales (sql.js SQLite WASM + IndexedDB). Chaque artiste suivi est scrappé depuis **sa propre** `last_scraped_at` (défaut `2026-03-15`). L'utilisateur parcourt son feed, écoute titre par titre ; en fin de titre → marqué écouté + auto-avance + disparition animée. Aucun ajout auto en playlist.

C'est un **hub perso multi-modules**. Ordre unique (desktop + mobile, onglets/menu/accueil) : Actu, Alertes, API, Bon Plan, Collection, Emploi, Finance, Frigo, Histoire, Jeux, Maps, Météo, Mot de Passe, Musique, Note, Revente, Santé, Sport, To Do, TV Time, Vêtement, Stats, À propos.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | **App complète** (React 18 CDN + Babel + sql.js), ~35 000 lignes, tout en un fichier |
| `manifest.json` | Config PWA |
| `service-worker.js` | Cache app shell + vendor. **Network-first** pour l'app shell (`fetch {cache:'no-store'}` pour bypasser le `max-age=600` de GitHub Pages), ne cache que `res.ok`, clé normalisée `./index.html`. **Bumper la version du cache après changement.** |
| `vendor/sql-wasm.js` / `.wasm` | sql.js 1.10.2 auto-hébergé |
| `vendor/leaflet.js` / `.css` | Leaflet 1.9.4, chargé **lazy** (`loadLeaflet()`) |
| `vendor/motus-words.js` / `motus-dico.js` | Données du jeu Motus (~1,1 Mo), **lazy** (`loadMotusData()`), IIFE → `window.MOTUS_WORDS` / `MOTUS_DICO` |
| `data/actu.json` | Sources Actu pré-fetchées par GitHub Action (`update-actu.yml`, cron 2 h) via `scripts/fetch_actu.py`. Lu same-origin ; > 24 h → repli fetchers client (proxies CORS) |
| `data/indices.json` | Indices boursiers via `scripts/fetch_indices.py` (Stooq→Yahoo) + `update-indices.yml` |

## Stack & sécurité

- **React 18.3.1 + Babel standalone 7.29.7** via unpkg — **versions épinglées + SRI sha384 + crossorigin**. Ne jamais changer une version sans recalculer le hash.
- **sql.js 1.10.2 auto-hébergé** : `initSqlJs({ locateFile: f => './vendor/' + f })`.
- **⚠ CSP** (`<meta>` dans `<head>`) — le meta tag est la **source de vérité**, y lire les listes à jour :
  - `script-src` : `'self'` + unpkg (SRI) + `accounts.google.com` (GIS, script non versionné donc **sans SRI**). `'unsafe-inline'`/`'unsafe-eval'` requis par Babel, `'wasm-unsafe-eval'` par sql.js.
  - `connect-src` : `'self'` + les ~50 origines réellement utilisées (miroir d'`API_LIST`).
  - `img-src` : `https:` + `data:` + **`blob:`** (photos Drive téléchargées avec un Bearer → `createObjectURL`).
  - `media-src` : `'self' data: blob:` (notes vocales).
  - `frame-src` : `'self'` + accounts.google.com + les cartes en iframe + `www.youtube-nocookie.com`.
  - **⚠ Toute nouvelle origine (fetch / script / image / iframe) DOIT y être ajoutée, sinon le navigateur la bloque.**
- **IndexedDB** : binaire SQLite (clé `spotifyplus_db`), connexion unique cachée (`_idbPromise`). `navigator.storage.persist()` au login. Base séparée `spotifyplus_note_media` pour les pièces jointes des notes.
- **`lsSet(key, value)`** : écriture localStorage centralisée (warn + alerte 1×/session sur quota plein). **Écrit la valeur TELLE QUELLE** → toujours `JSON.stringify` soi-même.
- **Garde multi-onglets** : `BroadcastChannel('spotifyplus_tabs')` → bandeau `otherTab` (chaque `saveDB()` exporte toute la DB).

## Auth Spotify

```js
CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES = 'user-follow-read user-read-private user-read-currently-playing user-read-playback-state ' +
         'user-modify-playback-state user-library-read user-library-modify ' +
         'playlist-read-private playlist-read-collaborative'
```

- **OAuth 2.0 PKCE 100 % client**, token en localStorage, `state` anti-CSRF (`pkce_state`).
- `refreshToken()` protégé par mutex (`_refreshPromise`) : refresh tokens Spotify à usage unique + rotation. Session héritée sans refresh token ou `invalid_grant` → `logoutClear()` + reload.
- `apiGet` / `apiPut` / `apiDel` : retry 1× après refresh sur 401 · `null` sur 204 · **throw sur 429** · `{rate_limited:true}` quand la fenêtre 429 bloque. **`apiPut` garde le corps d'un 403** (`{error:'forbidden', status, message, reason}`) : Spotify y met la vraie raison.
- **Scopes accordés mémorisés** (`spotify_scopes`, posé par `exchangeCode` et `refreshToken`) → `spotifyHasScope(s)`. ⚠ Renvoie **`null` = INCONNU** pour un jeton antérieur : traiter `!== true` comme « probablement absent », jamais `=== false`. Un jeton existant **ne gagne pas** un scope au refresh — seule une reconnexion l'accorde.
- **Diagnostic de connexion** : toute cause d'échec du retour OAuth est posée via `authErrSet` / relue par `authErrTake` (**sessionStorage** — `refreshToken()` recharge la page, le message doit survivre au reload), remontée dans `authError` et affichée en bandeau rouge. Cas couverts : consentement refusé, `state` non concordant, `pkce_verifier` disparu, échec réseau du POST `/api/token`, erreur du token endpoint, quota localStorage, `/me` refusé (**403 = compte absent de *User Management* du Dashboard**, cause n°1).
- **Mode hors ligne** : un `/me` raté ne jette **plus** la session. `offlineReady` → bouton « 📴 Continuer hors ligne » → `enterOffline()` = `setUser(meCacheLoad())` + `offline = true` + `bootLocal()`. Profil mis en cache dans `spotifyplus_me` (volontairement hors backup, re-fetchable). ⚠ **Il n'existe aucune 2e méthode d'authentification** : Client Credentials exige un `client_secret` (dépôt public) et ne donne aucun contexte utilisateur.
- **`bootLocal()`** = toute l'init NON-Spotify (persistance, `syncRemembersToTodos`, `notifyDueReminders`, `tvSyncDaily`, `initDB`, reset mois/année, feed, stats, reprise de synchro, quota, fenêtre 429, `setDbReady`). Appelée par le chemin normal **et** par l'entrée hors ligne. Deps `[]` valides : elle ne référence que des setters et des refs.

---

## Base locale (4 tables)

```sql
tracks (id PK, spotify_uri UNIQUE, artist_name, title, release_title, release_type,
        release_date, cover_url, duration_ms, listened DEFAULT 0, liked DEFAULT 0,
        listened_at, added_at DEFAULT datetime('now'))

artists_scraped (spotify_id PK, last_scraped_at, name, image_url, popularity, followers,
        genres /*JSON*/, spotify_url, last_release_count DEFAULT 0, total_tracks_added DEFAULT 0,
        last_scan_status /*ok|partial|error*/, scan_count DEFAULT 0)

stats (id=1 CHECK, total_listened, listened_this_month, listened_this_year,
        last_reset_month /*YYYY-MM*/, last_reset_year, total_listened_ms, total_liked)

purged_uris (spotify_uri PK)  -- jamais réinsérés par un re-scan
```

Migrations idempotentes dans `initDB()` (ALTER TABLE en try/catch).

**Fonctions module-level** : `initDB()` · `saveDB()` (export→IndexedDB, **sérialisé** via `_savePromise`/`_saveQueued`, **pas de debounce**) · `dbRun`/`dbAll`/`dbGet` · `loadListenStatsFromDB()` · `loadLikedTracksFromDB()` · `loadHistoryFromDB()` (listened=1, max 200) · `loadArtistsFromDB()` · `mapFeedRow(t)` · `loadFeedFromDB({artistSearch, filterType, sortBy, genreFilter})` (**filtre + tri EN SQL** puis LIMIT 1000 → balaie toute la base).

Item feed : `{ id, spotifyUri, label, artist, title, subtitle, date, rawDate, image, isNew, liked, duration_ms }`.

`saveDB()` après : chaque artiste scrapé, chaque écoute, chaque purge, `endSync`, `visibilitychange→hidden`. Toujours `INSERT OR IGNORE` pour `tracks` ; **UPSERT `ON CONFLICT(spotify_id) DO UPDATE`** pour `artists_scraped` (jamais `INSERT OR REPLACE`).

**Likes — migration API fév. 2026** : `/me/tracks/contains` et `PUT/DELETE /me/tracks` **supprimés**. Remplaçants : `libraryContains(uris)` → `GET /me/library/contains?uris=` (max 40) · `librarySave`/`libraryRemove` → `PUT/DELETE /me/library?uris=` (**URIs en query string même pour PUT**, pas de body) · `libraryScopeAlert(result)` sur 403. `syncInitialLikes()` : jusqu'à 300 tracks par batch de 40, TTL 24 h.

---

## Scraping (`startSync`)

**État unifié `syncState`** : `'idle' | 'running' | 'paused' | 'rl_waiting'`. `setSync(st)` pose synchroniquement `syncStateRef.current` puis le state ; `scraping`/`paused`/`rlWaiting` sont **dérivés**.

**Refus de démarrage** (avant toute requête) : `syncStateRef.current !== 'idle'` · `Date.now() < _rlUntil` · quota 24 h atteint.

**Arrêts** — `endSync(reason)` : reset + `saveDB()` final. `'completed'` nettoie `spotifyplus_sync_progress` ; les autres raisons laissent le bouton « ↩ Reprendre ». **`checkpoint()`** est attendu avant **chaque** appel (via `apiGetSafe`) : une seule boucle d'attente pour la pause manuelle **et** la fenêtre 429 (elle pose `rl_waiting` + countdown). Aucune requête pendant une pause.

**Rate-limit** : sur le **1er 429**, `_rlSet(max(Retry-After, 15 min))` (fenêtre persistée `spotifyplus_blocked_until`, relue au chargement du module → survit au F5 et s'applique à **tous** les appels, player compris) puis throw → `endSync('error')`. Boot pendant la fenêtre : `/me` → `rate_limited` → mode connecté dégradé (`user = null`) au lieu d'éjecter.

**Boucle artiste** :
- `cutoff = (scrapedDates[id] || '2026-03-15').slice(0,10)`
- `/artists/{id}/albums?include_groups=album,single&limit=10&market=FR` — **⚠ `limit` max = 10** depuis fév. 2026 (`limit=20` → 400).
- Filtre par `releaseInRange` (gère la précision year/month/day)
- Chaque album → `/albums/{id}/tracks?limit=50`
- Dédoublonnage via `seenUris` + `knownUrisRef` + `purged_uris` : album skippé seulement si `uris.every` connu
- **Écriture « légère »** dès la liste d'albums lue (`last_scan_status='partial'`, `last_scraped_at=cutoff` jamais avancée) → l'artiste apparaît même si un 429 coupe. **UPSERT final** après artiste terminé : avance `last_scraped_at`, `status='ok'`, cumule les compteurs. Liste inaccessible → `status='error'`, date non avancée.
- Progression dans `spotifyplus_sync_progress` après chaque artiste ; `resumeSync()` repart directement sur la bonne page.

**Quota 100 artistes / fenêtre glissante 24 h** : `spotifyplus_daily_scrapings` = `{count, until, last}`, helpers `loadQuota`/`saveQuota`/`ensureQuotaWindow` (auto-réparant). `dailyCount` incrémenté **APRÈS** la requête albums (un throw ne brûle plus le quota).

**Scrapping automatique** : `musicAutoTry()` (store) part 4 s après le boot puis se re-teste toutes les 10 min. `musicAutoDue()` est **100 % local, aucune requête** (option activée, journée pas faite, hors fenêtre 429, quota < max). ⚠ La journée n'est marquée **que** par `endSync('completed')` — le quota se libérant par fenêtre glissante, la suite peut repartir le même jour. Coupé si `offline` ou `otherTab`. Préférence `MUSIC_AUTO_LS` (**absent = activé, seule la valeur `'off'` désactive**).

**Découvertes de la semaine** : **aucun import automatique**. `DW_FIXED_URL` = le lien fixe de LA playlist de l'utilisateur, source de l'import et cible du bouton. Deux chemins seulement : le **bouton violet** `dwManualAccess` (`{force:true}`, ignore les cooldowns) et la **capture par la lecture** (`dwCaptureFromContext`, lit la file déjà interrogée par le poll player quand le nom du contexte matche `DW_NAME_RE` — aucune requête dédiée). ⚠ Spotify refuse souvent le CONTENU d'une playlist éditoriale (403) : la capture par la lecture est le vrai filet.

---

## Écoute / auto-avance

**Marquage** : quand `now?.uri` change (URI précédente dans le feed & `dbReady`) → `UPDATE tracks listened=1` + `UPDATE stats` + `saveDB` + `recordListen()` + animation 600 ms. `listenedUrisRef` anti-doublon. Écritures DB **hors** de l'updater `setFeed` (item lu via `feedRef.current`).

**Clic « Suivant »** : les players capturent l'URI quittée AVANT de jouer la suivante, puis `markListened(leaving)` (idempotent) — corrige le double-clic rapide qui échappe au poll 5 s. `navigateFeed` mémorise la dernière position connue (`currentFeedIdxRef`) et y retombe quand les filtres excluent le titre en cours. ⚠ `markListened` n'utilise **que** la position réelle, jamais le repli.

**3 mécanismes d'auto-avance** (triple couverture, `advancedForRef` anti-doublon, `prevNowRef` = tick précédent) :
1. Effet `now?.uri` : URI null/hors feed **et** titre quitté proche de la fin (`nearEnd`, garde anti-vol de lecture)
2. Effet `now?.current` : `remaining ≤ 3 s` & titre dans le feed
3. Effet `now?.playing` : transition `true→false` & `remaining ≤ 8 s` — **cas principal** (fin naturelle)

⚠ Placée AVANT le `return` sur `listenedUrisRef`. ⚠ Limitation Spotify : la fin d'un titre est un `200 + is_playing:false` sur la **même URI** → ni l'effet 1 ni l'effet 2 ne se déclenchent, d'où l'effet 3.

**Poll player** : tick 5 s, bail-out si `now` inchangé, aucun appel onglet caché (tick de rattrapage au retour), fenêtre 429 → garde l'état affiché.

**Curseur optimiste `_effUri`** : `_navUri`/`_navAt` posés par `playTrack()` ; `_effUri(pollUri)` renvoie `_navUri` tant que `< 6500 ms` (le poll est périmé jusqu'à 5 s).

**`playTrack`** : `PUT /me/player/play` **sans `device_id`** n'aboutit que s'il existe un appareil *actif au sens de Spotify* (un Spotify ouvert mais en pause ne l'est plus). Sur **404 ou 403** → `GET /me/player/devices` puis rejeu sur `?device_id=`. `spotifyPickDevice` **écarte les `is_restricted`** (ils refusent toute commande de l'API Web) et préfère l'actif. ⚠ `spotifyDevices` est en try/catch (`apiGet` throw sur 429 — sinon l'auto-avance casserait). Messages via `playForbiddenMsg(res)` (cite Spotify mot pour mot ; `Insufficient client scope` → reconnexion). ⚠ **Throttle `_playAlert` 30 s** : `playTrack` est appelée sans geste utilisateur par l'auto-avance.

## Stats / purge

`stats` : `total_listened`, `listened_this_month/year`, `total_listened_ms`, `total_liked` (likes posés **dans l'app**, jamais par `syncInitialLikes`). Reset mois/année au démarrage via `last_reset_*` (mois **LOCAL**).

**`purgeListened`** : URIs → `purged_uris` (INSERT OR IGNORE) puis `DELETE FROM tracks WHERE listened=1`. `stats` non touchée. Le journal `spotifyplus_listens` survit à la purge.

**`removeFromFeed`** (croix × / swipe gauche) : traite le titre **comme écouté** (pas de DELETE) → apparaît dans l'Historique. Idempotent, **Undo** 5 s (`undoToast` → `undoRemove()` remet `listened=0`, re-décrémente si `counted`, `unrecordListen()`, réinsère à sa position).

## Store (`StoreProvider`)

**État** : `authState` · `user` · `offline` · `otherTab` · `dbReady` · `syncState` (+ dérivés) · `blockedUntil` · `feed` · `logs` · `now` · `stats` · `listenStats` · `likedTracks` · `history` · `artists` · `loopEnabled` · `moduleToggles` · `homeModules` · `delayChoice` · `dailyScrapings` · `quotaUntil` · `filteredFeed` (+ `filteredFeedIndex` Map URI→index) · `filterType` · `sortBy` (défaut `'artist'`) · `artistSearch` · `genreFilter` · `resumableSession` · `authError`.

**Méthodes** : `startSync({skipCount, resumeUrl, resumeOffset})` · `resumeSync()` · `togglePause()` · `purgeListened()` · `restoreBackup(data)` · `resetQuota()` · `removeFromFeed(uri)` · `setTrackLiked(uri, bool)` · `syncInitialLikes()` · `navigateFeed(dir)` · `markListened(uri)` · `reloadFeed()` · `resetFilters()` · `logout()` · `enterOffline()` · `seek(ms)` · `setLoopEnabled` · `setModuleEnabled(id, bool)` · `setModuleOnHome(id, bool)` · `setDelayChoice(n)`.

⚠ Changement de `filterType`/`sortBy`/`artistSearch`/`genreFilter` → effet debouncé 150 ms qui re-query `loadFeedFromDB` ; `lastQueryRef` skippe le 1er run et les re-renders sans changement.

**Paramétrage des modules** : `TOGGLE_MODULES` = `{id, label, icon, color, desktop, mobile}` ; `moduleEnabled(toggles, id)` et `moduleOnHome(toggles, id)` = **absent ⇒ activé/affiché, seul `false` désactive**. Stockage `spotifyplus_modules` / `spotifyplus_home_modules`, UI dans « ⚙️ PARAMÉTRAGE » (À propos), bouton 🏠 par module. Onglet actif désactivé → retour à `home`.

**Optimisations** : feed batché par artiste (1 seul `setFeed`), refresh Artistes throttlé 1,5 s, horloge partagée `useSharedTick`/`_clock` (un seul `setInterval` pour tous les countdowns). **Interdits** : précompiler le JSX (casse le mono-fichier), debouncer `saveDB` (perte de données mobile).

---

## Sauvegarde / restauration

**`buildBackup()`** (synchrone) → `{ stats, artists, music, todos, todos_done, rappels, rappels_time, remembers, tvtime, tmdb_key, yt_key, maps, finance, food, bonplan, mdp_vault, notes, notes_enc_check, modules, home_modules, listens, frigo, vetement, histoire, emploi, sport, revente, collection, gemini_key, groq_key, cerebras_key, openrouter_key, mistral_key, cohere_key, zai_key, cloudflare_key/account, gcse_key, gcse_cx, github_token, chess_user, speedrun_user, lol, games, api_calls, prefs }`.
**`buildBackupFull()`** = `buildBackup()` + `note_media` (IndexedDB, donc **asynchrone** — utilisée par le téléchargement et les 3 destinations cloud).

**Règles de fusion** (`restoreBackup`, complet ou partiel, clés absentes ignorées) :
- **⚠ Cumuls et compteurs : au MAX, JAMAIS en somme** (artistes, `games.hi`, `api_calls`) — une sauvegarde contient déjà l'historique local, additionner **doublerait** à chaque ré-import.
- Union / le plus avancé : tvtime, listens (cap 5000), notes (`updatedAt` le plus récent), finance, food (jours : le local gagne), collection / revente / note_media (par id, **le local gagne**).
- Remplacés : todos, rappels, remembers, maps, modules, home_modules, prefs, mdp_vault (backup dans `spotifyplus_mdp_vault_prev`), clés/pseudos si non vides.
- Dates d'artistes **jamais régressées** ; `music` : `listened`/`liked` au MAX.
- `food.weights` fusionné par `weightMerge` (doublons jour+poids ignorés).

**⚠ Volontairement EXCLUS** : tous les caches re-fetchables (actu, indices, cours, Steam, LoL, chess, speedrun, github, yt_subs, delta playlist, displate, clés de jour des synchros auto) et **toutes les images** (photos Vêtement/Revente/Collection, images TierList, composition des repas). Les data URLs saturent le quota localStorage (~5 Mo partagé par tout le Hub).

**Export partiel** : `EXPORT_SECTIONS` → `downloadBackup(sec)` (`spotifyplus-<key>-<date>.json`).

**3 destinations** (UI partagée `DropboxSync`/`GoogleDriveSync`/`PCloudSync`, prop `mode='save'|'restore'`) :
- **Dropbox** : OAuth PKCE offline.
- **Google Drive** : **Google Identity Services, modèle « token »** (le flux implicite par redirection a été coupé par Google → « Erreur 400 : invalid_request »). `loadGis()` charge lazy `accounts.google.com/gsi/client` (**non versionné ⇒ pas de SRI**), **préchargé au boot** pour que `requestAccessToken()` parte SYNCHRONE d'un clic (sinon popup bloquée). Scopes séparés : `GDRIVE_SCOPE_BASE` (`drive.file`) + `GDRIVE_SCOPE_READ` (`drive.readonly`, restreint, seulement Finance → Mes Actifs) ; **le scope YouTube a son propre consentement et son propre jeton** (`ytg_*`). ⚠ **`include_granted_scopes: false` obligatoire** dans `initTokenClient` : à `true` (le défaut) Google recolle tous les scopes déjà accordés au `client_id` et recrée la combinaison interdite `youtube` + `drive.file` → erreur 400 après le choix du compte. ⚠ **Aucun repli par redirection** (il éjectait l'utilisateur vers la page d'erreur Google) ; échec → `gdriveLoginFailed` / `ytgLoginFailed`. ⚠ **La PWA installée casse** : Google renvoie le jeton vers un `storagerelay://` que le Custom Tab ne résout pas → se connecter **une fois depuis un onglet Chrome normal** (même origine ⇒ même localStorage).
- **pCloud** : OAuth **implicite** (le flux `code` exige un client_secret). Client ID via `PCLOUD_CLIENT_ID_CONST` ou localStorage (éditable dans le module API et inline). ⚠ **2 régions** (`api.pcloud.com` / `eapi.pcloud.com`) mémorisées dans `pcloud_host` — interroger la mauvaise donne « invalid access token ». ⚠ **L'API répond TOUJOURS en HTTP 200** avec un champ `result` ≠ 0 → `pcloudApi()` teste `result`, pas `res.ok`. Téléchargement via un hôte de contenu éphémère `c###.pcloud.com` (joker CSP).

**Photos → Google Drive** (`HUB_Pierre/<Module>`) : un fichier par fiche **nommé avec son id** → le lien fiche ↔ photo est porté par le NOM, rien en local, le Drive fait autorité. Helpers génériques `gdriveEnsureFolder` / `gdriveHubSubfolder` / `gdriveListFolder` / `gdriveUploadMedia` / `gdriveDeleteFile` / `gdriveBlobUrl`. Affichage : un fichier privé n'a pas d'URL affichable → téléchargement avec le Bearer + `createObjectURL` (**d'où `blob:` dans `img-src`**).

---

## Modules

| Module | Composant / couleur | Stockage | Notes |
|---|---|---|---|
| **Musique** | `MusiquePanel`, violet | (base SQLite) | 6 collapses, tous `defaultOpen={false}` : ⚙ Scrapping · ⏳ En attente · ❤ Likés · 🕘 Historique · 🎤 Artistes suivis · 🔀 Delta Playlist |
| **Actu** | `ActuPanel`, bleu-indigo | caches 30 min | Collapses en ordre alphabétique. Sous-sections : Actualité (9), Cartographie (iframes `MapFrame`), Fuites de données, Vidéos YouTube (OAuth séparé). Priorité `data/actu.json`, repli proxies CORS |
| **Alertes** | `RappelPanel`, `#6f7bf5` | `spotifyplus_rappels`, `_rappels_time`, `_remember_custom` | Rubriques fixes + rappels persos + sections auto (Frigo, Steam). `RAPPEL_RECUR` = récurrences en mois ; `rappelNextDate` calcule la prochaine occurrence (la date stockée reste celle d'origine). Calendrier mensuel 🗓 |
| **API** | `APIPanel`, `#6a78f2` | `spotifyplus_api_export`, `_api_calls` | Liste locale de toutes les API (`API_LIST`, miroir de `connect-src`), éditeur de clés inline (`API_KEY_LS`, valeur = chaîne **ou tableau** pour 2 champs), ligne rouge si clé manquante, export JSON |
| **Bon Plan** | `ComparePanel`, bleu-indigo | `spotifyplus_cmp_watch` | Ma liste · Promos (CheapShark) · Bibliothèque Steam · Recherche jeux · Tous produits (IA + recherche web) |
| **Collection** | `CollectionPanel`, `#5a95e6` | `spotifyplus_collection` | 5 catégories en collapses. Moteur commun `CollectionSub` : bannière → collection → recherche → ajout manuel → photo. `collAdd` incrémente `qty` sur id existant ; `img` = **URL distante, jamais une image encodée** |
| **Emploi** | `EmploiPanel`, `#57a0e0` | `spotifyplus_emploi` | Salaire vs secteur + offres (The Muse + Remotive) |
| **Finance** | `FinancePanel`, cyan | `spotifyplus_finance_history` | État partagé module-level `_finance` (survit au démontage). 5 modes : Light / Full / Calculatrice / BullRun / Mes Actifs. Chargement **lazy par mode**. Relevé quotidien auto (`finAutoDue`), qui n'échantillonne que le mode Light |
| **Frigo** | `FrigoPanel`, `#47a8de` | `spotifyplus_frigo` | 3 compartiments + péremption + assistant IA (photo → ingrédients, recettes) |
| **Histoire** | `HistoirePanel`, `#41b0d8` | `spotifyplus_histoire` | Ville + photos → fiche d'œuvre par IA (recherche web ancrée) + illustrations Google Custom Search |
| **Jeux** | `JeuxPanel`, `#39b2d1` | `spotifyplus_game_hi_*`, `tierlist-v1` | 27 mini-jeux 100 % locaux, menu déroulant maison groupé par nombre de joueurs. `useImmersiveLock(true)` sur le module |
| **Maps** | `MapsPanel`, jaune | `spotifyplus_maps` | Import Google Timeline (2 formats), carte Leaflet lazy. ⚠ L'app ne trace jamais la position |
| **Météo** | `MeteoPanel`, bleu | — | Open-Meteo sans clé, 5 lieux (dont position actuelle), Light 3 j / Full 7 j |
| **Mot de Passe** | `GestionMdpPanel`, ambre | `spotifyplus_mdp_vault` | AES-GCM 256 + PBKDF2 600k. Le blob chiffré contient `{entries, tags}` → suivi automatiquement par les sauvegardes. Verrouillage auto 10 min. ⚠ Mot de passe oublié = irrécupérable |
| **Note** | `NotePanel`, `#6fd345` | `spotifyplus_notes`, `_notes_enc_check`, IndexedDB `spotifyplus_note_media` | 2 espaces (clair / crypté au mot de passe **global**). Sauvegarde auto 700 ms. Pièces jointes audio/photo : la note ne porte que les ids, les contenus vivent en IndexedDB (chiffrés dans l'espace privé) |
| **Revente** | `ReventePanel`, `#86d941` | `spotifyplus_revente` | Rédaction d'annonces Vinted/Leboncoin/eBay par IA. ⚠ La publication automatique est **impossible sans backend** (aucune API publique de dépôt) |
| **Santé** (id `food`) | `NourriturePanel`, `#9bd93f` | `_food_profile`, `_food_days`, `_food_meals` (local seul), `_food_weights` | Calories (Open Food Facts + IA + photo de plat), macros, journal de pesées |
| **Sport** | `SportPanel`, `#c3d93f` | `spotifyplus_sport` | 9 groupes musculaires × 70 exercices illustrés (images Wikimedia Commons), appui long → fiche animée |
| **To do** | `TodoPanel`, vert | `spotifyplus_todos`, `_todos_done` | 7 rubriques en carrousel. Dans `daily` et `cecile` le × **valide** au lieu de supprimer ; appui long 3 s dans `daily` = supprimer la récurrence |
| **TV Time** | `TvTimePanel`, ambre | `spotifyplus_tvtime`, `_tvtime_eps` | Séries/films (TMDB), chaînes YouTube, livres (Google Books + Open Library). Source de vérité = `tvWatchedSet`. Lecteur plein écran `YtFullscreenPlayer`. Synchro quotidienne `tvSyncDaily` reprenable |
| **Vêtement** | `VetementPanel`, `#f59a2e` | `spotifyplus_vetements` | 35 types en sous-catégories, fiches + marques. **Photos sur Google Drive**, jamais en local. Barre de filtres + recherche par image (IA) |
| **Stats** | `StatsPanel` | (lecture seule) | Collapses imbriqués : API · Musiques · To do · Films · Maps · Santé · Remembers · Jeux · GitHub |
| **À propos** | `VosEcoutesPanel` | — | Paramétrage · Lancement automatique · Exporter · Sauvegardes cloud · Restaurer · Réinit quota · Purger · Déconnecter |

**Layout** : `WebApp` (desktop, onglets en haut) · `MobileApp` (barre haut : profil + menu ⋯) · `CompactPlayer` (viewport court) · `HubHome` (accueil, grille dérivée de `TOGGLE_MODULES`, ordre alphabétique) · `Home` (login).

**IA** : **8 fournisseurs en chaîne de replis**, façade unique `geminiGenerate(parts, opts)` — **aucun sélecteur dans l'UI**. Ordre : `gemini → groq → openrouter → mistral → cerebras → zai → cohere → cloudflare`. `AI_PROVIDERS` porte `vision` (4 seulement) et `ls2`/`url` fonction (Cloudflare = 2 champs). ⚠ Une requête avec image **saute** les fournisseurs sans vision (sinon réponse inventée). ⚠ `opts.tools` (recherche web ancrée) **n'existe que chez Gemini** → sinon `NO_GROUNDING` (≠ `NO_KEY`, que les appelants testent pour abandonner) et l'appelant rejoue sans outil. `aiAnyKey(needVision)` garde l'UI, `aiLastProvider()` nomme celui qui a servi.

---

## ⚠ Pièges (les relire avant de coder)

**Compilation / React**
1. **Écran noir = erreur Babel.** Aucun message, aucun filet. Toujours vérifier que la page monte avant de commit.
2. **Babel hoisting** : tout hook avec tableau de deps (et tout `useMemo`) doit être déclaré **APRÈS** les variables qu'il liste, sinon deps `[undefined]` figées. Une `const` module-level lue plus haut = **TDZ = écran noir**. Contourner par une ref (`reloadFeedRef`, `startSyncRef`, `goRef`).
3. **Ne pas mélanger raccourci et propriété longue CSS** (`border` + `borderColor`) : React **supprime** la longue au re-render.
4. **Clé de liste = l'URI/l'id**, jamais `id + index` (remount + `React.memo` inopérant).
5. **`StatsCollapse` démonte ses enfants à la fermeture** : rien n'est monté ni requêté tant qu'il est replié — mais tout état à préserver doit vivre **module-level** (pattern `_finance` / `_delta` / `_coll` / `_tvSync` : objet + `subs:Set` + publieur).
6. **Refs anti-closure** obligatoires dans les boucles `rAF`/`setInterval` et les écouteurs posés par élément (sinon index/filtres figés).
7. **Un nouvel onglet mobile DOIT avoir son bloc de rendu dans `MobileApp`** (sinon page noire), en plus de l'entrée dans `allOverflowTabs` — et les anciennes valeurs de `spotifyplus_active_tab`/`_view` doivent être remappées.
8. `selfHeading:true` dans `SECTION` **et** heading retiré de `MobileApp`, sinon le titre s'affiche en double.
9. **`position:fixed` est piégé par tout ancêtre `transform`** → `ReactDOM.createPortal(document.body)`.
10. **`useImmersiveLock(active)`** sur tout overlay plein écran : sans lui, une rotation fait chuter `innerHeight`, `Shell` remplace `MobileApp` par `CompactPlayer` et **démonte l'overlay**. `MOBILE_LOCK_TABS` = les onglets qui héritent du mode compact (aujourd'hui `musique` seul).
11. **Appui long** : ref `{timer, fired}`, `fired` neutralise le `click` qui suit le relâchement ; bloquer `onContextMenu` + `userSelect`/`WebkitTouchCallout` sur mobile.
12. **Un swipe et un défilement se terminent par un `click` synthétique** → garde `moved` (8 px sur l'un ou l'autre axe) avant d'agir.
13. **Une iframe cross-origin avale tous les événements** : pour capter un geste par-dessus, poser une couche de capture transparente (et lui laisser une réserve pour les contrôles natifs). Aucun moyen de relayer un clic dedans.

**Données / stockage**
14. **`lsSet` écrit la valeur telle quelle** → un objet devient `"[object Object]"`. Toujours `JSON.stringify` soi-même, et **lire le booléen de retour** (quota plein = rien n'a été écrit : ne pas afficher un ajout fantôme).
15. **Ne jamais stocker d'images** (data URL) en localStorage ni dans le backup : quota ~5 Mo partagé par tout le Hub. Photos → Drive, médias lourds → IndexedDB dédiée.
16. **Clé de jour toujours LOCALE** (`getFullYear/getMonth/getDate`), jamais `toISOString()` (UTC → bascule vers 01-02 h en France, donc un jour de décalage).
17. **Fusion des sauvegardes : au MAX ou en union, jamais en somme.**
18. **`_db.run(sql, params)`** = tableau **positionnel** pour les `?`, jamais un objet.
19. `releaseInRange` : `release_date` peut être `YYYY`, `YYYY-MM` ou `YYYY-MM-DD` → traiter comme une **période**, `new Date("2026")` donne le 1er janvier.
20. **Une base séparée plutôt qu'un store de plus** dans IndexedDB : ajouter un store impose un changement de version, qu'un onglet resté ouvert bloque (`blocked`).

**Réseau / API**
21. **Spotify albums : `limit` max = 10** (`limit=20` → 400).
22. **Migration Spotify fév. 2026** : les entrées de playlist ont été renommées **`track` → `item`** — mais **`/me/tracks` utilise toujours `track`**. Résolveur partagé `it.item || it.track || it`.
23. **Un endpoint qui répond `items: []` n'est pas une preuve de vide** : essayer toute la cascade (`/items` puis `/tracks`) et garder la première réponse **non vide**.
24. **Le statut HTTP ne suffit pas à diagnostiquer** : « commentaires désactivés » et « quota épuisé » sont tous deux des 403 → lire `error.errors[0].reason`.
25. **`fetch('blob:…')` et `fetch('data:…')` sont bloqués par `connect-src`** (qui ne liste que des origines https) → décoder à la main ou passer par `<img>` + canvas.
26. **`FileReader.readAsDataURL` et non `URL.createObjectURL`** pour une image qui sera affichée : `img-src` autorise `data:` mais un blob URL non déclaré est bloqué.
27. **Les sites institutionnels refusent souvent l'`<iframe>`** (X-Frame-Options / frame-ancestors) : prévoir la `note` + le bouton « ↗ Nouvel onglet » de `MapFrame`, et tester dans un vrai navigateur.
28. **`AbortController` sur tout fetch tiers** (les proxies CORS et les pages lourdes bloquent sinon indéfiniment).

**Sécurité**
29. **`dangerouslySetInnerHTML` proscrit** → `DOMParser` pour extraire du texte d'un HTML tiers.
30. **`safeHref` avant tout `<a href>`** (la CSP autorise `unsafe-inline`, donc un `javascript:` s'exécuterait) — y compris sur une URL proposée par une IA.
31. **Service worker** : ne cacher que `res.ok` (sinon un 404 écrase l'app), app shell en **network-first** avec `{cache:'no-store'}`. Ne jamais revenir en cache-first pour l'app shell.

**Environnement d'agent**
32. **Le proxy réseau bloque de nombreux hôtes** (Google News, LinkedIn, Steam, CoinGecko, docs.google.com, YouTube, instagram…) → écrire un parsing défensif et **dire explicitement « non vérifiable côté agent »** plutôt que d'affirmer.
33. **unpkg est bloqué** : pour tester la page complète dans Chromium, servir React/Babel en local et bloquer le service worker (`serviceWorkers:'block'`), sinon il court-circuite les routes de test.

## Limites connues

- **iOS/Safari** : IndexedDB ~50 Mo, purge automatique si l'app n'est pas ouverte pendant 7 jours → privilégier Android.
- sql.js charge toute la base en RAM ; `saveDB()` réexporte **tout** à chaque écriture → purger régulièrement, ne rien y mettre de lourd.
- Pas de synchronisation multi-appareils automatique (Dropbox / Drive / pCloud manuels).
- Le réglage « Version pour ordinateur » de Chrome Android est **impossible à désactiver depuis une page web** : seulement contourné (`useIsMobile` force le layout mobile + bandeau d'aide).
