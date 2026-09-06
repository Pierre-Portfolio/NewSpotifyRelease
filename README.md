<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Hub de Pierre

## Aperçu

Application web **PWA sans backend** : elle scanne tes artistes Spotify suivis, détecte leurs nouvelles sorties et stocke tout **localement sur l'appareil** (sql.js + IndexedDB). Chaque artiste est scrapé depuis sa propre date de dernier scan — sauf la toute première fois, où sa discographie complète est récupérée. Tu explores ton feed, écoutes les titres un par un et les valides — aucun ajout automatique en playlist.

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
- **Un artiste jamais scrapé rapporte TOUTE sa discographie** — les scans suivants redeviennent incrémentaux
- **Pause / reprise**, reprise après fermeture (bouton « ↩ Reprendre »)
- **Protection rate-limit** : dès le 1er 429 tout s'arrête 15 min minimum (persiste au rechargement)
- **Quota de 100 artistes / 24 h glissantes** avec compte à rebours, réinitialisable dans À propos
- **🤖 Scraping automatique** : au lancement, s'il reste du quota le scan part tout seul et continue même si tu navigues ailleurs. Une passe par jour, reprise là où il s'était arrêté. Interrupteur dans **À propos → 🤖 Lancement automatique**
- **🎵 Masquer le bandeau de lecture** (**À propos → ⚙️ Paramétrage**) : seuls les boutons du bas disparaissent, la lecture et le marquage continuent
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

L'onglet **Musique** regroupe le tout en sections repliables : ⚙ Scraping · ⏳ En attente · ❤ Likés · 🕘 Historique · 🎤 Artistes suivis · 🔀 Delta Playlist (l'écart entre tes likes et le contenu de tes playlists, et en dernier les artistes suivis dont aucun titre n'est rangé en playlist).

---

## Les autres modules

| Module | Ce qu'il fait |
|---|---|
| **📰 Actu** | Résumé de la veille par IA (5 puces monde, 5 puces France), actualité (monde, régional, Wikipédia, bourse, IA, cyber, insolite, jeux), bug & pannes (état officiel des services en ligne + fiches Downdetector), cartes interactives (aurores, séismes, guerre, qualité de l'air et de l'eau, transports…), fuites de données, vidéos de tes abonnements YouTube (lecteur plein écran de TV Time) |
| **🔔 Alertes** | Échéances par rubrique (administratif, anniversaires, logement, véhicule, santé, travail, finance, jeux…), rappels persos, récurrences, calendrier mensuel, alertes automatiques Frigo et Steam. Certaines rubriques ont aussi des champs de **texte libre** (le type d'huile moteur à côté de la vidange), qui ne déclenchent jamais d'alerte |
| **🔌 API** | Liste locale de toutes les API utilisées par le Hub, saisie des clés, compteur d'appels par API, export JSON |
| **🏷️ Bon Plan** | Ta liste de jeux suivis avec prix cible, promos du moment (CheapShark + Steam + Epic, jeu offert de la semaine compris), bibliothèque et liste de souhaits Steam, recherche de bons plans par IA |
| **🗃️ Collection** | Cartes (Pokémon, Magic), Displate, Funko Pop, jeux vidéo, pierres, montres, vins. Recherche par catalogue, ajout manuel, estimation par photo, scan d'une photo pour ajouter plusieurs pièces |
| **💼 Emploi** | Les critères de l'emploi de tes rêves (métiers, lieux, salaire, fraîcheur, contrat…) — les offres du moment sont cherchées et filtrées automatiquement dessus, sur 5 sources, puis classées par pertinence par l'IA |
| **💹 Finance** | Cours (crypto, indices, or, devises, actions) en mode Light ou Full, historique constitué jour après jour, calculatrice, tableau de bord BullRun, et **Mes Actifs** (lecture de ton classeur Google Drive) |
| **🧊 Frigo** | Contenu par compartiment + dates de péremption, et un assistant IA : photo → liste d'ingrédients, recettes réalisables avec ce que tu as, recette d'un plat |
| **🏛️ Histoire** | Une ville + une photo → l'IA identifie l'œuvre, la résume et explique son lien avec la ville ; sous la fiche, un fil de questions pour creuser |
| **🎮 Jeux** | 25 mini-jeux 100 % hors ligne (2048, Simon, Tetris, Doodle Jump, Crossy Road, Flappy, Motus, Démineur, Osu, Piano Tiles, Guitar Hero, Air Hockey, Puissance 4, Go, Morpion, Memory, TierList, et des jeux de soirée à plusieurs sur le même téléphone). **Flip 7** n'est pas un jeu mais le **tableau des scores** de la partie de cartes : 3 à 9 joueurs, une ligne par manche, victoire à 200 points, export/import du tableau en CSV pour le partager ou le reprendre sur un autre téléphone |
| **🗺️ Maps** | Import de ton historique Google Timeline et affichage sur une carte |
| **🌤️ Météo** | 5 lieux dont ta position, prévisions 3 ou 7 jours, détail heure par heure, **notification quand il va pleuvoir dans les 2 h** (une seule par épisode) |
| **🔐 Mot de passe** | Coffre chiffré AES-GCM 256 (PBKDF2 600 000 itérations), tags, réordonnancement, verrouillage automatique après 10 min |
| **🗒️ Note** | Notes libres + un espace **crypté** séparé (mot de passe global), notes vocales et photos jointes, sauvegarde automatique à la frappe |
| **♻️ Revente** | L'IA rédige tes annonces Vinted / Leboncoin / eBay à partir de tes photos et des infos de l'article, adaptées à chaque plateforme |
| **🩺 Santé** | Calories par repas (Open Food Facts, estimation IA, **photo de ton assiette**), macros, besoin quotidien calculé, **aliments favoris** avec leur propre recherche, journal de pesées avec courbes |
| **🏋️ Sport** | 9 groupes musculaires, 70 exercices illustrés avec démonstration animée, machines Basic-Fit |
| **✅ To do** | 7 rubriques (quotidien, aujourd'hui, semaine, mois, année, un jour, à deux), favorites, validation quotidienne. Le ♻️ garde les **3 dernières tâches supprimées** et les remet en un clic dans leur rubrique. Les rappels proches de l'échéance et les runs speedrun à valider s'ajoutent tout seuls dans « Aujourd'hui » |
| **🎬 TV Time** | Séries et films (TMDB), chaînes YouTube (onglets **▶️ YT** et **🩳 Short** séparés selon ce qu'il te reste à voir), livres. Lecteur plein écran avec file d'attente, **résumé IA de la vidéo + fil de questions**. Progression épisode par épisode, synchronisation quotidienne automatique |
| **👕 Vêtement** | Garde-robe par type et sous-catégorie, fiches détaillées (marque, couleur, tissu, taille, prix, état, lieu), photos stockées sur ton Google Drive, galerie, filtres, recherche par image, mode 🖼️ (rien que les photos) et 💶 (masquer les prix). Tes marques préférées se rangent en sections par glisser-déposer |
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
