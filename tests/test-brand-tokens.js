// Validates that the hand-mirrored copies of the brand tokens agree with
// src/brand.config.js (the reference copy). The mirrors are intentional —
// plain CSS stays greppable and hand-editable — but a change to one copy
// without the others must not ship. Mirrors checked:
//
//   COLORS / SEMANTIC             → src/styles/tokens/colors.css
//   REGIMES / REGIME_ALPHA_LEGEND
//     / SIGNAL_FLASH              → src/styles/components/terminal-base.css
//   COLORS (dark / light / rust)  → build-brand.js COLOR map
//   DARK_SURFACE                  → src/_partials/routing-card.html
//
// Reads sources directly; does not require a build.

const fs   = require('fs');
const path = require('path');
const { ROOT, report } = require('./test-utils');
const {
  COLORS,
  SEMANTIC,
  REGIMES,
  REGIME_ALPHA_LEGEND,
  SIGNAL_FLASH,
  DARK_SURFACE,
} = require(path.join(ROOT, 'src', 'brand.config'));

const errors = [];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// "46, 158, 123" / "#C2410C" → canonical comparison forms.
const normTriple = (s) => String(s).replace(/\s+/g, '');
const normHex    = (s) => String(s).trim().toLowerCase();

function hexToTriple(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
}

// Extract `--name: value;` from a CSS source.
function cssVar(css, name, file) {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) {
    errors.push(`${file}: custom property ${name} not found`);
    return null;
  }
  return m[1].trim();
}

function expectHex(actual, expected, label) {
  if (actual !== null && normHex(actual) !== normHex(expected)) {
    errors.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

function expectTriple(actual, expected, label) {
  if (actual !== null && normTriple(actual) !== normTriple(expected)) {
    errors.push(`${label}: expected "${expected}", got "${actual}"`);
  }
}

function expectNumber(actual, expected, label) {
  if (actual !== null && Number(actual) !== expected) {
    errors.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

// ─── colors.css ↔ COLORS / SEMANTIC ──────────────────────────────────────────
{
  const file = 'src/styles/tokens/colors.css';
  const css = read(file);

  expectHex(cssVar(css, '--color-rust',  file), COLORS.primary, `${file} --color-rust ↔ COLORS.primary`);
  expectHex(cssVar(css, '--color-dark',  file), COLORS.dark,    `${file} --color-dark ↔ COLORS.dark`);
  expectHex(cssVar(css, '--color-light', file), COLORS.light,   `${file} --color-light ↔ COLORS.light`);
  expectHex(cssVar(css, '--color-muted', file), COLORS.muted,   `${file} --color-muted ↔ COLORS.muted`);

  expectHex(cssVar(css, '--color-gain', file), SEMANTIC.gain.hex, `${file} --color-gain ↔ SEMANTIC.gain.hex`);
  expectHex(cssVar(css, '--color-loss', file), SEMANTIC.loss.hex, `${file} --color-loss ↔ SEMANTIC.loss.hex`);
  expectTriple(cssVar(css, '--color-gain-rgb', file), SEMANTIC.gain.rgb, `${file} --color-gain-rgb ↔ SEMANTIC.gain.rgb`);
  expectTriple(cssVar(css, '--color-loss-rgb', file), SEMANTIC.loss.rgb, `${file} --color-loss-rgb ↔ SEMANTIC.loss.rgb`);

  // The *-rgb companions must be the decomposition of their own hex value.
  for (const name of ['rust', 'dark', 'light']) {
    const hex = cssVar(css, `--color-${name}`, file);
    if (hex !== null) {
      expectTriple(
        cssVar(css, `--color-${name}-rgb`, file),
        hexToTriple(hex),
        `${file} --color-${name}-rgb ↔ --color-${name}`,
      );
    }
  }
}

// ─── terminal-base.css ↔ REGIMES / REGIME_ALPHA_LEGEND / SIGNAL_FLASH ────────
{
  const file = 'src/styles/components/terminal-base.css';
  const css = read(file);

  for (const [name, regime] of Object.entries(REGIMES)) {
    expectTriple(cssVar(css, `--replay-${name}-rgb`, file), regime.rgb, `${file} --replay-${name}-rgb ↔ REGIMES.${name}.rgb`);
    expectNumber(cssVar(css, `--replay-band-alpha-${name}`, file), regime.alphaBand, `${file} --replay-band-alpha-${name} ↔ REGIMES.${name}.alphaBand`);
  }
  expectNumber(cssVar(css, '--replay-legend-alpha', file), REGIME_ALPHA_LEGEND, `${file} --replay-legend-alpha ↔ REGIME_ALPHA_LEGEND`);
  expectTriple(cssVar(css, '--replay-alert-rgb', file), SIGNAL_FLASH.rgb, `${file} --replay-alert-rgb ↔ SIGNAL_FLASH.rgb`);
  expectNumber(cssVar(css, '--replay-flash-alpha', file), SIGNAL_FLASH.alpha, `${file} --replay-flash-alpha ↔ SIGNAL_FLASH.alpha`);
}

// ─── build-brand.js COLOR map ↔ COLORS ───────────────────────────────────────
// Parsed from source text — requiring build-brand.js would run the generator.
{
  const file = 'build-brand.js';
  const src = read(file);
  const block = src.match(/const COLOR = \{([\s\S]*?)\};/);
  if (!block) {
    errors.push(`${file}: COLOR map not found`);
  } else {
    const expected = { dark: COLORS.dark, light: COLORS.light, rust: COLORS.primary };
    for (const [key, want] of Object.entries(expected)) {
      const m = block[1].match(new RegExp(`${key}:\\s*'([^']+)'`));
      if (!m) errors.push(`${file}: COLOR.${key} not found`);
      else if (normHex(m[1]) !== normHex(want)) {
        errors.push(`${file} COLOR.${key} ↔ COLORS: expected ${want}, got ${m[1]}`);
      }
    }
  }
}

// ─── routing-card.html ↔ DARK_SURFACE ────────────────────────────────────────
// Inline styles compose these literally, so containment (whitespace-insensitive)
// is the contract.
{
  const file = 'src/_partials/routing-card.html';
  const html = normTriple(read(file)).toLowerCase();
  const contains = (needle, label) => {
    if (!html.includes(normTriple(needle).toLowerCase())) {
      errors.push(`${file}: ${label} not found — expected "${needle}"`);
    }
  };

  contains(DARK_SURFACE.gradient, 'DARK_SURFACE.gradient');
  contains(DARK_SURFACE.text, 'DARK_SURFACE.text');
  contains(DARK_SURFACE['pill-fg'], 'DARK_SURFACE.pill-fg');
  contains(`rgba(${hexToTriple(DARK_SURFACE['text-cool'])},`, 'DARK_SURFACE.text-cool (as rgba components)');
}

report(errors, 'Brand token test');
