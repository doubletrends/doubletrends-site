/**
 * drawdowns.js — the Maximum Drawdown note's three exhibits: drawdown from the
 * trailing one-year high, every 10%+ decline by depth and duration, and
 * drawdown since 2018 coloured by regime. House style: ink lines, hairline
 * grids, regime colours only where the regime is the subject (the third).
 */
const { trailingDrawdown, recordDeclines, regimeEpisodes } = require('../measures');
const { fmtMonthYear, fmtPct, esc } = require('../format');
const { r1, toMs, NOTE_W, HISTORY_START } = require('./shared');

// Every decline of 10% or more from a record close since HISTORY_START.
const historyDeclines = (rows) => recordDeclines(rows.filter((r) => r.date >= HISTORY_START));

// Exhibit: drawdown from the trailing one-year high, 1996 to date.
function mddDepthChart({ rows }) {
  const series = rows.filter((r) => r.date >= HISTORY_START);
  const dd = trailingDrawdown(rows).slice(rows.length - series.length);
  const W = NOTE_W, padL = 6, padR = 52, padT = 18, plotH = 230, axisH = 30, H = padT + plotH + axisH;
  const x0 = toMs(series[0].date), x1 = toMs(series[series.length - 1].date);
  const X = (iso) => padL + ((toMs(iso) - x0) / (x1 - x0)) * (W - padL - padR);
  const Y = (v) => padT + (-v / 60) * plotH;
  // Weekly minimum keeps every trough while trimming the path.
  const pts = [];
  for (let i = 0; i < series.length; i += 5) {
    let k = i;
    for (let j = i; j < Math.min(i + 5, series.length); j++) if (dd[j] < dd[k]) k = j;
    pts.push([X(series[k].date), Y(dd[k])]);
  }
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join('');
  const area = `${line}L${r1(pts[pts.length - 1][0])} ${Y(0)}L${r1(pts[0][0])} ${Y(0)}Z`;
  const grid = [0, -20, -40, -60].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" class="ex-grid"/>`
    + `<text x="${W - padR + 8}" y="${r1(Y(v)) + 4}" class="ex-tick">${v === 0 ? '0%' : `−${-v}%`}</text>`).join('');
  const years = [];
  for (let y = 2000; y <= Number(series[series.length - 1].date.slice(0, 4)); y += 5) years.push(y);
  const ticks = years.map((y) => `<text x="${r1(X(`${y}-01-01`))}" y="${H - 8}" text-anchor="middle" class="ex-tick">${y}</text>`).join('');
  // Label the deepest point of each named stress period.
  const labelIn = (from, to, name) => {
    let k = -1;
    series.forEach((r, i) => { if (r.date >= from && r.date <= to && (k < 0 || dd[i] < dd[k])) k = i; });
    const x = X(series[k].date), y = Y(dd[k]);
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="3" class="ex-end"/><text x="${r1(x)}" y="${r1(y) + 17}" text-anchor="middle" class="ex-note">${name} ${fmtPct(dd[k], 0)}</text>`;
  };
  const troughIn = (from, to) => {
    let k = -1;
    series.forEach((r, i) => { if (r.date >= from && r.date <= to && (k < 0 || dd[i] < dd[k])) k = i; });
    return { date: series[k].date, v: dd[k] };
  };
  const named = [['2001-01-01', '2003-06-30', '2002'], ['2008-01-01', '2009-12-31', '2009'], ['2020-01-01', '2020-12-31', '2020'], ['2022-01-01', '2022-12-31', '2022']];
  const labels = named.map(([a, b, n]) => labelIn(a, b, n)).join('');
  const troughText = named.map(([a, b]) => troughIn(a, b)).sort((p, q) => p.v - q.v)
    .map((t) => `${Math.abs(t.v).toFixed(0)}% in ${fmtMonthYear(t.date)}`).join(', ');
  const first = fmtMonthYear(series[0].date), last = fmtMonthYear(series[series.length - 1].date);
  return `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="mdd1-title mdd1-desc">
<title id="mdd1-title">S&amp;P 500 drawdown from its trailing one-year high, ${first} to ${last}</title>
<desc id="mdd1-desc">The percentage by which the S&amp;P 500 close sat below its highest close of the previous year, each week. The deepest readings were ${troughText}.</desc>
${grid}
<path d="${area}" class="ex-area"/>
<path d="${line}" class="ex-line ex-line-thin"/>
${labels}
${ticks}
</svg>`;
}

// Exhibit: every 10%+ decline from a record close, depth vs duration.
function mddDurationChart({ rows }) {
  const eps = historyDeclines(rows);
  const W = NOTE_W, padL = 52, padR = 16, padT = 16, plotH = 260, axisH = 44, H = padT + plotH + axisH;
  const lx0 = Math.log10(5), lx1 = Math.log10(1000);
  const X = (n) => padL + ((Math.log10(n) - lx0) / (lx1 - lx0)) * (W - padL - padR);
  const Y = (v) => padT + (-v / 60) * plotH;
  const grid = [-10, -20, -30, -40, -50, -60].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" class="ex-grid"/>`
    + `<text x="${padL - 8}" y="${r1(Y(v)) + 4}" text-anchor="end" class="ex-tick">−${-v}%</text>`).join('');
  const xt = [5, 10, 20, 50, 100, 200, 500, 1000].map((n) => `<line x1="${r1(X(n))}" x2="${r1(X(n))}" y1="${padT + plotH}" y2="${padT + plotH + 5}" class="ex-axis"/>`
    + `<text x="${r1(X(n))}" y="${padT + plotH + 20}" text-anchor="middle" class="ex-tick">${n}</text>`).join('');
  const xTitle = `<text x="${r1((padL + W - padR) / 2)}" y="${H - 4}" text-anchor="middle" class="ex-note">Trading sessions from record close to trough (log scale)</text>`;
  // Labels: the trough year, or month and year where a year repeats. A label
  // goes left of its dot when a neighbour sits close on the right or the
  // dot is near the right edge.
  const pos = eps.map((e) => ({ e, x: X(e.sessions), y: Y(e.depth) }));
  const yearCount = {};
  for (const { e } of pos) yearCount[e.troughDate.slice(0, 4)] = (yearCount[e.troughDate.slice(0, 4)] || 0) + 1;
  const dots = pos.map(({ e, x, y }) => {
    const yr = yearCount[e.troughDate.slice(0, 4)] > 1 ? fmtMonthYear(e.troughDate) : e.troughDate.slice(0, 4);
    const label = `${fmtMonthYear(e.peakDate)} peak to ${fmtMonthYear(e.troughDate)} trough: ${fmtPct(e.depth)} over ${e.sessions} sessions`;
    const crowded = pos.some((o) => o.x > x && o.x - x < 60 && Math.abs(o.y - y) < 14);
    const right = !crowded && x < W - padR - 60;
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="5" class="ex-dot"><title>${esc(label)}</title></circle>`
      + `<text x="${r1(x + (right ? 9 : -9))}" y="${r1(y) + 4}" text-anchor="${right ? 'start' : 'end'}" class="ex-note">${yr}</text>`;
  }).join('');
  const byTrough = (y) => eps.find((e) => e.troughDate.startsWith(y));
  const [e20, e22] = [byTrough('2020'), byTrough('2022')];
  const deepest = [...eps].sort((a, b) => a.depth - b.depth).slice(0, 2);
  return `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="mdd2-title mdd2-desc">
<title id="mdd2-title">Every S&amp;P 500 decline of 10% or more from a record close since 1996: depth against duration</title>
<desc id="mdd2-desc">${eps.length} declines. Similar depths arrived at very different speeds: the 2020 decline reached ${fmtPct(e20.depth)} in ${e20.sessions} sessions, while 2022 took ${e22.sessions} sessions to reach ${fmtPct(e22.depth)}. The two deepest (${deepest.map((e) => `${e.peakDate.slice(0, 4)}–${e.troughDate.slice(2, 4)}`).join(' and ')}) took ${deepest.map((e) => e.sessions).join(' and ')} sessions to reach their troughs.</desc>
${grid}
<line x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}" class="ex-axis"/>
${xt}
${xTitle}
${dots}
</svg>`;
}

// Exhibit: drawdown since 2018, each day coloured by its published regime.
function mddRegimeChart({ rows }) {
  const from = '2018-01-01';
  const dd = trailingDrawdown(rows);
  const start = rows.findIndex((r) => r.date >= from);
  const series = rows.slice(start), d = dd.slice(start);
  const W = NOTE_W, padL = 6, padR = 52, padT = 14, plotH = 210, axisH = 30, H = padT + plotH + axisH;
  const x0 = toMs(series[0].date), x1 = toMs(series[series.length - 1].date);
  const X = (iso) => padL + ((toMs(iso) - x0) / (x1 - x0)) * (W - padL - padR);
  const Y = (v) => padT + (-v / 40) * plotH;
  // One filled area per run of consecutive days in the same regime.
  const areas = regimeEpisodes(series).map((run) => {
    const a = Math.max(0, run.start - 1), b = Math.min(series.length - 1, run.end + 1);
    let p = `M${r1(X(series[a].date))} ${r1(Y(0))}`;
    for (let i = a; i <= b; i++) p += `L${r1(X(series[i].date))} ${r1(Y(d[i]))}`;
    p += `L${r1(X(series[b].date))} ${r1(Y(0))}Z`;
    return `<path d="${p}" class="fill-${run.regime}"/>`;
  }).join('');
  const outline = series.map((r, i) => `${i ? 'L' : 'M'}${r1(X(r.date))} ${r1(Y(d[i]))}`).join('');
  const grid = [0, -10, -20, -30, -40].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${r1(Y(v))}" y2="${r1(Y(v))}" class="ex-grid"/>`
    + `<text x="${W - padR + 8}" y="${r1(Y(v)) + 4}" class="ex-tick">${v === 0 ? '0%' : `−${-v}%`}</text>`).join('');
  const lastYear = Number(series[series.length - 1].date.slice(0, 4));
  const ticks = [];
  for (let y = 2018; y <= lastYear; y++) ticks.push(`<text x="${r1(X(`${y}-07-01`))}" y="${H - 8}" text-anchor="middle" class="ex-tick">${y}</text>`);
  return `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="mdd3-title mdd3-desc">
<title id="mdd3-title">S&amp;P 500 drawdown from its trailing one-year high since 2018, coloured by regime</title>
<desc id="mdd3-desc">Each day's drawdown is shaded by the regime the indicator assigned: calm, correction, panic or bear. Shallow drawdowns are mostly calm or correction; the fast 2020 decline is panic; the slow 2022 decline is mostly bear, and bear throughout its deepest stretch. Readings are back-tested unless they were published on the day.</desc>
${grid}
<g class="ex-regime-areas">${areas}</g>
<path d="${outline}" class="ex-line ex-line-hair"/>
${ticks.join('')}
</svg>`;
}

module.exports = { mddDepthChart, mddDurationChart, mddRegimeChart, historyDeclines };
