#!/usr/bin/env python3
"""Récupère les bons plans du module Bon Plan et écrit data/deals.json.

Sources (toutes lues CÔTÉ SERVEUR par la GitHub Action, donc sans CORS ni proxy
navigateur — c'est ce qui rendait le module muet : Steam et Dealabs n'envoient aucun
en-tête CORS et les relais publics tombent sans prévenir) :
  • Dealabs        — flux RSS « hot » et « nouveaux » (prix et marchand dans
                     <pepper:merchant>, repli sur le prix lu dans le titre) ;
  • Le Dénicheur   — page « bons plans » : AUCUNE API publique, lecture best effort des
                     données JSON embarquées (JSON-LD puis blobs de script) ;
  • Steam          — offres du jour (featuredcategories, prix en euros réels) ;
  • Epic Games     — jeux offerts / promos en cours (fenêtre startDate/endDate testée) ;
  • CheapShark     — meilleures promos PC (~20 boutiques, USD converti au taux BCE) ;
  • GamerPower     — jeux PC offerts toutes boutiques confondues ;
  • BCE            — taux USD→EUR (sert aussi au client, à la place de Frankfurter).

Une source en échec garde la valeur du run précédent. Chaque offre a la même forme
côté client : {id, title, link, price, old, pct, merchant, image, date, ...} — prix en
EUROS (None = inconnu, 0 = gratuit).
"""
import json
import os
import re
import sys
import time
import zlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_actu import _get, decode, get_any, via_reset, via_seen  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "deals.json")
DEALABS_MAX = 50
GAMES_MAX = 60


def _num(s):
    """« 1 299,99 € » / « 19.99 » / 19.99 → float ; « gratuit » → 0 ; sinon None."""
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    t = str(s).strip().lower()
    if not t:
        return None
    if "gratuit" in t or t in ("free", "0"):
        return 0.0
    m = re.search(r"\d[\d\s  .]*(?:,\d{1,2})?", t)
    if not m:
        return None
    v = re.sub(r"[\s  ]", "", m.group(0))
    if "," in v:
        v = v.replace(".", "").replace(",", ".")
    elif v.count(".") > 1 or re.search(r"\.\d{3}$", v):
        v = v.replace(".", "")
    try:
        return float(v)
    except ValueError:
        return None


def _ms(date_str):
    try:
        return int(parsedate_to_datetime(date_str).timestamp() * 1000)
    except Exception:  # noqa: BLE001
        return None


# ── Dealabs ──────────────────────────────────────────────────────────────
# Prix d'un titre Dealabs : « Écouteurs XYZ à 19,99€ (via ODR) » → 19.99. Le DERNIER
# prix du titre est le bon (le premier est souvent le prix barré « 49€ → 19€ »).
TITLE_PRICE = re.compile(r"(\d[\d\s  .]*(?:,\d{1,2})?)\s?€")


def parse_dealabs(xml, max_items=DEALABS_MAX):
    out = []
    for it in re.findall(r"<item[\s>].*?</item>", xml or "", re.S | re.I):
        tm = re.search(r"<title[^>]*>(.*?)</title>", it, re.S | re.I)
        title = decode(tm.group(1)) if tm else ""
        if not title:
            continue
        lm = re.search(r"<link[^>]*>(.*?)</link>", it, re.S | re.I)
        link = decode(lm.group(1)) if lm else ""
        if not link.startswith("https://"):
            continue
        dm = re.search(r"<pubDate[^>]*>(.*?)</pubDate>", it, re.S | re.I)
        mer = re.search(r"<pepper:merchant([^>]*)/?>", it, re.I)
        merchant, price = "", None
        if mer:
            nm = re.search(r'name="([^"]*)"', mer.group(1))
            pm = re.search(r'price="([^"]*)"', mer.group(1))
            merchant = decode(nm.group(1)) if nm else ""
            price = _num(decode(pm.group(1))) if pm else None
        if price is None:
            prices = TITLE_PRICE.findall(re.sub(r"au lieu de\s+\d[\d\s.,]*\s?€", " ", title, flags=re.I))
            if prices:
                price = _num(prices[-1])
            elif re.search(r"\bgratuit", title, re.I):
                price = 0.0
        old = None
        desc_m = re.search(r"<description[^>]*>(.*?)</description>", it, re.S | re.I)
        desc = decode(desc_m.group(1)) if desc_m else ""
        om = re.search(r"au lieu de\s+(\d[\d\s.,]*)\s?€", desc + " " + title, re.I)
        if om:
            old = _num(om.group(1))
        im = (re.search(r'<media:content[^>]+url="([^"]+)"', it, re.I)
              or re.search(r'<media:thumbnail[^>]+url="([^"]+)"', it, re.I)
              or re.search(r'<enclosure[^>]+url="([^"]+)"', it, re.I)
              or re.search(r'<img[^>]+src="([^"]+)"', it, re.I))
        cats = [decode(c) for c in re.findall(r"<category[^>]*>(.*?)</category>", it, re.S | re.I)]
        tp = re.search(r"<pepper:temperature[^>]*>(.*?)</pepper:temperature>", it, re.S | re.I) \
            or re.search(r'temperature="([^"]+)"', it, re.I)
        idm = re.search(r"-(\d{4,})(?:[/?#]|$)", link)
        out.append({
            "id": "dl" + (idm.group(1) if idm else str(zlib.crc32(link.encode()))),
            "title": title,
            "link": link,
            "price": price,
            "old": old if (old and price is not None and old > price) else None,
            "merchant": merchant,
            "image": decode(im.group(1)) if im else "",
            "date": _ms(dm.group(1).strip()) if dm else None,
            "cat": [c for c in cats if c][:3],
            "temp": _num(decode(tp.group(1))) if tp else None,
            "desc": desc[:220],
        })
        if len(out) >= max_items:
            break
    return out


