# ⚠️ RÈGLES ABSOLUES

- **Git** : toujours committer et pousser directement sur `main` (pas de branche de feature), sauf demande contraire. **Un commit distinct par demande** de l'utilisateur.
- **Docs à jour** : après toute modif fonctionnelle, mettre à jour `CLAUDE.md` (technique) et `README.md` (visible utilisateur) dans le même commit — sans attendre qu'on le demande.
- **Éditer le dépôt principal**, jamais un worktree temporaire (`.claude/worktrees/*`).
- **⚠ Pas de build tool** : toute l'app est UN seul `<script type="text/babel">` compilé au runtime. La moindre erreur de syntaxe fait échouer la compilation entière → `#root` vide → **écran tout noir**, sans message d'erreur. Après toute modif d'`index.html`, vérifier que la page monte avant de commit.

---

# Spotify+ · Nouvelles Sorties

## Vue d'ensemble
PWA **sans backend** : toutes les données en local (sql.js SQLite WASM + IndexedDB), hébergée statiquement sur GitHub Pages. Chaque artiste suivi est scrappé depuis **sa propre** `last_scraped_at` (défaut `2026-03-15`). L'utilisateur parcourt son feed, écoute titre par titre ; en fin de titre → marqué écouté + auto-avance + disparition animée. Aucun ajout auto en playlist.

C'est un **hub perso** multi-sections : Musique (feed), Actu, Météo, Finance (+ Mes Actifs), Bon Plan, TV Time, Nourriture, To do, Maps, Mot de passe, Remember/Alertes, Stats, League of Legends, GitHub/Speedrun.

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `index.html` | **App complète** (React 18 CDN + Babel + sql.js), tout en un fichier |
| `manifest.json` | Config PWA |
| `service-worker.js` | Cache app shell + vendor (offline). **Network-first** pour l'app shell (fetch `{cache:'no-store'}` pour bypasser le `max-age=600` de GitHub Pages), ne cache que `res.ok`, clé normalisée `./index.html`. Bump la version du cache après changement |
| `vendor/sql-wasm.js` / `.wasm` | sql.js 1.10.2 auto-hébergé |
| `vendor/leaflet.js` / `.css` | Leaflet 1.9.4 auto-hébergé, chargé **lazy** (`loadLeaflet()`) au 1er affichage de la carte Maps |
| `icon-192.png` / `icon-512.png` | Icônes PWA (racine) |
| `data/actu.json` | Sources Actu pré-fetchées par GitHub Action (`update-actu.yml`, cron 2 h) via `scripts/fetch_actu.py`. Lu par `actuFetchStatic()` same-origin ; > 24 h → repli fetchers client (proxies CORS). **Images d'article** : les liens Google News (opaques, sans image) sont décodés côté Action (`gn_decode`, POST interne DotsSplashUi/batchexecute) → `og_image()` de la page réelle → champ `image` des items ; cache `images` (id GN → URL, `""` = tenté sans og:image) reconstruit à chaque run, budget `IMG_BUDGET=40` décodages/run, échec réseau retenté au run suivant. Client inchangé (`actuThumb` : image sinon favicon) |
| `data/indices.json` | Vrais indices (NASDAQ-100/S&P 500/CAC 40) via `scripts/fetch_indices.py` (Stooq→Yahoo) + `update-indices.yml`. Lu same-origin (zéro proxy) |

## Stack & sécurité

