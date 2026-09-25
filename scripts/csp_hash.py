#!/usr/bin/env python3
"""Empreintes CSP des <script> inline d'index.html.

La CSP n'autorise plus les scripts inline « en bloc » ('unsafe-inline' est ignoré dès
qu'une empreinte est présente) : chaque <script> inline d'index.html y figure par son
empreinte sha256. Modifier UN caractère de l'un d'eux sans relancer ce script = script
bloqué = écran figé.

    python3 scripts/csp_hash.py          # réécrit les empreintes de script-src
    python3 scripts/csp_hash.py --check  # code 1 si elles ne correspondent plus

Le bloc `type="text/app-source"` n'est pas exécuté par le navigateur : il est ignoré.
Les commentaires HTML sont sautés comme le fait le parseur.
"""
import base64
import hashlib
import pathlib
import re
import sys

PATH = pathlib.Path(__file__).resolve().parent.parent / "index.html"


def inline_scripts(html):
    out, i = [], 0
    while True:
        s = html.find("<script", i)
        c = html.find("<!--", i)
        if s < 0:
            return out
        if 0 <= c < s:
            i = html.index("-->", c) + 3
            continue
        tag_end = html.index(">", s)
        attrs = html[s + 7:tag_end]
        end = html.index("</script", tag_end)
        body = html[tag_end + 1:end]
        if "src=" not in attrs and "text/app-source" not in attrs:
            out.append(body)
        i = end + 9


def main():
    html = PATH.read_text(encoding="utf-8")
    hashes = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(b.encode("utf-8")).digest()).decode()
              for b in inline_scripts(html)]
    # ⚠ Dans la balise CSP elle-même : les commentaires HTML du <head> citent aussi « script-src ».
    m = re.search(r'http-equiv="Content-Security-Policy" content="[^"]*?(script-src )([^;"]*)(;)', html)
    kept = [t for t in m.group(2).split() if not t.startswith("'sha256-")]
    new_src = " ".join(kept[:1] + hashes + kept[1:])
    if new_src == m.group(2):
        print("CSP à jour (%d script(s) inline)." % len(hashes))
        return 0
    if "--check" in sys.argv:
        print("⚠ Empreintes CSP périmées : lancer python3 scripts/csp_hash.py", file=sys.stderr)
        return 1
    PATH.write_text(html[:m.start(2)] + new_src + html[m.end(2):], encoding="utf-8")
    print("CSP mise à jour (%d script(s) inline)." % len(hashes))
    return 0


if __name__ == "__main__":
    sys.exit(main())
