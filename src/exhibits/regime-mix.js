/**
 * regime-mix.js — Exhibit 2: the share of sessions in each regime, one
 * stacked column per calendar year.
 */
const { REGIMES, REGIME_ORDER } = require('../regimes');
const { esc } = require('../format');
const { r1, HISTORY_START } = require('./shared');

// "a, b and c"
const listJoin = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function regimeMixChart({ rows, indicator }) {
  const byYear = new Map();
  for (const r of rows) {
    if (r.date < HISTORY_START) continue;
    const y = r.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, { ...Object.fromEntries(REGIME_ORDER.map((g) => [g, 0])), n: 0 });
    const t = byYear.get(y); t[r.regime]++; t.n++;
  }
  const years = [...byYear.keys()];
  const lastYear = years[years.length - 1];
  const W = 1200, padL = 46, padR = 8, padT = 12, plotH = 240, axisH = 30;
  const H = padT + plotH + axisH;
  const slot = (W - padL - padR) / years.length;
  const barW = Math.min(24, slot - 6);
  const SEG_GAP = 2;
  const pctY = (p) => padT + plotH - (p / 100) * plotH;
  const grid = [0, 25, 50, 75, 100].map((p) => `<line x1="${padL}" x2="${W - padR}" y1="${r1(pctY(p))}" y2="${r1(pctY(p))}" class="ex-grid"/>`
    + `<text x="${padL - 10}" y="${r1(pctY(p)) + 4}" text-anchor="end" class="ex-tick">${p}%</text>`).join('');
  const bars = years.map((y, i) => {
    const t = byYear.get(y);
    const cx = padL + slot * i + slot / 2;
    let acc = 0;
    const segs = REGIME_ORDER.filter((g) => t[g] > 0).map((g) => {
      const share = (t[g] / t.n) * 100;
      const yTop = pctY(acc + share), yBot = pctY(acc);
      acc += share;
      const h = Math.max(0, yBot - yTop - SEG_GAP);
      const label = `${y === lastYear ? `${y} year to date` : y} · ${REGIMES[g].label}: ${share.toFixed(0)}% of sessions (${t[g]} of ${t.n})`;
      return `<rect x="${r1(cx - barW / 2)}" y="${r1(yTop + SEG_GAP)}" width="${r1(barW)}" height="${r1(h)}" class="fill-${g}" tabindex="-1" data-tip="${esc(label)}"><title>${esc(label)}</title></rect>`;
    }).join('');
    const showLabel = Number(y) % 5 === 0 || y === years[0] || y === lastYear;
    const tick = showLabel ? `<text x="${r1(cx)}" y="${H - 10}" text-anchor="middle" class="ex-tick">${y === lastYear ? `${y}*` : y}</text>` : '';
    return segs + tick;
  }).join('');
  const bearYears = listJoin(indicator.bear_episodes.map((e) => {
    const ys = e.start.slice(0, 4), ye = e.end.slice(0, 4);
    return ys === ye ? ys : `${ys}–${ye}`;
  }));
  return `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ex2-title ex2-desc">
<title id="ex2-title">Share of trading sessions in each regime, by calendar year, ${years[0]} to ${lastYear}</title>
<desc id="ex2-desc">One stacked column per year: calm at the base, then correction, panic and bear. Bear sessions appear only in ${bearYears}.</desc>
${grid}
<g class="ex-bars">${bars}</g>
</svg>`;
}

module.exports = { regimeMixChart };
