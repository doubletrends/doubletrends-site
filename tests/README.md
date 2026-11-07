# tests/

Site validation suite. `npm test` builds the site and runs every check below; CI runs the same command and blocks the deploy on any failure. Each check counts what it examined and fails if it examined nothing, so a markup change cannot turn a check into a silent pass.

## Commands

- `npm test` — build and run the full suite
- `npm run test:links` — internal links, anchors and referenced assets in built HTML
- `npm run test:trademark` — trademark notice and ™ convention
- `npm run test:metadata` — metadata completeness and the title convention
- `npm run test:registry` — `src/site.config.js` page-registry integrity
- `npm run test:schema` — JSON-LD rules for article and non-article pages
- `npm run test:labels` — kickers, research sections, About index and navigation state agree
- `npm run test:brand-tokens` — `src/styles/tokens/colors.css` mirrors `src/brand.config.js`

Unresolved `{{PLACEHOLDER}}` tokens are caught earlier: the build itself fails on any.

## Contracts

### Internal links (`test:links`)

Link targets are resolved the way Cloudflare's auto-trailing-slash asset handling serves them: an extensionless path resolves to `path.html`, a directory path to its `index.html`. The build rewrites internal `.html` hrefs to this extensionless form; the test validates the rewritten output, including that every referenced image, script and download exists in `dist/`.

### Trademark (`test:trademark`)

- Every built page carries the footer notice "DoubleTrends™ is a trademark of DoubleTrends L.L.C." exactly once.
- Outside `legal/`, the ™ appears only in that notice: running text, titles, metadata and JSON-LD use plain "DoubleTrends".
- Legal documents may mark the name wherever their drafting does.

### Metadata completeness (`test:metadata`)

Each built page has `<title>`, meta description, robots, canonical, `og:title`, `og:description`, `twitter:title`, `twitter:description`, and (unless `noindex`) a JSON-LD block. The three titles match and follow the convention `{Page} | DoubleTrends`, or `DoubleTrends — {title}` on the homepage; the three descriptions match; the canonical is on `https://doubletrends.com/`.

### Page registry integrity (`test:registry`)

Unique `src` values, valid `.html` output paths, source files present under `src/pages/`, valid `kind`, required `title` and `desc`, valid priorities, the expected `root` derivation, and article pages under `academy/`.

### Schema rules (`test:schema`)

- Article pages emit `Article`, declare `section`, and declare non-empty `schema.about`.
- Non-article pages do not emit `Article`.
- Research pages emit breadcrumbs.

### Labels (`test:labels`)

- **Kickers:** each section index carries the section name ("Research", "About", "Legal"); every sub-page carries "Section · Category".
- **Research notes:** the kicker category equals the registry `section` (which also feeds the dateline and the research library).
- **About and Legal:** each sub-page's kicker category equals its H1, and the About index lists each sub-page under that same name.
- **Navigation:** a page with `nav` in the registry marks exactly that primary-nav item `aria-current`; a page without `nav` marks none.

### Brand tokens (`test:brand-tokens`)

`src/brand.config.js` is read by Tailwind and `build-brand.js`; `src/styles/tokens/colors.css` is read by every stylesheet and the SVG exhibits. The test maps each `COLORS` key and each `REGIMES` entry to its CSS custom property and fails on any missing or differing value — and on any `COLORS` key without a defined mirror.
