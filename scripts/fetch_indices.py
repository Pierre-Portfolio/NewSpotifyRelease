#!/usr/bin/env python3
"""Récupère les VRAIS indices (pas des ETF) et écrit data/indices.json.

NASDAQ-100, S&P 500, CAC 40. Tourne dans une GitHub Action CÔTÉ SERVEUR (pas de CORS).

Source : **Stooq** (CSV, sans clé). ⚠ Le runner GitHub ATTEINT bien Stooq (il renvoyait un
404 propre, pas un blocage IP) — le 404 venait du `^` percent-encodé en `%5E`. On met donc
le caret BRUT dans l'URL (pas de quote()). Yahoo en repli rapide (renvoie 429 vite depuis un
runner, sans bloquer). En cas d'échec, la valeur précédente du JSON est CONSERVÉE.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# clé interne, { stooq (caret BRUT), yahoo }, libellé
SYMBOLS = [
    ("ndq", {"stooq": "^ndq", "yahoo": "^NDX"},  "NASDAQ-100"),
    ("spx", {"stooq": "^spx", "yahoo": "^GSPC"}, "S&P 500"),
    ("cac", {"stooq": "^cac", "yahoo": "^FCHI"}, "CAC 40"),
]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "indices.json")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def _get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def from_stooq(symbol):
    """CSV Stooq : Symbol,Date,Time,Open,High,Low,Close,Volume. ⚠ caret BRUT (pas de quote)."""
    url = "https://stooq.com/q/l/?s=" + symbol + "&f=sd2t2ohlcv&h&e=csv"
    txt = _get(url).decode("utf-8", "replace").strip()
    lines = txt.splitlines()
    if len(lines) < 2:
        return None
    cols = lines[1].split(",")
    try:
        opn = float(cols[3])
        close = float(cols[6])
    except (IndexError, ValueError):
        return None  # "N/D" hors séance, etc.
    if close <= 0:
        return None
    pct = ((close - opn) / opn * 100) if opn else None
    return {"price": round(close, 2), "pct": round(pct, 2) if pct is not None else None}


def from_yahoo(symbol):
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           + urllib.parse.quote(symbol) + "?range=5d&interval=1d")
    data = json.loads(_get(url))
    meta = data["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose", meta.get("previousClose"))
    if price is None:
        return None
    pct = ((price - prev) / prev * 100) if prev else None
    return {"price": round(price, 2), "pct": round(pct, 2) if pct is not None else None}


def fetch(syms):
    """Stooq (direct, caret brut) d'abord ; Yahoo direct en repli (rapide même en échec)."""
    try:
        q = from_stooq(syms["stooq"])
        if q:
            return q
    except Exception as e:  # noqa: BLE001
        print(f"   stooq {syms['stooq']}: {e}", file=sys.stderr)
    try:
        q = from_yahoo(syms["yahoo"])
        if q:
            return q
    except Exception as e:  # noqa: BLE001
        print(f"   yahoo {syms['yahoo']}: {e}", file=sys.stderr)
    return None


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        existing = {}
    indices = existing.get("indices", {})

    ok = 0
    for key, syms, name in SYMBOLS:
        q = fetch(syms)
        if q:
            q["name"] = name
            q["ts"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            indices[key] = q
            ok += 1
            print(f"{name}: {q['price']} ({q['pct']}%)")
        else:
            print(f"!! {name}: indisponible — valeur précédente conservée", file=sys.stderr)
        time.sleep(0.5)

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
