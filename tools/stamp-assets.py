#!/usr/bin/env python3
"""Stamp styles, scripts, fonts, branding and product screenshots with hashes.

    python3 tools/stamp-assets.py

Content hashes make changed assets fetch under new URLs, including branding
images cached for a month. Run this last, after any generator has written its
files. Manifest icon URLs are stamped before hashing the manifest itself.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ("css/site.css", "css/guide.css", "js/site.js", "js/guide.js", "js/globe.js")
BRANDING = ("img/nav-mark-v3.svg", "img/wordmark-v3.svg", "img/lockup-v3.svg",
            "favicon.ico", "img/icon-32.png", "img/icon-64.png", "img/icon-180.png",
            "img/icon-192.png", "img/icon-512.png", "img/social-card.jpg")
# The map furniture and the home page's globe (tools/build-furniture.py,
# tools/build-globe.py): referenced from site.css as well as pages.
FURNITURE = ("img/globe-eofordal.webp", "img/globe-eofordal-poster.webp", "img/meridian-ring.svg",
             "img/rose.svg", "img/rose-paper.svg", "img/rose-small.svg")
FONTS = tuple(path.relative_to(ROOT).as_posix() for path in sorted((ROOT / "fonts").glob("*.woff2")))
SCREENSHOTS = tuple(path.relative_to(ROOT).as_posix()
                    for path in [*sorted((ROOT / "img").glob("app-*.webp")),
                                 *sorted((ROOT / "img" / "discover").glob("*.webp"))])


def stamp(text: str, rel: str, digest: str) -> str:
    pattern = re.compile(r"(/" + re.escape(rel) + r")(?:(?:\?v=)[0-9a-f]+)?")
    return pattern.sub(lambda m: f"{m.group(1)}?v={digest}", text)


def main() -> None:
    font_stamps = {}
    for rel in FONTS:
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]
        font_stamps[rel] = digest
    for rel in FURNITURE:
        font_stamps[rel] = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]
    css_path = ROOT / "css" / "site.css"
    css = original_css = css_path.read_text(encoding="utf-8")
    for rel, digest in font_stamps.items():
        css = stamp(css, rel, digest)
    if css != original_css:
        css_path.write_text(css, encoding="utf-8")

    stamps = {}
    for rel in (*ASSETS, *BRANDING, *SCREENSHOTS):
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]
        stamps[rel] = digest
    manifest_path = ROOT / "site.webmanifest"
    manifest = original_manifest = manifest_path.read_text(encoding="utf-8")
    for rel, digest in stamps.items():
        manifest = stamp(manifest, rel, digest)
    if manifest != original_manifest:
        manifest_path.write_text(manifest, encoding="utf-8")
    stamps["site.webmanifest"] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()[:10]
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
