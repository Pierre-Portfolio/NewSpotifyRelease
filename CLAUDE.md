# ⚠️ RÈGLES ABSOLUES

- **Git** : committer et pousser directement sur `main` (pas de branche), sauf demande contraire. **Un commit distinct par demande.**
- **Docs** : `CLAUDE.md` (technique) et `README.md` (utilisateur), mis à jour dans le **même commit** que la modif, chacun indépendamment — **uniquement si** elle rend une phrase FAUSSE ou ajoute un piège / un comportement qu'on ne devine pas en lisant le code : nouveau module, origine CSP, clé de stockage, changement d'API tierce, comportement visible par l'utilisateur (→ `README.md`). Correctif, refacto, valeur ajustée, une source de plus dans une liste déjà décrite : **ne toucher à aucun des deux**, le message de commit raconte mieux. **Les garder COURTS** : l'état actuel et les pièges, jamais l'historique des correctifs (il est dans git) ; **corriger ou remplacer** une ligne plutôt qu'en ajouter, et préférer le commentaire dans le code au paragraphe ici — ces fichiers sont relus intégralement à chaque session.
- **Éditer le dépôt principal**, jamais un worktree temporaire (`.claude/worktrees/*`).
- **⚠ Pas de build tool** : toute l'app est UN seul `<script type="text/app-source" id="app-src">` (type inconnu du navigateur ⇒ **jamais exécuté ni compilé tout seul**). Le **script d'amorçage** avant `</body>` décide : code déjà compilé trouvé dans le cache `spotifyplus-compiled` ⇒ injecté tel quel et **Babel n'est même pas téléchargé** ; sinon Babel est chargé à la demande, compile avec le preset **`react` SEUL, jamais `env`** (il réécrivait tout en ES5 : 16,4 s de compilation au lieu de 3,8), puis le résultat est mémorisé. Clé = `APP_VERSION` + longueur + **empreinte FNV-1a** de la source (la longueur seule ne bougeait pas sur un renommage à longueur égale : un bump oublié servait l'ancien code pour toujours). Premier écran sur téléphone : 66 s → 13 s au premier chargement, **1,8 s ensuite**. La moindre erreur de syntaxe fait échouer la compilation entière → React ne monte jamais. **Filet d'amorçage** : un écouteur `error` global écrit la vraie erreur sur l'écran d'attente, et un chien de garde de 45 s constate que `#boot` est toujours là — si le code venait du CACHE il le purge et recharge **une** fois (drapeau `spotifyplus_boot_retry` en sessionStorage), sinon il se contente du message (recharger recompilerait la même source cassée). **Après toute modif d'`index.html`, vérifier que la page monte avant de commit.**
- `APP_VERSION` (constante en tête d'`index.html`, **valeur à y lire**) : **à incrémenter à la main à chaque commit**. `MAJ.MIN.U` dérivé du nombre de commits N du projet : `patch = N%10`, `minor = floor(N/10)%10`, `major = floor(N/100)`.

---

# Spotify+ · Hub de Pierre

PWA **sans backend** sur GitHub Pages, données 100 % locales (sql.js SQLite WASM + IndexedDB). Chaque artiste suivi est scrappé depuis **sa propre** `last_scraped_at` ; un artiste **jamais scrappé prend toute sa discographie**. Feed écouté titre par titre : fin de titre → marqué écouté + auto-avance + disparition animée. Aucun ajout auto en playlist. C'est aussi un **hub perso multi-modules**, avec un **ordre unique partout** (onglets desktop, menu ⋯ mobile, accueil) : alphabétique, puis Stats et À propos.

**⚠ Ce fichier est un index, pas un manuel** : chaque piège y est nommé par son symbole et **détaillé en commentaire au-dessus de ce symbole** dans `index.html`. Aller lire le commentaire avant de toucher au code concerné.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | **App complète** (React 18 CDN + Babel + sql.js), ~35 000 lignes, tout en un fichier |
| `manifest.json` | Config PWA |
| `service-worker.js` | **DEUX caches** : `spotifyplus-v<N>` (app shell, bumpé à chaque déploiement) et `spotifyplus-vendor-v1` (fichiers de `vendor/` **+ `manifest.json` et les 2 icônes**, **bumpé seulement quand l'un d'eux change** — `primeVendor()` étant incrémental, AJOUTER une entrée ne demande aucun bump — sinon 1,9 Mo immuables repartaient sur le réseau à chaque déploiement ; `primeVendor()` ne (re)télécharge que ce qui manque). **Network-first avec plafond `SHELL_TIMEOUT_MS` (1,5 s)** pour l'app shell (`fetch {cache:'no-cache'}` : revalidation CONDITIONNELLE — bypasse le `max-age=600` de GitHub Pages tout en laissant un 304 éviter les 3,1 Mo ; **jamais `no-store`**, qui refait le téléchargement entier à chaque lancement) : au-delà du délai on sert le cache et le téléchargement continue en fond ; s'il rapporte un ETag différent de la copie servie, `postMessage('shell-updated')` **au seul client servi** (`resultingClientId`) → bandeau `#newver`. Ne cache que `res.ok`, clé normalisée `./index.html`. ⚠ Sans cache, on attend le réseau sans plafond. ⚠ Son `activate` supprime tout cache dont le nom ≠ le sien — **sauf `spotifyplus-compiled`** (code compilé, se purge lui-même) **et `VENDOR`**. ⚠ Le cross-origin ne passe plus par le worker du tout. **Bumper la version du cache après changement.** |
| `vendor/sql-wasm.js` / `.wasm` | sql.js 1.10.2 auto-hébergé |
| `vendor/leaflet.js` / `.css` | Leaflet 1.9.4, **lazy** (`loadLeaflet()`) |
| `vendor/motus-words.js` / `motus-dico.js` | Données Motus (~1,1 Mo), **lazy** (`loadMotusData()`), IIFE → `window.MOTUS_WORDS` / `MOTUS_DICO` |
| `data/actu.json` | Sources Actu pré-fetchées par `update-data.yml` (cron 2 h) via `scripts/fetch_actu.py`. Lu same-origin ; > 24 h → repli fetchers client (proxies CORS). Clé `via` = les relais publics empruntés par section (vide = direct) → bandeau `ActuViaNotice` |
| `data/indices.json` | Indices boursiers via `scripts/fetch_indices.py` (Stooq→Yahoo), **même workflow**, séance seulement (06–22 UTC, lun–ven) |
| `scripts/commit_data.sh` | Commit des deux JSON. Chacun réécrit son `updated_at` ⇒ **un run = un diff** : le commit du jour est **amendé + force-push** tant qu'il est en tête ⇒ **1 seul commit/jour** (jamais d'amende par-dessus un commit humain ; `--force-with-lease`). ⚠ Côté local, `git pull` sur `main` peut diverger → `git pull --rebase` |