- **React 18.3.1 + Babel standalone 7.29.7** via CDN unpkg — **versions épinglées + SRI sha384 + crossorigin**. Ne jamais changer une version sans recalculer le hash.
- **sql.js 1.10.2 auto-hébergé** : `initSqlJs({ locateFile: f => './vendor/' + f })`.
- **⚠ CSP** (`<meta>` dans `<head>`) : `connect-src` limité à `'self'` + les origines réellement utilisées (api.spotify.com, accounts.spotify.com, api.themoviedb.org, www.googleapis.com, api.open-meteo.com + geocoding, api.bigdatacloud.net/photon.komoot.io/nominatim, api.coingecko.com, api.frankfurter.app, api.gold-api.com, api.twelvedata.com, stooq.com, lol-api-summoner.op.gg, lol-web-api.op.gg, proxies CORS codetabs/cors.eu.org/allorigins, api.github.com, www.speedrun.com, hn.algolia.com, hacker-news.firebaseio.com, haveibeenpwned.com, www.cheapshark.com, ledenicheur.fr, world.openfoodfacts.org, ddragon.leagueoflegends.com, api.dropboxapi.com/content.dropboxapi.com, tile.openstreetmap.org). `frame-src` : `'self'` + piece-jointe-carto.developpement-durable.gouv.fr (iframe carte transports IDF dans Actu). `img-src` inclut `https:` + i.ytimg.com + *.ggpht.com/*.googleusercontent.com + image.tmdb.org + ddragon. `'unsafe-inline'`/`'unsafe-eval'` requis par Babel, `'wasm-unsafe-eval'` par sql.js. **Toute nouvelle origine (fetch/script/image) DOIT être ajoutée à la CSP sinon le navigateur la bloque.**
- **IndexedDB** : binaire SQLite (clé `spotifyplus_db`), connexion unique cachée (`_idbPromise`). `navigator.storage.persist()` au login.
- **Auth** : OAuth 2.0 PKCE 100% client, token en localStorage. `state` anti-CSRF (`pkce_state`). `refreshToken()` protégé par mutex (`_refreshPromise`, refresh tokens Spotify à usage unique/rotation) ; refresh token roté re-stocké ; session héritée sans refresh → `logoutClear()`+reload ; `invalid_grant` → idem. `apiGet/apiPut/apiDel` retry 1× après refresh sur 401.
- **lsSet(key, value)** : écriture localStorage centralisée — `console.warn` + alerte utilisateur 1×/session (`_lsWarned`) sur quota plein. Route les setters persistants (saveTvItems, saveTodos, saveListenLog, saveVaultBlob, saveRappels, saveRemembers, saveModuleToggles…). Les caches re-fetchables restent en `catch {}` muet.
- **Garde multi-onglets** : `BroadcastChannel('spotifyplus_tabs')` → bandeau d'avertissement (`otherTab`), car chaque `saveDB()` exporte toute la DB.

### Config Spotify
```js
CLIENT_ID = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES = 'user-follow-read user-read-private user-read-currently-playing user-modify-playback-state user-library-read user-library-modify'
```

### `APP_VERSION` (actuellement `'6.0.8'`)
Constante module-level. Format `MAJ.MIN.U` = nombre de commits **du projet** (≈601) découpé : `patch = N%10`, `minor = floor(N/10)%10`, `major = floor(N/100)` (278→2.7.8, 1001→10.0.1). **⚠ Suivre le compteur PROJET (~601), pas `git rev-list --count` de ce fork (~65)**. À incrémenter **à la main à chaque commit** (pas de build tool pour l'injecter). Affichée sous « Purger les écoutes » et en badge sur la page de connexion.

### Délai de scraping
`delayChoice` (10/20/30 s) + jitter : `delayChoice*1000 + Math.random()*2000 + 1000`.

---

## Schéma SQL local (4 tables)

```sql
tracks (id PK, spotify_uri UNIQUE, artist_name, title, release_title,
        release_type, release_date, cover_url, duration_ms,
        listened DEFAULT 0, liked DEFAULT 0, listened_at, added_at DEFAULT datetime('now'))

artists_scraped (spotify_id PK, last_scraped_at, name, image_url, popularity, followers,
        genres /*JSON*/, spotify_url, last_release_count DEFAULT 0,
        total_tracks_added DEFAULT 0, last_scan_status /*ok|partial|error*/, scan_count DEFAULT 0)

stats (id=1 CHECK, total_listened, listened_this_month, listened_this_year,
        last_reset_month /*YYYY-MM*/, last_reset_year,
        total_listened_ms DEFAULT 0, total_liked DEFAULT 0)  -- 2 dernières colonnes migrées

