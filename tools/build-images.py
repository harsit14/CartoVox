#!/usr/bin/env python3
"""Derive every image the site ships from the CartoVox sources.

Sources live outside this repository (the private app repo's brand assets,
saved worlds in a local library, and studio screenshots). Run it as

    python3 tools/build-images.py --brand <app-repo>/assets/app-icon \
        --worlds <library>/worlds --shots <dir-of-studio-pngs>

Every flag is optional; a pass without a flag simply skips that group, so the
screenshot pass can be re-run alone once new shots exist. Output goes to img/.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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
    im = im.convert("RGB") if not name.endswith(".png") else im
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


def brand(brand_dir: Path) -> None:
    print("brand")
    lockup = Image.open(brand_dir / "CartoVox-wordmark-dark.jpg").convert("RGBA")
    # Key the black plate out by flooding inward from the border; the plate
    # inside the compass ring is enclosed and survives, as the mark intends.
    keyed = lockup.copy()
    ImageDraw.floodfill(keyed, (0, 0), (0, 0, 0, 0), thresh=42)
    ImageDraw.floodfill(keyed, (keyed.width - 1, keyed.height - 1), (0, 0, 0, 0), thresh=42)
    ImageDraw.floodfill(keyed, (0, keyed.height - 1), (0, 0, 0, 0), thresh=42)
    ImageDraw.floodfill(keyed, (keyed.width - 1, 0), (0, 0, 0, 0), thresh=42)
    # Soften the keyed edge so the gold glow feathers instead of stepping.
    alpha = keyed.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    keyed.putalpha(alpha)
    lockup_crop = keyed.crop((100, 60, 1308, 1340))
    save(lockup_crop, "lockup.png", width=900)
    # The lettering alone, for the navigation bar and the footer.
    text = keyed.crop((120, 1000, 1290, 1330))
    save(text, "wordmark.png", width=720)
    # The gold monogram cut from the lockup, kept for reference; the icons
    # the site actually shows come from icons() and the v2 set.
    mark = Image.open(brand_dir / "CartoVox-1024.png").convert("RGBA")
    save(mark, "monogram-512.png", width=512)


def _keyed(path: Path, thresh: int = 40) -> Image.Image:
    """The icon masters sit on an opaque plate; flood the corners transparent."""
    im = Image.open(path).convert("RGBA")
    for point in ((0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)):
        ImageDraw.floodfill(im, point, (0, 0, 0, 0), thresh=thresh)
    return im


def icons(brand_dir: Path) -> None:
    """The v2 icon set: illustrated for large sizes, flat for tiny ones, the
    navbar mark for the header. Each was drawn for that job."""
    print("icons")
    illustrated = _keyed(brand_dir / "icon-illustrated-dark.png")
    for size in (180, 192, 512):
        save(illustrated, f"icon-{size}.png", width=size)
    save(illustrated, "mark-512.png", width=512)
    simple = _keyed(brand_dir / "icon-simple-dark.png")
    for size in (16, 32, 48, 64):
        save(simple, f"icon-{size}.png", width=size)
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico = simple.copy()
    ico.thumbnail((48, 48), Image.LANCZOS)
    for target in (IMG / "favicon.ico", ROOT / "favicon.ico"):
        ico.save(target, format="ICO", sizes=ico_sizes)
    print("  favicon.ico", ico_sizes)
    # The header mark: trimmed to its own bounds, three pixels per CSS pixel.
    nav = Image.open(brand_dir / "nav-mark.png").convert("RGBA")
    nav = nav.crop(nav.getchannel("A").getbbox())
    save(nav, "nav-mark.png", width=round(nav.width * 120 / nav.height))


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


def social() -> None:
    """The 1200x630 card that Discord, X and iMessage unfurl."""
    print("social")
    card = Image.new("RGB", (1200, 630), (11, 12, 16))
    hero = IMG / "hero-world.webp"
    if hero.exists():
        world = Image.open(hero).convert("RGB")
        ratio = 1200 / world.width
        world = world.resize((1200, round(world.height * ratio)), Image.LANCZOS)
        top = max(0, (world.height - 630) // 2)
        world = world.crop((0, top, 1200, top + 630))
        # A near-solid dark field on the left for the icon and the name, fading
        # into the plate on the right; the map is the backdrop, not the subject.
        shade = Image.new("L", (1200, 630), 0)
        draw = ImageDraw.Draw(shade)
        for x in range(1200):
            fade = min(1.0, max(0.0, (x - 430) / 560))
            value = int(248 * (1 - fade) ** 1.1)
            draw.line([(x, 0), (x, 630)], fill=value)
        dark = Image.new("RGB", (1200, 630), (11, 12, 16))
        card = Image.composite(dark, world, shade)
    # The illustrated icon above the gold wordmark: the name has to be on a
    # card that unfurls in a chat, and the icon is what the app looks like.
    icon, word = IMG / "mark-512.png", IMG / "wordmark.png"
    if icon.exists() and word.exists():
        mark = Image.open(icon).convert("RGBA")
        mark.thumbnail((330, 330), Image.LANCZOS)
        name = Image.open(word).convert("RGBA")
        name.thumbnail((420, 130), Image.LANCZOS)
        x = 90
        top = (630 - (mark.height + 24 + name.height)) // 2
        card.paste(mark, (x + (name.width - mark.width) // 2, top), mark)
        card.paste(name, (x, top + mark.height + 24), name)
    elif (IMG / "lockup.png").exists():
        mark = Image.open(IMG / "lockup.png").convert("RGBA")
        mark.thumbnail((470, 470), Image.LANCZOS)
        card.paste(mark, (70, (630 - mark.height) // 2), mark)
    card.save(IMG / "social-card.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    print("  social-card.jpg (1200, 630)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", type=Path, help="app-icon dir with the gold lockups")
    parser.add_argument("--icons", type=Path, help="this repo's brand/ dir with the v2 icon masters")
    parser.add_argument("--worlds", type=Path)
    parser.add_argument("--shots", type=Path)
    parser.add_argument("--chain", type=Path, help="library root; only the chain views")
    parser.add_argument("--social", action="store_true")
    args = parser.parse_args()
    if args.brand:
        brand(args.brand)
    if args.icons:
        icons(args.icons)
    if args.worlds:
        worlds(args.worlds)
        chain(args.worlds)
    elif args.chain:
        chain(args.chain)
    if args.shots:
        shots(args.shots)
    if args.social or args.brand or args.icons or args.worlds:
        social()


if __name__ == "__main__":
    main()
