# tests/

Site validation suite. `npm test` builds the site and runs every check below; CI runs the same command and blocks the deploy on any failure. Each check counts what it examined and fails if it examined nothing, so a markup change cannot turn a check into a silent pass.

## Commands

- `npm test` — build, then run every check (`tests/run.js` runs each `tests/test-*.js`; it runs them all even after a failure and exits 1 if any failed)
- `node tests/run.js <name> [<name> …]` — run some checks against the current `dist/` (run `npm run build` first)

| Name | Checks |
| --- | --- |
| `links` | internal links, anchors and referenced assets in built HTML, each link in its served form |
| `urls` | canonical tags, sitemap and `_redirects` publish only served URLs |
| `trademark` | trademark notice and ™ convention |
| `metadata` | metadata completeness and the title convention |
| `page-registry` | `src/site.config.js` page-registry integrity |
| `schema` | JSON-LD rules for article and non-article pages |
| `labels` | kickers, research sections, About index and navigation state agree |
| `brand-tokens` | `src/styles/tokens/colors.css` mirrors `src/brand.config.js` |
| `data` | `indicator.json`, the daily history and the signal CSV agree |
| `listing` | `LISTING.md` texts fit their form limits, its facts match the site, its images are the built ones |

A new check is a `tests/test-<name>.js` file that calls `report()` from `tests/utils.js`; the runner picks it up.

Unresolved `{{PLACEHOLDER}}` tokens are caught earlier: the build itself fails on any.

## Contracts

### Internal links (`links`)

Link targets are resolved the way Cloudflare's auto-trailing-slash asset handling serves them: an extensionless path resolves to `path.html`, a directory path to its `index.html`. The build rewrites internal `.html` hrefs to this extensionless form; the test validates the rewritten output, including that every referenced image, script and download exists in `dist/`. Every link to a page is written in the form Cloudflare serves with 200 — leaf pages without `.html` or a trailing slash, folder indexes with the slash — so in-site navigation never passes through a 307.

### Published URLs (`urls`)

- Each page's canonical tag names that page itself, at its served URL.
- `sitemap.xml` lists exactly the indexable (non-`noindex`) pages, each at its served URL.
- Every `_redirects` target is a served URL (one hop, never into a 404), and no source is a served URL (a rule must not hide a live page).

### Trademark (`trademark`)

- Every built page carries the footer notice "DoubleTrends™ is a trademark of DoubleTrends L.L.C." exactly once.
- Outside `legal/`, the ™ appears only in that notice: running text, titles, metadata and JSON-LD use plain "DoubleTrends".
- Legal documents may mark the name wherever their drafting does.

### Metadata completeness (`metadata`)

Each built page has `<title>`, meta description, robots, canonical, `og:title`, `og:description`, `twitter:title`, `twitter:description`, and (unless `noindex`) a JSON-LD block. The three titles match and follow the convention `{Page} | DoubleTrends`, or `DoubleTrends — {title}` on the homepage; the three descriptions match. Where the canonical points is `urls`'s rule; JSON-LD presence is `schema`'s.

### Page registry integrity (`page-registry`)

Unique `src` values, valid `.html` output paths, source files present under `src/pages/` (the build only warns on a missing one), valid `kind`, required `title` and `desc`, valid sitemap priorities, article pages under `research/` (the moved-URL redirects derive each note's slug from that path), and each article's `series` listed in `SERIES` (an unknown series would drop the note from the library and the footer).

### Schema rules (`schema`)

- JSON-LD parses, and every indexable page emits it.
- Article pages emit `Article` and declare a non-empty `schema.about` (there is no default).

### Labels (`labels`)

- **Kickers:** each section index carries the section name ("Research", "About", "Legal"); every sub-page carries "Section · Category".
- **Research notes:** the kicker category equals the registry `section` (which also feeds the dateline and the research library).
- **About and Legal:** each sub-page's kicker category equals its H1, and the About index lists each sub-page under that same name.
- **Navigation:** a page with `nav` in the registry marks exactly that primary-nav item `aria-current`; a page without `nav` marks none.

### Brand tokens (`brand-tokens`)

`src/brand.config.js` is read by Tailwind and `scripts/build-brand.js`; `src/styles/tokens/colors.css` is read by every stylesheet and the SVG exhibits. The test maps each `COLORS` key and each `REGIME_COLORS` entry to its CSS custom property and fails on any missing or differing value — on any `COLORS` key without a defined mirror, and when the regimes in `REGIME_COLORS` differ from `src/regimes.js`.

### Data (`data`)

`scripts/indicator-data.js` writes `src/data/indicator.json`, `src/data/regimes-daily.json` and `public/data/doubletrends-signals.csv` from one backfill; they are committed together. The test fails when they disagree: each signal's date, regime and close match the daily history; forward returns match the closes 91 / 365 / 730 calendar days on (±0.1 pt); signals are labelled live exactly from `live_since`; the headline signal figures recompute from the signal list; regime days add up to the trading days and the latest reading is the last daily row; and the CSV carries the same signals row for row.
