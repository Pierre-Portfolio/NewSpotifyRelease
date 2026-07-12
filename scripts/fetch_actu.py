#!/usr/bin/env python3
"""Récupère les sources de la section Actu et écrit data/actu.json.

Presse FR (Google News RSS), Tendances (Google Trends RSS), Fuites de données
(bonjourlafuite.eu.org, repli Have I Been Pwned) et Hacker News. Tourne dans une
GitHub Action CÔTÉ SERVEUR : ni CORS ni proxy côté navigateur — l'app statique lit
ensuite data/actu.json en same-origin (les proxies CORS publics utilisés par le
navigateur sont trop peu fiables : throttle, pannes, contenus tronqués).

Comme fetch_indices.py : chaque URL est tentée en DIRECT puis via des proxies HTTP
publics keyless (certains sites bloquent les IP datacenter des runners GitHub), et
la valeur précédente d'une source est CONSERVÉE si toutes les tentatives échouent.
Les formats de sortie sont EXACTEMENT ceux des fetchers client de index.html
(actuFetchPresse/actuFetchTrends/actuFetchLeaks/actuFetchHN) — l'app les affiche
tels quels et garde ses fetchers client en repli si le JSON est périmé (> 24 h).
"""
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "actu.json")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TIMEOUT = 15


def _get(url, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "*/*", "Accept-Language": "fr-FR,fr;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def get_any(url):
    """Direct d'abord (les runners passent en général), puis proxies HTTP publics."""
    enc = urllib.parse.quote(url, safe="")
    tries = [
        url,
        "https://api.codetabs.com/v1/proxy/?quest=" + enc,
        "https://api.allorigins.win/raw?url=" + enc,
    ]
    for u in tries:
        try:
            t = _get(u)
            if t and t.strip():
                return t
        except Exception as e:  # noqa: BLE001 — on tente la source suivante
            print(f"   {u.split('/')[2]}: {e}", file=sys.stderr)
            time.sleep(0.3)
    return None


def decode(s):
    """Entités HTML + retrait des balises (équivalent actuDecode côté client)."""
    if not s:
        return ""
    s = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmllib.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_rss(xml, max_items=12):
    out = []
    for it in re.findall(r"<item[\s>].*?</item>", xml or "", re.S | re.I):
        tm = re.search(r"<title[^>]*>(.*?)</title>", it, re.S | re.I)
        title = decode(tm.group(1)) if tm else ""
        if not title:
            continue
        link = ""
        lm = re.search(r"<link[^>]*>(.*?)</link>", it, re.S | re.I)
        if lm and lm.group(1).strip():
            link = decode(lm.group(1))
        dm = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", it, re.S | re.I)
        sm = re.search(r"<source[^>]*>(.*?)</source>", it, re.S | re.I)
        out.append({
            "title": title,
            "link": link,
            "date": dm.group(1).strip() if dm else None,
            "source": decode(sm.group(1)) if sm else "",
        })
        if len(out) >= max_items:
            break
    return out


def fetch_gnews(feeds):
    """Générique Google News RSS (même logique que actuFetchGNews côté client)."""
    for f in feeds:
        items = parse_rss(get_any(f), 12)
        if items:
            for a in items:  # Google News suffixe «  - Source » → on sépare
                m = re.match(r"^(.*)\s[-–]\s([^-–]+)$", a["title"])
                if m:
                    a["title"] = m.group(1).strip()
                    a["source"] = a["source"] or m.group(2).strip()
            return items
    return []


def gn_search(q):
    return "https://news.google.com/rss/search?q=" + urllib.parse.quote(q) + "&hl=fr&gl=FR&ceid=FR:fr"


def fetch_presse():
    """Même cascade que actuFetchPresse : recherche → À la une → topic Science."""
    return fetch_gnews([
        gn_search("intelligence artificielle OR science OR technologie"),
        "https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr",
        "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=fr&gl=FR&ceid=FR:fr",
    ])


def fetch_monde():
    """Actu Mondial — topic WORLD éditorial (repli : À la une France)."""
    return fetch_gnews([
        "https://news.google.com/rss/headlines/section/topic/WORLD?hl=fr&gl=FR&ceid=FR:fr",
        "https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr",
    ])


def fetch_bourse():
    """Bourse & crypto — recherche financière (repli : topic BUSINESS)."""
    return fetch_gnews([
        gn_search('bourse OR crypto OR bitcoin OR "CAC 40" OR "Wall Street"'),
        "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=fr&gl=FR&ceid=FR:fr",
    ])


def fetch_jeux():
    """Actualité Jeux (vidéo)."""
    return fetch_gnews([
        gn_search('"jeu vidéo" OR "jeux vidéo" OR PlayStation OR Xbox OR Nintendo OR Steam'),
        gn_search("gaming"),
    ])


def fetch_insolite():
    """Actualité Insolite."""
    return fetch_gnews([gn_search("insolite")])


def fetch_trends():
    xml = get_any("https://trends.google.com/trending/rss?geo=FR")
    out = []
    for it in re.findall(r"<item[\s>].*?</item>", xml or "", re.S | re.I):
        tm = re.search(r"<title[^>]*>(.*?)</title>", it, re.S | re.I)
        title = decode(tm.group(1)) if tm else ""
        if not title:
            continue
        traf = re.search(r"<ht:approx_traffic>(.*?)</ht:approx_traffic>", it, re.S | re.I)
        out.append({
            "rank": len(out) + 1,
            "title": title,
            "traffic": decode(traf.group(1)) if traf else "",
            "link": "https://www.google.com/search?q=" + urllib.parse.quote(title),
        })
        if len(out) >= 10:
            break
    return out


def fetch_hn():
    try:
        j = json.loads(get_any("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=12") or "")
        hits = [h for h in j.get("hits", []) if h.get("title")][:12]
        if hits:
            return [{
                "title": h["title"],
                "link": h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                "points": h.get("points") or 0,
                "date": h.get("created_at"),
            } for h in hits]
    except Exception as e:  # noqa: BLE001
        print(f"   HN Algolia: {e}", file=sys.stderr)
    return []


DATE_RE = re.compile(
    r"(\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|"
    r"septembre|octobre|novembre|décembre|decembre)\s+\d{4})|(\d{4}-\d{2}-\d{2})|"
    r"(\d{1,2}/\d{1,2}/\d{4})", re.I)


def fetch_leaks():
    """bonjourlafuite (parseur heuristique, comme actuFetchLeaks) puis repli HIBP."""
    html = get_any("https://bonjourlafuite.eu.org/")
    if html:
        body = re.sub(r"<script.*?</script>|<style.*?</style>|<head.*?</head>", " ", html, flags=re.S | re.I)
        items, seen = [], set()
        for b in re.findall(r"<(?:article|li|tr|h1|h2|h3|h4)[\s>].*?</(?:article|li|tr|h1|h2|h3|h4)>", body, re.S | re.I):
            text = decode(b)
            if not text or len(text) < 3 or len(text) > 220:
                continue
            key = text[:60].lower()
            if key in seen:
                continue
            seen.add(key)
            dm = DATE_RE.search(text)
            hm = re.search(r'href="(https?:[^"]+)"', b, re.I)
            items.append({"text": text, "date": dm.group(0) if dm else None,
                          "link": hm.group(1) if hm else ""})
        dated = [i for i in items if i["date"]]
        if dated:
            return {"items": dated[:10], "needsTuning": False}
    try:
        breaches = json.loads(get_any("https://haveibeenpwned.com/api/v3/breaches") or "")
        rows = [b for b in breaches if b.get("Title") and (b.get("AddedDate") or b.get("BreachDate"))]
        rows.sort(key=lambda b: str(b.get("AddedDate") or b.get("BreachDate")), reverse=True)
        items = [{
            "text": b["Title"] + (f" — {int(b['PwnCount']):,}".replace(",", " ") + " comptes" if b.get("PwnCount") else ""),
            "date": str(b.get("BreachDate") or b.get("AddedDate"))[:10],
            "link": "https://haveibeenpwned.com/PwnedWebsites#" + urllib.parse.quote(b.get("Name") or ""),
        } for b in rows[:10]]
        if items:
            return {"items": items, "needsTuning": False, "via": "hibp"}
    except Exception as e:  # noqa: BLE001
        print(f"   HIBP: {e}", file=sys.stderr)
    return {"items": [], "needsTuning": True}


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        existing = {}

    sources = {
        "presse":   fetch_presse,
        "trends":   fetch_trends,
        "hn":       fetch_hn,
        "leaks":    fetch_leaks,
        "monde":    fetch_monde,
        "bourse":   fetch_bourse,
        "jeux":     fetch_jeux,
        "insolite": fetch_insolite,
    }
    out = {"updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    ok = 0
    for key, fn in sources.items():
        try:
            val = fn()
        except Exception as e:  # noqa: BLE001
            print(f"!! {key}: {e}", file=sys.stderr)
            val = None
        got = bool(val and (val.get("items") if isinstance(val, dict) else val))
        if got:
            out[key] = val
            ok += 1
            n = len(val["items"]) if isinstance(val, dict) else len(val)
            print(f"{key}: {n} entrées")
        else:
            # échec → on conserve la valeur du run précédent (source transitoirement HS)
            if key in existing:
                out[key] = existing[key]
            print(f"!! {key}: indisponible — valeur précédente conservée", file=sys.stderr)
        time.sleep(1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{ok}/{len(sources)} sources mises à jour.")

    # Non fatal si tout échoue (mêmes raisons que fetch_indices.py) : on garde les
    # valeurs précédentes et l'app retombe sur ses fetchers client si le JSON périme.
    if ok == 0:
        print("::warning::Aucune source Actu récupérée ce run — valeurs précédentes "
              "conservées, nouvel essai au prochain run.", file=sys.stderr)


if __name__ == "__main__":
    main()
