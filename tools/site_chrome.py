"""The site's shared header and footer, for the generated pages.

The guide (tools/build-guide.py) and the release archive
(tools/build-releases.py) do not carry their own copy of the navigation.
They take the header and footer from a hand-written page that does, so a
change to the shared nav reaches them on the next build:

    the block between <!-- site-header --> and <!-- /site-header --> (or the
    first <header class="nav ...">…</header>, with the "coming soon" banner
    before it and the no-script nav after it, when the page has them), and the block between
    <!-- site-footer --> and <!-- /site-footer --> (or the first
    <footer class="footer">…</footer>), from SOURCES in order.

The link to the page being built is marked aria-current="page"; every other
aria-current is dropped. Links that point into the source page itself
(href="#…") are made absolute so they work from a sub-page.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Pages with the shared chrome, most specific first. /features/ is a
# document page like the guide, so its header is the closest match.
SOURCES = ("features/index.html", "index.html")

FALLBACK_HEADER = """<header class="nav is-scrolled">
  <div class="nav-inner">
    <a class="nav-brand" href="/" aria-label="CartoVox home">
      <img class="nav-mark" src="/img/nav-mark-v3.svg" width="40" height="40" alt="">
      <img class="nav-wordmark" src="/img/wordmark-v3.svg" width="652" height="126" alt="CartoVox">
    </a>
    <nav class="nav-links" id="nav-links" aria-label="Sections">
      <a href="/features/">Features</a>
      <a href="/discover/">Discover</a>
      <a href="/guide/">Guide</a>
      <a href="/releases/">Releases</a>
      <a class="btn btn-gold btn-sm nav-cta-mobile" href="/#download">Download free</a>
    </nav>
    <a class="btn btn-gold btn-sm nav-cta" href="/#download">Download free</a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</header>"""

FALLBACK_FOOTER = """<footer class="footer">
  <div class="wrap footer-inner doc-footer">
    <p class="footer-fine">© 2026 Harsit Upadhya. This site sets no cookies and runs no analytics.
      <a href="/privacy/">Privacy</a> · <a href="/eula/">Licence</a> · <a href="https://discord.gg/Y5aRPkk8g2">Discord</a></p>
  </div>
</footer>"""


def _block(text: str, marker: str, fallback: re.Pattern[str]) -> str | None:
    marked = re.search(rf"<!-- {marker} -->(.*?)<!-- /{marker} -->", text, re.S)
    if marked:
        return marked.group(1).strip("\n")
    found = fallback.search(text)
    return found.group(0) if found else None


def _source_blocks() -> tuple[str, str, str]:
    for rel in SOURCES:
        path = ROOT / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        header = _block(text, "site-header", re.compile(
            r'(?:<!-- RELEASE-1\.1[^\n]*-->\s*)?(?:<p class="soon-banner".*?</p>\s*)?'
            r'<header class="nav[^"]*"[^>]*>.*?</header>'
            r'(?:\s*<noscript><nav class="nojs-nav".*?</noscript>)?', re.S))
        footer = _block(text, "site-footer", re.compile(r'<footer class="footer"[^>]*>.*?</footer>', re.S))
        if header and footer:
            return header, footer, rel
    return FALLBACK_HEADER, FALLBACK_FOOTER, ""


def _absolute(block: str, source: str) -> str:
    base = "/" + source.removesuffix("index.html") if source else "/"
    return re.sub(r'href="#([^"]*)"', lambda m: f'href="{base}#{m.group(1)}"', block)


def _current(block: str, current: str) -> str:
    block = re.sub(r'\s+aria-current="page"', "", block)
    if not current:
        return block
    pattern = re.compile(r'(<a\b[^>]*\bhref="' + re.escape(current) + r'")')
    return pattern.sub(r'\1 aria-current="page"', block)


def header(current: str = "") -> str:
    block, _, source = _source_blocks()
    block = _absolute(block, source)
    # The home page's header hides itself until scrolled; a document page's does not.
    block = re.sub(r'<header class="nav"', '<header class="nav is-scrolled"', block, count=1)
    block = re.sub(r'(<header class="nav[^"]*") id="top"', r"\1", block, count=1)
    block = re.sub(r'href="/#top"', 'href="/"', block)
    return _current(block, current)


def footer() -> str:
    _, block, source = _source_blocks()
    return _absolute(block, source)
