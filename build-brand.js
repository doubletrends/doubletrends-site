/**
 * build-brand.js — generates public/brand/ from JetBrains Mono Bold + rust geometry.
 *
 * Favicon family:  logo.svg · logo-{light,dark}.png · favicon-{32,180}.png
 * Wordmark family: wordmark.{svg,png} · og-image.{svg,png} · banner.{svg,png}
 */

const fs       = require('fs');
const path     = require('path');
const opentype = require('opentype.js');
const sharp    = require('sharp');

const FONT_PATH = require.resolve(
  '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'
);
const OUT_DIR = path.join(__dirname, 'public', 'brand');

const COLOR = {
  dark:  '#2A3340',
  light: '#FBFAF7',
  rust:  '#C2410C',
};

const BAR_HEIGHT = 4;
const WORDMARK_TEXT = 'DoubleTrends';
const WORDMARK_ACCENT_TEXT = 'Double';
const OG_TAGLINE = 'DoubleTrends L.L.C. · Quantitative Research · Market Education';

// Artwork shrinks to 70% so bracket corners stay inside any circular crop
// (largest inscribed square in a circle has side ≈ diameter × 0.707).
const LOGO_TILE_ARTWORK_SCALE = 0.7;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadFont() {
  const buf = fs.readFileSync(FONT_PATH);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return opentype.parse(ab);
}

function glyphMetrics(font, ch, fontSize) {
  const glyph = font.charToGlyph(ch);
  const scale = fontSize / font.unitsPerEm;
  const bbox  = glyph.getBoundingBox();
  return {
    glyph,
    advance: glyph.advanceWidth * scale,
    x1: bbox.x1 * scale,
    x2: bbox.x2 * scale,
    visualTopFromBaseline:    bbox.y2 * scale,   // font y-up → SVG y-down: y2 is visual top
    visualBottomFromBaseline: -bbox.y1 * scale,  // negated: positive = extends below baseline
  };
}

// Extract the 4 distinct y levels of [ / ] — outer top, inner top, inner bottom,
// outer bottom — by walking path commands. Used by bracketScale.
function extractBracketGeometry(font, ch, fontSize) {
  const glyph = font.charToGlyph(ch);
  const p = glyph.getPath(0, 0, fontSize);
  const ys = [];
  for (const cmd of p.commands) {
    if (cmd.y  !== undefined) ys.push(cmd.y);
    if (cmd.y1 !== undefined) ys.push(cmd.y1);
    if (cmd.y2 !== undefined) ys.push(cmd.y2);
  }
  const sorted = [...ys].sort((a, b) => a - b);
  const levels = [];
  for (const y of sorted) {
    if (levels.length === 0 || y - levels[levels.length - 1] > 0.5) levels.push(y);
  }
  if (levels.length < 4) {
    throw new Error(`Bracket '${ch}' produced ${levels.length} distinct y levels: ${levels.join(', ')}`);
  }
  return {
    outerTop:    levels[0],
    innerTop:    levels[1],
    innerBottom: levels[levels.length - 2],
    outerBottom: levels[levels.length - 1],
    armThickness: levels[1] - levels[0],
    innerHeight:  levels[levels.length - 2] - levels[1],
    outerHeight:  levels[levels.length - 1] - levels[0],
  };
}

// Uses S (has overshoot top & bottom — most extreme letter). Returns SVG y coords.
function letterRange(font, fontSize, baselineY) {
  const s = glyphMetrics(font, 'S', fontSize);
  const top    = baselineY - s.visualTopFromBaseline;
  const bottom = baselineY + s.visualBottomFromBaseline;
  return { top, bottom, height: bottom - top, center: (top + bottom) / 2 };
}

