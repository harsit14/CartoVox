"""Screenshots for the cartovox.org handbook, from a sandboxed 0.9 studio.

Runs against the sandbox on 8098 (a /tmp copy of the library), never a real
server. Writes 2x PNGs to /tmp/cartovox-site/shots/ under `guide-` names, so
build-images.py keeps them apart from the older `app-` family.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8098/"
OUT = Path("/tmp/cartovox-site/shots")
OUT.mkdir(parents=True, exist_ok=True)
WORLD = "Ulnrond"
BRIEF = ("Three continents share one temperate world, divided by a wide ocean "
         "that only the western peoples have learned to cross. The east is an "
         "old, dense heartland of river kingdoms; the west is a sparse frontier "
         "under towering young mountains. The map must show the one strait that "
         "joins them.")


def log(msg):
    print(msg, flush=True)


def settle(page, ms=900):
    try:
        page.wait_for_load_state("networkidle", timeout=3000)
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
    path = OUT / f"guide-{name}.png"
    page.screenshot(path=str(path), animations="disabled", caret="hide", clip=clip)
    log(f"  saved {path.name}")


def dismiss_tour(page):
    page.wait_for_timeout(1200)
    for selector in ("#tour-skip", "#tour-close", ".tour-dismiss"):
        try:
            node = page.locator(selector)
            if node.count() and node.first.is_visible():
                node.first.click()
                page.wait_for_timeout(500)
        except Exception:
            pass
    page.evaluate("""() => {
      document.getElementById('first-run-tour')?.classList.add('hidden');
      for (const el of document.querySelectorAll('.tour-backdrop, .tour-card')) el.remove();
      document.getElementById('capability-tour')?.classList.add('hidden');
    }""")


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
    page.wait_for_timeout(2500)


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
        page.wait_for_selector("#archive-grid article.world-card", state="attached",
                               timeout=30000)
        page.wait_for_function(
            "() => getComputedStyle(document.documentElement)"
            ".getPropertyValue('--line').trim() !== ''", timeout=15000)
        dismiss_tour(page)

        def desk():
            open_workspace(page, "home", "archive")
            page.locator("#archive-grid .card-media img").first.wait_for(state="visible")
            page.wait_for_function("""() => [...document.querySelectorAll(
              '#archive-grid .card-media img')].every(i => i.complete && i.naturalWidth)""")
            shot(page, "desk")
        step("desk", desk)

        def create():
            open_workspace(page, "create", "explorer")
            page.wait_for_timeout(800)
            try:
                page.get_by_role("button", name="Skip — I know what I want").click(timeout=4000)
            except Exception as error:
                log(f"  skip-start not taken: {error}")
            page.wait_for_timeout(600)
            thesis = page.locator("#brief-thesis")
            thesis.scroll_into_view_if_needed()
            thesis.fill(BRIEF)
            thesis.dispatch_event("input")
            page.wait_for_timeout(1200)
            page.evaluate("window.scrollTo(0,0)")
            shot(page, "create")
        step("create", create)

        def world_map():
            open_world(page, WORLD)
            page.wait_for_timeout(2500)
            shot(page, "world-map")
        step("world-map", world_map)

        def tools_menu():
            page.evaluate("""() => {
              const menu = document.getElementById('map-tools-menu');
              if (menu) menu.open = true;
            }""")
            page.wait_for_timeout(700)
            shot(page, "tools-menu")
            page.evaluate("document.getElementById('map-tools-menu').open = false")
        step("tools-menu", tools_menu)

        def view_menu():
            page.evaluate("""() => {
              const menu = document.getElementById('map-view-menu');
              if (menu) menu.open = true;
            }""")
            page.wait_for_timeout(700)
            shot(page, "view-menu")
            page.evaluate("document.getElementById('map-view-menu').open = false")
        step("view-menu", view_menu)

        def export_menu():
            page.evaluate("document.getElementById('btn-export-dropdown').click()")
            page.wait_for_timeout(700)
            shot(page, "export-menu")
            page.evaluate("document.getElementById('btn-export-dropdown').click()")
        step("export-menu", export_menu)

        def inspector():
            box = page.locator("#map-viewport").bounding_box()
            if box:
                page.mouse.click(box["x"] + box["width"] * 0.34,
                                 box["y"] + box["height"] * 0.42)
                page.wait_for_timeout(2200)
                shot(page, "cell-inspector")
                for close in ("#btn-close-inspector", "#cell-inspector .icon-btn"):
                    node = page.locator(close)
                    if node.count() and node.first.is_visible():
                        node.first.click()
                        break
        step("inspector", inspector)

        def sculpt():
            page.evaluate("document.getElementById('btn-open-sculptor').click()")
            page.wait_for_timeout(1500)
            shot(page, "sculpt")
            page.evaluate("document.getElementById('btn-close-sculptor')?.click()")
            page.wait_for_timeout(600)
        step("sculpt", sculpt)

        def atlas():
            open_workspace(page, "world", "atlas")
            page.wait_for_timeout(3000)
            shot(page, "atlas")
        step("atlas", atlas)

        def travel():
            open_workspace(page, "world", "travel")
            page.wait_for_timeout(2500)
            shot(page, "travel")
        step("travel", travel)

        def codex():
            open_workspace(page, "write", "dossier")
            page.wait_for_timeout(2500)
            shot(page, "codex")
            try:
                page.get_by_role("link", name="Describe everything").click(timeout=3000)
            except Exception:
                page.evaluate("""() => {
                  const link = [...document.querySelectorAll('.codex-nav-link')]
                    .find(a => a.textContent.trim() === 'Describe everything');
                  link && link.click();
                }""")
            page.wait_for_timeout(2500)
            page.evaluate("window.scrollTo(0,0)")
            shot(page, "describe-everything")
        step("codex", codex)

        def manuscript():
            open_workspace(page, "write", "manuscript")
            page.wait_for_timeout(3000)
            shot(page, "manuscript")
        step("manuscript", manuscript)

        def settings():
            page.evaluate("document.getElementById('app-settings-launcher').click()")
            page.wait_for_timeout(1200)
            shot(page, "settings")
            page.evaluate("document.querySelector('[data-app-settings-close]')?.click()")
        step("settings", settings)

        browser.close()
    log("done")


if __name__ == "__main__":
    sys.exit(main())
