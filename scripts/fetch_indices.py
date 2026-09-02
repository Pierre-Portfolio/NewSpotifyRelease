#!/usr/bin/env python3
"""Récupère les VRAIS indices (pas des ETF) et écrit data/indices.json.

NASDAQ-100, S&P 500, CAC 40. Tourne dans une GitHub Action CÔTÉ SERVEUR (pas de CORS).

⚠ Depuis un runner GitHub, Yahoo répond 429 et Stooq 404 (IP datacenter bloquées).
Ce qui MARCHE : interroger Yahoo via des **proxies HTTP publics keyless** qui relaient
depuis LEUR IP non bloquée (prouvé : codetabs a renvoyé le NASDAQ-100). On essaie
plusieurs proxies, timeout court, le 1er qui renvoie un JSON valide gagne. Valeur
précédente conservée si tout échoue pour un symbole.

⚠ SÉCURITÉ — ces relais sont des tiers non choisis, et ce qu'ils renvoient est COMMITTÉ
dans le dépôt puis servi same-origin par l'app : un relais défaillant ou hostile pouvait
afficher le CAC 40 au chiffre qu'il voulait, sans que rien ne le signale. Deux garde-fous,
calqués sur ce que fetch_actu.py fait déjà pour l'actualité :
  · `check_quote` refuse ce qui n'est pas un nombre fini positif, et refuse un écart de plus
    de MAX_MOVE_PCT avec la dernière valeur connue (un indice ne saute pas de 25 % en 2 h :
    les coupe-circuits américains arrêtent la séance bien avant) → valeur précédente gardée ;
  · `via` note, par symbole, le relais réellement emprunté ('' = direct). L'app l'affiche.
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
MAX_BODY = 1024 * 1024  # lecture bornée : un relais qui déverse des Mo ne doit pas tuer le runner
# Écart maximal toléré avec la dernière valeur connue. Généreux à dessein : il ne s'agit pas
# de juger le marché mais d'écarter une valeur ABSURDE (relais qui renvoie autre chose, unité
# différente, chiffre inventé). Les coupe-circuits US arrêtent la séance à −20 %.
MAX_MOVE_PCT = 25.0

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
        return r.read(MAX_BODY)


def check_quote(q, previous):
    """Le cours est-il PLAUSIBLE ? Renvoie None (à rejeter) ou le dict tel quel.

    Ce qui vient d'un relais public n'est pas une donnée de confiance : on refuse ce qui
    n'est pas un nombre fini strictement positif, et un écart de plus de MAX_MOVE_PCT avec
    la dernière valeur connue. Sans valeur précédente (premier run), seul le type est testé.
    """
    price = q.get("price")
    if isinstance(price, bool) or not isinstance(price, (int, float)):
        return None
    if not (price == price) or price in (float("inf"), float("-inf")) or price <= 0:
        return None
    pct = q.get("pct")
    if pct is not None and (isinstance(pct, bool) or not isinstance(pct, (int, float))
                            or not (pct == pct) or abs(pct) > MAX_MOVE_PCT):
        q["pct"] = None
    old = (previous or {}).get("price")
    if isinstance(old, (int, float)) and not isinstance(old, bool) and old > 0:
        move = abs(price - old) / old * 100
        if move > MAX_MOVE_PCT:
            print(f"   !! écart invraisemblable ({move:.1f} % vs {old}) — valeur rejetée",
                  file=sys.stderr)
            return None
    return q


def fetch_yahoo(symbol, start=0):
    """Récupère le chart Yahoo du symbole via les proxies ; renvoie {price, pct, via} ou None.
    `start` décale l'ordre des proxies (rotation par symbole) pour ne pas toujours taper
    codetabs en premier → évite que le symbole du milieu se fasse rate-limiter.

    `via` = hôte du relais réellement emprunté ('' si un jour l'appel direct passe) :
    la provenance voyage avec la valeur, jusqu'à l'app."""
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
            # ⚠ `or` et non le défaut de `.get` : Yahoo renvoie parfois la clé
            # `chartPreviousClose` AVEC la valeur null, et `dict.get(k, defaut)` teste la
            # PRÉSENCE de la clé, pas sa valeur — le repli `previousClose` n'était donc
            # jamais utilisé et la variation tombait à None alors qu'elle était calculable.
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            if price is None:
                continue
            pct = ((price - prev) / prev * 100) if prev else None
            return {"price": round(price, 2),
                    "pct": round(pct, 2) if pct is not None else None,
                    "via": tmpl.split("/")[2]}
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
            # ⚠ Contrôle de plausibilité AVANT d'accepter : ce chiffre vient d'un relais
            # public et part droit dans le dépôt. Rejeté ⇒ on garde la valeur précédente et
            # on retente à la passe suivante (avec un autre relais, grâce à la rotation).
            q = check_quote(q, indices.get(key)) if q else None
            if q:
                q["name"] = name
                q["ts"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                indices[key] = q
                ok += 1
                relay = q.get("via")
                print(f"{name}: {q['price']} ({q['pct']}%)"
                      + (f"  ⚠ via relais public {relay}" if relay else ""))
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

    # ⚠ On NE fait PAS échouer le job si ok == 0 : un échec de fetch est NON FATAL
    # (les valeurs précédentes du JSON sont conservées) et c'est un proxy public
    # transitoirement throttlé, pas un bug. Faire échouer enverrait un mail "Run failed"
    # inutile à chaque run malchanceux. On log juste un avertissement (visible dans l'Action).
    if ok == 0:
        print("::warning::Aucun indice récupéré ce run (proxies throttlés) — "
              "valeurs précédentes conservées, nouvel essai au prochain run.", file=sys.stderr)


if __name__ == "__main__":
    main()
