/**
 * build-guilloche.js
 * Generates the site's guilloche patterns (the engraved line-work of
 * banknotes and share certificates) as SVG into dist/public/brand/:
 *
 *   guilloche-paper.svg   moiré beat: two woven strand families at different
 *                         frequencies, tiled in rows behind every page
 *
 * The footer's banknote frame is not an image: it is drawn to the footer's
 * size in the browser (src/partials/footer-frame.js).
 *
 * Every curve is periodic in its tile, so tiled patterns join without seams.
 * The OG image and banner (build-brand.js) reuse the paper moiré.
 * Line colour and opacity live in the SVG (they are used as CSS backgrounds,
 * where custom properties do not reach). Called from build.js.
 */

const fs = require('fs');
const path = require('path');
const { COLORS } = require('../src/brand.config');

const TAU = Math.PI * 2;
const f = (n) => (Math.round(n * 100) / 100).toString();

// Relative-command path through points rounded to 0.1 px first, so the
// deltas carry no accumulated drift and the file stays small.
function relPath(points) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const pts = points.map(([x, y]) => [r1(x), r1(y)]);
  let d = `M${pts[0][0]} ${pts[0][1]}l`;
  for (let i = 1; i < pts.length; i++) {
    d += `${i > 1 ? ' ' : ''}${r1(pts[i][0] - pts[i - 1][0])} ${r1(pts[i][1] - pts[i - 1][1])}`;
  }
  return d.replace(/ -/g, '-');
}

function svg(width, height, paths, { stroke, opacity, strokeWidth }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">`
    + paths.map((d) => `<path d="${d}"/>`).join('')
    + '</g></svg>\n';
}

// Paper — locked in the guilloche lab (round 3, 2026-11-08): round-2 sample
// "3 Moiré beat" at 200% scale, line strength 0.050 (lowered from 0.150 via 0.100, 0.075 and 0.060 on review). Two families of 22
// phase-shifted strands, at 2 and 3 waves per tile, cross and interfere.
// Drawn natively at the 200% size (720 x 192, 0.8 px lines). Every frequency
// is a whole multiple of the tile width and strands are sampled a little past
// both edges, so the tile repeats without seams; all curves stay inside the
// tile's height, so rows stack cleanly. Paths use relative commands on
// pre-rounded points (no drift) to keep the file small.
const PAPER_TILE = { width: 720, height: 192 };
function paperBeatPaths() {
  const { width: W, height: H } = PAPER_TILE;
  const MID = H / 2, AMP = 80, N = 22, steps = 240, margin = 24;
  const env4 = (t) => 0.62 + 0.38 * Math.cos(4 * t);
  const env6 = (t) => 0.55 + 0.45 * Math.cos(6 * t);
  const strand = (yOf) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = -margin + (i / steps) * (W + 2 * margin);
      pts.push([x, yOf((x / W) * TAU)]);
    }
    return relPath(pts);
  };
  const paths = [];
  for (let k = 0; k < N; k++) {
    const ph = (k / N) * TAU;
    paths.push(strand((t) => MID + AMP * 0.92 * env4(t) * Math.sin(2 * t + ph)));
    paths.push(strand((t) => MID + AMP * 0.8 * env6(t) * Math.sin(3 * t + ph)));
  }
  return paths;
}
function paperBeat() {
  return svg(PAPER_TILE.width, PAPER_TILE.height, paperBeatPaths(), { stroke: COLORS.primary, opacity: 0.05, strokeWidth: 0.8 });
}


function writeGuilloches(brandDir) {
  fs.mkdirSync(brandDir, { recursive: true });
  const out = {
    'guilloche-paper.svg': paperBeat(),
  };
  for (const [name, body] of Object.entries(out)) fs.writeFileSync(path.join(brandDir, name), body, 'utf8');
  return Object.keys(out);
}

// The paper moiré's line-work, for the OG image and banner (build-brand.js).
module.exports = { writeGuilloches, paperBeatPaths, PAPER_TILE };
