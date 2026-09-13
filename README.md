# cartovox.org

The public site for [CartoVox](https://cartovox.org), the desktop world simulator.
A static site: one landing page, two legal pages, no build step, no framework,
no third-party requests. Cloudflare Pages serves it straight from this repository.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The landing page |
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

The sources are not in this repository: the brand lockups live in the app
repository, the world plates in a local CartoVox library, and the studio
screenshots come from a sandboxed run of the app.

```bash
python3 tools/build-images.py --brand <app>/assets/app-icon --worlds <library>/worlds --shots <shots-dir>
python3 tools/build-legal.py <app>/EULA.md <app>/THIRD-PARTY-NOTICES.md
```

Each flag is optional; a pass with only `--shots` refreshes the app screenshots.

## After changing CSS or JS

```bash
python3 tools/stamp-assets.py
```

Every page references `/css/site.css?v=<hash>` and the scripts likewise, so a
changed file is fetched under a new URL instead of being served from a
browser's cache. Run it last — after `build-legal.py` or `build-releases.py`
have written their pages — and commit the restamped HTML with the change.

## Local preview

```bash
python3 -m http.server 8097 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8097/>.
