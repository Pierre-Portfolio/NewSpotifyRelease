<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Hub de Pierre

**PWA sans backend** : elle scanne tes artistes Spotify suivis, détecte leurs nouvelles sorties et garde tout **sur l'appareil** (SQLite + IndexedDB). Autour de la musique, un **hub perso** de modules activables.

👉 **https://pierre-portfolio.github.io/NewSpotifyRelease/** — rien à installer, tout est statique sur GitHub Pages.

> ⏱️ La première ouverture après une mise à jour prend quelques secondes (« Préparation du Hub… »), les suivantes sont instantanées. Sur réseau lent, la copie locale s'ouvre au bout de 1,5 s et un bandeau propose de recharger si une nouvelle version arrive.

---

## Musique

- Connexion **OAuth PKCE** 100 % client. Chaque artiste suivi est scanné depuis **sa propre date de dernier scan** ; la première fois, il rapporte **toute sa discographie** (et compte pour autant d'artistes qu'il a lu de pages).
- **Quota de 100 artistes / 24 h glissantes**, pause / reprise, arrêt de 15 min minimum dès la première limite Spotify (429). **Scraping automatique** au lancement (À propos → 🤖 Lancement automatique).
- **Feed** jusqu'à 1000 titres, filtres et tri sur toute la base. Clic = lecture, **×** = écouté et retiré (↩ Annuler 5 s), **❤** = like. Fin de titre ⇒ marqué écouté + **auto-avance**, sans voler une lecture lancée ailleurs.
- **Découvertes de la semaine** : bouton violet dans ⚙ Scraping, ou simplement **lancer la playlist** — le Hub range ses titres dans « En attente ».
- **🔀 Delta** : likes absents de tes playlists, artistes suivis sans titre rangé (⊘ pour te désabonner), artistes présents chez toi mais non suivis (➕), et 🤖 10 artistes + 10 titres suggérés par l'IA.
- Se désabonner d'un artiste ne l'efface jamais : il reste marqué **⊘ Désabonné** et, si tu te réabonnes, repart de sa dernière date.

---

## Les autres modules