def fetch_dealabs():
    res = {}
    for key, url in (("hot", "https://www.dealabs.com/rss/hot"),
                     ("new", "https://www.dealabs.com/rss/new")):
        xml = get_any(url)
        items = parse_dealabs(xml) if xml else []
        if items:
            res[key] = items
        time.sleep(0.5)
    return res or None


# ── Le Dénicheur ─────────────────────────────────────────────────────────
# Aucune API publique : la page « bons plans » embarque ses produits en JSON (JSON-LD
# et/ou état d'application dans un <script>). On parcourt TOUT objet qui ressemble à un
# produit (nom + prix + lien) — si le site change de structure, la liste revient vide
# et l'app le dit, plutôt que d'afficher des prix inventés.
DN_BASE = "https://ledenicheur.fr"


def _dn_price(o):
    for k in ("price", "lowestPrice", "currentPrice", "amount", "priceInclVat", "regular"):
        v = o.get(k)
        if isinstance(v, dict):
            for kk in ("amount", "value", "inclShipping", "exclShipping", "regular", "price"):
                if isinstance(v.get(kk), (int, float)):
                    return float(v[kk])
        elif isinstance(v, (int, float)):
            return float(v)
        elif isinstance(v, str) and _num(v) is not None:
            return _num(v)
    return None


def _dn_walk(node, out, depth=0):
    if depth > 14 or len(out) > 200:
        return
    if isinstance(node, list):
        for x in node:
            _dn_walk(x, out, depth + 1)
        return
    if not isinstance(node, dict):
        return
    name = node.get("name") or node.get("productName") or node.get("title")
    if isinstance(name, str) and 3 <= len(name) <= 200:
        price = _dn_price(node)
        offers = node.get("offers")
        if price is None and isinstance(offers, dict):
            price = _num(offers.get("price") or offers.get("lowPrice"))
        link = node.get("url") or node.get("pathName") or node.get("path") or node.get("href") or ""
        if isinstance(link, str) and link and price is not None and price > 0:
            if link.startswith("/"):
                link = DN_BASE + link
            if link.startswith(DN_BASE):
                img = node.get("image") or node.get("imageUrl") or node.get("media") or ""
                if isinstance(img, dict):
                    img = img.get("url") or img.get("first") or img.get("src") or ""
                if isinstance(img, list):
                    img = img[0] if img and isinstance(img[0], str) else ""
                pct = None
                for k in ("priceDropPercent", "dropPercent", "discountPercent", "percentage", "diffPercent"):
                    if isinstance(node.get(k), (int, float)):
                        pct = abs(round(node[k] * (100 if abs(node[k]) <= 1 else 1)))
                        break
                old = None
                for k in ("previousPrice", "oldPrice", "regularPrice", "priceBefore", "referencePrice"):
                    v = node.get(k)
                    v = _dn_price({"price": v}) if v is not None else None
                    if v and v > price:
                        old = v
                        break
                if old and not pct:
                    pct = round((1 - price / old) * 100)
                out.append({"title": name.strip(), "link": link, "price": price, "old": old, "pct": pct,
                            "image": img if isinstance(img, str) and img.startswith("https://") else "",
                            "merchant": "Le Dénicheur"})
    for v in node.values():
        if isinstance(v, (dict, list)):
            _dn_walk(v, out, depth + 1)


