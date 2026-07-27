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
from email.utils import parsedate_to_datetime

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
        # URL du site source (attribut url de <source>, fourni par Google News) —
        # sert au favicon de secours côté client quand l'article n'a pas de photo
        su = re.search(r'<source[^>]+url="([^"]+)"', it, re.I)
        # Photo de l'article si le flux la fournit (même logique que actuParseRss client)
        image = ""
        im = (re.search(r'<media:content[^>]+url="([^"]+)"', it, re.I)
              or re.search(r'<media:thumbnail[^>]+url="([^"]+)"', it, re.I)
              or re.search(r'<enclosure[^>]+url="([^"]+)"[^>]*type="image', it, re.I)
              or re.search(r'<enclosure[^>]+type="image[^"]*"[^>]*url="([^"]+)"', it, re.I))
        if im:
            image = im.group(1)
        if not image:
            di = re.search(r'<img[^>]+src="([^"]+)"', it, re.I)
            if di:
                image = di.group(1)
        out.append({
            "title": title,
            "link": link,
            "date": dm.group(1).strip() if dm else None,
            "source": decode(sm.group(1)) if sm else "",
            "sourceUrl": htmllib.unescape(su.group(1)) if su else "",
            "image": decode(image),
        })
        if len(out) >= max_items:
            break
    return out


# ── Vraies images d'article ─────────────────────────────────────────────
# Les flux Google News ne fournissent AUCUNE image et leurs liens sont des
# redirections opaques (news.google.com/rss/articles/<id>). Pour afficher une
# image qui REPRÉSENTE l'article (et pas un simple favicon), on :
#   1. décode le lien Google News → URL réelle de l'article (page GN → attributs
#      data-n-a-sg/ts → POST interne DotsSplashUi/batchexecute, technique
#      « googlenewsdecoder » — aucun autre moyen : l'id AU_yqL… n'est plus
#      décodable en base64 depuis mi-2023) ;
#   2. lit l'og:image (ou twitter:image) de la page de l'article.
# Résultats mis en cache dans actu.json (clé "images", id GN → URL d'image,
# "" = article sans og:image, déjà tenté) : les flux bougent peu entre deux
# runs (cron 2 h) → quelques décodages par run seulement. Échec réseau → pas
# de cache (retenté au prochain run) ; échec définitif → le client garde son
# repli favicon (actuThumb). Budget par run pour borner la durée de l'Action.
GN_BATCH_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute"
IMG_BUDGET = 40          # décodages max par run (≈ 3 requêtes chacun)
IMG_TIMEOUT = 8


