#!/usr/bin/env python3
"""Stamp stylesheet, script and font references with content hashes.

    python3 tools/stamp-assets.py

Browsers and the edge keep css/, js/ and fonts/ for a year. Content hashes on
their URLs make a changed asset fetch under a new URL. Run this last, after
any generator or font subsetting has written its files.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ("css/site.css", "js/site.js", "js/candidates.js")
FONTS = tuple(path.relative_to(ROOT).as_posix() for path in sorted((ROOT / "fonts").glob("*.woff2")))


def stamp(text: str, rel: str, digest: str) -> str:
    pattern = re.compile(r"(/" + re.escape(rel) + r")(?:(?:\?v=)[0-9a-f]+)?")
    return pattern.sub(lambda m: f"{m.group(1)}?v={digest}", text)


def main() -> None:
    font_stamps = {}
    for rel in FONTS:
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]
        font_stamps[rel] = digest
    css_path = ROOT / "css" / "site.css"
    css = original_css = css_path.read_text(encoding="utf-8")
    for rel, digest in font_stamps.items():
        css = stamp(css, rel, digest)
    if css != original_css:
        css_path.write_text(css, encoding="utf-8")

    stamps = {}
    for rel in ASSETS:
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]
        stamps[rel] = digest
    changed = 0
    for page in ROOT.rglob("*.html"):
        if ".git" in page.parts:
            continue
        text = original = page.read_text(encoding="utf-8")
        for rel, digest in {**font_stamps, **stamps}.items():
            text = stamp(text, rel, digest)
        if text != original:
            page.write_text(text, encoding="utf-8")
            changed += 1
    for rel, digest in stamps.items():
        print(f"  {rel} → ?v={digest}")
    for rel, digest in font_stamps.items():
        print(f"  {rel} → ?v={digest}")
    print(f"  {changed} page(s) restamped")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build-sitemap.py")], check=True)


if __name__ == "__main__":
    main()
