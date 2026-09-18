<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Hub de Pierre

## Aperçu

Application web **PWA sans backend** : elle scanne tes artistes Spotify suivis, détecte leurs nouvelles sorties et stocke tout **localement sur l'appareil** (sql.js + IndexedDB). Chaque artiste est scrapé depuis sa propre date de dernier scan ; la toute première fois, il rapporte sa dernière année de sorties. Tu explores ton feed, écoutes les titres un par un et les valides — aucun ajout automatique en playlist.

Au-delà de la musique, c'est un **hub perso** regroupant des modules activables/désactivables.

👉 **https://pierre-portfolio.github.io/NewSpotifyRelease/** — aucune installation, tout est statique sur GitHub Pages.

> ⏱️ **Première ouverture après une mise à jour** : le Hub se prépare quelques secondes (écran « Préparation du Hub… »), puis mémorise le résultat — les ouvertures suivantes sont quasi instantanées.
> Sur réseau lent, il s'ouvre depuis sa copie locale au bout de 1,5 s ; si une nouvelle version arrive entre-temps, un bandeau propose de recharger.

---

## Musique

**Scraping**
- Connexion **OAuth 2.0 PKCE** 100 % client, aucun secret dans le code
- Scan des artistes suivis, délai configurable (10/20/30 s)
- Chaque artiste part de **sa propre date de dernier scan**, avancée seulement si le scan réussit
- **Un artiste jamais scrapé rapporte sa dernière ANNÉE de sorties** (fenêtre glissante, une seule requête comme un scan normal) — les scans suivants redeviennent incrémentaux
- **Pause / reprise**, reprise après fermeture (bouton « ↩ Reprendre »)
- **Protection rate-limit** : dès le 1er 429 tout s'arrête 15 min minimum (persiste au rechargement)
- **Quota de 100 artistes / 24 h glissantes** avec compte à rebours, réinitialisable dans À propos
- **🤖 Scraping automatique** : au lancement, s'il reste du quota le scan part tout seul et continue même si tu navigues ailleurs. Une passe par jour, reprise là où il s'était arrêté. Interrupteur dans **À propos → 🤖 Lancement automatique**
- **🎵 Masquer le bandeau de lecture** (**À propos → ⚙️ Paramétrage**) : seuls les boutons du bas disparaissent, la lecture et le marquage continuent
- **⌄ Replier le lecteur** (bouton à droite de la boucle, sur mobile) : il ne reste qu'une ligne — pochette, titre et lecture/pause — et le ⌃ le redéploie ; le repli est mémorisé
- **👻 Artistes inconnus** : dans 🎤 Artistes suivis, « Identifier » demande à Spotify qui sont les lignes sans nom ; celles dont la page n'existe plus se suppriment de la liste **et de tes abonnements Spotify** (nouvelle permission : reconnecte-toi une fois)
- Notification navigateur en fin de session

**Feed & lecture**
- File d'attente jusqu'à 1000 titres affichés, **filtres** (type / genre / artiste) et **tri** balayant toute la base
- Clic sur une ligne = lecture · **×** = marquer écouté et retirer (avec ↩ Annuler 5 s) · **❤** = like
- Marquage automatique en fin de titre + **auto-avance**, sans voler la lecture si tu lances autre chose ailleurs
- Swipe gauche = retirer, swipe droite = précédent (mobile) ; player mobile, mode compact en écran court
- Si un titre ne se lance pas, le Hub choisit un appareil Spotify disponible et, à défaut, affiche le message exact de Spotify

**Découvertes de la semaine**
Rien n'est importé automatiquement. Deux moyens : le **bouton violet** dans ⚙ Scraping (qui teste l'accès et importe ce qui est lisible), et surtout la **capture par la lecture** — lance la playlist une fois par semaine et le Hub range les titres dans « En attente » tout seul. Spotify ne laissant plus toujours lire le contenu des playlists éditoriales, la capture par la lecture reste le moyen fiable.

