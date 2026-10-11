"""Derive website branding from the supplied VectorCraft version 03 exports."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from shutil import copyfile
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "img"
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def cropped_svg(path: Path, bounds: tuple[int, int, int, int]) -> ET.Element:
    svg = ET.parse(path).getroot()
    x, y, right, bottom = bounds
    svg.set("viewBox", f"{x} {y} {right - x} {bottom - y}")
    svg.set("width", str(right - x))
    svg.set("height", str(bottom - y))
    return svg


def write_svg(svg: ET.Element, name: str) -> None:
    ET.ElementTree(svg).write(IMG / name, encoding="unicode")
    print(f"  {name}")


def build_brand(brand_dir: Path) -> None:
    # Accept the former --icons brand invocation as well as --brand brand/v3.
    if (brand_dir / "v3").is_dir():
        brand_dir = brand_dir / "v3"
    print("brand (VectorCraft v3)")
    IMG.mkdir(exist_ok=True)
    compact = cropped_svg(brand_dir / "CartoVox-Compact-Symbol-Reverse.svg",
                          (45, 47, 269, 271))
    write_svg(compact, "nav-mark-v3.svg")

    # Keep the original outlined lettering, including the custom V; remove
    # only the emblem group and trim the surrounding transparent canvas.
    word = cropped_svg(brand_dir / "CartoVox-Atlas-Compass-Reverse.svg",
                       (392, 109, 1044, 235))
    artwork = word.find(f"{{{SVG}}}g")
    artwork.remove(artwork[0])
    word.find(f"{{{SVG}}}title").text = "CartoVox"
    word.find(f"{{{SVG}}}desc").text = "Outlined CartoVox wordmark with a directional V."
    write_svg(word, "wordmark-v3.svg")

    # The existing footer has a narrow brand column. Stack the supplied
    # emblem and lettering so its detailed map remains 160 CSS pixels wide.
    emblem = cropped_svg(brand_dir / "CartoVox-Emblem-Reverse.svg",
                         (35, 17, 342, 373))
    lockup = ET.Element(f"{{{SVG}}}svg", {
        "width": "200", "height": "258", "viewBox": "0 0 200 258", "role": "img",
    })
    ET.SubElement(lockup, f"{{{SVG}}}title").text = "CartoVox — Atlas Compass"
    for source, x, y, width, height in ((emblem, 20, 0, 160, 186),
                                       (word, 10, 210, 180, 35)):
        part = deepcopy(source)
        part.attrib.update(x=str(x), y=str(y), width=str(width), height=str(height))
        lockup.append(part)
    write_svg(lockup, "lockup-v3.svg")

    icon = Image.open(brand_dir / "CartoVox-App-Icon-1024.png").convert("RGBA")
    for size in (16, 32, 48, 64, 180, 192, 512):
        supplied = brand_dir / f"CartoVox-App-Icon-{size}.png"
        target = IMG / f"icon-{size}.png"
        if supplied.exists():
            copyfile(supplied, target)
        else:
            icon.resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)
        print(f"  icon-{size}.png")
    for target in (ROOT / "favicon.ico", IMG / "favicon.ico"):
        copyfile(brand_dir / "CartoVox-Favicon.ico", target)

    # Large marks for the social card retain all of the supplied details.
    mark = Image.open(brand_dir / "CartoVox-Emblem-Reverse.png").convert("RGBA")
    mark.crop((35, 17, 342, 373)).save(IMG / "mark-v3.png", optimize=True)
    name = Image.open(brand_dir / "CartoVox-Atlas-Compass-Reverse.png").convert("RGBA")
    name.crop((392, 109, 1044, 235)).save(IMG / "wordmark-v3.png", optimize=True)


def social_card() -> None:
    """Keep the real world backdrop and compose the new detailed branding."""
    print("social")
    card = Image.new("RGB", (1200, 630), (11, 12, 16))
    hero = IMG / "hero-world.webp"
    if hero.exists():
        world = Image.open(hero).convert("RGB")
        ratio = 1200 / world.width
        world = world.resize((1200, round(world.height * ratio)), Image.Resampling.LANCZOS)
        top = max(0, (world.height - 630) // 2)
        world = world.crop((0, top, 1200, top + 630))
        shade = Image.new("L", (1200, 630), 0)
        draw = ImageDraw.Draw(shade)
        for x in range(1200):
            fade = min(1.0, max(0.0, (x - 430) / 560))
            draw.line([(x, 0), (x, 630)], fill=int(248 * (1 - fade) ** 1.1))
        card = Image.composite(Image.new("RGB", (1200, 630), (11, 12, 16)), world, shade)
    mark = Image.open(IMG / "mark-v3.png").convert("RGBA")
    mark.thumbnail((300, 348), Image.Resampling.LANCZOS)
    name = Image.open(IMG / "wordmark-v3.png").convert("RGBA")
    name.thumbnail((420, 100), Image.Resampling.LANCZOS)
    x = 90
    top = (630 - (mark.height + 24 + name.height)) // 2
    card.paste(mark, (x + (name.width - mark.width) // 2, top), mark)
    card.paste(name, (x, top + mark.height + 24), name)
    card.save(IMG / "social-card.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    print("  social-card.jpg (1200, 630)")
