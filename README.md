# Fix That Gap!

Interactive wheel and tyre fitment calculator. Enter your current and new wheel/tyre specs and get an instant side-by-side comparison — measurements table plus a live 2D cross-section diagram showing both setups overlaid on a shared hub reference.

## Features

- **Comparison table** — diameter, circumference, poke, inset, speedo error, ride height gain, arch gap loss
- **Speedometer correction** — shows actual speed at reference speeds (mph for UK/US, km/h for all other locales)
- **Spacer support** — adjusts effective ET automatically; reflected in diagram and poke calculation
- **Camber rendering** — enter positive or negative degrees and the wheel tilts in the diagram
- **Two 2D diagrams** — a cross-section (overlaid tyre profiles on a shared hub, with diameter callouts and poke rows) plus a face-on view (concentric tyre/rim circles, camber foreshortened into an ellipse)
- **Hover tooltips** — plain-English explanation of every measurement
- **Offline / PWA** — installable on desktop and mobile; works fully without a network connection after first load
- **Fully accessible** — skip link, labelled form groups, `role="status"` live region, axe-core clean
- **Localised** — 23 languages with browser auto-detection, per-locale HTML, hreflang, and full RTL support (Arabic, Hebrew, Urdu)
- **Input validation** — all fields have enforced min/max ranges; JS clamping backs up browser constraints
- **Fitment warnings** — amber/red flags with a plain-English reason: speedo under-reading, large rolling-diameter change, poke/inset clearance (row tints) plus tyre stretch/bulge, low profile, large spacers and aggressive camber (warning strip)
- **Hardened headers** — CSP, HSTS, COOP, and frame control shipped via `_headers` (Cloudflare) and the Caddyfile (Docker)
- **Zero client dependencies** — pure vanilla JS, no framework

## Local dev

### Option A — Node / Express

```sh
npm install
npm start        # → http://localhost:3000
```

### Option B — Caddy

