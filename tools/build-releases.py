#!/usr/bin/env python3
"""Render a compact release index and one page per release.

    python3 tools/build-releases.py <app-repo>/.github/release-notes --through 0.9.18

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
import subprocess
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
    "0.7.6": "2026-08-30", "0.8.0": "2026-09-04", "0.8.1": "2026-09-08", "0.8.2": "2026-09-11", "0.8.3": "2026-09-14",
    "0.9.0": "2026-09-20", "0.9.1": "2026-09-21", "0.9.2": "2026-09-24", "0.9.3": "2026-09-27", "0.9.4": "2026-09-29",
    "0.9.5": "2026-09-30", "0.9.6": "2026-10-02", "0.9.7": "2026-10-06", "0.9.8": "2026-10-12",
    "0.9.9": "2026-10-12", "0.9.10": "2026-10-17", "0.9.11": "2026-10-18",
    "0.9.12": "2026-10-23", "0.9.13": "2026-10-24",
    "0.9.14": "2026-10-30", "0.9.15": "2026-11-05", "0.9.16": "2026-11-07",
    "0.9.17": "2026-11-13", "0.9.18": "2026-11-13",
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
    r"Built and tested on|Please report problems through|Earlier local packaging attempts)",
    re.IGNORECASE)
# The last two keep how the Delta service is hosted and how codes are issued
# off the public page; the in-app notes still carry them.
DROP_IF_CONTAINS = re.compile(r"GitHub|SHA256SUMS|issue forms|beta portal|"
                              r"services/delta-service|delta_access\.issuer", re.IGNORECASE)
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


def load(notes_dir: Path, through: str | None = None) -> list[dict]:
    releases = []
    for path in notes_dir.glob("v*.txt"):
        version = path.stem[1:]
        if through and version_key(version) > version_key(through):
            continue
        text = path.read_text(encoding="utf-8")
        title, _, body = text.partition("\n")
        for pattern, replacement in RENAMES:
            title = pattern.sub(replacement, title)
        # "CartoVox 0.8.2 — Write with the world beside you" → keep the tagline.
        tagline = title.split("—", 1)[1].strip() if "—" in title else ""
        # A Delta release is shown by its name, never its number: "CartoVox
        # 0.9.2 — Delta V1" and "CartoVox Delta V2 — 27 September 2026" read as
        # Delta V1 and Delta V2, as they do in the app.
        delta = re.search(r"Delta V\d+(?:\.\d+)?", title)
        name = delta.group(0) if delta else ""
        if name and tagline == name:
            tagline = ""
        # Notes from before 0.8.3 were written under the old name; 0.8.3 itself
        # announces the change and must keep the old name where it says so.
        written_under_old_name = version_key(version) < (0, 8, 3)
        releases.append({"version": version, "name": name, "tagline": tagline, "date": DATES.get(version, ""),
                         "body": clean(body, rename_app=written_under_old_name), "released": True})
    releases.sort(key=lambda r: version_key(r["version"]), reverse=True)
    upcoming = notes_dir / "unreleased.txt"
    if upcoming.exists() and not through:
        text = upcoming.read_text(encoding="utf-8")
        title, _, body = text.partition("\n")
        if not re.search(r"^(## |- )", body, re.MULTILINE):
            return releases  # nothing recorded since the last release
        # The note that announces the rename must keep the old name in it.
        releases.insert(0, {"version": "upcoming", "tagline": "In development — not yet released",
                            "date": "", "body": clean(body, rename_app=False), "released": False})
    return releases


HIGHLIGHTS = {
    "0.9.18": "Delta V16 for Windows with one fix: on some computers every launch stopped responding and had to be closed. A launch that freezes or closes now leaves a record in the logs folder, and CartoVox can open without the graphics processor. Worlds are unchanged, so nothing needs rebuilding.",
    "0.9.17": "The last Delta. The whole app reads in German, French, Spanish, Portuguese and Polish, with numbers written each language's way. Villages, market towns and hill towns grow as they should, with greens, crofts, burgage plots, abbeys, landings and walls where history calls for them. Maps stay sharp however far you zoom, rivers run on across every join, and continent, region and disc maps open in the World map's own controls, with finer continent detail where you look. Orbits can wobble, swing their tilt and lock their spin, and a planet's real numbers build its real weather. Sculpt gains Overwrite, exact island shapes, Erode, River carve and Stamp, and deposits and goods can be edited by hand. Render Studio adds compass roses, scale bars, a cartouche, a legend, a neatline and your own symbol packs; Write adds Suggest mode, comments and an Outline with a Corkboard; campaigns gain templates, a combat tracker, dungeons from a sentence and Roll the road. Downloads go where you choose, and builds are faster: Quick about 30 seconds and Full about a minute and a half.",
    "0.9.16": "A city builder: any town opens as a city on its real coast, rivers and hills, and grows from a village to a metropolis of two million, with walls, gates, docks, slums, suburbs and districts named in the world's own tongue. Paint districts, lock roads, add landmarks, tilt the city into 3D and export it in seventeen styles, including VTT battle maps; the World, continent and region maps show it as you left it. A world can be a flat disc with an Edge. The World map sharpens as you zoom, up to eight times finer, and straits and land bridges hold on every finer map. Nations can be given the languages they speak, islands can come from an SVG drawing, and Create gains Rules of the world. Rain reaches deep into continents and piles up against mountains, with sharper rain shadows; the Weather year adds heatwaves, gusts, the polar vortex, moving sea ice, icebergs and plankton blooms; every world has an impact history, and moons of gas giants get eclipses and tidal volcanoes.",
    "0.9.15": "Mark where your mountains go, in Create before the world exists, on an import's guide page or with the Sculptor's Mountain guide, and the plates build real ranges there, with ridges, foothills and valleys. Imported plates can say which way they move, and the Sculptor's Plate motion tool turns a built world's plates. A region can be made from menus alone, with no description, and a wild region has no realm, no shires and no towns. A Polyhedral world map lays the world on an icosahedron, and Export makes it a printable hex sheet with glue tabs; Large map now exports the whole world too. Modern-day deposits such as lithium, rare earths and uranium join the resource maps. CartoVox gives memory back after each build, and Full worlds build about a fifth faster.",
    "0.9.14": "Region worlds: a county, a kingdom or a continent of your own, described in your own words, drawn or imported, then simulated and drawn at Standard, High or Ultra detail, up to a 16,384-pixel map, with its own towns, roads, baronies or shires, gazetteer, Travel and campaign table. Continent and region maps show all 94 World map views and export whole as large maps up to 16K. A new Satellite look shows the world from orbit, with clouds from the season's weather and a night side lit by its towns. Sculpt works on world, continent and region maps alike, Move island carries an island or a whole continent across the globe, and a Crater tool places calderas, impact craters and maars whose lakes come from the weather. Rivers meander as their slope and size allow, CartoVox opens on a title screen, and the new screens read in German, French, Spanish, Portuguese and Polish.",
    "0.9.13": "The climate behaves more like Earth's: rainforests are back in the equatorial lowlands, summer monsoons reach the edges of the subtropics, and tropical highlands are no longer deserts. Lakes are the right size: they evaporate, wet basins drain their giant lakes, and rift valleys hold chains of long, narrow lakes. Ocean trenches are narrow troughs, and a Trench depth of 0 gives none. Sculpt gains Built island and Wall tools, imported and drawn maps get their own Candidates, and zooming in shows real detail, down to each town's plan at its true size. Settlement Studio, Scene Studio and Travel put their map first, and an edit in one corner no longer renames towns on the far side.",
    "0.9.12": "The sea shapes every new world's coasts: glaciers carve fjords, drowned river valleys become long inlets and estuaries, waves cut bays between headlands, and barrier islands, lagoons and reefs rise offshore, all shown in a new Coast Lab. Land can sink below sea level, deserts have oases, and any nation can be given a strength, a naval reach and natural borders. Bring your own rivers and lakes into an imported map, see what Create made of every sentence of your description, and work in a calmer workspace with Sculpt docked beside the map.",
    "0.9.11": "Windows worlds that had stopped accepting changes restore, re-simulate and render again. Several GeoJSON files make one world, and plate lines painted over a picture of your map raise mountains where the plates collide. Rivers cut their valleys and local rebuilds wear your edit, ocean gyres bring warm currents, and the interface follows five languages almost everywhere.",
    "0.9.10": "Place key features and measured limits, import maps one decision at a time, edit rivers and nations, rebuild locally, plan campaigns and invite players on your local network. Seasonal soil water, ice domes, deltas and dunes shape the world; drafts and books have new ways to save and export.",
    "0.9.9": "Place a climate in plain words and see it on the cards, build imported and drawn worlds with rivers again, bring in Web Mercator and UTM maps, start on current Linux desktops, and build faster with spare memory.",
    "0.9.8": "Let your brief win over the planet type, watch lakes settle and rivers run downhill, map states and counties, play at a native tabletop, and finish a piece in Make.",
    "0.9.7": "Open offline starter worlds, choose your interface language, build on less memory, take a world to Foundry or your VTT, and bring in lore from World Anvil, Kanka, LegendKeeper or Campfire.",
    "0.9.6": "Run centuries of history over your world, build it in four clear steps, map volcanoes, caves and coasts, and bind an atlas with a cover, legend and gazetteer.",
    "0.9.5": "Draw your own realms on a saved world, plan settlements around their water, export layered vector maps, and steer your tongues in the Lexicon.",
    "0.9.4": "Shape a world while it builds, explore deposits and species, bring in hand-drawn maps, and refine a region with more detail.",
    "0.9.3": "A world with history: realm relations, campaign player views, new projections, scenes and writing tools.",
    "0.9.2": "The first Delta build adds access codes, live sculpting, deeper authoring and clearer world reports.",
}

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{page_title}</title>
  <meta name="description" content="{page_description}">
  <link rel="canonical" href="{canonical}">
  <meta name="theme-color" content="#0b0c10">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{page_title}">
  <meta property="og:description" content="{page_description}">
  <meta property="og:url" content="{canonical}">
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
      <img class="nav-mark" src="/img/nav-mark-v3.svg" width="40" height="40" alt="">
      <img class="nav-wordmark" src="/img/wordmark-v3.svg" width="652" height="126" alt="CartoVox">
    </a>
    <nav class="nav-links" id="nav-links" aria-label="Sections">
      <a href="/">Home</a>
      <a href="/guide/">Guide</a>
      <a href="/releases/" aria-current="page">Release notes</a>
      <a href="/#faq">FAQ</a>
      <a class="btn btn-gold btn-sm nav-cta-mobile" href="https://discord.gg/Y5aRPkk8g2" target="_blank" rel="noopener">Request an invite</a>
    </nav>
    <a class="btn btn-gold btn-sm nav-cta" href="https://discord.gg/Y5aRPkk8g2" target="_blank" rel="noopener">Request an invite</a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</header>
<main id="main" class="guide">
  <aside class="guide-toc" aria-label="Release navigation">
    <p class="eyebrow">{nav_label}</p>
    <nav class="toc-list">
{toc}
    </nav>
  </aside>
  <div class="guide-body">
    <header class="guide-head">
      <p class="eyebrow">{eyebrow}</p>
      <h1>{heading}</h1>
      <p class="lede">{intro}</p>
      <p class="muted small">The application was called <i>Atlas Studio</i> until version 0.8.2. Builds are shared with invited testers on the <a href="https://discord.gg/Y5aRPkk8g2" target="_blank" rel="noopener">Discord server</a>; these notes are also readable offline inside the app.</p>
      <details class="mobile-contents"><summary>{mobile_nav_label}</summary><nav class="toc-list mobile-toc" aria-label="Release navigation">{mobile_fallback}</nav></details>
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
    if len(sys.argv) not in (2, 4) or (len(sys.argv) == 4 and sys.argv[2] != "--through"):
        sys.exit(__doc__)
    through = sys.argv[3] if len(sys.argv) == 4 else None
    releases = load(Path(sys.argv[1]), through)
    toc, cards = [], []
    for release in releases:
        rid = "upcoming" if not release["released"] else f"v{release['version']}"
        label = "Upcoming" if not release["released"] else (release.get("name") or release["version"])
        date = release["date"]
        toc.append(f'      <a href="#{rid}"><span>{html.escape(label)}</span><small>{html.escape(date or "unreleased")}</small></a>')
        _, body_html = build_legal.render(demote(release["body"]))
        heading = "Upcoming" if not release["released"] else f"CartoVox {release.get('name') or release['version']}"
        badge = "" if release["released"] else ' <span class="badge badge-soft">not yet released</span>'
        article = f"""    <article class="release" id="{rid}">
      <header class="release-head">
        <h2>{html.escape(heading)}{badge}</h2>
        {f'<p class="release-tag">{html.escape(release["tagline"])}</p>' if release["tagline"] else ''}
        {f'<time datetime="{date}">{date}</time>' if date else ''}
      </header>
      <div class="doc-body">
{body_html}
      </div>
    </article>"""
        url = f"/releases/{rid}/"
        summary = HIGHLIGHTS.get(release["version"], release["tagline"] or "Read the complete changes and compatibility notes.")
        cards.append(f"""    <article class="release-card" id="{rid}">
      <div><span class="experience-index">{html.escape(date or 'In development')}</span><h2>{html.escape(heading)}{badge}</h2>
      <p>{html.escape(summary)}</p></div>
      <a class="btn btn-ghost" href="{url}">Read full notes <span aria-hidden="true">↗</span></a>
    </article>""")
        nearby = [r for r in releases if r is not release and r["released"]][:3]
        detail_toc = ['      <a href="/releases/">All release notes</a>'] + [
            f'      <a href="/releases/{"v" + r["version"]}/">{html.escape(r.get("name") or r["version"])}</a>'
            for r in nearby
        ]
        detail = PAGE.format(
            page_title=html.escape(f"{heading} — full release notes"),
            page_description=html.escape(f"The full CartoVox {label} release notes: changes, compatibility and known limits."),
            canonical=f"https://cartovox.org{url}", nav_label="Releases", toc="\n".join(detail_toc),
            eyebrow=html.escape(f"Full release notes · {date}" if date else "Full release notes"), heading=html.escape(heading),
            intro=html.escape(summary), mobile_nav_label="Browse releases",
            mobile_fallback='<a href="/releases/">All release notes</a>',
            articles=f'    <article class="release release-detail" id="{rid}"><div class="doc-body">\n{body_html}\n      </div></article>',
        )
        detail_target = ROOT / "releases" / rid / "index.html"
        detail_target.parent.mkdir(parents=True, exist_ok=True)
        detail_target.write_text(detail, encoding="utf-8")
    target = ROOT / "releases" / "index.html"
    target.parent.mkdir(exist_ok=True)
    target.write_text(PAGE.format(
        page_title="Release notes — CartoVox",
        page_description="The CartoVox release archive. See what changed in Delta V16.1 and browse complete notes for every release.",
        canonical="https://cartovox.org/releases/", nav_label="Versions", toc="\n".join(toc),
        eyebrow="Release notes", heading="What changed, version by version.",
        intro="Start with the latest Delta release, or open any version for its complete changes and compatibility notes.",
        mobile_nav_label="Browse all versions",
        mobile_fallback='<a href="#v0.9.18">Latest release</a>', articles="\n".join(cards),
    ), encoding="utf-8")
    print(f"  releases/index.html + {len(releases)} full notes")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build-sitemap.py")], check=True)


if __name__ == "__main__":
    main()
