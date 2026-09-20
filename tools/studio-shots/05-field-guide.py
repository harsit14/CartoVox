"""Every `app-*` screenshot the landing page and the field guide use, from 0.9.

The 0.9 interface moved most of these controls: the World workspace is
map-first with a World/Maps pill and a command dock, Create is one strip above
a folding brief, and Write is one strip above the page. The older passes
(01-03) were written against 0.8.3 and reach for a toolbar that no longer
exists, so this pass takes the whole set in one run instead.

Sandbox server on 8098 only, never a real library. Writes 2x PNGs to
/tmp/cartovox-site/shots/; build-images.py prefixes them `app-` (and leaves
`guide-` names alone).

    CARTOVOX_DATA_DIR=/tmp/cartovox-site-sandbox python3 studio.py --port 8098
    python3 05-field-guide.py
    python3 ../build-images.py --shots /tmp/cartovox-site/shots
"""
import sys
from importlib import import_module
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright

# The richer-states pass owns the shared helpers and the original prose. No
# screenshot may show the author's own manuscript, so the Write shots write
# their own book.
_rich = import_module("02-richer-states")
URL, OUT = _rich.URL, _rich.OUT
CHAPTER_TITLE, PROSE = _rich.CHAPTER_TITLE, _rich.PROSE
log, shot, settle = _rich.log, _rich.shot, _rich.settle
open_workspace, answer_text_modal = _rich.open_workspace, _rich.answer_text_modal

# Name steps on the command line to retake a few shots without the whole run.
ONLY = {name for name in sys.argv[1:] if not name.startswith("-")}


def step(name, run):
    if ONLY and name not in ONLY:
        return
    try:
        run()
    except Exception as error:
        log(f"  FAILED {name}: {error}")

# The hero world, which build-images.py also derives the causal chain from.
WORLD = "Ixrixenrond"
BOOK = "The Debt of the Silverpeaks"
THESIS = ("Three continents share one temperate world, divided by a wide ocean "
          "that only the western peoples have learned to cross. The east is an "
          "old, dense heartland of river kingdoms; the west is a sparse frontier "
          "under towering young mountains. The map must show the one strait that "
          "joins them.")


def dismiss_tour(page):
    """The first-run tour opens once per version, over everything."""
    page.wait_for_timeout(1000)
    for selector in ("#tour-skip", "#tour-close"):
        node = page.locator(selector)
        try:
            if node.count() and node.first.is_visible():
                node.first.click()
                page.wait_for_timeout(400)
        except Exception:
            pass
    page.evaluate("""() => {
      document.getElementById('first-run-tour')?.classList.add('hidden');
      for (const el of document.querySelectorAll('.tour-backdrop, .tour-card')) el.remove();
      document.getElementById('capability-tour')?.classList.add('hidden');
    }""")


def open_world(page, name):
    """Open the first world with this name.

    The sandbox library can hold two worlds of one name -- a world keeps the
    name its seed produced, and the same seed was built twice -- so an exact
    role match is ambiguous and Playwright refuses it.
    """
    open_workspace(page, "home", "archive")
    card = page.get_by_role("button", name=f"Open {name}", exact=True).first
    card.wait_for(state="visible")
    card.click()
    page.locator("#tab-studio.active").wait_for(state="visible")
    page.wait_for_timeout(2500)


def click_text(page, text, timeout=4000):
    page.get_by_role("button", name=text, exact=True).first.click(timeout=timeout)


def set_maps_drawer(page, want_open):
    """Open or close the Maps drawer, and check that it obeyed.

    The pill segment is a task switch, not a switch on this panel: pressing
    Maps when Maps is already the task only closes the drawer if the shell
    agrees it is open, which it does not when the drawer was restored from a
    saved layout. The panel's own collapse toggle always answers.
    """
    for _ in range(4):
        collapsed = page.evaluate(
            """() => document.getElementById('generated-map-library')
                 ?.classList.contains('is-panel-collapsed')""")
        if collapsed is None:
            return
        if bool(collapsed) != bool(want_open):
            return
        page.evaluate("document.getElementById('btn-toggle-map-library')?.click()")
        page.wait_for_timeout(1000)
    log("  the Maps drawer would not change state")


