# ⚠️ RÈGLES ABSOLUES

- **Git** : committer et pousser directement sur `main` (pas de branche), sauf demande contraire. **Un commit distinct par demande.**
- **Docs** : `CLAUDE.md` (technique) et `README.md` (utilisateur), mis à jour dans le **même commit** que la modif, **uniquement si** elle rend une phrase FAUSSE ou ajoute un piège / un comportement qu'on ne devine pas en lisant le code (nouveau module, origine CSP, clé de stockage, API tierce changée ; visible par l'utilisateur → `README.md`). Correctif, refacto, valeur ajustée : **n'y touchez pas**. **Les garder COURTS** : état actuel et pièges, jamais l'historique ; remplacer une ligne plutôt qu'en ajouter ; le détail va en commentaire au-dessus du symbole.
- **Éditer le dépôt principal**, jamais un worktree temporaire (`.claude/worktrees/*`).
- **⚠ Pas de build tool** : toute l'app est UN `<script type="text/app-source" id="app-src">` (jamais exécuté tel quel). Le **script d'amorçage** avant `</body>` injecte le code compilé du cache `spotifyplus-compiled` s'il existe (Babel n'est alors pas téléchargé), sinon charge Babel et compile avec le preset **`react` SEUL, jamais `env`**, `comments:false` + `retainLines:true` (**jamais `compact:true`** : plus aucune erreur localisable). Clé = `APP_VERSION` + longueur ; l'**empreinte FNV-1a** vérifiée après démarrage purge + recharge **une** fois si elle diffère (`spotifyplus_boot_rehash`). Une erreur de syntaxe ⇒ React ne monte jamais : le filet d'amorçage écrit l'erreur sur `#boot` et, après 45 s, purge le cache et recharge une fois (`spotifyplus_boot_retry`) si le code venait du cache. **Après toute modif d'`index.html`, vérifier que la page monte avant de commit** (et `python3 scripts/csp_hash.py --check`).
- `APP_VERSION` (en tête d'`index.html`, **valeur à y lire**) : **incrémenter le dernier chiffre à chaque commit**.

---

# Spotify+ · Hub de Pierre

PWA **sans backend** sur GitHub Pages, données 100 % locales (sql.js + IndexedDB). Artistes suivis scrapés chacun depuis **sa** `last_scraped_at` (premier scan = toute la discographie), feed écouté titre par titre (fin de titre → écouté + auto-avance). Aucun ajout auto en playlist. Hub perso multi-modules, **ordre unique partout** (onglets, menu ⋯, accueil) : alphabétique, puis Stats et À propos.

**⚠ Ce fichier est un index** : chaque piège est nommé par son symbole et **détaillé en commentaire au-dessus de lui** dans `index.html`. Lire ce commentaire avant de toucher au code.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | **App complète** (~55 000 lignes) |
| `service-worker.js` | **Deux caches** : `spotifyplus-v<N>` (app shell, **bumpé à chaque déploiement**) et `spotifyplus-vendor-v1` (`vendor/` + manifest + icônes, bumpé seulement si l'un change ; ajouter une entrée ne demande pas de bump). App shell en **network-first plafonné à 1,5 s** (`SHELL_TIMEOUT_MS`, `{cache:'no-cache'}`), ETag différent ⇒ `postMessage('shell-updated')` au seul client servi → bandeau `#newver`. `data/*.json` réseau d'abord (clé sans query). ⚠ `activate` ne supprime que les `spotifyplus-*` ≠ le sien, **sauf `spotifyplus-compiled` et le vendor** (origine partagée avec d'autres dépôts Pages). Le cross-origin ne passe pas par le worker |
| `vendor/` | React 18.3.1, sql.js 1.10.2, Leaflet 1.9.4 (lazy), polices DM Sans/Mono. Scripts lazy : `doodle.js` (moteur Doodle Jump, **globales lexicales** : aucune lecture au niveau module d'`index.html`, aucun nom redéclaré ; garde `window.DOODLE_READY`), `sport-data.js` (`SPORT_DATA_READY`), `dobble-art.js` (**IIFE**, 57 objets × 3 versions, garde `DOBBLE_ART_READY` posé si le compte est 57 ; ⚠ attribution CC-BY en tête **obligatoire**, ne pas la retirer), `motus-words.js` / `motus-dico.js` (IIFE) |
| `data/*.json` | Pré-fetchés par `update-data.yml` (cron 2 h) : `actu.json` (clé `via` = relais publics → `ActuViaNotice`), `indices.json` (séance seulement ; `check_quote` refuse non-nombre ou écart > 25 %), `macrocal.json` (existe car le flux n'a pas de CORS ; > `MACROCAL_STALE` ⇒ repli direct puis proxies ; `clean_events` refuse un lot < `MIN_EVENTS`) |
| `scripts/csp_hash.py` | Empreintes `sha256-` des `<script>` inline dans `script-src` (`--check`) |
| `scripts/commit_data.sh` | Commit des JSON, **amendé + force-push** tant que le commit du jour est en tête (jamais par-dessus un commit humain) ⇒ côté local, `git pull --rebase`. `persist-credentials: false` |

## Stack & sécurité

- **Babel standalone 7.29.7** via unpkg, chemin froid seulement, **version épinglée + SRI sha384** : ne jamais changer la version sans recalculer le hash. sql.js : `locateFile: f => './vendor/' + f`.
- **⚠ Un secret ne traverse JAMAIS un relais public sans accord explicite** : Riot (`lolApiGet`) seulement si `spotifyplus_lol_relay === 'on'` ; toute URL à clé en query string est repérée par `urlCarriesSecret` et ne part qu'en direct, sauf `spotifyplus_key_relay === 'on'`. Aucune clé en dur.
- **⚠ CSP** (`<meta>` du `<head>`) = source de vérité. **Toute nouvelle origine DOIT y être ajoutée** (blocage silencieux sinon) ; `connect-src` = miroir d'`API_LIST`. Scripts inline autorisés **par empreinte** ⇒ **modifier un des 4 `<script>` inline ⇒ `python3 scripts/csp_hash.py`** (sinon écran figé). Pas d'`'unsafe-eval'`, `'wasm-unsafe-eval'` pour sql.js, code compilé via `blob:`. `img-src` finit par `https:` (images d'hôtes arbitraires) : ces `<img>` portent `referrerPolicy="no-referrer"`.
- **IndexedDB** : binaire SQLite (`spotifyplus_db`) + bases séparées (piège 20) : `spotifyplus_note_media`, `spotifyplus_tvtime_db`, `spotifyplus_cards_db`, `spotifyplus_photo_cache` (hors sauvegarde), `spotifyplus_sport_img_db` (hors sauvegarde).
- **`lsSet(key, value)`** / **`lsGet`** : accès localStorage centralisés (piège 14).
- **Garde multi-onglets** : `BroadcastChannel('spotifyplus_tabs')` → bandeau `otherTab`.

## Auth Spotify

```js
CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES = 'user-follow-read user-follow-modify user-read-private user-read-currently-playing ' +
         'user-read-playback-state ' +
         'user-modify-playback-state user-library-read user-library-modify ' +
         'playlist-read-private playlist-read-collaborative'
```

- **PKCE 100 % client**, `state` anti-CSRF. `refreshToken()` sous mutex (`_refreshPromise`, refresh tokens à usage unique) ; échec ⇒ `logoutClear()` + reload. Aucune autre méthode d'auth possible (pas de `client_secret` dans un dépôt public).
- `apiGet`/`apiPut`/`apiDel` : retry après refresh sur 401, `null` sur 204, **throw sur 429**, gardent le **corps d'un 403** (Spotify y met la vraie raison).
- `spotifyHasScope(s)` : **`null` = INCONNU**, tester `!== true`. Un scope ne s'obtient qu'en se reconnectant.
- Échecs de connexion : `authErrSet` / `authErrTake` (sessionStorage) → bandeau `authError`. Cause n°1 : `/me` en **403 = compte absent de *User Management***.
- **Hors ligne** : « 📴 Continuer sans Spotify » → `enterOffline()`. **`bootLocal()`** = toute l'init non-Spotify, appelée par les deux chemins (deps `[]`).

## Base locale

```sql
tracks (id PK, spotify_uri UNIQUE, artist_name, title, release_title, release_type,
        release_date, cover_url, duration_ms, listened DEFAULT 0, liked DEFAULT 0,
        listened_at, added_at DEFAULT datetime('now'))
artists_scraped (spotify_id PK, last_scraped_at, name, image_url, popularity, followers,
        genres /*JSON*/, spotify_url, last_release_count, total_tracks_added,
        last_scan_status /*ok|partial|error|gone*/, scan_count, following DEFAULT 1)
stats (id=1, total_listened, listened_this_month, listened_this_year,
        last_reset_month, last_reset_year, total_listened_ms, total_liked)
purged_uris (spotify_uri PK)  -- jamais réinsérés par un re-scan
```

- Migrations idempotentes dans `initDB()`. `loadFeedFromDB({...})` **filtre et trie EN SQL** puis LIMIT 1000.
- `saveDB()` **sérialisé** (`_savePromise`/`_saveQueued`), **jamais debouncé** (perte mobile). `INSERT OR IGNORE` pour `tracks` ; **UPSERT `ON CONFLICT DO UPDATE`** pour `artists_scraped` (jamais `INSERT OR REPLACE`).
- **Migration API fév. 2026** : `/me/tracks/contains`, `PUT/DELETE /me/tracks` et `/me/following` (écriture) supprimés ⇒ `libraryContains` / `librarySave` / `libraryRemove` / `spotifyFollowArtists` sur **`/me/library?uris=`** (URIs en query même pour PUT). ⚠ **Plafond `LIBRARY_URIS_MAX` = 40**. ⚠ Un endpoint retiré répond **403** comme une permission absente : citer le `message` de Spotify (`deltaRefusedMsg`), ne pas deviner la cause.

## Scraping (`startSync`)

- `syncState` `'idle'|'running'|'paused'|'rl_waiting'` via `setSync` (ref synchrone). **`checkpoint()`** avant chaque appel : une seule attente pour pause et 429. `endSync(reason)` : seul `'completed'` efface `spotifyplus_sync_progress`.
- **429** : `_rlSet(max(Retry-After, 15 min))`, persisté dans `spotifyplus_blocked_until`, s'applique à **tous** les appels.
- **Premier scan = toute la discographie** (pages déroulées, plafond `FIRST_SCRAPE_MAX_PAGES`) ; artiste connu = **une page** (+1 page `include_groups=single` si la 1re n'a aucun single). ⚠ **Une page d'albums = une unité de quota**, comptée APRÈS la requête ; l'artiste en cours est toujours terminé. ⚠ `FULL_SCRAPE_FROM` est un **état** (« premier scan pas fini ») posé par `writeLightRow()`.
- Albums `limit=10` (piège 21) → `releaseInRange` (piège 19) → tracks. `single` de `EP_MIN_TRACKS`+ titres = EP (`release_type='ep'`).
- **Désabonnement = `following=0`, JAMAIS un DELETE** (réabonnement ⇒ repart de sa date). Le balayage de fin de boucle n'est joué qu'après un passage **complet** parti de la page 1.
- Quota **100 / 24 h glissantes** (`spotifyplus_daily_scrapings`). Scraping auto `musicAutoTry()` (100 % local ; journée marquée par `endSync('completed')` seul ; `MUSIC_AUTO_LS` absent = activé).
- **Découvertes de la semaine** : jamais automatique ; `dwManualAccess` ou capture par la lecture `dwCaptureFromContext` (le contenu des playlists éditoriales répond souvent 403).

## Écoute / auto-avance

- **Marquage** : changement de `now?.uri` → `listened=1` + stats + `saveDB` ; `listenedUrisRef` anti-doublon ; écritures DB **hors** de l'updater `setFeed`. Les players capturent l'URI quittée AVANT de jouer la suivante puis `markListened` (idempotent, position réelle seulement).
- **3 auto-avances** (`advancedForRef`, `prevNowRef`), **placées AVANT le `return` sur `listenedUrisRef`** : URI quittée proche de la fin · `remaining ≤ 3 s` · transition `playing true→false` et `remaining ≤ 8 s` — **cas principal** (fin de titre = `is_playing:false` sur la **même URI**).
- **Poll player** : chaîne de `setTimeout`, une requête en vol, 5 s en lecture / 15 s au repos, rien en onglet caché ; curseur optimiste `_effUri`.
- **`playTrack`** : sans appareil actif ⇒ 404/403 ⇒ `GET /me/player/devices` puis rejeu avec `device_id` (`spotifyPickDevice` écarte les `is_restricted`). Throttle `_playAlert` 30 s (appel sans geste utilisateur).
- **`purgeListened`** : URIs → `purged_uris` puis DELETE ; `removeFromFeed` = marqué écouté (Undo 5 s).

## Store (`StoreProvider`)

- **⚠ QUATRE contextes** : `useStore()` (fonctions + données) · `useStoreCore()` (fonctions SEULES — y lire un champ de `storeData` rend `undefined`) · `useNow()` · `useSyncInfo()`. **Ne jamais remettre dans `api` une valeur qui bouge à intervalle régulier** (re-rend tout, jeux compris).
- Filtres → effet debouncé 150 ms qui re-query `loadFeedFromDB`.
- **Modules** : `TOGGLE_MODULES` ; `moduleEnabled` / `moduleOnHome` : **absent ⇒ activé, seul `false` désactive**.
- **Barre de lecture** : `usePlayerHidden()` = verrou temporaire `useHidePlayerBar` + préférence `PLAYERBAR_LS` (seul `'off'` masque) ; le poll continue. Repli mobile `PLAYERFOLD_LS`.
- **Ordre des IA** : `spotifyplus_ai_order` (`aiOrderNormalize`), `aiChain(needVision)`, IA en 429 reléguée `AI_QUOTA_REST_MS`. ⚠ `aiOrderInvalidate()` après toute écriture hors `saveAiOrder`.

## IA

**8 fournisseurs en chaîne de replis**, façade unique **`aiGenerate(modId, parts, opts)`**, badge `AiFallbackBadge` (`aiMeta()`). ⚠ Une requête avec image saute les fournisseurs sans `vision`. ⚠ `opts.tools` (recherche web) et `file_data` (YouTube) **n'existent que chez Gemini** ⇒ sans lui `NO_GROUNDING` (≠ `NO_KEY`), l'appelant rejoue sans outil. ⚠ `GEMINI_MODELS` essayés dans l'ordre (404/403/5xx → suivant) : **uniquement des Flash** (les Pro sont payants) ; clé morte = 400.

## Sauvegarde / restauration

- **`buildBackup()`** (synchrone, **liste des clés dans le code** : y ajouter toute section persistée) ; **`buildBackupFull()`** = + `note_media` (async). Export partiel `EXPORT_SECTIONS`.
- **Chiffré par défaut** (`BACKUP_ENC_LS`, seul `'off'` laisse en clair) : `backupSeal` APRÈS découpage, sur les 4 sorties ; `backupOpen` dans **`restoreBackup`** seul (entonnoir unique). Clé = **mot de passe maître du coffre** : `BACKUP_DK_LS` garde une clé DÉRIVÉE (sel propre, liée au sel du coffre), posée au déverrouillage (`backupKeyFromMaster`), sur l'appareil, **jamais dans `buildBackup`** ; `BACKUP_KEY_LS` (ancienne clé) ne sert plus qu'à rouvrir les vieux fichiers.
- **Fusion** : toute clé d'objet venue du fichier passe par **`safeKey`** (`__proto__`…) · **compteurs au MAX, jamais en somme** · unions pour les historiques, le local gagne par id · dates d'artistes jamais régressées · clé d'API différente ⇒ confirmation (`backupSecretPairs`). ⚠ localStorage plein ne lève rien : `applyBackup` renvoie `failed[]` → `restoreFailMsg`.
- **Exclus** : caches re-fetchables et **toutes les images** (piège 15).
- **Dropbox** : PKCE, `state = 'dropbox.<nonce>'` obligatoire. Sauvegarde auto 1×/jour `dropboxAutoDailySave` (seul `'on'` active ; reportée pendant un scraping ; jamais de `prompt`). **Google Drive** : GIS modèle token, `loadGis()` préchargé (popup synchrone d'un clic) ; ⚠ **`include_granted_scopes: false`** (sinon `youtube` + `drive.file` ⇒ 400) ; YouTube a son propre jeton (`ytg_*`) ; la PWA installée casse ⇒ se connecter depuis un onglet Chrome. **pCloud** : implicite, **2 régions** (`pcloud_host`), l'API répond **toujours 200** ⇒ tester `result`.
- **Photos → Drive** `HUB_Pierre/<Module>`, lien fiche ↔ photo porté par le **nom** du fichier (= id). Affichage au Bearer + `createObjectURL` (d'où `blob:` dans `img-src`). `gdriveBlobUrl` : mémoire → `spotifyplus_photo_cache` → Drive (une photo vue ne repart jamais chercher Drive ; `gdriveBlobForget` pour un remplacement local).

## Modules — pièges propres

| Module | Composant | Stockage | ⚠ À savoir |
|---|---|---|---|
| **Musique** | `MusiquePanel` | base SQLite | 6 collapses repliés ; 🔀 Delta = un seul scan, l'🤖 IA en repart |
| **Actu** | `ActuPanel` | caches 30 min, `_actu_ia`, `_actu_bug`, `_yt_top_seen` | `data/actu.json` prioritaire. **Bug & Pannes** : Downdetector n'a pas d'API ⇒ pages de statut officielles `API_STATUS_HOSTS` (source unique pour `DD_SERVICES`, `API_HOST_ID`, CSP ; `DD_KIND` ; une requête par HÔTE) ; sans page officielle, `ddFromReports` déduit une pastille des signalements (`reported:true`, compteur via `ddIsDown`). **BullRun** : tout replié, aucune page tierce embarquée ; `macroCalKeep` filtre APRÈS le test de disponibilité ; `BullrunRainbow` = bitcoin seul, Blockchain.com (`x` en **secondes**) → Stooq. **Cartographie** : chaque fiche repliée ne demande RIEN (`useCartoSummary`, cache `_cartoSum`) ; pas de note sous les chiffres, donnée absente = pas de ligne ; `cartoInseeCommune` appelée par 📊 INSEE seule ; `WATER_STATES` teste « non conforme » en premier ; UCDP version dans le chemin (`UCDP_VERSIONS`) ; Commons `origin=*` ; 🌌 Aurores = simple lien, 🚇 Transport = iframe IDFM (piège 27). `ActuAiSummary` écrit à partir des titres passés, jamais `opts.tools` ; vue YouTube ⇒ `ytSeenMarkAnywhere` |
| **Alertes** | `RappelPanel` | `_rappels`, `_rappels_time`, `_rappels_notes`, `_remember_custom`, `_garanties`, `_anniv_custom` | Trois listes libres, clés `custom.<id>` / `garantie.<id>` / `anniv.<id>` (préfixes distincts). `RAPPEL_NOTES` = texte libre, hors circuit d'alerte. Anniversaire : récurrent 12 mois par sa clé (`isAnnivKey`), jalons `ANNIV_ALERTS` (J et J-3), saisie JJ/MM validée au blur, stockée `YYYY-MM-DD`. `rappelPurgeGone` : liste explicite `RAPPEL_GONE`. Échéance ≤ 3 j ⇒ tâche To do (`syncRemembersToTodos`, `rememberKey`) |
| **API** | `APIPanel` | `_api_export`, `_api_calls` | `API_LIST` = miroir de `connect-src` ; `API_KEY_LS` (chaîne ou tableau) |
| **Bon Plan** | `ComparePanel` | `_cmp_watch` | 3 sources ; prix hétérogènes (`__eur`, `cmpEurVal`) ; `/deals` = une ligne par boutique (`cmpTitleKey`) ; Epic : tester `startDate`/`endDate` |
| **Collection** | `CollectionPanel` | `_collection` + `spotifyplus_cards_db` | `collEdit` ne touche jamais l'`id` (clé ET nom Drive, assaini par `collPhotoKey`) ; `img` = URL distante. **Cartes** (`CARD_SUBS`) dans leur base : `collLoad`/`collSave` les y redirigent, `cardsSet` refuse d'écrire tant que `_cards.ready` est faux. Accordéon d'extensions (une ouverte) ; catalogue injoignable ⇒ X seul, jamais un total deviné ; manquantes `CARD_MISS_MODES`. `sub.addSet` n'incrémente pas une carte possédée ; `pokeCardRow` conversion unique. Import Magic **CSV seul** (`MtgImportBtn`/`MtgTools`, `mtgLooksBinary`), image jamais stockée. Analyse Cardmarket poussée best effort (carte non lue comptée, jamais à 0 ; `mtgSetBestPerSeller`). `actifsFindFile` ne voit que les Sheets natifs (`NOTNATIVE`) |
| **Emploi** | `EmploiPanel` | `_emploi`, `_adzuna_*` | `emploiReject` = critères durs (lieu non négociable, `emploiLocOk`), `emploiScore` = souples ; donnée manquante de l'offre ne rejette jamais. L'IA CLASSE (`emploiAiRank`) et TRADUIT une phrase en critères (`emploiAiCrit`, calque jamais persisté), elle ne cherche pas |
| **Finance** | `FinancePanel` | `_finance_history` | État `_finance`. Relevé `finAutoDue` dans un effet **à part** (ni `dbReady` ni `offline`). `BullRunPanel` vit dans Actu |
| **Frigo** | `FrigoPanel` | `_frigo` | — |
| **Histoire** | `HistoirePanel` | `_histoire` | `chat` dans la fiche ; `histChatPrompt` rappelle ville + œuvre |
| **IA** | `IaPanel` + `IaModal` | `_ia_history`, `_ia_modules` | **Liste FERMÉE `IA_ACTIONS`**. L'IA ne reçoit aucune donnée pour agir (cible retrouvée par `iaMatch`) ; seule une question envoie `IA_READ` borné. `run` rend des opérations inverses sérialisables (`iaUndoOps`). `IA_MAX_ACTIONS` 5, `IA_MAX_DELETE` 1, `IA_NEVER`. Actions `nav` en dernier (`_iaNav.go`) |
| **Jeux** | `JeuxPanel` | `_game_hi_*`, `tierlist-v1`, `_flip7`, `_dobble_mode`, `_doodle_hi_reset`, `_hi_purged_v9` | **Dobble** : `dobbleDeck()` = plan projectif d'ordre 7 (57 cartes × 8, lié au vendor), `DOB_PICK` choisit la version de dessin ; modes `DOB_MODES` (menu de l'en-tête), animations en rAF écrites dans le DOM, sans `setState`. **Des chiffres et des lettres** n'arbitre pas (`cdlSolve` à l'arrivée sur le résultat ; mots Motus 6–9 lettres seulement). **Flip 7** = donnée sauvegardée (REMPLACÉE à la restauration). `useImmersiveLock`, `useHidePlayerBar`, `useNoPinchZoom` (écouteurs non passifs). Retirer un jeu ⇒ id dans `REMOVED_GAMES` + **renommer** `HI_PURGE_LS` |
| **Maps** | `MapsPanel` | `_maps` | Import Timeline (2 formats) ; ne trace jamais la position. 📸 **Lieu par photo** (`MapsPhotoFind`) : GPS de l'EXIF lu sur le fichier D'ORIGINE (`exifGpsFromBuffer` ; `frigoPhotoData` passe par un canvas qui efface l'EXIF, et le sélecteur Android retire souvent la position), sinon estimation IA vision (`mapsFindWithAi`, repli Nominatim si pas de coordonnées) ; rien n'est stocké (`_mapsFind` en mémoire) |
| **Météo** | `MeteoPanel` | `_meteo_rain_notified` | `METEO_LOCS` lue par Météo, Air, Eau, Pollens (≠ `FR_CITIES`). Pluie notifiée 1× par épisode. Géoloc seulement si déjà autorisée |
| **Mot de Passe** | `GestionMdpPanel` | `_mdp_vault` | AES-GCM + PBKDF2 600k. Espaces Perso/Pro (`_mdpSpace`, sans stockage) : `entries` = liste complète rechiffrée, `spaceEntries` = vue ; lire l'espace par `mdpSpaceOf`. Clé dérivée cachée `_mdpKeyCache` (indexée par HMAC, jamais le mot de passe) ; **l'IV est neuf à chaque chiffrement, pas le sel**. `mdpCheckup` jamais automatique ; HIBP k-anonymity ; test de site = `<img>` favicon directe, sur case à cocher. Mot de passe oublié = irrécupérable |
| **Note** | `NotePanel` | `_notes`, `_notes_enc_check`, `spotifyplus_note_media` | Pièces jointes en IndexedDB (chiffrées dans l'espace privé) |
| **Revente** | `ReventePanel` | `_revente` | Publication automatique impossible sans backend |
| **Santé** (`food`) | `NourriturePanel` | `_food_*` | Macro vidée = INCONNUE, jamais 0. Quantité ⇒ produit en croix depuis un couple de référence figé. Sport : `foodSportKcal`, capture Strava `foodStravaAnalyze` bornée ×0,4–×2,5 ; le sport **relève l'objectif** (`targetEff`), ne se soustrait pas. Un seul sélecteur de jour pour Nourriture et Sport. Prévision : `fatShare` 90 % par défaut, départ = dernière pesée, tampon `createdAt` posé dans un effet. **Toute écriture de pesée passe par `weightsPublish`** |
| **Sport** | `SportPanel` | `_sport`, `_sport_times` + `spotifyplus_sport_img_db` | Planches en base SQLite **à part** (`sportImgResolve` → `useSportImg`, `null` tant que la base n'a pas répondu) ; plafonds `SPORT_IMG_MAX_*` |
| **To do** | `TodoPanel` | `_todos`, `_todos_done`, `_todos_trash`, `_leak_todo` | 8 rubriques. 🔔 Toute alerte datée s'affiche en LECTURE SEULE dans la rubrique de son échéance (`todoAlertBucket`), sauf celles déjà recopiées (`rememberKey`). Tags `TODO_TAGS` (double tap ; lire par **`todoTagOf`**, jamais `t.tag` nu). Bouton de vue `TODO_VIEWS` : ⏳ Courtes (défaut, alertes ≤ 1 mois) → Travail → Massy → Toutes, **jamais persisté** ; une tâche ajoutée en vue taguée prend le tag. `touchAction:'manipulation'` sur le libellé. Corbeille : `doneTs` pour que `todoDoneUndo` retire la bonne entrée. `today` alimenté par `syncRemembersToTodos`, `syncSpeedrunToTodo`, `syncTvEpisodeAlerts`, `syncLeakVaultTodos` (coffre déverrouillé obligatoire). `todoDailyCheck` (Santé) coche sans jamais créer |
| **TV Time** | `TvTimePanel` | `spotifyplus_tvtime_db` + `_tvtime_eps`, `_yt_progress`, `_yt_comment_likes`, `_tv_ep_*` | Liste en IndexedDB, `loadTvItems`/`saveTvItems` synchrones sur cache ; **`_tvReady` verrou anti-perte** (`tvItemsPreload` dans `bootLocal`, `tvFlushDone` à la restauration). Vignette jamais stockée (`ytStill`). `ytInTab` découpe YT/Short. Source de vérité `tvWatchedSet` ; **`tvFreezeWatchedSet` avant tout refresh**. `syncTvEpisodeAlerts` 100 % local. L'API ne sait pas liker un commentaire |
| **Vêtement** | `VetementPanel` | `_vetements`, `_vetement_*` + `spotifyplus_photo_cache` | Ne jamais renommer une clé de type (`VET_GROUPS`). `it.corporate` = un seul tag chic. `syncDrive({force:true})` seul chemin qui relit Drive. `vetTailleAvg` recalculé, jamais stocké ; avis IA sans photo |
| **Stats** | `StatsPanel` | `_sport_times` | Lecture seule sauf 🏋️ SPORT (`sportTimeNorm`) |
| **À propos** | `VosEcoutesPanel` | — | **Limite data** : `LSU_RULES`, splits `lsuTvSplit` / `lsuCollSplit` / `lsuMusiqueSplit`, `lsuIdbScan` ; plafond **sondé** par `lsuProbeFree`. **Autorisations** : `AUTH_PERMS` table unique, cocher = `ask`, décocher = `revoke` (+ reload) ; pas de « tout autoriser » possible |

**Layout** : `WebApp` (desktop) · `MobileApp` (menu ⋯) · `CompactPlayer` (viewport court) · `HubHome` · `Home` (login).

---

## ⚠ Pièges (les relire avant de coder — le code y renvoie par numéro)

**Compilation / React**
1. **Écran figé = erreur Babel ou au niveau module.** Le filet d'amorçage n'y répare rien : vérifier que la page monte avant de commit.
2. **Hoisting Babel** : tout hook à deps (et `useMemo`) déclaré **APRÈS** les variables qu'il liste ; une `const` module-level lue plus haut = **TDZ = écran noir** (contourner par une ref). Dans `vendor/doodle.js`, la même TDZ donne « Impossible de charger le jeu » : tester avec `node -e "global.window={};global.document={createElement:()=>({getContext:()=>({})})};global.localStorage={getItem:()=>null};require('./vendor/doodle.js')"`.
3. **Ne pas mélanger raccourci et propriété longue CSS** (`border` + `borderColor`).
4. **Clé de liste = l'URI/l'id**, jamais l'index — ni en clé, ni en prop (le rang du feed vient d'un compteur CSS).
5. **`StatsCollapse` démonte ses enfants** : l'état à préserver vit **module-level** (objet + `subs:Set` + publieur, cf. `_finance`).
6. **Refs anti-closure** dans les boucles `rAF`/`setInterval` et les écouteurs posés par élément.
7. **Nouvel onglet mobile** : bloc de rendu dans `MobileApp` + entrée `allOverflowTabs` + remap des anciennes valeurs de `spotifyplus_active_tab`.
8. `selfHeading:true` dans `SECTION` **et** heading retiré de `MobileApp`.
9. **`position:fixed` piégé par un ancêtre `transform`** → portal sur `document.body`. ⚠ En **plein écran natif**, un portal est invisible : rendre en enfant du lecteur.
10. **`useImmersiveLock(active)`** sur tout overlay plein écran (sinon une rotation bascule en `CompactPlayer` et démonte l'overlay).
11. **Appui long** : ref `{timer, fired}` qui neutralise le `click` suivant ; bloquer `onContextMenu` + `userSelect`.
12. **Swipe/défilement finissent par un `click`** → garde `moved` (8 px).
13. **Une iframe cross-origin avale les événements** : couche de capture transparente.

**Données / stockage**
14. **`lsSet` écrit la valeur telle quelle** (`JSON.stringify` soi-même) et renvoie `false` si le quota est plein. **`localStorage` LÈVE à la lecture** quand les données de site sont bloquées : depuis un rendu, toujours **`lsGet`**.
15. **Jamais d'image** (data URL) en localStorage ni dans le backup : photos → Drive, médias → IndexedDB dédiée.
16. **Clé de jour LOCALE** : `localDayStr()`, jamais `toISOString()`.
17. **Fusion des sauvegardes : au MAX ou en union, jamais en somme.**
18. **`_db.run(sql, params)`** : tableau positionnel, jamais un objet.
19. `release_date` = `YYYY`, `YYYY-MM` ou `YYYY-MM-DD` → une **période** (`releaseInRange`).
20. **Une base IndexedDB séparée plutôt qu'un store de plus** (changement de version bloqué par un onglet ouvert).

**Réseau / API**
21. **Spotify albums : `limit` max = 10.**
22. **Entrées de playlist `track` → `item`** (fév. 2026), mais `/me/tracks` garde `track` : `it.item || it.track || it`.
23. **`items: []` n'est pas une preuve de vide** : essayer toute la cascade, garder la première réponse non vide.
24. **Le statut HTTP ne suffit pas** : lire `error.errors[0].reason` (deux 403 différents).
25. **`fetch('blob:…')`/`fetch('data:…')` bloqués par `connect-src`.**
26. **`readAsDataURL` et non `createObjectURL`** pour une image locale affichée.
27. **Les sites institutionnels refusent l'`<iframe>`** sans qu'on puisse le détecter : la vue est un RÉSUMÉ recalculé + `SiteLink`. **Seule exception : 🚇 Transport** (iframe IDFM), dont le `SiteLink` au-dessus est le seul recours — ne pas le retirer. Toute nouvelle iframe : en-têtes testés dans un vrai navigateur + `frame-src`.
28. **`AbortController` sur tout fetch tiers** : `fetchTimeout` ou `signal: fetchSig(ms)` (jamais sur un transfert de sauvegarde ou de photo).

**Sécurité**
29. **`dangerouslySetInnerHTML` proscrit** → `DOMParser`.
30. **`safeHref` avant tout `<a href>`**, y compris une URL proposée par une IA.
31. **Service worker** : ne cacher que `res.ok` ; app shell network-first plafonné, **jamais `no-store`** ni cache-first ; notifier le seul client servi, pas `matchAll()`.

**Environnement d'agent**
32. **Le proxy bloque de nombreux hôtes** (Google, Steam, CoinGecko, YouTube…) : parsing défensif, et dire « non vérifiable côté agent ».
33. **unpkg est bloqué** : pour tester dans Chromium, servir Babel en local et `serviceWorkers:'block'`.

## Limites connues

- **iOS/Safari** : IndexedDB ~50 Mo, purgée après 7 jours sans ouverture.
- sql.js tient toute la base en RAM et `saveDB()` réexporte tout : purger régulièrement.
- Pas de synchro multi-appareils automatique.
- « Version pour ordinateur » de Chrome Android non désactivable depuis la page (`useIsMobile` force le layout mobile).