Requires [Caddy](https://caddyserver.com/docs/install) (`brew install caddy` on macOS) if not using Docker:

```sh
npm run caddy    # → http://localhost:80

# or with Docker:

docker compose up
```

## Build for production

```sh
npm run publish
```

> `public/` is a build artifact — it is **gitignored, not committed**. Cloudflare
> (and CI, Docker, and the test suite) regenerates it from `src/` with
> `npm run publish`. Run the build once locally before `npm start`, `docker build`,
> or serving `public/` directly.

Reads `src/`, runs these steps in order, and writes everything to `public/`:

1. **CSS** — minified with clean-css, then **inlined** into the HTML (eliminates the render-blocking request)
2. **JS** — minified + mangled with Terser; written with a content hash in the filename — one file shared by all locales
3. **HTML** — one page per locale: SEO tags + hreflang injected, `window.L` locale object inlined, JS filename + `defer` injected, then minified
4. **Service worker** — cache name and precache list (root + all locale paths) injected, then minified
5. **Manifest + icon** — copied verbatim
6. **`_headers`** — cache rules per locale path plus a `/*` block of security headers (CSP, HSTS, COOP, frame control)

```text
  locales           en, ar, bn, da, de, es, fi, fr, he, hi, hr, it, ja, ko, nl, no, pl, pt, ro, sv, uk, ur, zh
  style.css   11.8 KiB -> 7.3 KiB  -38%  (inlined)
  app.js      25.1 KiB -> 10.8 KiB  -57%  -> app.<hash>.js
  en/index.html  11.9 KiB -> 21.7 KiB
  ar/index.html  11.9 KiB -> 23.6 KiB
  ...
  sw.js       1.4 KiB -> 0.7 KiB  -49%

✓ Done in ~230ms
```

> The HTML grows because minified CSS and the locale object (`window.L`) are inlined — total bytes in one round-trip instead of two.

## Localisation

Languages are defined in `src/locales/<lang>.json`. The build picks up every `.json` file in that directory automatically.

**To add a new language:**

1. Copy `src/locales/en.json` to `src/locales/sv.json` (or any BCP 47 code)
2. Translate every string value — keep all keys present (the test suite enforces completeness)
3. Set `"speedUnit"`, `"refSpeed1"`, `"refSpeed2"` appropriately (`"mph"` + `30`/`60` for imperial countries; `"km/h"` + `50`/`100` for metric)
4. Add the flag emoji to `"flag"` and the native language name to `"langName"`
5. Run `npm run publish` — the new locale page, hreflang tags, and switcher option appear automatically

Right-to-left rendering is automatic: the build sets `<html dir="rtl">` for Arabic, Hebrew, Urdu, and Farsi, and the CSS uses logical properties so the layout mirrors with no per-locale work.

**URL structure** (23 locales — English at the root, each other under its code):

| Locale | URL |
| ------ | --- |
| English (default) | `/` |
| German | `/de/` |
| French | `/fr/` |
| Japanese | `/ja/` |
| Arabic (RTL) | `/ar/` |
| … | `/<lang>/` |

**Auto-detection:** On first visit to `/`, the site reads `navigator.language`. If the browser locale matches a supported language it redirects once and stores the preference in `localStorage`. The language switcher (top-right of header) overrides this at any time.

## Testing

```sh
npm test
```

Builds the project, installs Playwright Chromium if needed, then runs all specs. Requires no running server — the Playwright specs start their own static file server on `:3334`.

### Test files

| File | What it covers |
| ---- | -------------- |
| `test/locales.spec.js` | Locale JSON completeness (all required keys, speed units, placeholders, no empty strings); build output HTML (`lang`/`dir` attrs, `window.L` values, hreflang tags + exact href targets, redirect scripts, shared JS bundle); `_headers` cache + security headers (CSP, HSTS, COOP, frame control, Cloudflare Analytics allowances) |
| `test/calculator.spec.js` | Default inputs and values; input constraint attributes; results table (row count, OD, poke, labels, speedo precision); boundary calculations at min/max limits; out-of-range clamping; spacer maths; fitment warnings (row tints + stretch/bulge strip); both canvas diagrams (cross-section + face-on view); tooltips; share button URL round-trip; URL parameter pre-fill |
| `test/i18n.spec.js` | Per-locale rendering (`lang` attr, h1, button labels, speed unit/reference value, tooltip-attribute escaping, no JS errors); language switcher (open/close, all locales listed, active state, Escape key, click-outside) |
| `test/autodetect.spec.js` | Auto-detection on `/`: browser locale and stored preference redirect to the right locale; English/unsupported stay on `/` |
| `test/csp.spec.js` | Loads pages under the exact production CSP from `_headers` and asserts the app triggers zero policy violations (LTR + RTL) |

### Shared fixture

`test/fixtures.js` exports a `test` object extended with two fixtures used by `calculator.spec.js` and `i18n.spec.js`:

- **`server`** _(worker-scoped)_ — starts a Node `http.createServer` on `:3334` serving `public/`, shared across all tests in the worker, torn down when the worker exits
- **`makePage(lang)`** — creates an isolated browser context with `localStorage` pinned to `lang` (prevents auto-detect redirects) and `navigator.clipboard`/`navigator.share` stubbed for headless compatibility

### Accessibility check

`npm run a11y` builds, starts its own server, and runs the axe-core scan — no separate dev server needed:

```sh
npm run a11y                               # scans http://localhost:3000
npm run a11y -- https://fixthatgap.com    # scans production
```

## SEO

Edit [`site.config.json`](site.config.json) to configure metadata injected at build time:

```json
{
  "canonicalUrl": "https://fixthatgap.com",
  "ogImage": "https://fixthatgap.com/icon.svg",
  "twitterCard": "summary",
  "author": "",
  "keywords": "..."
}
```

Per-locale `title` and `description` come from `src/locales/<lang>.json` (`pageTitle` and `metaDescription`). All other fields fall back to `site.config.json`.

## Docker

```sh
npm run publish
docker build -t fitment-calculator .
docker run --rm -p 80:80 fitment-calculator
# or
docker compose up
```

The container uses Caddy with gzip/zstd compression and security headers.

## Deploying to Cloudflare

Deployment uses [Wrangler](https://developers.cloudflare.com/workers/wrangler/). The root [`wrangler.jsonc`](wrangler.jsonc) points Cloudflare at the built `public/` directory (`assets.directory`).

```sh
npm run publish   # build src/ → public/
npm run deploy    # wrangler deploy  (npm run preview for a local Cloudflare preview)
```

`_headers` is honoured by Cloudflare for cache and security headers; Cloudflare handles CDN and HTTPS. Connecting the repo to Cloudflare's Git integration also works — set the build command to `npm run publish` and the output directory to `public`.

## Project structure

```text
fitment-calculator/
├── src/                    # source — edit these
│   ├── app.js              # calculator logic + canvas rendering
│   ├── sw.js               # service worker template
│   ├── index.html          # markup template with {{KEY}} placeholders
│   ├── style.css           # all styles
│   ├── manifest.json       # Web App Manifest
│   ├── icon.svg            # app icon (favicon + PWA)
│   └── locales/            # one JSON per language
│       ├── *.json
├── public/                 # build output — gitignored, generated by npm run publish
│   ├── index.html          # English; CSS inlined, window.L injected
│   ├── de/index.html       # German
│   ├── fr/index.html       # French (and so on)
│   ├── app.<hash>.js       # shared minified JS
│   ├── sw.js
│   ├── manifest.json
│   ├── icon.svg
│   └── _headers            # Cloudflare cache + security headers
├── test/
│   ├── fixtures.js         # shared Playwright fixtures (server + makePage)
│   ├── locales.spec.js     # locale JSON + build output + headers
│   ├── calculator.spec.js  # calculator features + constraints + clamping
│   ├── i18n.spec.js        # per-locale rendering + language switcher
│   └── csp.spec.js         # app runs clean under the production CSP
├── build.js                # build pipeline (terser + clean-css + html-minifier-terser)
├── playwright.config.js    # Playwright test runner config
├── a11y.js                 # axe-core accessibility scanner
├── server.js               # local dev — Express on :3000, serves public/
├── site.config.json        # SEO metadata (canonical URL, OG, Twitter, keywords)
├── wrangler.jsonc          # Cloudflare deploy config (assets dir: public/)
├── Caddyfile               # Caddy config (local + Docker)
├── Dockerfile              # production image — Caddy on :80
├── docker-compose.yml
├── package.json
├── biome.json              # linter / formatter
├── .github/
│   └── workflows/
│       └── ci.yml          # PR checks: lint → build → tests → a11y
├── .gitignore
└── .dockerignore
```

## npm scripts

| Command | What it does |
| --- | --- |
| `npm start` | Build, then serve `public/` via Express on `:3000` |
| `npm run caddy` | Caddy server on `:80` (serves the Docker `/srv` root) |
| `npm run check` | Build, then Biome lint + format |
| `npm run publish` | Build `src/` → `public/` for all locales |
| `npm test` | Build, install Chromium, run all Playwright specs |
| `npm run a11y` | Build, start a server, axe-core scan against `:3000` |
| `npm run deploy` | `wrangler deploy` (publishes `public/` to Cloudflare) |
| `npm run preview` | `wrangler dev` (local Cloudflare preview) |

## CI

`.github/workflows/ci.yml` runs on every pull request:

1. `npx biome ci .` — lint (no auto-fix, exits non-zero on violations)
2. `npm run publish` — build all locale pages
3. `npx playwright install chromium --with-deps` — install browser for tests
4. `npx playwright test` — full suite across locales, calculator, i18n, constraints, and CSP
5. `node a11y.js` — axe-core scan against the built site

## Inputs

| Field        | Unit   | Range      | Notes |
| ------------ | ------ | ---------- | ----- |
| Rim diameter | inches | 12 – 25    | Standard automotive convention |
| Rim width    | inches | 3 – 20     | |
| Offset / ET  | mm     | −300 – 300 | Positive = hub face toward outer edge; negative = hub face toward inner edge |
| Tyre width   | mm     | 100 – 500  | Section width |
| Profile      | %      | 10 – 100   | Aspect ratio (sidewall height as % of section width) |
| Spacer       | mm     | 0 – 100    | Optional — reduces effective ET by this amount |
| Camber       | °      | −20 – +20  | Optional — positive or negative; tilts wheel in diagram |

All limits are enforced both by HTML `min`/`max` attributes (browser UI) and by JavaScript clamping in the `v()` input helper (calculation layer).

## Key formulas

| Metric                       | Formula |
| ---------------------------- | ------- |
| Total diameter               | `rimDiameter × 25.4 + 2 × (tyreWidth × profile / 100)` |
| Poke                         | `rimWidth / 2 − effectiveET` |
| Inset                        | `rimWidth / 2 + effectiveET` |
| Effective ET                 | `ET − spacer` |
| Speedo error                 | `(oldCirc − newCirc) / newCirc × 100` |
| Speedo reading at X mph/km/h | `X × oldCirc / newCirc` |
| Ride height gain             | `(newDiameter − oldDiameter) / 2` |
