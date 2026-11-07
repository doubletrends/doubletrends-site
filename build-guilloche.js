/**
 * build-guilloche.js
 * Generates the site's guilloche patterns (the engraved line-work of
 * banknotes and share certificates) as SVG into dist/public/brand/:
 *
 *   guilloche-paper.svg   moiré beat: two woven strand families at different
 *                         frequencies, tiled in rows behind every page
 *   guilloche-topbar.svg  rosette medallions linked by strands, white on the
 *                         navy top bar
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

// Relative-command path through points rounded to 0.1 px first, so the
// deltas carry no accumulated drift and the file stays small.
function relPath(points, close = false) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const pts = points.map(([x, y]) => [r1(x), r1(y)]);
  let d = `M${pts[0][0]} ${pts[0][1]}l`;
  for (let i = 1; i < pts.length; i++) {
    d += `${i > 1 ? ' ' : ''}${r1(pts[i][0] - pts[i - 1][0])} ${r1(pts[i][1] - pts[i - 1][1])}`;
  }
  return d.replace(/ -/g, '-') + (close ? 'z' : '');
}

// Polyline path through sampled points.
function pathFrom(points) {
  return 'M' + points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
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
function paperBeat() {
  const W = 720, H = 192, MID = H / 2, AMP = 80, N = 22, steps = 240, margin = 24;
  const r1 = (n) => Math.round(n * 10) / 10;
  const env4 = (t) => 0.62 + 0.38 * Math.cos(4 * t);
  const env6 = (t) => 0.55 + 0.45 * Math.cos(6 * t);
  const strand = (yOf) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = -margin + (i / steps) * (W + 2 * margin);
      pts.push([r1(x), r1(yOf((x / W) * TAU))]);
    }
    let d = `M${pts[0][0]} ${pts[0][1]}l`;
    for (let i = 1; i < pts.length; i++) {
      const dx = r1(pts[i][0] - pts[i - 1][0]), dy = r1(pts[i][1] - pts[i - 1][1]);
      d += `${i > 1 ? ' ' : ''}${dx} ${dy}`;
    }
    return d.replace(/ -/g, '-');
  };
  const paths = [];
  for (let k = 0; k < N; k++) {
    const ph = (k / N) * TAU;
    paths.push(strand((t) => MID + AMP * 0.92 * env4(t) * Math.sin(2 * t + ph)));
    paths.push(strand((t) => MID + AMP * 0.8 * env6(t) * Math.sin(3 * t + ph)));
  }
  return svg(W, H, paths, { stroke: COLORS.primary, opacity: 0.05, strokeWidth: 0.8 });
}

// Top bar — locked in the top-bar lab (round 1 sample T5 "Rosette links",
// 2026-11-08), white at 0.15 on the navy utility bar. Every 160px a
// medallion — two circle-rosettes (12 circles on a 6.5px ring, 8 on a 3.2px
// ring) — joined by 8 phase-shifted strands that pinch into each medallion.
// Tile 160 x 36 (the bar's height), repeated horizontally.
function topBarRosettes() {
  const W = 160, H = 36, MID = H / 2, steps = 240, margin = 8, paths = [];
  for (let k = 0; k < 8; k++) {
    const ph = (k / 8) * TAU, pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = -margin + (i / steps) * (W + 2 * margin), t = (x / W) * TAU;
      pts.push([x, MID + 10 * (0.15 + 0.85 * Math.sin(t) ** 2) * Math.sin(2 * t + ph)]);
    }
    paths.push(relPath(pts));
  }
  for (const cx of [0, W]) {
    for (const [ringR, circR, count, rot] of [[6.5, 6.5, 12, 0], [3.2, 3.2, 8, Math.PI / 8]]) {
      for (let i = 0; i < count; i++) {
        const a = rot + (i / count) * TAU, ox = cx + ringR * Math.cos(a), oy = MID + ringR * Math.sin(a), pts = [];
        for (let j = 0; j < 40; j++) { const b = (j / 40) * TAU; pts.push([ox + circR * Math.cos(b), oy + circR * Math.sin(b)]); }
        paths.push(relPath(pts, true));
      }
    }
  }
  return svg(W, H, paths, { stroke: '#FFFFFF', opacity: 0.15, strokeWidth: 0.5 });
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
    'guilloche-paper.svg': paperBeat(),
    'guilloche-topbar.svg': topBarRosettes(),
    'guilloche-footer.svg': footerRosette(),
  };
  for (const [name, body] of Object.entries(out)) fs.writeFileSync(path.join(brandDir, name), body, 'utf8');
  return Object.keys(out);
}

module.exports = { writeGuilloches };
