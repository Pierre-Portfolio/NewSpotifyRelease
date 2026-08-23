<h1 align="center">
  <img src="./assets/images/github/header.gif" alt="New Spotify Release" />
</h1>
<img src="./assets/images/github/star.gif" alt="star" />

---

# Spotify+ — Hub de Pierre

## Aperçu

Application web **PWA sans backend** : elle scanne tes artistes Spotify suivis, détecte leurs nouvelles sorties et stocke tout **localement sur l'appareil** (sql.js + IndexedDB). Chaque artiste est scrappé depuis sa propre date de dernier scan. Tu explores ton feed, écoutes les titres un par un et les valides — aucun ajout automatique en playlist.

Au-delà de la musique, c'est un **hub perso** regroupant des modules activables/désactivables : Actu, Alertes, API, Bon Plan, Collection, Emploi, Finance, Frigo, Histoire, Jeux, Maps, Météo, Mot de passe, Note, Revente, Santé, Sport, To do, TV Time, Vêtement et Stats.

👉 **https://pierre-portfolio.github.io/NewSpotifyRelease/** — aucune installation, tout est statique sur GitHub Pages.

---

## Musique

**Scraping**
- Connexion **OAuth 2.0 PKCE** 100 % client, aucun secret dans le code
- Scan des artistes suivis, délai configurable (10/20/30 s, 10 s par défaut) + jitter
- Chaque artiste part de **sa propre date de dernier scan**, avancée seulement si le scan réussit
- **Pause / reprise**, reprise après fermeture (bouton « ↩ Reprendre »)
- **Protection rate-limit** : dès le 1er 429 tout s'arrête 15 min minimum (persiste au rechargement)
- **Quota de 100 artistes / 24 h glissantes** avec compte à rebours, réinitialisable dans À propos
- **🤖 Scrapping automatique** : au lancement du Hub, s'il reste du quota le scan part tout seul et continue même si tu navigues dans un autre module. Une passe par jour ; coupé par le quota, il reprend où il s'était arrêté. Interrupteur dans **À propos → 🤖 Lancement automatique**
- Notification navigateur en fin de session

**Feed & lecture**
- File d'attente jusqu'à 1000 titres affichés, **filtres** (type / genre / artiste) et **tri** balayant toute la base
- Clic sur une ligne = lecture · **×** = marquer écouté et retirer (avec ↩ Annuler 5 s) · **❤** = like
- Marquage automatique en fin de titre + **auto-avance**, sans voler la lecture si tu lances autre chose ailleurs
- Swipe gauche = retirer, swipe droite = précédent (mobile) ; player mobile, mode compact en écran court
- Si un titre ne se lance pas, le Hub désigne explicitement un appareil Spotify disponible et, à défaut, affiche le message exact de Spotify

**Découvertes de la semaine**
Rien n'est importé automatiquement. Deux moyens : le **bouton violet** dans ⚙ Scrapping (qui teste l'accès, importe ce qui est lisible et ouvre ta playlist), et surtout la **capture par la lecture** — lance la playlist une fois par semaine et le Hub range les titres dans « En attente » tout seul. Depuis la migration Spotify de février 2026, le contenu des playlists éditoriales n'est plus toujours lisible : la capture par la lecture reste le moyen fiable.

L'onglet **Musique** regroupe le tout en sections repliables : ⚙ Scrapping · ⏳ En attente · ❤ Likés · 🕘 Historique · 🎤 Artistes suivis · 🔀 Delta Playlist (l'écart entre tes likes et le contenu de tes playlists).

---

## Les autres modules

