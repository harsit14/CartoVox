#!/usr/bin/env python3
"""Draw the site's map furniture from the app's own designs.

    python3 tools/build-furniture.py <app>

The compass roses are CartoVox's Compass designer (world/furniture_designs.py),
the same shapes an atlas plate or a Render Studio sheet draws, inked in the
site's brass. The meridian ring round the home page's globe is drawn here:
a tick every five degrees, a longer one every thirty.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRASS, BRASS_HI, NIGHT = "#d9b45c", "#f1d78f", "#0b0c10"


def ring(size: int = 600) -> str:
    c = size / 2
    r_out, r_in = c - 2, c - 14
    parts = [f'<circle cx="{c}" cy="{c}" r="{r_out}" fill="none" stroke="{BRASS}" stroke-opacity=".55" stroke-width="1.2"/>',
             f'<circle cx="{c}" cy="{c}" r="{r_in}" fill="none" stroke="{BRASS}" stroke-opacity=".35" stroke-width="1"/>']
    for deg in range(0, 360, 5):
        a = math.radians(deg)
        long = deg % 30 == 0
        r0 = r_in if long else r_out - 6
        x0, y0 = c + r0 * math.sin(a), c - r0 * math.cos(a)
        x1, y1 = c + r_out * math.sin(a), c - r_out * math.cos(a)
        parts.append(f'<line x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" stroke="{BRASS}" '
                     f'stroke-opacity="{.8 if long else .5}" stroke-width="{1.2 if long else .8}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
            + "".join(parts) + "</svg>")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sys.path.insert(0, sys.argv[1])
    from world import furniture_designs as designs
    rose = designs.preview_svg("compass", {
        "points": 16, "rings": 2, "ticks": True, "fleur": True, "letters": "none",
        "ink": BRASS, "accent": BRASS_HI, "fill": NIGHT, "weight": 1.0}, 320)
    small = designs.preview_svg("compass", {
        "points": 8, "rings": 1, "ticks": False, "fleur": True, "letters": "none",
        "ink": BRASS, "accent": BRASS_HI, "fill": NIGHT, "weight": 1.2}, 160)
    paper = designs.preview_svg("compass", {
        "points": 16, "rings": 2, "ticks": True, "fleur": True, "letters": "none",
        "ink": "#4a3d26", "accent": "#9c3a24", "fill": "#efe4c8", "weight": 1.0}, 320)
    out = {"img/rose.svg": rose, "img/rose-paper.svg": paper, "img/rose-small.svg": small, "img/meridian-ring.svg": ring()}
    for rel, svg in out.items():
        (ROOT / rel).write_text(svg + "\n", encoding="utf-8")
        print(f"  {rel}: {(ROOT / rel).stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
