#!/usr/bin/env python3
"""Render every release note into releases/index.html.

    python3 tools/build-releases.py <app-repo>/.github/release-notes

Each note is a text file: a title line, then Markdown. The rendering keeps the
notes whole except for two things. The application was called Atlas Studio
until 0.8.2, so the old name is written as the current one (feature names such
as Atlas plates keep theirs). And the paragraphs that told testers where to
download installers from are dropped, because that route is no longer where
builds are published; the site's beta page is.
"""
from __future__ import annotations

import html
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_legal", ROOT / "tools" / "build-legal.py")
build_legal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_legal)

DATES = {
    "0.1.1": "2026-08-23", "0.1.2": "2026-08-23", "0.1.3": "2026-08-23", "0.1.4": "2026-08-23",
    "0.1.5": "2026-08-24", "0.1.6": "2026-08-24", "0.2.0": "2026-08-24", "0.2.1": "2026-08-24",
    "0.2.2": "2026-08-25", "0.3.0": "2026-08-25", "0.4.0": "2026-08-25", "0.5.0": "2026-08-26",
    "0.6.0": "2026-08-27", "0.6.1": "2026-08-28", "0.7.0": "2026-08-29", "0.7.1": "2026-08-30",
    "0.7.2": "2026-08-30", "0.7.3": "2026-08-30", "0.7.4": "2026-08-30", "0.7.5": "2026-08-30",
    "0.7.6": "2026-08-30", "0.8.0": "2026-09-04", "0.8.1": "2026-09-08", "0.8.2": "2026-09-11",
}

RENAMES = [
    (re.compile(r"Atlas Studio"), "CartoVox"),
    (re.compile(r"Atlas Dark"), "CartoVox Dark"),
    (re.compile(r"the allowlisted GitHub release"), "the allowlisted release feed"),
    (re.compile(r"published GitHub Releases"), "the published release feed"),
    (re.compile(r"published releases from GitHub"), "published releases from the release feed"),
    (re.compile(r"from GitHub"), "from the release feed"),
    (re.compile(r"GitHub's asset metadata"), "the published checksums"),
]
# Whole blocks (paragraphs or lists separated by blank lines) that described a
# download route which is no longer the one testers use.
DROP_BLOCK = re.compile(
    r"^(Installers are distributed|These installers|These builds|Choose the Apple Silicon|"
    r"Choose the installer|Download only from|Built from private development commit|"
    r"Built and tested on|Please report problems through)",
    re.IGNORECASE)
DROP_IF_CONTAINS = re.compile(r"GitHub|SHA256SUMS|issue forms|beta portal", re.IGNORECASE)
INSTALLER_LIST = re.compile(r"^- `?[\w.-]*(\.dmg|\.exe|\.deb|\.tar\.gz)`?", re.MULTILINE)


NAME_RENAMES = RENAMES[:2]
ROUTE_RENAMES = RENAMES[2:]


def _list_items(block: str) -> list[str]:
    """Split a bullet block into items; continuation lines stay with their item."""
    items: list[str] = []
    for line in block.splitlines():
        if re.match(r"^\s*[-*] ", line) or not items:
            items.append(line)
        else:
            items[-1] += "\n" + line
    return items


def clean(markdown: str, rename_app: bool = True) -> str:
    for pattern, replacement in (RENAMES if rename_app else ROUTE_RENAMES):
        markdown = pattern.sub(replacement, markdown)
    blocks = re.split(r"\n\s*\n", markdown)
    kept = []
    for block in blocks:
        text = block.strip()
        if not text:
            continue
        if text.startswith(("- ", "* ")):
            # A list loses only the items that point at the old download route.
            items = [item for item in _list_items(block)
                     if not DROP_IF_CONTAINS.search(item) and not INSTALLER_LIST.search(item)]
            if items:
                kept.append("\n".join(items))
            continue
        if DROP_BLOCK.match(text) or DROP_IF_CONTAINS.search(text):
            continue
        kept.append(block)
    return "\n\n".join(kept)


def demote(markdown: str) -> str:
    """Headings drop one level so each version sits under its own h2."""
    return re.sub(r"^(#{1,5}) ", lambda m: "#" * (len(m.group(1)) + 1) + " ", markdown, flags=re.MULTILINE)


def version_key(name: str) -> tuple:
    return tuple(int(part) for part in name.split("."))


def load(notes_dir: Path) -> list[dict]:
    releases = []
    for path in notes_dir.glob("v*.txt"):
        version = path.stem[1:]
        text = path.read_text(encoding="utf-8")
        title, _, body = text.partition("\n")
        for pattern, replacement in RENAMES:
            title = pattern.sub(replacement, title)
        # "CartoVox 0.8.2 — Write with the world beside you" → keep the tagline.
        tagline = title.split("—", 1)[1].strip() if "—" in title else ""
        releases.append({"version": version, "tagline": tagline, "date": DATES.get(version, ""),
                         "body": clean(body), "released": True})
    releases.sort(key=lambda r: version_key(r["version"]), reverse=True)
    upcoming = notes_dir / "unreleased.txt"
    if upcoming.exists():
        text = upcoming.read_text(encoding="utf-8")
        title, _, body = text.partition("\n")
        # The note that announces the rename must keep the old name in it.
        releases.insert(0, {"version": "upcoming", "tagline": "In development — not yet released",
                            "date": "", "body": clean(body, rename_app=False), "released": False})
    return releases


PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Release notes — CartoVox</title>
  <meta name="description" content="Every CartoVox release, from the first invited alpha to the current beta: what changed, what it costs, and what stayed compatible.">
  <link rel="canonical" href="https://cartovox.org/releases/">
  <meta name="theme-color" content="#0b0c10">
  <meta property="og:type" content="website">
  <meta property="og:title" content="CartoVox release notes">
  <meta property="og:description" content="Every CartoVox release and what changed in it.">
  <meta property="og:url" content="https://cartovox.org/releases/">
  <meta property="og:image" content="https://cartovox.org/img/social-card.jpg">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="64x64" href="/img/icon-64.png">
  <link rel="apple-touch-icon" href="/img/icon-180.png">
  <link rel="stylesheet" href="/css/site.css">
</head>
<body class="doc-page">
<a class="skip" href="#main">Skip to content</a>
<header class="nav is-scrolled">
  <div class="nav-inner">
    <a class="nav-brand" href="/" aria-label="CartoVox home">
      <img class="nav-mark" src="/img/mark-192.png" width="40" height="40" alt="">
      <img class="nav-wordmark" src="/img/wordmark.png" width="142" height="40" alt="CartoVox">
    </a>
    <nav class="nav-links" id="nav-links" aria-label="Sections">
      <a href="/">Home</a>
      <a href="/features/">Field guide</a>
      <a href="/releases/" aria-current="page">Release notes</a>
      <a href="/#faq">FAQ</a>
      <a class="btn btn-gold btn-sm nav-cta-mobile" href="https://discord.gg/nGNatfuXe" rel="noopener">Join the beta</a>
    </nav>
    <a class="btn btn-gold btn-sm nav-cta" href="https://discord.gg/nGNatfuXe" rel="noopener">Join the beta</a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</header>
<main id="main" class="guide">
  <aside class="guide-toc" aria-label="Versions">
    <p class="eyebrow">Versions</p>
    <nav class="toc-list">
{toc}
    </nav>
  </aside>
  <div class="guide-body">
    <header class="guide-head">
      <p class="eyebrow">Release notes</p>
      <h1>Every version, in full.</h1>
      <p class="lede">What changed, what it costs, and what stayed compatible, from the first invited alpha on 23 August 2026 to the current beta. The same notes are readable offline inside the app under <b>Settings → Release notes</b>.</p>
      <p class="muted small">The application was called <i>Atlas Studio</i> until version 0.8.2; these notes use its current name throughout. The Atlas tab, Atlas plates and Atlas lettering keep their names — they describe the publication atlas the app draws. Builds are published on the <a href="https://discord.gg/nGNatfuXe" rel="noopener">Discord server</a>.</p>
    </header>
{articles}
  </div>
</main>
<footer class="footer">
  <div class="wrap footer-inner doc-footer">
    <p class="footer-fine">© 2026 Harsit Upadhya. This site sets no cookies and runs no analytics.</p>
  </div>
</footer>
<script src="/js/site.js" defer></script>
</body>
</html>
"""


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    releases = load(Path(sys.argv[1]))
    toc, articles = [], []
    for release in releases:
        rid = "upcoming" if not release["released"] else f"v{release['version']}"
        label = "Upcoming" if not release["released"] else release["version"]
        date = release["date"]
        toc.append(f'      <a href="#{rid}"><span>{html.escape(label)}</span><small>{html.escape(date or "unreleased")}</small></a>')
        _, body_html = build_legal.render(demote(release["body"]))
        heading = "Upcoming" if not release["released"] else f"CartoVox {release['version']}"
        badge = "" if release["released"] else ' <span class="badge badge-soft">not yet released</span>'
        articles.append(f"""    <article class="release" id="{rid}">
      <header class="release-head">
        <h2>{html.escape(heading)}{badge}</h2>
        {f'<p class="release-tag">{html.escape(release["tagline"])}</p>' if release["tagline"] else ''}
        {f'<time datetime="{date}">{date}</time>' if date else ''}
      </header>
      <div class="doc-body">
{body_html}
      </div>
    </article>""")
    target = ROOT / "releases" / "index.html"
    target.parent.mkdir(exist_ok=True)
    target.write_text(PAGE.format(toc="\n".join(toc), articles="\n".join(articles)), encoding="utf-8")
    print(f"  releases/index.html ← {len(releases)} notes")


if __name__ == "__main__":
    main()
