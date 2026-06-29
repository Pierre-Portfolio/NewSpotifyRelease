#!/usr/bin/env python3
"""Récupère les VRAIS indices (pas des ETF) et écrit data/indices.json.

NASDAQ-100, S&P 500, CAC 40. Ce script tourne dans une GitHub Action CÔTÉ SERVEUR :
pas de souci CORS. ⚠ MAIS Yahoo bloque les IP datacenter (runners GitHub) en 429 sans
session cookie/crumb. On interroge donc :
  1) Stooq (CSV, sans clé, fiable depuis un CI) — source PRINCIPALE
  2) Yahoo Finance (endpoint chart v8) avec flux cookie + crumb — REPLI

En cas d'échec sur un symbole, la valeur précédente du JSON est CONSERVÉE
(on ne remplace que les symboles récupérés avec succès).
"""
import http.cookiejar
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# clé interne, { yahoo, stooq }, libellé
SYMBOLS = [
    ("ndq", {"yahoo": "^NDX",  "stooq": "^ndq"}, "NASDAQ-100"),
    ("spx", {"yahoo": "^GSPC", "stooq": "^spx"}, "S&P 500"),
    ("cac", {"yahoo": "^FCHI", "stooq": "^cac"}, "CAC 40"),
]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "indices.json")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Opener partagé avec cookie jar (nécessaire pour le crumb Yahoo).
_opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def _get(url, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
    })
    with _opener.open(req, timeout=timeout) as r:
        return r.read()


def from_stooq(symbol):
    """CSV Stooq : Symbol,Date,Time,Open,High,Low,Close,Volume. Variation = (close-open)/open."""
    url = ("https://stooq.com/q/l/?s=" + urllib.parse.quote(symbol)
           + "&f=sd2t2ohlcv&h&e=csv")
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


def _yahoo_crumb():
    """Réchauffe une session (cookie) puis récupère un crumb. None si indisponible."""
    try:
        _get("https://fc.yahoo.com/")  # pose le cookie (renvoie souvent 404, ignoré)
    except Exception:
        pass
    try:
        return _get("https://query1.finance.yahoo.com/v1/test/getcrumb").decode().strip() or None
    except Exception:
        return None


def from_yahoo(symbol, crumb):
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           + urllib.parse.quote(symbol) + "?range=5d&interval=1d")
    if crumb:
        url += "&crumb=" + urllib.parse.quote(crumb)
    data = json.loads(_get(url))
    meta = data["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose", meta.get("previousClose"))
    if price is None:
        return None
    pct = ((price - prev) / prev * 100) if prev else None
    return {"price": round(price, 2), "pct": round(pct, 2) if pct is not None else None}


def fetch(syms):
    """Stooq d'abord, Yahoo (cookie+crumb) en repli. Renvoie {price, pct} ou None."""
    try:
        q = from_stooq(syms["stooq"])
        if q:
            return q
    except Exception as e:
        print(f"   stooq {syms['stooq']}: {e}", file=sys.stderr)
    try:
        q = from_yahoo(syms["yahoo"], fetch._crumb)
        if q:
            return q
    except Exception as e:
        print(f"   yahoo {syms['yahoo']}: {e}", file=sys.stderr)
    return None


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        existing = {}
    indices = existing.get("indices", {})

    fetch._crumb = _yahoo_crumb()  # une seule fois, partagé par les replis Yahoo

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
            print(f"!! {name}: indisponible (Stooq + Yahoo) — valeur précédente conservée",
                  file=sys.stderr)
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

    if ok == 0:
        sys.exit(1)  # échec total → visible dans l'Action, JSON existant non écrasé


if __name__ == "__main__":
    main()
