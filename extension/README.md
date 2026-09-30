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
vidéos dans le **dossier Dropbox du Hub** (même application Dropbox), fichier
`/hub-youtube-vus.json` (500 dernières). Le Hub le relit à l'ouverture et à chaque retour
sur l'onglet, puis coche chaque vidéo — dans sa chaîne si tu la suis, sinon dans
« Hub Pierre ». Une vidéo décochée à la main dans le Hub ne revient pas.

## Installation

1. `chrome://extensions` → activer le **mode développeur** → **Charger l'extension non
   empaquetée** → choisir ce dossier.
2. L'ID est fixe (clé dans `manifest.json`) : `ipoiohljgccegcbenelbcoggecloogak`.
3. **Une seule fois**, dans la console Dropbox de l'app du Hub
   (dropbox.com/developers/apps → *Settings* → *OAuth 2 · Redirect URIs*), ajouter :
   `https://ipoiohljgccegcbenelbcoggecloogak.chromiumapp.org/`
4. Options de l'extension → **Connecter Dropbox**, et coller la **clé Gemini** (la même que
   dans le module 🔌 API du Hub) pour le résumé.
5. Dans le Hub, Dropbox doit être connecté sur chaque appareil (À propos → Sauvegarde).

## Fichiers

| Fichier | Rôle |
|---|---|
| `page.js` | Monde MAIN de YouTube : lit titre / chaîne / durée depuis le lecteur et les passe à `content.js` |
| `content.js` / `content.css` | Compte le temps lu, bouton et panneau ✨ Résumé IA, toast |
| `background.js` | File d'attente, envoi Dropbox (PKCE, écriture sur révision, rejeu si conflit), appel Gemini |
| `popup.*`, `options.*`, `ui.css` | État, dernières vidéos, réglages |

## Vie privée

L'extension ne lit que les pages youtube.com. Rien ne part ailleurs que vers Dropbox (ton
dossier d'application) et, pour le résumé, vers l'API Gemini avec ta clé. Aucun serveur tiers.
