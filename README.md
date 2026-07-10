<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Nouvelles Sorties

## Aperçu
Application web PWA pour scanner les artistes Spotify suivis, détecter leurs nouvelles sorties et les stocker **localement sur l'appareil** (sql.js + IndexedDB). Aucun serveur requis. Chaque artiste est scrappé depuis sa propre date de dernier scan. L'utilisateur explore son feed de découverte, écoute les titres un par un et les valide — aucun ajout automatique en playlist.

## Fonctionnalités

### Synchronisation
- Authentification sécurisée via OAuth 2.0 PKCE (100% client-side, paramètre `state` anti-CSRF)
- Scraping des artistes suivis avec délai configurable (10 / 20 / 30s) + jitter aléatoire 1-3s
- **Dates de scraping par artiste** : chaque artiste est scrappé depuis sa propre `last_scraped_at` (défaut : 2026-03-15) — plus de date globale à choisir
- Mise à jour automatique de `last_scraped_at` dans `artists_scraped` après chaque artiste scanné — **uniquement si le scan a réussi** (un échec réseau ne fait plus perdre de sorties)
- **Les sorties publiées le jour même du dernier scan ne sont plus ratées** (cutoff arrondi au jour)
- **Un album dont une piste était déjà sortie en single n'est plus sauté** — les 20 dernières sorties de chaque artiste sont vérifiées
- Pause / reprise de la sync en cours de session — **la pause bloque vraiment tous les appels Spotify**
- **Reprise après interruption** : si l'app est fermée ou le tel éteint en plein milieu, la progression est sauvegardée dans `localStorage`. Le bouton **"↩ Reprendre la synchro en cours"** apparaît immédiatement (plus besoin de recharger la page), avec le compteur et le dernier artiste traité
- **Reprise instantanée par curseur** : la reprise repart directement sur la bonne page d'artistes au lieu de re-parcourir toute la liste depuis le début — plus de rafale de requêtes au clic "Reprendre"
- **Protection rate-limit** : dès la **première erreur 429**, la synchro s'arrête complètement (progression conservée, bouton ↩ Reprendre) et toute l'app est bloquée pendant **15 minutes minimum** (ou le Retry-After de Spotify si plus long). Le blocage **persiste après un F5 et s'applique à TOUTE l'app** (player et imports compris, pas seulement le bouton Lancer) — évite de se faire throttle en boucle quand on relance trop tôt
- **Quota 24h vérifié avant de lancer** : si les 100 artistes de la fenêtre de 24h sont déjà consommés, la synchro refuse de démarrer **sans dépenser la moindre requête** ; un artiste dont le scan échoue ne consomme plus le quota
- **Fenêtre glissante de 24h** : atteindre 100 artistes ouvre un compte à rebours de 24h ; un **countdown du temps restant avant de pouvoir relancer** s'affiche dans la carte Artistes et le panneau Synchronisation (voir section dédiée)
- **État de synchro unifié** : un seul état interne (`idle / running / paused / rl_waiting`) — plus d'états contradictoires entre pause manuelle et pause rate-limit

### Découvertes de la semaine (auto-import hebdo)
- Au login, si la playlist Spotify **"Découvertes de la semaine"** n'a pas été importée depuis 7 jours → import automatique dans le feed
- Les titres apparaissent avec le tag **Découvertes** (violet) et le sous-titre "Découvertes de la semaine"
- La playlist est recherchée sur **toutes les pages** de tes playlists, et son contenu est lu en essayant **les deux endpoints** Spotify (`/items` puis `/tracks`) pour maximiser les chances de succès
- Après un import réussi : nouvel essai dans 7 jours. **En cas d'échec** (playlist introuvable ou contenu refusé) : nouvel essai automatique dans **6 h** seulement (au lieu d'être bloqué une semaine)
- **⚠ Dépend de l'accès accordé par Spotify** : depuis la migration de février 2026, le contenu des playlists éditoriales Spotify n'est pas toujours lisible par les apps tierces. L'app le détecte, l'explique dans les logs et réessaie automatiquement (auto-réparant si Spotify rouvre l'accès)

### Stockage local (sql.js + IndexedDB)
- Base SQLite WebAssembly chargée au démarrage depuis IndexedDB (clé `spotifyplus_db`)
- Schéma minimal en 3 tables : `tracks`, `artists_scraped`, `stats`
- Sauvegarde binaire dans IndexedDB après chaque artiste scrapé, après chaque écoute, à chaque fin de synchro **et quand l'app passe en arrière-plan** (sécurité mobile)
- Sauvegardes **sérialisées** : jamais deux écritures IndexedDB en parallèle, aucune donnée perdue en cas d'actions simultanées
- **Persistance demandée au navigateur** (`navigator.storage.persist()`) — réduit le risque d'éviction des données, surtout sur iOS
- **Garde multi-onglets** : si l'app est ouverte dans deux onglets, un bandeau d'avertissement s'affiche (les sauvegardes s'écraseraient mutuellement)
- **Bouton Purger les écoutes** : supprime **tous** les titres écoutés (likés compris, ce qui vide aussi l'Historique et l'onglet Likés des titres écoutés) — libère de la place sur le long terme. Le **% de titres likés** n'est PAS affecté (compteur indépendant dans la table `stats`)

