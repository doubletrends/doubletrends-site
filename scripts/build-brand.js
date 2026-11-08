/**
 * build-brand.js — generates the brand assets into dist/public/brand/.
 * Called from build.js; nothing here is committed.
 *
 * Identity in the brand's two colors: the portico (the original [_] mark
 * redrawn as two pilasters with a rust threshold), with no background except
 * on icons and avatars, and the name "DoubleTrends" split as in the original
 * wordmark ("Double" rust, "Trends" navy), set in Source Serif 4 Semibold and
 * converted to outlines (opentype.js), so the SVGs render identically
 * everywhere with no font dependency. The OG image and banners are navy
 * cards under the paper moiré of build-guilloche.js, with an archival photo.
 *
 * Outputs keep every historical filename so external links never break:
 *   logo.svg · logo-on-dark.svg · logo-{light,dark}.png   the mark, no background
 *   favicon.svg · favicon-{32,180}.png                    the mark on a navy tile
 *   avatar-{navy,white}.png                               social avatars, 1024 square
 *   wordmark.svg · wordmark-{light,dark}.png · og-image.{svg,png} · banner.{svg,png}
 *   linkedin-banner.{svg,png} (LinkedIn company-page cover)
 */
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const sharp = require('sharp');
const { COLORS } = require('../src/brand.config');
const { OG_IMAGE_SIZE, OG_PHOTO, PUBLISHER } = require('../src/site.config');
const { paperBeatPaths, PAPER_TILE } = require('./build-guilloche');

const NAVY = COLORS.primary;
const RUST = COLORS.accent;

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
// mirrored, so the mark is exactly symmetric; it fills MARK_BOX, the square
// from 10.4 to 53.6 on both axes, centred on the grid.
//
// The mark has no background. Each shaft has a single flute, cut as a hole
// and filled with the ink at 45%, so on any ground it reads as the old flute
// cut in the plate colour did.
const MARK_BOX = { x: 10.4, y: 10.4, size: 43.2 };

function markShapes(ink) {
  const half = `<rect x="10.5" y="10.4" width="16.5" height="2.6"/>
<rect x="11.5" y="13" width="10" height="2.2"/>
<path fill-rule="evenodd" d="M12 15.2h6v33.6h-6zM14.6 17.4v29h0.8v-29z"/>
<rect x="11.5" y="48.8" width="10" height="2.2"/>
<rect x="10.5" y="51" width="16.5" height="2.6"/>
<rect x="14.6" y="17.4" width="0.8" height="29" fill-opacity="0.45"/>`;
  return `<g fill="${ink}">${half}<g transform="translate(64 0) scale(-1 1)">${half}</g></g>
<rect x="26" y="44.8" width="12" height="4" fill="${RUST}"/>`;
}

// The mark alone, cropped to MARK_BOX: the logo every page and asset uses.
function markSvg({ ink }) {
  const { x, y, size } = MARK_BOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${size} ${size}" width="64" height="64">
${markShapes(ink)}
</svg>`;
}

// The mark on a square ground, for places that need an opaque icon: browser
// and home-screen icons (`rounded`, at the mark's own size on the tile) and
// social avatars (square to the edge, the mark at `fill` of the width so a
// circular crop clears it).
function tileSvg({ plate, ink, rounded = false, fill = MARK_BOX.size / 64 }) {
  const k = (fill * 64) / MARK_BOX.size;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<rect width="64" height="64"${rounded ? ' rx="6"' : ''} fill="${plate}"/>
<g transform="translate(32 32) scale(${k}) translate(-32 -32)">${markShapes(ink)}</g>
</svg>`;
}

// ─── Wordmark: mark + name ──────────────────────────────────────────────────
function wordmarkSvg({ dark = false } = {}) {
  const ink = dark ? '#FFFFFF' : NAVY;
  const H = 80, mark = 54, gap = 30, size = 50;
  const probe = outline(SERIF, 'DoubleTrends', size);
  const y = H / 2 + (-probe.top) / 2 - 1;
  // "Double" in rust, "Trends" in navy (white on dark), as in the original wordmark.
  const first = outline(SERIF, 'Double', size, mark + gap, y);
  const kernET = (SERIF.getKerningValue(SERIF.charToGlyph('e'), SERIF.charToGlyph('T')) / SERIF.unitsPerEm) * size;
  const second = outline(SERIF, 'Trends', size, mark + gap + first.width + kernET, y);
  const W = Math.ceil(mark + gap + first.width + kernET + second.width + 4);
  const inner = `<g transform="translate(0 ${(H - mark) / 2}) scale(${mark / MARK_BOX.size}) translate(${-MARK_BOX.x} ${-MARK_BOX.y})">${markShapes(ink)}</g>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${inner}
<path d="${first.d}" fill="${RUST}"/>
<path d="${second.d}" fill="${ink}"/>
</svg>`, W, H };
}

