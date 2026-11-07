/**
 * brand.config.js — brand token registry (reference copy).
 *
 * Live consumers: tailwind.config.js (COLORS → bg- and text- utilities, FONTS →
 * font- utilities) and build-brand.js (logo / OG image colors). Hand-mirrored
 * in src/styles/tokens/colors.css; tests/test-brand-tokens.js fails the suite
 * if a mirror drifts.
 *
 * House style ("index provider") in the brand's two colors: navy ink for
 * text and chrome, rust for highlights (labels, active states, accent rules,
 * the "Double" of the wordmark, signal markers). The regime palette encodes
 * regimes only and is kept clear of rust (panic is magenta, not red).
 *
 *   COLORS   Tailwind palette. `primary` (navy) and `accent` (rust) are the
 *            two brand colors of the original wordmark. `dark`, `light`,
 *            `muted` are the historical utility names used in page markup.
 *   FONTS    Source Serif 4 (display + reading) and Source Sans 3 (interface +
 *            data). `noto` / `open` / `mono` are the historical class keys.
 *   REGIMES  Validated categorical palette (dataviz validate_palette.js,
 *            light mode on #FFFFFF, all pairs: CVD ΔE ≥ 8.4, normal ≥ 18.1;
 *            every regime ≥ 16.4 from rust under normal vision). The
 *            correction ochre is below 3:1 against white, so regimes are
 *            always labelled in text and every chart has a table view.
 */

const COLORS = {
  primary: '#2A3340',  // Brand navy — text, headings, chrome, primary buttons
  accent:  '#C2410C',  // Brand rust — highlights only
  dark:    '#2A3340',  // Body text (same navy)
  light:   '#FBFAF7',  // Paper (warm off-white)
  muted:   '#5A6473',  // Secondary text
  rule:    '#DDD9D1',  // Hairlines
  tint:    '#F3F1EC',  // Quiet panels
};

const FONTS = {
  serif: ['"Source Serif 4"', 'Georgia', '"Times New Roman"', 'serif'],
  sans:  ['"Source Sans 3"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
  noto:  ['"Source Serif 4"', 'Georgia', 'serif'],          // historical: display
  open:  ['"Source Sans 3"', '"Helvetica Neue"', 'Arial', 'sans-serif'], // historical: body
  mono:  ['"Source Sans 3"', '"Helvetica Neue"', 'Arial', 'sans-serif'], // historical: data — tabular figures via CSS
};

const REGIMES = {
  calm:       { hex: '#2F7F49' },
  correction: { hex: '#D0A535' },
  panic:      { hex: '#B23B8C' },
  bear:       { hex: '#4A8CC0' },
};

module.exports = { COLORS, FONTS, REGIMES };