def _post(url, body, timeout=IMG_TIMEOUT):
    req = urllib.request.Request(url, data=body.encode(), headers={
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def gn_id(link):
    m = re.search(r"news\.google\.com/rss/articles/([^?/&#]+)", link or "")
    return m.group(1) if m else None


def gn_decode(link, art_id):
    """Lien Google News → URL réelle de l'article (None si indécodable)."""
    page = _get(link, timeout=IMG_TIMEOUT)
    sg = re.search(r'data-n-a-sg="([^"]+)"', page)
    ts = re.search(r'data-n-a-ts="([^"]+)"', page)
    if not (sg and ts):
        return None
    inner = json.dumps([
        "garturlreq",
        [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1,
          None, None, None, None, None, 0, 1],
         "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0],
        art_id, int(ts.group(1)), sg.group(1),
    ])
    body = "f.req=" + urllib.parse.quote(json.dumps([[["Fbv4je", inner, None, "generic"]]]))
    res = _post(GN_BATCH_URL, body)
    # Réponse batchexecute : préfixe anti-XSSI « )]}' » puis blocs JSON préfixés
    # de leur taille — on parse le 1er tableau rencontré (raw_decode tolère la suite).
    i = res.find("[")
    if i >= 0:
        try:
            outer, _ = json.JSONDecoder().raw_decode(res[i:])
            for el in outer:
                if isinstance(el, list) and len(el) > 2 and el[0] == "wrb.fr" and el[2]:
                    dec = json.loads(el[2])
                    if dec and dec[0] == "garturlres" and str(dec[1]).startswith("http"):
                        return dec[1]
        except Exception:  # noqa: BLE001 — repli regex ci-dessous
            pass
    m = re.search(r'\\"garturlres\\",\\"(https?://[^"\\]+)', res)
    return m.group(1) if m else None


def og_image(article_url):
    """og:image / twitter:image de la page article (None si absente)."""
    req = urllib.request.Request(article_url, headers={
        "User-Agent": UA, "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=IMG_TIMEOUT) as r:
        html = r.read(262144).decode("utf-8", "replace")   # 256 Ko suffisent pour le <head>
        base = r.geturl()
    for pat in (
        r'<meta[^>]+(?:property|name)=["\']og:image(?::url)?["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)',
    ):
        m = re.search(pat, html, re.I)
        if m:
            url = urllib.parse.urljoin(base, htmllib.unescape(m.group(1)).strip())
            if url.startswith("http"):
                return url
    return None


def enrich_images(items, old_cache, new_cache, budget):
    """Complète a["image"] des items Google News qui n'en ont pas (voir bloc ci-dessus)."""
    for a in items:
        aid = gn_id(a.get("link", ""))
        if a.get("image"):
            if aid:
                new_cache[aid] = a["image"]
            continue
        if not aid:
            continue                       # lien direct sans image de flux : favicon client
        if aid in new_cache:               # même article déjà traité (autre section)
            a["image"] = new_cache[aid]
            continue
        if aid in old_cache:               # résolu (ou tenté sans og:image) à un run précédent
            a["image"] = old_cache[aid]
            new_cache[aid] = old_cache[aid]
            continue
        if budget[0] <= 0:
            continue                       # le prochain run (cache aidant) finira le travail
        budget[0] -= 1
        try:
            real = gn_decode(a["link"], aid)
            img = og_image(real) if real else None
            a["image"] = img or ""
            # Décodage OK mais pas d'og:image → "" caché (inutile de retenter) ;
            # article indécodable/erreur réseau → PAS de cache, retenté au prochain run.
            if real:
                new_cache[aid] = img or ""
        except Exception as e:  # noqa: BLE001 — transitoire : on retentera
            print(f"   image {aid[:24]}…: {e}", file=sys.stderr)
        time.sleep(0.5)                    # ménage le endpoint interne Google


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


def fetch_cyber():
    """Cyber Secu — failles, ransomwares, cyberattaques & piratages (repli : EN)."""
    return fetch_gnews([
        gn_search('cybersécurité OR "faille de sécurité" OR ransomware OR cyberattaque OR piratage'),
        gn_search('cybersecurity OR "data breach"'),
    ])


def fetch_insolite():
    """Actualité Insolite."""
    return fetch_gnews([gn_search("insolite")])


LINKEDIN_MAX_DAYS = 30  # ne garder qu'un mois de parutions (miroir d'ACTU_LI_MAX_DAYS client)


def item_time(a):
    """Date de parution d'un item en timestamp, None si absente/illisible."""
    d = (a or {}).get("date")
    if not d:
        return None
    try:
        return parsedate_to_datetime(d).timestamp()
    except Exception:
        pass
    try:
        return datetime.fromisoformat(d.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def recent_first(items, max_days):
    """Jette les parutions plus vieilles que max_days, trie de la plus récente à la plus
    ancienne. Un item sans date lisible est gardé mais renvoyé en fin de liste (on ne peut
    pas juger de sa fraîcheur). Miroir exact d'actuRecentFirst côté client."""
    floor = time.time() - max_days * 86400 if max_days else None
    kept = [a for a in (items or []) if item_time(a) is None or not floor or item_time(a) >= floor]
    return sorted(kept, key=lambda a: (item_time(a) is None, -(item_time(a) or 0)))


def fetch_linkedin():
    """Articles PUBLIÉS SUR LinkedIn (Pulse / LinkedIn News), repli : actu du réseau pro.

    LinkedIn n'expose aucune API publique de lecture (partenaires uniquement, OAuth avec
    client_secret, pas de CORS, pas de RSS) : on passe donc par Google News restreint au
    domaine linkedin.com pour ramener du contenu VENANT de LinkedIn.

    ⚠ Fraîcheur : une recherche `site:` est classée par PERTINENCE, d'où des articles vieux
    de ~300 jours. Chaque requête est bornée par l'opérateur `when:<N>d` et le résultat
    repasse par recent_first (filtre + tri parution décroissante), car `when:` est parfois
    ignoré sur les requêtes à opérateurs.
    """
    w = " when:%dd" % LINKEDIN_MAX_DAYS
    items = fetch_gnews([
        gn_search("site:linkedin.com" + w),
        gn_search("site:linkedin.com/pulse OR site:linkedin.com/posts" + w),
        gn_search("LinkedIn" + w),
        gn_search('LinkedIn OR "réseau professionnel" OR "monde du travail"' + w),
    ])
    return recent_first(items, LINKEDIN_MAX_DAYS)


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


def fetch_leaks():
    """bonjourlafuite (parseur heuristique, comme actuFetchLeaks) puis repli HIBP."""
    html = get_any("https://bonjourlafuite.eu.org/")
    if html:
        # Chaque fuite = un <h2> qui contient une ancre interne « #<nom>-AAAA-MM-JJ » (la date
        # ISO est portée par l'ancre, PAS dans le texte du titre). Page antéchronologique →
        # on garde les 10 premières.
        items, seen = [], set()
        for inner in re.findall(r"<h2\b[^>]*>(.*?)</h2>", html, re.S | re.I):
            dm = re.search(r'href="#[^"]*?(\d{4}-\d{2}-\d{2})"', inner, re.I)
            if not dm:
                continue
            text = decode(inner)
            if not text or len(text) < 2 or len(text) > 220:
                continue
            key = text[:60].lower()
            if key in seen:
                continue
            seen.add(key)
            anchor = re.search(r'href="(#[^"]+)"', inner, re.I)
            items.append({"text": text, "date": dm.group(1),
                          "link": "https://bonjourlafuite.eu.org/" + (anchor.group(1) if anchor else "")})
            if len(items) >= 10:
                break
        if items:
            return {"items": items, "needsTuning": False}
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
        "linkedin": fetch_linkedin,
        "bourse":   fetch_bourse,
        "cyber":    fetch_cyber,
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

    # Vraies images d'article pour les sections Google News (voir enrich_images).
    # Cache "images" reconstruit à chaque run : seuls les ids ENCORE présents dans
    # les flux sont conservés → taille bornée (≤ 60 entrées).
    old_cache = existing.get("images") or {}
    new_cache = {}
    budget = [IMG_BUDGET]
    for key in ("presse", "monde", "linkedin", "bourse", "cyber", "jeux", "insolite"):
        if isinstance(out.get(key), list):
            enrich_images(out[key], old_cache, new_cache, budget)
    out["images"] = new_cache
    total = sum(len(out.get(k) or []) for k in ("presse", "monde", "linkedin", "bourse", "cyber", "jeux", "insolite"))
    withimg = sum(1 for k in ("presse", "monde", "linkedin", "bourse", "cyber", "jeux", "insolite")
                  for a in (out.get(k) or []) if a.get("image"))
    print(f"images: {withimg}/{total} articles illustrés ({IMG_BUDGET - budget[0]} décodages ce run)")

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
