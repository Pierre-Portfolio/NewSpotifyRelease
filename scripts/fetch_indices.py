#!/usr/bin/env python3
"""Récupère les VRAIS indices (pas des ETF) et écrit data/indices.json.

NASDAQ-100, S&P 500, CAC 40. Tourne dans une GitHub Action CÔTÉ SERVEUR (pas de CORS).

⚠ Depuis un runner GitHub, Yahoo répond 429 et Stooq 404 (IP datacenter bloquées).
Ce qui MARCHE : interroger Yahoo via des **proxies HTTP publics keyless** qui relaient
depuis LEUR IP non bloquée (prouvé : codetabs a renvoyé le NASDAQ-100). On essaie
plusieurs proxies, timeout court, le 1er qui renvoie un JSON valide gagne. Valeur
précédente conservée si tout échoue pour un symbole.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# clé interne, symbole Yahoo, libellé
SYMBOLS = [
    ("ndq", "^NDX",  "NASDAQ-100"),
    ("spx", "^GSPC", "S&P 500"),
    ("cac", "^FCHI", "CAC 40"),
]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "indices.json")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TIMEOUT = 12  # court : on passe vite au proxy suivant

# Proxies keyless. (gabarit, encode?) — {u} = URL Yahoo (encodée si encode=True).
PROXIES = [
    ("https://api.codetabs.com/v1/proxy/?quest={u}", True),
    ("https://api.allorigins.win/raw?url={u}",        True),
    ("https://thingproxy.freeboard.io/fetch/{u}",     False),
    ("https://corsproxy.io/?url={u}",                 True),
]


def _get(url, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_yahoo(symbol, start=0):
    """Récupère le chart Yahoo du symbole via les proxies ; renvoie {price, pct} ou None.
    `start` décale l'ordre des proxies (rotation par symbole) pour ne pas toujours taper
    codetabs en premier → évite que le symbole du milieu se fasse rate-limiter."""
    target = ("https://query1.finance.yahoo.com/v8/finance/chart/"
              + urllib.parse.quote(symbol) + "?range=5d&interval=1d")
    enc = urllib.parse.quote(target, safe="")
    n = len(PROXIES)
    for i in range(n):
        tmpl, do_enc = PROXIES[(start + i) % n]
        url = tmpl.format(u=enc if do_enc else target)
        try:
            data = json.loads(_get(url))
            meta = data["chart"]["result"][0]["meta"]
            price = meta.get("regularMarketPrice")
            prev = meta.get("chartPreviousClose", meta.get("previousClose"))
            if price is None:
                continue
            pct = ((price - prev) / prev * 100) if prev else None
            return {"price": round(price, 2), "pct": round(pct, 2) if pct is not None else None}
        except Exception as e:  # noqa: BLE001 — proxy lent/HS, on tente le suivant
            print(f"   {tmpl.split('/')[2]} {symbol}: {e}", file=sys.stderr)
            time.sleep(0.3)
    return None


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        existing = {}
    indices = existing.get("indices", {})

    # Jusqu'à 3 passes : à chaque passe on ne retente que les symboles encore manquants,
    # avec une rotation de proxy différente et une pause croissante (les proxies keyless
    # rate-limitent les appels rapprochés → c'est souvent le symbole du milieu qui rate).
    pending = list(enumerate(SYMBOLS))  # [(idx, (key, sym, name)), ...]
    ok = 0
    for attempt in range(3):
        if not pending:
            break
        if attempt:
            time.sleep(4)  # laisse retomber le rate-limit des proxies entre deux passes
        still = []
        for idx, (key, sym, name) in pending:
            q = fetch_yahoo(sym, start=idx + attempt)  # rotation par symbole ET par passe
            if q:
                q["name"] = name
                q["ts"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                indices[key] = q
                ok += 1
                print(f"{name}: {q['price']} ({q['pct']}%)")
            else:
                still.append((idx, (key, sym, name)))
            time.sleep(2)  # espace les appels (limite de débit des proxies)
        pending = still
    for idx, (key, sym, name) in pending:
        print(f"!! {name}: indisponible — valeur précédente conservée", file=sys.stderr)

    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "indices": indices,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{ok}/{len(SYMBOLS)} symboles mis à jour.")

    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
