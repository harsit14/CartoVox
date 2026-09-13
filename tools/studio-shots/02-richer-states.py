"""Second screenshot pass: richer states and map-only crops for the site.

Sandbox server on 8098 only. Overwrites the plain shots where a richer state
was reached; writes map-only crops as chain-<view>.png.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8098/"
OUT = Path("/tmp/cartovox-site/shots")
OUT.mkdir(parents=True, exist_ok=True)

CHAPTER_TITLE = "The Strait"
PROSE = [
    "The river reached Zhargundbar a full day before the news did. It came down brown "
    "from the Vanond Silverpeaks, carrying the first of the spring melt and, somewhere "
    "in it, the last of the winter's dead, and the fishers of the lower quays read it "
    "the way their grandmothers had: a wet year, a late harvest, a road to Wicofjordr "
    "that would not bear a cart before midsummer.",
    "Halla Ordrim did not read rivers. She read ledgers, and the ledger said that the "
    "Loredolen Road had carried forty-one caravans east in the year of her appointment "
    "and nine in the year since. Something in the passes had changed. The chronicle "
    "would call it a war eventually, because chronicles like a single word, but standing "
    "on the quay with the melt at her boots she thought it looked more like a debt "
    "coming due.",
]
CHAIN_VIEWS = [
    "relief", "tectonics", "temperature_annual", "precipitation_annual",
    "ocean_currents", "drainage", "glacial_legacy", "soils", "biomes",
    "resources", "civilisation", "realms", "landmarks_routes",
]


def log(msg):
    print(msg, flush=True)


def settle(page, ms=900):
    try:
        page.wait_for_load_state("networkidle", timeout=2500)
    except Exception:
        pass
    page.evaluate("document.fonts && document.fonts.ready")
    page.wait_for_timeout(ms)
    page.evaluate("""() => {
      document.getElementById('capability-tour')?.classList.add('hidden');
      // Hide the 'saved with an older settings schema' card: a library note,
      // not something a first look at the product should lead with.
      for (const node of document.querySelectorAll('#world-context-panel *')) {
        if (node.children.length === 0 && /Project warning/i.test(node.textContent || '')) {
          const card = node.closest('article, section, li, div');
          if (card) card.style.display = 'none';
        }
      }
      document.activeElement && document.activeElement.blur();
    }""")


def shot(page, name, clip=None):
    settle(page)
    page.screenshot(path=str(OUT / f"{name}.png"), animations="disabled", caret="hide", clip=clip)
    log(f"  saved {name}.png")


def open_workspace(page, name, tab):
    page.locator(f'.workspace-btn[data-workspace="{name}"]').click()
    target = page.locator(f"#tab-{tab}")
    if "active" not in (target.get_attribute("class") or "").split():
        page.locator(f'.tab-btn[data-tab="{tab}"]').click()
    page.locator(f"#tab-{tab}.active").wait_for(state="visible")


def open_world(page, name):
    open_workspace(page, "home", "archive")
    card = page.get_by_role("button", name=f"Open {name}", exact=True)
    card.wait_for(state="visible")
    card.click()
    page.locator("#tab-studio.active").wait_for(state="visible")
    page.locator("#active-world-title").filter(has_text=name).wait_for(state="visible")
    page.wait_for_timeout(1500)


def step(name, fn):
    try:
        fn()
    except Exception as error:
        log(f"  FAILED {name}: {error}")


def answer_text_modal(page, value):
    modal = page.locator("#text-input-modal")
    try:
        modal.wait_for(state="visible", timeout=3000)
    except Exception:
        return False
    page.fill("#text-input-value", value)
    page.click("#text-input-submit")
    page.wait_for_timeout(600)
    return True


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1440, "height": 900}, device_scale_factor=2,
            color_scheme="dark")
        page = context.new_page()
        page.goto(URL, wait_until="load")
        page.wait_for_selector("#archive-grid article.world-card", state="attached", timeout=30000)
        page.wait_for_function(
            "() => getComputedStyle(document.documentElement).getPropertyValue('--line').trim() !== ''",
            timeout=15000)

        def draw():
            open_workspace(page, "create", "explorer")
            page.evaluate("document.querySelector('[data-open-draw]').click()")
            canvas = page.locator("#world-canvas-canvas")
            canvas.wait_for(state="visible")
            page.wait_for_timeout(1000)
            box = canvas.bounding_box()
            # Paint a continent with a few overlapping strokes.
            cx, cy = box["x"] + box["width"] * 0.42, box["y"] + box["height"] * 0.5
            import math
            for radius, turns in ((120, 1.0), (170, 1.0), (90, 0.6)):
                page.mouse.move(cx + radius, cy)
                page.mouse.down()
                steps = 40
                for i in range(1, steps + 1):
                    angle = turns * 2 * math.pi * i / steps
                    wobble = 1 + 0.25 * math.sin(3 * angle)
                    page.mouse.move(cx + radius * wobble * math.cos(angle),
                                    cy + radius * 0.7 * wobble * math.sin(angle), steps=2)
                page.mouse.up()
                page.wait_for_timeout(200)
            page.mouse.move(cx + 380, cy + 40)
            page.mouse.down()
            for i in range(30):
                page.mouse.move(cx + 380 + 60 * math.cos(i / 4), cy + 40 + 80 * math.sin(i / 4), steps=2)
            page.mouse.up()
            page.wait_for_timeout(800)
            shot(page, "draw-canvas")
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
        step("draw", draw)

        def world_and_chain():
            open_world(page, "Ixrixenrond")
            open_workspace(page, "world", "studio")
            page.wait_for_timeout(2500)
            shot(page, "world-map")
            for view in CHAIN_VIEWS:
                try:
                    page.evaluate(f"selectMapView('{view}')")
                    page.wait_for_timeout(2500)
                    img = page.locator("#active-map-img")
                    img.wait_for(state="visible", timeout=5000)
                    page.wait_for_function(
                        "() => { const i = document.getElementById('active-map-img'); return i && i.complete && i.naturalWidth > 0; }",
                        timeout=10000)
                    box = img.bounding_box()
                    nat = page.evaluate(
                        "() => { const i = document.getElementById('active-map-img'); return [i.naturalWidth, i.naturalHeight]; }")
                    # Contain-fitted: compute the drawn sheet inside the box.
                    scale = min(box["width"] / nat[0], box["height"] / nat[1])
                    w, h = nat[0] * scale, nat[1] * scale
                    clip = {"x": box["x"] + (box["width"] - w) / 2,
                            "y": box["y"] + (box["height"] - h) / 2, "width": w, "height": h}
                    settle(page, 300)
                    page.screenshot(path=str(OUT / f"chain-{view}.png"), clip=clip)
                    log(f"  saved chain-{view}.png {int(w)}x{int(h)}")
                except Exception as error:
                    log(f"  chain view {view} failed: {error}")
            page.evaluate("selectMapView('relief')")
            page.wait_for_timeout(1500)
        step("world-and-chain", world_and_chain)

        def travel():
            open_workspace(page, "world", "travel")
            page.wait_for_timeout(1500)
            page.get_by_role("button", name="Calculate journey").click()
            page.wait_for_timeout(6000)
            shot(page, "world-travel")
        step("travel", travel)

        def campaign():
            open_workspace(page, "world", "campaign")
            page.wait_for_timeout(1200)
            page.get_by_role("button", name="New campaign").first.click()
            if not answer_text_modal(page, "The Table at Zhargundbar"):
                log("  no campaign modal; leaving as is")
            page.wait_for_timeout(2500)
            shot(page, "world-campaign")
        step("campaign", campaign)

        def chronicle():
            open_workspace(page, "write", "chronicle")
            page.wait_for_timeout(1200)
            page.get_by_role("button", name="Initialize from Lore timeline").click()
            page.wait_for_timeout(5000)
            shot(page, "write-chronicle")
        step("chronicle", chronicle)

        def manuscript():
            open_workspace(page, "write", "manuscript")
            page.wait_for_timeout(1500)
            page.locator("#manuscript-new-book").click()
            answer_text_modal(page, "The Debt of the Silverpeaks")
            page.wait_for_timeout(1500)
            editor = page.locator("#tab-manuscript .ProseMirror").first
            editor.wait_for(state="visible", timeout=8000)
            editor.click()
            page.keyboard.press("Control+End")
            page.keyboard.type(CHAPTER_TITLE, delay=5)
            page.keyboard.press("Enter")
            for paragraph in PROSE:
                page.keyboard.type(paragraph, delay=2)
                page.keyboard.press("Enter")
            page.wait_for_timeout(2500)
            page.evaluate("document.activeElement && document.activeElement.blur()")
            shot(page, "write-manuscript")
        step("manuscript", manuscript)

        browser.close()
    log("done")


if __name__ == "__main__":
    main()