L'onglet **Musique** regroupe le tout en sections repliables : ⚙ Scraping · ⏳ En attente · ❤ Likés · 🕘 Historique · 🎤 Artistes suivis · 🔀 Delta : un bouton **▶ Analyser** et deux résultats — **Delta Playlist** (l'écart entre tes likes et le contenu de tes playlists) et **Delta Artiste** (les artistes que tu suis dont aucun titre n'est rangé en playlist, avec un bouton **⊘** pour t'en désabonner sur Spotify). Ce dernier finit par l'inverse : les artistes que tu **ne suis pas** mais qui sont chez toi — dans tes titres likés et/ou dans tes playlists — avec le compte de chaque côté et un bouton **➕** pour t'y abonner (le prochain scan prendra alors toute leur discographie). Enfin **🤖 IA** : à partir de cette même analyse (titres likés, abonnements, genres), un modèle propose **10 artistes que tu ne suis pas et 10 titres** à découvrir — chacun recherché dans le catalogue Spotify pour te donner la pochette et le bouton ▶, et pour écarter ce qui aurait été inventé.

Te désabonner d'un artiste — depuis ce bouton ⊘ ou depuis l'app Spotify — ne l'efface **jamais** : il reste dans 🎤 Artistes suivis, marqué **⊘ Désabonné**, avec sa date de dernier scraping et ses compteurs. Il n'est simplement plus scanné et ne compte plus dans le X/X de la synchro. Si tu te réabonnes un jour, le prochain scan le réactive tout seul et **repart de sa dernière date** au lieu de tout reprendre depuis le début.

---

## Les autres modules