def open_dock_menu(page, menu_id):
    """View and Tools are <details> in the map dock."""
    page.evaluate(f"""() => {{
      for (const id of ['map-view-menu', 'map-tools-menu']) {{
        const node = document.getElementById(id);
        if (node) node.open = (id === '{menu_id}');
      }}
    }}""")
    page.wait_for_timeout(700)


def close_dock_menus(page):
    page.evaluate("""() => {
      for (const id of ['map-view-menu', 'map-tools-menu']) {
        const node = document.getElementById(id);
        if (node) node.open = false;
      }
    }""")


def codex_section(page, label):
    page.evaluate(f"""() => {{
      const link = [...document.querySelectorAll('.codex-nav-link')]
        .find(a => a.textContent.trim() === {label!r});
      link && link.click();
    }}""")
    page.wait_for_timeout(2200)
    page.evaluate("window.scrollTo(0, 0)")


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

        # ---------------------------------------------------------- library --
        def library():
            open_workspace(page, "home", "archive")
            page.locator("#archive-grid .card-media img").first.wait_for(state="visible")
            page.wait_for_function("""() => [...document.querySelectorAll(
              '#archive-grid .card-media img')].every(i => i.complete && i.naturalWidth)""")
            shot(page, "home-library")
        step("library", library)

        def gallery():
            open_workspace(page, "home", "archive")
            click_text(page, "Map gallery")
            page.wait_for_timeout(3500)
            shot(page, "library-gallery")
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
        step("gallery", gallery)

        # ----------------------------------------------------------- create --
        def create_brief():
            open_workspace(page, "create", "explorer")
            page.wait_for_timeout(800)
            try:
                click_text(page, "Skip — I know what I want")
            except Exception as error:
                log(f"  start doors already dismissed: {error}")
            page.wait_for_timeout(600)
            thesis = page.locator("#brief-thesis")
            thesis.scroll_into_view_if_needed()
            thesis.fill(THESIS)
            thesis.dispatch_event("input")
            page.wait_for_timeout(1500)
            page.evaluate("window.scrollTo(0,0)")
            shot(page, "create-brief")
        step("create-brief", create_brief)

        def create_advanced():
            open_workspace(page, "create", "explorer")
            click_text(page, "Advanced settings")
            page.wait_for_timeout(2000)
            shot(page, "create-advanced")
        step("create-advanced", create_advanced)

        def deep_time():
            open_workspace(page, "create", "history")
            page.wait_for_timeout(2500)
            shot(page, "create-deep-time")
        step("deep-time", deep_time)

        def draw():
            open_workspace(page, "create", "explorer")
            page.evaluate("document.querySelector('[data-open-draw]')?.click()")
            canvas = page.locator("#world-canvas-canvas")
            canvas.wait_for(state="visible")
            page.wait_for_timeout(1200)
            box = canvas.bounding_box()
            import math
            cx, cy = box["x"] + box["width"] * 0.42, box["y"] + box["height"] * 0.5
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
                page.mouse.move(cx + 380 + 60 * math.cos(i / 4),
                                cy + 40 + 80 * math.sin(i / 4), steps=2)
            page.mouse.up()
            page.wait_for_timeout(900)
            shot(page, "draw-canvas")
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)
        step("draw", draw)

        # ------------------------------------------------------------ world --
        open_world(page, WORLD)

        def world_map():
            open_workspace(page, "world", "studio")
            page.wait_for_timeout(2500)
            close_dock_menus(page)
            shot(page, "world-map")
        step("world-map", world_map)

        def planet_card():
            card = page.locator("#world-planet")
            if card.count() and card.is_visible():
                page.wait_for_timeout(2000)
                box = card.bounding_box()
                if box:
                    settle(page, 300)
                    page.screenshot(path=str(OUT / "world-planet.png"), clip=box)
                    log("  saved world-planet.png")
        step("planet-card", planet_card)

        def map_library():
            set_maps_drawer(page, True)
            page.wait_for_timeout(1500)
            shot(page, "map-library")
            set_maps_drawer(page, False)
        step("map-library", map_library)

        def view_menu():
            set_maps_drawer(page, False)
            open_dock_menu(page, "map-view-menu")
            shot(page, "map-view-menu")
            close_dock_menus(page)
        step("view-menu", view_menu)

        def tools_menu():
            set_maps_drawer(page, False)
            open_dock_menu(page, "map-tools-menu")
            shot(page, "map-tools-menu")
            close_dock_menus(page)
        step("tools-menu", tools_menu)

        def cell_inspector():
            viewport = page.locator("#map-viewport")
            box = viewport.bounding_box()
            for fraction in ((0.34, 0.42), (0.5, 0.5), (0.28, 0.55), (0.62, 0.38)):
                page.mouse.click(box["x"] + box["width"] * fraction[0],
                                 box["y"] + box["height"] * fraction[1])
                page.wait_for_timeout(2200)
                panel = page.locator("#cell-inspector")
                if panel.count() and panel.is_visible():
                    shot(page, "map-cell-inspector")
                    return
            log("  no cell inspector opened")
        step("cell-inspector", cell_inspector)

        def sculpt():
            page.evaluate("document.getElementById('btn-open-sculptor')?.click()")
            page.wait_for_timeout(2000)
            shot(page, "map-sculpt")
            page.evaluate("document.getElementById('btn-close-sculptor')?.click()")
            page.wait_for_timeout(800)
        step("sculpt", sculpt)

        def render_studio():
            page.evaluate("document.getElementById('btn-open-render')?.click()")
            page.wait_for_timeout(3000)
            shot(page, "render-studio")
            page.evaluate("document.getElementById('btn-close-render-studio')?.click()")
            page.wait_for_timeout(800)
        step("render-studio", render_studio)

        def terrain_3d():
            page.evaluate("document.getElementById('btn-open-voxels')?.click()")
            page.wait_for_timeout(5000)
            shot(page, "terrain-3d")
            page.keyboard.press("Escape")
            page.wait_for_timeout(800)
        step("terrain-3d", terrain_3d)

        def atlas():
            open_workspace(page, "world", "atlas")
            page.wait_for_timeout(3500)
            shot(page, "world-atlas")
        step("atlas", atlas)

        def travel():
            open_workspace(page, "world", "travel")
            page.wait_for_timeout(2000)
            try:
                click_text(page, "Calculate journey")
                page.wait_for_timeout(7000)
            except Exception as error:
                log(f"  journey not calculated: {error}")
            shot(page, "world-travel")
        step("travel", travel)

        def campaign():
            open_workspace(page, "world", "campaign")
            page.wait_for_timeout(1500)
            try:
                page.get_by_role("button", name="New campaign").first.click(timeout=3000)
                answer_text_modal(page, "The Table at Zhargundbar")
                page.wait_for_timeout(2500)
            except Exception as error:
                log(f"  campaign profile kept as it was: {error}")
            shot(page, "world-campaign")
        step("campaign", campaign)

        # ------------------------------------------------------------ write --
        def codex():
            open_workspace(page, "write", "dossier")
            page.wait_for_timeout(2500)
            shot(page, "write-dossier")
            for label, name in (("Naming studio", "codex-naming"),
                                ("Lands", "codex-lands"),
                                ("Gazetteer", "codex-gazetteer")):
                codex_section(page, label)
                shot(page, name)
        step("codex", codex)

        def chronicle():
            open_workspace(page, "write", "chronicle")
            page.wait_for_timeout(1500)
            try:
                click_text(page, "Initialize from Lore timeline", timeout=3000)
                page.wait_for_timeout(5000)
            except Exception as error:
                log(f"  chronicle already initialised: {error}")
            shot(page, "write-chronicle")
        step("chronicle", chronicle)

        def manuscript():
            """A book of this pass's own prose. Never the author's."""
            open_workspace(page, "write", "manuscript")
            page.wait_for_timeout(2000)
            options = page.evaluate(
                """() => [...document.querySelectorAll('#tab-manuscript select option')]
                     .map(o => o.textContent)""")
            if not any(BOOK in option for option in options):
                page.locator("#manuscript-new-book").click()
                answer_text_modal(page, BOOK)
                page.wait_for_timeout(2000)
            else:
                page.evaluate(f"""() => {{
                  const select = document.querySelector('#tab-manuscript select');
                  const option = [...select.options].find(o => o.textContent.includes({BOOK!r}));
                  if (option) {{
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', {{bubbles: true}}));
                  }}
                }}""")
                page.wait_for_timeout(2000)
            editor = page.locator("#tab-manuscript .ProseMirror").first
            if not editor.is_visible():
                page.locator("#manuscript-new-chapter").click()
                answer_text_modal(page, CHAPTER_TITLE)
                page.wait_for_timeout(1500)
            editor.wait_for(state="visible", timeout=10000)
            if len(editor.inner_text().strip()) < 40:
                editor.click()
                page.keyboard.press("Control+End")
                page.keyboard.type(CHAPTER_TITLE, delay=5)
                page.keyboard.press("Enter")
                for paragraph in PROSE:
                    page.keyboard.type(paragraph, delay=2)
                    page.keyboard.press("Enter")
                page.wait_for_timeout(2500)
            page.evaluate("""() => {
              let node = document.querySelector('#tab-manuscript .ProseMirror');
              while (node) { if (node.scrollTop) node.scrollTop = 0; node = node.parentElement; }
              window.scrollTo(0, 0);
              document.activeElement && document.activeElement.blur();
            }""")
            page.wait_for_timeout(800)
            shot(page, "write-manuscript")
            # The handbook page shows the same surface, under its own name.
            shot(page, "guide-manuscript")
        step("manuscript", manuscript)

        def book_views():
            for label, name in (("Outline", "write-outline"),
                                ("Insights", "write-insights")):
                try:
                    page.evaluate(f"""() => {{
                      const control = [...document.querySelectorAll(
                        '#tab-manuscript button, #tab-manuscript a')]
                        .find(node => node.textContent.trim() === {label!r});
                      control && control.click();
                    }}""")
                    page.wait_for_timeout(3000)
                    shot(page, name)
                except Exception as error:
                    log(f"  {label} failed: {error}")
        step("book-views", book_views)

        def style_panel():
            # Outline and Insights replace the page; the Style panel sits
            # beside it, so the editor has to come back first. Leaving the
            # workspace and returning is the one way back that does not
            # depend on which view is in front.
            open_workspace(page, "write", "dossier")
            page.wait_for_timeout(1200)
            open_workspace(page, "write", "manuscript")
            page.wait_for_timeout(2500)
            page.locator("#tab-manuscript .ProseMirror").first.wait_for(
                state="visible", timeout=8000)
            page.evaluate("""() => {
              const control = [...document.querySelectorAll('#tab-manuscript button')]
                .find(node => node.textContent.trim() === 'Style');
              control && control.click();
            }""")
            page.wait_for_timeout(2000)
            shot(page, "write-style")
        step("style-panel", style_panel)

        # --------------------------------------------------------- settings --
        def settings():
            # Over the map, because the point of the shot is that it floats
            # over the desk and hands it back untouched.
            open_workspace(page, "world", "studio")
            page.wait_for_timeout(2500)
            page.evaluate("document.getElementById('app-settings-launcher')?.click()")
            page.wait_for_timeout(1800)
            shot(page, "settings")
            page.evaluate("document.querySelector('[data-app-settings-close]')?.click()")
            page.wait_for_timeout(600)
        step("settings", settings)

        browser.close()
    log("done")


if __name__ == "__main__":
    main()
