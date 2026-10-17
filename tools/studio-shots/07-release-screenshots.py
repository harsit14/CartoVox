"""Capture released V9 screenshots with sandbox checks and a capture manifest.

Run studio.py from the v0.9.10 tag with CARTOVOX_DATA_DIR set to a disposable
library copy. Exclude codex/novels and codex/manuscript* before starting it.
This pass writes original sample prose only in that temporary library.

    python3 07-release-screenshots.py --sandbox /tmp/.../data --output /tmp/.../shots

Uses the existing field-guide and discovery passes. A failed step is an error,
not permission to reuse an older screenshot. --tasks selects field-guide steps;
--discovery selects discovery steps. Without either, capture both complete sets.
"""
import argparse
import hashlib
from importlib import import_module
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit, urljoin
from urllib.request import urlopen

def main():
    started_at = time.time()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8098/')
    parser.add_argument('--sandbox', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument('--tasks', nargs='+')
    selection.add_argument('--discovery', nargs='+')
    args = parser.parse_args()
    if urlsplit(args.url).hostname not in {'127.0.0.1', 'localhost'}:
        parser.error('Use a loopback studio, never a public or live instance.')
    with urlopen(urljoin(args.url, '/api/app-info'), timeout=15) as response:
        info = json.load(response)
    assert info['version'] == '0.9.10' and info['release'] == 'Delta V9', info
    sandbox = args.sandbox.resolve()
    if not sandbox.is_relative_to(Path('/private/tmp')) and not sandbox.is_relative_to(Path('/tmp')):
        parser.error('The library must be a disposable directory under /tmp.')
    setup_path = sandbox.parent / 'setup.json'
    setup = json.loads(setup_path.read_text())
    if setup['release'] != 'v0.9.10':
        parser.error('This pass describes the released v0.9.10 source.')
    world = sandbox / 'worlds' / setup['world']
    config = json.loads((world / 'world_config.json').read_text())
    assert Path(config['out_dir']).resolve() == world.resolve(), 'Copy still points at the live world'
    assert setup.get('private_manuscripts_removed'), 'Prepare a copy without private manuscripts'
    args.output.mkdir(parents=True, exist_ok=True)
    field = import_module('05-field-guide')
    discovery = import_module('06-discovery-cards')
    field.URL = args.url
    field.OUT = args.output
    field.ONLY = set(args.tasks or [])
    failures = []
    captures = []

    def settle(page, _ms=0):
        page.evaluate('document.fonts.ready')
        page.wait_for_function("""() => [...document.images].filter(i =>
          i.getBoundingClientRect().width && i.getBoundingClientRect().height &&
          getComputedStyle(i).visibility !== 'hidden').every(i => i.complete && i.naturalWidth > 0)
        """, timeout=60000)
        # Let resize observers and canvas presentation finish after layout.
        page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
        page.evaluate('document.activeElement?.blur()')
        page.mouse.move(1430, 8)

    def shot(page, name, clip=None):
        if name == 'library-gallery':
            page.locator('#gallery-grid .gallery-card').first.wait_for(state='visible', timeout=90000)
        if name == 'create-advanced':
            page.locator('#advanced-preview-image').wait_for(state='visible', timeout=60000)
            page.wait_for_function("""() => document.getElementById('advanced-preview-image').naturalWidth > 0 &&
                !/Drawing|Reading|Loading/.test(document.getElementById('advanced-preview-state').textContent)
            """, timeout=60000)
        if name == 'terrain-3d':
            page.wait_for_function("!document.getElementById('voxel-status').textContent.includes('Loading')", timeout=60000)
        settle(page)
        path = args.output / f'{name}.png'
        page.screenshot(path=str(path), animations='disabled', caret='hide', clip=clip)
        captures.append({'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                         'viewport': page.viewport_size, 'device_scale_factor': 2})
        print(f'Captured {name}', flush=True)

    def dismiss_tour(page):
        for selector in ['#tour-skip', '#tour-close']:
            button = page.locator(selector)
            if button.is_visible():
                button.click()

    def step(name, action):
        if name == 'planet-card':
            return  # This old crop is no longer used on the website.
        if field.ONLY and name not in field.ONLY:
            return
        try:
            action()
        except Exception as error:
            failures.append(name)
            print(f'FAILED {name}: {error}', flush=True)

    original_workspace = field.open_workspace

    def workspace(page, name, tab):
        original_workspace(page, name, tab)
        if name == 'create' and tab == 'explorer':
            for label in ['Generate a new world', 'Writing and world building', 'Skip — I know what I want']:
                button = page.get_by_role('button', name=label, exact=True)
                if button.count() and button.first.is_visible():
                    button.first.click()

    field.open_workspace = workspace
    field.settle = settle
    field.shot = shot
    field.dismiss_tour = dismiss_tour
    field.step = step
    if not args.discovery:
        field.main()
    if not args.tasks:
        previous_args = sys.argv
        sys.argv = ['06-discovery-cards.py', '--url', args.url, '--output', str(args.output),
                    *(args.discovery or [])]
        try:
            discovery.main()
        except SystemExit as error:
            if error.code:
                failures.append(str(error))
        finally:
            sys.argv = previous_args
    # The discovery pass owns its screenshot function; inventory both passes.
    captures = [{'file': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                 'viewport': {'width': 1440, 'height': 900}, 'device_scale_factor': 2}
                for p in sorted(args.output.glob('*.png')) if p.stem != 'world-planet']
    if not args.tasks and not args.discovery:
        site = Path(__file__).resolve().parents[2]
        used = set(re.findall(r'/img/app-([\w-]+)\.webp',
                              (site / 'index.html').read_text() + (site / 'guide/index.html').read_text()))
        stale = [name for name in used if not (args.output / f'{name}.png').exists()
                 or (args.output / f'{name}.png').stat().st_mtime < started_at]
        failures.extend(f'Not captured in this run: {name}' for name in sorted(stale))
    manifest = {'release': setup['release'], 'commit': setup['commit'], 'world': setup['world'],
                'source_world_config_sha256': setup['source_world_config_sha256'],
                'captures': captures, 'failed_steps': failures}
    (args.output / 'capture-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    assert not failures, failures


if __name__ == '__main__':
    main()