| Module | Ce qu'il fait |
|---|---|
| **📰 Actu** | Résumé de la veille par IA (5 puces monde, 5 puces France) et actualité par rubrique (monde, régional, Wikipédia, bourse, IA, cyber, insolite, jeux). **Bug & pannes** : l'état officiel quand l'éditeur en publie un ; sinon (Free, Steam, Netflix, YouTube, et la rubrique Banque & Finance — Crédit Agricole, N26, Boursorama, Bourse Direct, Trade Republic, eToro, Binance, Kraken…) une pastille **déduite du volume de signalements**, comme le fait Downdetector : la ligne dit alors combien de signalements et combien de fois le niveau habituel, parce que ce sont des signalements d'utilisateurs et pas une panne confirmée. **🐂 BullRun** : Crypto Bubbles (performance puis marché en un coup d'œil), Macroéconomie (les publications de la semaine rangées par jour, à l'heure, notées en ★ — seules celles qui bougent les marchés : ★★ et ★★★ pour l'Europe et les États-Unis, ★★★ ailleurs), Trends, Rainbow Chart du **bitcoin seul** (tout l'historique du prix en échelle log sur les bandes recalculées en direct — elles ne veulent rien dire sur un jeton qui n'a pas traversé plusieurs cycles) et Altcoin Season, tous **recalculés ici** : le site de référence tient dans un petit lien à côté du titre. **🗺️ Cartographie** : douze fiches, **chacune repliée à l'arrivée** et qui ne charge rien tant qu'on ne l'ouvre pas — **aurores** (carte du monde où les zones vertes voient une aurore en ce moment, modèle OVATION du NOAA, plus l'indice Kp maintenant et son pic sur 72 h), **séismes** de magnitude 4,5+ des 7 derniers jours, **fiche d'une commune** ligne par ligne (population, superficie, densité, altitude, coordonnées, code postal, codes INSEE et SIREN, département, région, intercommunalité, et ce que la commune pèse autour d'elle), **qualité de l'air**, **qualité de l'eau** et **pollens** sur tes lieux Météo — chacune avec une barre qui ajoute n'importe quelle commune (tape « boulogne » et elle te propose Boulogne-Billancourt et Boulogne-sur-Mer) et une carte où **toucher une ligne désigne la ville** : son point passe en blanc, s'agrandit, la carte s'y rend —, **conflits armés** (morts recensées par pays, base UCDP), **tournages** déclarés à Paris (les 10 plus récents, sur une carte et listés dessous), **densité de photos** autour d'une commune, **objets en orbite** par pays de lancement (c'est bien le pays qui a lancé, pas l'endroit où ça tourne), **lignes de transport d'Île-de-France** (cherche « metro 1 », « RER B », « T3A » : la carte n'affiche plus que cette ligne et liste **tous ses arrêts** dans l'ordre du tracé, avec la distance depuis le départ ; les rames qui y circulent sont **simulées** — le trafic réel demande une clé PRIM, et la carte le dit) et **🐾 Espèces animales**, la seule carte qui soit la nôtre. Enfin **fuites de données** et **vidéos de tes abonnements YouTube** (lecteur plein écran de TV Time) |
| **🔔 Alertes** | Échéances par rubrique (administratif, logement, véhicule, santé, travail, finance, jeux…), trois listes libres à remplir soi-même — **Mes rappels** et **Mes garanties** en tête, **Mes anniversaires** à l'intérieur de la rubrique 🎂 Anniversaire, toutes vides au départ —, un anniversaire se saisissant en **JJ/MM** (pas d'année, pas d'heure : il revient chaque année) et prévenant **le jour même et 3 jours avant**, pas plus —, récurrences, calendrier mensuel, alertes automatiques Frigo et Steam. Supprimer une alerte demande **une confirmation** : la croix est petite, et l'alerte emporte sa tâche To do avec elle. Certaines rubriques ont aussi des champs de **texte libre** (le type d'huile moteur à côté de la vidange), qui ne déclenchent jamais d'alerte |
| **🔌 API** | Liste locale de toutes les API utilisées par le Hub, saisie des clés, compteur d'appels par API, export JSON |
| **🏷️ Bon Plan** | Ta liste de jeux suivis avec prix cible, promos du moment (CheapShark + Steam + Epic, jeu offert de la semaine compris), bibliothèque et liste de souhaits Steam, recherche de bons plans par IA |
| **🗃️ Collection** | Cartes (Pokémon, Magic), Displate, Funko Pop, jeux vidéo, pierres, montres, vins. Recherche au catalogue, ajout manuel, estimation par photo, scan d'une photo pour ajouter plusieurs pièces. Displate, Pop et Montre s'importent **en un clic depuis ton classeur Finance du Drive** (une colonne = un objet), prix réalignés à chaque import ; les photos prises pour l'analyse IA vivent dans ton Google Drive (`HUB_Pierre/Collection`), jamais sur l'appareil. **Tout arrive replié** — chaque titre porte déjà son compte et sa cote, « 🔴 POKÉMON - 228 CARTES » — et un seul clic ouvre. Dans une collection ouverte, **une seule barre** : ce que tu tapes filtre ta collection en direct, ⏎ va chercher au catalogue. Sur Pokémon elle accepte aussi bien **une carte qu'une extension**, qui s'ajoute alors en entier d'un bouton (les cartes déjà là sont laissées telles quelles) ; sur Magic, le 📥 à droite ouvre l'import CSV — exporte depuis **ManaBox** (⋯ → Export collection) ou **Delver Lens** (☰ → Export) et tout arrive d'un coup : quantités, extension, numéro, foil, langue. Réimporter met les quantités à jour sans rien doubler, et 💰 va chercher la cote Cardmarket en euros. ⚠ **Seul le CSV est importable** : les `.backup` de ManaBox et `.dlens` de Delver Lens sont leurs bases internes chiffrées, pas des exports — tu peux quand même les choisir, l'app te dira lequel c'est. Ta collection est **rangée par extension**, **celles que tu es le plus près de compléter en premier** (une liste déroulante repasse en alphabétique ou de la plus récente à la plus ancienne), avec le compte `12 / 102` = les numéros que tu possèdes sur le total de l'extension (foil et normale = un seul numéro). Tu déplies celle qui t'intéresse — **en ouvrir une referme la précédente** — et tes cartes y sont **rangées par numéro**, 4 par ligne sur téléphone, numéro et cote dessous ; un clic sur une carte ouvre sa fiche (quantité, prix, retrait). Une liste déroulante **Manquantes**, éteinte au départ, montre en grisé les cartes que tu n'as pas — **à leur place** entre les tiennes ou **en liste séparée** —, et seulement pour l'extension ouverte. ⚠ Le total vient du catalogue de l'éditeur : hors ligne, seul ton nombre de cartes s'affiche, jamais un total inventé. Les cartes ont **leur propre réserve**, séparée du stockage local du Hub : des dizaines de milliers n'y saturent rien, et leur image n'est jamais enregistrée. Sous Magic, **🃏 Analyse Cardmarket** chiffre ce qu'il te manque d'une extension — une carte par numéro, foil retenue si elle ne dépasse pas le non-foil de 10 %, ce que tu possèdes déduit. Le prix vient de Scryfall, qui n'en publie **qu'un seul par carte : ni état ni langue, et sans frais de port** ; « analyse poussée » va chercher les offres réelles pour appliquer tes règles (Good/Near Mint à 5 c près, français) et regrouper par vendeur — Cardmarket étant derrière Cloudflare, elle peut ne rien lire, et elle le dit franchement plutôt que d'annoncer un faux total |
| **💼 Emploi** | Les critères de l'emploi de tes rêves (métiers, lieux, salaire, fraîcheur, contrat…) — les offres du moment sont cherchées et filtrées automatiquement dessus, sur 5 sources, puis classées par pertinence par l'IA. Tu peux aussi décrire ta recherche en une phrase : l'IA en tire les critères, le temps d'une recherche, sans toucher à ton formulaire |
| **💹 Finance** | Cours (crypto, indices, or, devises, actions) en mode Light ou Full, historique constitué jour après jour — **un relevé part tout seul à la connexion, une fois par jour, même si tu n'ouvres pas le module** (et même en mode 📴 hors ligne Spotify) —, calculatrice, et **Mes Actifs** (lecture de ton classeur Google Drive), dont les 14 graphiques d'historique se lisent dans cet ordre : ① où ça mène, ② ce qui rentre et ce qui sort, ③ ce que tu possèdes en détail |
| **🧊 Frigo** | Contenu par compartiment + dates de péremption, et un assistant IA : photo → liste d'ingrédients, recettes réalisables avec ce que tu as, recette d'un plat |
| **🏛️ Histoire** | Une ville + une photo → l'IA identifie l'œuvre, la résume et explique son lien avec la ville ; sous la fiche, un fil de questions pour creuser |
| **🎮 Jeux** | 26 mini-jeux 100 % hors ligne (2048, Simon, Plox, Doodle Jump, Crossy Road, Flappy, Motus, Démineur, Osu, Piano Tiles, Guitar Hero, Air Hockey, Puissance 4, Go, Morpion, Memory, TierList, et des jeux de soirée à plusieurs sur le même téléphone). **Des chiffres et des lettres** se joue seul ou jusqu'à 8 : à chaque manche tu choisis « le compte est bon » ou « le mot le plus long », le Hub tire et lance le chrono, puis dévoile la meilleure opération (toujours trouvée, avec le détail) ou des mots possibles — et **c'est toi qui dis qui a gagné**, ou personne. ⚠ Les mots proposés viennent du dictionnaire de Motus, qui ne connaît que les mots de **6 à 9 lettres** : un mot plus court ou plus long peut être parfaitement valable, l'arbitre c'est vous. **Flip 7** n'est pas un jeu mais le **tableau des scores** de la partie de cartes : 3 à 9 joueurs, une ligne par manche, victoire à 200 points, export/import du tableau en CSV pour le partager ou le reprendre sur un autre téléphone |
| **🗺️ Maps** | Import de ton historique Google Timeline et affichage sur une carte |
| **🌤️ Météo** | 3 lieux dont ta position, prévisions 3 ou 7 jours, détail heure par heure, **notification quand il va pleuvoir dans les 2 h** (une seule par épisode) |
| **🔐 Mot de passe** | Coffre chiffré AES-GCM 256 (PBKDF2 600 000 itérations), tags, réordonnancement, verrouillage automatique après 10 min. **Les thèmes arrivent repliés** — le compte reste sur le titre —, et une recherche ou un filtre les rouvre le temps de la recherche. Un bouton **🩺 Check-up** note la santé du coffre sur 100 : mots de passe réutilisés ou simplement déclinés (`Chat2023!` / `Chat2024!`), trop courts ou trop devinables, expirés, fiches en double — plus deux contrôles en ligne et gratuits : ton mot de passe apparaît-il dans une fuite connue (seuls **5 caractères de son empreinte** sont envoyés, jamais le mot de passe) et le **site** a-t-il été piraté. Chaque identifiant porte une **criticité** facultative (P1 → P5), affichée en pastille sur la fiche, filtrable, et qui pèse double dans la note du check-up ; et peut porter une **date d'expiration** : la fiche affiche alors un ⏳ dès qu'il reste moins d'un mois, et un ⚠ rouge une fois la date passée — sans qu'il faille l'ouvrir |
| **🗒️ Note** | Notes libres + un espace **crypté** séparé (mot de passe global), notes vocales et photos jointes, sauvegarde automatique à la frappe |
| **♻️ Revente** | L'IA rédige tes annonces Vinted / Leboncoin / eBay à partir de tes photos et des infos de l'article, adaptées à chaque plateforme |
| **🩺 Santé** | Calories par repas (Open Food Facts, estimation IA, **photo de ton assiette**), macros, besoin quotidien calculé, **aliments favoris** avec leur propre recherche, journal de pesées avec courbes. Chaque repas ajouté **se corrige au ✏️** (nom, catégorie, **quantité en grammes**, calories, macros) — pratique quand l'IA estime de travers ; changer la quantité recalcule calories et macros au prorata. Les chips de jour passent en **rouge** quand l'objectif de cette journée-là a été dépassé, et en **orange** quand elle reste sous 500 kcal — un jour où tu as trop peu mangé, ou simplement oublié de saisir (une journée encore vide reste neutre). Une section **🏃 Séances de sport** enregistre tes séances (sport, durée, intensité) — ou, au **🖼️**, depuis une **capture de ta séance Strava** que l'IA lit pour en tirer les calories **selon ton physique** — et en déduit les calories brûlées, qui **relèvent ton objectif du jour** au lieu de s'effacer de ce que tu as mangé. Chaque pesée du journal est un **volet dépliable** : replié il donne la date, le poids et l'écart avec la précédente, déplié il donne **toutes** les mesures de la balance (IMC — calculé tout seul depuis ta taille —, graisse, eau, métabolisme de base, graisse viscérale, muscle, protéine, masse osseuse, âge corporel), chacune avec son écart coloré. Une section **📉 Prévision** projette ta perte de poids jusqu'à une date cible : elle te dit le déficit quotidien à tenir, ce que ça fait en calories à manger, et trace ta trajectoire avec **toutes** tes pesées par-dessus — l'axe part du jour où tu as ouvert la prévision (ou de ta plus ancienne pesée si elle est antérieure), pour qu'il y ait une durée à regarder dès la première pesée. Une pesée enregistrée s'y voit **immédiatement** — un point de plus sur la courbe, la trajectoire ré-ancrée sur elle, et un **rythme réel** (ce que la balance mesure vraiment sur les 45 derniers jours) qui annonce à quelle date tu atteindras la cible à cette allure |
| **🏋️ Sport** | 9 groupes musculaires, 70 exercices illustrés avec démonstration animée, machines Basic-Fit |
| **✅ To do** | 7 rubriques (quotidien, aujourd'hui, semaine, mois, année, un jour, à deux), favorites, validation quotidienne. **Double tape une tâche** pour la taguer : un premier double tap la passe en bleu 📍 **Massy**, un second en rouge 💼 **Travail**, un troisième enlève le tag. Le bouton 🏷️, à gauche du ♻️, suit le même cycle et ne garde que le tag choisi (tu arrives toujours sur toutes les tâches, et ce que tu écris dans une vue filtrée prend ce tag d'office). Le ♻️ garde les **3 dernières tâches supprimées** et les remet en un clic dans leur rubrique. Les rappels proches de l'échéance, les runs speedrun à valider et les épisodes de séries suivies au 🔔 s'ajoutent tout seuls dans « Aujourd'hui ». Si une **fuite de données** d'Actu touche un site rangé dans ton coffre de mots de passe, une tâche « 🔒 Site hacker vérifie ton compte : … » y apparaît aussi — à condition que le coffre soit déverrouillé, sinon elle attend le prochain déverrouillage. Et le **Quotidien se coche tout seul** depuis Santé : une pesée du jour valide « Se peser », trois repas valident « Nourriture », une séance de course valide « Courir » — si la tâche existe, elle n'est jamais créée |
| **🎬 TV Time** | Séries et films (TMDB), chaînes YouTube (onglets **▶️ YT** et **🩳 Short** séparés selon ce qu'il te reste à voir), livres. Lecteur plein écran avec file d'attente, **résumé IA de la vidéo + fil de questions** — dans la playlist des vidéos en attente (📺), le bouton ✨ d'une ligne lance la vidéo **et** déplie le résumé IA sous elle d'un seul clic. Progression épisode par épisode — **un clic sur un épisode déplie son résumé** (rien n'est téléchargé en plus : il arrive avec les titres et les vignettes de la saison ; si TMDB n'a pas de version française, la VO prend le relais) —, synchronisation quotidienne automatique. Le **🔔 « Suivre cette série »** de la fiche ajoute une tâche To do la veille de chaque nouvel épisode et notifie la veille puis le jour même |
| **👕 Vêtement** | Garde-robe par type et sous-catégorie, fiches détaillées (marque, couleur, tissu, taille, prix, état, lieu), photos stockées sur ton Google Drive **puis gardées sur l'appareil** (une fois vues, elles s'affichent sans Drive, même hors ligne — le bouton ↻ Re-télécharger les rapatrie si tu les as changées ailleurs), galerie, filtres, recherche par image, mode 🖼️ (rien que les photos) et 💶 (masquer les prix). Tes marques préférées se rangent en sections par glisser-déposer |
| **📊 Stats** | Écoutes, tâches, films et séries, trajets, poids, alertes, jeux (Steam, League of Legends, chess.com, Clash Royale, CS2, speedrun, GitHub) et appels API |

---

## Configuration

Tout fonctionne sans rien configurer, sauf les modules qui parlent à un service tiers. **Toutes les clés restent sur ton appareil**, aucune n'est dans le code.

| À renseigner | Où | Pour quoi |
|---|---|---|
| Compte Spotify | Bouton vert de connexion | Musique |
| Clé TMDB | TV Time (⚙) ou module API | Séries et films |
| Clé YouTube | TV Time (⚙) ou module API | Chaînes YouTube |
| Clé Gemini (et éventuellement Groq, OpenRouter, Mistral…) | Module API | Tous les assistants IA |
| SteamID64 (+ clé Web API) | Bon Plan ou module API | Liste de souhaits, bibliothèque, statistiques |
| Client ID pCloud | Carte pCloud d'À propos | Sauvegarde pCloud |

**Bon à savoir**
- **Erreur 403 à la connexion Spotify** : ton compte doit être déclaré dans le [Dashboard développeur](https://developer.spotify.com/dashboard) → ton appli → *User Management*. La cause exacte de tout échec de connexion s'affiche en bandeau rouge.
- **Pas envie de Spotify (ou Spotify ne répond pas) ?** Le bouton **« 📴 Continuer sans Spotify »** ouvre directement le hub. Tout ce qui est local fonctionne normalement ; seule la Musique a besoin de la connexion.
- **Google Drive** se connecte par **fenêtre pop-up** (pense à les autoriser). ⚠️ Depuis l'**app installée**, Google refuse de renvoyer le jeton : connecte-toi **une fois depuis un onglet Chrome normal**, la connexion est ensuite partagée.
- **Toutes les autorisations au même endroit** : À propos → 🔐 Autorisations (Google Drive, Drive lecture seule, YouTube, Dropbox, pCloud, notifications, géolocalisation, stockage persistant). Cocher accorde, décocher retire ; les 3 permissions du navigateur ne se rendent que dans ses réglages (icône 🔒 de la barre d'adresse). ⚠ Pas de « tout autoriser » : une fenêtre de consentement par clic, et Google refuse Drive et YouTube ensemble.
- **YouTube se connecte séparément de Drive** : bouton dédié dans Actu → Vidéos YouTube.
- **👍 sur un commentaire YouTube** : l'API YouTube **ne sait pas** liker un commentaire. Le bouton mémorise le like dans le Hub *et* ouvre le commentaire sur youtube.com pour y poser le vrai like.
- **« Stockage local saturé » ?** À propos → 📦 *Limite data* montre où part la place : espace utilisé, espace **encore libre** (mesuré sur ton navigateur, pas supposé), puis **le poids de chaque module** — 📦 son stockage local *et* 🗄️ sa base (SQLite pour Musique, liste pour TV Time, pièces jointes pour Note). Touche une ligne pour voir ses clés une par une — et sur TV Time, le poids des 📺 séries, 🎬 films, ▶️ YouTube, 🩳 Shorts et 📚 livres, chacun sa couleur.
- **Sauvegardes chiffrées par défaut** : une phrase de passe est demandée à chaque export et à chaque restauration ; annuler propose un export en clair, à confirmer. L'interrupteur **🔒/🔓** (À propos → ↧ *Exporter*) repasse en clair — le fichier contient alors toutes tes clés d'API lisibles. ⚠ Phrase oubliée = sauvegarde définitivement illisible.
- **Choisir quelle IA sert quel module** : À propos → ⚙️ *Paramétrage* → bouton **🤖** de la ligne du module. Les IA cochées sont essayées **de haut en bas** jusqu'à ce que l'une réponde : décocher ne retire aucune fonction, ça raccourcit la liste de secours.
- **Savoir quelle IA a répondu** : quand une autre a pris le relais, un badge orange **⤵ Gemini → Groq** s'affiche à côté du résultat (avec 📷 si la requête emportait une photo).

---

## Sauvegarde & données

- **Export / import JSON**, complet ou par section (Musique, TV Time, Santé, Note, Collection, Vêtement, Comptes & clés…)
- **Trois destinations cloud** au choix : ☁︎ Dropbox, △ Google Drive, ◲ pCloud — sauvegarde et restauration en un bouton
- **Fusion intelligente** à la restauration : les compteurs sont repris au maximum (un ré-import ne double jamais tes statistiques) ; si le stockage local est plein, la restauration te le dit au lieu de faire semblant d'avoir réussi
- Proposition de sauvegarde hebdomadaire, réinitialisation mois/année automatique
- Les photos et les caches rechargeables ne sont volontairement pas embarqués (les photos vivent sur ton Drive)

---

## Technologies

**React 18.3.1**, **sql.js 1.10.2** (SQLite WASM), **Leaflet 1.9.4** et les polices auto-hébergés dans `vendor/` ; **Babel Standalone 7.29.7** via CDN (version épinglée + SRI), téléchargé seulement à la première ouverture d'une nouvelle version. **Content-Security-Policy** verrouillée, **IndexedDB** pour la persistance, Spotify Web API en refresh token avec rotation. Hébergement statique **GitHub Pages** : aucun serveur, aucune donnée qui sort de ton appareil.

Tout l'app tient dans `index.html`. Autour : `manifest.json` + `service-worker.js` (PWA, cache offline), `vendor/`, et `data/` + `scripts/` + `.github/workflows/` (Actu et indices boursiers pré-fetchés par GitHub Actions). Doc technique : `CLAUDE.md`.

## Aperçu de l'interface

<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur

- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)
