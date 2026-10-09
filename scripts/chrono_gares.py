#!/usr/bin/env python3
"""Liste des gares de la fiche 🚄 Jusqu'où en train → vendor/chrono-gares.json.

Les zones (isochrones 1 h → 5 h) sont celles de Chronotrains, publiées en fichiers
statiques dans la branche `static` du dépôt public benjamintd/chronotrains
(`public/isochrones/<id>.json`, id = numéro de gare HAFAS de la Deutsche Bahn). Ce dépôt
n'a PAS la liste des gares (nom, position) : on la rebâtit ici en croisant ces id avec
  · trainline-eu/stations (`stations.csv`, colonne `db_id`) — noms locaux propres,
    ville parente ;
  · le paquet npm db-hafas-stations (`full.ndjson`) — pour les gares que Trainline ignore.
Une gare qu'aucune des deux sources ne nomme est laissée de côté.

Sortie : {"src": <commit>, "g": [[id, nom, lat, lon(, ville)], …]} triée par TAILLE du
fichier de zones décroissante — plus la gare va loin en 5 h, mieux elle est desservie :
c'est l'ordre « principale de la ville d'abord » que lit l'app. La ville (la « ville »
Trainline en remontant les parents, sinon la plus proche à moins de NEAR_KM) n'est écrite
que lorsque `chrono_city` du nom ne la retrouve pas (même règle que `chronoCity` dans l'app) :
l'app ne s'en sert que pour ne pas citer deux gares d'une même ville.

    git clone https://github.com/benjamintd/chronotrains   # puis git fetch origin static
    git clone --depth 1 https://github.com/trainline-eu/stations
    npm pack db-hafas-stations && tar -xzf db-hafas-stations-*.tgz
    python3 scripts/chrono_gares.py <clone chronotrains> <commit> stations/stations.csv package/full.ndjson
"""
import csv
import json
import math
import pathlib
import re
import subprocess
import sys
import unicodedata

OUT = pathlib.Path(__file__).resolve().parent.parent / "vendor" / "chrono-gares.json"
MIN_BYTES = 300   # un fichier plus petit n'a pas ses cinq zones
NEAR_KM = 8       # gare sans parent (RER, halte) : rattachée à la « ville » Trainline la plus proche
PREFIX = {'bad', 'st', 'ste', 'saint', 'sainte', 'sankt', 'san', 'santa', 'la', 'le', 'les', 'den', 'de', 'el', 'aix'}


def norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def chrono_city(name):
    w = norm(name).split(' ')
    return w[0] + ' ' + w[1] if (w[0] in PREFIX or len(w[0]) <= 2) and len(w) > 1 else w[0]


def main(repo, commit, tl_csv, hafas):
    tree = subprocess.run(['git', '-C', repo, 'ls-tree', '-r', '-l', commit, 'public/isochrones'],
                          check=True, capture_output=True, text=True).stdout
    sizes = {}
    for line in tree.splitlines():
        m = re.search(r'\s(\d+)\tpublic/isochrones/(\d+)\.json$', line)
        if m and int(m.group(1)) >= MIN_BYTES:
            sizes[int(m.group(2))] = int(m.group(1))

    rows = list(csv.DictReader(open(tl_csv, encoding='utf-8'), delimiter=';'))
    by_tl_id = {r['id']: r for r in rows}
    tl = {}
    for r in rows:
        v = r.get('db_id') or ''
        if not v.isdigit() or not r['latitude'] or not r['longitude']:
            continue
        # Une vraie gare plutôt que la « ville » qui porte le même id, la principale d'abord.
        rank = (r['is_city'] != 't', r['is_main_station'] == 't')
        if int(v) not in tl or rank > tl[int(v)][0]:
            tl[int(v)] = (rank, r)

    def city_of(r):
        seen = set()
        while r and r['id'] not in seen:
            if r['is_city'] == 't':
                return r['name']
            seen.add(r['id'])
            r = by_tl_id.get(r['parent_station_id'] or '')
        return ''

    # Grille de 0,1° des « villes » Trainline, pour la plus proche.
    cities = {}
    for r in rows:
        if r['is_city'] == 't' and r['latitude'] and r['longitude']:
            la, lo = float(r['latitude']), float(r['longitude'])
            cities.setdefault((round(la, 1), round(lo, 1)), []).append((la, lo, r['name']))

    def near_city(lat, lon):
        best, bd = '', NEAR_KM
        for dy in (-0.1, 0, 0.1):
            for dx in (-0.1, 0, 0.1):
                for la, lo, n in cities.get((round(lat + dy, 1), round(lon + dx, 1)), ()):
                    d = math.hypot((la - lat) * 111.2, (lo - lon) * 111.2 * math.cos(math.radians(lat)))
                    if d < bd:
                        best, bd = n, d
        return best

    hf = {}
    for line in open(hafas, encoding='utf-8'):
        o = json.loads(line)
        if str(o.get('id', '')).isdigit() and o.get('location'):
            hf[int(o['id'])] = o

    out = []
    for i in sorted(sizes, key=lambda k: -sizes[k]):
        city = ''
        if i in tl:
            r = tl[i][1]
            name, lat, lon = r['name'], float(r['latitude']), float(r['longitude'])
            city = city_of(r)
        elif i in hf:
            o = hf[i]
            name, lat, lon = o['name'], float(o['location']['latitude']), float(o['location']['longitude'])
            if ', ' in name:
                city = name.rsplit(', ', 1)[1]
        else:
            continue
        city = city or near_city(lat, lon)
        name = re.sub(r'\s+', ' ', name).strip()
        if not name or not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
            continue
        g = [i, name, round(lat, 4), round(lon, 4)]
        if city and chrono_city(city) != chrono_city(name):
            g.append(city.strip())
        out.append(g)

    OUT.write_text(json.dumps({'src': commit, 'g': out}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(out)} gares sur {len(sizes)} fichiers de zones → {OUT} ({OUT.stat().st_size} octets)')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])
