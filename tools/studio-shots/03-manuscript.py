"""Manuscript shot: a new book needs a chapter before the editor shows."""
from pathlib import Path
import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from importlib import import_module
shoot2 = import_module("02-richer-states")
from shoot2 import (URL, OUT, CHAPTER_TITLE, PROSE, log, shot, open_workspace, open_world,
                    answer_text_modal)
from playwright.sync_api import sync_playwright


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 900},
                                      device_scale_factor=2, color_scheme="dark")
        page = context.new_page()
        page.goto(URL, wait_until="load")
        page.wait_for_selector("#archive-grid article.world-card", state="attached", timeout=30000)
        page.wait_for_function(
            "() => getComputedStyle(document.documentElement).getPropertyValue('--line').trim() !== ''",
            timeout=15000)
        open_world(page, "Ixrixenrond")
        open_workspace(page, "write", "manuscript")
        page.wait_for_timeout(1500)
        # Select the book made by the earlier pass if it exists, else make one.
        select = page.locator("#tab-manuscript select").first
        options = page.evaluate("""() => [...document.querySelectorAll('#tab-manuscript select option')].map(o => o.textContent)""")
        log(f"  book options: {options}")
        if not any("Silverpeaks" in o for o in options):
            page.locator("#manuscript-new-book").click()
            answer_text_modal(page, "The Debt of the Silverpeaks")
            page.wait_for_timeout(1500)
        else:
            page.evaluate("""() => { const s = [...document.querySelectorAll('#tab-manuscript select')][0];
              const o = [...s.options].find(o => /Silverpeaks/.test(o.textContent)); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); } }""")
            page.wait_for_timeout(1500)
        editor = page.locator("#tab-manuscript .ProseMirror").first
        if not editor.is_visible():
            page.locator("#manuscript-new-chapter").click()
            answer_text_modal(page, CHAPTER_TITLE)
            page.wait_for_timeout(1500)
        editor.wait_for(state="visible", timeout=10000)
        text = editor.inner_text().strip()
        if len(text) < 40:
            editor.click()
            page.keyboard.press("Meta+End")
            for paragraph in PROSE:
                page.keyboard.type(paragraph, delay=1)
                page.keyboard.press("Enter")
            page.wait_for_timeout(2500)
        editor.click()
        page.keyboard.press("Meta+Home")
        page.evaluate("""() => {
          let node = document.querySelector('#tab-manuscript .ProseMirror');
          while (node) { if (node.scrollTop) node.scrollTop = 0; node = node.parentElement; }
          window.scrollTo(0, 0);
          document.activeElement && document.activeElement.blur();
        }""")
        page.wait_for_timeout(600)
        shot(page, "write-manuscript")
        browser.close()
    log("done")


if __name__ == "__main__":
    main()
