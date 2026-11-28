#!/usr/bin/env python3
"""Build the home page's turning globe: its texture and its still poster.

    python3 tools/build-globe.py <app>/web/title/starter-world.webp

The texture is Eofordal, the example world every new copy of CartoVox opens
on (seed 20260914): the app's own title-screen planet, the World map's relief
tiles with their coasts, lakes and rivers, here 2,048 pixels round.
js/globe.js wraps it round an orthographic globe on a canvas and turns it.

The poster is one frame of the same globe, drawn here the way globe.js draws
it, so the page shows a planet before the script runs, without JavaScript,
and for anyone who asks for reduced motion before the texture arrives.
"""
from __future__ import annotations

import io
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TEXTURE = ROOT / "img" / "globe-eofordal.webp"
POSTER = ROOT / "img" / "globe-eofordal-poster.webp"
WIDTH = 2048
POSTER_SIZE = 560
#: Must match TILT and START in js/globe.js.
TILT = math.radians(18)
START = 0.62


#: The darkest tones on the planet are its deep-sea trenches (about 0.2 % of
#: the texture, half the brightness of the open ocean). On a turning globe a
#: few hundred pixels across, the long one that crosses the antimeridian
#: read as a seam, so tones below this luminance keep only a tenth of
#: their depth. Hue is kept; the open ocean and the land are untouched.
TRENCH_FLOOR = 60.0
TRENCH_KEEP = 0.1


def soften_trenches(rgb: np.ndarray) -> np.ndarray:
    pixels = rgb.astype(np.float32)
    lum = pixels @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    target = np.where(lum < TRENCH_FLOOR, TRENCH_FLOOR - (TRENCH_FLOOR - lum) * TRENCH_KEEP, lum)
    scale = target / np.maximum(lum, 1.0)
    return np.clip(pixels * scale[..., None], 0, 255).astype(np.uint8)


#: The open ocean is also eased with a soft blur (land and the coast stay
#: sharp): the trench's bright rim and its dark floor made a pair of lines
#: that a globe this size cannot resolve.
OCEAN_BLUR = 9


def ease_ocean(image: Image.Image) -> Image.Image:
    from PIL import ImageFilter
    rgb = np.asarray(image).astype(np.int16)
    water = (rgb[..., 2] - rgb[..., 0]) > 45
    land = Image.fromarray(np.where(water, 0, 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))  # coast kept sharp
    mask = Image.fromarray(255 - np.asarray(land)).filter(ImageFilter.GaussianBlur(4))
    # Blur a copy wrapped east and west, so the antimeridian stays seamless.
    pad = OCEAN_BLUR * 4
    arr = np.asarray(image)
    wrapped = Image.fromarray(np.concatenate([arr[:, -pad:], arr, arr[:, :pad]], axis=1))
    soft = wrapped.filter(ImageFilter.GaussianBlur(OCEAN_BLUR)).crop((pad, 0, pad + image.width, image.height))
    return Image.composite(soft, image, mask)


def project(texture: np.ndarray, size: int, offset: float) -> Image.Image:
    th, tw = texture.shape[:2]
    ys, xs = np.mgrid[0:size, 0:size]
    x = (xs + 0.5) / size * 2 - 1
    y = 1 - (ys + 0.5) / size * 2
    rr = x * x + y * y
    inside = rr <= 1
    z = np.sqrt(np.clip(1 - rr, 0, 1))
    # Tilt the north pole towards the viewer.
    y2 = y * math.cos(TILT) + z * math.sin(TILT)
    z2 = -y * math.sin(TILT) + z * math.cos(TILT)
    lat = np.arcsin(np.clip(y2, -1, 1))
    lon = np.arctan2(x, z2)
    u = ((lon / (2 * math.pi) + 0.5 + offset) % 1.0) * tw
    v = (0.5 - lat / math.pi) * th
    tx = np.clip(u.astype(int), 0, tw - 1)
    ty = np.clip(v.astype(int), 0, th - 1)
    rgb = texture[ty, tx]
    alpha = np.where(inside, 255, 0).astype(np.uint8)
    out = np.dstack([rgb, alpha])
    return Image.fromarray(out, "RGBA")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    source = Image.open(sys.argv[1]).convert("RGB")
    texture = source.resize((WIDTH, WIDTH // 2), Image.LANCZOS)
    texture = Image.fromarray(soften_trenches(np.asarray(texture)), "RGB")
    texture = ease_ocean(texture)
    texture.save(TEXTURE, "WEBP", quality=70, method=6)
    big = project(np.asarray(texture), POSTER_SIZE * 2, START)
    poster = big.resize((POSTER_SIZE, POSTER_SIZE), Image.LANCZOS)
    poster.save(POSTER, "WEBP", quality=72, method=6)
    for path in (TEXTURE, POSTER):
        print(f"  {path.relative_to(ROOT)}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
