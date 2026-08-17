#!/usr/bin/env bash
# Commit des données pré-fetchées (data/actu.json, data/indices.json) — UN SEUL
# commit par jour (date UTC).
#
# Les deux fichiers portent un `updated_at` réécrit à chaque run : un run = toujours
# un diff, donc un commit. À 12 runs/jour l'historique du dépôt était noyé. Ici le
# commit du jour est AMENDÉ tant qu'il est en tête de branche → le contenu reste
# rafraîchi toutes les 2 h, mais l'historique ne garde qu'un commit par jour.
#
# ⚠ Amender implique un push forcé : il n'est fait QUE si le commit de tête est celui
# du bot ET porte la date du jour (le message contient la date, donc les deux tests
# tiennent en un). Dès qu'un commit humain passe par-dessus, un nouveau commit est
# créé au lieu d'écraser quoi que ce soit.
set -euo pipefail

FILES=(data/actu.json data/indices.json)
BOT_NAME="github-actions[bot]"
BOT_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
BRANCH="${GITHUB_REF_NAME:-main}"
MSG="chore: données du $(date -u +%F)"

git config user.name "$BOT_NAME"
git config user.email "$BOT_EMAIL"

for attempt in 1 2 3; do
  if [[ -z "$(git status --porcelain -- "${FILES[@]}")" ]]; then
    echo "Données inchangées — rien à committer."
    exit 0
  fi
  git add -- "${FILES[@]}"

  if [[ "$(git log -1 --pretty=%s)" == "$MSG" && "$(git log -1 --pretty=%ae)" == "$BOT_EMAIL" ]]; then
    echo "Commit du jour déjà en tête → amende."
    git commit --quiet --amend -m "$MSG"
    push_args=(--force-with-lease)
  else
    echo "Premier commit de données du jour."
    git commit --quiet -m "$MSG"
    push_args=()
  fi

  if git push "${push_args[@]}" origin "HEAD:$BRANCH"; then
    exit 0
  fi

  # Un push a eu lieu entre le checkout et ici : on rejoue sur le nouveau sommet en
  # gardant NOS fichiers (ils sont plus récents que ceux du distant).
  echo "Push refusé — reprise sur origin/$BRANCH (tentative $attempt/3)."
  tmp="$(mktemp -d)"
  for f in "${FILES[@]}"; do
    [[ -f "$f" ]] && cp "$f" "$tmp/$(basename "$f")"
  done
  git fetch --quiet origin "$BRANCH"
  git reset --quiet --hard "origin/$BRANCH"
  for f in "${FILES[@]}"; do
    [[ -f "$tmp/$(basename "$f")" ]] && cp "$tmp/$(basename "$f")" "$f"
  done
  rm -rf "$tmp"
done

echo "::error::Push impossible après 3 tentatives." >&2
exit 1