| Module | Ce qu'il fait |
|---|---|
| **📰 Actu** | Résumé IA de la veille, actualité par rubrique, **Bug & pannes** (état officiel, sinon pastille déduite des signalements — ce n'est pas une panne confirmée), **🐂 BullRun** (Crypto Bubbles, calendrier macro de la semaine, Rainbow Chart du bitcoin…), **🗺️ Cartographie** (séismes, commune, air, eau, pollens, conflits, tournages, orbites, transports IDF… chaque fiche repliée ne charge rien), fuites de données, vidéos de tes abonnements YouTube (trait rouge « Fin des nouveautés ») |
| **🔔 Alertes** | Échéances par rubrique, récurrences, calendrier, et trois listes libres : **Mes rappels**, **Mes garanties**, **Mes anniversaires** (saisis en JJ/MM, prévenus le jour J et 3 jours avant). Une alerte proche devient une tâche To do |
| **🔌 API** | Toutes les API du Hub, saisie des clés, compteur d'appels, export JSON |
| **🏷️ Bon Plan** | Jeux suivis avec prix cible, promos CheapShark + Steam + Epic, bibliothèque et souhaits Steam |
| **🗃️ Collection** | Cartes Pokémon & Magic, Displate, Funko Pop, jeux, pierres, montres, vins. Une seule barre : taper filtre, ⏎ cherche au catalogue. Magic : **import CSV** ManaBox / Delver Lens (les `.backup` / `.dlens` ne sont pas lisibles), cote Cardmarket, 🃏 analyse de ce qu'il manque à une extension. Cartes rangées par extension (`12 / 102`), une ouverte à la fois, manquantes en grisé en option |
| **💼 Emploi** | Critères de l'emploi rêvé → offres de 5 sources filtrées puis classées par l'IA ; recherche en une phrase possible |
| **💹 Finance** | Cours en Light / Full avec **relevé quotidien automatique**, calculatrice, **Mes Actifs** (ton classeur Google Drive) |
| **🧊 Frigo** | Contenu + péremptions, photo → ingrédients, recettes par IA |
| **🏛️ Histoire** | Ville + photo → l'IA identifie l'œuvre et la raconte, fil de questions |
| **🤖 IA** | **« ✨ Demander à l'IA »** (accueil) : tu écris ou dictes ce que tu veux faire, l'IA prépare, **tu vois l'aperçu et tu valides**. 5 actions et 1 suppression max par demande, 10 dernières demandes annulables. Jamais : Mot de passe, API, notes cryptées |
| **🎮 Jeux** | 27 mini-jeux hors ligne (2048, Dobble à deux en 5 modes, Doodle Jump, Motus, Des chiffres et des lettres, Osu, Puissance 4…) et **Flip 7**, le tableau des scores de la partie de cartes (export CSV) |
| **🗺️ Maps** | Historique Google Timeline sur une carte, et **📸 Trouver un lieu par photo** : 1 à 4 photos → coordonnées et lien Google Maps (position GPS de la photo si elle l'a gardée, sinon estimation de l'IA avec sa confiance) |
| **🌤️ Météo** | 3 lieux, prévisions 3 ou 7 jours, **notification de pluie dans les 2 h** |
| **🔐 Mot de passe** | Coffre chiffré (AES-GCM, PBKDF2 600 000), espaces **Perso / Pro**, criticité, expiration, verrouillage après 10 min. **🩺 Check-up** : réutilisations, faiblesses, fuites connues (seuls 5 caractères de l'empreinte sortent), sites piratés. ⚠ Mot de passe maître oublié = coffre perdu |
| **🗒️ Note** | Notes libres + espace **crypté**, notes vocales et photos jointes |
| **♻️ Revente** | Annonces Vinted / Leboncoin / eBay rédigées par l'IA |
| **🩺 Santé** | Calories (Open Food Facts, IA, photo d'assiette ou d'addition), macros, favoris, repas corrigeables, **séances de sport** (capture Strava lue par l'IA) qui relèvent l'objectif du jour, pesées détaillées, **📉 prévision** de perte de poids |
| **🏋️ Sport** | 70 exercices illustrés par groupe musculaire, planches gardées sur l'appareil (hors ligne) |
| **✅ To do** | 8 rubriques (quotidien → un jour, + à deux) ; **chaque alerte datée s'y affiche** dans la rubrique de son échéance. **Double tap** sur une tâche = 📍 Massy → 💼 Travail → sans tag. Le bouton à gauche du ♻️ change la vue : **⏳ Courtes** (défaut : alertes du mois seulement) → Travail → Massy → 🏷️ Toutes. ♻️ = 3 dernières supprimées. Le Quotidien se coche depuis Santé (pesée, repas, course) |
| **🎬 TV Time** | Séries et films (TMDB), chaînes YouTube (onglets YT / Short), livres ; lecteur plein écran avec résumé IA ; 🔔 « Suivre cette série » = tâche et notification la veille d'un épisode |
| **👕 Vêtement** | Garde-robe détaillée (coupe, ressenti, tag 👔), photos sur Google Drive **gardées sur l'appareil**, recherche par image, **📏 Mes tailles** avec conseil IA |
| **📊 Stats** | Écoutes, tâches, séries, poids, alertes, jeux, API ; volet 🏋️ Sport pour tes chronos de course |

---

## Configuration

Tout marche sans configuration, sauf les services tiers. **Les clés restent sur l'appareil**, aucune n'est dans le code.

| À renseigner | Où | Pour quoi |
|---|---|---|
| Compte Spotify | Bouton vert de connexion | Musique |
| Clés TMDB / YouTube | TV Time (⚙) ou module API | Séries, films, chaînes |
| Clé Gemini (+ Groq, OpenRouter, Mistral…) | Module API | Toutes les IA |
| SteamID64 (+ clé Web API) | Bon Plan ou module API | Steam |
| Twelve Data, Alpha Vantage | Module API | Actions et matières premières |
| Token GitHub **fine-grained** « Dependabot alerts » en lecture | Module API | Failles de tes dépôts |
| Client ID pCloud | À propos | Sauvegarde pCloud |

**Bon à savoir**
- **403 à la connexion Spotify** : ton compte doit figurer dans *User Management* du [Dashboard développeur](https://developer.spotify.com/dashboard). **📴 Continuer sans Spotify** ouvre le hub sans la musique.
- **Google Drive** se connecte en pop-up ; depuis l'**app installée** ça échoue : connecte-toi une fois depuis un onglet Chrome normal. YouTube a sa propre connexion.
- **Autorisations** au même endroit : À propos → 🔐 Autorisations (cocher accorde, décocher retire).
- **Tes clés ne passent jamais par un relais public**, sauf si tu coches « Relais publics pour les clés » (module API).
- **Ordre des IA** : À propos → ⚙️ Paramétrage. Une IA qui ne répond plus passe la main à la suivante (badge orange **⤵ Gemini → Groq**).
- **Stockage saturé ?** À propos → 📦 Limite data montre le poids de chaque module.

---

## Sauvegarde & données

- Export / import JSON, complet ou par section ; **Dropbox, Google Drive, pCloud** en un bouton.
- **Chiffrées par défaut** avec le **mot de passe maître du coffre 🔑** (rien n'est demandé à l'export ; à la restauration sur un autre appareil, tape ce mot de passe). ⚠ Oublié = sauvegarde illisible.
- La restauration **fusionne** : les compteurs au maximum (jamais doublés), et elle te prévient si le stockage est plein. Photos et caches ne sont pas embarqués.

---

## Technologies

React 18, sql.js (SQLite WASM), Leaflet et polices auto-hébergés dans `vendor/` ; Babel Standalone (version épinglée + SRI) seulement à la première ouverture d'une version. CSP verrouillée, IndexedDB, GitHub Pages : aucun serveur. Toute l'app tient dans `index.html` ; `data/` est pré-rempli par GitHub Actions. Doc technique : `CLAUDE.md`.

<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur

- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)
