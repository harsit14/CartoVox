# cartovox.org

The public site for [CartoVox](https://cartovox.org), the desktop world simulator.
A static site: one landing page, two legal pages, no build step, no framework,
no third-party requests. A Cloudflare Worker with static assets serves it straight from this repository,
together with the Delta service CartoVox's Delta builds talk to (`worker/`).

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The landing page |
| `guide/` | The guide: a searchable index of where every control lives, a first world step by step, then every workspace in depth. Current to 0.9.1 |
| `privacy/` | What the site and the app do with your data |
| `eula/`, `third-party-notices/` | Legal pages, rendered from the app's Markdown by `tools/build-legal.py` |
| `404.html` | Off the edge of the map |
| `css/site.css` | All styling; gold on midnight, parchment for the atlas section |
| `js/site.js` | Navigation, reveals, the causal chain, showcase tabs, the compare slider |
| `js/candidates.js` | The toy seed search drawn on canvas in the brief section |
| `fonts/` | Cinzel, Newsreader and Inter, self-hosted under the SIL Open Font License |
| `img/` | Every image the site ships, derived by `tools/build-images.py` |
| `_headers`, `_redirects` | Static-asset headers (CSP, caching) and short links (`/discord`, `/delta`, `/invite`, `/beta`) |
| `worker/`, `wrangler.jsonc`, `.assetsignore` | The Worker: static files straight from the assets, and the Delta service (`/v1/…` for the app, `/admin` for the owner's report). The service is copied from the app repository by `tools/sync-delta-service.py` |
| `robots.txt`, `sitemap.xml`, `site.webmanifest` | The usual furniture |

## Deploying on Cloudflare

The site is the `cartovox` Worker (Workers & Pages → cartovox), connected to this
repository with Workers Builds: production branch `main`, no build command, deploy
command `npx wrangler deploy`, which reads `wrangler.jsonc`. The Worker serves the
repository's files as static assets (minus `.assetsignore`), honours `_headers` and
`_redirects`, and answers 404s with `404.html`. `cartovox.org` is its custom domain.

Every push to `main` redeploys; other branches get preview versions.

## The Delta service

Delta builds of CartoVox register each computer under an access code and send a
usage report to `https://cartovox.org/v1/…`. The code is written and tested in
the app repository (`services/delta-service/`); copy it here with

```bash
python3 tools/sync-delta-service.py <app>
```

and push. The D1 database (`cartovox-delta`) is bound in `wrangler.jsonc`; the one
thing set by hand is the Worker's encrypted **`ADMIN_TOKEN`** secret (Workers & Pages →
cartovox → Settings → Variables and Secrets), the password for `/admin`. The service creates its
tables and loads the issued access codes itself on first use. The report is at
`https://cartovox.org/admin`; revoking a code and reading raw data are described in
the app repository's `services/delta-service/README.md`.

## Regenerating images

Most sources are not in this repository: the gold lockups live in the app
repository, the world plates in a local CartoVox library, and the studio
screenshots come from a sandboxed run of the app. The v2 icon masters are in
`brand/` here — the illustrated and flat icons on dark and light plates, and
the transparent header mark.

```bash
python3 tools/build-images.py --brand <app>/assets/app-icon --icons brand --worlds <library>/worlds --shots <shots-dir>
python3 tools/build-legal.py <app>/EULA.md <app>/THIRD-PARTY-NOTICES.md
python3 tools/build-releases.py <app>/.github/release-notes
python3 tools/build-faq-schema.py          # FAQPage JSON-LD, derived from the FAQ markup
```

Screenshot names decide where they land: a PNG called `world-map.png` becomes
`img/app-world-map.webp`. One family, shared by the landing page and the guide,
taken in one pass so the two can never document different builds.

Each flag is optional; a pass with only `--shots` refreshes the app screenshots,
and `--icons brand` alone re-derives every favicon, touch icon, the header mark,
the 404 mark and the social card. Which icon goes where: the illustrated dark
icon at 180 px and up, the flat dark icon at 64 px and below (it keeps its
shape in a browser tab), the transparent mark in the header beside the gold
wordmark, and the gold lockup in the footer.

## After changing CSS or JS

```bash
python3 tools/stamp-assets.py
```

Every page references `/css/site.css?v=<hash>` and the scripts likewise, so a
changed file is fetched under a new URL instead of being served from a
browser's cache. Run it last — after `build-legal.py`, `build-releases.py` or
`build-faq-schema.py` have written their pages — and commit the restamped HTML
with the change.

## Claims the site makes that can drift

Three numbers on the landing page are measured from the library rather than
remembered, and are worth re-checking when the worlds behind them change: each
plate's foundation, seed and major-continent count in *The same sentence, four
ways in*; the eight style sheets in the atlas section; and the build times under
*What it costs you*. Everything else on that page is either generated from the
app's own files or describes behaviour documented in the manual.

## Local preview

```bash
python3 -m http.server 8097 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8097/>.