def fetch_denicheur():
    page = get_any(DN_BASE + "/deals")
    if not page:
        return None
    found = []
    for blob in re.findall(r"<script[^>]*>(.*?)</script>", page, re.S | re.I):
        blob = blob.strip()
        if not blob or blob[0] not in "{[" and "JSON.parse" not in blob:
            continue
        try:
            data = json.loads(blob)
        except Exception:  # noqa: BLE001
            jm = re.search(r"JSON\.parse\((\"(?:[^\"\\]|\\.)*\")\)", blob)
            if not jm:
                continue
            try:
                data = json.loads(json.loads(jm.group(1)))
            except Exception:  # noqa: BLE001
                continue
        _dn_walk(data, found)
    seen, out = set(), []
    for d in found:
        if d["link"] in seen:
            continue
        seen.add(d["link"])
        d["id"] = "dn" + str(zlib.crc32(d["link"].encode()))
        out.append(d)
        if len(out) >= 40:
            break
    return out or None


# ── Jeux vidéo ───────────────────────────────────────────────────────────
def fetch_rate():
    xml = get_any("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml")
    m = re.search(r"currency=['\"]USD['\"]\s+rate=['\"]([\d.]+)['\"]", xml or "")
    if not m:
        return None
    usd_per_eur = float(m.group(1))
    return round(1 / usd_per_eur, 6) if usd_per_eur > 0 else None


def fetch_steam():
    txt = get_any("https://store.steampowered.com/api/featuredcategories?cc=FR&l=french")
    d = json.loads(txt) if txt else {}
    seen, out = set(), []
    for k in d or {}:
        items = d[k].get("items") if isinstance(d[k], dict) else None
        if not isinstance(items, list):
            continue
        for it in items:
            if not isinstance(it, dict) or not it.get("id") or it["id"] in seen:
                continue
            pct = round(float(it.get("discount_percent") or 0))
            if pct <= 0 or not isinstance(it.get("final_price"), (int, float)):
                continue
            seen.add(it["id"])
            sale = it["final_price"] / 100
            full = it["original_price"] / 100 if isinstance(it.get("original_price"), (int, float)) else sale
            out.append({"id": "st" + str(it["id"]), "title": it.get("name") or "App %s" % it["id"],
                        "link": "https://store.steampowered.com/app/%s/?cc=FR" % it["id"],
                        "price": sale, "old": full, "pct": pct, "merchant": "Steam",
                        "image": it.get("small_capsule_image") or it.get("header_image") or "",
                        "appid": it["id"]})
    return out[:GAMES_MAX] or None


def _epic_items(free_only):
    txt = get_any("https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR")
    j = json.loads(txt) if txt else {}
    els = (((j or {}).get("data") or {}).get("Catalog") or {}).get("searchStore") or {}
    now = time.time() * 1000
    out = []
    for el in els.get("elements") or []:
        if not isinstance(el, dict) or not el.get("title"):
            continue
        offers = []
        for o in ((el.get("promotions") or {}).get("promotionalOffers") or []):
            offers += (o or {}).get("promotionalOffers") or []
        live = None
        for o in offers:
            try:
                s = datetime.fromisoformat(o["startDate"].replace("Z", "+00:00")).timestamp() * 1000
                e = datetime.fromisoformat(o["endDate"].replace("Z", "+00:00")).timestamp() * 1000
            except Exception:  # noqa: BLE001
                continue
            if s <= now < e:
                live = (o, e)
                break
        if not live:
            continue
        tp = ((el.get("price") or {}).get("totalPrice") or {})
        full = tp.get("originalPrice") / 100 if isinstance(tp.get("originalPrice"), (int, float)) else None
        sale = tp.get("discountPrice") / 100 if isinstance(tp.get("discountPrice"), (int, float)) else full
        if sale is None or (full and sale >= full):
            continue
        if free_only and sale > 0:
            continue
        img = next((i.get("url") for i in el.get("keyImages") or []
                    if re.search(r"Thumbnail|OfferImageWide|Wide", i.get("type") or "")), "")
        maps = ((el.get("catalogNs") or {}).get("mappings") or [{}])
        slug = (maps[0] or {}).get("pageSlug") or el.get("productSlug") or el.get("urlSlug") or ""
        link = ("https://store.epicgames.com/fr/p/" + slug.strip("/")) if slug else \
            "https://store.epicgames.com/fr/browse?q=" + el["title"]
        out.append({"id": "ep" + str(el.get("id") or el["title"]), "title": el["title"], "link": link,
                    "price": sale, "old": full, "pct": round((1 - sale / full) * 100) if full else 100,
                    "merchant": "Epic Games", "image": img or "", "end": int(live[1])})
    return out