purged_uris (spotify_uri PK)  -- jamais réinsérés par un re-scan
```
Migrations idempotentes dans `initDB()` (ALTER TABLE en try/catch).

## Module DB (fonctions module-level)
`initDB()` (charge IndexedDB ou crée schéma) · `saveDB()` (export→IndexedDB, **sérialisé** via `_savePromise`/`_saveQueued`, pas de debounce) · `importDiscoverWeekly()` · `dbRun/dbAll/dbGet` · `loadListenStatsFromDB()` · `loadLikedTracksFromDB()` · `loadHistoryFromDB()` (listened=1, max 200, `listened_at DESC`) · `loadArtistsFromDB()` · `mapFeedRow(t)` · `loadFeedFromDB({artistSearch, filterType, sortBy, genreFilter})` (WHERE listened=0, **filtre + tri EN SQL** puis LIMIT 1000 → balaie TOUTE la base même au-delà de 1000).

Item feed : `{ id, spotifyUri, label, artist, title, subtitle, date, rawDate, image, isNew, liked, duration_ms }`.

`saveDB()` appelé après : chaque artiste scrapé, chaque écoute, chaque purge, `endSync`, `visibilitychange→hidden`. Toujours `INSERT OR IGNORE` pour tracks ; **UPSERT `ON CONFLICT(spotify_id) DO UPDATE`** pour artists_scraped (PAS `INSERT OR REPLACE`).

### Likes — migration API Spotify fév. 2026
`/me/tracks/contains` et `PUT/DELETE /me/tracks` **supprimés**. Remplaçants : `libraryContains(uris)` → `GET /me/library/contains?uris=` (max 40) · `librarySave/libraryRemove` → `PUT/DELETE /me/library?uris=` (**URIs en query string même pour PUT**, pas de body) · `libraryScopeAlert(result)` (403 = token pré-scope → alerte reco). `apiDel` mappe aussi 403→`{error:'forbidden'}`.

`syncInitialLikes()` : au `dbReady`, jusqu'à 300 tracks, `libraryContains` par batch de 40, TTL 24 h (`spotifyplus_likes_synced_at`).

### Découvertes de la semaine (`importDiscoverWeekly`)
Cherche dans `/me/playlists` toutes les playlists « découvertes de la semaine »/« discover weekly ». **Priorité aux copies PERSO** (owner ≠ 'spotify', contenu lisible). `fetchPlaylistItems(id)` essaie `/items` PUIS `/tracks`. Insère en `release_type='discover_weekly'`. Deux cooldowns : succès → 7 j (`DW_LS_KEY`), échec → 6 h (`DW_FAIL_KEY`). ⚠ Le contenu des playlists éditoriales Spotify n'est souvent pas lisible → log explique le contournement (créer une copie perso). Recherche des candidates factorisée dans `dwFindCandidates()`. **Accès manuel** : bouton violet `DiscoverWeeklyButton` (`DW_PURPLE`) dans Scrapping SOUS les Logs (desktop + mobile) → `dwManualAccess(log)` ignore les cooldowns, log un diagnostic détaillé par playlist (lisible/403), relance l'import si contenu lisible (cooldowns levés), `reloadFeed()` (nouvelle méthode store, re-query avec filtres actifs) puis ouvre la playlist (ou la recherche Spotify) dans un nouvel onglet. Store expose aussi `log`.

---

## Scraping (`startSync`)

### État unifié `syncState` : `'idle' | 'running' | 'paused' | 'rl_waiting'`
`setSync(st)` pose synchroniquement `syncStateRef.current` puis le state. Booléens `scraping`/`paused`/`rlWaiting` **dérivés**.

### Refus de démarrage (en tête, AVANT toute requête)
1. `syncStateRef.current !== 'idle'` (guard par ref, anti double-clic)
2. `Date.now() < _rlUntil` (fenêtre 429 persistée)
3. Quota 24 h : `loadQuota().count >= 100` ou fenêtre `until` active

### Arrêts — `endSync(reason)` + `checkpoint()`
`endSync('completed'|'daily_limit'|'error')` : reset, `setSync('idle')`, `saveDB()` final. `'completed'` nettoie `spotifyplus_sync_progress` ; autres raisons relisent le localStorage → bouton « ↩ Reprendre » immédiat.

`checkpoint()` attendu avant **chaque** appel (via `apiGetSafe`). UNE boucle d'attente pour la pause manuelle ET la fenêtre 429 (`_rlUntil`) — c'est lui qui pose `rl_waiting` + countdown et repasse `running` à l'expiration. Aucune requête pendant une pause.

### Rate-limit 429 (`apiGetSafe`, local à `startSync`)
`checkpoint()` en tête. Sur `RATE_LIMIT` : **stop dès le 1er 429** → `_rlSet(max(Retry-After, 15 min))` (fenêtre persistée partagée), `setBlockedUntil`, throw → `endSync('error')`. Body d'erreur HTTP (403, 5xx, 401 non rattrapé) → throw (ne termine plus en silence). Les 4 appels passent par `apiGetSafe` : `/me`, page artistes, albums, tracks.

### Fenêtre rate-limit persistée (`_rlUntil` = `spotifyplus_blocked_until`)
Source de vérité unique, relue au chargement du module → survit au F5, s'applique à TOUS les appels (player compris). `_rlNotify → setBlockedUntil` (bandeau + Lancer désactivé). Boot pendant fenêtre : `/me`→`rate_limited` → mode **connecté dégradé** (`user=null`) au lieu d'éjecter. `_parseRetryAfterMs` blinde le header contre NaN.

### Boucle artiste
- `cutoff = (scrapedDates[id] || '2026-03-15').slice(0,10)` (tronqué au jour)
- `/artists/{id}/albums?include_groups=album,single&limit=10&market=FR` — **⚠ limit max = 10** depuis fév. 2026 (`limit=20` → 400). Ne jamais dépasser.
- Filtre `cutoff ≤ release_date ≤ aujourd'hui` via `releaseInRange` (gère la précision year/month/day)
- Chaque album → `/albums/{id}/tracks?limit=50`
- Dédoublonnage via `seenUris` + `knownUrisRef` (+ `purged_uris`) : skip album seulement si `uris.every` connu
- **Écriture « légère »** dès la liste d'albums lue : `INSERT…ON CONFLICT` métadonnées + `last_scan_status='partial'` + `last_scraped_at=cutoff` (jamais avancée) → l'artiste apparaît même si un 429 coupe ensuite. **UPSERT final** après artiste terminé : avance `last_scraped_at=datetime('now')`, `status='ok'`, cumule `total_tracks_added`/`scan_count`. Liste inaccessible → `UPDATE status='error'` (pas d'INSERT, date non avancée).
- Progression : `spotifyplus_sync_progress` (`{artists_scanned, total_artists, last_artist_name, page_url, page_offset}`) après chaque artiste

### Quota 100 artistes / fenêtre GLISSANTE 24 h
localStorage `spotifyplus_daily_scrapings` = `{count, until, last}`. Helpers `loadQuota()`/`saveQuota(count, until, last)`/`ensureQuotaWindow()` (auto-réparant : ouvre une fenêtre si `count≥100` sans `until` valide — corrige l'ancien format `{date, count}`). `loadQuota()` remet count à 0 si `until` dépassé **OU** `Date.now()-last ≥ 24h` (inactivité). `dailyCount` incrémenté **APRÈS** la requête albums (un throw ne brûle plus le quota). `until` gelé à l'instant du 100e. `quotaUntil` (state) → countdown à 2 endroits (`DateRangePanel`, `ScrapingStatusPanel`). Helpers `fmtRemaining(ms)`, `fmtQuotaWhen(until)`.

### Reprise
`resumableSession` (au login si progression existe) → bouton « ↩ Reprendre ». `resumeSync()` → `startSync({skipCount, resumeUrl: page_url, resumeOffset: page_offset})` : repart directement sur la bonne page (plus de re-pagination burst). Compat ancienne progression sans `page_url`.

### Optimisations
Feed batché par artiste (`artistFeedItems` → 1 `setFeed`). Refresh Artistes throttlé 1×/1,5 s (`refreshArtists`). Horloge partagée `useSharedTick`/`_clock` (1 seul `setInterval` pour tous les countdowns). **Interdits** : précompiler le JSX (casse le mono-fichier), debounce de `saveDB` (perte de données mobile).

---

## Écoute / auto-avance

Marquage écouté quand `now?.uri` change (URI précédente dans le feed & `dbReady`) : `UPDATE tracks listened=1, listened_at` + `UPDATE stats` + `saveDB` + `recordListen()` + animation slide-right (600 ms). `listenedUrisRef` anti-doublon. Écritures DB **hors** updater `setFeed` (item lu via `feedRef.current`).

**Clic « Suivant » (`markListened(uri)`)** : les 3 players + `navigateFeed(+1)` capturent l'URI quittée AVANT de jouer le suivant, puis `markListened(leaving)` — retrait immédiat, corrige le double-clic rapide où l'URI intermédiaire échappe au poll 5 s. Idempotent.

**3 mécanismes d'auto-avance** (triple couverture, `advancedForRef` anti-doublon, `prevNowRef` = tick précédent) :
1. Effet `now?.uri` : URI null/hors feed **ET** titre quitté proche de la fin (`nearEnd`, garde anti-vol de lecture)
2. Effet `now?.current` : `remaining ≤ 3 s` & titre dans le feed
3. Effet `now?.playing` : transition `true→false` & `remaining ≤ 8 s` (cas principal : fin naturelle)

⚠ Auto-avance placée AVANT le `return` sur `listenedUrisRef`. ⚠ Limitation Spotify : fin de titre = `200 + is_playing:false` même URI → ni l'effet URI ni current ne se déclenchent (d'où l'effet 3).

**Poll player** : tick 5 s, bail-out si `now` inchangé. Onglet caché → aucun appel (tick de rattrapage au retour). Fenêtre 429 → garde l'état affiché (pas de `null`).

**Curseur optimiste `_effUri`** : module-level `_navUri`/`_navAt` posés par `playTrack()` ; `_effUri(pollUri)` renvoie `_navUri` tant que `< 6500 ms` (poll périmé jusqu'à 5 s). Les 3 players + `navigateFeed` calculent `currentIndex` via `_effUri(now?.uri)`.

---

## Stats / Purge

`stats` : `total_listened`, `listened_this_month/year`, `total_listened_ms`, `total_liked` (likes posés **dans l'app** via `setTrackLiked`, jamais par `syncInitialLikes` ; % likés = `total_liked/total_listened`, persistant). Reset mois/année au démarrage via `last_reset_*` (mois **LOCAL**, pas UTC).

**Purge** (`purgeListened`) : URIs → `purged_uris` (INSERT OR IGNORE), puis `DELETE FROM tracks WHERE listened=1` (likés compris). `stats` non touchée (% likés préservé). Journal `spotifyplus_listens` (voir Graphique) survit à la purge.

`removeFromFeed` (croix rouge × / swipe gauche) : traite le titre **comme écouté** (`listened=1` + `listened_at` + incrément stats + `recordListen`), plus aucun `DELETE` → apparaît dans l'Historique. Idempotent. **Undo** : snapshot dans `undoToast`, toast « ↩ Annuler » 5 s (`UndoToast`), `undoRemove()` remet `listened=0` + ré-décrémente si `counted` + `unrecordListen()` + réinsère à la position d'origine.

---

## Store (api du `StoreProvider`)

État : `authState` · `user` (null en mode dégradé 429) · `otherTab` · `dbReady` · `syncState` (+ dérivés `scraping`/`paused`/`rlWaiting`) · `blockedUntil` · `feed` · `logs` · `now` · `stats` · `listenStats` · `likedTracks` · `history` · `artists` · `loopEnabled` (localStorage) · `moduleToggles` · `delayChoice` · `dailyScrapings` · `quotaUntil` · `filteredFeed` (+ `filteredFeedIndex` Map URI→index) · `filterType` · `sortBy` (défaut `'artist'`) · `artistSearch` · `genreFilter` · `resumableSession`.

⚠ Changement de `filterType`/`sortBy`/`artistSearch`/`genreFilter` → effet debouncé 150 ms qui re-query `loadFeedFromDB` (filtre+tri EN SQL, balaie toute la base). `lastQueryRef` skippe le 1er run + les re-renders sans changement.

Méthodes : `startSync({skipCount, resumeUrl, resumeOffset})` · `resumeSync()` · `togglePause()` · `purgeListened()` · `restoreBackup(data)` · `resetQuota()` · `removeFromFeed(uri)` · `setTrackLiked(uri, bool)` · `syncInitialLikes()` · `navigateFeed(dir)` · `markListened(uri)` · `resetFilters()` · `logout()` · `seek(ms)` · `setLoopEnabled(bool)` · `setModuleEnabled(id, bool)` · `setDelayChoice(n)`.

### Paramétrage des modules
`TOGGLE_MODULES` = modules basculables `{id, label, icon, color, desktop, mobile}` (Actu/Météo/Finance/Bon Plan/TV Time/Musique/Nourriture/To do/Maps/Mot de passe/Remember/Stats ; Scrapping & À propos non basculables). `loadModuleToggles()`/`saveModuleToggles()` (localStorage `spotifyplus_modules`), `moduleEnabled(toggles, id)` (absent = activé, seul `false` désactive). UI = toggles dans « ⚙️ PARAMÉTRAGE » (À propos). Onglet actif désactivé → retour à `home`. Inclus dans buildBackup.

---

## Sauvegarde / Restauration

`buildBackup()` complet = `{ stats, artists, music (table tracks), todos, todos_done, rappels, rappels_time, remembers, tvtime (+ YouTube), tmdb_key, yt_key, maps, finance (historique prix), food (profil + totaux kcal/jour, PAS la composition des repas), bonplan (jeux suivis + prix cibles), mdp_vault (chiffré), modules, listens }`. **Caches re-fetchables exclus** : actu, indices, dependabot, speedrun, lol, yt_subs, actifs, tv eps. **Exclu volontairement** : composition des repas Nourriture (`spotifyplus_food_meals`).

`restoreBackup(data)` (complet OU partiel, clés absentes ignorées) : artists (dates jamais régressées, cumuls au MAX), music (listened/liked au MAX), stats (fusion cumuls), todos/rappels/remembers/maps REMPLACÉS, tvtime FUSIONNÉ (union `type+id`, progression la plus avancée), finance FUSIONNÉ (union série, densité 30 min, cap), food FUSIONNÉ (profil remplacé ; jours : le local gagne, jours absents complétés), listens FUSIONNÉ (union, cap 5000), tmdb_key/yt_key REMPLACÉES si non vides, mdp_vault REMPLACÉ (backup dans `spotifyplus_mdp_vault_prev`).

**Dropbox** (`DROPBOX_APP_KEY` renseignée, PKCE offline) et **Google Drive** (`GDRIVE_CLIENT_ID`, OAuth **implicite** token ~1 h, scopes `drive.file`+`drive.readonly`+`youtube`) : sauvegardent/restaurent le backup complet (overwrite). ⚠ Anti-fixation Drive : `gdriveHandleRedirect()` vérifie préfixe `gdrive.` + nonce `gdrive_state`. Retour OAuth distingué par `state` (`dropbox`/`gdrive.<nonce>`) ; marqueur `spotifyplus_oauth_return` rouvre l'onglet d'origine. **Demande d'accès AUTO** : `gdriveAutoLogin()` appelé au mount d'`ActuPanel` ET de `VosEcoutesPanel` → redirige direct vers le consentement Google si non connecté (garde-fous : `_gdriveAutoAsked` 1×/chargement, cooldown 24 h `gdrive_declined` posé par `gdriveHandleRedirect` sur `#error=…&state=gdrive.…`, effacé au consentement). **Garde layout mobile** : Chrome Android peut cocher « Version pour ordinateur » au retour OAuth (viewport ~980px) → `useIsMobile` reste mobile si (tactile ET min(screen.w,h) < 820) OU indice `spotifyplus_layout_hint` (posé avant chaque redirect OAuth quand innerWidth < 820, valable 15 min). Proposition de sauvegarde hebdo (seul l'export complet « Tous » pose `spotifyplus_last_backup`).

Export : `EXPORT_SECTIONS` (13 boutons dans « ↧ EXPORTER » d'À propos) → `downloadBackup(sec)`, fichier `spotifyplus-<key>-<date>.json`.

---

## Modules (composants principaux)

**Layout** : `WebApp` (desktop, sidebar gauche scraping + onglets en haut, une seule vue centrale) · `MobileApp` (barre haut : profil + 3 onglets principaux Scrapping/En attente/❤Likés + menu ⋯) · `CompactPlayer` (viewport court `innerHeight<500`) · `HubHome` (accueil connecté, cartes `HUB_CARDS`) · `Home` (login « Hub de Pierre »). Retour accueil = clic sur le profil. Défaut view/tab = `'home'`.

**Ordre unique desktop+mobile** (onglets/menu/accueil/login) : Actu, Alertes, Bon Plan, Finance, Maps, Météo, Mot de Passe, Musique, Nourriture, To Do, TV Time, Stats, À propos (Scrapping en tête). **Arc-en-ciel** violet→rouge appliqué partout. ⚠ Les NOMS de constantes couleur sont historiques (`METEO_BLUE` est cyan-vert, `MDP_AMBER` vert-cyan…) — lire la valeur. ⚠ Tout nouvel onglet mobile DOIT avoir son bloc de rendu dans `MobileApp` (sinon page noire) en plus de l'entrée `allOverflowTabs`.

**Feed** : `FeedList` (filtres type/genre/artiste + tri, bannières de date mobile, empty-state seulement si `feed.length===0 && !filtersOn`) · `FeedItem` (`React.memo` + props explicites, **ne consomme PAS `useStore`** ; `key={item.id}` = URI, jamais `id+i`) · swipe gauche=suppr / droite=prev.

**Players** : `PlayerBar` (desktop) · `MobilePlayer` (25vh) · `SeekBar` (mouse+touch, listeners attachés dans `onMouseDown` pas useEffect). Bouton loop partagé `loopEnabled`. Like : `isLiked` init local, `libraryContains` seulement si titre inconnu.

**Musique** (`MusiquePanel`, violet) : fusion 3 collapses `LikerPanel` (❤ Likés) / `HistoryPanel` (🕘 Historique) / `ArtistsPanel` (🎤 Artistes suivis). Anciens onglets dédiés supprimés (valeurs héritées mappées sur `musique`).

**Stats** (`StatsPanel`) : collapses `StatsCollapse` imbriqués — 🎵 MUSIQUES (restantes + sous-collapses écoutées/temps/graphique) · ✅ TO DO · 🎬 FILMS (temps total + top 5 séries + nombre/temps/restant/terminées, YouTube fusionné) · 🗺️ MAPS · 🔔 REMEMBERS · 🎮 JEUX (LoL + Speedrun) · 🐙 GITHUB. `ListeningCharts`/`BarChart` (14 j, SVG maison) lit le **journal persistant** `spotifyplus_listens` (`recordListen`/`unrecordListen`, survit à la purge). `AdvancedStats` (top 5 artistes, répartition, moy/30 j — repart de zéro après purge). Helper `fmtMonthsDaysHours(ms)`.

**À propos** (`VosEcoutesPanel`) : ⚙️ Paramétrage · ↧ Exporter (repliable) · DropboxSync/GoogleDriveSync (save) · ↥ Restaurer · Dropbox/Drive (restore) · 🔄 Réinit quota 24 h · 🗑 Purger · ⎋ Déconnecter (rouge) · « Version X ».

**Actu** (`ActuPanel`, bleu-indigo) — collapses en **ordre ALPHABÉTIQUE** (titre, emoji ignoré) aux 2 niveaux : 📰 Actualité (7 sous-collapses : Actu Mondial, Bourse&crypto, IA&Science Google News + Hacker News, 🛡️ Cyber Secu (failles/ransomwares/cyberattaques Google News — **placé ENTRE IA et Insolite**, position demandée, prime sur l'alphabet), Insolite, Jeux, Tendances Google Trends) · 🔓 Dernières fuites de données (10, bonjourlafuite → repli HIBP) · 🚇 Réseaux de Transport Paris (iframe lazy `TRANSPORT_MAP_URL` — carte statique IDF hébergée par le ministère, URL millésimée à mettre à jour si 404 ; origine en `frame-src`) · ▶ Vidéos YouTube abonnements (`ActuYoutubeSection`, OAuth scope `youtube`, lazyload, bouton 🕒 → playlist « À regarder plus tard (Hub) »). Priorité `data/actu.json`, repli proxies CORS. Vignettes via `actuThumb` (photo article ou favicon). Cache 30 min. **PAS dans buildBackup.**

**Météo** (`MeteoPanel`, bleu) : Light 3 j / Full 7 j (non persisté). Recherche ville (`geocodeCity`). 4 lieux (Voisins-le-Bretonneux, Massy, Boulogne-Billancourt, position actuelle via `reverseGeocode` chaîne BigDataCloud→Photon→Nominatim, fallback hors-ligne `nearestCityFR`/`FR_CITIES`). Open-Meteo (sans clé). Clic jour → `MeteoDetailModal` (détail horaire).

**Finance** (`FinancePanel`, cyan) : gestionnaire **module-level `_finance`** (survit au démontage, `subs:Set`). Chargement **lazy par mode** au mount (`startFinanceLight`/`startFinanceFull`, plus au login). 4 modes : Light / Full / **🧮 Calculatrice** (`FinanceCalcPanel`, entre Full et Mes Actifs : calculatrice de poche locale — accumulateur + op en attente `calcApply`/`calcFmt` (toPrecision(12) anti-bruit flottant), clavier physique supporté hors champs de saisie, historique 5 calculs en session, zéro réseau/persistance) / Mes Actifs. Ordre : Crypto (CoinGecko) → Indices (`data/indices.json` same-origin) → Stock picking (Twelve Data + repli Stooq via `corsFetchText` proxies) → Matières (Pétrole/Sucre via Alpha Vantage, Or/Argent gold-api) → Monnaie (EUR/USD Twelve Data → repli Frankfurter). File TD `tdSpaced` (`TD_GAP_MS=8000`, plan 8 req/min). Flag `TD_ENABLED`. **📈 Graphique au clic** (`FinanceChartModal`, SVG maison) : 4 sources (coingecko/frankfurter/stooq/alpha), cache session `_chartCache`, **repli historique local** `spotifyplus_finance_history` (`finHistSnapshot`, MAX 1 pt/jour, valeurs Light seulement, ~1 an). **Mes Actifs** (3e onglet, doré) : patrimoine depuis le Google Sheets « Finance » du Drive (export CSV 1re feuille via `actifsFetch`, scope `drive.readonly`, cache 6 h). **PAS dans buildBackup** (sauf finance history).

**Bon Plan** (`ComparePanel`, bleu-indigo) — **refonte v6.0.4**, 4 collapses : 🔥 **Promos du moment** (ouvert par défaut : `cmpFetchDeals` = CheapShark `/deals?sortBy=DealRating&pageSize=30`, cache LS `spotifyplus_cmp_deals` 30 min, filtres client Tous/−50 %/−75 %/AAA (retail ≥ $29), vignettes) · ⭐ **Ma liste** (`CompareWatch` : jeux suivis via `CmpStar` partagé, LS **persistant** `spotifyplus_cmp_watch` (lsSet), refresh groupé `cmpRefreshWatch` 1 req `/games?ids=` max 1×/30 min au montage, **prix cible EUR** optionnel → ✓ vert sous la cible ; **clé backup `bonplan`**, fusion par gameID le local gagne) · 🎮 **Recherche jeux** (CheapShark, prix ≈ EUR via `cmpUsdToEur`, ⭐ sur chaque résultat) · 🔎 **Tous produits** (leDénicheur best-effort scraping, pas d'API → lien direct). L'état suivis vit dans `ComparePanel` (`isWatched`/`toggleWatch` passés aux sections). Caches promos/boutiques re-fetchables PAS dans buildBackup.

**TV Time** (`TvTimePanel`, vert-cyan) : suivi séries/films via **TMDB v3** (clé perso `spotifyplus_tmdb_key`, pas de plafond journalier). `tmdbFetchItem` = 1 requête récupère tout, mis en cache (`spotifyplus_tvtime`) → compteurs/stats ne redemandent rien. `tvRefreshShows` (TTL 24 h) ré-interroge seulement les séries suivies non terminées. Item `{id, type:'movie'|'tv'|'youtube', title, poster, year, status:'towatch'|'watching'|'paused'|'done', ...}`. Source de vérité suivi = `tvWatchedSet` (clés `S{n}E{e}`, cochage individuel). Fiches `TvDetailModal`/`YtDetailModal` (saisons dépliables épisode par épisode, `/tv/{id}/season/{n}` caché 7 j). Sections repliables : En cours/En pause/À voir/Prochaines sorties/Vus. Handlers : `setStatus`, `withEps` (statut auto done/watching), `ignoreUnwatched` (🙈 valider sans voir → revient en cours à la prochaine sortie), `abandonSeries` (🚫/⏹ done+`dropped`), `undoLast` (↩ pile 30). Labels `manga`/`cartoon`. **YouTube** (clé `spotifyplus_yt_key`) : chaînes/playlists via lien, vidéos groupées par année, filtre Shorts `< 3 min` (tag `keepShorts` désactive), `unlimited` (cap 500 → 50k), check auto nouvelles vidéos au login (`ytCheckNewVideos`, TTL 6 h, skip `dropped`). FUSIONNÉ au backup (`mergeTvImport`).

**Nourriture** (`NourriturePanel`, vert-jaune `FOOD_COLOR='#9bd93f'`, entre Musique et To Do) : suivi calories façon Lifesum. Profil `spotifyplus_food_profile` (poids/taille/âge/sexe/activité/objectif) → besoin quotidien **Mifflin-St Jeor** (`foodBmr`/`foodTarget`, plancher 1200 kcal, objectifs -500/0/+300) + IMC. Repas du jour par catégorie (`FOOD_CATS` petit-déj/déjeuner/dîner/encas) : composition dans `spotifyplus_food_meals` (**LOCAL uniquement, jamais exporté**, purge > 90 j dans `saveFoodMeals`), totaux quotidiens dans `spotifyplus_food_days` (`{date: kcal}`, exportés, clé backup `food`). Jauge du jour + historique 14 j (`_lastNDays`). `commitMeals` recalcule et persiste le total du jour à chaque ajout/suppression. **Calories auto via Open Food Facts** (base ouverte GRATUITE sans clé, CORS natif, origine `world.openfoodfacts.org` en CSP connect-src) : bouton 🔎 → `foodSearchNutrition(query)` (`cgi/search.pl`, champs `product_name(_fr)/brands/nutriments`, parsing défensif `energy-kcal_100g` → `energy-kcal` → `energy_100g`/4.184 kJ, dédoublonné, ≤ 12 résultats, cache session module-level `FOOD_SEARCH_CACHE`). Chaque résultat = `FoodResultRow` avec **portion en grammes ajustable** (défaut 100) → kcal = `round(kcal100 × g/100)` en direct, bouton + ajoute le repas (label suffixé `(N g)` si ≠ 100). **Saisie manuelle des kcal conservée en repli** (aliment absent de la base / réseau indispo → `searchErr`).

**To do** (`TodoPanel`, vert) : `spotifyplus_todos`, buckets `TODO_BUCKETS` (Quotidien/Aujourd'hui/semaine/mois/année/un jour) en carrousel. ⭐ favorites. Quotidien : × = « valider pour aujourd'hui » (`doneDate`, repart le lendemain). Complétion → `recordTodoDone` (`spotifyplus_todos_done`, → `todoDoneStats()`).

**Maps** (`MapsPanel`, jaune) : trajets Google Timeline importés (localStorage `spotifyplus_maps`, cache `_mapsCache`). `parseGoogleTimeline` (2 formats : `semanticSegments` + `timelineObjects`). `mapsMergeImport` (jours remplacés). Carte Leaflet lazy (`MapsMap`, tuiles OSM assombries, marqueurs `circleMarker`, `mapsEsc` échappe le HTML). ⚠ L'app ne trace JAMAIS la position (import manuel officiel).

**Mot de Passe** (`GestionMdpPanel`, ambre) : coffre chiffré **AES-GCM 256 + PBKDF2 600k** (Web Crypto native). localStorage `spotifyplus_mdp_vault` = `{v, salt, iv, ct}` seulement, mot de passe maître jamais stocké. Phases setup/locked/unlocked. Session `_mdpSession` (effacée au reload), verrouillage auto inactivité `MDP_IDLE_MS=10min` (timer module-level). `safeHref` assainit les URL (bloque `javascript:`). ⚠ Mot de passe oublié = irrécupérable (bouton reset repart en setup).

**Remember/Alertes** (`RappelPanel`, titre indigo `#6f7bf5`, contenu violet `RAPPEL_PURPLE`) : rubriques fixes `RAPPEL_SECTIONS` + item `RAPPEL_EXTRA` (League of Legend) + rappels persos (`spotifyplus_remember_custom`). Dates `spotifyplus_rappels` + heures optionnelles `spotifyplus_rappels_time` (input heure masqué, affiché au clic sur le libellé). `notifyDueReminders()` (J-30/J-7/J-1/J0 + retard, 1×/jour). `syncRemembersToTodos()` (≤ 3 j → bucket Aujourd'hui). **Veilles Techno** : 🤖 Dependabot (`DependabotSection`, token GitHub PAT `ghToken()`, `ghFetchDependabot` GraphQL, fetch direct api.github.com). **Jeux** : 🏁 Speedrun (`SpeedrunSection`, pseudo speedrun.com, endpoints publics). Bandeaux d'alerte en tête.

**League of Legends** (`LolStatsSection` dans 🎮 JEUX de Stats) — **migration 6.0.7 : API interne op.gg SANS CLÉ en source primaire** (demande utilisateur, la clé Riot Development expirait sans arrêt). Endpoints (non documentés, relevés dans OPGG.py, parsing défensif) : recherche `lol-api-summoner.op.gg/api/v3/{region}/summoners?riot_id=`, profil `/api/{region}/summoners/{id}/summary` (league_stats), partie en cours `lol-web-api.op.gg/api/v1.0/internal/bypass/spectates/{region}/{id}` (+ 2e URL candidate). `opggGet` = fetch direct (CORS op.gg) puis proxies CORS ; hôtes en CSP connect-src. Tout est **normalisé au format Riot** (`opggLeagueToEntries` → queueType/tier/rank/LP/wins/losses ; live → `{queueLabel, mins, participants:[{puuid, riotId, championId, teamId}]}` où `puuid` = summoner_id op.gg, clé opaque) → UI inchangée. Mapping `LOL_OPGG_REGION` (euw1→euw…). **Repli automatique Riot** si op.gg échoue ET clé enregistrée (`spotifyplus_lol_key`, OPTIONNELLE désormais — Personal API Key permanente recommandée) : `lolRiotProfile`/`lolRiotLive` (spectator-v5) via `lolApiGet` (proxies). `lolFetchRanks(profile, live)` : rangs des 10 joueurs (summary op.gg ou league-v4 selon `live.source`, cache 15 min par id, 3 workers). Cache profil exige `cache.source` (invalide les caches pré-migration). Config `spotifyplus_lol_cfg` `{riotId, platform}` ; maîtrises seulement en source riot (op.gg → masquées).

**GitHub/Speedrun stats** (`GithubStatsSection`/`SpeedrunStatsSection`) : réutilisent les accès de Veilles Techno. `ghFetchProfile` (1 GraphQL viewer, streak), `srFetchStats` (personal-bests). PAS dans buildBackup.

---

## Bugs connus / fixes

- **`releaseInRange(dateStr, cutoff, ceiling)`** : `release_date` peut être year/month/day. `new Date("2026")`→1er janv → une sortie datée à l'année seule passait sous le cutoff. Traite la date comme période `[début, fin]` et garde si chevauchement. Utilisé aux 2 sites de filtrage.
- **Auto-avance restart** : effet « redémarrage » exige `prevNowRef.current.uri === now.uri` (sinon changement de titre/seek pris pour rebouclage).
- **Écran noir = erreur Babel** : ex. redéclaration `days` (paramètre + `const days`). Renommer. Aucun filet de sécurité.
- **Reset mensuel LOCAL** : `getFullYear()`/`getMonth()`, pas `toISOString()` (UTC → bascule à ~01h FR).
- **Service worker** : ne cache que `res.ok` (sinon 404 écrase l'app) + fetch app shell `{cache:'no-store'}` (sinon `max-age=600` fige la version). Ne jamais revenir en cache-first pour l'app shell.
- **TV Time loupe** : `onClick={() => search()}` (pas `search`, sinon l'event devient le `type`).
- **FeedItem clé** : `key={item.id}`, jamais `id+i` (remount + `React.memo` inopérant).
- **`_effUri`** : voir Écoute (curseur optimiste clic suivant rapide).
- **PlayerBar** : lire le label dans `filteredFeed[currentIndex]`, pas `feed[currentIndex]`.
- **SeekBar** : listeners `mousemove`/`mouseup` dans `onMouseDown`, pas useEffect (sinon clic rapide raté).
- **sql.js** : `_db.run(sql, params)` = tableau positionnel pour les `?`, jamais un objet.
- **Babel hoisting** : tout hook avec tableau de deps (et tout `useMemo`) doit être déclaré APRÈS les variables qu'il liste (sinon deps `[undefined]` figées, `useMemo` lit `undefined`).
- **`apiGet`** : `return null` sur 204 (sinon `.json()` throw) ; `{rate_limited:true}` (pas null) quand le guard bloque.
- **Coffre MDP** : `safeHref` avant `<a href>` (CSP `unsafe-inline` → `javascript:` s'exécuterait).

## Limites
iOS/Safari : IndexedDB ~50 Mo, purge auto si app non ouverte 7 j → privilégier Android. sql.js charge toute la DB en RAM → purger régulièrement. Pas de sync multi-devices (hors Dropbox/Drive manuel).
