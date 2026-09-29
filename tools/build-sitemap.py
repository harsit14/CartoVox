#!/usr/bin/env python3
"""Build sitemap.xml from the site's indexable canonical HTML pages.

Git supplies the last committed content date. Pages changed in the working
tree use today's UTC date; run this after generating pages and before commit.
"""
from __future__ import annotations

import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://cartovox.org"
CANONICAL = re.compile(r'<link\s+rel="canonical"\s+href="([^"]+)"', re.I)
ROBOTS = re.compile(r'<meta\s+name="robots"\s+content="([^"]+)"', re.I)


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True,
                            capture_output=True, check=True)
    return result.stdout.strip()


def last_modified(path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    if git("status", "--porcelain", "--", relative):
        return datetime.now(timezone.utc).date().isoformat()
    date = git("log", "-1", "--format=%cs", "--", relative)
    if not date:
        raise ValueError(f"No Git history for {relative}")
    return date


def main() -> None:
    pages: dict[str, tuple[Path, str]] = {}
    for path in ROOT.rglob("*.html"):
        if any(part in {".git", "node_modules"} for part in path.parts):
            continue
        head = path.read_text(encoding="utf-8").split("</head>", 1)[0]
        canonical = CANONICAL.search(head)
        robots = ROBOTS.search(head)
        if not canonical or (robots and "noindex" in robots.group(1).lower()):
            continue
        url = canonical.group(1)
        if not url.startswith(SITE + "/"):
            raise ValueError(f"Unexpected canonical URL in {path}: {url}")
        if url in pages:
            raise ValueError(f"Duplicate canonical URL: {url}")
        pages[url] = (path, last_modified(path))

    ET.register_namespace("", "http://www.sitemaps.org/schemas/sitemap/0.9")
    root = ET.Element("{http://www.sitemaps.org/schemas/sitemap/0.9}urlset")
    for url in sorted(pages, key=lambda item: (item != SITE + "/", item)):
        entry = ET.SubElement(root, "url")
        ET.SubElement(entry, "loc").text = url
        ET.SubElement(entry, "lastmod").text = pages[url][1]
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(ROOT / "sitemap.xml", encoding="utf-8", xml_declaration=True)
    print(f"  sitemap.xml: {len(pages)} indexable pages")


if __name__ == "__main__":
    main()