| Module | Ce qu'il fait |
|---|---|
| **📰 Actu** | Actualité (monde, régional, Wikipédia, LinkedIn, bourse, IA, cyber, insolite, jeux), cartes interactives (aurores, séismes, guerre, qualité de l'air et de l'eau, transports, espèces animales…), fuites de données, vidéos de tes abonnements YouTube |
| **🔔 Alertes** | Échéances par rubrique (administratif, anniversaires, logement, véhicule, santé, travail, finance, jeux…), rappels persos, récurrences, calendrier mensuel, alertes automatiques Frigo et Steam |
| **🔌 API** | Liste locale de toutes les API utilisées par le Hub, saisie des clés, compteur d'appels par API, export JSON |
| **🏷️ Bon Plan** | Ta liste de jeux suivis avec prix cible, promos du moment, bibliothèque et liste de souhaits Steam, recherche de bons plans par IA |
| **🗃️ Collection** | Cartes (Pokémon, Magic), Displate, Funko Pop, jeux vidéo, pierres, montres, vins. Recherche par catalogue, ajout manuel, estimation par photo, scan d'une photo pour ajouter plusieurs pièces |
| **💼 Emploi** | Ton salaire comparé à ton secteur + offres du moment |
| **💹 Finance** | Cours (crypto, indices, or, devises, actions) en mode Light ou Full, historique de prix constitué jour après jour, calculatrice, tableau de bord BullRun, et **Mes Actifs** (lecture de ton classeur Google Drive : patrimoine, portefeuille crypto converti en BTC) |
| **🧊 Frigo** | Contenu par compartiment + dates de péremption, et un assistant IA : photo → liste d'ingrédients, recettes réalisables avec ce que tu as, recette d'un plat |
| **🏛️ Histoire** | Une ville + une photo → l'IA identifie l'œuvre, la résume et explique son lien avec la ville, illustrations à l'appui |
| **🎮 Jeux** | 27 mini-jeux 100 % hors ligne (2048, Doodle Jump, Crossy Road, Flappy, Motus, Démineur, Snake, Osu, Piano Tiles, Guitar Hero, Air Hockey, Blackjack, Poker, Flip 7, Puissance 4, Go, Morpion, Memory, Bataille navale, TierList, et des jeux de soirée à plusieurs sur le même téléphone) |
| **🗺️ Maps** | Import de ton historique Google Timeline et affichage sur une carte |
| **🌤️ Météo** | 5 lieux dont ta position, prévisions 3 ou 7 jours, détail heure par heure |
| **🔐 Mot de passe** | Coffre chiffré AES-GCM 256 (PBKDF2 600 000 itérations), tags, réordonnancement, verrouillage automatique après 10 min |
| **🗒️ Note** | Notes libres + un espace **crypté** séparé (mot de passe global), notes vocales et photos jointes, sauvegarde automatique à la frappe |
| **♻️ Revente** | L'IA rédige tes annonces Vinted / Leboncoin / eBay à partir de tes photos et des infos de l'article (titre, description et prix adaptés à chaque plateforme, prêts à copier) |
| **🩺 Santé** | Calories par repas (base Open Food Facts, estimation IA, **photo de ton assiette**), macros, besoin quotidien calculé, **aliments favoris** (☆ sur un résultat, puis leur propre barre de recherche), journal de pesées avec courbes |
| **🏋️ Sport** | 9 groupes musculaires, 70 exercices illustrés avec démonstration animée, machines Basic-Fit |
| **✅ To do** | 7 rubriques (quotidien, aujourd'hui, semaine, mois, année, un jour, à deux), favorites, validation quotidienne |
| **🎬 TV Time** | Séries et films (TMDB), chaînes YouTube (vidéos et Shorts comptés séparément, lecteur plein écran avec file d'attente), livres. Progression épisode par épisode, synchronisation quotidienne automatique |
| **👕 Vêtement** | Garde-robe par type et sous-catégorie, fiches détaillées (marque, couleur, tissu, taille, prix, état, lieu), photos stockées sur ton Google Drive, galerie, filtres, recherche par image, mode 🖼️ (rien que les photos, par sous-catégorie) et 💶 (masquer les prix) |
| **📊 Stats** | Écoutes, tâches, films et séries, trajets, poids, alertes, jeux (Steam, League of Legends, chess.com, Clash Royale, CS2, speedrun, GitHub) et appels API |

---

## Configuration

Tout fonctionne sans rien configurer, sauf les modules qui parlent à un service tiers. **Toutes les clés restent sur ton appareil**, aucune n'est dans le code.

| À renseigner | Où | Pour quoi |
|---|---|---|
| Compte Spotify | Bouton vert de connexion | Musique |
| Clé TMDB | TV Time (⚙) ou module API | Séries et films |
| Clé YouTube | TV Time (⚙) ou module API | Chaînes YouTube |
| Clé Gemini (et éventuellement Groq, OpenRouter, Mistral…) | Module API | Tous les assistants IA (Frigo, Santé, Collection, Histoire, Revente, Bon Plan) |
| SteamID64 (+ clé Web API) | Bon Plan ou module API | Liste de souhaits, bibliothèque, statistiques |
| Client ID pCloud | Carte pCloud d'À propos | Sauvegarde pCloud |

**Bon à savoir**
- **Erreur 403 à la connexion Spotify** : ton compte doit être déclaré dans le [Dashboard développeur](https://developer.spotify.com/dashboard) → ton appli → *User Management*. Le Hub affiche désormais la cause exacte de tout échec de connexion.
- **Spotify ne répond pas ?** Ta session est conservée : un bouton **« 📴 Continuer hors ligne »** te fait entrer dans le hub avec ton profil mémorisé. Tout ce qui est local fonctionne normalement.
- **Google Drive** se connecte par **fenêtre pop-up** (pense à les autoriser). ⚠️ Depuis l'**app installée**, Google refuse de renvoyer le jeton : connecte-toi **une fois depuis un onglet Chrome normal**, la connexion est ensuite partagée avec l'app.
- **YouTube se connecte séparément de Drive** (Google interdit de demander les deux ensemble) : bouton dédié dans Actu → Vidéos YouTube.

---

## Sauvegarde & données

- **Export / import JSON**, complet ou par section (Musique, TV Time, Santé, Note, Collection, Vêtement, Comptes & clés…)
- **Trois destinations cloud** au choix : ☁︎ Dropbox, △ Google Drive, ◲ pCloud — sauvegarde et restauration en un bouton
- **Fusion intelligente** à la restauration : rien n'est écrasé bêtement, les compteurs sont repris au maximum (un ré-import ne double jamais tes statistiques)
- Proposition de sauvegarde hebdomadaire, réinitialisation mois/année automatique
- Les photos et les caches rechargeables ne sont volontairement pas embarqués dans les sauvegardes (les photos vivent sur ton Drive)

---

## Technologies

- **React 18.3.1 + Babel Standalone 7.29.7** (CDN, versions épinglées + SRI)
- **Content-Security-Policy** verrouillée : même en cas de XSS, le token Spotify ne peut pas être exfiltré
- **sql.js 1.10.2** (SQLite WASM) et **Leaflet 1.9.4** auto-hébergés dans `vendor/`
- **IndexedDB** pour la persistance · Spotify Web API (refresh token avec rotation + mutex)
- **GitHub Pages** : hébergement statique, aucun serveur, aucune donnée qui sort de ton appareil

## Structure du projet

```
NewSpotifyRelease/
  index.html          → App complète (React 18 CDN + sql.js), tout en un fichier
  manifest.json       → Config PWA
  service-worker.js   → Cache app shell + vendor (offline, network-first)
  vendor/             → sql-wasm.js/.wasm, leaflet.js/.css, motus-*.js (auto-hébergés)
  icon-192.png, icon-512.png
  data/               → actu.json, indices.json (générés par GitHub Actions)
  scripts/            → fetch_actu.py, fetch_indices.py, commit_data.sh
  .github/workflows/  → update-data.yml (cron 2 h, 1 seul commit de données par jour)
  CLAUDE.md           → Doc technique
```

## Base locale (sql.js)

```sql
tracks (id, spotify_uri UNIQUE, artist_name, title, release_title, release_type,
        release_date, cover_url, duration_ms, listened, liked, listened_at, added_at)
artists_scraped (spotify_id PK, last_scraped_at, name, image_url, popularity, followers,
        genres, spotify_url, last_release_count, total_tracks_added, last_scan_status, scan_count)
stats (id=1, total_listened, listened_this_month, listened_this_year,
        last_reset_month, last_reset_year, total_listened_ms, total_liked)
purged_uris (spotify_uri PK)
```

Requêtes utiles depuis la console DevTools :

```js
dbAll("SELECT * FROM tracks WHERE listened = 0 ORDER BY id ASC LIMIT 20")
dbAll("SELECT * FROM tracks WHERE liked = 1 ORDER BY id DESC LIMIT 20")
dbGet("SELECT * FROM stats WHERE id = 1")
dbAll("SELECT * FROM artists_scraped ORDER BY last_scraped_at DESC LIMIT 10")
```

## Aperçu de l'interface

<img src="./assets/images/github/UI.png" alt="Aperçu Spotify+" />

## Auteur

- [Pierre-Portfolio](https://github.com/Pierre-Portfolio/)

---

<p align="center">Projet réalisé en 2026.</p>
