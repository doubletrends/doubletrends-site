/**
 * build-guilloche.js
 * Generates the site's guilloche patterns (the engraved line-work of
 * banknotes and share certificates) as SVG into dist/public/brand/:
 *
 *   guilloche-paper.svg   woven bands of phase-shifted waves, tiled in rows
 *                         behind every page
 *   guilloche-footer.svg  a spirograph rosette, set navy-on-navy in the footer
 *
 * Every curve is periodic in its tile, so tiled patterns join without seams.
 * Line colour and opacity live in the SVG (they are used as CSS backgrounds,
 * where custom properties do not reach). Called from build.js.
 */

const fs = require('fs');
const path = require('path');
const { COLORS } = require('./src/brand.config');

const TAU = Math.PI * 2;
const f = (n) => (Math.round(n * 100) / 100).toString();

// Polyline path through sampled points.
function pathFrom(points) {
  return 'M' + points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
}

function svg(width, height, paths, { stroke, opacity, strokeWidth }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}" stroke-linejoin="round">`
    + paths.map((d) => `<path d="${d}"/>`).join('')
    + '</g></svg>\n';
}

// Paper: N waves sharing one envelope, each shifted in phase, so they cross
// into the lattice of a banknote border. All frequencies are whole multiples
// of the tile width and every curve stays inside the tile's height, so the
// band tiles seamlessly across and stacks into rows down the page.
function paperBands() {
  const W = 180, H = 76, N = 18, mid = H / 2, steps = 180;
  const paths = [];
  for (let k = 0; k < N; k++) {
    const phase = (k / N) * TAU;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const t = (x / W) * TAU;
      const envelope = 0.62 + 0.38 * Math.cos(2 * t);
      pts.push([x, mid + (H * 0.42) * envelope * Math.sin(t + phase) + 3 * Math.sin(6 * t + phase)]);
    }
    paths.push(pathFrom(pts));
  }
  return svg(W, H, paths, { stroke: COLORS.primary, opacity: 0.045, strokeWidth: 0.6 });
}

// Footer: rings of hypotrochoids (spirograph). Each keeps its pen inside the
// rolling circle (d < R - r), so every layer is an annulus with an open
// centre — the rosette of an engraved certificate. Each layer is drawn twice,
// the copy turned by half a lobe, which interlaces the loops.
function footerRosette() {
  const S = 640, c = S / 2, paths = [];
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const layers = [
    { R: 240, r: 66, d: 62 },   // outer ring: 40 lobes, radius 112..236
    { R: 180, r: 50, d: 44 },   // middle ring: 18 lobes, radius 86..174
    { R: 110, r: 30, d: 30 },   // inner ring: 11 lobes, radius 50..110
  ];
  for (const { R, r, d } of layers) {
    const turns = r / gcd(R, r);
    const lobes = R / gcd(R, r);
    const steps = turns * 140;
    for (const rot of [0, Math.PI / lobes]) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * turns * TAU;
        const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
        const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
        pts.push([c + x * Math.cos(rot) - y * Math.sin(rot), c + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
      paths.push(pathFrom(pts) + 'Z');
    }
  }
  return svg(S, S, paths, { stroke: '#FFFFFF', opacity: 0.08, strokeWidth: 0.7 });
}

function writeGuilloches(brandDir) {
  fs.mkdirSync(brandDir, { recursive: true });
  const out = {
    'guilloche-paper.svg': paperBands(),
    'guilloche-footer.svg': footerRosette(),
  };
  for (const [name, body] of Object.entries(out)) fs.writeFileSync(path.join(brandDir, name), body, 'utf8');
  return Object.keys(out);
}

module.exports = { writeGuilloches };
