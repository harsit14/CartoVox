"""Screenshot the sandboxed CartoVox studio for the website.

Runs against the sandbox server on 8098 (library copied to /tmp), never the
user's own servers. Writes 2x PNGs to /tmp/cartovox-site/shots/.
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8098/"
OUT = Path("/tmp/cartovox-site/shots")
OUT.mkdir(parents=True, exist_ok=True)
BRIEF = ("Three continents share one temperate world, divided by a wide ocean "
         "that only the western peoples have learned to cross. The east is an "
         "old, dense heartland of river kingdoms; the west is a sparse frontier "
         "under towering young mountains. The map must show the one strait that "
         "joins them.")


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
      document.activeElement && document.activeElement.blur();
    }""")


def shot(page, name, clip=None):
    settle(page)
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), animations="disabled", caret="hide", clip=clip)
    log(f"  saved {path.name}")


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

        def library():
            open_workspace(page, "home", "archive")
            page.locator("#archive-grid .card-media img").first.wait_for(state="visible")
            page.wait_for_function("""() => [...document.querySelectorAll(
              '#archive-grid .card-media img')].every(img => img.complete && img.naturalWidth)""")
            shot(page, "home-library")
        step("library", library)

        def create_brief():
            open_workspace(page, "create", "explorer")
            try:
                page.get_by_role("button", name="Generate a new world").click(timeout=4000)
                page.get_by_role("button", name="Writing and world building").click(timeout=4000)
                page.locator("#create-route-title").wait_for(state="visible", timeout=4000)
            except Exception as error:
                log(f"  route choice skipped: {error}")
            thesis = page.locator("#brief-thesis")
            thesis.scroll_into_view_if_needed()
            thesis.fill(BRIEF)
            thesis.dispatch_event("input")
            page.wait_for_timeout(800)
            page.evaluate("document.getElementById('brief-thesis').scrollIntoView({block:'center'})")
            page.wait_for_timeout(300)
            shot(page, "create-brief")
        step("create-brief", create_brief)

        def draw():
            open_workspace(page, "create", "explorer")
            page.evaluate("document.querySelector('[data-open-draw]').click()")
            page.locator("#world-canvas-canvas").wait_for(state="visible")
            page.wait_for_timeout(1200)
            shot(page, "draw-canvas")
            # leave the desk
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
        step("draw", draw)

        def world_views():
            open_world(page, "Ixrixenrond")
            open_workspace(page, "world", "studio")
            page.wait_for_timeout(2500)
            shot(page, "world-map")
            for view in ("biomes", "tectonics", "ocean_currents", "landmarks_routes"):
                try:
                    page.evaluate(f"selectMapView('{view}')")
                    page.wait_for_timeout(2500)
                    shot(page, f"world-map-{view}")
                except Exception as error:
                    log(f"  view {view} failed: {error}")
            try:
                page.evaluate("selectMapView('relief')")
                page.wait_for_timeout(1500)
            except Exception:
                pass
            for tab in ("atlas", "travel", "campaign"):
                open_workspace(page, "world", tab)
                page.wait_for_timeout(2500)
                shot(page, f"world-{tab}")
        step("world-views", world_views)

        def write_views():
            for tab in ("dossier", "chronicle", "manuscript"):
                open_workspace(page, "write", tab)
                page.wait_for_timeout(2500)
                shot(page, f"write-{tab}")
        step("write-views", write_views)

        def manuscript_amashima():
            open_world(page, "Amashima")
            open_workspace(page, "write", "manuscript")
            page.wait_for_timeout(3000)
            shot(page, "write-manuscript-amashima")
            open_workspace(page, "write", "dossier")
            page.wait_for_timeout(2500)
            shot(page, "write-dossier-amashima")
            open_workspace(page, "world", "studio")
            page.wait_for_timeout(2500)
            shot(page, "world-map-amashima")
        step("manuscript-amashima", manuscript_amashima)

        def planet():
            open_workspace(page, "world", "studio")
            card = page.locator("#world-planet")
            if card.count() and card.is_visible():
                page.wait_for_timeout(2500)
                box = card.bounding_box()
                if box:
                    page.screenshot(path=str(OUT / "world-planet.png"), clip=box)
                    log("  saved world-planet.png")
            else:
                log("  planet card not visible")
        step("planet", planet)

        browser.close()
    log("done")


if __name__ == "__main__":
    main()
