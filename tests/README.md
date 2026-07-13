# tests/

Frontend validation suite. All scripts are invoked via `npm run test:*`; `npm run test` runs them all.

## Commands

- `npm run test` — run the full suite
- `npm run test:links` — verify internal links, anchors, and unresolved placeholders in built HTML
- `npm run test:trademark` — validate brand and entity naming across tracked text sources
- `npm run test:metadata` — verify metadata completeness and title-prefix rules
- `npm run test:registry` — validate `src/site.config.js` page registry integrity
- `npm run test:schema` — verify JSON-LD rules for article and non-article pages
- `npm run test:overlines` — verify every academy/company/legal page carries a correctly formatted overline
- `npm run test:nav-consistency` — verify nav dropdown, footer column, and section index card are in sync for every sub-page
- `npm run test:headings` — verify heading hierarchy consistency across company pages
- `npm run test:brand-tokens` — verify the hand-mirrored brand token copies agree with `src/brand.config.js`

## Contracts

### Metadata completeness (`test:metadata`)

Checks each built HTML page for: `<title>`, meta description, robots meta, canonical link, `og:title`, `og:description`, `twitter:title`, `twitter:description`, and at least one JSON-LD block.

### Internal links (`test:links`)

Link targets are resolved the way Cloudflare's auto-trailing-slash asset handling serves them: an extensionless path resolves to `path.html`, a directory path to its `index.html`. The build rewrites internal `.html` hrefs to this extensionless form; the test validates the rewritten output.

Also enforces:

- `<title>`, `og:title`, and `twitter:title` must match and start with `DoubleTrends™ | `
- description, `og:description`, and `twitter:description` must match

### Trademark and entity naming (`test:trademark`)

- Brand references must use `DoubleTrends™`
- Legal entity name is allowed only as `DoubleTrends L.L.C.`
- An unmarked brand-name literal is not allowed unless immediately followed by ` L.L.C.`

### Page registry integrity (`test:registry`)

Checks `src/site.config.js` for: unique `src` values, valid `.html` output paths, source-file existence under `src/pages/`, valid `kind`, required `title` and `desc`, valid priority ranges, expected `root` derivation, and article pages living under `academy/`.

### Overline consistency (`test:overlines`)

Checks every HTML page under `academy/`, `company/`, and `legal/` for a `.tag-overline` element whose text matches the expected section prefix (e.g. `Academy ·`, `Company ·`, `Legal ·`).

### Nav / footer / index consistency (`test:nav-consistency`)

Cross-checks nav dropdown, footer column, and section index card for each sub-page — fails if a page appears in one but not the others.

Pages intentionally excluded from navigation are listed in the `NAV_EXCLUDED` set at the top of `test-nav-consistency.js`. Add a page's canonical path there to suppress the check without removing it from the build or sitemap.

### Heading consistency (`test:headings`)

Checks that company pages follow a consistent heading hierarchy.

### Brand token consistency (`test:brand-tokens`)

`src/brand.config.js` is the reference copy of the brand tokens; the same values are intentionally hand-mirrored (plain CSS stays greppable) in:

- `src/styles/tokens/colors.css` — COLORS and SEMANTIC gain/loss (hex + rgb triples)
- `src/styles/components/terminal-base.css` — REGIMES bands, legend alpha, signal flash
- `build-brand.js` — the COLOR map driving generated brand assets
- `src/_partials/routing-card.html` — the DARK_SURFACE gradient and text colors

The test parses each mirror from source (no build needed) and fails if any copy disagrees with `brand.config.js`. When changing a token, update the reference and its mirror(s) together.

### Schema rules (`test:schema`)

- Article pages must emit `Article`, declare `section`, and declare non-empty `schema.about`
- Non-article pages must not emit `Article`
- Academy content pages must emit breadcrumbs
