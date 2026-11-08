/**
 * regime-history.js — Exhibit 1: the S&P 500 with the regime ribbon, bear
 * episodes shaded and signals marked. Returns the SVG and the hover payload
 * public/scripts/exhibits.js reads.
 */
const { REGIMES } = require('../regimes');
const { regimeEpisodes } = require('../measures');
const { fmtDateShort, fmtMonthYear, fmtCount } = require('../format');
const { r1, toMs, DAY, SIGNAL_ARROW } = require('./shared');

function regimeHistoryChart({ rows, indicator }) {
  const W = 1200, padL = 8, padR = 70, padT = 34;
  const plotH = 330, gap = 12, ribbonH = 16, axisH = 34;
  const H = padT + plotH + gap + ribbonH + axisH;
  const x0 = toMs(rows[0].date), x1 = toMs(rows[rows.length - 1].date) + DAY;
  const X = (iso) => padL + ((toMs(iso) - x0) / (x1 - x0)) * (W - padL - padR);
  const yMin = Math.log10(500), yMax = Math.log10(9000);
  const Y = (v) => padT + plotH - ((Math.log10(v) - yMin) / (yMax - yMin)) * plotH;
  const ribbonY = padT + plotH + gap;
  const bottom = ribbonY + ribbonH;

  // Weekly series (last trading day of each ISO week) for the line + hover.
  const weekly = [];
  const weekKey = (iso) => Math.floor((toMs(iso) / DAY + 3) / 7); // Thursday-anchored week number
  for (const r of rows) {
    const k = weekKey(r.date);
    if (weekly.length && weekly[weekly.length - 1].k === k) weekly[weekly.length - 1] = { k, ...r };
    else weekly.push({ k, ...r });
  }
  const line = weekly.map((p, i) => `${i ? 'L' : 'M'}${r1(X(p.date))} ${r1(Y(p.close))}`).join('');

  // Regime episodes → ribbon segments; bear episodes → plot washes.
  const episodes = regimeEpisodes(rows).map((e) => ({ regime: e.regime, start: rows[e.start].date, end: rows[e.end].date }));
  const segX = (e) => [X(e.start), X(e.end) + (W - padL - padR) * (DAY / (x1 - x0))];
  const ribbon = episodes.map((e) => {
    const [a, b] = segX(e);
    return `<rect x="${r1(a)}" y="${ribbonY}" width="${Math.max(0.6, r1(b - a))}" height="${ribbonH}" class="fill-${e.regime}"/>`;
  }).join('');
  const bearLabel = (e) => {
    const ys = e.start.slice(0, 4), ye = e.end.slice(0, 4);
    return ys === ye ? ys : `${ys}–${ye.slice(2)}`;
  };
  const washes = indicator.bear_episodes.map((e) => {
    const [a, b] = segX({ start: e.start, end: e.end });
    return `<rect x="${r1(a)}" y="${padT}" width="${r1(b - a)}" height="${plotH}" class="wash-bear"/>`
      + `<text x="${r1(a + 6)}" y="${padT + 16}" class="ex-note">Bear ${bearLabel(e)}</text>`;
  }).join('');

  // Axes: right-hand log ticks, five-year x ticks.
  const yTicks = [1000, 2000, 4000, 8000];
  const grid = yTicks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" class="ex-grid"/>`
    + `<text x="${W - padR + 10}" y="${r1(Y(v)) + 4}" class="ex-tick">${v.toLocaleString('en-US')}</text>`).join('');
  const years = [];
  for (let y = 2000; y <= Number(rows[rows.length - 1].date.slice(0, 4)); y += 5) years.push(y);
  const xTicks = years.map((y) => {
    const xx = r1(X(`${y}-01-01`));
    return `<line x1="${xx}" x2="${xx}" y1="${bottom}" y2="${bottom + 6}" class="ex-axis"/>`
      + `<text x="${xx}" y="${bottom + 22}" text-anchor="middle" class="ex-tick">${y}</text>`;
  }).join('');


  // Signals: an upward arrow just below the close, pointing up at it.
  const closeOn = new Map(rows.map((r) => [r.date, r.close]));
  const arrow = (x, y) => `M${x} ${r1(y + 3)}${SIGNAL_ARROW}`;
  const markers = indicator.signals.map((s) => `<path d="${arrow(r1(X(s.date)), Y(closeOn.get(s.date)))}" class="ex-signal"><title>Signal ${fmtDateShort(s.date)}</title></path>`).join('');

  // Endpoint direct label.
  const lastRow = rows[rows.length - 1];
  const endX = r1(X(lastRow.date)), endY = r1(Y(lastRow.close));
  const endLabel = `<circle cx="${endX}" cy="${endY}" r="4" class="ex-end"/>`;

  const first = fmtMonthYear(rows[0].date), last = fmtMonthYear(lastRow.date);
  const bears = indicator.bear_episodes.length;
  const svg = `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ex1-title ex1-desc" preserveAspectRatio="xMidYMid meet">
<title id="ex1-title">S&amp;P 500 and the DoubleTrends regime classification, ${first} to ${last}</title>
<desc id="ex1-desc">Weekly S&amp;P 500 closes on a logarithmic scale, with the ${fmtCount(bears)} bear-regime episode${bears === 1 ? '' : 's'} shaded, ${indicator.signals.length} signal dates marked, and a ribbon below showing the daily regime: calm, correction, panic or bear. Readings are back-tested unless they were published on the day.</desc>
<g class="ex-washes">${washes}</g>
<g class="ex-grid-g">${grid}</g>
<path d="${line}" class="ex-line"/>
<g class="ex-markers">${markers}</g>
${endLabel}
<g class="ex-ribbon">${ribbon}</g>
<line x1="${padL}" x2="${W - padR}" y1="${bottom}" y2="${bottom}" class="ex-axis"/>
${xTicks}
<g class="ex-hover" aria-hidden="true"><line class="ex-cross" x1="0" x2="0" y1="${padT}" y2="${bottom}"/><circle class="ex-cross-dot" r="4.5" cx="0" cy="0"/></g>
</svg>`;

  // Hover payload: plot geometry + weekly points (x in viewBox units).
  const hover = {
    w: W, plotLeft: padL, plotRight: W - padR, top: padT, bottom,
    points: weekly.map((p) => [r1(X(p.date)), r1(Y(p.close)), p.date, p.close, REGIMES[p.regime].label]),
  };
  return { svg, hover: JSON.stringify(hover) };
}

module.exports = { regimeHistoryChart };