// Scale-then-translate transform that maps the bracket's inner cavity → letter range.
// Can't scale around center: cavity ≠ letter center due to S overshoot asymmetry.
function bracketScale(font, fontSize, baselineY) {
  const geom    = extractBracketGeometry(font, '[', fontSize);
  const letters = letterRange(font, fontSize, baselineY);
  const K = letters.height / geom.innerHeight;
  // geom y values come from getPath(0,0) — shift by baselineY for rendered position
  const innerTopRendered = baselineY + geom.innerTop;
  // solve: K * innerTopRendered + ty = letters.top
  const ty = letters.top - K * innerTopRendered;
  return {
    K,
    ty,
    transform: `translate(0 ${ty.toFixed(4)}) scale(1 ${K.toFixed(5)})`,
  };
}

function pathDataAt(glyph, x, baselineY, fontSize) {
  const p = glyph.getPath(x, baselineY, fontSize);
  // Pre-round to avoid opentype.js NaN formatting on floating-point artifacts.
  const r = (v) => v === undefined ? v : Math.round(v * 1000) / 1000;
  for (const cmd of p.commands) {
    cmd.x  = r(cmd.x);  cmd.y  = r(cmd.y);
    cmd.x1 = r(cmd.x1); cmd.y1 = r(cmd.y1);
    cmd.x2 = r(cmd.x2); cmd.y2 = r(cmd.y2);
  }
  return p.toPathData(3);
}

function textAdvance(font, text, fontSize) {
  let width = 0;
  for (const ch of text) width += glyphMetrics(font, ch, fontSize).advance;
  return width;
}

function textPathData(font, text, startX, baselineY, fontSize) {
  const parts = [];
  let x = startX;
  for (const ch of text) {
    const met = glyphMetrics(font, ch, fontSize);
    parts.push(pathDataAt(met.glyph, x, baselineY, fontSize));
    x += met.advance;
  }
  return parts.join(' ');
}

// ── SVG element builders — centralize precision; attrStr skips null/undefined ──
const round3 = (v) => Math.round(v * 1000) / 1000;

