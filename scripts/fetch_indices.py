#!/usr/bin/env python3
"""Récupère les VRAIS indices (pas des ETF) et écrit data/indices.json.

NASDAQ-100, S&P 500, CAC 40. Tourne dans une GitHub Action CÔTÉ SERVEUR (pas de CORS).

⚠ Yahoo ET Stooq BLOQUENT les IP datacenter des runners GitHub (Yahoo → 429,
Stooq → 404). Astuce : on passe par des **proxies HTTP publics keyless** (codetabs /
allorigins) qui, eux, interrogent Yahoo depuis LEUR IP (résidentielle/cloud non bloquée)
et nous renvoient le JSON. Côté serveur on n'a pas les soucis navigateur (adblock/DNS) qui
rendaient ces proxies instables pour l'utilisateur. Repli : Stooq (CSV) via le même proxy.

En cas d'échec sur un symbole, la valeur précédente du JSON est CONSERVÉE.
"""
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

# Proxies CORS/HTTP keyless. {u} = URL cible encodée. Le dernier ("") = accès direct.
PROXIES = [
    "https://api.codetabs.com/v1/proxy/?quest={u}",
    "https://api.allorigins.win/raw?url={u}",
    "https://corsproxy.io/?url={u}",
    "",  # direct (échoue probablement depuis le runner, tenté en dernier)
]


def _raw_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def proxied_get(target_url, timeout=30):
    """Récupère target_url en essayant chaque proxy ; le 1er qui répond gagne."""
    enc = urllib.parse.quote(target_url, safe="")
    last = None
    for tmpl in PROXIES:
        url = target_url if tmpl == "" else tmpl.format(u=enc)
        try:
            body = _raw_get(url, timeout)
            if body and body.strip():
                return body
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(0.4)
    if last:
        raise last
    raise RuntimeError("réponse vide de tous les proxies")


def from_yahoo(symbol):
    url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
           + urllib.parse.quote(symbol) + "?range=5d&interval=1d")
    data = json.loads(proxied_get(url))
    meta = data["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose", meta.get("previousClose"))
    if price is None:
        return None
    pct = ((price - prev) / prev * 100) if prev else None
    return {"price": round(price, 2), "pct": round(pct, 2) if pct is not None else None}


def from_stooq(symbol):
    """CSV Stooq : Symbol,Date,Time,Open,High,Low,Close,Volume. Variation = (close-open)/open."""
    url = "https://stooq.com/q/l/?s=" + symbol + "&f=sd2t2ohlcv&h&e=csv"
    txt = proxied_get(url).decode("utf-8", "replace").strip()
    lines = txt.splitlines()
    if len(lines) < 2:
        return None
    cols = lines[1].split(",")
    try:
        opn = float(cols[3])
        close = float(cols[6])
    except (IndexError, ValueError):
        return None
    if close <= 0:
        return None
    pct = ((close - opn) / opn * 100) if opn else None
    return {"price": round(close, 2), "pct": round(pct, 2) if pct is not None else None}


def fetch(syms):
    """Yahoo (via proxy, meilleure variation) d'abord, Stooq (via proxy) en repli."""
    try:
        q = from_yahoo(syms["yahoo"])
        if q:
            return q
    except Exception as e:  # noqa: BLE001
        print(f"   yahoo {syms['yahoo']}: {e}", file=sys.stderr)
    try:
        q = from_stooq(syms["stooq"])
        if q:
            return q
    except Exception as e:  # noqa: BLE001
        print(f"   stooq {syms['stooq']}: {e}", file=sys.stderr)
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
