/**
 * brand.config.js
 *
 * Single source of truth for brand tokens. Consumed at build time by:
 *   - build.js → injects {{TAILWIND_COLORS}} / {{TAILWIND_FONTS}} into
 *     _partials/tailwind.html so the Tailwind Play CDN sees the same values.
 *   - build.js → drives the auto-generated Token Registry on company/brand.html
 *     so the page that documents the standard literally renders it.
 *
 * The post-trim shape:
 *   COLORS       — the documented brand palette (4 tokens). What used to be
 *                  "working palette" (bright, primary-h, muted-dim, gray-d)
 *                  collapsed into the four canonical names after the audit
 *                  showed no meaningful visual delta between bright and dark,
 *                  muted-dim and muted, etc. The hover-darkening on .btn-light
 *                  and .cmd-send keeps the literal #9A330A inline because it
 *                  is an implementation detail, not a brand token.
 *   FONTS        — three faces (Syne / DM Sans / JetBrains Mono). Merriweather
 *                  was loaded but never referenced; removed in trim.
 *   DARK_SURFACE — the dark-bevel gradient + companion text colors used on
 *                  the routing-card panels at the foot of index.html and
 *                  method.html. Accepted as designed; named so they stop
 *                  registering as drift.
 *   REGIMES      — chart regime band colors as RGB triples (composed with
 *                  alpha at the call site).
 *   SEMANTIC     — gain / loss colors for financial return rendering.
 *                  Currently share hex values with REGIMES.calm / .bear by
 *                  coincidence; kept conceptually separate so they can move
 *                  independently if either side ever repaints.
 */

const COLORS = {
  primary: '#C2410C',  // Rust — accents, CTAs, links
  dark:    '#2A3340',  // Glyphs on light, primary text
  light:   '#FBFAF7',  // Page background, glyphs on dark
  muted:   '#5A6473',  // Secondary text, body copy, fine print
};

const FONTS = {
  noto: ['"Syne"', 'sans-serif'],            // Display
  open: ['"DM Sans"', 'sans-serif'],         // Body
  mono: ['"JetBrains Mono"', 'monospace'],   // Data / code / eyebrows
};

// Routing-card palette (foot of index.html and method.html). Three-stop
// dark bevel + text-on-dark companions. Treated as one designed system.
const DARK_SURFACE = {
  gradient: 'linear-gradient(135deg, #171D25 0%, #222B36 58%, #2C3641 100%)',
  text:        '#F6F1E8',  // Warm light text — h2, route label
  'text-cool': '#E9EDF2',  // Cool body text — composed with alpha at call sites
  'pill-fg':   '#FFD7BF',  // Primary-on-dark pill foreground
};

// Regime palette. Stored as RGB triples (not hex) because consumers compose
// them with variable alpha for chart bands, legends, etc.
// Currently lives as CSS custom properties on #replay-shell in
// _partials/styles/primitives.html — not yet wired from this config.
const REGIMES = {
  calm:       { rgb: '46, 158, 123', hex: '#2E9E7B', alphaBand: 0.07 },
  correction: { rgb: '234, 179, 8',  hex: '#EAB308', alphaBand: 0.10 },
  panic:      { rgb: '217, 119, 6',  hex: '#D97706', alphaBand: 0.10 },
  bear:       { rgb: '200, 65, 59',  hex: '#C8413B', alphaBand: 0.12 },
};
const REGIME_ALPHA_LEGEND = 0.50;  // Solid-ish swatches in the chart legend
const SIGNAL_FLASH = { rgb: '255, 0, 0', alpha: 0.16 };  // Chart fire-animation flash

// Financial semantic colors — used for returns in history-table.js and the
// replay chart's candlestick series. Stored as RGB triples (mirrors REGIMES
// shape) so consumers can compose with alpha at the call site via
// rgba(var(--gain-rgb), alpha). Conceptually independent from regimes;
// currently share triples with calm/bear by happy coincidence.
const SEMANTIC = {
  gain: { rgb: '46, 158, 123', hex: '#2E9E7B' },  // Positive return (= calm, today)
  loss: { rgb: '200, 65, 59',  hex: '#C8413B' },  // Negative return (= bear, today)
};

module.exports = {
  COLORS,
  FONTS,
  DARK_SURFACE,
  REGIMES,
  REGIME_ALPHA_LEGEND,
  SIGNAL_FLASH,
  SEMANTIC,
};
