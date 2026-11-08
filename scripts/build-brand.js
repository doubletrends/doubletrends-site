/**
 * build-brand.js — generates the brand assets into dist/public/brand/.
 * Called from build.js; nothing here is committed.
 *
 * Identity in the brand's two colors: the portico (the original [_] mark
 * redrawn as two pilasters with a rust threshold) on a navy tile, and the
 * name "DoubleTrends" split as in the original wordmark ("Double" rust,
 * "Trends" navy), set in Source Serif 4 Semibold and
 * converted to outlines (opentype.js), so the SVGs render identically
 * everywhere with no font dependency. The OG
 * image carries the real regime ribbon (1996 → latest), drawn from
 * src/data/regimes-daily.json — the house exhibit, not decoration.
 *
 * Outputs keep every historical filename so external links never break:
 *   logo.svg · logo-on-dark.svg · logo-{light,dark}.png · favicon-{32,180}.png
 *   wordmark.svg · wordmark-{light,dark}.png · og-image.{svg,png} · banner.{svg,png}
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root
const opentype = require('opentype.js');
const sharp = require('sharp');
const { COLORS, REGIMES } = require('../src/brand.config');

const NAVY = COLORS.primary;
const RUST = COLORS.accent;
const MUTED = COLORS.muted;

function loadFont(rel) {
  const buf = fs.readFileSync(require.resolve(rel));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const SERIF = loadFont('@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff');
const SANS = loadFont('@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff');

// Serialize path commands ourselves: opentype.js 2.x's toPathData() number
// formatter turns float artifacts such as 333.00000000000006 into "NaN".
function pathData(p) {
  const n = (v) => (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return p.commands.map((c) => {
    switch (c.type) {
      case 'M': case 'L': return `${c.type}${n(c.x)} ${n(c.y)}`;
      case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      case 'Z': return 'Z';
      default: throw new Error(`unknown path command ${c.type}`);
    }
  }).join('');
}

// Outline a string; returns { d, width, top, bottom } in px for the given size.
// Glyphs are mapped one character at a time (charToGlyph) with pair kerning:
// opentype.js cannot apply this font's GSUB ccmp lookups, and plain Latin
// display text needs no shaping.
function outline(font, text, size, x = 0, y = 0, tracking = 0) {
  let cursor = x;
  const paths = [];
  let top = Infinity, bottom = -Infinity;
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  glyphs.forEach((g, i) => {
    const p = g.getPath(cursor, y, size);
    paths.push(pathData(p));
    const bb = p.getBoundingBox();
    if (Number.isFinite(bb.y1)) { top = Math.min(top, bb.y1); bottom = Math.max(bottom, bb.y2); }
    let adv = (g.advanceWidth / font.unitsPerEm) * size;
    if (i < glyphs.length - 1) adv += (font.getKerningValue(g, glyphs[i + 1]) / font.unitsPerEm) * size;
    cursor += adv + tracking;
  });
  return { d: paths.join(''), width: cursor - x - tracking, top: top - y, bottom: bottom - y };
}

// ─── Mark: the portico ──────────────────────────────────────────────────────
// The original mark was a bracket pair holding a rust cursor bar: [_]. Here
// each bracket is a classical pilaster: abacus and plinth reach inward like
// the bracket's arms; capital, shaft and base stand between. The rust bar
// becomes the threshold of the portico. Drawn on a 64-unit grid, left half
// mirrored, so the mark is exactly symmetric.
function markSvg({ plate, ink }) {
  const half = `<rect x="10.5" y="9" width="16.5" height="2.6"/>
<rect x="11.5" y="11.6" width="10" height="2.2"/>
<rect x="12" y="13.8" width="6" height="33.6"/>
<rect x="11.5" y="47.4" width="10" height="2.2"/>
<rect x="10.5" y="49.6" width="16.5" height="2.6"/>`;
  // A single flute down each shaft, cut in the plate colour.
  const flute = `<rect x="14.6" y="16" width="0.8" height="29" fill="${plate}" fill-opacity="0.55"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<rect width="64" height="64" rx="6" fill="${plate}"/>
<g fill="${ink}">${half}<g transform="translate(64 0) scale(-1 1)">${half}</g></g>
${flute}<g transform="translate(64 0) scale(-1 1)">${flute}</g>
<rect x="26" y="43.4" width="12" height="4" fill="${RUST}"/>
</svg>`;
}

// ─── Wordmark: mark + name ──────────────────────────────────────────────────
function wordmarkSvg({ dark = false } = {}) {
  const ink = dark ? '#FFFFFF' : NAVY;
  const plate = dark ? '#FFFFFF' : NAVY;
  const plateInk = dark ? NAVY : '#FFFFFF';
  const H = 80, mark = 80, gap = 22, size = 50;
  const probe = outline(SERIF, 'DoubleTrends', size);
  const y = H / 2 + (-probe.top) / 2 - 1;
  // "Double" in rust, "Trends" in navy (white on dark), as in the original wordmark.
  const first = outline(SERIF, 'Double', size, mark + gap, y);
  const kernET = (SERIF.getKerningValue(SERIF.charToGlyph('e'), SERIF.charToGlyph('T')) / SERIF.unitsPerEm) * size;
  const second = outline(SERIF, 'Trends', size, mark + gap + first.width + kernET, y);
  const W = Math.ceil(mark + gap + first.width + kernET + second.width + 4);
  const inner = `<g transform="scale(${mark / 64})">${markSvg({ plate, ink: plateInk }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${inner}
<path d="${first.d}" fill="${RUST}"/>
<path d="${second.d}" fill="${ink}"/>
</svg>`, W, H };
}

// ─── Regime ribbon from data ────────────────────────────────────────────────
function ribbon(x, y, w, h) {
  const daily = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'regimes-daily.json'), 'utf8'));
  const color = Object.fromEntries(Object.entries(daily.codes).map(([g, c]) => [c, REGIMES[g].hex]));
  const rows = daily.rows;
  const n = rows.length;
  const out = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || rows[i][2] !== rows[start][2]) {
      const x0 = x + (start / n) * w, x1 = x + (i / n) * w;
      out.push(`<rect x="${x0.toFixed(2)}" y="${y}" width="${Math.max(0.5, x1 - x0).toFixed(2)}" height="${h}" fill="${color[rows[start][2]]}"/>`);
      start = i;
    }
  }
  return { svg: out.join(''), first: rows[0][0].slice(0, 4), last: rows[n - 1][0].slice(0, 4) };
}

// ─── OG image / banner ──────────────────────────────────────────────────────
function cardSvg(W, H, { scale = 1 } = {}) {
  const pad = 80 * scale;
  const wm = wordmarkSvg();
  const wmScale = (0.62 * scale);
  const wmInner = wm.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const sub = outline(SANS, 'MARKET REGIME RESEARCH', 20 * scale, pad, pad + wm.H * wmScale + 46 * scale, 2.4 * scale);
  const line1 = outline(SERIF, 'The DoubleTrends Regime Indicator', 46 * scale, pad, H * 0.58);
  const line2 = outline(SANS, 'S&P 500 · calm · correction · panic · bear', 24 * scale, pad, H * 0.58 + 48 * scale);
  const rb = ribbon(pad, H - pad - 26 * scale, W - 2 * pad, 26 * scale);
  const yrs = outline(SANS, `${rb.first}`, 17 * scale, pad, H - pad + 26 * scale);
  const yre = outline(SANS, `${rb.last}`, 17 * scale, 0, 0);
  const yre2 = outline(SANS, `${rb.last}`, 17 * scale, W - pad - yre.width, H - pad + 26 * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
<rect width="${W}" height="${10 * scale}" fill="${NAVY}"/>
<rect y="${10 * scale}" width="${W}" height="${3 * scale}" fill="${RUST}"/>
<g transform="translate(${pad} ${pad}) scale(${wmScale})">${wmInner}</g>
<path d="${sub.d}" fill="${MUTED}"/>
<path d="${line1.d}" fill="${NAVY}"/>
<path d="${line2.d}" fill="${MUTED}"/>
${rb.svg}
<path d="${yrs.d}" fill="${MUTED}"/>
<path d="${yre2.d}" fill="${MUTED}"/>
</svg>`;
}

// ─── Write ──────────────────────────────────────────────────────────────────
async function writeBrand(OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  const write = (name, s) => fs.writeFileSync(path.join(OUT, name), s);
  const png = (svg, name, opts = {}) => {
    let img = sharp(Buffer.from(svg), { density: 300 });
    if (opts.width) img = img.resize({ width: opts.width });
    if (opts.size) img = img.resize(opts.size, opts.size);
    return img.png().toFile(path.join(OUT, name));
  };

  const logo = markSvg({ plate: NAVY, ink: '#FFFFFF' });
  const logoOnDark = markSvg({ plate: '#FFFFFF', ink: NAVY });
  write('logo.svg', logo);
  write('logo-on-dark.svg', logoOnDark);
  await png(logo, 'favicon-32.png', { size: 32 });
  await png(logo, 'favicon-180.png', { size: 180 });
  await png(logo, 'logo-light.png', { size: 512 });
  await png(logoOnDark, 'logo-dark.png', { size: 512 });

  const wm = wordmarkSvg();
  const wmDark = wordmarkSvg({ dark: true });
  write('wordmark.svg', wm.svg);
  await png(wm.svg, 'wordmark-light.png', { width: 1024 });
  await png(wmDark.svg, 'wordmark-dark.png', { width: 1024 });

  const og = cardSvg(1200, 630);
  write('og-image.svg', og);
  await png(og, 'og-image.png', { width: 1200 });
  const banner = cardSvg(1500, 500, { scale: 0.9 });
  write('banner.svg', banner);
  await png(banner, 'banner.png', { width: 1500 });

}

module.exports = { writeBrand };
