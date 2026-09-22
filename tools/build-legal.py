#!/usr/bin/env python3
"""Render the licence and third-party notices from the app's Markdown.

    python3 tools/build-legal.py <app-repo>/EULA.md <app-repo>/THIRD-PARTY-NOTICES.md

Writes eula/index.html and third-party-notices/index.html. The converter
covers exactly what those two documents use — headings, paragraphs, bullet
lists, tables, rules, emphasis, code and links — and nothing else on purpose,
so a construct it does not know shows up as plain text rather than vanishing.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

INLINE = [
    (re.compile(r"`([^`]+)`"), lambda m: f"<code>{html.escape(m.group(1))}</code>"),
    (re.compile(r"\*\*(.+?)\*\*"), lambda m: f"<strong>{m.group(1)}</strong>"),
    (re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])"), lambda m: f"<em>{m.group(1)}</em>"),
    (re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)"),
     lambda m: f'<a href="{m.group(2)}" rel="noopener">{m.group(1)}</a>'),
]


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    for pattern, repl in INLINE:
        text = pattern.sub(repl, text)
    return text


def render(markdown: str) -> tuple[str, str]:
    lines = markdown.splitlines()
    out: list[str] = []
    title = ""
    i = 0
    para: list[str] = []

    def flush_para() -> None:
        if para:
            out.append(f"<p>{inline(' '.join(s.strip() for s in para))}</p>")
            para.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            flush_para(); i += 1; continue
        if stripped.startswith("#"):
            flush_para()
            level = len(stripped) - len(stripped.lstrip("#"))
            text = stripped[level:].strip()
            if level == 1 and not title:
                title = text
                out.append(f"<h1>{inline(text)}</h1>")
            else:
                slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
                out.append(f'<h{level} id="{slug}">{inline(text)}</h{level}>')
            i += 1; continue
        if stripped in ("---", "***"):
            flush_para(); out.append("<hr>"); i += 1; continue
        if stripped.startswith("```"):
            flush_para()
            block: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i]); i += 1
            i += 1
            out.append("<pre>" + html.escape("\n".join(block)) + "</pre>")
            continue
        if stripped.startswith(">"):
            flush_para()
            quote: list[str] = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(re.sub(r"^\s*>\s?", "", lines[i])); i += 1
            inner, _ = render("\n".join(quote))[1], None
            out.append(f"<blockquote>{inner}</blockquote>")
            continue
        if re.match(r"^\s*\d+\. ", line):
            flush_para()
            out.append("<ol>")
            while i < len(lines) and lines[i].strip():
                if re.match(r"^\s*\d+\. ", lines[i]):
                    out.append(f"<li>{inline(re.sub(r'^\s*\d+\. ', '', lines[i]))}</li>")
                else:
                    out[-1] = out[-1][:-5] + " " + inline(lines[i].strip()) + "</li>"
                i += 1
            out.append("</ol>")
            continue
        if stripped.startswith("|"):
            flush_para()
            rows: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip()); i += 1
            cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
            body = [r for r in cells if not all(re.fullmatch(r":?-{2,}:?", c or "--") for c in r)]
            if body:
                head, *rest = body
                out.append("<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>")
                for r in rest:
                    out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
                out.append("</tbody></table>")
            continue
        if re.match(r"^\s*[-*] ", line):
            flush_para()
            out.append("<ul>")
            while i < len(lines) and (re.match(r"^\s*[-*] ", lines[i]) or (lines[i].startswith("  ") and lines[i].strip() and not re.match(r"^\s*[-*] ", lines[i]))):
                if re.match(r"^\s*[-*] ", lines[i]):
                    item = [re.sub(r"^\s*[-*] ", "", lines[i])]
                    i += 1
                    while i < len(lines) and lines[i].startswith("  ") and lines[i].strip() and not re.match(r"^\s*[-*] ", lines[i]):
                        item.append(lines[i].strip()); i += 1
                    out.append(f"<li>{inline(' '.join(item))}</li>")
                else:
                    i += 1
            out.append("</ul>")
            continue
        if re.match(r"^\s{2,}\([a-z]\)", line):
            # Lettered sub-clauses: keep each on its own line inside the paragraph.
            # A clause is gathered whole before it is formatted, because its
            # emphasis regularly opens on one line and closes on the next.
            flush_para()
            clauses: list[list[str]] = []
            while i < len(lines) and lines[i].strip() and not lines[i].strip().startswith("#"):
                if re.match(r"^\s{2,}\([a-z]\)", lines[i]) or not clauses:
                    clauses.append([lines[i].strip()])
                else:
                    clauses[-1].append(lines[i].strip())
                i += 1
            out.append('<p class="clauses">')
            out.extend(f"<span>{inline(' '.join(parts))}</span>" for parts in clauses)
            out.append("</p>")
            continue
        para.append(line); i += 1
    flush_para()
    return title, "\n".join(out)


PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{page_title}</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="https://cartovox.org/{path}/">
  <meta name="theme-color" content="#0b0c10">
  <meta name="robots" content="noindex, follow">
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
      <img class="nav-mark" src="/img/nav-mark.png" width="33" height="40" alt="">
      <img class="nav-wordmark" src="/img/wordmark.webp" width="142" height="40" alt="CartoVox">
    </a>
    <nav class="nav-links doc-nav" id="nav-links" aria-label="Sections">
      <a href="/">Home</a>
      <a href="/guide/">Guide</a>
      <a href="/releases/">Release notes</a>
      <a href="/eula/">Licence</a>
      <a href="/third-party-notices/">Third-party notices</a>
      <a href="/privacy/">Privacy</a>
      <a class="btn btn-gold btn-sm nav-cta-mobile" href="https://discord.gg/nGNatfuXe" target="_blank" rel="noopener">Join the beta</a>
    </nav>
    <a class="btn btn-gold btn-sm nav-cta" href="https://discord.gg/nGNatfuXe" target="_blank" rel="noopener">Join the beta</a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</header>
<main id="main" class="doc">
  <article class="doc-body">
{body}
  </article>
  <p class="doc-note">This copy is published for reference. The authoritative text is the one shown inside the application, which you accept on first launch.</p>
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


def build(source: Path, path: str, description: str) -> None:
    title, body = render(source.read_text(encoding="utf-8"))
    target = ROOT / path / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    page_title = title if "CartoVox" in title else f"{title} — CartoVox"
    target.write_text(PAGE.format(title=html.escape(title), page_title=html.escape(page_title),
                                  description=html.escape(description),
                                  path=path, body=body), encoding="utf-8")
    print(f"  {target.relative_to(ROOT)} ← {source.name}")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    build(Path(sys.argv[1]), "eula", "The CartoVox End User License Agreement: what you may do with the application, and what it makes for you.")
    build(Path(sys.argv[2]), "third-party-notices", "Third-party components bundled with CartoVox and the licences they remain under.")


if __name__ == "__main__":
    main()