// ─── OG image / banners ─────────────────────────────────────────────────────
// The firm's card, in the manner of an engraved share certificate: a navy
// field under the site's paper moiré and a double-ruled frame, with an
// archival photo (its navy duotone `card` rendition, OG_PHOTO in
// site.config.js) on the right, fading into the field. On the left, centred
// in the height, the firm itself: the wordmark, a rust rule, and its line;
// the address at the foot. Nothing is offered. `scale` sizes the type;
// `photoFrom` is where the photo starts, as a share of the width (it is fully
// in by 55% of its own width); `address: false` leaves the foot empty, for a
// cover whose page shows its own details there.
const PHOTO = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'archive', `${OG_PHOTO}-card.jpg`)).toString('base64')}`;

function cardSvg(W, H, { scale: s = 1, photoFrom = 0.42, left = 96 * s, address = true } = {}) {
  const PAPER = COLORS.light;
  const x = left;
  const wm = wordmarkSvg({ dark: true });
  const wmInner = wm.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '');

  // Wordmark, rule, line: wm.H + 84 units from the wordmark's top to the
  // line's baseline, centred in the height.
  const wmY = (H - (wm.H + 84) * s) / 2;
  const ruleY = wmY + (wm.H + 40) * s;
  const line = outline(SANS, 'MARKET REGIME RESEARCH', 18 * s, x, ruleY + 47 * s, 3.2 * s);
  const site = outline(SANS, 'DOUBLETRENDS.COM', 15 * s, x, H - 72 * s, 2.5 * s);

  // The paper moiré tiled over the field; the photo fills the right side.
  const tiles = [];
  for (let ty = 0; ty < H; ty += PAPER_TILE.height) {
    for (let tx = 0; tx < W; tx += PAPER_TILE.width) tiles.push(`<use href="#beat" x="${tx}" y="${ty}"/>`);
  }
  const photoX = Math.round(W * photoFrom);
  const frame = (inset, width, opacity) => `<rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="${PAPER}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.55" stop-color="#fff" stop-opacity="1"/></linearGradient>
<mask id="photo-fade" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#fade)"/></mask>
<g id="beat" fill="none" stroke="${PAPER}" stroke-opacity="0.035" stroke-width="0.8" stroke-linejoin="round">${paperBeatPaths().map((d) => `<path d="${d}"/>`).join('')}</g></defs>
<rect width="${W}" height="${H}" fill="${NAVY}"/>
${tiles.join('')}
<image x="${photoX}" y="0" width="${W - photoX}" height="${H}" preserveAspectRatio="xMidYMin slice" opacity="0.5" mask="url(#photo-fade)" href="${PHOTO}" xlink:href="${PHOTO}"/>
${frame(24 * s, 1, 0.3)}
${frame(31 * s, 0.6, 0.18)}
<g transform="translate(${x} ${wmY}) scale(${s})">${wmInner}</g>
<rect x="${x}" y="${ruleY}" width="${56 * s}" height="${3 * s}" fill="${RUST}"/>
<path d="${line.d}" fill="${PAPER}" fill-opacity="0.72"/>
${address ? `<path d="${site.d}" fill="${PAPER}" fill-opacity="0.55"/>` : ''}
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

  // The mark alone, for pages and other assets: navy for light grounds,
  // white for dark ones.
  const logo = markSvg({ ink: NAVY });
  const logoOnDark = markSvg({ ink: '#FFFFFF' });
  write('logo.svg', logo);
  write('logo-on-dark.svg', logoOnDark);
  await png(logo, 'logo-light.png', { size: 512 });
  await png(logoOnDark, 'logo-dark.png', { size: 512 });

  // Browser and home-screen icons need an opaque ground: the mark on a navy tile.
  const favicon = tileSvg({ plate: NAVY, ink: '#FFFFFF', rounded: true });
  write('favicon.svg', favicon);
  await png(favicon, 'favicon-32.png', { size: 32 });
  await png(favicon, 'favicon-180.png', { size: 180 });

  // The social duo: square avatars to upload to profiles, navy and white.
  await png(tileSvg({ plate: NAVY, ink: '#FFFFFF', fill: 0.56 }), 'avatar-navy.png', { size: 1024 });
  await png(tileSvg({ plate: '#FFFFFF', ink: NAVY, fill: 0.56 }), 'avatar-white.png', { size: 1024 });

  const wm = wordmarkSvg();
  const wmDark = wordmarkSvg({ dark: true });
  write('wordmark.svg', wm.svg);
  await png(wm.svg, 'wordmark-light.png', { width: PUBLISHER.logo.width });
  await png(wmDark.svg, 'wordmark-dark.png', { width: PUBLISHER.logo.width });
  // JSON-LD declares the wordmark's size (PUBLISHER.logo); it must be true.
  const { width, height } = await sharp(path.join(OUT, 'wordmark-light.png')).metadata();
  if (width !== PUBLISHER.logo.width || height !== PUBLISHER.logo.height) {
    throw new Error(`wordmark-light.png is ${width}×${height}; site.config.js PUBLISHER.logo declares ${PUBLISHER.logo.width}×${PUBLISHER.logo.height}`);
  }

  const og = cardSvg(OG_IMAGE_SIZE.width, OG_IMAGE_SIZE.height);
  write('og-image.svg', og);
  await png(og, 'og-image.png', { width: OG_IMAGE_SIZE.width });
  const banner = cardSvg(1500, 500, { scale: 0.9, photoFrom: 0.58 });
  write('banner.svg', banner);
  await png(banner, 'banner.png', { width: 1500 });
  // LinkedIn company-page cover: 1128 × 191, drawn at 2× for high-density
  // screens. The page's logo overlaps the bottom-left corner and its name and
  // details sit below, so the text starts clear of that corner, with no address.
  const linkedin = cardSvg(2256, 382, { scale: 1.2, photoFrom: 0.62, left: 460, address: false });
  write('linkedin-banner.svg', linkedin);
  await png(linkedin, 'linkedin-banner.png', { width: 2256 });

}

module.exports = { writeBrand };