function attrStr(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function pathEl(d, { fill, opacity, transform, className } = {}) {
  return `<path ${attrStr({ d, fill, opacity, transform, class: className })}/>`;
}

function rectEl({ x, y, w, h }, { fill, opacity, transform } = {}) {
  const a = {};
  if (x !== undefined) a.x = round3(x);
  if (y !== undefined) a.y = round3(y);
  a.width  = round3(w);
  a.height = round3(h);
  a.fill = fill;
  a.opacity = opacity;
  a.transform = transform;
  return `<rect ${attrStr(a)}/>`;
}

// Layered SVG: style → bg → texture → skyline → mark → tagline (fixed z-order).
function composition({ vbW, vbH, ariaLabel, style, bg, texture, skyline, mark, tagline }) {
  const body = [style, bg, texture, skyline, mark, tagline].map((x) => x || '').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="${ariaLabel}">${body}</svg>`;
}

function styleBlock({ colorMode }) {
  if (colorMode === 'auto') {
    return `<style>.g{fill:${COLOR.dark}}@media(prefers-color-scheme:dark){.g{fill:${COLOR.light}}}</style>`;
  }
  const fill = colorMode === 'dark' ? COLOR.light : COLOR.dark;
  return `<style>.g{fill:${fill}}</style>`;
}

// ─── Wordmark — bracketed DoubleTrends + rust bar ────────────────────────────

function framedWordmarkPieces(font, text, fontSize, baselineY, vbW) {
  const textW = textAdvance(font, text, fontSize);
  const lMet = glyphMetrics(font, '[', fontSize);
  const rMet = glyphMetrics(font, ']', fontSize);
  const totalW = lMet.advance + textW + rMet.advance;
  const startX = (vbW - totalW) / 2;

  const lX = startX;
  const textX = lX + lMet.advance;
  const rX = textX + textW;

  const accentText  = text.slice(0, WORDMARK_ACCENT_TEXT.length);
  const baseText    = text.slice(WORDMARK_ACCENT_TEXT.length);
  const accentWidth = textAdvance(font, accentText, fontSize);
  const accentPath  = textPathData(font, accentText, textX, baselineY, fontSize);
  const basePath    = textPathData(font, baseText, textX + accentWidth, baselineY, fontSize);
  const lPath = pathDataAt(lMet.glyph, lX, baselineY, fontSize);
  const rPath = pathDataAt(rMet.glyph, rX, baselineY, fontSize);

  const lastChar = text[text.length - 1];
  const prefixText = text.slice(0, -1);
  const lastMet = glyphMetrics(font, lastChar, fontSize);
  const lastX = textX + textAdvance(font, prefixText, fontSize);
  const lastRight = lastX + lastMet.x2;
  const rLeft = rX + rMet.x1;
  const gapMid = (lastRight + rLeft) / 2;
  const barX = lastX + (lastMet.advance / 2);
  const barW = gapMid - barX;
  const barH = fontSize * (BAR_HEIGHT / 26);
  const letters = letterRange(font, fontSize, baselineY);
  const barY = letters.bottom - barH;

  const { K, ty, transform } = bracketScale(font, fontSize, baselineY);
  const geom = extractBracketGeometry(font, '[', fontSize);
  const bracketOuterTop    = K * (baselineY + geom.outerTop) + ty;
  const bracketOuterBottom = K * (baselineY + geom.outerBottom) + ty;

  return {
    accentPath,
    basePath,
    lPath,
    rPath,
    bracketTransform: transform,
    bar: { x: barX, y: barY, w: barW, h: barH },
    bounds: {
      left:   Math.min(lX + lMet.x1, textX, rX + rMet.x1, barX),
      top:    Math.min(letters.top, bracketOuterTop, barY),
      right:  Math.max(textX + textW, rX + rMet.x2, barX + barW),
      bottom: Math.max(letters.bottom, bracketOuterBottom, barY + barH),
    },
  };
}

function primaryWordmarkPieces(font, fontSize, baselineY, vbW) {
  return framedWordmarkPieces(font, WORDMARK_TEXT, fontSize, baselineY, vbW);
}

// Render wordmark paths + bar. paint: {fill} for inline color or {className} for CSS.
// dx/dy shift the group when pieces were computed in a temp canvas.
function wordmarkFragment(pieces, paint, dx = 0, dy = 0) {
  const { accentPath, basePath, lPath, rPath, bracketTransform, bar } = pieces;
  const groupAttrs = paint.className ? { class: paint.className } : { fill: paint.fill };
  const guts =
    pathEl(accentPath, { fill: COLOR.rust }) +
    `<g ${attrStr(groupAttrs)}>${pathEl(basePath)}` +
      `<g transform="${bracketTransform}">${pathEl(`${lPath} ${rPath}`)}</g>` +
    `</g>` +
    rectEl(bar, { fill: COLOR.rust });
  return (dx || dy)
    ? `<g transform="translate(${round3(dx)} ${round3(dy)})">${guts}</g>`
    : guts;
}

// Render the wordmark anchored at top-left (leftX, topY) by shifting temp-canvas pieces.
function placedWordmark(font, fontSize, leftX, topY, glyphColor) {
  const tempVbW = fontSize * 20;
  const pieces = primaryWordmarkPieces(font, fontSize, 1000, tempVbW);
  const dx = leftX - pieces.bounds.left;
  const dy = topY  - pieces.bounds.top;
  return {
    fragment: wordmarkFragment(pieces, { fill: glyphColor }, dx, dy),
    width:  pieces.bounds.right  - pieces.bounds.left,
    height: pieces.bounds.bottom - pieces.bounds.top,
  };
}

function buildWordmark(font, { colorMode = 'auto' } = {}) {
  const pieces = primaryWordmarkPieces(font, 74, 1000, 74 * 20);
  const vbW = pieces.bounds.right  - pieces.bounds.left;
  const vbH = pieces.bounds.bottom - pieces.bounds.top;
  return composition({
    vbW, vbH,
    ariaLabel: WORDMARK_TEXT,
    style: styleBlock({ colorMode }),
    mark: wordmarkFragment(pieces, { className: 'g' }, -pieces.bounds.left, -pieces.bounds.top),
  });
}

// ─── Favicon — [ ] mark, no letters ──────────────────────────────────────────

function faviconPieces(font) {
  const fontSize  = 24;
  const baselineY = 24;
  const vbW = 32, vbH = 32;

  const lMet = glyphMetrics(font, '[', fontSize);
  const rMet = glyphMetrics(font, ']', fontSize);

  const lX = 6  - lMet.advance / 2;
  const rX = 26 - rMet.advance / 2;
  const lPath = pathDataAt(lMet.glyph, lX, baselineY, fontSize);
  const rPath = pathDataAt(rMet.glyph, rX, baselineY, fontSize);

  const gap  = 1.0;
  const barX = lX + lMet.x2 + gap;
  const barW = (rX + rMet.x1) - barX - gap;
  const letters = letterRange(font, fontSize, baselineY);
  const barY = letters.bottom - BAR_HEIGHT;

  const { K, ty, transform } = bracketScale(font, fontSize, baselineY);
  const geom = extractBracketGeometry(font, '[', fontSize);

  const xMin = lX + lMet.x1;
  const xMax = rX + rMet.x2;
  const yMin = Math.min(K * (baselineY + geom.outerTop) + ty, barY);
  const yMax = Math.max(K * (baselineY + geom.outerBottom) + ty, barY + BAR_HEIGHT);

  return {
    lPath, rPath,
    bracketTransform: transform,
    bar: { x: barX, y: barY, w: barW, h: BAR_HEIGHT },
    bounds: { xMin, xMax, yMin, yMax },
    vbW, vbH,
  };
}

// scale: uniform shrink; fillViewBox: scale up to fill edge-to-edge; bgColor: tile bg.
function buildFavicon(font, { colorMode = 'auto', scale = 1, fillViewBox = false, bgColor } = {}) {
  const { lPath, rPath, bracketTransform, bar, bounds, vbW, vbH } = faviconPieces(font);

  const cx = vbW / 2, cy = vbH / 2;
  const dx = cx - (bounds.xMin + bounds.xMax) / 2;
  const dy = cy - (bounds.yMin + bounds.yMax) / 2;
  const fillScale = fillViewBox
    ? Math.min(vbW / (bounds.xMax - bounds.xMin), vbH / (bounds.yMax - bounds.yMin))
    : 1;
  const finalScale = scale * fillScale;

  const artwork =
    `<g transform="translate(${round3(dx)} ${round3(dy)})">` +
      `<g class="g" transform="${bracketTransform}">${pathEl(`${lPath} ${rPath}`)}</g>` +
      rectEl(bar, { fill: COLOR.rust }) +
    `</g>`;
  const mark = finalScale === 1
    ? artwork
    : `<g transform="translate(${cx} ${cy}) scale(${finalScale.toFixed(5)}) translate(${-cx} ${-cy})">${artwork}</g>`;

  return composition({
    vbW, vbH,
    ariaLabel: 'DoubleTrends',
    style: styleBlock({ colorMode }),
    bg: bgColor ? rectEl({ w: vbW, h: vbH }, { fill: bgColor }) : undefined,
    mark,
  });
}

// ─── NDJSON texture — shared by OG and banner ────────────────────────────────
// Values are illustrative, not real signals.
const NDJSON_TEXTURE_LINES = [
  '{"id":"sig_2020_03_23_spx","ts":"2020-03-23T14:32:00Z","sym":"SPX","px":2237.40,"type":"double_bottom","conf":0.87,"dd":-34.1}',
  '{"id":"sig_2020_03_26_spx","ts":"2020-03-26T09:00:00Z","sym":"SPX","px":2475.56,"type":"trend_reset","conf":0.92,"dd":-27.0}',
  '{"id":"sig_2020_04_07_ndx","ts":"2020-04-07T16:00:00Z","sym":"NDX","px":7903.10,"type":"trend_reset","conf":0.89,"dd":-22.4}',
  '{"id":"sig_2020_10_30_btc","ts":"2020-10-30T16:00:00Z","sym":"BTC","px":13795,"type":"vol_compression","conf":0.91,"atr":1.8}',
  '{"id":"sig_2020_11_05_btc","ts":"2020-11-05T16:00:00Z","sym":"BTC","px":15462,"type":"breakout","conf":0.85,"vol_z":2.7}',
  '{"id":"sig_2021_05_19_eth","ts":"2021-05-19T14:00:00Z","sym":"ETH","px":2436.10,"type":"double_bottom","conf":0.83,"dd":-44.2}',
  '{"id":"sig_2021_07_20_spx","ts":"2021-07-20T14:00:00Z","sym":"SPX","px":4258.49,"type":"vol_compression","conf":0.78,"atr":0.7}',
  '{"id":"sig_2022_01_24_ndx","ts":"2022-01-24T15:00:00Z","sym":"NDX","px":13909.31,"type":"double_bottom","conf":0.81,"dd":-15.6}',
  '{"id":"sig_2022_06_16_spx","ts":"2022-06-16T15:00:00Z","sym":"SPX","px":3666.77,"type":"double_bottom","conf":0.86,"dd":-23.6}',
  '{"id":"sig_2022_06_18_btc","ts":"2022-06-18T18:00:00Z","sym":"BTC","px":17604,"type":"capitulation","conf":0.94,"dd":-74.0}',
  '{"id":"sig_2022_10_13_spx","ts":"2022-10-13T15:00:00Z","sym":"SPX","px":3491.58,"type":"trend_reset","conf":0.88,"vol_z":3.1}',
  '{"id":"sig_2022_11_21_btc","ts":"2022-11-21T18:00:00Z","sym":"BTC","px":15479,"type":"double_bottom","conf":0.92,"dd":-77.1}',
  '{"id":"sig_2023_03_16_eth","ts":"2023-03-16T14:00:00Z","sym":"ETH","px":1730.20,"type":"trend_reset","conf":0.79,"dd":-65.8}',
  '{"id":"sig_2023_10_27_spx","ts":"2023-10-27T15:00:00Z","sym":"SPX","px":4117.37,"type":"double_bottom","conf":0.84,"dd":-10.3}',
  '{"id":"sig_2024_04_19_btc","ts":"2024-04-19T18:00:00Z","sym":"BTC","px":63821,"type":"vol_compression","conf":0.77,"atr":2.1}',
  '{"id":"sig_2024_08_05_ndx","ts":"2024-08-05T14:00:00Z","sym":"NDX","px":17996.04,"type":"capitulation","conf":0.89,"dd":-14.8}',
  '{"id":"sig_2024_09_19_eth","ts":"2024-09-19T11:24:00Z","sym":"ETH","px":2538.00,"type":"double_bottom","conf":0.84,"dd":-28.7}',
  '{"id":"sig_2024_09_30_eth","ts":"2024-09-30T09:00:00Z","sym":"ETH","px":2710.40,"type":"trend_reset","conf":0.91,"vol_z":2.2}',
  '{"id":"sig_2025_01_13_spx","ts":"2025-01-13T15:00:00Z","sym":"SPX","px":5836.22,"type":"vol_compression","conf":0.76,"atr":0.9}',
  '{"id":"sig_2025_03_10_eth","ts":"2025-03-10T14:00:00Z","sym":"ETH","px":2110.85,"type":"capitulation","conf":0.93,"dd":-58.4}',
  '{"id":"sig_2025_04_07_spx","ts":"2025-04-07T15:00:00Z","sym":"SPX","px":5062.25,"type":"double_bottom","conf":0.87,"dd":-18.9}',
  '{"id":"sig_2025_08_05_btc","ts":"2025-08-05T18:00:00Z","sym":"BTC","px":114820,"type":"trend_reset","conf":0.85,"vol_z":2.4}',
  '{"id":"sig_2026_02_28_ndx","ts":"2026-02-28T15:00:00Z","sym":"NDX","px":21456.32,"type":"vol_compression","conf":0.79,"atr":1.1}',
  '{"id":"sig_2026_05_22_spx","ts":"2026-05-22T15:00:00Z","sym":"SPX","px":6234.78,"type":"double_bottom","conf":0.82,"dd":-12.6}',
  '{"id":"sig_2026_06_03_eth","ts":"2026-06-03T11:00:00Z","sym":"ETH","px":3417.92,"type":"breakout","conf":0.86,"vol_z":2.6}',
  '{"id":"sig_2026_06_09_btc","ts":"2026-06-09T18:00:00Z","sym":"BTC","px":91247,"type":"vol_compression","conf":0.81,"atr":1.4}',
];

function renderNdjsonTexture(font, cols, vbH) {
  const size = 12, lineH = 14, startY = 8;
  const numLines = Math.floor((vbH - startY) / lineH);
  let out = '';
  for (const col of cols) {
    for (let i = 0; i < numLines; i++) {
      const line = NDJSON_TEXTURE_LINES[(i + col.rotate) % NDJSON_TEXTURE_LINES.length];
      const y = startY + (i + 1) * lineH;
      out += pathEl(textPathData(font, line, col.x, y, size), { fill: COLOR.dark, opacity: 0.08 });
    }
  }
  return out;
}

// ─── Rust-bar skyline — shared by OG and banner ──────────────────────────────
function renderSkyline({ heights, slL, slR, baseY, opacityHeightRange = 200 }) {
  const slot = (slR - slL) / heights.length;
  const barW = slot * 0.45;
  return heights.map((h, i) => {
    const x  = slL + i * slot + (slot - barW) / 2;
    const op = round3(0.42 + (h / opacityHeightRange) * 0.45);
    return rectEl({ x, y: baseY - h, w: barW, h }, { fill: COLOR.rust, opacity: op });
  }).join('');
}

// ─── OG image — 1200×630 social card ─────────────────────────────────────────
function buildOgImage(font) {
  const vbW = 1200, vbH = 630;
  const fontSize = 110, baselineY = 220;
  const pieces = primaryWordmarkPieces(font, fontSize, baselineY, vbW);

  const wmWidth = pieces.bounds.right - pieces.bounds.left;
  const taglineSize = wmWidth / textAdvance(font, OG_TAGLINE, 1);
  const taglinePath = textPathData(font, OG_TAGLINE, pieces.bounds.left, 290, taglineSize);

  const skyline = renderSkyline({
    heights: [50, 88, 66, 134, 84, 162, 110, 188, 146, 117, 84, 142, 100, 70],
    slL: (vbW - 900) / 2, slR: (vbW + 900) / 2, baseY: 560,
  });

  const charWidth = 12 * 0.6;
  const maxLineLen = Math.max(...NDJSON_TEXTURE_LINES.map((l) => l.length));
  const texture = renderNdjsonTexture(font, [{ x: Math.round((vbW - maxLineLen * charWidth) / 2), rotate: 0 }], vbH);

  return composition({
    vbW, vbH,
    ariaLabel: `${WORDMARK_TEXT} — ${OG_TAGLINE}`,
    bg:      rectEl({ w: vbW, h: vbH }, { fill: COLOR.light }),
    texture,
    skyline,
    mark:    wordmarkFragment(pieces, { fill: COLOR.dark }),
    tagline: pathEl(taglinePath, { fill: COLOR.dark, opacity: 0.55 }),
  });
}

// ─── Banner — wide social header (2080×520, 4:1) ─────────────────────────────
// Oversized so it crops freely to any platform (LinkedIn 1584×396, X 1500×500, etc.).
const BANNER_W = 2080;
const BANNER_H = 520;
const BANNER_PAD_X = 234;

function buildBanner(font) {
  const wmSize = 107, wmTop = 180;
  const wm = placedWordmark(font, wmSize, BANNER_PAD_X, wmTop, COLOR.dark);

  const tagSize = wm.width / textAdvance(font, OG_TAGLINE, 1);
  const taglinePath = textPathData(font, OG_TAGLINE, BANNER_PAD_X, wmTop + wm.height + 36, tagSize);

  const skyline = renderSkyline({
    heights: [65, 114, 86, 174, 109, 211, 143, 244, 190, 152, 109, 184, 130, 91],
    slL: 1170, slR: BANNER_W - BANNER_PAD_X, baseY: 414, opacityHeightRange: 260,
  });

  const texture = renderNdjsonTexture(font, [
    { x: 20,   rotate: 0  },
    { x: 1170, rotate: 13 },
  ], BANNER_H);

  return composition({
    vbW: BANNER_W, vbH: BANNER_H,
    ariaLabel: `${WORDMARK_TEXT} banner`,
    bg:      rectEl({ w: BANNER_W, h: BANNER_H }, { fill: COLOR.light }),
    texture,
    skyline,
    mark:    wm.fragment,
    tagline: pathEl(taglinePath, { fill: COLOR.dark, opacity: 0.55 }),
  });
}

// ─── Rasterize ───────────────────────────────────────────────────────────────
async function rasterizeSquare(svgString, outPath, size) {
  await sharp(Buffer.from(svgString))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

async function rasterizeWidth(svgString, outPath, targetWidth) {
  await sharp(Buffer.from(svgString)).resize({ width: targetWidth }).png().toFile(outPath);
}

async function rasterizeNative(svgString, outPath) {
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
}

// ─── Family builders ─────────────────────────────────────────────────────────
async function buildFaviconFamily(font) {
  const logoAuto = buildFavicon(font, { colorMode: 'auto', fillViewBox: true });
  fs.writeFileSync(path.join(OUT_DIR, 'logo.svg'), logoAuto + '\n');
  console.log('✓  logo.svg');

  const logoLight = buildFavicon(font, { colorMode: 'light', fillViewBox: true, bgColor: COLOR.light, scale: LOGO_TILE_ARTWORK_SCALE });
  const logoDark  = buildFavicon(font, { colorMode: 'dark',  fillViewBox: true, bgColor: COLOR.dark,  scale: LOGO_TILE_ARTWORK_SCALE });
  await rasterizeSquare(logoLight, path.join(OUT_DIR, 'logo-light.png'), 512);
  console.log('✓  logo-light.png');
  await rasterizeSquare(logoDark,  path.join(OUT_DIR, 'logo-dark.png'),  512);
  console.log('✓  logo-dark.png');

  const favicon = buildFavicon(font, { colorMode: 'light' });
  await rasterizeSquare(favicon, path.join(OUT_DIR, 'favicon-32.png'),  32);
  console.log('✓  favicon-32.png');
  await rasterizeSquare(favicon, path.join(OUT_DIR, 'favicon-180.png'), 180);
  console.log('✓  favicon-180.png');
}

async function buildWordmarkFamily(font) {
  const wmAuto  = buildWordmark(font, { colorMode: 'auto'  });
  const wmLight = buildWordmark(font, { colorMode: 'light' });
  const wmDark  = buildWordmark(font, { colorMode: 'dark'  });
  fs.writeFileSync(path.join(OUT_DIR, 'wordmark.svg'), wmAuto + '\n');
  console.log('✓  wordmark.svg');
  await rasterizeWidth(wmLight, path.join(OUT_DIR, 'wordmark-light.png'), 1024);
  console.log('✓  wordmark-light.png');
  await rasterizeWidth(wmDark,  path.join(OUT_DIR, 'wordmark-dark.png'),  1024);
  console.log('✓  wordmark-dark.png');

  const ogSvg = buildOgImage(font);
  fs.writeFileSync(path.join(OUT_DIR, 'og-image.svg'), ogSvg + '\n');
  console.log('✓  og-image.svg');
  await rasterizeNative(ogSvg, path.join(OUT_DIR, 'og-image.png'));
  console.log('✓  og-image.png');

  const bannerSvg = buildBanner(font);
  fs.writeFileSync(path.join(OUT_DIR, 'banner.svg'), bannerSvg + '\n');
  console.log('✓  banner.svg');
  await rasterizeNative(bannerSvg, path.join(OUT_DIR, 'banner.png'));
  console.log('✓  banner.png');
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const font = loadFont();
  await buildFaviconFamily(font);
  await buildWordmarkFamily(font);
  console.log(`\nBrand assets refreshed in ${path.relative(__dirname, OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
