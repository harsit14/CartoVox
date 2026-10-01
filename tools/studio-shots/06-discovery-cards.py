"""Capture discovery-card screenshots from a throwaway Delta V4 studio.

Never use a real library: the manuscript step creates its own sample book.
Run the released app with CARTOVOX_DATA_DIR pointing to a temporary copy of
Ixrixenrond (world_90ae45f361f3), with codex/novels excluded and out_dir
rewritten to that copy. This pass only opens views and changes the sample
manuscript; it never starts a generation or rebuild.

    python3 06-discovery-cards.py --url http://127.0.0.1:8101/

Writes PNGs to /tmp/cartovox-discovery-shots. Pass task names to retake a subset.
"""
import argparse
from importlib import import_module
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

field = import_module('05-field-guide')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tasks', nargs='*')
    parser.add_argument('--url', default='http://127.0.0.1:8101/')
    parser.add_argument('--output', type=Path, default=Path('/tmp/cartovox-discovery-shots'))
    args = parser.parse_args()
    if urlsplit(args.url).hostname not in {'127.0.0.1', 'localhost'}:
        parser.error('Use a localhost studio with a throwaway data directory.')
    args.output.mkdir(parents=True, exist_ok=True)
    wanted = set(args.tasks)
    failures = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 900},
                                device_scale_factor=2, color_scheme='dark')
        page.goto(args.url, wait_until='load', timeout=60000)
        field.dismiss_tour(page)
        field.open_world(page, field.WORLD, field.WORLD_ID)

        def shot(name):
            field.settle(page, 1200)
            page.screenshot(path=str(args.output / f'{name}.png'),
                            animations='disabled', caret='hide')
            print(f'Saved {name}', flush=True)

        def run(name, action):
            if not wanted or name in wanted:
                try:
                    action()
                except Exception as error:
                    failures.append(name)
                    print(f'FAILED {name}: {error}', flush=True)
                    diagnostics = args.output / 'diagnostics'
                    diagnostics.mkdir(exist_ok=True)
                    page.screenshot(path=str(diagnostics / f'failed-{name}.png'))

        def map_shot(view, group):
            field.open_workspace(page, 'world', 'studio')
            field.set_maps_drawer(page, True)
            page.locator(f'[data-map-group="{group}"]').click()
            button = page.locator(f'#layer-bar [data-layer="{view}"]')
            button.wait_for(state='visible')
            assert button.is_enabled(), f'{view} is unavailable in this world'
            button.click()
            page.wait_for_function('''view => {
                const tab = document.querySelector(`#layer-bar [data-layer="${view}"]`);
                const img = document.getElementById('active-map-img');
                return tab?.classList.contains('active') && img?.complete && img.naturalWidth > 0;
            }''', arg=view, timeout=60000)
            # Keep the drawer's selected title and method visible beside the map.
            page.wait_for_timeout(3500)
            shot(f'map-{view.replace("_", "-")}')

        for view, group in [('water_security', 'water_air'),
                            ('agricultural_calendar', 'life_society'),
                            ('floodplain_exposure', 'water_air')]:
            run(view, lambda v=view, g=group: map_shot(v, g))

        def climate_lab():
            field.open_workspace(page, 'world', 'studio')
            field.set_maps_drawer(page, False)
            field.close_dock_menus(page)
            page.evaluate("document.getElementById('btn-climate-lab').click()")
            page.locator('#climate-lab-panel:not(.hidden)').wait_for(state='visible')
            page.wait_for_timeout(4500)
            shot('climate-lab')
            page.evaluate("document.getElementById('btn-close-climate-lab').click()")
        run('climate_lab', climate_lab)

        def reseed():
            field.open_workspace(page, 'world', 'studio')
            field.set_maps_drawer(page, False)
            page.locator('#world-task-rail [data-world-task="world"]').click()
            panel = page.locator('.build-record-panel')
            if not panel.evaluate('(node) => node.open'):
                panel.locator('summary').first.click()
            else:
                panel.locator('summary').first.click()
                panel.locator('summary').first.click()
            page.locator('[data-reseed-panel]').wait_for(state='attached')
            page.locator('[data-reseed-panel]').evaluate('(node) => { for(let p=node;p;p=p.parentElement) if(p.tagName==="DETAILS") p.open=true; }')
            page.locator('[data-reseed-panel]').scroll_into_view_if_needed()
            shot('world-reseed')
        run('reseed', reseed)

        def languages():
            field.open_workspace(page, 'create', 'explorer')
            skip = page.get_by_role('button', name='Skip — I know what I want', exact=True)
            if skip.count() and skip.first.is_visible():
                skip.first.click()
            group = page.locator('#brief-group-languages')
            group.evaluate('(node) => { for(let p=node;p;p=p.parentElement) if(p.tagName==="DETAILS") p.open=true; }')
            group.locator('summary').first.scroll_into_view_if_needed()
            shot('create-languages')
        run('languages', languages)

        def scene_world():
            field.open_workspace(page, 'write', 'manuscript')
            page.wait_for_timeout(1800)
            sample_title = 'A Journey Through Ixrixenrond'
            books = page.locator('#manuscript-book-select')
            if sample_title in books.locator('option').all_text_contents():
                books.select_option(label=sample_title)
            else:
                page.locator('#manuscript-new-book').click()
                field.answer_text_modal(page, sample_title)
            page.wait_for_timeout(1200)
            surface = page.locator('#tab-manuscript .ProseMirror').first
            if not surface.is_visible():
                page.locator('#manuscript-new-chapter').click()
                field.answer_text_modal(page, 'The River Road')
            surface.wait_for(state='visible')
            surface.fill("The road followed the river out of town. Above the fields, the first snow still held to the high ridges; below them, the lower quays were waking to the spring trade. The travellers would take the valley road and make the pass before dusk.")
            if not page.locator('#manuscript-side').is_visible():
                page.locator('#write-panel-toggle').click()
            page.locator('#manuscript-side-tabs [data-side-tab="plan"]').click()
            place = page.locator('#manuscript-scene-location')
            place.wait_for(state='visible')
            place.fill('Zhar')
            choices = page.locator('#manuscript-scene-place-results [data-place-id]')
            choices.first.wait_for(state='visible', timeout=15000)
            choices.first.click()
            page.locator('#manuscript-scene-day').fill('90')
            page.locator('#manuscript-scene-hour').fill('8')
            page.locator('#manuscript-scene-location').press('Tab')
            page.wait_for_timeout(4000)
            page.locator('#manuscript-scene-world').scroll_into_view_if_needed()
            shot('manuscript-scene-world')
        run('scene_world', scene_world)
        browser.close()
        if failures:
            raise SystemExit('Failed screenshot tasks: ' + ', '.join(failures))


if __name__ == '__main__':
    main()