## Stack & sécurité

- **React 18.3.1 + Babel standalone 7.29.7** via unpkg — **versions épinglées + SRI sha384 + crossorigin**. Ne jamais changer une version sans recalculer le hash.
- **sql.js 1.10.2 auto-hébergé** : `initSqlJs({ locateFile: f => './vendor/' + f })`.
- **⚠ CSP** (`<meta>` du `<head>`) = **source de vérité, y lire les listes à jour**. **Toute nouvelle origine (fetch / script / image / iframe) DOIT y être ajoutée**, sinon blocage silencieux. ⚠ `img-src` finit par un joker `https:` **non retirable** (Actu, Histoire et Collection affichent des images d'hôte arbitraire par nature) : ces `<img>`-là portent `referrerPolicy="no-referrer"`, et la page est en `strict-origin-when-cross-origin`. Particularités : `'unsafe-inline'`/`'unsafe-eval'` pour Babel et `'wasm-unsafe-eval'` pour sql.js · `accounts.google.com` **sans SRI** (script GIS non versionné) · `blob:` dans `img-src` (photos Drive au Bearer → `createObjectURL`) · `connect-src` = miroir d'`API_LIST` (~50 origines).
- **IndexedDB** : binaire SQLite (`spotifyplus_db`), connexion unique cachée (`_idbPromise`), `navigator.storage.persist()` au login. Base séparée `spotifyplus_note_media` (pièces jointes des notes).
- **`lsSet(key, value)`** : écriture localStorage centralisée (warn + alerte 1×/session sur quota plein) — voir piège 14.
- **Garde multi-onglets** : `BroadcastChannel('spotifyplus_tabs')` → bandeau `otherTab` (chaque `saveDB()` exporte toute la DB).

## Auth Spotify

```js
CLIENT_ID    = '672e41f0308f4378b4f2331844e08b20'
REDIRECT_URI = 'https://pierre-portfolio.github.io/NewSpotifyRelease/'
SCOPES = 'user-follow-read user-follow-modify user-read-private user-read-currently-playing ' +
         'user-read-playback-state ' +
         'user-modify-playback-state user-library-read user-library-modify ' +
         'playlist-read-private playlist-read-collaborative'
```

- **OAuth 2.0 PKCE 100 % client**, token en localStorage, `state` anti-CSRF. `refreshToken()` sous mutex (`_refreshPromise`) : refresh tokens à usage unique + rotation ; sans refresh token ou `invalid_grant` → `logoutClear()` + reload. ⚠ **Aucune 2e méthode d'auth n'est possible** : Client Credentials exige un `client_secret` (dépôt public) et n'a aucun contexte utilisateur.
- `apiGet` / `apiPut` / `apiDel` : retry 1× après refresh sur 401 · `null` sur 204 · **throw sur 429** · `{rate_limited:true}` sous fenêtre 429. **`apiPut` garde le corps d'un 403** (`{error:'forbidden', status, message, reason}`) : Spotify y met la vraie raison.
- **Scopes mémorisés** (`spotify_scopes`) → `spotifyHasScope(s)`. ⚠ **`null` = INCONNU** (jeton antérieur) : traiter `!== true`, jamais `=== false`. Un jeton **ne gagne pas** un scope au refresh, seule une reconnexion l'accorde.
- **Diagnostic de connexion** : toute cause d'échec est posée par `authErrSet`, relue par `authErrTake` (**sessionStorage** : `refreshToken()` recharge la page), affichée en bandeau rouge (`authError`). ⚠ Cause n°1 : `/me` en **403 = compte absent de *User Management* du Dashboard**.
- **Mode hors ligne** : un `/me` raté ne jette pas la session ; bouton « 📴 Continuer sans Spotify » toujours affiché → `enterOffline()` = `setUser(meCacheLoad())` + `offline` + `bootLocal()`. Profil caché dans `spotifyplus_me` (hors backup, re-fetchable).
- **`bootLocal()`** = toute l'init NON-Spotify (persistance, `syncRemembersToTodos`, `syncSpeedrunToTodoFromCache`, `notifyDueReminders`, `tvSyncDaily`, `initDB`, reset mois/année, feed, stats, reprise de synchro, quota, fenêtre 429, `setDbReady`). Appelée par le chemin normal **et** l'entrée hors ligne. Deps `[]` : ne référence que setters et refs.

## Base locale (4 tables)

```sql
tracks (id PK, spotify_uri UNIQUE, artist_name, title, release_title, release_type,
        release_date, cover_url, duration_ms, listened DEFAULT 0, liked DEFAULT 0,
        listened_at, added_at DEFAULT datetime('now'))

artists_scraped (spotify_id PK, last_scraped_at, name, image_url, popularity, followers,
        genres /*JSON*/, spotify_url, last_release_count DEFAULT 0, total_tracks_added DEFAULT 0,
        last_scan_status /*ok|partial|error|gone*/, scan_count DEFAULT 0)

stats (id=1 CHECK, total_listened, listened_this_month, listened_this_year,
        last_reset_month /*YYYY-MM*/, last_reset_year, total_listened_ms, total_liked)

purged_uris (spotify_uri PK)  -- jamais réinsérés par un re-scan
```

Migrations idempotentes dans `initDB()` (ALTER TABLE en try/catch). Accès : `dbRun`/`dbAll`/`dbGet`, chargements `load*FromDB`, `loadFeedFromDB({artistSearch, filterType, sortBy, genreFilter})` **filtre et trie EN SQL** puis LIMIT 1000 (balaie toute la base). Item feed : `{ id, spotifyUri, label, artist, title, subtitle, date, rawDate, image, isNew, liked, duration_ms }`.

`saveDB()` (export→IndexedDB, **sérialisé** via `_savePromise`/`_saveQueued`, **jamais debouncé** : perte de données mobile) après chaque artiste scrapé, chaque écoute, chaque purge, `endSync`, `visibilitychange→hidden`. Toujours `INSERT OR IGNORE` pour `tracks` ; **UPSERT `ON CONFLICT(spotify_id) DO UPDATE`** pour `artists_scraped` (jamais `INSERT OR REPLACE`).

**Likes — migration API fév. 2026** : `/me/tracks/contains` et `PUT/DELETE /me/tracks` **supprimés**. Remplaçants : `libraryContains(uris)` → `GET /me/library/contains?uris=` (max 40) · `librarySave`/`libraryRemove` → `PUT/DELETE /me/library?uris=` (**URIs en query string même pour PUT**, pas de body) · `libraryScopeAlert(result)` sur 403. `syncInitialLikes()` : jusqu'à 300 tracks par batch de 40, TTL 24 h.

## Scraping (`startSync`)

**`syncState`** : `'idle' | 'running' | 'paused' | 'rl_waiting'` ; `setSync(st)` pose synchroniquement `syncStateRef.current` puis le state, `scraping`/`paused`/`rlWaiting` sont **dérivés**. Démarrage refusé (avant toute requête) si l'état n'est pas `idle`, si `Date.now() < _rlUntil` ou si le quota 24 h est atteint. **`checkpoint()`** est attendu avant **chaque** appel (via `apiGetSafe`) : une seule boucle d'attente pour la pause manuelle **et** la fenêtre 429 — aucune requête pendant une pause. `endSync(reason)` : reset + `saveDB()` final ; `'completed'` nettoie `spotifyplus_sync_progress`, les autres raisons laissent « ↩ Reprendre ».

**Rate-limit** : sur le **1er 429**, `_rlSet(max(Retry-After, 15 min))` — fenêtre persistée `spotifyplus_blocked_until`, relue au chargement du module, donc elle survit au F5 et s'applique à **tous** les appels, player compris. Boot pendant la fenêtre : `/me` → `rate_limited` → mode connecté dégradé (`user = null`) au lieu d'éjecter.

**Boucle artiste** :
- **Premier scan = 100 % de la discographie** : `firstScrape` ⇒ `cutoff = FULL_SCRAPE_FROM` (`'1900-01-01'`) **et** pagination de TOUTES les pages d'albums (garde-fou `FULL_SCRAPE_MAX_PAGES`). Un artiste déjà connu garde `cutoff = last_scraped_at` et sa **seule 1re page**.
- ⚠ `FULL_SCRAPE_FROM` est aussi la **sentinelle de reprise** (posée par l'écriture « légère ») : un premier scan coupé par un 429 se reprend en ENTIER — y poser une date récente ferait perdre la discographie à jamais.
- `/artists/{id}/albums?include_groups=album,single&limit=10&market=FR` (piège 21) → filtre `releaseInRange` (piège 19) → `/albums/{id}/tracks?limit=50`. Dédoublonnage `seenUris` + `knownUrisRef` + `purged_uris` : album skippé seulement si `uris.every` connu.
- **Artistes sans nom** (ligne d'avant la colonne `name`, ou restaurée d'une sauvegarde qui ne portait que `spotify_id`+`name`) : plus dans `/me/following` ⇒ aucun scan ne repasse les remplir. Bouton « 🔍 Identifier » du panneau Artistes → `GET /v1/artists?ids=` (50 max, `null` en place d'un id disparu) : trouvé ⇒ métadonnées écrites, sinon `last_scan_status='gone'` puis « 🗑 Supprimer » = `DELETE FROM artists_scraped` **+ `DELETE /me/following?type=artist&ids=`** (scope `user-follow-modify`, ajouté après coup ⇒ **403 sur un jeton ancien**, suppression locale faite quand même).
- **Écriture « légère »** dès la liste d'albums lue (`last_scan_status='partial'`, date jamais avancée) → l'artiste apparaît même si un 429 coupe ; **UPSERT final** après artiste terminé (avance `last_scraped_at`, `status='ok'`, cumule les compteurs). Liste inaccessible → `status='error'`, date non avancée.
- Progression dans `spotifyplus_sync_progress` après chaque artiste ; `resumeSync()` repart sur la bonne page.

**Quota 100 artistes / fenêtre glissante 24 h** : `spotifyplus_daily_scrapings` = `{count, until, last}` (`loadQuota`/`saveQuota`/`ensureQuotaWindow`, auto-réparants). `dailyCount` incrémenté **APRÈS** la requête albums (un throw ne brûle plus le quota).

**Scrapping automatique** : `musicAutoTry()` part 4 s après le boot puis se re-teste toutes les 10 min ; `musicAutoDue()` est **100 % local, aucune requête**. ⚠ La journée n'est marquée **que** par `endSync('completed')` — le quota se libérant par fenêtre glissante, la suite peut repartir le même jour. Coupé si `offline` ou `otherTab`. Préférence `MUSIC_AUTO_LS` (**absent = activé, seule la valeur `'off'` désactive**).

**Découvertes de la semaine** : **aucun import automatique**. Deux chemins : le bouton violet `dwManualAccess` (`{force:true}`) et la **capture par la lecture** `dwCaptureFromContext` (lit la file déjà interrogée par le poll player, aucune requête dédiée). ⚠ Spotify refuse souvent le CONTENU d'une playlist éditoriale (403) : la capture par la lecture est le vrai filet.

## Écoute / auto-avance

**Marquage** : `now?.uri` change (URI précédente dans le feed & `dbReady`) → `listened=1` + `stats` + `saveDB` + `recordListen()` + animation 600 ms ; `listenedUrisRef` anti-doublon ; écritures DB **hors** de l'updater `setFeed` (item lu via `feedRef.current`). Les players capturent l'URI quittée AVANT de jouer la suivante puis appellent `markListened` (idempotent) — sinon le double-clic rapide échappe au poll 5 s. ⚠ `markListened` n'utilise **que** la position réelle, jamais le repli mémorisé par `navigateFeed`.

**3 mécanismes d'auto-avance** (triple couverture, `advancedForRef` anti-doublon, `prevNowRef` = tick précédent), **placés AVANT le `return` sur `listenedUrisRef`** :
1. Effet `now?.uri` : URI null/hors feed **et** titre quitté proche de la fin (`nearEnd`, garde anti-vol de lecture)
2. Effet `now?.current` : `remaining ≤ 3 s` & titre dans le feed
3. Effet `now?.playing` : transition `true→false` & `remaining ≤ 8 s` — **cas principal** ⚠ la fin d'un titre est un `200 + is_playing:false` sur la **même URI**, donc ni 1 ni 2 ne se déclenchent.

**Poll player** : tick 5 s, bail-out si `now` inchangé, aucun appel onglet caché (rattrapage au retour), fenêtre 429 → garde l'état affiché. Curseur optimiste `_effUri(pollUri)` → `_navUri` tant que `< 6500 ms` (le poll est périmé jusqu'à 5 s).

**`playTrack`** : `PUT /me/player/play` **sans `device_id`** n'aboutit que s'il existe un appareil *actif au sens de Spotify* (un Spotify ouvert mais en pause ne l'est plus) ; sur **404 ou 403** → `GET /me/player/devices` puis rejeu sur `?device_id=`. `spotifyPickDevice` **écarte les `is_restricted`** (ils refusent toute commande de l'API Web). ⚠ `spotifyDevices` en try/catch (`apiGet` throw sur 429, sinon l'auto-avance casse). ⚠ **Throttle `_playAlert` 30 s** : `playTrack` est appelée sans geste utilisateur par l'auto-avance.

## Stats / purge

`stats` : `total_listened`, `listened_this_month/year`, `total_listened_ms`, `total_liked` (likes posés **dans l'app**, jamais par `syncInitialLikes`). Reset mois/année au démarrage via `last_reset_*` (mois **LOCAL**).

**`purgeListened`** : URIs → `purged_uris` (INSERT OR IGNORE) puis `DELETE FROM tracks WHERE listened=1` ; `stats` non touchée, le journal `spotifyplus_listens` survit. **`removeFromFeed`** (croix × / swipe gauche) traite le titre **comme écouté** (pas de DELETE) → il apparaît dans l'Historique ; idempotent, **Undo** 5 s (`undoRemove()`).

## Store (`StoreProvider`)

Détient l'auth, le feed (+ `filteredFeed` et `filteredFeedIndex` Map URI→index), `now`, les stats, les artistes, les filtres, les toggles de modules et les états de synchro/quota — **liste exacte dans `StoreProvider`**.

- ⚠ Changement de `filterType`/`sortBy`/`artistSearch`/`genreFilter` → effet debouncé 150 ms qui re-query `loadFeedFromDB` ; `lastQueryRef` skippe le 1er run et les re-renders sans changement.
- **Modules** : `TOGGLE_MODULES` = `{id, label, icon, color, desktop, mobile}` ; `moduleEnabled` / `moduleOnHome` = **absent ⇒ activé/affiché, seul `false` désactive** (`spotifyplus_modules` / `_home_modules`). Onglet actif désactivé → retour à `home`.
- **Barre de lecture** : `usePlayerHidden()` réunit DEUX causes de masquage — le compteur `_hidePlayer.n` (verrou temporaire de `useHidePlayerBar`, jeux plein écran) et la préférence permanente `PLAYERBAR_LS` (`spotifyplus_playerbar`, Paramétrage d'À propos ; **absent ⇒ affichée, seule la valeur `'off'` masque**). ⚠ Le poll player continue de tourner : seul l'AFFICHAGE disparaît.
- **IA par module** (bouton 🤖, `ModuleAiModal`) : `AI_MODULES` = **la table qui décide** (module absent ⇒ 🤖 grisé). `spotifyplus_module_ai` = `{modId:{provId:false}}`, **absent ⇒ autorisé**. `aiChain(needVision, modId)` filtre la chaîne : décocher **raccourcit les replis**, ça ne change ni la requête ni le parsing → changer d'IA ne peut pas casser un module. Chaîne vide malgré des clés → `AI_OFF_MSG` (≠ `NO_KEY`). ⚠ Cache `_modAiCache` → **`moduleAiInvalidate()` après toute écriture hors `saveModuleAi`**.
- **Optimisations** : feed batché par artiste (1 seul `setFeed`), refresh Artistes throttlé 1,5 s, horloge partagée `useSharedTick`/`_clock`. **Interdit** : précompiler le JSX (casse le mono-fichier).

## Sauvegarde / restauration

**`buildBackup()`** (synchrone) → une clé par section + les clés/pseudos d'API (**liste exacte dans le code** ; y ajouter toute nouvelle section persistée). **`buildBackupFull()`** = + `note_media` (IndexedDB, donc **asynchrone** — téléchargement et 3 destinations cloud). Export partiel : `EXPORT_SECTIONS` → `downloadBackup(sec)`.

**Chiffrement optionnel** (`BACKUP_ENC_LS`, `'on'` = actif ; **absent = en clair**, comme avant) : `backupSeal(data)` scelle en `{app, version, exported_at, scope, encrypted:true, enc}` avec la primitive du coffre (`mdpEncrypt`), `backupOpen(data)` ouvre. ⚠ `backupSeal` s'applique **APRÈS** le découpage d'un export partiel, aux **4** sorties (fichier + 3 clouds) ; `backupOpen` est appelé dans **`restoreBackup`** seul — c'est l'unique entonnoir des 4 chemins de restauration. ⚠ La phrase de passe n'est stockée nulle part : oubliée = fichier illisible. `backupSeal` renvoie `null` si les deux saisies diffèrent (rien n'est écrit) et l'objet **tel quel** si l'option est inactive.

**Règles de fusion** (`restoreBackup`, complet ou partiel, clés absentes ignorées) :
- **⚠ Cumuls et compteurs : au MAX, JAMAIS en somme** (artistes, `games.hi`, `api_calls`) — la sauvegarde contient déjà l'historique local, additionner **doublerait** à chaque ré-import.
- Union / le plus avancé : tvtime, listens (cap 5000), notes (`updatedAt` le plus récent), finance, food (`weightMerge` pour les pesées), collection / revente / note_media (par id, **le local gagne**).
- Remplacés : todos, rappels, remembers, maps, modules, home_modules, prefs, mdp_vault (backup dans `spotifyplus_mdp_vault_prev`), clés/pseudos si non vides. Dates d'artistes **jamais régressées** ; `music` : `listened`/`liked` au MAX.
- ⚠ **Un `localStorage` plein ne lève RIEN** (`lsSet` renvoie `false`, `put` avale le throw) : la restauration s'annonçait réussie sans rien écrire. `applyBackup` renvoie donc `failed[]` → `restoreFailMsg(res)` dans les 4 UI, et `_tvItemsCache` remis à `null`. TV Time est le plus gros objet du backup : il sature en premier.
- **⚠ Volontairement EXCLUS** : tous les caches re-fetchables (actu, indices, cours, Steam, LoL, chess, speedrun, github, yt_subs, delta, displate, clés de jour des synchros auto) et **toutes les images** (voir piège 15).

**3 destinations** (UI partagée `DropboxSync`/`GoogleDriveSync`/`PCloudSync`, prop `mode='save'|'restore'`) :
- **Dropbox** : OAuth PKCE offline. `state = 'dropbox.<nonce>'` (`dropbox_state`) — le nonce anti-CSRF manquait, seul PKCE couvrait le retour forgé ; l'ancien `'dropbox'` nu est encore accepté pour un consentement parti avant le déploiement.
- **Google Drive** : **Google Identity Services, modèle « token »** (le flux implicite par redirection n'existe plus). `loadGis()` charge lazy `accounts.google.com/gsi/client` (**non versionné ⇒ pas de SRI**), **préchargé au boot** pour que `requestAccessToken()` parte SYNCHRONE d'un clic (sinon popup bloquée). Scopes séparés `GDRIVE_SCOPE_BASE` (`drive.file`) / `GDRIVE_SCOPE_READ` (`drive.readonly`, Finance → Mes Actifs) ; **YouTube a son propre consentement et son propre jeton** (`ytg_*`). ⚠ **`include_granted_scopes: false` obligatoire** (sinon Google recolle les scopes déjà accordés → combinaison interdite `youtube` + `drive.file` → erreur 400). ⚠ **Aucun repli par redirection** ; échec → `gdriveLoginFailed` / `ytgLoginFailed`. ⚠ **La PWA installée casse** (jeton renvoyé vers `storagerelay://`) → se connecter **une fois depuis un onglet Chrome normal**.
- **pCloud** : OAuth **implicite** (le flux `code` exige un client_secret). ⚠ **2 régions** (`api.` / `eapi.pcloud.com`) mémorisées dans `pcloud_host` — la mauvaise donne « invalid access token ». ⚠ **L'API répond TOUJOURS en HTTP 200** avec `result` ≠ 0 → `pcloudApi()` teste `result`, pas `res.ok`. Hôte de contenu éphémère `c###.pcloud.com` (joker CSP).

**Photos → Google Drive** (`HUB_Pierre/<Module>`) : un fichier par fiche **nommé avec son id** → le lien fiche ↔ photo est porté par le NOM, rien en local, le Drive fait autorité (helpers `gdrive*`). Un fichier privé n'a pas d'URL affichable → téléchargement au Bearer + `createObjectURL` (**d'où `blob:` dans `img-src`**).

## Modules

| Module | Composant / couleur | Stockage | Notes |
|---|---|---|---|
| **Musique** | `MusiquePanel`, violet | (base SQLite) | 6 collapses `defaultOpen={false}` : ⚙ Scrapping · ⏳ En attente · ❤ Likés · 🕘 Historique · 🎤 Artistes suivis · 🔀 Delta Playlist |
| **Actu** | `ActuPanel`, bleu-indigo | caches 30 min, `spotifyplus_actu_ia` | Actualité · Cartographie (`MapFrame`) · Fuites de données · Vidéos YouTube (OAuth séparé, lecture dans le `YtFullscreenPlayer` de TV Time). `data/actu.json` prioritaire, repli proxies CORS. **🤖 Actu résumé par IA** (`ActuAiSummary`, au-dessus d'Actu Mondial) : 5 puces monde + 5 puces France sur la veille, écrites **à partir des titres passés dans le prompt** (jamais de la mémoire du modèle, jamais `opts.tools` — Gemini seul l'a) ; bloc France via `actuFetchFrance()` à la demande, état module-level `_actuIa`, 1 génération/jour, cache re-fetchable **hors backup**. ⚠ Vue à `ACTU_SEEN_RATIO` ou à la fin → `ytSeenMarkAnywhere` + `ytWlDropSeen` ; vidéo trop récente pour la chaîne suivie ⇒ « orphelin » (`ytOrphanSeen`, garde-fou `ytItemAcceptsVideo`) |
| **Alertes** | `RappelPanel`, `#6f7bf5` | `spotifyplus_rappels`, `_rappels_time`, `_rappels_notes`, `_remember_custom`, `_speedrun_todo_added` | Rubriques fixes + rappels persos + sections auto (Frigo, Steam) + calendrier 🗓. `RAPPEL_NOTES` = champs de rubrique en **texte libre**, ⚠ sans date donc **hors du circuit d'alerte** (ni badge, ni calendrier, ni notification, ni To do : tout cela dérive de `RAPPEL_SECTIONS` seul). `RAPPEL_RECUR` / `rappelNextDate` (la date stockée reste celle d'origine). File speedrun non vide ⇒ tâche « Aujourd'hui » du To do (`syncSpeedrunToTodo` : marqueur `srKey`, 1 création/jour, file vidée ⇒ tâche et marqueur retirés) |
| **API** | `APIPanel`, `#6a78f2` | `spotifyplus_api_export`, `_api_calls` | `API_LIST` = miroir de `connect-src`. Clés inline (`API_KEY_LS`, valeur = chaîne **ou tableau** pour 2 champs), ligne rouge si clé manquante, export JSON |
| **Bon Plan** | `ComparePanel`, bleu-indigo | `spotifyplus_cmp_watch` | Ma liste · Promos · Bibliothèque Steam · Recherche · Tous produits (IA). **3 sources dans la même liste** : CheapShark, `cmpSteamDeals`, `cmpEpicDeals` (⚠ tester la fenêtre `startDate`/`endDate`, une promo finie reste dans la réponse). ⚠ Prix hétérogènes (USD converti vs euros réels) → `__eur` / `px()` / tri `cmpEurVal` ; ⚠ `/deals` renvoie **une ligne par boutique** → regroupement `cmpTitleKey`, meilleure offre seule + tableau site/prix en vignette ; `cmpMergeEditions` (Deluxe/Ultimate = `gameID` distincts) ; ☆ réservé aux jeux à `gameID` CheapShark |
| **Collection** | `CollectionPanel`, `#5a95e6` | `spotifyplus_collection` | 5 catégories, moteur commun `CollectionSub`. `collAdd` incrémente `qty` sur id existant ; `img` = **URL distante, jamais une image encodée** |
| **Emploi** | `EmploiPanel`, `#57a0e0` | `spotifyplus_emploi` | Salaire vs secteur + offres (The Muse + Remotive) |
| **Finance** | `FinancePanel`, cyan | `spotifyplus_finance_history` | État module-level `_finance`. 5 modes **lazy** : Light / Full / Calculatrice / BullRun / Mes Actifs. Relevé quotidien `finAutoDue` → `finHistSnapshot` (tout le Light + les seules lignes Full INDICES et STOCK PICKING) |
| **Frigo** | `FrigoPanel`, `#47a8de` | `spotifyplus_frigo` | 3 compartiments + péremption + assistant IA (photo → ingrédients, recettes) |
| **Histoire** | `HistoirePanel`, `#41b0d8` | `spotifyplus_histoire` | Ville + photos → fiche d'œuvre par IA (recherche web ancrée) + Google Custom Search. Fil de questions (`chat` DANS la fiche, donc sauvegardé) ; `histChatPrompt` rappelle TOUJOURS ville + œuvre |
| **Jeux** | `JeuxPanel`, `#39b2d1` | `spotifyplus_game_hi_*`, `tierlist-v1`, `_doodle_hi_reset`, `_hi_purged_v5` | 25 mini-jeux, **tous 100 % locaux et hors ligne**. `useImmersiveLock(true)` ; `useHidePlayerBar(true)` masque le player (affichage seul) ; `useNoPinchZoom(active)` neutralise le pincement (Osu, pendant une manche) — ⚠ écouteurs **non passifs** obligatoires. ⚠ `_doodle_hi_reset` = migration jouée **une seule fois**, l'effacer remet le record à 0. ⚠ Retirer un jeu ⇒ ajouter son id à `REMOVED_GAMES` (cumulatif) et **renommer** `HI_PURGE_LS` (`_v6`…), sinon la purge ne repart pas là où l'ancienne a déjà tourné |
| **Maps** | `MapsPanel`, jaune | `spotifyplus_maps` | Import Google Timeline (2 formats), Leaflet lazy. ⚠ L'app ne trace jamais la position |
| **Météo** | `MeteoPanel`, bleu | `spotifyplus_meteo_rain_notified` | Open-Meteo sans clé, 5 lieux, Light 3 j / Full 7 j. `meteoRainCheck()` notifie une pluie dans les 2 h **1× par ÉPISODE** (clé = heure de DÉBUT des heures pluvieuses contiguës). Géoloc **seulement si déjà autorisée**, sinon `METEO_LOCS[0]` |
| **Mot de Passe** | `GestionMdpPanel`, ambre | `spotifyplus_mdp_vault` | AES-GCM 256 + PBKDF2 600k ; le blob chiffré contient `{entries, tags}` → suivi par les sauvegardes. Verrouillage auto 10 min. ⚠ Mot de passe oublié = irrécupérable |
| **Note** | `NotePanel`, `#6fd345` | `spotifyplus_notes`, `_notes_enc_check`, IndexedDB `spotifyplus_note_media` | 2 espaces (clair / crypté au mot de passe **global**), sauvegarde auto 700 ms. La note ne porte que les ids des pièces jointes, les contenus vivent en IndexedDB (chiffrés dans l'espace privé) |
| **Revente** | `ReventePanel`, `#86d941` | `spotifyplus_revente` | Annonces Vinted/Leboncoin/eBay par IA. ⚠ Publication automatique **impossible sans backend** |
| **Santé** (id `food`) | `NourriturePanel`, `#9bd93f` | `_food_profile`, `_food_days`, `_food_meals` (local seul), `_food_weights`, `_food_favs` | Calories (Open Food Facts + IA + photo de plat), macros, pesées. ⭐ Favoris : valeurs /100 g épinglées (id = `nom|marque`, jamais d'image), recherche LOCALE dédiée |
| **Sport** | `SportPanel`, `#c3d93f` | `spotifyplus_sport` | 9 groupes musculaires × 70 exercices illustrés (Wikimedia Commons), appui long → fiche animée |
| **To do** | `TodoPanel`, vert | `spotifyplus_todos`, `_todos_done`, `_todos_trash` | 7 rubriques en carrousel. ♻️ = les 3 dernières supprimées, **restaurables** (`restoreTrash`) : ⚠ `recordTodoDone` rend son horodatage, stocké en `doneTs` dans la corbeille, pour que `todoDoneUndo` retire LA BONNE entrée du journal — sinon supprimer/restaurer/re-supprimer compterait 2 tâches faites. Dans `daily` et `cecile` le × **valide** au lieu de supprimer ; appui long 3 s dans `daily` = supprimer la récurrence. `today` alimenté automatiquement par `syncRemembersToTodos` et `syncSpeedrunToTodo` |
| **TV Time** | `TvTimePanel`, ambre | `spotifyplus_tvtime`, `_tvtime_eps`, `_yt_progress`, `_yt_comment_likes` | Séries/films (TMDB), chaînes YouTube, livres (Google Books + Open Library). Barre de filtres = onglets `all｜tv｜movie｜youtube｜shorts｜book` (`_tvtime_filter`), chacun sur 2 lignes (icône + libellé, compte en dessous) ; ⚠ YT et Short partagent le MÊME bloc de rendu, découpé par `ytInTab` = ce qu'il RESTE à voir (Shorts **et** vidéos longues en attente ⇒ le vidéaste est dans les deux ; replis : contenu de la chaîne, puis tag `shortsOnly`) — les listes `ytWatching`/`ytDone` restent entières, le 🩳 de l'en-tête ne dépend pas de l'onglet. Source de vérité = `tvWatchedSet`. ⚠ Un item hérité re-dérive son set à chaque refresh (l'épisode se cochait tout seul à sa sortie) → **`tvFreezeWatchedSet` le fige AVANT tout refresh**. `YtFullscreenPlayer` : la fin d'une vidéo la valide, position dans `_yt_progress` (⚠ l'API YouTube n'en donne aucune ; hors sauvegarde). `tvSyncDaily` reprenable. ⚠ **L'API Data v3 ne sait PAS liker un commentaire** (aucun `rate` hors `videos.rate`) → le 👍 de `YtCommentsPanel` pose une marque locale (`_yt_comment_likes`, hors sauvegarde) et ouvre le commentaire sur youtube.com (`&lc=`) pour y poser le vrai like |
| **Vêtement** | `VetementPanel`, `#f59a2e` | `spotifyplus_vetements`, `_vetement_prix`, `_vetement_img` | 35 types en sous-catégories (`brand.groupe` = clé de `VET_GROUPS`, `''` = « Possédé »). ⚠ Ne JAMAIS renommer une clé de type : la fiche deviendrait orpheline. **Photos sur Google Drive**, jamais en local. Filtres + recherche par image (IA). 2 réglages d'affichage persistés : 💶 masque les prix, 🖼️ grille de photos (`'on'` = images, absent = liste) |
| **Stats** | `StatsPanel` | (lecture seule) | Collapses imbriqués, **titres en ordre alphabétique** |
| **À propos** | `VosEcoutesPanel` | — | Paramétrage · **Autorisations** · Lancement automatique · Exporter · Sauvegardes cloud · Restaurer · Réinit quota · Purger · Déconnecter |

**Autorisations externes** : `AUTH_PERMS` = **la table unique** (Drive, Drive lecture seule, YouTube, Dropbox, pCloud, notifications, géoloc, stockage persistant) ; `AuthPermsPanel` la rend en **cases à cocher**, **uniquement dans À propos**. Cocher = `ask`, décocher = `revoke` — que les 4 connexions OAuth savent faire (effacement du jeton local, puis **reload** : les panneaux `*Sync` voisins lisent leur état une seule fois). ⚠ Une permission NAVIGATEUR ne se rend pas depuis la page : case cochée et verrouillée. ⚠ **Aucun « tout autoriser » n'est possible** : une popup OAuth doit partir du même tick qu'un clic, et Google refuse `youtube` + `drive.file` ensemble. États navigateur relus au montage et sur `visibilitychange`.

**Layout** : `WebApp` (desktop, onglets en haut) · `MobileApp` (barre haut : profil + menu ⋯) · `CompactPlayer` (viewport court) · `HubHome` (accueil, grille dérivée de `TOGGLE_MODULES`) · `Home` (login).

**IA** : **8 fournisseurs en chaîne de replis** (repli AUTOMATIQUE, photo comprise → avertissement général dans `ModuleAiModal` + **badge `AiFallbackBadge`** sur le résultat concerné, alimenté par `aiMeta()` = `{ai, fb}` capturés au même instant — les deux sont des variables module-level que l'appel suivant écrase), façade unique **`aiGenerate(modId, parts, opts)`** — **seul point d'entrée des modules**. Ordre : `gemini → groq → openrouter → mistral → cerebras → zai → cohere → cloudflare`, filtré par les IA cochées pour `modId`. `AI_PROVIDERS` porte `vision` (4 seulement) et `ls2`/`url` fonction (Cloudflare = 2 champs). ⚠ Une requête avec image **saute** les fournisseurs sans vision (sinon réponse inventée). ⚠ `opts.tools` (recherche web ancrée) **n'existe que chez Gemini** → sinon `NO_GROUNDING` (≠ `NO_KEY`, que les appelants testent pour abandonner) et l'appelant rejoue sans outil. `aiAnyKey` garde l'UI, `aiLastProvider()` nomme celui qui a servi. ⚠ **Le modèle Gemini n'est PAS figé** : `GEMINI_MODELS` est essayée dans l'ordre (404/403/5xx → suivant, un 5xx rejoué une fois : panne Google), le gagnant mémorisé pour la session. Google retire ses modèles ⇒ « Erreur IA (HTTP 404) » clé pourtant valide ; une clé morte, c'est un **400**. N'y mettre que des **Flash** (les Pro sont payants depuis avril 2026).

---

## ⚠ Pièges (les relire avant de coder)

**Compilation / React**
1. **Écran figé = erreur Babel ou erreur au niveau module.** Le filet d'amorçage affiche désormais la cause sur `#boot` et purge le cache de compilation une fois, mais il ne répare RIEN dans la source : toujours vérifier que la page monte avant de commit.
2. **Babel hoisting** : tout hook avec tableau de deps (et tout `useMemo`) doit être déclaré **APRÈS** les variables qu'il liste, sinon deps `[undefined]` figées. Une `const` module-level lue plus haut = **TDZ = écran noir**. Contourner par une ref (`reloadFeedRef`, `startSyncRef`, `goRef`).
3. **Ne pas mélanger raccourci et propriété longue CSS** (`border` + `borderColor`) : React **supprime** la longue au re-render.
4. **Clé de liste = l'URI/l'id**, jamais `id + index` (remount + `React.memo` inopérant). ⚠ Ne pas passer l'index en **prop** non plus : il change pour tous les items suivant une suppression et fait échouer `React.memo`. Le numéro de rang du feed vient d'un **compteur CSS** (`.feed-list` / `.feed-row` / `.feed-num`).
5. **`StatsCollapse` démonte ses enfants à la fermeture** : rien n'est monté ni requêté tant qu'il est replié — mais tout état à préserver doit vivre **module-level** (pattern `_finance` / `_delta` / `_coll` / `_tvSync` : objet + `subs:Set` + publieur).
6. **Refs anti-closure** obligatoires dans les boucles `rAF`/`setInterval` et les écouteurs posés par élément (sinon index/filtres figés).
7. **Un nouvel onglet mobile DOIT avoir son bloc de rendu dans `MobileApp`** (sinon page noire), en plus de l'entrée dans `allOverflowTabs` — et les anciennes valeurs de `spotifyplus_active_tab`/`_view` doivent être remappées.
8. `selfHeading:true` dans `SECTION` **et** heading retiré de `MobileApp`, sinon le titre s'affiche en double.
9. **`position:fixed` est piégé par tout ancêtre `transform`** → `ReactDOM.createPortal(document.body)`. ⚠ **Réciproque** : en **plein écran NATIF**, le navigateur ne peint QUE le sous-arbre de l'élément plein écran → un portal sur `document.body` y est **invisible** (le ✨ du lecteur « ne faisait rien ») : rendre la feuille **en enfant** du lecteur, comme `YtCommentsPanel` / `YtSummarySheet`.
10. **`useImmersiveLock(active)`** sur tout overlay plein écran : sans lui, une rotation fait chuter `innerHeight`, `Shell` remplace `MobileApp` par `CompactPlayer` et **démonte l'overlay**. `MOBILE_LOCK_TABS` = les onglets qui héritent du mode compact (aujourd'hui `musique` seul).
11. **Appui long** : ref `{timer, fired}`, `fired` neutralise le `click` qui suit le relâchement ; bloquer `onContextMenu` + `userSelect`/`WebkitTouchCallout` sur mobile.
12. **Un swipe et un défilement se terminent par un `click` synthétique** → garde `moved` (8 px sur l'un ou l'autre axe) avant d'agir.
13. **Une iframe cross-origin avale tous les événements** : pour capter un geste par-dessus, poser une couche de capture transparente (et lui laisser une réserve pour les contrôles natifs). Aucun moyen de relayer un clic dedans.

**Données / stockage**
14. **`lsSet` écrit la valeur telle quelle** → un objet devient `"[object Object]"`. Toujours `JSON.stringify` soi-même, et **lire le booléen de retour** (quota plein = rien n'a été écrit : ne pas afficher un ajout fantôme).
15. **Ne jamais stocker d'images** (data URL) en localStorage ni dans le backup : quota ~5 Mo partagé par tout le Hub. Photos → Drive, médias lourds → IndexedDB dédiée.
16. **Clé de jour toujours LOCALE** : `localDayStr()` (helper canonique, `todoTodayStr` en est un alias), jamais `toISOString()` (UTC → bascule vers 01-02 h en France, donc un jour de décalage).
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
31. **Service worker** : ne cacher que `res.ok` (sinon un 404 écrase l'app), app shell en **network-first plafonné à 1,5 s** avec `{cache:'no-store'}`. Ne jamais revenir en cache-**first** pour l'app shell (les PWA installées ne recevaient plus les mises à jour) — le plafond n'en est pas un : la version fraîche est demandée à chaque lancement, elle ne bloque simplement plus l'affichage. ⚠ Notifier `matchAll()` afficherait le bandeau sur la page SUIVANTE : un téléchargement de fond survit à la page qui l'a lancé.

**Environnement d'agent**
32. **Le proxy réseau bloque de nombreux hôtes** (Google News, LinkedIn, Steam, CoinGecko, docs.google.com, YouTube, instagram…) → écrire un parsing défensif et **dire explicitement « non vérifiable côté agent »** plutôt que d'affirmer.
33. **unpkg est bloqué** : pour tester la page complète dans Chromium, servir React/Babel en local et bloquer le service worker (`serviceWorkers:'block'`), sinon il court-circuite les routes de test.

## Limites connues

- **iOS/Safari** : IndexedDB ~50 Mo, purge automatique si l'app n'est pas ouverte pendant 7 jours → privilégier Android.
- sql.js charge toute la base en RAM ; `saveDB()` réexporte **tout** à chaque écriture → purger régulièrement, ne rien y mettre de lourd.
- Pas de synchronisation multi-appareils automatique (Dropbox / Drive / pCloud manuels).
- Le réglage « Version pour ordinateur » de Chrome Android est **impossible à désactiver depuis une page web** : seulement contourné (`useIsMobile` force le layout mobile + bandeau d'aide).
