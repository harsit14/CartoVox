#!/usr/bin/env python3
"""Build the site's WOFF2 files from local, unserved font originals.

    python3 tools/subset-fonts.py

Requires fonttools and brotli. Run after editing site text, before publishing.
The complete OFL-licensed originals stay in font-sources/ so a later page can
introduce new characters without subsetting an already reduced font.
"""
from __future__ import annotations

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = (
    "Cinzel-Variable.woff2",
    "Inter-Variable.woff2",
    "Newsreader-Variable.woff2",
    "Newsreader-Italic-Variable.woff2",
)


def site_characters() -> set[int]:
    # ASCII is always available; the page corpus supplies accented and other
    # characters actually used by this release. Re-run when copy changes.
    chars = set(range(0x20, 0x7F))
    pages = ROOT.rglob("*.html")
    scripts = (ROOT / "js").glob("*.js")
    styles = (ROOT / "css").glob("*.css")
    for path in (*pages, *scripts, *styles):
        if any(part in {".git", "node_modules"} for part in path.parts):
            continue
        chars.update(ord(char) for char in path.read_text(encoding="utf-8") if char.isprintable())
    return chars


def main() -> None:
    chars = site_characters()
    for name in FONTS:
        source = ROOT / "font-sources" / name
        target = ROOT / "fonts" / name
        font = TTFont(source)
        options = subset.Options()
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_legacy = True
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=chars)
        subsetter.subset(font)
        font.flavor = "woff2"
        font.save(target)
        print(f"  {name}: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes")
    print(f"  {len(chars)} code points retained where each font provides them")


if __name__ == "__main__":
    main()
