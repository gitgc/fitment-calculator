# Fix That Gap!

Interactive wheel and tyre fitment calculator. Enter your current and new wheel/tyre specs and get an instant side-by-side comparison — measurements table plus a live 2D cross-section diagram showing both setups overlaid on a shared hub reference.

## Features

- **Comparison table** — diameter, circumference, poke, inset, speedo error, ride height gain, arch gap loss
- **Speedometer correction** — shows actual speed at reference speeds (mph for UK/US, km/h for all other locales)
- **Spacer support** — adjusts effective ET automatically; reflected in diagram and poke calculation
- **Camber rendering** — enter positive or negative degrees and the wheel tilts in the diagram
- **2D cross-section diagram** — overlaid tyre profiles on a shared hub, with diameter callouts and poke measurement rows
- **Hover tooltips** — plain-English explanation of every measurement
- **Offline / PWA** — installable on desktop and mobile; works fully without a network connection after first load
- **Fully accessible** — skip link, labelled form groups, `role="status"` live region, axe-core clean
- **Localised** — Multiple languages with auto-detection, per-locale HTML
- **Input validation** — all fields have enforced min/max ranges; JS clamping backs up browser constraints
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
> Pages (and CI, Docker, and the test suite) regenerate it from `src/` with
> `npm run publish`. Run the build once locally before `npm start`, `docker build`,
> or serving `public/` directly.

Reads `src/`, runs these steps in order, and writes everything to `public/`:

1. **CSS** — minified with clean-css, then **inlined** into the HTML (eliminates the render-blocking request)
2. **JS** — minified + mangled with Terser; written with a content hash in the filename — one file shared by all locales
3. **HTML** — one page per locale: SEO tags + hreflang injected, `window.L` locale object inlined, JS filename + `defer` injected, then minified
4. **Service worker** — cache name and precache list (root + all locale paths) injected, then minified
5. **Manifest + icon** — copied verbatim
6. **`_headers`** — Cloudflare cache rules written for every locale path

```text
  locales           en, de, es, fr, ja, ko
  style.css   10.2 KiB -> 6.2 KiB  -38%  (inlined)
  app.js      23.1 KiB -> 10.2 KiB  -56%  -> app.e233f0a7.js
  en/index.html  5.6 KiB -> 17.8 KiB
  de/index.html  5.6 KiB -> 18.1 KiB
  ...
  sw.js       1.3 KiB -> 0.6 KiB  -49%

✓ Done in ~120ms
```

> The HTML grows because minified CSS and the locale object (`window.L`) are inlined — total bytes in one round-trip instead of two.

## Localisation

Languages are defined in `src/locales/<lang>.json`. The build picks up every `.json` file in that directory automatically.

**To add a new language:**

1. Copy `src/locales/en.json` to `src/locales/sv.json` (or any BCP 47 code)
2. Translate every string value — keep all keys present
3. Set `"speedUnit"`, `"refSpeed1"`, `"refSpeed2"` appropriately (`"mph"` + `30`/`60` for imperial countries; `"km/h"` + `50`/`100` for metric)
4. Add the flag emoji to `"flag"` and the native language name to `"langName"`
5. Run `npm run publish` — the new locale page, hreflang tags, and switcher option appear automatically

**URL structure:**

| Locale | URL |
| ------ | --- |
| English (default) | `/` |
| German | `/de/` |
| French | `/fr/` |
| Japanese | `/ja/` |
| Spanish | `/es/` |
| Korean | `/ko/` |

**Auto-detection:** On first visit to `/`, the site reads `navigator.language`. If the browser locale matches a supported language it redirects once and stores the preference in `localStorage`. The language switcher (top-right of header) overrides this at any time.

## Testing

```sh
npm test
```

Builds the project, installs Playwright Chromium if needed, then runs all specs. Requires no running server — the Playwright specs start their own static file server on `:3334`.

### Test files

| File | What it covers |
| ---- | -------------- |
| `test/locales.spec.js` | Locale JSON completeness (all required keys, speed units, placeholders, no empty strings); build output HTML (lang attr, `window.L` values, hreflang tags, redirect scripts, shared JS bundle, `_headers`) |
| `test/calculator.spec.js` | Default inputs and values; input constraint attributes; results table (row count, OD, poke, labels, speedo precision); boundary calculations at min/max limits; out-of-range clamping; spacer maths; canvas rendering; tooltips; share button; URL parameter pre-fill |
| `test/i18n.spec.js` | Per-locale rendering (lang attr, h1, button labels, speed unit/reference value, no JS errors); language switcher (open/close, all locales listed, active state, Escape key, click-outside) |

### Shared fixture

`test/fixtures.js` exports a `test` object extended with two fixtures used by `calculator.spec.js` and `i18n.spec.js`:

- **`server`** _(worker-scoped)_ — starts a Node `http.createServer` on `:3334` serving `public/`, shared across all tests in the worker, torn down when the worker exits
- **`makePage(lang)`** — creates an isolated browser context with `localStorage` pinned to `lang` (prevents auto-detect redirects) and `navigator.clipboard`/`navigator.share` stubbed for headless compatibility

### Accessibility check

Requires the dev server to be running:

```sh
npm start &
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

## Deploying to Cloudflare Pages

1. Push this repo to GitHub
2. In the Cloudflare dashboard → **Pages → Create a project → Connect to Git**
3. Set:
   - **Build command**: `npm run publish`
   - **Build output directory**: `public`
4. Deploy — Cloudflare runs the build, serves `public/`, handles CDN and HTTPS

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
│   ├── locales.spec.js     # locale JSON + build output structure
│   ├── calculator.spec.js  # calculator features + constraints + clamping
│   └── i18n.spec.js        # per-locale rendering + language switcher
├── build.js                # build pipeline (terser + clean-css + html-minifier-terser)
├── playwright.config.js    # Playwright test runner config
├── a11y.js                 # axe-core accessibility scanner
├── server.js               # local dev — Express on :3000, serves src/
├── site.config.json        # SEO metadata (canonical URL, OG, Twitter, keywords)
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

| Command           | What it does |
| ----------------- | ------------ |
| `npm start`       | Express dev server on `:3000`, serves `src/` |
| `npm run caddy`   | Caddy dev server on `:80`, serves `src/` |
| `npm run check`   | Biome lint + format |
| `npm run publish` | Build `src/` → `public/` for all locales |
| `npm test`        | Build, install Chromium, run all Playwright specs |
| `npm run a11y`    | Axe-core accessibility scan against `:3000` |

## CI

`.github/workflows/ci.yml` runs on every pull request:

1. `npx biome ci .` — lint (no auto-fix, exits non-zero on violations)
2. `npm run publish` — build all locale pages
3. `npx playwright install chromium --with-deps` — install browser for tests
4. `npx playwright test` — 87 specs across locales, calculator, i18n, and constraints
5. `node a11y.js` — axe-core scan against the started Express server

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