### Feed de découverte
- File d'attente ordonnée par ID (les plus anciens en premier), jusqu'à **1000 titres** affichés
- **Indicateur titres masqués** : si plus de 1000 titres en DB, un bandeau orange avertit du nombre caché
- Barres égaliseur animées sur le titre en cours de lecture
- Marquage automatique comme écouté quand le titre se termine → disparition animée du feed
- **Auto-avance** : quand un titre se termine, le suivant dans le feed est lancé automatiquement — **sans voler la lecture** : lancer manuellement un autre titre (ou stopper la musique) en plein milieu ne déclenche plus l'auto-avance
- Navigation dans le feed via les flèches ← → de la barre du bas
- **Bouton × par titre** : marque le titre **comme écouté** et le retire du feed → il apparaît dans l'**Historique** et compte dans les **stats d'écoute** (même effet que « Suivant »)
- **↩ Annuler (undo)** : après un retrait (croix rouge ou swipe gauche), un **toast « Annuler » s'affiche 5 secondes** pour rattraper un clic accidentel — le titre revient dans le feed et les stats sont ré-ajustées
- **Bouton ❤ par titre** : like/unlike directement depuis le feed (synchronisé Spotify + DB locale)
- **Filtre** par type : Tous / Singles / Albums / Découvertes
- **Filtre artiste** : champ texte (insensible à la casse) combinable avec le filtre type et le tri
- **⏰ Snooze** : bouton « réécouter plus tard » sur chaque titre — le renvoie en fin de liste (persistant)
- **Filtre genre** : sélecteur alimenté par les genres des artistes scannés (top 30 par fréquence) — filtre les titres via les métadonnées artiste
- **🔎 Filtres et tris sur toute la base** : le filtre type, le filtre artiste et les tris **balaient l'intégralité des titres en attente, pas seulement les 1000 affichés** — un Single, un titre ancien ou un artiste situé au-delà du cap de 1000 apparaît bien dans les résultats (filtrage + tri effectués en base de données)
- **Bouton 🗑 reset** : réinitialise tous les filtres en un clic (visible uniquement si un filtre est actif)
- **Tri** : ordre d'ajout / date de sortie ↑ (du plus ancien au plus récent) / artiste A→Z
- **Bannières de date** (mobile) : séparateur "📅 20 juin 2026" entre chaque jour de sortie — repère visuel affiché en tri "Ordre d'ajout" et "Date sortie ↑" (pas en tri artiste)
- **Navigation filtrée** : next/prev et auto-avance respectent l'ordre du feed filtré
- **Swipe gauche** (mobile) : marque le titre écouté et le retire (→ Historique + stats) · **Swipe droite** : piste précédente

