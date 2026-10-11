#!/usr/bin/env python3
"""Derive every image the site ships from the CartoVox sources.

The VectorCraft v3 brand sources live in brand/v3. Saved worlds and studio
screenshots live outside this repository. Run it as

    python3 tools/build-images.py --brand brand/v3 \
        --worlds <library>/worlds --shots <dir-of-studio-pngs>

Every flag is optional; a pass without a flag simply skips that group, so the
screenshot pass can be re-run alone once new shots exist. Output goes to img/.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from brand_assets import build_brand, social_card

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "img"
IMG.mkdir(exist_ok=True)

WORLD_IDS = {
    "hanahara": "world_090ff6e33900",
    "amamiya": "world_52d230f5dfde",
    "ixrixenrond": "world_90ae45f361f3",
    "amashima": "world_d5906b99c8ba",
}
STYLES = ("tolkien", "imhof", "modern", "nautical", "ink", "grimdark", "realms", "political")


def save(im: Image.Image, name: str, width: int | None = None, quality: int = 82,
         jpg: bool = False) -> None:
    # WebP keeps an alpha channel when the source has one: the wordmark and the
    # lockup sit over a photograph, and a flattened plate would show as a box.
    if not name.endswith(".png"):
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") and name.endswith(".webp") else "RGB")
    if width and im.width > width:
        ratio = width / im.width
        im = im.resize((width, round(im.height * ratio)), Image.LANCZOS)
    if name.endswith(".png"):
        im.save(IMG / name, optimize=True)
    else:
        im.save(IMG / name, "WEBP", quality=quality, method=6)
        if jpg:
            im.save(IMG / name.replace(".webp", ".jpg"), "JPEG", quality=quality,
                    optimize=True, progressive=True)
    print(f"  {name} {im.size}")


def worlds(library: Path) -> None:
    print("worlds")
    for slug, wid in WORLD_IDS.items():
        plate = Image.open(library / wid / "plates" / "00-world.png")
        save(plate, f"plate-{slug}.webp", width=1600)
    hero = Image.open(library / WORLD_IDS["ixrixenrond"] / "plates" / "00-world.png")
    save(hero, "hero-world.webp", width=2400, quality=80, jpg=True)
    save(hero, "hero-world-1200.webp", width=1200, quality=80)
    ama = library / WORLD_IDS["amashima"] / "plates"
    save(Image.open(ama / "00-world.png"), "compare-labelled.webp", width=1600)
    save(Image.open(ama / "00-world-unlabelled.png"), "compare-unlabelled.webp", width=1600)
    ixr = library / WORLD_IDS["ixrixenrond"]
    for style in STYLES:
        save(Image.open(ixr / "styles" / f"style_{style}.png"), f"style-{style}.webp", width=1440)
    save(Image.open(ixr / "plates" / "01-orelan.png"), "region-orelan.webp", width=1800)
    globes = Image.open(ixr / "03_globes.png")
    save(globes, "globes.webp", width=1088)
    # One globe from the four-up sheet, for the ownership section.
    half = globes.width // 2
    save(globes.crop((0, 0, half, half)), "globe.webp", width=544)
    save(Image.open(ixr / "01_relief.png"), "relief.webp", width=1440)
    # A city plan: the settlement sheet the world draws for a named place.
    save(Image.open(ixr / "city_plans" / "C1-zhargundbar.png"), "city-plan.webp", width=1600)


CHAIN = {
    "tectonics": "04_tectonics.png",
    "relief": "01_relief.png",
    "glacial_legacy": "18_glacial_legacy.png",
    "temperature_annual": "06_temperature_annual.png",
    "ocean_currents": "11_ocean_currents.png",
    "precipitation_annual": "07_precipitation_annual.png",
    "drainage": "10_drainage.png",
    "soils": "17_soils.png",
    "biomes": "02_biomes.png",
    "resources": "19_resources.png",
    "civilisation": "12_civilisation.png",
    "realms": "styles/style_realms.png",
    "landmarks_routes": "20_landmarks_routes.png",
}


def chain(library: Path) -> None:
    """The causal-chain views: the world's own saved map renders, uncropped."""
    print("chain")
    world = library / WORLD_IDS["ixrixenrond"]
    for view, name in CHAIN.items():
        save(Image.open(world / name), f"chain-{view}.webp", width=1440, quality=80)


def shots(shots_dir: Path) -> None:
    print("shots")
    for path in sorted(shots_dir.glob("*.png")):
        if path.stem.startswith("chain-"):
            continue
        save(Image.open(path), f"app-{path.stem}.webp", width=1800, quality=80)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", type=Path, help="VectorCraft v3 exports (brand/v3)")
    parser.add_argument("--icons", type=Path, help="alias for --brand; accepts brand or brand/v3")
    parser.add_argument("--worlds", type=Path)
    parser.add_argument("--shots", type=Path)
    parser.add_argument("--chain", type=Path, help="library root; only the chain views")
    parser.add_argument("--social", action="store_true")
    args = parser.parse_args()
    if args.brand or args.icons:
        build_brand(args.brand or args.icons)
    if args.worlds:
        worlds(args.worlds)
        chain(args.worlds)
    elif args.chain:
        chain(args.chain)
    if args.shots:
        shots(args.shots)
    if args.social or args.brand or args.icons or args.worlds:
        social_card()


if __name__ == "__main__":
    main()
