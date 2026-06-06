# DoubleTrends Frontend

Static frontend for `doubletrends.com`.

This repo builds the marketing site, academy pages, brand page, replay chart, history table, and the public bot/brief sandbox. Output is written to `dist/` and deployed as a Cloudflare Worker static asset site.

## What Lives Here

- `src/pages/`
  Page templates for the site.
- `src/_partials/`
  Shared layout, header, footer, Tailwind config injection, and component/style partials.
- `public/`
  Static assets copied into the final build, including replay JSON, fonts, images, and browser-side JS.
- `build.js`
  Main site build. Assembles partials, injects config/placeholders, writes `dist/`, and generates `sitemap.xml` and `llms.txt`.
- `build-brand.js`
  Regenerates the CDS logo, wordmark, favicons, and OG image into `public/brand/`.
- `build-replay-data.js`
  Rebuilds `public/replay/*.json` from backend artifacts and existing replay data.
- `src/brand.config.js`
  Frontend brand token source of truth for colors and fonts.
- `wrangler.jsonc`
  Cloudflare deployment config. `dist/` is served as the Worker asset directory.

## Repo Relationship

This repo is frontend-only, but it depends on data artifacts from the sibling backend repo:

- expected sibling path: `../doubletrends-backend`
- replay-data input CSV: `../doubletrends-backend/signal/backfill/fast/backfill_fast.csv`
- brief-demo export source: `../doubletrends-backend/worker/src/export_public_brief_demo.ts`

If `doubletrends-backend` is missing or stale, `npm run replay-data` can fail or produce outdated frontend demo data.

## Scripts

- `npm run build`
  Build the site into `dist/`.
- `npm run dev`
  Build once, then serve `dist/` locally on `http://127.0.0.1:8080` with `live-server`.
- `npm run brand`
  Regenerate brand assets in `public/brand/`.
- `npm run replay-data`
  Rebuild replay JSON artifacts in `public/replay/`.
- `npm run deploy`
  Run the site build, then deploy with Wrangler.

## Local Workflow

1. Install dependencies:

```bash
npm install
```

2. Start the local site:

```bash
npm run dev
```

3. Open:

```text
http://127.0.0.1:8080
```

## Build Notes

- The site is static. There is no framework runtime or bundler layer here.
- Shared partials use placeholders like `{{ROOT}}`, `{{TITLE}}`, and `{{DESC}}`; `build.js` resolves them per page.
- Nested pages use per-page `root` prefixes from `src/site.config.js` so shared partials link correctly from subdirectories like `academy/`, `company/`, and `legal/`.
- Canonical metadata, Open Graph tags, JSON-LD, and page registry data also come from `src/site.config.js` and `src/schema.js`.

## Replay Data

The homepage replay chart and history table read from `public/replay/`.

`build-replay-data.js` produces:

- `public/replay/sp500.json`
  OHLC candles plus regime/watch/setup/signal state and authoritative signal dates.
- `public/replay/history.json`
  Signal history entries with forward-return snapshots.
- `public/replay/brief-demo.json`
  Public demo fixtures for the brief sandbox.

The replay build is intentionally coupled to the backend repo, because the frontend should display the same signal history and demo payload shape the backend system produces.

## Brand Assets

Brand assets are generated, not hand-drawn.

- source generator: `build-brand.js`
- generated output: `public/brand/`
- frontend tokens: `src/brand.config.js`

Do not hand-edit generated SVG or PNG files in `public/brand/`; regenerate them with `npm run brand`.

## Deployment

Production deploy uses Wrangler with `dist/` as the asset directory.

```bash
npm run deploy
```

That runs:

1. `node build.js`
2. `wrangler deploy`

## Reading Map

- site/page registry: `src/site.config.js`
- structured data and canonical helpers: `src/schema.js`
- brand tokens: `src/brand.config.js`
- build pipeline: `build.js`
- brand asset generator: `build-brand.js`
- replay artifact generator: `build-replay-data.js`
