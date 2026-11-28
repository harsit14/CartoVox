#!/usr/bin/env python3
"""Build the Start-here guide from tools/guide-src/.

    python3 tools/build-guide.py

Each source is one guide page: a metadata comment, then its <section>s. The
build adds the shared site header and footer (tools/site_chrome.py), the
contents with every guide page and the current page's sections, the guide
search, and the previous/next links, and writes guide/<slug>/index.html
(guide/index.html for the Start page). Then it rebuilds sitemap.xml.

Shorthands in the sources:

    {new}                     the "New in 1.1" tag (see RELEASED_11)
    {{World › Map › Tools}}   a path through the app, as the app labels it
    <shot name="11-map" alt="…">caption</shot>
                              a screenshot from img/app-<name>.webp, with its
                              -900 variant when there is one
    <task id="…" title="…" where="…">…</task>
                              one task: heading, where it lives, a few lines

At the 1.1 release set RELEASED_11 = True and rebuild: the tags then read
"New in 1.1" without "coming soon", and the pages stop saying that today's
download is 1.0.1.
"""
from __future__ import annotations

import hashlib
import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_chrome  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tools" / "guide-src"

RELEASED_11 = False

# slug, contents label, short note for the Start page's map of the guide
PAGES = [
    ("index", "Start here", "Install, the layout and your first hour"),
    ("library", "Library, Discover & Make", "Your worlds, ready-made worlds, guided projects and settings"),
    ("create", "Create", "Describe, choose and build a world, or bring your own map"),
    ("world", "World: map & atlas", "Read, change, render and export the world"),
    ("play", "Campaign & table", "Campaigns, the tabletop, scenes, cities and props"),
    ("write", "Write", "Chronicle, Compendium and the Manuscript"),
    ("reference", "Reference", "Keys, files on disk, questions and known limits"),
]

TAG = ('<span class="tag-new">New in 1.1</span>' if RELEASED_11
       else '<span class="tag-new" title="Part of CartoVox 1.1, coming soon. Today’s download is 1.0.1.">New in 1.1 · coming soon</span>')
NOTE = ("Written for <b>CartoVox 1.1</b>. Screenshots are from 1.1." if RELEASED_11 else
        "Written for <b>CartoVox 1.1</b>, coming soon. Today’s download is <b>CartoVox 1.0.1</b>: everything here "
        "works in it except what carries the " + TAG + " tag. Screenshots are from 1.1.")

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="https://cartovox.org{url}">
  <meta name="theme-color" content="#0b0c10">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="https://cartovox.org{url}">
  <meta property="og:image" content="https://cartovox.org/img/social-card.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="64x64" href="/img/icon-64.png">
  <link rel="apple-touch-icon" href="/img/icon-180.png">
  <link rel="stylesheet" href="/css/site.css">
  <link rel="stylesheet" href="/css/guide.css">
</head>
<body class="doc-page guide-page">
<a class="skip" href="#main">Skip to content</a>
{header}

<main id="main" class="guide">
  <aside class="guide-toc" aria-label="Guide contents">
{find}
    <p class="eyebrow">The guide</p>
    <nav class="toc-list" aria-label="Guide pages">
{toc}
    </nav>
  </aside>

  <div class="guide-body">
    <header class="guide-head">
      <p class="eyebrow">{eyebrow}</p>
      <h1>{heading}</h1>
      <p class="lede">{lede}</p>
      <p class="guide-note">{note}</p>
{find}
      <details class="mobile-contents">
        <summary>Guide contents</summary>
        <nav class="toc-list mobile-toc" aria-label="Guide pages">
{toc}
        </nav>
      </details>
    </header>

{body}

    <nav class="guide-pager" aria-label="Guide pages">
{pager}
    </nav>
  </div>
</main>

