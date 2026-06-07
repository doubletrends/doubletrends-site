/**
 * build-brand.js
 *
 * Generates the CDS brand asset set in public/brand/ from a single source of
 * truth — JetBrains Mono Bold + rust bar geometry. Three asset families:
 *
 *   Logo — the [ ] mark (no letters), edge-to-edge in a 32×32 viewBox.
 *     cds-logo.svg               auto color (prefers-color-scheme)
 *     cds-logo-light.png         512×512 · dark glyphs (for light backgrounds)
 *     cds-logo-dark.png          512×512 · light glyphs (for dark backgrounds)
 *
 *   Wordmark — [CDS] + rust bar over S right half, on a square canvas.
 *     cds-wordmark.svg           600×600 · auto color
 *     cds-wordmark-light.png     1024×1024 · dark glyphs
 *     cds-wordmark-dark.png      1024×1024 · light glyphs
 *
 *   Favicon — small browser-tab PNGs + Stripe checkout brand icon.
 *     cds-favicon-32.png         32×32 · dark glyphs · legacy favicon
 *     cds-favicon-180.png        180×180 · dark glyphs · Apple touch icon
 *     cds-favicon-stripe.png     512×512 · dark glyphs · padded for circular crop
 *
 *   Social
 *     og-image.png               1200×630 social card (wordmark + tagline)
 *
 * Geometry rules (locked):
 *   wordmark — bar left = S cell center · bar right = midpoint of visible gap
 *              between S glyph and ] glyph · bar bottom = S visual bottom (S overshoot)
 *   logo     — bar centered between [ and ] glyphs · same bar-bottom rule
 *   brackets — vertically scaled (uniform K) so inner cavity = full letter range
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

const BAR_HEIGHT = 4;   // viewBox units
const BAR_LIFT   = 4;   // bar top sits BAR_LIFT above baseline; bar bottom = baseline

// Uniform shrink for the Stripe checkout brand icon variant only, so bracket
// corners clear Stripe's circular crop. 0.85 → 7.5% padding per side.
// The website favicon stays edge-to-edge (scale 1.0) for crisp browser tabs.
const STRIPE_FAVICON_SCALE = 0.85;

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
  const path  = glyph.getPath(0, 0, fontSize);  // rendered in SVG-space (y down)
  const ys = [];
  for (const cmd of path.commands) {
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
  const round = (v) => v === undefined ? v : Math.round(v * 1000) / 1000;
  for (const cmd of p.commands) {
    cmd.x  = round(cmd.x);
    cmd.y  = round(cmd.y);
    cmd.x1 = round(cmd.x1);
    cmd.y1 = round(cmd.y1);
    cmd.x2 = round(cmd.x2);
    cmd.y2 = round(cmd.y2);
  }
  return p.toPathData(3);
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

// ─── Wordmark — [CDS] + rust bar ──────────────────────────────────────────

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
  const barH   = fontSize * (BAR_HEIGHT / 26);  // scale proportionally
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

function wordmarkSvg({ vbW, vbH, pieces, colorMode }) {
  const { cdsPaths, lPath, rPath, bracketTransform, bar } = pieces;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="CDS">${styleBlock({ colorMode })}<g class="g"><path d="${cdsPaths.join(' ')}"/><g transform="${bracketTransform}"><path d="${lPath} ${rPath}"/></g></g><rect x="${bar.x.toFixed(3)}" y="${bar.y.toFixed(3)}" width="${bar.w.toFixed(3)}" height="${bar.h.toFixed(3)}" fill="${COLOR.rust}"/></svg>`;
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

// Wordmark — [CDS] + rust bar, centered in a square canvas for easy cropping
// (Telegram channel, app icon, profile picture, etc.).
function buildWordmark(font, { colorMode } = { colorMode: 'auto' }) {
  const vbSize   = 600;
  const fontSize = 160;
  const baselineY = centeredBaseline(font, fontSize, vbSize);
  const pieces = logoPieces(font, fontSize, baselineY, vbSize);
  return wordmarkSvg({ vbW: vbSize, vbH: vbSize, pieces, colorMode });
}

// ─── Logo — [ ] mark, no letters ──────────────────────────────────────────────
// Options:
//   scale         — uniform shrink of artwork around viewBox center (e.g. 0.85 for Stripe).
//   fillViewBox   — true ⇒ scale artwork up so it fills the viewBox edge-to-edge along
//                   its longer dimension (no padding around the brackets). For logo
//                   files used inline on pages. Favicons keep the natural geometry.
function buildLogo(font, { colorMode, scale = 1, fillViewBox = false } = { colorMode: 'auto' }) {
  const fontSize   = 24;
  const vbW        = 32;
  const vbH        = 32;
  const baselineY  = 24;

  const lMet = glyphMetrics(font, '[', fontSize);
  const rMet = glyphMetrics(font, ']', fontSize);

  // Position brackets near the edges, centered around the cell centers x=6 and x=26
  const leftCenter  = 6;
  const rightCenter = 26;
  const leftX  = leftCenter  - lMet.advance / 2;
  const rightX = rightCenter - rMet.advance / 2;

  const leftPath  = pathDataAt(lMet.glyph,  leftX,  baselineY, fontSize);
  const rightPath = pathDataAt(rMet.glyph, rightX, baselineY, fontSize);

  // Bar: from just right of [ glyph to just left of ] glyph, with a small visual gap
  const padding = 1.0;
  const lRight  = leftX  + lMet.x2;
  const rLeft   = rightX + rMet.x1;
  const barX    = lRight + padding;
  const barW    = rLeft  - barX - padding;

  // Bar bottom = where the would-be letter row visually bottoms out at this
  // fontSize (S overshoot rule). Matches logo behaviour.
  const letters = letterRange(font, fontSize, baselineY);
  const barY    = letters.bottom - BAR_HEIGHT;

  // Brackets scaled so inner cavity matches the (would-be) letter range
  const { K, ty, transform } = bracketScale(font, fontSize, baselineY);

  // Artwork bbox in viewBox coords — used by fillViewBox to compute the scale-up factor.
  const geom = extractBracketGeometry(font, '[', fontSize);
  const xMin = leftX + lMet.x1;
  const xMax = rightX + rMet.x2;
  const yMin = K * (baselineY + geom.outerTop) + ty;
  const yMax = K * (baselineY + geom.outerBottom) + ty;
  const fillScale = fillViewBox
    ? Math.min(vbW / (xMax - xMin), vbH / (yMax - yMin))
    : 1;
  const finalScale = scale * fillScale;

  const cx = vbW / 2, cy = vbH / 2;
  const inner = `<g class="g" transform="${transform}"><path d="${leftPath} ${rightPath}"/></g><rect x="${barX.toFixed(3)}" y="${barY.toFixed(3)}" width="${barW.toFixed(3)}" height="${BAR_HEIGHT}" fill="${COLOR.rust}"/>`;
  const body = finalScale === 1
    ? inner
    : `<g transform="translate(${cx} ${cy}) scale(${finalScale.toFixed(5)}) translate(${-cx} ${-cy})">${inner}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="CDS">${styleBlock({ colorMode })}${body}</svg>`;
}

// ─── OG image — 1200×630 with centered logo + tagline ─────────────────────
function buildOgImage(font) {
  const vbW = 1200, vbH = 630;
  const fontSize = 180;
  const baselineY = 340;

  const cellW  = glyphMetrics(font, '[', fontSize).advance;
  const totalW = cellW * 5;
  const startX = (vbW - totalW) / 2;

  // CDS letter paths (no scaling)
  const cdsPaths = ['C', 'D', 'S'].map((ch, i) => {
    const x = startX + (i + 1) * cellW;
    return pathDataAt(font.charToGlyph(ch), x, baselineY, fontSize);
  });

  // Bracket paths (wrapped in scale transform below)
  const lX = startX + 0 * cellW;
  const rX = startX + 4 * cellW;
  const lPath = pathDataAt(font.charToGlyph('['), lX, baselineY, fontSize);
  const rPath = pathDataAt(font.charToGlyph(']'), rX, baselineY, fontSize);

  // Bar
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

  const { transform } = bracketScale(font, fontSize, baselineY);

  // Tagline
  const taglineSize = 28;
  const taglineY = 470;
  const tagline = "DoubleTrends L.L.C. · DoubleTrends™";
  const tCellW = glyphMetrics(font, 'C', taglineSize).advance;
  const tTotal = tCellW * tagline.length;
  const tStartX = (vbW - tTotal) / 2;
  const tPaths = [...tagline].map((ch, i) => {
    const x = tStartX + i * tCellW;
    return pathDataAt(font.charToGlyph(ch === ' ' ? ' ' : ch), x, taglineY, taglineSize);
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="CDS — DoubleTrends™">
  <rect width="${vbW}" height="${vbH}" fill="${COLOR.light}"/>
  <g fill="${COLOR.dark}">
    <path d="${cdsPaths.join(' ')}"/>
    <g transform="${transform}"><path d="${lPath} ${rPath}"/></g>
  </g>
  <rect x="${barX.toFixed(3)}" y="${barY.toFixed(3)}" width="${barW.toFixed(3)}" height="${barH.toFixed(3)}" fill="${COLOR.rust}"/>
  <path d="${tPaths.join(' ')}" fill="${COLOR.dark}" opacity="0.55"/>
</svg>`;
}

// ─── Rasterize ────────────────────────────────────────────────────────────────
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
  await sharp(Buffer.from(svgString))
    .png()
    .toFile(outPath);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const font = loadFont();

  // ── Logo — [ ] mark, scaled to fill the 32×32 viewBox (no padding) ──
  const logoAuto  = buildLogo(font, { colorMode: 'auto',  fillViewBox: true });
  const logoLight = buildLogo(font, { colorMode: 'light', fillViewBox: true });
  const logoDark  = buildLogo(font, { colorMode: 'dark',  fillViewBox: true });

  fs.writeFileSync(path.join(OUT_DIR, 'cds-logo.svg'), logoAuto + '\n');
  console.log('✓  cds-logo.svg');

  await rasterizeSquare(logoLight, path.join(OUT_DIR, 'cds-logo-light.png'), 512);
  console.log('✓  cds-logo-light.png');
  await rasterizeSquare(logoDark,  path.join(OUT_DIR, 'cds-logo-dark.png'),  512);
  console.log('✓  cds-logo-dark.png');

  // ── Wordmark — [CDS] on square canvas ──
  const wordmarkAuto  = buildWordmark(font, { colorMode: 'auto'  });
  const wordmarkLight = buildWordmark(font, { colorMode: 'light' });
  const wordmarkDark  = buildWordmark(font, { colorMode: 'dark'  });

  fs.writeFileSync(path.join(OUT_DIR, 'cds-wordmark.svg'), wordmarkAuto + '\n');
  console.log('✓  cds-wordmark.svg');

  await rasterizeSquare(wordmarkLight, path.join(OUT_DIR, 'cds-wordmark-light.png'), 1024);
  console.log('✓  cds-wordmark-light.png');
  await rasterizeSquare(wordmarkDark,  path.join(OUT_DIR, 'cds-wordmark-dark.png'),  1024);
  console.log('✓  cds-wordmark-dark.png');

  // ── Favicon — small browser-tab PNGs + Stripe brand icon ──
  // Favicons use the natural geometry (small breathing room around brackets) — the
  // logo files are edge-to-edge, but browser tabs read better with a touch of margin.
  const faviconLight = buildLogo(font, { colorMode: 'light' });
  await rasterizeSquare(faviconLight, path.join(OUT_DIR, 'cds-favicon-32.png'),  32);
  console.log('✓  cds-favicon-32.png');
  await rasterizeSquare(faviconLight, path.join(OUT_DIR, 'cds-favicon-180.png'), 180);
  console.log('✓  cds-favicon-180.png');

  const logoStripe = buildLogo(font, { colorMode: 'light', scale: STRIPE_FAVICON_SCALE });
  await rasterizeSquare(logoStripe, path.join(OUT_DIR, 'cds-favicon-stripe.png'), 512);
  console.log('✓  cds-favicon-stripe.png');

  // ── Social ──
  const ogSvg = buildOgImage(font);
  await rasterizeNative(ogSvg, path.join(OUT_DIR, 'og-image.png'));
  console.log('✓  og-image.png');

  console.log(`\nBrand assets generated in ${path.relative(__dirname, OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
