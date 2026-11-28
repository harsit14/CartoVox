#!/usr/bin/env python3
"""Render a compact release index and one page per release.

    python3 tools/build-releases.py <app-repo>/.github/release-notes --through 1.0.1

Pass --through with the newest released version so notes still in
development (a later vN.txt, or unreleased.txt) stay off the site. At a
release, add the version's date to DATES (or put the date in the note's
title line, "CartoVox 1.1 — 2 December 2026") and its one-line headline to
tools/release-highlights/headlines.json; HIGHLIGHTS holds the longer
summary shown when it is the latest. The header and footer come from the
site's own pages (tools/site_chrome.py).

Each note is a text file: a title line, then Markdown. The rendering keeps the
notes whole except for two things. The application was called Atlas Studio
until 0.8.2, so the old name is written as the current one (feature names such
as Atlas plates keep theirs). And the paragraphs that told testers where to
download installers from are dropped, because that route is no longer where
builds are published; the site's download section is.
"""
from __future__ import annotations

import hashlib
import html
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import site_chrome  # noqa: E402

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
    "1.0.0": "2026-11-22", "1.0.1": "2026-11-25",
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
        # From 1.0 a release is shown by the name the app gives it: "CartoVox
        # 1.0 — 22 November 2026" reads as CartoVox 1.0, not 1.0.0.
        if not name and version_key(version) >= (1, 0, 0):
            named = re.match(r"CartoVox (\d+(?:\.\d+)*)\b", title)
            name = named.group(1) if named else ""
        if name and tagline == name:
            tagline = ""
        # Notes from before 0.8.3 were written under the old name; 0.8.3 itself
        # announces the change and must keep the old name where it says so.
        written_under_old_name = version_key(version) < (0, 8, 3)
        releases.append({"version": version, "name": name, "tagline": tagline, "date": DATES.get(version, ""), "title": title,
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
    # Prepared for the 1.1 release; unused until a v1.1 note is built.
    "1.1": "Discover brings 47 hand-picked worlds, with cities, ships, dungeons and style packs, each built on your computer in one click. Every world gains an Underworld of caverns, tunnels and underground seas, and the Cataclysm Lab plays eruptions, impacts, earthquakes and rising seas over your own ground. Cut canals, dam valleys, move borders by hand, watch a plague or a rumour spread, and fly over a continent or a city in 3D. For the table there are Props Studio handouts, ships and dungeons built deck by deck, tokens, a story canvas and a War animator; for the book, a multi-track Chronicle, dynasties, tongue scripts as fonts, beta-reader DOCX and print covers. Search everything with Cmd/Ctrl+K, and choose a workspace focus that puts your own work first.",
    "1.0.1": "The first update to CartoVox 1.0. The Sculptor's Stamp gains seventeen landforms, from cenotes and tepuis to canyons, drumlins and salt flats, and worlds now find and name them where their rock, climate, water and ice put them. The city builder can fill water to a height, so islands no longer need tracing by hand, and the water and land you shape can be chosen again, changed, moved or deleted; towns now fill small islands, and Generate city now plans the ground you draw. On the Polyhedral and butterfly World maps, rivers, roads and borders stop at each triangle's edge instead of crossing the gaps, and names read upright. Disc, region and flat worlds show themselves taking shape while they build, with closer time and memory estimates. CartoVox opens quietly, gains a Safe graphics switch on Windows and Linux, and says on its title screen when a new version is out.",
    "1.0.0": "CartoVox 1.0, free for everyone: no invites, no access codes and no check-ins, and it works offline. Make your own species and the ecosystems that shape their ranges, and biomes drawn by climate or by their signature species. Build flat worlds beside disc worlds, draw regions of your own across any border, and shape the night sky's constellations with their lore. Edit an atlas plate after it is drawn, in five new looks from woodcut to Admiralty chart; Render Studio gains five art directions and terrain flyovers. Players join the tabletop from their own phone, tablet or computer, a World Bible downloads as PDF or EPUB, and a world can be shared as an offline web map. The World map can be explored by keyboard and screen reader, and CartoVox updates itself, checking only for new versions.",
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

# The "What's new" summaries that lived in the guide until 1.1, one HTML
# fragment per version, and the one-line headline each one opened with. A
# release without a fragment shows only its full notes; a release without a
# headline uses its tagline or the first sentence of HIGHLIGHTS. For a new
# release, add its headline to headlines.json (and, if wanted, a fragment).
HIGHLIGHT_DIR = ROOT / "tools" / "release-highlights"
HEADLINES = json.loads((HIGHLIGHT_DIR / "headlines.json").read_text(encoding="utf-8"))

ERAS = [
    ("cartovox-1", "CartoVox 1", "Free public releases.", lambda v: version_key(v) >= (1, 0, 0)),
    ("delta", "Delta builds", "Invited testers, from access codes in September to the last Delta in November 2026.",
     lambda v: (0, 9, 2) <= version_key(v) < (1, 0, 0)),
    ("early", "Before Delta", "The first builds, called Atlas Studio until 0.8.2.", lambda v: version_key(v) < (0, 9, 2)),
]

MONTHS = {m: i for i, m in enumerate(("January", "February", "March", "April", "May", "June", "July", "August",
                                      "September", "October", "November", "December"), 1)}

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
  <link rel="stylesheet" href="/css/guide.css">
</head>
<body class="doc-page release-page">
<a class="skip" href="#main">Skip to content</a>
{header}
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
      <p class="muted small">{fine}</p>
      <details class="mobile-contents"><summary>{mobile_nav_label}</summary><nav class="toc-list mobile-toc" aria-label="Release navigation">
{toc}
      </nav></details>
    </header>
{articles}
  </div>
</main>
{footer}
<script src="/js/site.js" defer></script>
</body>
</html>
"""

FINE = ("The application was called <i>Atlas Studio</i> until version 0.8.2. CartoVox 1.0 and later are free downloads; "
        "Delta builds before it were shared with invited testers on the "
        '<a href="https://discord.gg/Y5aRPkk8g2" target="_blank" rel="noopener">Discord server</a>. '
        "These notes are also readable offline inside the app, under Settings › Release notes. "
        'How to use the app is in the <a href="/guide/">guide</a>.')


def release_date(release: dict, title_line: str = "") -> str:
    if release["date"]:
        return release["date"]
    found = re.search(r"(\d{1,2}) (" + "|".join(MONTHS) + r") (\d{4})", title_line)
    return f"{found.group(3)}-{MONTHS[found.group(2)]:02d}-{int(found.group(1)):02d}" if found else ""


def nice_date(iso: str) -> str:
    if not iso:
        return ""
    year, month, day = iso.split("-")
    return f"{int(day)} {list(MONTHS)[int(month) - 1]} {year}"


def headline(release: dict) -> str:
    version = release["version"]
    if version in HEADLINES:
        return HEADLINES[version]
    if release["tagline"] and not re.fullmatch(r"\d{1,2} \w+ \d{4}", release["tagline"]):
        return release["tagline"][0].upper() + release["tagline"][1:]
    summary = HIGHLIGHTS.get(version, "")
    return summary.split(". ")[0].rstrip(".") + "." if summary else ""


def stamp(text: str) -> str:
    """Content hashes on local assets, as tools/stamp-assets.py writes them."""
    def one(m: re.Match[str]) -> str:
        path = ROOT / m.group(1).lstrip("/")
        if not path.is_file():
            return m.group(0)
        return f'{m.group(1)}?v={hashlib.sha256(path.read_bytes()).hexdigest()[:10]}'
    return re.sub(r'(/(?:css|js|img|fonts)/[\w./-]+\.\w+|/favicon\.ico)(?:\?v=[0-9a-f]+)?', one, text)


def label_of(release: dict) -> str:
    return release.get("name") or release["version"]


def main() -> None:
    if len(sys.argv) not in (2, 4) or (len(sys.argv) == 4 and sys.argv[2] != "--through"):
        sys.exit(__doc__)
    through = sys.argv[3] if len(sys.argv) == 4 else None
    releases = [r for r in load(Path(sys.argv[1]), through) if r["released"]]
    header, footer = site_chrome.header("/releases/"), site_chrome.footer()
    for release in releases:
        release["date"] = release_date(release, release.get("title", ""))
        release["headline"] = headline(release)
        release["heading"] = f"CartoVox {label_of(release)}"
        release["url"] = f"/releases/v{release['version']}/"
    latest = releases[0]

    # One page per release: its highlights (when the guide had them), then the full notes.
    for position, release in enumerate(releases):
        rid = f"v{release['version']}"
        _, body_html = build_legal.render(demote(release["body"]))
        # The page's own Highlights section owns #highlights (old guide links land there).
        body_html = body_html.replace('id="highlights"', 'id="notes-highlights"')
        fragment = HIGHLIGHT_DIR / f"{rid}.html"
        parts = []
        if not fragment.exists() and release["version"] in HIGHLIGHTS:
            parts.append(f'    <p class="section-lede">{html.escape(HIGHLIGHTS[release["version"]])}</p>')
        if fragment.exists():
            parts.append('    <section class="release-highlights" id="highlights" aria-labelledby="highlights-title">\n'
                         '      <h2 id="highlights-title">Highlights</h2>\n'
                         + fragment.read_text(encoding="utf-8") + "    </section>")
        parts.append(f'    <article class="release release-detail release-full" id="{rid}">\n'
                     f'      <h2 id="full-notes">Full notes</h2>\n      <div class="doc-body">\n{body_html}\n      </div>\n    </article>')
        newer = releases[position - 1] if position > 0 else None
        older = releases[position + 1] if position + 1 < len(releases) else None
        pager = ['    <nav class="release-pager" aria-label="Neighbouring releases">']
        pager.append(f'      <a href="{older["url"]}">← {html.escape(older["heading"])}</a>' if older else "      <span></span>")
        pager.append(f'      <a href="{newer["url"]}">{html.escape(newer["heading"])} →</a>' if newer else "      <span></span>")
        pager.append("    </nav>")
        parts.append("\n".join(pager))
        toc = ['      <a href="/releases/">All releases</a>']
        if fragment.exists():
            toc.append('      <a href="#highlights">Highlights</a>')
        toc.append('      <a href="#full-notes">Full notes</a>')
        for other in (newer, older):
            if other:
                toc.append(f'      <a href="{other["url"]}"><span>{html.escape(label_of(other))}</span><small>{other["date"]}</small></a>')
        date = nice_date(release["date"])
        detail = PAGE.format(
            page_title=html.escape(f"{release['heading']} — release notes"),
            page_description=html.escape(f"What changed in {release['heading']}: highlights, full changes and compatibility notes."),
            canonical=f"https://cartovox.org{release['url']}", header=header, footer=footer, nav_label="Releases",
            toc="\n".join(toc), eyebrow=html.escape(f"Release notes · {date}" if date else "Release notes"),
            heading=html.escape(release["heading"]), intro=html.escape(release["headline"]), fine=FINE,
            mobile_nav_label="On this page", articles="\n".join(parts),
        )
        target = ROOT / "releases" / rid / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(stamp(detail), encoding="utf-8")

    # The archive: the latest release in full, then every release as one row, newest first.
    articles = [f"""    <section class="release-latest" id="latest" aria-labelledby="latest-title">
      <p class="eyebrow">Latest release · <time datetime="{latest['date']}">{nice_date(latest['date'])}</time></p>
      <h2 id="latest-title">{html.escape(latest['heading'])}</h2>
      <p class="release-headline">{html.escape(latest['headline'])}</p>
      {f"<p>{html.escape(HIGHLIGHTS[latest['version']])}</p>" if latest['version'] in HIGHLIGHTS else ''}
      <a class="btn btn-gold" href="{latest['url']}">Read the {html.escape(label_of(latest))} notes</a>
    </section>"""]
    toc = []
    for era_id, era_title, era_note, member in ERAS:
        rows = [r for r in releases if member(r["version"])]
        if not rows:
            continue
        toc.append(f'      <a href="#{era_id}"><span>{html.escape(era_title)}</span><small>{len(rows)}</small></a>')
        items = "\n".join(
            f'        <li><a class="release-row" id="v{r["version"]}" href="{r["url"]}"><span class="rv">{html.escape(label_of(r))}</span>'
            f'<time datetime="{r["date"]}">{nice_date(r["date"])}</time><span class="rh">{html.escape(r["headline"])}</span></a></li>'
            for r in rows)
        articles.append(f"""    <section class="release-era" id="{era_id}" aria-labelledby="{era_id}-title">
      <h2 id="{era_id}-title">{html.escape(era_title)}</h2>
      <p>{html.escape(era_note)}</p>
      <ul class="release-list">
{items}
      </ul>
    </section>""")
    target = ROOT / "releases" / "index.html"
    target.write_text(stamp(PAGE.format(
        page_title="Releases — CartoVox",
        page_description=f"The CartoVox release archive: what changed in {latest['heading']} and every version before it, newest first.",
        canonical="https://cartovox.org/releases/", header=header, footer=footer, nav_label="Releases",
        toc="\n".join(toc), eyebrow="Releases", heading="What changed, version by version.",
        intro=f"{latest['heading']} is the latest release. Every version since the first build is below, newest first; open one for its highlights and complete notes.",
        fine=FINE, mobile_nav_label="Jump to", articles="\n".join(articles),
    )), encoding="utf-8")
    print(f"  releases/index.html + {len(releases)} release pages (latest {latest['heading']})")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build-sitemap.py")], check=True)


if __name__ == "__main__":
    main()
