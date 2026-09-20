# cartovox.org

The public site for [CartoVox](https://cartovox.org), the desktop world simulator.
A static site: one landing page, two legal pages, no build step, no framework,
no third-party requests. Cloudflare Pages serves it straight from this repository.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The landing page |
| `guide/` | The handbook: how to use CartoVox, and a searchable index of where each control lives. Current to 0.9 |
| `features/` | The field guide: the feature inventory, workspace by workspace |
| `privacy/` | What the site and the app do with your data |
| `eula/`, `third-party-notices/` | Legal pages, rendered from the app's Markdown by `tools/build-legal.py` |
| `404.html` | Off the edge of the map |
| `css/site.css` | All styling; gold on midnight, parchment for the atlas section |
| `js/site.js` | Navigation, reveals, the causal chain, showcase tabs, the compare slider |
| `js/candidates.js` | The toy seed search drawn on canvas in the brief section |
| `fonts/` | Cinzel, Newsreader and Inter, self-hosted under the SIL Open Font License |
| `img/` | Every image the site ships, derived by `tools/build-images.py` |
| `_headers`, `_redirects` | Cloudflare Pages headers (CSP, caching) and short links (`/discord`, `/beta`) |
| `robots.txt`, `sitemap.xml`, `site.webmanifest` | The usual furniture |

## Deploying on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick this repository. Production branch: `main`.
3. Build settings: framework preset **None**, build command *empty*, build output directory `/`.
4. **Custom domains** → add `cartovox.org` and `www.cartovox.org`. Cloudflare writes the DNS records itself because the zone is already on Cloudflare.

Every push to `main` redeploys. Preview deployments are created for other branches.

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
`img/app-world-map.webp` (the landing page and field-guide family), and one
called `guide-world-map.png` keeps its name as `img/guide-world-map.webp` (the
handbook's own set, taken against 0.9). They are separate families on purpose —
refreshing one must not silently restate the other, because the two pages
document different builds.

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
