// Brand tokens are defined in src/brand.config.js (read by Tailwind and
// build-brand.js) and hand-mirrored as CSS custom properties in
// src/styles/tokens/colors.css (read by every stylesheet and the SVG
// exhibits). This test fails the suite if the two copies drift, or if the
// regimes with a color (REGIME_COLORS) differ from src/regimes.js.
const fs   = require('fs');
const path = require('path');
const { COLORS, REGIME_COLORS, RETURNS } = require('../src/brand.config');
const { REGIME_ORDER } = require('../src/regimes');
const { ROOT, report } = require('./utils');

// brand.config key → CSS custom property in colors.css.
const COLOR_MIRROR = {
  primary: '--ink',
  accent:  '--accent',
  dark:    '--text',
  light:   '--paper',
  muted:   '--muted',
  rule:    '--rule',
  tint:    '--tint',
};

function main() {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens', 'colors.css'), 'utf8');
  const vars = Object.fromEntries([...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim()]));
  const errors = [];
  let checked = 0;

  const expect = (name, want, source) => {
    checked++;
    const got = vars[name];
    if (!got) errors.push(`colors.css: missing ${name} (mirror of ${source})`);
    else if (got.toLowerCase() !== want.toLowerCase()) errors.push(`colors.css: ${name} is ${got}, but ${source} is ${want}`);
  };

  for (const [key, cssVar] of Object.entries(COLOR_MIRROR)) {
    if (!(key in COLORS)) { errors.push(`brand.config COLORS has no "${key}"`); continue; }
    expect(cssVar, COLORS[key], `COLORS.${key}`);
  }
  for (const key of Object.keys(COLORS)) {
    if (!(key in COLOR_MIRROR)) errors.push(`brand.config COLORS.${key} has no mirror defined in this test`);
  }
  for (const [regime, { hex }] of Object.entries(REGIME_COLORS)) {
    expect(`--regime-${regime}`, hex, `REGIME_COLORS.${regime}`);
  }
  if (Object.keys(REGIME_COLORS).join() !== REGIME_ORDER.join()) {
    errors.push(`REGIME_COLORS (${Object.keys(REGIME_COLORS).join(', ')}) ≠ src/regimes.js (${REGIME_ORDER.join(', ')})`);
  }
  for (const [kind, { hex }] of Object.entries(RETURNS)) {
    expect(`--${kind}`, hex, `RETURNS.${kind}`);
  }

  if (!checked) errors.push('nothing checked');
  report(errors, `Brand token test (${checked} tokens)`);
}

main();
