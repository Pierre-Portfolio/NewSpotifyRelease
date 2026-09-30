# 🧩 YouTube → TV Time (Hub de Pierre)

Extension Chrome / Edge / Brave (Manifest V3) qui remplit le module **TV Time** du
[Hub de Pierre](https://pierre-portfolio.github.io/NewSpotifyRelease/) avec les vidéos
regardées sur youtube.com — y compris quand le Hub est ouvert sur le téléphone.

## Ce qu'elle fait

- **Vidéo vue à 25 %** (réglable) : c'est le temps **réellement lu** qui compte ; les pubs et
  les sauts dans la barre ne comptent pas. Un toast « ✓ Ajoutée à TV Time » le confirme.
- **✨ Résumé IA** : bouton en bas à droite des pages `/watch`. Gemini regarde la vidéo et
  la résume en 5 points (même prompt que le Hub). La vidéo compte alors aussi comme vue,
  et le résumé est repris par le Hub.
- Les deux conditions sont réglables séparément (options) : la première remplie l'ajoute.

## Comment ça arrive dans le Hub

Le Hub n'a pas de serveur et garde TV Time sur chaque appareil. L'extension écrit donc les
vidéos dans ton **Google Drive**, avec la même application Google que le Hub, fichier
`HUB_Pierre/hub-youtube-vus.json` (500 dernières). Le Hub le relit à l'ouverture et à chaque
retour sur l'onglet **tant que Google Drive y est connecté** (session d'environ 1 h), puis
coche chaque vidéo — dans sa chaîne si tu la suis, sinon dans « Hub Pierre ». Une vidéo
décochée à la main dans le Hub ne revient pas.

## Installation

1. `chrome://extensions` → activer le **mode développeur** → **Charger l'extension non
   empaquetée** → choisir ce dossier.
2. L'ID est fixe (clé dans `manifest.json`) : `ipoiohljgccegcbenelbcoggecloogak`. Aucun réglage
   Google à faire : Google renvoie la connexion sur l'adresse du Hub (déjà autorisée), qui la
   relaie aussitôt à l'extension.
3. Options de l'extension → **Connecter Google Drive** (le **même compte** que dans le Hub),
   et coller la **clé Gemini** (la même que dans le module 🔌 API du Hub) pour le résumé.
4. Dans le Hub, Google Drive doit être connecté sur l'appareil (À propos → Sauvegardes cloud).

## Fichiers

| Fichier | Rôle |
|---|---|
| `page.js` | Monde MAIN de YouTube : lit titre / chaîne / durée depuis le lecteur et les passe à `content.js` |
| `content.js` / `content.css` | Compte le temps lu, bouton et panneau ✨ Résumé IA, toast |
| `background.js` | File d'attente, envoi Google Drive (jeton renouvelé sans fenêtre, relecture après écriture), appel Gemini |
| `popup.*`, `options.*`, `ui.css` | État, dernières vidéos, réglages |

## Vie privée

L'extension ne lit que les pages youtube.com. Rien ne part ailleurs que vers ton Google Drive (accès
limité aux fichiers du Hub, scope `drive.file`) et, pour le résumé, vers l'API Gemini avec ta clé. Aucun serveur tiers.
