#!/usr/bin/env python3
"""Récupère les VRAIS indices (pas des ETF) depuis Yahoo Finance et écrit data/indices.json.

NASDAQ-100 (^NDX), S&P 500 (^GSPC), CAC 40 (^FCHI) via l'endpoint `chart` v8 de Yahoo
(JSON, gratuit, sans clé). Ce script tourne dans une GitHub Action CÔTÉ SERVEUR : il n'est
donc PAS soumis au CORS (Yahoo n'envoie aucun en-tête CORS) ni au mur de consentement RGPD
que Yahoo impose aux IP européennes des navigateurs. L'app lit ensuite ce JSON en
same-origin (CORS natif, zéro proxy).

En cas d'échec ponctuel sur un symbole, la valeur précédente du JSON est CONSERVÉE
(on ne remplace que les symboles récupérés avec succès).
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SYMBOLS = [
    ("ndq", "^NDX",  "NASDAQ-100"),
    ("spx", "^GSPC", "S&P 500"),
    ("cac", "^FCHI", "CAC 40"),
]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "indices.json")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def fetch(symbol):
    """Renvoie {price, pct} pour un symbole Yahoo, ou None si indisponible."""
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           + urllib.parse.quote(symbol) + "?range=1d&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    meta = data["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose", meta.get("previousClose"))
    if price is None:
        return None
    pct = ((price - prev) / prev * 100) if prev else None
    return {"price": round(price, 2), "pct": round(pct, 2) if pct is not None else None}


def main():
    # Charge l'existant pour préserver les valeurs en cas d'échec ponctuel.
    try:
        with open(OUT, encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        existing = {}
    indices = existing.get("indices", {})

    ok = 0
    for key, sym, name in SYMBOLS:
        try:
            q = fetch(sym)
            if q:
                q["name"] = name
                q["ts"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                indices[key] = q
                ok += 1
                print(f"{name}: {q['price']} ({q['pct']}%)")
            else:
                print(f"!! {name} ({sym}): pas de cours dans la réponse", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — on log et on garde l'ancienne valeur
            print(f"!! {name} ({sym}): {e}", file=sys.stderr)
        time.sleep(1)

    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "indices": indices,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{ok}/{len(SYMBOLS)} symboles mis à jour.")

    # Échec total → sortie non-zéro pour visibilité dans l'Action (le JSON existant
    # n'est pas écrasé par des null : les valeurs précédentes sont conservées).
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