{footer}
<script src="/js/site.js" defer></script>
<script src="/js/guide.js" defer></script>
</body>
</html>
"""

FIND = """    <div class="guide-find" role="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>
      <input type="search" placeholder="Search the guide  ( / )" aria-label="Search the guide" autocomplete="off" spellcheck="false">
      <div class="guide-find-results" aria-live="polite" hidden></div>
    </div>"""


def url_of(slug: str) -> str:
    return "/guide/" if slug == "index" else f"/guide/{slug}/"


def meta_of(text: str) -> tuple[dict[str, str], str]:
    found = re.match(r"\s*<!--(.*?)-->", text, re.S)
    meta = {}
    for line in found.group(1).strip().splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, text[found.end():]


def attrs(text: str) -> dict[str, str]:
    return dict(re.findall(r'(\w+)="([^"]*)"', text))


def shot(match: re.Match[str]) -> str:
    a = attrs(match.group(1))
    name = a["name"]
    full = f"/img/app-{name}.webp"
    small = ROOT / "img" / f"app-{name}-900.webp"
    srcset = (f' srcset="/img/app-{name}-900.webp 900w, {full} 1800w" sizes="(min-width: 1280px) 860px, (min-width: 1040px) 66vw, 100vw"'
              if small.exists() else "")
    caption = match.group(2).strip()
    figcaption = f"\n  <figcaption>{caption}</figcaption>" if caption else ""
    return (f'<figure class="guide-fig">\n  <div class="window"><img src="{full}"{srcset} width="1800" height="1125" '
            f'alt="{a["alt"]}" loading="lazy" decoding="async"></div>{figcaption}\n</figure>')


def task(match: re.Match[str]) -> str:
    a = attrs(match.group(1))
    where = f'\n  <p class="where">Where: {a["where"]}</p>' if a.get("where") else ""
    return (f'<div class="task" id="{a["id"]}" data-find>\n  <h3>{a["title"]}</h3>{where}\n'
            f'  {match.group(2).strip()}\n</div>')


def expand(body: str) -> str:
    # Attribute values may hold markup (<b>…</b>), so match whole quoted values.
    body = re.sub(r'<task((?:\s+\w+="[^"]*")*)\s*>(.*?)</task>', task, body, flags=re.S)
    body = re.sub(r'<shot((?:\s+\w+="[^"]*")*)\s*>(.*?)</shot>', shot, body, flags=re.S)
    body = re.sub(r"\{\{(.*?)\}\}", r'<span class="path">\1</span>', body)
    body = body.replace("{new}", TAG)
    # A section's number is a figure in a ruled box, as the site's plates are.
    body = re.sub(r'<p class="eyebrow">(\d+) · ', r'<p class="eyebrow"><span class="plate-no">\1</span>', body)
    # Every section with a heading is a search entry.
    body = re.sub(r'<section id="([^"]+)"(?![^>]*data-find)', r'<section id="\1" data-find', body)
    return body


def sections(body: str) -> list[tuple[str, str]]:
    out = []
    for m in re.finditer(r'<section id="([^"]+)"([^>]*)>\s*(?:<p class="eyebrow">.*?</p>\s*)?<h2[^>]*>(.*?)</h2>', body, re.S):
        label = attrs(m.group(2)).get("toc") or re.sub(r"<[^>]+>", "", m.group(3))
        out.append((m.group(1), html.unescape(label).strip()))
    return out


def stamp(text: str) -> str:
    """Content hashes on local assets, as tools/stamp-assets.py writes them."""
    def one(m: re.Match[str]) -> str:
        path = ROOT / m.group(1).lstrip("/")
        if not path.is_file():
            return m.group(0)
        return f'{m.group(1)}?v={hashlib.sha256(path.read_bytes()).hexdigest()[:10]}'
    return re.sub(r'(/(?:css|js|img|fonts)/[\w./-]+\.\w+|/favicon\.ico)(?:\?v=[0-9a-f]+)?', one, text)


def main() -> None:
    built = []
    for position, (slug, label, _) in enumerate(PAGES):
        meta, body = meta_of((SRC / f"{slug}.html").read_text(encoding="utf-8"))
        body = expand(body.strip("\n"))
        url = url_of(slug)
        toc_lines = []
        for other, other_label, _ in PAGES:
            current = ' aria-current="page"' if other == slug else ""
            toc_lines.append(f'      <a class="toc-page" href="{url_of(other)}"{current}>{html.escape(other_label)}</a>')
            if other == slug:
                for sid, title in sections(body):
                    toc_lines.append(f'      <a class="toc-sub" href="#{sid}">{html.escape(title)}</a>')
        pager = []
        if position > 0:
            prev_slug, prev_label, _ = PAGES[position - 1]
            pager.append(f'      <a class="prev" href="{url_of(prev_slug)}"><small>Previous</small>{html.escape(prev_label)}</a>')
        if position < len(PAGES) - 1:
            next_slug, next_label, _ = PAGES[position + 1]
            pager.append(f'      <a class="next" href="{url_of(next_slug)}"><small>Next</small>{html.escape(next_label)}</a>')
        guide_map = "\n".join(
            f'  <a href="{url_of(s)}"><b>{html.escape(l)}</b>{html.escape(n)}</a>' for s, l, n in PAGES[1:])
        body = body.replace("<!-- guide-map -->", f'<nav class="guide-map" aria-label="The rest of the guide">\n{guide_map}\n</nav>')
        page = PAGE.format(
            title=meta["title"], description=meta["description"], url=url,
            header=site_chrome.header("/guide/"), footer=site_chrome.footer(),
            find=FIND, toc="\n".join(toc_lines), eyebrow=f'<span class="plate-no">Sheet {position + 1} of {len(PAGES)}</span>{meta["eyebrow"]}',
            heading=meta["heading"],
            lede=meta["lede"], note=NOTE, body="\n".join("    " + line if line else "" for line in body.splitlines()),
            pager="\n".join(pager),
        )
        target = ROOT / "guide" / ("" if slug == "index" else slug) / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(stamp(page), encoding="utf-8")
        built.append(f"{url} {len(page.encode()) // 1024} KB")
    print("  " + "\n  ".join(built))
    subprocess.run([sys.executable, str(ROOT / "tools" / "build-sitemap.py")], check=True)


if __name__ == "__main__":
    main()
