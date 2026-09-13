#!/usr/bin/env python3
"""Stamp every stylesheet and script reference with its content hash.

    python3 tools/stamp-assets.py

Browsers and the edge are told to keep css/ and js/ for a while, so a changed
stylesheet under the same URL would keep serving the old one until that
expires. Every HTML file therefore references `/css/site.css?v=<hash>`; a
change to the file changes the hash, and the new page fetches the new file.
Run this last, after any generator has written its pages.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ("css/site.css", "js/site.js", "js/candidates.js")


def main() -> None:
    stamps = {}
    for rel in ASSETS:
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]
        stamps[rel] = digest
    changed = 0
    for page in ROOT.rglob("*.html"):
        if ".git" in page.parts:
            continue
        text = original = page.read_text(encoding="utf-8")
        for rel, digest in stamps.items():
            pattern = re.compile(r"(/" + re.escape(rel) + r")(\?v=[0-9a-f]+)?")
            text = pattern.sub(lambda m, d=digest: f"{m.group(1)}?v={d}", text)
        if text != original:
            page.write_text(text, encoding="utf-8")
            changed += 1
    for rel, digest in stamps.items():
        print(f"  {rel} → ?v={digest}")
    print(f"  {changed} page(s) restamped")


if __name__ == "__main__":
    main()