### Player
- Barre de lecture en temps réel (poll toutes les 5s — **suspendu quand l'onglet est caché**, reprise immédiate au retour : économise des centaines de requêtes/heure)
- Boutons **précédent / play-pause / suivant** branchés sur le feed de nouveautés
- **Clic next → démarre à 25%** : le titre suivant commence automatiquement à 25% de sa durée
- **Bouton loop** : répète le titre en cours (`repeat?state=track`) — désactivé par défaut
- **Barre de progression cliquable et draggable** — clic ou glissement pour se déplacer dans le titre
- Compteur de position dans le feed (ex: `3 / 25`)

### Stats
- Section dédiée (onglet **Stats**, juste avant **À propos**) regroupant **tous les chiffres et graphiques**
- Sections **repliables** (collapse) : **🎵 Musiques**, **✅ To do**, **🎬 Stats Film**, **🗺️ Stats Maps**, **📈 Graphique** et **📊 Stats avancées**
- **🎵 Musiques** — compteurs incrémentaux depuis la table `stats` : restantes / **temps d'écoute restant (HH:MM)** / ce mois-ci / cette année / depuis toujours
- **⌛ Temps total écouté** : `SUM(duration_ms) WHERE listened=1` + durée du titre en cours — affiché en `Xh Ymin`
- **❤ % de titres likés** : pourcentage des écoutes likées **via l'app** (`total_liked / écoutes all-time`) — compteur persistant dans la table `stats`, **non affecté par la purge** et indépendant des titres likés sur Spotify avant/hors de l'app
- **✅ To do** — nombre de **tâches terminées** (validées) : tâches de la journée / du mois / de l'année, plus **⭐ Tâches compliquées** = total des tâches **favorites** effectuées. Une tâche compte comme terminée quand on la supprime (×) ou qu'on valide (✓) une tâche Quotidien
- **🎬 Stats Film** — **films vus**, **épisodes de série vus** (+ nombre de séries entamées), **temps passé devant les films** et **devant les séries**, **vidéos & temps YouTube** (chaînes/playlists suivies) et un décompte **mangas / animés** (titres taggés) — calculées entièrement depuis le cache local TV Time (aucune requête API)
- **🗺️ Stats Maps** — **distance parcourue** aujourd'hui / ce mois-ci / cette année / depuis toujours (+ nombre de trajets et de jours suivis) et **🥇 mode de déplacement préféré** — calculées depuis les trajets Google Timeline importés (100 % local, aucune requête)
- **📈 Graphique** — deux histogrammes sur **14 jours** (dessinés sans librairie externe) : **écoutes par jour** et **tâches terminées par jour**
- **📊 Stats avancées** — top 5 artistes écoutés, répartition Singles/Albums/Découvertes, moyenne d'écoutes/jour sur 30 jours (calculées sur les titres non purgés)

### À propos
- Section dédiée (onglet **À propos**) regroupant les **actions de données** et la version
- **↥ Restaurer mes données** (en premier) : réimporte une sauvegarde JSON exportée (complète **ou** partielle) — les dates de scan des artistes sont fusionnées (jamais régressées), les stats fusionnées prudemment, les to do / rappels / TV Time / Maps / coffre MDP remplacés par la sauvegarde s'ils y figurent (une copie de secours du coffre actuel est conservée), et l'**historique local des prix Finance fusionné** (jamais écrasé)
- **↧ Exporter mes données** : section **repliable** (fermée par défaut) proposant **10 exports JSON séparés** — **Tous** (sauvegarde complète), **Artistes** (dates de scan + compteurs), **TV Time** (suivi + clé API TMDB), **To do**, **Maps**, **📈 Finance** (historique local des prix : crypto, indices, actions, matières, EUR/USD), **Mot de passe** (coffre **chiffré**, déchiffrable uniquement avec le mot de passe maître), **Remember**, **Stats** et **⚙️ Paramétrage** (modules activés/désactivés) — pour ne rien perdre (les données ne vivent que sur cet appareil)
- **⚙️ Paramétrage des modules** : section **repliable** avec un **interrupteur par module** (Historique, Artistes, Actu, Météo, Finance, TV Time, To do, Maps, Mot de passe, Remember, Stats) — activer/désactiver un module **fait apparaître/disparaître son onglet** en direct (desktop et mobile). Le réglage est inclus dans l'export/import (et la sync Dropbox/Drive)
- **💾 Proposition de sauvegarde hebdomadaire** : une fois par semaine, au lancement, l'app propose (via une alerte) de télécharger une sauvegarde — uniquement si tu as des données et qu'aucune sauvegarde **complète** n'a eu lieu depuis 7 jours (les exports partiels ne comptent pas)
- **☁︎ Sync Dropbox (optionnelle)** : connexion Dropbox (OAuth 2.0 PKCE) pour sauvegarder la **sauvegarde complète (« Tous »)** dans ton Dropbox — chaque sauvegarde **écrase la version précédente** sur Dropbox. Accessible depuis plusieurs appareils. La clé d'app Dropbox est renseignée dans le code (App folder dédié, aucun secret — OAuth PKCE)
- **△ Sync Google Drive (optionnelle)** : même principe que Dropbox, juste en dessous — connexion Google (OAuth 2.0 implicite, scopes `drive.file` pour la sauvegarde + `drive.readonly` en lecture seule pour l'onglet **Mes Actifs** de Finance) pour sauvegarder la **sauvegarde complète (« Tous »)** dans ton Drive, en **écrasant la version précédente**. Le token Google expire au bout d'~1h : le bouton repasse alors en « Connecter » (reconnexion en 1 clic). Nécessite un **ID client OAuth** créé sur console.cloud.google.com et collé dans `GDRIVE_CLIENT_ID` (tant qu'il est vide, la section affiche « non configurée »)
- Réinitialisation automatique des compteurs mois/année au démarrage si la période a changé (basée sur le mois **local**, plus l'UTC)
- Accessible sur mobile via l'onglet **À propos** (dernier du menu « ⋯ », en rouge)
- **Numéro de version** affiché en gris sous le bouton « Purger les écoutes » (actuellement `Version 3.5.5`) — basé sur le nombre de commits du projet (format `MAJ.MIN.U` : derniers chiffres = patch/minor, le reste = major ; ex. 278 commits → `2.7.8`, 1001 → `10.0.1`)

### Actu
- Section **Actu** dédiée (titre en bleu-indigo), **entre Artistes et Météo** — onglet en haut sur desktop, dans le menu « ⋯ » sur mobile. Agrégateur d'actualités **sans backend ni clé**, cache local (30 min) + bouton **↻ Actualiser**
- **📰 Techno · IA · Science** : les tops [Hacker News](https://news.ycombinator.com/) (titre + score + lien)
- **🇫🇷 Presse FR** : actus IA / science / technologie via le flux Google News
- **🔥 Tendances du jour · France** : top 10 des recherches tendance Google Trends *(les tendances Twitter/X ne sont plus accessibles gratuitement — Google Trends en substitut)*
- **🔓 Dernières fuites de données** : dernières entrées de [bonjourlafuite.eu.org](https://bonjourlafuite.eu.org/)

### Météo
- Section **Météo** dédiée (titre en bleu) — **onglet en haut** sur desktop, **onglet propre** dans le menu « ⋯ » sur mobile
- **Bouton Light / Full** en haut à droite (comme la section Finance) : **Light = 3 jours** (aujourd'hui + 2, par défaut), **Full = 7 jours** (tuiles plus compactes)
- Prévisions pour **4 lieux** : **Voisins-le-Bretonneux**, **Massy**, **Boulogne-Billancourt**, puis **votre position actuelle** (géolocalisation du navigateur — affiche « Position non autorisée » si l'accès est refusé)
- Le dernier lieu s'affiche **« Ma position (ville) »**, la ville étant détectée à partir des coordonnées GPS (reverse-geocoding via [BigDataCloud](https://www.bigdatacloud.com/), gratuit sans clé — repli sur « Ma position » si indisponible)
- Chaque jour : icône météo + température max (en bleu) et min
- **Clic sur un jour** → fiche détaillée : température ressentie, probabilité et cumul de pluie, heures de pluie, vent max + rafales + direction, indice UV, lever/coucher du soleil, et le **détail heure par heure** (température, proba de pluie, météo)
- Données météo via **[Open-Meteo](https://open-meteo.com/)**, API gratuite sans clé (issue du repo [public-apis](https://github.com/public-apis/public-apis)) — aucun backend, appel direct côté client

### Finance
- Section **Finance** dédiée (titre en cyan) — desktop (onglet en haut) et menu « ⋯ » sur mobile
- Données live ; chaque sous-section affiche le taux **EUR/USD** (via **Twelve Data**, repli [Frankfurter](https://www.frankfurter.app/) / BCE)
- **Boutons Light / Full / Mes Actifs** (Light par défaut) : en mode **Light** seules les valeurs essentielles sont affichées (**Bitcoin, PEPE, Or, Pétrole, S&P 500, NASDAQ, NVIDIA, Take-Two, EUR/USD**) ; le mode **Full** affiche tout ; le mode **Mes Actifs** affiche le patrimoine perso (voir ci-dessous). **Revient toujours en Light à chaque reconnexion** (choix non mémorisé).
- **💰 Mes Actifs** (3e onglet, accent doré) : tableau de bord du **patrimoine perso** lu directement depuis le **Google Sheets « Finance » de ton Drive** (si Google Drive est connecté) — l'app cherche un **dossier « finance »**, y trouve le tableur et **exporte sa 1re feuille (« Actif ») en CSV** via l'API Drive. Affiche : **patrimoine net/brut** (avec variation mensuelle et annuelle) + **courbe d'évolution** (séries Net / Brut / Hors immo, périodes 1 an / Tout), répartition physique/numérique, **immobilier** (brut, net, trésorerie syndic), **budget du dernier mois** (revenus, salaire, dépenses, économie, taux d'épargne) avec la **règle 50/30/20**, **comptes & plateformes** (Livret A, Binance, eToro, CPF… avec barres de proportion), **actifs physiques & collections** (voiture, ordi, métaux, Magic, Pokémon…), **pyramide patrimoniale 10/80/5/5** (matelas de sécurité, immobilier, ETF, crypto, gold, exotique), **liberté financière** (progression capital actuel → cible, épargne lissée, gain mensuel moyen, années restantes) et les **totaux annuels** (salaire / dépenses / économie par année). Résultat **mis en cache localement** (affichage instantané et hors-ligne, TTL 6 h) + bouton **↻ Actualiser**. Nécessite une **reconnexion Google Drive** la première fois (nouveau consentement : lecture seule du Drive)
- **Crypto** : Bitcoin, Ethereum, Solana, TAO, XRP, PEPE (prix USD + variation 24h) via **[CoinGecko](https://www.coingecko.com/en/api)**
- **Matières premières** : Pétrole (WTI) et **Sucre** via **[Alpha Vantage](https://www.alphavantage.co/)** (endpoints matière première dédiés `WTI`/`SUGAR`, CORS natif, vrais prix mondiaux avec variation) ; Or et Argent via **[gold-api.com](https://gold-api.com/)**. Section affichée en bas, entre Stock picking et Monnaie
- **Indices** : **NASDAQ-100, S&P 500, CAC 40** — désormais les **vrais indices** (plus d'ETF). Aucune API gratuite à CORS natif ne les expose au navigateur ; une **GitHub Action** planifiée récupère les cours **côté serveur** (toutes les 2 h, jours ouvrés) via [Stooq](https://stooq.com/) (repli [Yahoo Finance](https://finance.yahoo.com/)) et publie un fichier `data/indices.json` que l'app lit en *same-origin* (donc sans proxy CORS ni clé). Données de fin de journée / différé, rafraîchies plusieurs fois par jour
- **Chargement à la demande** : en mode Light seules les valeurs Light sont récupérées ; les valeurs Full ne sont chargées qu'au premier passage en mode Full
- **Chargement à l'ouverture de Finance** : les APIs boursières ne sont appelées **que lorsqu'on ouvre la section/onglet Finance** (plus au login) — les cours commencent alors à se charger (valeurs Light en priorité) avec un **indicateur de chargement** clair pendant la récupération (les appels boursiers sont espacés de ~8 s pour respecter la limite gratuite de Twelve Data)
- **Stock picking** (Full) : NVIDIA, Take-Two (TTWO), Google (GOOGL), Microsoft (MSFT), Amazon (AMZN), Tesla (TSLA) via **Twelve Data** (clé) + repli **[Stooq](https://stooq.com/)**
- **📈 Graphique au clic** : **cliquer sur n'importe quelle ligne** (crypto, indice, action, or/argent, pétrole, sucre, EUR/USD) ouvre une **modal avec la courbe historique du prix** (SVG maison, aucune lib) — sélecteur de période (24h/7j/1m/1a pour la crypto, **7j**/1m/3m/1a pour le reste — **ouverture sur la semaine** —, 1a/5a/10a pour le sucre), **prix affichés sur l'axe Y**, variation sur la période, min/max, et **crosshair au survol/glisser** (date + valeur). Sources : CoinGecko (crypto), Frankfurter (EUR/USD), Stooq (indices/actions/métaux), Alpha Vantage (pétrole/sucre) — historiques mis en cache pour la session. **Repli hors-ligne** : l'app **échantillonne automatiquement les prix affichés** (1 point max / 30 min par valeur, stocké localement) — si la source distante ne répond pas, la courbe est **reconstituée depuis cet historique local** (bandeau ⚠ affiché) et se densifie au fil des visites. Cet historique est inclus dans la sauvegarde complète (« Tous », Dropbox/Drive) et a son **export dédié 📈 Finance** dans À propos (fusionné, jamais écrasé, à la restauration)

### TV Time
- Section **TV Time** dédiée (titre en vert-cyan) — onglet **au-dessus de To do** (desktop et menu « ⋯ » mobile)
- **Suivi personnel de tes séries et films** via l'API **[TMDB](https://www.themoviedb.org/) v3** (gratuite, **sans plafond journalier** — simple limite de ~50 requêtes/seconde, largement suffisante)
- **Clé API personnelle requise** : crée un compte gratuit sur themoviedb.org, génère une clé API v3 dans *Paramètres → API* et colle-la dans la section (stockée uniquement sur ton appareil ; bouton ⚙ pour la changer). Sans clé, aucune requête ne part
- **Recherche** films + séries (une seule requête pour les deux) avec affiche, année et type — ajoute chaque résultat en **📌 À voir**, **▶ En cours** ou **✓ Vu**
- **« ▼ Voir plus de résultats »** : la recherche affiche 8 résultats à la fois, et le bouton en charge 8 de plus — en allant chercher **les pages suivantes** de TMDB à la demande, pour retrouver un titre qui n'apparaît pas dans les 8 premiers
- **Filtre du type recherché** : sélecteur **Les deux / 📺 Séries / 🎬 Films** sous la barre de recherche (« Les deux » par défaut) — limite les résultats aux films ou aux séries ; changer de type avec des résultats affichés relance la recherche automatiquement
- **★ Badge « déjà suivi »** dans les résultats : une petite étoile signale **tout titre déjà présent dans tes listes, quel que soit son statut** (verte « Déjà vu », vert-cyan « En cours » ou ambre « À voir »), films comme séries — plus de doublon ajouté par erreur
- **Clic sur l'affiche d'un résultat de recherche → fiche détaillée**, exactement comme pour un titre déjà enregistré : pour une **série**, la progression saison par saison ; pour un **film**, le synopsis, l'année et la durée. Le titre n'est ajouté à tes listes qu'au moment où tu choisis un statut (📌/▶/✓) ou coches un épisode dans la fiche
- **▶️ Chaînes & playlists YouTube (bloc séparé)** : sous la recherche films/séries, un **second widget** permet d'ajouter une **chaîne ou une playlist YouTube en collant son lien** (`/@handle`, `/channel/…`, `/playlist?list=…`, etc.). Nécessite une **clé API YouTube Data v3** (gratuite, créée sur console.cloud.google.com, collée via le bouton ⚙ — stockée uniquement sur ton appareil). Les vidéos sont récupérées et **regroupées en « saisons » par année** (Saison 2019, 2020, …) : clique la miniature pour ouvrir la fiche, déplie une année et **coche chaque vidéo vue** (ou toute l'année d'un coup), bouton ↻ pour récupérer les nouvelles vidéos. Les vidéos vues et leur durée **alimentent les statistiques TV Time**. **YouTube a son PROPRE onglet** dans le filtre (▶️ YT) : cliquer dessus affiche **tout le contenu YouTube** (ses propres sections En cours / À voir / Vus, en rouge), distinct des films/séries
- **Filtre Films / Séries / YouTube** : sélecteur **Tous · N / 📺 Séries · N / 🎬 Films · N / ▶️ YT · N** sous la recherche — chaque onglet affiche son contenu (les onglets Tous/Séries/Films montrent les films & séries, l'onglet YT montre les chaînes & playlists YouTube), et **mémorise ton choix** d'une visite à l'autre
- **Filtre par nom + tri des listes** : un champ texte filtre tes listes par titre, et un sélecteur de tri (**Ajout récent** (défaut), Ajout ancien, **Nom A→Z**, **Sortie récente**, Sortie ancienne) réordonne En cours / À voir / Vus — le tri choisi est mémorisé
- **5 sections toutes repliables** (clic sur le titre, chevron ▶) — dans l'ordre : En cours, En pause, À voir, Prochaines sorties, Vus. Au lancement, **seule « En cours » est dépliée** (les autres sont repliées)
- **▶ En cours** : progression par série (`5/20 ép. · prochain S2E5`) avec boutons **− / ＋** pour compter les épisodes vus, **⏸** pour **mettre une série en pause** (arrêter de la regarder sans la terminer), **✓** pour marquer la série terminée (tout vu) ; les **films** ont en plus un bouton **📌** pour les repasser en « À voir »
- **⏸ En pause** : les séries dont tu as **suspendu le visionnage** — chacune a **▶ Reprendre le visionnage** (retour dans « En cours ») et **⏹ Arrêter le visionnage** (la série passe dans « Vus » **en gardant ta progression telle quelle** — les épisodes non vus ne sont PAS validés automatiquement, contrairement au ✓ « tout vu »)
- **↩ Retour en arrière** : un bouton en bas de la section TV Time **annule la dernière action** (changement de statut, coche d'épisode, ajout, suppression, …) — tu peux revenir plusieurs crans en arrière
- **Fiche au clic sur l'affiche** (série dans les listes **ou n'importe quel résultat de recherche**) : popup avec la progression **décortiquée saison par saison** (barre + compteur `x/y` + coche verte par saison), le **prochain épisode à regarder** (`S02 | E05`, gros bouton ✓ pour valider un épisode), le changement de statut, et les **épisodes spéciaux suivables à part — jamais comptés** : ligne grisée dépliable avec ses propres coches (une coche « tout » + **une coche par épisode INDÉPENDANTE** — cocher un spécial ne coche pas les précédents, contrairement aux saisons normales), mais pas besoin des hors-série pour atteindre 100 % ni pour avoir « vu » la série en entier
- **🍥 Label « Manga / animé »** : un bouton dans la fiche permet de **taguer un film ou une série comme manga**. Le label n'apparaît pas dans les listes, mais alimente **deux cartes de stats** (« Mangas / animés » et « Temps mangas ») dans la section 🎬 Films des statistiques
- **Passage automatique en « ✓ Vu »** : dès que tous les épisodes normaux sont cochés (les spéciaux ne comptent pas), la série bascule d'elle-même dans la section Vus — et repasse « En cours » si on décoche un épisode
- **Saisons dépliables épisode par épisode** : clique sur une saison de la fiche pour dérouler **la liste de ses épisodes façon TV Time** — vignette de l'épisode, numéro `S02 | E01`, titre, et **coche verte par épisode** (cocher = vu jusqu'à cet épisode inclus). Les épisodes d'une saison ne sont récupérés **qu'au premier dépliage** (1 requête), puis mis en cache 7 jours
- **📌 À voir** : ta watchlist — passe un titre en cours (▶), marque-le vu (✓) ou retire-le (×)
- **📅 Prochaines sorties** : les prochains épisodes annoncés de tes séries suivies (`S3E1 « titre » · date · dans X j`), triés par date, actualisés automatiquement au plus **1×/24h** + bouton ↻ manuel
- **✓ Vus** : historique de tout ce que tu as terminé (avec retour possible en « En cours » pour un re-visionnage)
- **Économie de requêtes maximale** : toutes les infos TMDB (affiches, durées, saisons, nombre d'épisodes, prochain épisode) sont **mises en cache localement à l'ajout** — compter tes épisodes, consulter tes listes et les stats ne redemande **jamais rien** à l'API ; seules les séries suivies non terminées sont rafraîchies (1 requête/série, max 1×/jour)
- Données incluses dans l'**export/restauration** de sauvegarde (et la sync Dropbox)
- Alimente le collapse **🎬 Stats Film** de l'onglet À propos : **films vus**, **épisodes vus** (+ nombre de séries), **temps passé devant les films** et **devant les séries** (épisodes vus × durée moyenne d'un épisode)

### To do
- Section **To do** dédiée (titre en vert) — desktop (onglet en haut) et onglet propre dans le menu « ⋯ » sur mobile
- Ajout / suppression de tâches, classées par échéance via un **carrousel** : **Quotidien**, **Aujourd'hui**, **Dans la semaine**, **Dans le mois**, **Dans l'année**, **À faire un jour**
- **⭐ Étoile** sur chaque tâche pour la marquer comme **favorite** (« compliquée ») — les favorites effectuées alimentent la stat **Tâches compliquées**
- **Quotidien** : liste de tâches récurrentes qui **repartent chaque jour à 00h**. Le bouton **× vaut « valider pour aujourd'hui »** (il devient ✓) : la tâche est comptée comme terminée et grisée jusqu'à minuit, puis redevient active le lendemain. Pour la sortir du Quotidien, la **déplacer** avec les flèches ‹ › vers Aujourd'hui
- Flèches ‹ › (ou points indicateurs) pour parcourir les échéances ; chaque tâche peut être **déplacée** d'un cran d'échéance, marquée **favorite** ou **supprimée** (× = terminée)
- Tâches mémorisées localement (aucun backend)

### Maps — Mes trajets (visuel type « Vos trajets » Google Maps)
- Section **Maps** dédiée (titre en jaune) — onglet sous To do (desktop et menu « ⋯ » mobile)
- **Carte interactive** (Leaflet auto-hébergé + tuiles OpenStreetMap assombries pour le thème dark) affichant les **trajets d'une journée** : tracés colorés par mode de déplacement (🚶 à pied bleu, 🚗 voiture jaune, 🚆 transports violet, 🚴 vélo vert, 🏃 course rose, ✈️ avion…), **lieux visités** en marqueurs jaunes — popup au clic (mode, distance, horaires)
- **Timeline horodatée** sous la carte, comme dans Google Maps : chaque trajet (icône, mode, distance, heure de début – fin, durée) et chaque lieu visité (nom, horaires) dans l'ordre chronologique
- **Navigation par jour** : ‹ › sautent au jour renseigné précédent/suivant, sélecteur de date libre, bouton « Auj. » — ouvre par défaut sur aujourd'hui (ou le dernier jour renseigné)
- **Résumé du jour** : distance totale, temps de déplacement, nombre de trajets et de lieux
- **⚠ Aucun tracking par l'app** : Spotify+ ne trace jamais la position. Les trajets viennent de **Google Maps**, via l'**export officiel de la Timeline** à importer (bouton 📥) : Google ne fournit aucune API publique et les trajets sont stockés sur le téléphone depuis fin 2024 — un scraping direct est impossible depuis une app statique (auth Google + CORS)
- **Deux formats d'export acceptés** : export sur appareil de l'appli Google Maps (`location-history.json` / `Timeline.json` — Vos trajets → ⚙ → Exporter) et ancien **Google Takeout** « Historique des positions » (`Semantic Location History/AAAA_MOIS.json`) — mode d'emploi détaillé dans la section repliable « ❓ Comment récupérer mes trajets »
- **Import incrémental** : les jours contenus dans le fichier remplacent les mêmes jours déjà présents, les autres sont conservés — réimporter régulièrement ne perd rien
- Données en `localStorage` (tracés simplifiés automatiquement pour tenir dans le quota), incluses dans l'**export 🗺️ Maps** (À propos) et la **sauvegarde Dropbox**

### Mot de Passe
- Section **Mot de Passe** dédiée (titre en ambre) — desktop (onglet en haut) et onglet propre dans le menu « ⋯ » sur mobile
- **Les URL sont assainies avant affichage** : seuls les liens `http(s)` sont cliquables — un lien `javascript:` d'une sauvegarde importée ne peut pas exécuter de code (protection contre le self-XSS)
- **Coffre chiffré par un mot de passe maître** (AES-GCM 256 + PBKDF2 via la Web Crypto API native) : le localStorage ne contient que des données chiffrées, le mot de passe maître n'est jamais stocké
- **Ajout / suppression** d'entrées avec **identifiant, mot de passe, URL et commentaire** ; le formulaire d'ajout est **repliable**, et un **champ de recherche** filtre les entrées (identifiant / URL / commentaire)
- Mot de passe **masqué par défaut** (afficher/masquer) + bouton **copier**, lien direct vers l'URL
- **Verrouillage automatique** au rechargement de l'app + bouton « Verrouiller »
- **Export / Import** d'une **sauvegarde chiffrée** (fichier `.json`) pour ne pas tout perdre en cas de perte de l'appareil et restaurer sur un autre
- ⚠️ Le chiffrement protège contre une **fuite passive** du stockage (sauvegarde/dump volé), **pas** contre un logiciel malveillant déjà actif sur l'appareil. **Mot de passe maître oublié = données irrécupérables** (aucun backend, aucune réinitialisation possible)

### Remember
- Section **Remember** dédiée (titre en orange) — desktop (onglet en haut) et onglet propre dans le menu « ⋯ » sur mobile
- Sections fixes (repliables) : **Administratif** (Déclaration d'impôts, Carte d'identité, Passeport, Carte européenne), **Logement** (AG, Détecteur de fumée, Nettoyer hotte cuisine, Nettoyer VMC, Nettoyer aérations fenêtres), **Véhicule** (Contrôle technique, Assurance auto, Carte navigo, Permis de conduire), **Médecin** (Généraliste, Dentiste, Dépistage, Check Up complet, ORL, Ophtalmologiste, Dermatologue, Ostéopathe, Kiné, Mutuelle), **Travail** (Entretien annuel d'évaluation, Visite médicale du travail), **Finance** (Faire ses comptes, DCA), **Sport** (Licence Course à pied), **Anniversaire** (Papa, Maman, Fête des pères, Fête des mères, Cécile), **Autre** (Lunettes, Carte restaurant expiration)
- **Rappels personnalisés** : ajoute ton propre rappel (libellé + date)
- Pour chaque rappel, un badge indique « à définir », « en retard », « aujourd'hui » ou « dans X jours » (coloré selon l'urgence)
- **Notification à l'ouverture de l'app** à 1 mois, 7 jours et 1 jour avant l'échéance, le jour même, ainsi que pour les rappels en retard (une fois par jour) + bandeau des rappels échus
- **Ajout automatique au To do** : dès qu'un rappel arrive à **3 jours ou moins** de son échéance (ou est en retard), il est ajouté automatiquement dans le carrousel **« Aujourd'hui »** du To do (préfixé 🔔). Chaque échéance n'est ajoutée qu'une seule fois — modifier la date d'un rappel recrée l'ajout pour la nouvelle échéance
- Dates mémorisées localement (aucun backend)

### Quota de scraping : 100 artistes par fenêtre glissante de 24h
- Limité à **100 artistes toutes les 24 heures** (et non par jour calendaire) : atteindre 100 démarre un compteur de 24h, et la prochaine synchro est refusée jusqu'à son expiration
- Compteur affiché dans la carte **Artistes** (`X/100 sur 24h`)
- Persisté dans `localStorage` (`spotifyplus_daily_scrapings` = `{ count, until }`) — le compteur repart à 0 dès que les 24h écoulées
- **Date et compte à rebours** avant de pouvoir relancer, affichés à deux endroits : directement sous le compteur de la carte **Artistes** (`SCRAPING EN ATTENTE`) et dans le panneau **Synchronisation** — texte « ⏳ Quota de 100 artistes atteint — Prochaine synchro le 19 juin à 18:10 (dans X h Y min) », rafraîchi chaque seconde
- Boutons Lancer/Reprendre désactivés tant que la fenêtre est active
- **Bouton 🔄 Réinitialiser le quota 24h** dans l'onglet **À propos** (au-dessus de Purger) : remet le compteur à `0/100` et débloque une synchro immédiatement, sans attendre l'expiration des 24h (avec confirmation)
- Notification navigateur de fin de session (compatible mobile via le service worker)
- **"Temps total de la session"** dans le panneau NextCall : temps restant pour finir les 100 artistes de la fenêtre (`(100 − scrapés) × délai moyen`)
- **"Temps total restant"** dans le panneau NextCall : ETA pour scraper **tous** les artistes restants de la synchro (non plafonnée aux 100/24h)

### Titres likés (onglet ❤ Likés)
- Onglet **❤ Likés** sur mobile (entre "À écouter" et "Historique")
- Like/unlike depuis le **player mobile**, depuis le **feed** (bouton ❤ sur chaque titre), ou depuis l'onglet Likés
- **Sync initiale au login** : l'app vérifie automatiquement les likes Spotify pour les 300 premiers titres du feed (`/me/library/contains`, par lots de 40) — les titres likés avant cette session apparaissent directement dans l'onglet (1× par 24h max)
- La liste est persistée dans la table `tracks` (colonne `liked`) et chargée au démarrage
- Unliker retire le like sur Spotify ET met à jour la base locale
- **⚠ Si tu étais déjà connecté avant la mise à jour** : les likes nécessitent désormais les permissions Spotify `user-library-read/modify` — déconnecte-toi puis reconnecte-toi une fois pour les accorder (l'app affiche une alerte si besoin)

### Historique (onglet Historique)
- Liste des **derniers titres écoutés** non purgés, le **plus récent en haut**
- Chaque ligne affiche le titre, l'artiste, l'horodatage relatif de l'écoute (« il y a 5 min », « hier »…) et un bouton **réécouter**
- Desktop : **onglet Historique** en haut · Mobile : onglet **Historique**
- L'historique est vidé par le bouton **Purger les écoutes**

### Artistes (section / onglet Artistes)
- **Liste de tous les artistes scannés** lors des synchros, avec leurs métadonnées récupérées de Spotify (sans aucune requête supplémentaire)
- Chaque artiste affiche : sa **pochette**, son **nom**, son **identifiant Spotify**, la **date du dernier scrapping** (relative), ses **genres**, sa **popularité** (★ 0-100), son nombre d'**abonnés**, son **nombre de scans**, le **total de titres ajoutés** et le **nombre de sorties trouvées au dernier scan** — plus un badge de statut (**✓ OK** / **⏳ Partiel** / **⚠ Erreur**) et un lien ↗ vers Spotify
- Un artiste apparaît dès que ses albums ont été lus, **même si un rate-limit (429) interrompt le scan ensuite** : il s'affiche alors en **⏳ Partiel** (ses titres déjà trouvés sont ajoutés, et il sera repris au prochain scan sans rien rater)
- **Filtres** comme le feed : recherche par nom ou id, filtre par statut (Tous / OK / **Partiel** / Erreur), tri (scan récent, **scan ancien**, nom A→Z, popularité, titres ajoutés, nombre de scans)
- Desktop : bouton **Artistes** dans la barre du haut (à côté de Scrapping) · Mobile : onglet **Artistes**

### Notifications
- **Fin de session** (100 artistes/jour atteints) : notification navigateur envoyée automatiquement (permission demandée si nécessaire)
- **Scraping de nouveau disponible** : quand le quota 24h ou un blocage rate-limit (429) expire, une notification Chrome prévient que tu peux relancer une synchro

### PWA
- Installable sur écran d'accueil Android (Chrome) — bouton "Ajouter à l'écran d'accueil"
- `manifest.json` + `service-worker.js` — **network-first** : les mises à jour de l'app sont reçues dès qu'on est en ligne, le cache ne sert qu'en mode hors-ligne (et **seules les réponses valides sont mises en cache** — une page d'erreur ne remplace plus l'app hors-ligne)

### Player mobile (50vh)
- Quand une musique joue, le bas de l'écran affiche un **player plein format (50% de hauteur)**
- Pochette + titre + artiste + position dans le feed (`3 / 25`)
- **Barre de progression draggable** (touch) pour se déplacer dans le titre
- Bouton **❤️ like/unlike** — synchronisé avec les titres likés Spotify
- Boutons **précédent / play-pause / suivant** dans le feed
- Bouton **loop / auto-avance** : alterne entre répéter le titre en cours et passer automatiquement au suivant
- Bouton **+1:00** : avance de 1 minute dans le titre en cours

### Interface
- **Desktop** : sidebar gauche (Lancer la synchro / logs / countdown) + contenu central. **Toutes les sections sont des onglets en haut**, à côté de Scrapping / Artistes (Historique, Actu, Météo, Finance, TV Time, To do, Maps, Mot de passe, Remember, Stats, À propos) — une seule section affichée à la fois (plus de colonne de droite)
- **Mobile** : 3 onglets principaux (Scrapping / En attente / ❤ Likés) + un menu **« ⋯ »** regroupant les autres sections. Les libellés du menu suivent un **dégradé arc-en-ciel** (violet → indigo → bleu → cyan → vert-cyan → vert → jaune → ambre → orange → rouge), le rouge final rejoignant le bouton **Déconnecter**
- **Cohérence des couleurs** : le titre/accent de chaque section reprend **exactement la couleur de son onglet dans le menu « ⋯ »** (Finance cyan, TV Time vert-cyan, To do vert, Maps jaune, Mot de passe ambre, Remember orange, Historique/Stats/À propos dans les tons finaux) — le contenu et son entrée de menu partagent la même identité visuelle
- **Mode compact (split-screen)** : quand l'app est placée dans une petite fenêtre (ex. multi-fenêtres sur téléphone, ton projet en bas et une autre app en haut), l'interface se réduit automatiquement à **une barre de contrôles** : titre en cours + **précédent / lecture-pause / suivant / ❤ like**
- Logs en temps réel pendant la sync
- Countdown avant le prochain appel Spotify

## Technologies
- React 18.3.1 (CDN) + Babel Standalone 7.29.7 — **versions épinglées + SRI** (un CDN compromis ne peut plus injecter de code)
- **Content-Security-Policy** : même en cas de faille XSS, le token Spotify ne peut pas être exfiltré vers un domaine tiers (`connect-src` verrouillé sur l'API Spotify et les quelques APIs utilisées, dont Dropbox et Google Drive pour la sauvegarde optionnelle)
- **Sauvegarde Dropbox optionnelle** : OAuth 2.0 PKCE (offline / refresh token local), aucune clé secrète dans le code
- **Sauvegarde Google Drive optionnelle** : OAuth 2.0 implicite (Google exige un secret client pour le PKCE web → flux implicite, token ~1h sans refresh), scopes `drive.file` (fichiers créés par l'app, pour la sauvegarde) + `drive.readonly` (lecture seule, pour l'onglet Mes Actifs), aucune clé secrète dans le code
- **Coffre Mot de passe** : URL assainies avant rendu (seuls les liens `http(s)` sont cliquables) — pas d'exécution de `javascript:` via une sauvegarde importée
- **sql.js 1.10.2** (SQLite WebAssembly) **auto-hébergé** dans `vendor/` — le `.wasm` ne pouvant pas avoir de SRI, l'auto-hébergement ferme le dernier vecteur d'attaque CDN
- **Leaflet 1.9.4** (carte des trajets Maps) **auto-hébergé** dans `vendor/`, chargé **lazy** au premier affichage de la carte — tuiles OpenStreetMap (seule origine image ajoutée à la CSP), marqueurs 100 % vectoriels
- `apiDel()` — helper DELETE pour l'API Spotify (unlike)
- **IndexedDB** (persistance locale du binaire SQLite, connexion unique réutilisée)
- Spotify Web API (refresh token avec rotation + mutex — plus de déconnexions aléatoires ; retry automatique sur 401 pour tous les verbes HTTP)
- OAuth 2.0 PKCE (le code d'autorisation n'est plus écrit dans le cache du service worker)
- GitHub Pages (hébergement statique — aucun serveur)

## Installation

**Aucune installation nécessaire.** L'app est entièrement statique et hébergée sur GitHub Pages :

👉 **https://pierre-portfolio.github.io/NewSpotifyRelease/**

Au premier lancement, la base de données est créée vide dans le navigateur. La sync Spotify peut démarrer immédiatement après la connexion OAuth.

## Structure du projet
```
NewSpotifyRelease/
  index.html          → App complète (React 18 CDN + sql.js)
  manifest.json       → Config PWA (nom, icônes, display standalone)
  service-worker.js   → Cache app shell + vendor pour offline (v7, ne cache que les réponses OK)
  vendor/
    sql-wasm.js       → sql.js auto-hébergé
    sql-wasm.wasm     → Binaire SQLite WebAssembly auto-hébergé
    leaflet.js        → Leaflet 1.9.4 auto-hébergé (carte des trajets Maps)
    leaflet.css       → Styles Leaflet
    images/           → Assets Leaflet (marqueurs par défaut, non utilisés — circleMarker vectoriels)
  icon-192.png        → Icône PWA 192×192
  icon-512.png        → Icône PWA 512×512
  CLAUDE.md           → Documentation technique pour Claude
  data/
    indices.json      → Vrais indices (NASDAQ-100/S&P 500/CAC 40), généré par la GitHub Action
  scripts/
    fetch_indices.py  → Récupère les indices depuis Yahoo Finance (lancé par l'Action)
  .github/workflows/
    update-indices.yml → Action cron qui met à jour data/indices.json
  assets/
    images/github/    → Images README
```

## Schéma de la base locale (sql.js)

```sql
-- Titres à écouter (feed)
tracks (id, spotify_uri UNIQUE, artist_name, title, release_title,
        release_type, release_date, cover_url, duration_ms,
        listened DEFAULT 0, liked DEFAULT 0, listened_at,
        added_at DEFAULT datetime('now'))

-- Artistes scrappés : date de dernier scan + métadonnées Spotify + compteurs
artists_scraped (spotify_id PRIMARY KEY, last_scraped_at,
                 name, image_url, popularity, followers, genres, spotify_url,
                 last_release_count, total_tracks_added, last_scan_status, scan_count)

-- Compteurs d'écoute (ligne unique id=1)
stats (id=1, total_listened, listened_this_month, listened_this_year,
       last_reset_month, last_reset_year)
```

## Requêtes locales utiles (console DevTools)

```js
// Afficher les tracks non écoutées
dbAll("SELECT * FROM tracks WHERE listened = 0 ORDER BY id ASC LIMIT 20")

// Afficher les tracks likées
dbAll("SELECT * FROM tracks WHERE liked = 1 ORDER BY id DESC LIMIT 20")

// Vérifier les stats
dbGet("SELECT * FROM stats WHERE id = 1")

// Vérifier les dates de scraping
dbAll("SELECT * FROM artists_scraped ORDER BY last_scraped_at DESC LIMIT 10")

// Compter les tracks par état
dbAll("SELECT listened, liked, COUNT(*) as c FROM tracks GROUP BY listened, liked")
```

## Aperçu de l'interface
<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur
- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)

---

<p align="center">Projet réalisé en 2026.</p>
