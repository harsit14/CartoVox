# Studio screenshots

## Released Delta V9 captures

All 38 product screenshots currently referenced by the homepage and guide were
captured from `v0.9.10` (`02fd96f70794de2a264c5bdb8ed488dcb83d746b`).
`delta-v9-captures.json` binds the PNG capture hashes and shipped WebP hashes.
The interface is V9; the Ixrixenrond world is the existing earlier project,
opened without updating its generator. Community artwork and the posters for
the explicitly versioned V6 video recordings are separate assets.

Use a temporary source export of the tag or a detached checkout. Prepare a
temporary `data/worlds/world_90ae45f361f3` copy with `codex/novels/` and
`codex/manuscript*` excluded. Rewrite its `world_config.json` `out_dir` to that
copy, and do not copy the library's `index.json`. The directory above `data/`
needs `setup.json` with `release`, `commit`, `world`,
`source_world_config_sha256` and `private_manuscripts_removed: true`; set that
last flag only after excluding the private manuscript files. Never use the
live library. Start that tag's server with `CARTOVOX_DATA_DIR` set to the copy:

```bash
python3 tools/studio-shots/07-release-screenshots.py --sandbox /tmp/.../data --output /tmp/.../shots
python3 tools/build-images.py --shots /tmp/.../shots
python3 tools/subset-fonts.py
python3 tools/stamp-assets.py
```

The V9 pass checks the server's app version, refuses a library outside `/tmp`,
uses original demonstration prose, waits for the gallery and previews, and
fails on incomplete capture steps. Inspect every capture before replacing
assets. The output frame is 1440 × 900 at 2× density, encoded for the site at
1800 × 1125. Screenshot URLs receive content hashes, including thumbnail
`data-src` references, so the month-long image cache cannot keep old UI.
Retain the compact capture manifest and delete the temporary library, source
export and PNGs after validation. Earlier passes below remain the underlying
helpers; `07-release-screenshots.py` is the current release entry point.

## Earlier passes

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

## Discovery-card details

`06-discovery-cards.py` fills the seven formerly text-only cards on the landing
page: three decision maps, Climate Lab, the reseed panel, language families and
a manuscript scene world card. These screenshots were captured from the
released `v0.9.5` source (Delta V4) with a temporary copy of the hero world.
The script writes original sample prose and links a scene in the sandbox;
it must never run against the author's live library.

After preparing the sandbox as above and starting it on port 8101:

```bash
python3 06-discovery-cards.py --url http://127.0.0.1:8101/
python3 ../build-images.py --shots /tmp/cartovox-discovery-shots
```

Pass task names (`water_security`, `agricultural_calendar`,
`floodplain_exposure`, `climate_lab`, `reseed`, `languages`, `scene_world`)
to capture a subset. All card images use the same 16:10 frame as the earlier
product screenshots.
