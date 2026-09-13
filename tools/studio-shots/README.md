# Studio screenshots

The `app-*.webp` images come from a sandboxed CartoVox studio, never from a
live library. Copy a few saved worlds into a throwaway data directory, start
the app on a spare port, and run the three passes in order:

```bash
CARTOVOX_DATA_DIR=/tmp/cartovox-site-sandbox python3 studio.py --port 8098
python3 01-workspaces.py      # library, brief, map views, atlas, travel, codex
python3 02-richer-states.py   # painted canvas, calculated journey, chronicle, campaign
python3 03-manuscript.py      # a new book with original prose, scrolled to the top
python3 ../build-images.py --shots /tmp/cartovox-site/shots
```

The passes write 2× PNGs to `/tmp/cartovox-site/shots/`. They need Playwright
with Chromium. Delete the sandbox afterwards: it holds a copy of the worlds.