def fetch_epic():
    return _epic_items(False) or None


def fetch_cheapshark(rate):
    stores = {}
    try:
        for st in json.loads(_get("https://www.cheapshark.com/api/1.0/stores")) or []:
            stores[str(st.get("storeID"))] = st.get("storeName") or ""
    except Exception:  # noqa: BLE001
        pass
    txt = get_any("https://www.cheapshark.com/api/1.0/deals?pageSize=60&sortBy=DealRating&onSale=1")
    arr = json.loads(txt) if txt else []
    out = []
    for d in arr if isinstance(arr, list) else []:
        try:
            sale, full = float(d["salePrice"]), float(d["normalPrice"])
        except Exception:  # noqa: BLE001
            continue
        r = rate or 0.92
        out.append({"id": "cs" + str(d.get("dealID")), "title": d.get("title") or "?",
                    "link": "https://www.cheapshark.com/redirect?dealID=" + str(d.get("dealID")),
                    "price": round(sale * r, 2), "old": round(full * r, 2),
                    "pct": round(float(d.get("savings") or 0)),
                    "merchant": stores.get(str(d.get("storeID"))) or "Boutique PC",
                    "image": d.get("thumb") or "", "gameID": str(d.get("gameID") or ""),
                    "rating": int(d.get("steamRatingPercent") or 0)})
    return out[:GAMES_MAX] or None


def fetch_free():
    txt = get_any("https://www.gamerpower.com/api/giveaways?platform=pc&type=game&sort-by=popularity")
    arr = json.loads(txt) if txt else []
    out = []
    for g in arr if isinstance(arr, list) else []:
        if not isinstance(g, dict) or not g.get("title"):
            continue
        end = None
        if g.get("end_date") and g["end_date"] != "N/A":
            try:
                end = int(datetime.strptime(g["end_date"], "%Y-%m-%d %H:%M:%S").timestamp() * 1000)
            except Exception:  # noqa: BLE001
                end = None
        worth = _num(g.get("worth")) if g.get("worth") not in (None, "N/A") else None
        out.append({"id": "gp" + str(g.get("id")), "title": re.sub(r"\s*\(.*?\)\s*Giveaway$|\s*Giveaway$", "", g["title"]),
                    "link": g.get("open_giveaway_url") or g.get("gamerpower_url") or "",
                    "price": 0.0, "old": worth, "pct": 100, "merchant": g.get("platforms") or "",
                    "image": g.get("thumbnail") or "", "end": end})
        if len(out) >= 30:
            break
    return out or None


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:  # noqa: BLE001
        existing = {}
    out = {"updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    via = {}

    def run(key, fn, *args):
        via_reset()
        try:
            val = fn(*args)
        except Exception as e:  # noqa: BLE001
            print(f"!! {key}: {e}", file=sys.stderr)
            val = None
        if val:
            out[key] = val
            if via_seen():
                via[key] = via_seen()
            n = sum(len(v) for v in val.values()) if isinstance(val, dict) else (len(val) if isinstance(val, list) else 1)
            print(f"{key}: {n}")
        else:
            if key in existing:
                out[key] = existing[key]
            print(f"!! {key}: indisponible — valeur précédente conservée", file=sys.stderr)
        time.sleep(0.5)
        return out.get(key)

    rate = run("usd_eur", fetch_rate)
    run("dealabs", fetch_dealabs)
    run("denicheur", fetch_denicheur)
    run("steam", fetch_steam)
    run("epic", fetch_epic)
    run("cheapshark", fetch_cheapshark, rate)
    run("free", fetch_free)
    out["via"] = via

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
