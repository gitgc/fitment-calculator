# Fitment Calculator

Interactive wheel and tyre fitment calculator. Enter your current and new wheel/tyre specs and get an instant side-by-side comparison — measurements table plus a live 2D cross-section diagram showing both setups overlaid on a shared hub reference.

## Features

- **Comparison table** — diameter, circumference, poke, inset, speedo error, ride height gain, arch gap loss
- **Speedometer correction** — shows actual speed when speedo reads 30 / 60 mph
- **Spacer support** — adjusts effective ET automatically; reflected in diagram and poke calculation
- **Camber rendering** — enter positive or negative degrees and the wheel tilts in the diagram
- **2D cross-section diagram** — overlaid tyre profiles on a shared hub, with diameter callouts and poke measurement rows
- **Hover tooltips** — plain-English explanation of every measurement
- **Zero client dependencies** — pure vanilla JS, no build step, works offline

## Getting started

### Option A — Node / Express

```sh
npm install
npm start        # → http://localhost:3000
```

Override the port with `PORT=8080 npm start`.

### Option B — Caddy

Requires [Caddy](https://caddyserver.com/docs/install) (`brew install caddy` on macOS).

```sh
npm run caddy    # → http://localhost:80  (watches Caddyfile for changes)
```

### Docker (Caddy)

```sh
# one-off
docker build -t fitment-calculator .
docker run --rm -p 80:80 fitment-calculator

# or with Compose
docker compose up
```

Both serve the app at `http://localhost:80`. The container uses Caddy with gzip/zstd compression and security headers.

## Deploying to Cloudflare Pages

1. Push this repo to GitHub
2. In the Cloudflare dashboard → **Pages → Create a project → Connect to Git**
3. Set:
   - **Build command**: *(leave empty)*
   - **Build output directory**: `src`
4. Deploy — Cloudflare handles CDN and HTTPS automatically

## Project structure

```text
fitment-calculator/
├── src/
│   ├── index.html        # markup only — no inline styles or scripts
│   ├── style.css         # all styles
│   └── app.js            # calculation logic and canvas rendering
├── Caddyfile             # env-var driven — works locally and in Docker
├── Dockerfile            # production image — Caddy on :80
├── docker-compose.yml    # Compose wrapper for the Docker image
├── server.js             # local dev — Express on :3000
├── package.json
├── .gitignore
└── .dockerignore
```

## Inputs

| Field        | Unit   | Notes                                                    |
| ------------ | ------ | -------------------------------------------------------- |
| Rim diameter | inches | Standard automotive convention                           |
| Rim width    | inches |                                                          |
| Offset / ET  | mm     | Positive = hub face toward outer edge                    |
| Tyre width   | mm     | Section width                                            |
| Profile      | %      | Aspect ratio (sidewall height as % of section width)     |
| Spacer       | mm     | Optional — reduces effective ET by this amount           |
| Camber       | °      | Optional — positive or negative; tilts wheel in diagram  |

## Key formulas

| Metric                  | Formula                                                     |
| ----------------------- | ----------------------------------------------------------- |
| Total diameter          | `rimDiameter × 25.4 + 2 × (tyreWidth × profile / 100)`     |
| Poke                    | `rimWidth / 2 − effectiveET`                                |
| Inset                   | `rimWidth / 2 + effectiveET`                                |
| Effective ET            | `ET − spacer`                                               |
| Speedo error            | `(oldCirc − newCirc) / newCirc × 100`                       |
| Speedo reading at X mph | `X × oldCirc / newCirc`                                     |
| Ride height gain        | `(newDiameter − oldDiameter) / 2`                           |

## Executing the linter

```sh
npm run check
```
