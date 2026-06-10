/**
 * build-brand.js
 *
 * Generates the DoubleTrends brand asset set in public/brand/ from a single
 * source of truth — JetBrains Mono Bold + rust bar geometry. Outputs are
 * organized into two families:
 *
 *   Logo family (buildLogoFamily) — the [ ] mark and its derivatives.
 *     cds-logo.svg               auto color (prefers-color-scheme) · transparent
 *     cds-logo-light.png         512×512 · dark glyphs on cream brand bg
 *     cds-logo-dark.png          512×512 · light glyphs on navy brand bg
 *     cds-favicon-32.png         32×32 · dark glyphs · legacy favicon
 *     cds-favicon-180.png        180×180 · dark glyphs · Apple touch icon
 *
 *   Wordmark family (buildWordmarkFamily) — bracketed text + social outputs.
 *     cds-wordmark.svg           600×600 · auto color
 *     cds-wordmark-light.png     1024×1024 · dark glyphs
 *     cds-wordmark-dark.png      1024×1024 · light glyphs
 *     og-image.svg / .png        1200×630 social card
 *     cds-banner.svg / .png      2080×520 wide social banner (4:1)
 *
 * Geometry rules (locked):
 *   wordmark — bar left = last-letter cell center · bar right = midpoint of
 *              visible gap between last letter and ] · bar bottom = letter
 *              visual bottom (S overshoot)
 *   logo     — bar centered between [ and ] glyphs · same bar-bottom rule
 *   brackets — vertically scaled (uniform K) so inner cavity = full letter range
 *
 * Composition pipeline:
 *   pathEl/rectEl    — SVG element builders that centralize numeric precision.
 *   composition()    — assembles SVG layers in fixed z-order
 *                       (style → bg → texture → skyline → mark → tagline).
 *   wordmarkFragment — shared by every asset that displays the brand mark.
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
const BAR_LIFT   = 4;
const WORDMARK_TEXT = 'DoubleTrends';
const WORDMARK_ACCENT_TEXT = 'Double';
const OG_TAGLINE = 'DoubleTrends L.L.C. · Quantitative Research · Market Education';
const WORDMARK_BAR_WIDTH_RATIO = 0.36;

// Inner-art scale for the brand-color logo tiles. The background rect always
// fills the full viewBox, but the artwork shrinks to ~70% so that bracket
// corners stay inside the inscribed circle of the tile (the largest square
// inside a circle has side = diameter / √2 ≈ 0.707). Anything larger and a
// circular crop (e.g. Stripe checkout brand icon, Telegram avatar) clips
// bracket corners.
const LOGO_TILE_ARTWORK_SCALE = 0.7;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadFont() {
  const buf = fs.readFileSync(FONT_PATH);
  // opentype.parse wants an ArrayBuffer; convert from the Node Buffer's underlying slice
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
    // Glyph-local edges (relative to the pen position).
    // Font space y is UP, SVG y is DOWN. So bbox.y1 (font-space min y, often
    // negative for round-bottom overshoot like C/O/S) maps to a y BELOW the
    // baseline in SVG. visualBottomFromBaseline > 0 ⇒ glyph extends past baseline.
    x1: bbox.x1 * scale,
    x2: bbox.x2 * scale,
    visualTopFromBaseline:    bbox.y2 * scale,   // height of glyph above baseline (cap + overshoot top)
    visualBottomFromBaseline: -bbox.y1 * scale,  // depth below baseline (overshoot bottom)
  };
}

// Extract the 4 distinct y levels of a [ / ] bracket — outer top, inner top,
// inner bottom, outer bottom — by walking the rendered path commands. Used to
// scale the brackets so their *inner* cavity matches the letter range.
function extractBracketGeometry(font, ch, fontSize) {
  const glyph = font.charToGlyph(ch);
  const p = glyph.getPath(0, 0, fontSize);  // rendered in SVG-space (y down)
  const ys = [];
  for (const cmd of p.commands) {
    if (cmd.y  !== undefined) ys.push(cmd.y);
    if (cmd.y1 !== undefined) ys.push(cmd.y1);
    if (cmd.y2 !== undefined) ys.push(cmd.y2);
  }
  // Cluster nearby y values (rounding errors / tiny corner curves)
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

// Letter height in viewBox units, using S (has overshoot top & bottom — the
// most extreme letter in CDS). Returns { top, bottom, height, center } in SVG y.
function letterRange(font, fontSize, baselineY) {
  const s = glyphMetrics(font, 'S', fontSize);
  const top    = baselineY - s.visualTopFromBaseline;
  const bottom = baselineY + s.visualBottomFromBaseline;
  return { top, bottom, height: bottom - top, center: (top + bottom) / 2 };
}

// Compute the vertical transform that makes a bracket's *inner* cavity coincide
// exactly with the letter range — inner top → letters.top, inner bottom →
// letters.bottom. Done as scale-then-translate. We can't just scale around the
// letter center because the bracket's own inner cavity isn't centered on the
// letter range (brackets are designed around cap+baseline; letter range here
// includes S overshoot top *and* bottom).
function bracketScale(font, fontSize, baselineY) {
  const geom    = extractBracketGeometry(font, '[', fontSize);
  const letters = letterRange(font, fontSize, baselineY);
  const K = letters.height / geom.innerHeight;

  // Where the bracket's inner top sits in the rendered SVG before transform:
  // geom values come from getPath(0, 0) — relative to baseline at y=0. After
  // rendering at pathDataAt(_, _, baselineY, _), all y values shift by baselineY.
  const innerTopRendered = baselineY + geom.innerTop;

  // SVG transform="A B" applies B first, then A. We want: y → K*y + ty.
  // So inner top: K * innerTopRendered + ty = letters.top  ⇒  ty = letters.top − K * innerTopRendered.
  const ty = letters.top - K * innerTopRendered;

  return {
    K,
    ty,
    transform: `translate(0 ${ty.toFixed(4)}) scale(1 ${K.toFixed(5)})`,
  };
}

function pathDataAt(glyph, x, baselineY, fontSize) {
  const p = glyph.getPath(x, baselineY, fontSize);
  // opentype.js's toPathData formatter has an edge case where numbers like
  // 360.00000000000006 (compound floating-point artifacts) format to "NaN".
  // Pre-round every command coordinate to 3 decimals so tiny precision crud
  // never reaches the formatter.
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

// ── SVG element builders ──
// Centralize the numeric precision so .toFixed(3) doesn't get sprinkled across
// every callsite. attrStr filters empty / null / undefined so consumers can
// pass partial attribute objects without ceremony.
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

function svgEnvelope({ vbW, vbH, ariaLabel, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="${ariaLabel}">${body}</svg>`;
}

// Compose a layered SVG. Named slots render in fixed z-order: style → bg →
// texture → skyline → mark → tagline. Any slot omitted (undefined) is skipped.
function composition({ vbW, vbH, ariaLabel, style, bg, texture, skyline, mark, tagline }) {
  const body = [style, bg, texture, skyline, mark, tagline]
    .map((x) => x || '')
    .join('');
  return svgEnvelope({ vbW, vbH, ariaLabel, body });
}

function styleBlock({ colorMode }) {
  // colorMode: 'auto' → prefers-color-scheme switch; 'light' → dark glyphs;
  // 'dark' → light glyphs.
  if (colorMode === 'auto') {
    return `<style>.g{fill:${COLOR.dark}}@media(prefers-color-scheme:dark){.g{fill:${COLOR.light}}}</style>`;
  }
  const fill = colorMode === 'dark' ? COLOR.light : COLOR.dark;
  return `<style>.g{fill:${fill}}</style>`;
}

// ─── Wordmark — bracketed DoubleTrends + rust bar ────────────────────────────

// Build the logo's path/bar/transform pieces for an arbitrary canvas + baseline.
// Bar height is sized to BAR_HEIGHT at fontSize 26 (the logo base size).
function logoPieces(font, fontSize, baselineY, vbW) {
  const cellW  = glyphMetrics(font, '[', fontSize).advance;
  const totalW = cellW * 5;
  const startX = (vbW - totalW) / 2;

  const cdsPaths = ['C', 'D', 'S'].map((ch, i) => {
    const x = startX + (i + 1) * cellW;
    return pathDataAt(font.charToGlyph(ch), x, baselineY, fontSize);
  });

  const lX = startX + 0 * cellW;
  const rX = startX + 4 * cellW;
  const lPath = pathDataAt(font.charToGlyph('['), lX, baselineY, fontSize);
  const rPath = pathDataAt(font.charToGlyph(']'), rX, baselineY, fontSize);

  const sCellX = startX + 3 * cellW;
  const bCellX = startX + 4 * cellW;
  const sMet   = glyphMetrics(font, 'S', fontSize);
  const bMet   = glyphMetrics(font, ']', fontSize);
  const sRight = sCellX + sMet.x2;
  const bLeft  = bCellX + bMet.x1;
  const gapMid = (sRight + bLeft) / 2;
  const barX   = sCellX + cellW / 2;
  const barW   = gapMid - barX;
  const barH   = fontSize * (BAR_HEIGHT / 26);
  const letters = letterRange(font, fontSize, baselineY);
  const barY   = letters.bottom - barH;

  const { K, ty, transform } = bracketScale(font, fontSize, baselineY);

  const glyphXs = [
    { ch: '[', x: lX },
    { ch: 'C', x: startX + 1 * cellW },
    { ch: 'D', x: startX + 2 * cellW },
    { ch: 'S', x: startX + 3 * cellW },
    { ch: ']', x: rX },
  ].map(({ ch, x }) => {
    const met = glyphMetrics(font, ch, fontSize);
    return { left: x + met.x1, right: x + met.x2 };
  });

  const geom = extractBracketGeometry(font, '[', fontSize);
  const bracketOuterTop = K * (baselineY + geom.outerTop) + ty;
  const bracketOuterBottom = K * (baselineY + geom.outerBottom) + ty;

  return {
    cdsPaths, lPath, rPath,
    bracketTransform: transform,
    bar: { x: barX, y: barY, w: barW, h: barH },
    bounds: {
      left: Math.min(...glyphXs.map((g) => g.left), barX),
      top: Math.min(letters.top, bracketOuterTop, barY),
      right: Math.max(...glyphXs.map((g) => g.right), barX + barW),
      bottom: Math.max(letters.bottom, bracketOuterBottom, barY + barH),
    },
  };
}

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
      left: Math.min(lX + lMet.x1, textX, rX + rMet.x1, barX),
      top: Math.min(letters.top, bracketOuterTop, barY),
      right: Math.max(textX + textW, rX + rMet.x2, barX + barW),
      bottom: Math.max(letters.bottom, bracketOuterBottom, barY + barH),
    },
  };
}

function primaryWordmarkPieces(font, fontSize, baselineY, vbW) {
  return framedWordmarkPieces(font, WORDMARK_TEXT, fontSize, baselineY, vbW);
}

function fitPrimaryWordmarkFontSize(font, initialFontSize, vbW, paddingX) {
  const initialPieces = primaryWordmarkPieces(font, initialFontSize, 0, vbW);
  const initialWidth = initialPieces.bounds.right - initialPieces.bounds.left;
  const targetWidth = vbW - paddingX * 2;
  if (initialWidth <= targetWidth) return initialFontSize;
  return initialFontSize * (targetWidth / initialWidth);
}

// Compute baselineY so the *full* wordmark height (letter visual top → letter
// visual bottom, plus K·armThickness on each side from the scaled brackets)
// is vertically centered in vbH. The wordmark's vertical center is NOT the
// baseline — cap + S overshoot top is much taller than S overshoot bottom,
// so the visual center sits below the baseline.
function centeredBaseline(font, fontSize, vbH) {
  const sMet = glyphMetrics(font, 'S', fontSize);
  const geom = extractBracketGeometry(font, '[', fontSize);
  const letterH = sMet.visualTopFromBaseline + sMet.visualBottomFromBaseline;
  const K       = letterH / geom.innerHeight;
  const armExt  = K * geom.armThickness;
  const fullH   = letterH + 2 * armExt;
  const topY    = (vbH - fullH) / 2;
  return topY + sMet.visualTopFromBaseline + armExt;
}

// Render the wordmark's path + bar elements. `paint` selects how the glyph
// color is delivered: {fill: '#...'} for inline color, or {className: 'g'} for
// CSS-driven (paired with a styleBlock). dx/dy shift the whole group — useful
// when the pieces were computed in an oversized temp canvas and now need to
// land at a target position.
function wordmarkFragment(pieces, paint, dx = 0, dy = 0) {
  const { accentPath, basePath, lPath, rPath, bracketTransform, bar } = pieces;
  const groupAttrs = paint.className
    ? { class: paint.className }
    : { fill: paint.fill };
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

// Render the wordmark anchored at top-left (leftX, topY). The pieces are
// computed centered in a generous temp canvas, then shifted into place.
function placedWordmark(font, fontSize, leftX, topY, glyphColor) {
  const tempVbW = fontSize * 20;  // wordmark width is ~8.4 × fontSize; 20× is comfortable
  const pieces = primaryWordmarkPieces(font, fontSize, 1000, tempVbW);
  const dx = leftX - pieces.bounds.left;
  const dy = topY  - pieces.bounds.top;
  return {
    fragment: wordmarkFragment(pieces, { fill: glyphColor }, dx, dy),
    width:  pieces.bounds.right  - pieces.bounds.left,
    height: pieces.bounds.bottom - pieces.bounds.top,
  };
}

// Wordmark — [DoubleTrends] + rust bar, centered in a square canvas for easy
// cropping (Telegram channel, app icon, profile picture, etc.).
function buildWordmark(font, { colorMode } = { colorMode: 'auto' }) {
  const vbSize   = 600;
  const fontSize = fitPrimaryWordmarkFontSize(font, 74, vbSize, 28);
  const baselineY = centeredBaseline(font, fontSize, vbSize);
  const pieces = primaryWordmarkPieces(font, fontSize, baselineY, vbSize);
  return composition({
    vbW: vbSize, vbH: vbSize,
    ariaLabel: WORDMARK_TEXT,
    style: styleBlock({ colorMode }),
    mark: wordmarkFragment(pieces, { className: 'g' }),
  });
}

// ─── Logo — [ ] mark, no letters ─────────────────────────────────────────────
// Options:
//   scale         — uniform shrink of artwork around viewBox center.
//   fillViewBox   — true ⇒ scale artwork up so it fills the viewBox edge-to-edge
//                   (no padding around the brackets). Favicons keep natural geometry.
//   bgColor       — optional solid background fill behind the artwork (brand tile).
function buildLogo(font, { colorMode, scale = 1, fillViewBox = false, bgColor } = { colorMode: 'auto' }) {
  const fontSize   = 24;
  const vbW = 32, vbH = 32;
  const baselineY  = 24;

  const lMet = glyphMetrics(font, '[', fontSize);
  const rMet = glyphMetrics(font, ']', fontSize);

  // Position brackets near the edges, centered around cell centers x=6 and x=26
  const leftCenter  = 6;
  const rightCenter = 26;
  const leftX  = leftCenter  - lMet.advance / 2;
  const rightX = rightCenter - rMet.advance / 2;
  const leftPath  = pathDataAt(lMet.glyph,  leftX,  baselineY, fontSize);
  const rightPath = pathDataAt(rMet.glyph, rightX, baselineY, fontSize);

  // Bar: from just right of [ glyph to just left of ] glyph, with a small visual gap
  const padding = 1.0;
  const barX = leftX + lMet.x2 + padding;
  const barW = (rightX + rMet.x1) - barX - padding;
  const letters = letterRange(font, fontSize, baselineY);
  const barY = letters.bottom - BAR_HEIGHT;

  const { K, ty, transform } = bracketScale(font, fontSize, baselineY);

  // Artwork bbox in viewBox coords — used by fillViewBox to compute the scale-up factor.
  const geom = extractBracketGeometry(font, '[', fontSize);
  const xMin = leftX + lMet.x1;
  const xMax = rightX + rMet.x2;
  const yMin = Math.min(K * (baselineY + geom.outerTop) + ty, barY);
  const yMax = Math.max(K * (baselineY + geom.outerBottom) + ty, barY + BAR_HEIGHT);
  const dx = (vbW / 2) - (xMin + xMax) / 2;
  const dy = (vbH / 2) - (yMin + yMax) / 2;
  const fillScale = fillViewBox
    ? Math.min(vbW / (xMax - xMin), vbH / (yMax - yMin))
    : 1;
  const finalScale = scale * fillScale;

  const cx = vbW / 2, cy = vbH / 2;
  const artwork =
    `<g transform="translate(${round3(dx)} ${round3(dy)})">` +
      `<g class="g" transform="${transform}">${pathEl(`${leftPath} ${rightPath}`)}</g>` +
      rectEl({ x: barX, y: barY, w: barW, h: BAR_HEIGHT }, { fill: COLOR.rust }) +
    `</g>`;
  const mark = finalScale === 1
    ? artwork
    : `<g transform="translate(${cx} ${cy}) scale(${finalScale.toFixed(5)}) translate(${-cx} ${-cy})">${artwork}</g>`;

  return composition({
    vbW, vbH,
    ariaLabel: 'CDS',
    style: styleBlock({ colorMode }),
    bg: bgColor ? rectEl({ w: vbW, h: vbH }, { fill: bgColor }) : undefined,
    mark,
  });
}

// ─── NDJSON texture — shared by OG and banner ────────────────────────────────
// Faint signal-feed lines that read as a quiet data dump running behind the
// brand. Values are illustrative, not real signals.
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

// `cols` lists column start-x + record offset (so the same record doesn't sit
// at the same Y across columns).
function renderNdjsonTexture(font, cols, vbH) {
  const size = 12;
  const lineH = 14;
  const startY = 8;
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
// Each bar's opacity scales with its height (taller = more opaque), giving a
// sense of activity / market data without a literal chart.
function renderSkyline({ heights, slL, slR, baseY, opacityHeightRange = 200 }) {
  const slot = (slR - slL) / heights.length;
  const barW = slot * 0.45;
  return heights.map((h, i) => {
    const x = slL + i * slot + (slot - barW) / 2;
    const y = baseY - h;
    const op = round3(0.42 + (h / opacityHeightRange) * 0.45);
    return rectEl({ x, y, w: barW, h }, { fill: COLOR.rust, opacity: op });
  }).join('');
}

// ─── OG image — 1200×630 social card ─────────────────────────────────────────
// Centered vertical stack: wordmark + tagline near top, rust skyline tucked
// below. NDJSON texture fills the canvas top to bottom.
function buildOgImage(font) {
  const vbW = 1200, vbH = 630;
  const fontSize = 110;
  const baselineY = 220;
  const pieces = primaryWordmarkPieces(font, fontSize, baselineY, vbW);

  // Tagline sized to match the wordmark's visible width, anchored to its left edge.
  const wmWidth = pieces.bounds.right - pieces.bounds.left;
  const taglineSize = wmWidth / textAdvance(font, OG_TAGLINE, 1);
  const taglineY = 290;
  const taglinePath = textPathData(font, OG_TAGLINE, pieces.bounds.left, taglineY, taglineSize);

  const skyline = renderSkyline({
    heights: [50, 88, 66, 134, 84, 162, 110, 188, 146, 117, 84, 142, 100, 70],
    slL: (vbW - 900) / 2,
    slR: (vbW + 900) / 2,
    baseY: 560,
  });

  // NDJSON background — single centered column (canvas not wide enough for two)
  const charWidth = 12 * 0.6;
  const maxLineLen = Math.max(...NDJSON_TEXTURE_LINES.map((l) => l.length));
  const colX = Math.round((vbW - maxLineLen * charWidth) / 2);
  const texture = renderNdjsonTexture(font, [{ x: colX, rotate: 0 }], vbH);

  return composition({
    vbW, vbH,
    ariaLabel: `${WORDMARK_TEXT} — ${OG_TAGLINE}`,
    bg: rectEl({ w: vbW, h: vbH }, { fill: COLOR.light }),
    texture,
    skyline,
    mark: wordmarkFragment(pieces, { fill: COLOR.dark }),
    tagline: pathEl(taglinePath, { fill: COLOR.dark, opacity: 0.55 }),
  });
}

// ─── Banner — wide social header (2080×520, 4:1) ─────────────────────────────
// Wordmark + tagline left, rust-bar skyline right, faint NDJSON texture
// spanning the full canvas. Sized larger than any target platform so the
// canvas can be cropped freely (LinkedIn 1584×396, X 1500×500, etc.).
// Generous side padding so platform avatar overlays (typically bottom-left
// ~200px) don't clip critical content.
const BANNER_W = 2080;
const BANNER_H = 520;
const BANNER_PAD_X = 234;

function buildBanner(font) {
  const wmSize = 107;
  const wmTop  = 180;
  const wm = placedWordmark(font, wmSize, BANNER_PAD_X, wmTop, COLOR.dark);

  // Tagline sized to match the wordmark's width, anchored to its left edge.
  const tagSize = wm.width / textAdvance(font, OG_TAGLINE, 1);
  const tagY = wmTop + wm.height + 36;
  const taglinePath = textPathData(font, OG_TAGLINE, BANNER_PAD_X, tagY, tagSize);

  const skyline = renderSkyline({
    heights: [65, 114, 86, 174, 109, 211, 143, 244, 190, 152, 109, 184, 130, 91],
    slL: 1170,
    slR: BANNER_W - BANNER_PAD_X,
    baseY: 414,
    opacityHeightRange: 260,
  });

  const texture = renderNdjsonTexture(font, [
    { x: 20,   rotate: 0  },
    { x: 1170, rotate: 13 },
  ], BANNER_H);

  return composition({
    vbW: BANNER_W, vbH: BANNER_H,
    ariaLabel: `${WORDMARK_TEXT} banner`,
    bg: rectEl({ w: BANNER_W, h: BANNER_H }, { fill: COLOR.light }),
    texture,
    skyline,
    mark: wm.fragment,
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
  await sharp(Buffer.from(svgString))
    .resize({ width: targetWidth })
    .png()
    .toFile(outPath);
}

async function rasterizeNative(svgString, outPath) {
  // Render at the SVG's natural pixel dimensions (uses viewBox 1:1)
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
}

// ─── Family builders ─────────────────────────────────────────────────────────
async function buildLogoFamily(font) {
  // SVG: transparent, artwork edge-to-edge (auto color-scheme) for inline use.
  // PNGs: brand-color tile fills the viewBox; artwork shrinks inward so a
  // circular crop (Stripe, Telegram) keeps the bracket corners on screen.
  const logoAuto  = buildLogo(font, { colorMode: 'auto',  fillViewBox: true });
  const logoLight = buildLogo(font, { colorMode: 'light', fillViewBox: true, bgColor: COLOR.light, scale: LOGO_TILE_ARTWORK_SCALE });
  const logoDark  = buildLogo(font, { colorMode: 'dark',  fillViewBox: true, bgColor: COLOR.dark,  scale: LOGO_TILE_ARTWORK_SCALE });

  fs.writeFileSync(path.join(OUT_DIR, 'cds-logo.svg'), logoAuto + '\n');
  console.log('✓  cds-logo.svg');

  await rasterizeSquare(logoLight, path.join(OUT_DIR, 'cds-logo-light.png'), 512);
  console.log('✓  cds-logo-light.png');
  await rasterizeSquare(logoDark,  path.join(OUT_DIR, 'cds-logo-dark.png'),  512);
  console.log('✓  cds-logo-dark.png');

  // Favicons — natural geometry (small breathing room around brackets);
  // transparent background since host UI provides the tile.
  const favicon = buildLogo(font, { colorMode: 'light' });
  await rasterizeSquare(favicon, path.join(OUT_DIR, 'cds-favicon-32.png'),  32);
  console.log('✓  cds-favicon-32.png');
  await rasterizeSquare(favicon, path.join(OUT_DIR, 'cds-favicon-180.png'), 180);
  console.log('✓  cds-favicon-180.png');
}

async function buildWordmarkFamily(font) {
  // Wordmark — [DoubleTrends] on square canvas for easy cropping.
  const wmAuto  = buildWordmark(font, { colorMode: 'auto'  });
  const wmLight = buildWordmark(font, { colorMode: 'light' });
  const wmDark  = buildWordmark(font, { colorMode: 'dark'  });

  fs.writeFileSync(path.join(OUT_DIR, 'cds-wordmark.svg'), wmAuto + '\n');
  console.log('✓  cds-wordmark.svg');

  await rasterizeSquare(wmLight, path.join(OUT_DIR, 'cds-wordmark-light.png'), 1024);
  console.log('✓  cds-wordmark-light.png');
  await rasterizeSquare(wmDark,  path.join(OUT_DIR, 'cds-wordmark-dark.png'),  1024);
  console.log('✓  cds-wordmark-dark.png');

  // OG image — 1200×630 social card.
  const ogSvg = buildOgImage(font);
  fs.writeFileSync(path.join(OUT_DIR, 'og-image.svg'), ogSvg + '\n');
  console.log('✓  og-image.svg');
  await rasterizeNative(ogSvg, path.join(OUT_DIR, 'og-image.png'));
  console.log('✓  og-image.png');

  // Banner — 2080×520, oversized so it can be cropped to any social spec.
  const bannerSvg = buildBanner(font);
  fs.writeFileSync(path.join(OUT_DIR, 'cds-banner.svg'), bannerSvg + '\n');
  console.log('✓  cds-banner.svg');
  await rasterizeNative(bannerSvg, path.join(OUT_DIR, 'cds-banner.png'));
  console.log('✓  cds-banner.png');
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const font = loadFont();
  await buildLogoFamily(font);
  await buildWordmarkFamily(font);
  console.log(`\nBrand assets refreshed in ${path.relative(__dirname, OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
