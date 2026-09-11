#!/usr/bin/env python3
"""Récupère le calendrier macro de la SEMAINE et écrit data/macrocal.json.

Alimente « BullRun → 🏛️ Macroéconomie → Événements de la semaine ».

⚠ POURQUOI CÔTÉ SERVEUR. La première version interrogeait le flux depuis le NAVIGATEUR :
l'hôte n'ouvre pas le CORS, il fallait donc passer par des proxies publics, qui sont lents
et tombent souvent — le calendrier restait vide. Un runner GitHub, lui, n'a pas de CORS du
tout. C'est exactement la raison d'être de data/actu.json et data/indices.json : ce qui ne
se fetche pas proprement depuis une page est pré-fetché ici, committé, puis servi
SAME-ORIGIN à l'app, où plus rien ne peut le bloquer.

⚠ Comme pour les indices, l'IP d'un runner GitHub est parfois refusée par les hôtes qui
filtrent les datacenters → on tente le DIRECT, puis les mêmes proxies keyless. `via` note le
relais réellement emprunté ('' = direct), la provenance voyage avec la donnée.

⚠ SÉCURITÉ — ce qui sort d'un relais non choisi est COMMITTÉ puis servi par l'app :
`clean_events` ne garde que des champs typés, coupés en longueur, et refuse un lot qui ne
ressemble pas à un calendrier (trop peu d'entrées, dates hors de la fenêtre). Lot rejeté ⇒
le fichier précédent est conservé, rien n'est écrasé par du bruit.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "macrocal.json")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TIMEOUT = 15
MAX_BODY = 4 * 1024 * 1024

# Calendrier hebdomadaire ForexFactory, publié en JSON libre et sans clé.
SOURCE = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

# Mêmes relais que fetch_indices.py. (gabarit, encode?)
PROXIES = [
    ("https://api.codetabs.com/v1/proxy/?quest={u}", True),
    ("https://api.allorigins.win/raw?url={u}",        True),
    ("https://corsproxy.io/?url={u}",                 True),
    ("https://thingproxy.freeboard.io/fetch/{u}",     False),
]

IMPACT_STARS = {"high": 3, "medium": 2, "low": 1}   # « Holiday » et le reste ⇒ 0
MIN_EVENTS = 5          # en dessous, ce n'est pas une semaine : lot refusé
WINDOW_DAYS = 12        # tolérance autour d'aujourd'hui (le flux couvre la semaine courante)
MAX_EVENTS = 400        # borne dure : un relais bavard ne gonfle pas le dépôt


def _get(url, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(MAX_BODY)


def _txt(v, n):
    """Champ texte d'origine non fiable → str borné, ou '' (jamais None dans le JSON)."""
    if v is None or isinstance(v, (dict, list, bool)):
        return ""
    return str(v).strip()[:n]


def clean_events(raw):
    """Normalise le flux en [{ts, title, cur, stars, forecast, previous}] trié par date.

    `ts` = epoch en SECONDES UTC : l'app le rend en heure LOCALE et range par jour local
    (une publication américaine du soir ne doit pas basculer au lendemain).
    """
    if not isinstance(raw, list):
        return []
    now = datetime.now(timezone.utc)
    lo, hi = now - timedelta(days=WINDOW_DAYS), now + timedelta(days=WINDOW_DAYS)
    out = []
    for e in raw:
        if not isinstance(e, dict):
            continue
        title = _txt(e.get("title"), 140)
        date = e.get("date")
        if not title or not isinstance(date, str):
            continue
        try:
            d = datetime.fromisoformat(date.replace("Z", "+00:00"))
        except ValueError:
            continue
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        if not (lo <= d <= hi):      # hors fenêtre = flux périmé ou relais qui invente
            continue
        out.append({
            "ts": int(d.timestamp()),
            "title": title,
            "cur": _txt(e.get("country") or e.get("currency"), 4).upper(),
            "stars": IMPACT_STARS.get(_txt(e.get("impact"), 12).lower(), 0),
            "forecast": _txt(e.get("forecast"), 20),
            "previous": _txt(e.get("previous"), 20),
        })
    out.sort(key=lambda x: x["ts"])
    return out[:MAX_EVENTS]


def fetch_calendar():
    """Direct puis relais. Renvoie (events, via) ou (None, None)."""
    enc = urllib.parse.quote(SOURCE, safe="")
    attempts = [(SOURCE, "")] + [
        (tmpl.format(u=enc if do_enc else SOURCE), tmpl.split("/")[2])
        for tmpl, do_enc in PROXIES
    ]
    for url, via in attempts:
        label = via or "direct"
        try:
            events = clean_events(json.loads(_get(url)))
            if len(events) >= MIN_EVENTS:
                return events, via
            print(f"   {label}: {len(events)} événement(s) retenu(s) — lot refusé",
                  file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 — relais lent/HS, on tente le suivant
            print(f"   {label}: {exc}", file=sys.stderr)
        time.sleep(0.4)
    return None, None


def main():
    events, via = fetch_calendar()
    if events is None:
        # ⚠ NON FATAL, comme pour les indices : le fichier précédent reste en place et
        # l'app l'affiche. Faire échouer le job enverrait un mail à chaque relais throttlé.
        print("::warning::Calendrier macro non récupéré ce run — "
              "fichier précédent conservé, nouvel essai au prochain run.", file=sys.stderr)
        return
    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "via": via,
        "events": events,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{len(events)} événements écrits"
          + (f"  ⚠ via relais public {via}" if via else "  (direct)"))


if __name__ == "__main__":
    main()
