/**
 * brand.config.js — brand token registry (reference copy).
 *
 * Live consumers: tailwind.config.js (COLORS → bg- and text- utilities, FONTS →
 * font- utilities) and build-brand.js (logo / OG image colors). Hand-mirrored
 * in src/styles/tokens/colors.css; tests/test-brand-tokens.js fails the suite
 * if a mirror drifts.
 *
 * House style ("index provider"): navy ink on white paper, one gray family,
 * no accent color in the chrome. Color carries data — the regime palette is
 * the only chromatic set, and it appears only where it encodes a regime.
 *
 *   COLORS   Tailwind palette. `primary`, `dark`, `light`, `muted` are the
 *            historical utility names used across page markup (text-primary,
 *            bg-light …); they now resolve to the house palette, so legacy
 *            markup restyles without edits.
 *   FONTS    Source Serif 4 (display + reading) and Source Sans 3 (interface +
 *            data). `noto` / `open` / `mono` are the historical class keys.
 *   REGIMES  Validated categorical palette (dataviz validate_palette.js,
 *            light mode on #FFFFFF, all-pairs CVD ΔE ≥ 14.9). The correction
 *            ochre is below 3:1 against white, so regimes are always labelled
 *            in text and every chart has a table view.
 */

const COLORS = {
  primary: '#14213D',  // Navy ink — brand, headings, links, primary buttons
  dark:    '#1C2430',  // Body text
  light:   '#FFFFFF',  // Paper
  muted:   '#5B6573',  // Secondary text
  rule:    '#DADDE2',  // Hairlines
  tint:    '#F4F5F7',  // Quiet panels, utility bar
};

const FONTS = {
  serif: ['"Source Serif 4"', 'Georgia', '"Times New Roman"', 'serif'],
  sans:  ['"Source Sans 3"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
  noto:  ['"Source Serif 4"', 'Georgia', 'serif'],          // historical: display
  open:  ['"Source Sans 3"', '"Helvetica Neue"', 'Arial', 'sans-serif'], // historical: body
  mono:  ['"Source Sans 3"', '"Helvetica Neue"', 'Arial', 'sans-serif'], // historical: data — tabular figures via CSS
};

const REGIMES = {
  calm:       { hex: '#4A8CC0' },
  correction: { hex: '#D29A2E' },
  panic:      { hex: '#BC3F2F' },
  bear:       { hex: '#5D4BA6' },
};

module.exports = { COLORS, FONTS, REGIMES };
