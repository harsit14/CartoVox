# Studio screenshots

The `app-*.webp` images come from a sandboxed CartoVox studio, never from a
live library. Copy a few saved worlds into a throwaway data directory, start
the app on a spare port, and run the passes in order:

```bash
CARTOVOX_DATA_DIR=/tmp/cartovox-site-sandbox python3 studio.py --port 8098
python3 01-workspaces.py      # library, brief, map views, atlas, travel, codex
python3 02-richer-states.py   # painted canvas, calculated journey, chronicle, campaign
python3 03-manuscript.py      # a new book with original prose, scrolled to the top
python3 05-field-guide.py     # every app-* shot the landing page and the guide use
python3 ../build-images.py --shots /tmp/cartovox-site/shots
```

The passes write 2× PNGs to `/tmp/cartovox-site/shots/`. They need Playwright
with Chromium. Delete the sandbox afterwards: it holds a copy of the worlds.

`05-field-guide.py` supersedes 01–03 for the `app-*` family: those were written
against 0.8.3 and reach for a toolbar 0.9 removed. It takes all thirty-two
shots in one run and opens the hero world by the id in its `WORLD_ID` constant —
the library holds two worlds called Ixrixenrond (one seed, built twice), and
opening the first card of that name photographs the wrong one. It writes a book
of its own prose for the Write shots — no screenshot may show the author's own
manuscript, so strip `codex/novels/` from the sandbox copy before you start.

Run the app at the release the site describes, not at whatever `main` holds:
`git worktree add --detach /tmp/cartovox-vX.Y.Z vX.Y.Z` and start that tree's
`studio.py`. Rewrite the sandbox worlds' absolute `out_dir` paths and delete the
copied `index.json` first, or the copies still point at the real library. Name steps on the command line to retake a few without the
whole run: `python3 05-field-guide.py view-menu tools-menu`. 01–03 remain for
the map-only `chain-*` crops and for the helpers and prose 05 imports.
