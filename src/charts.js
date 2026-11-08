/**
 * charts.js — house-style exhibits rendered to static SVG at build time.
 *
 * Inputs are the parsed src/data/ files, passed in by build.js (see
 * indicator-data.js). Output is plain
 * markup injected into pages via {{EXHIBIT_*}} placeholders, so every chart
 * renders without JavaScript and prints cleanly. public/scripts/exhibits.js layers
 * the interactive parts on top (crosshair + tooltip, keyboard stepping).
 *
 * House style (validated palette, see styles/tokens/colors.css):
 *   price line 2px ink · hairline solid gridlines · regime colors only on the
 *   regime ribbon / mix bars / bear washes · 2px surface ring on markers ·
 *   right-hand log axis · sparse direct labels.
 */
const { REGIMES } = require('./brand.config');
const { fmtDateLong, fmtDateShort, fmtMonthYear, fmtMonthYearLong, fmtNum, fmtPct, esc } = require('./format');

const REGIME_ORDER = Object.keys(REGIMES);
const REGIME_LABEL = Object.fromEntries(REGIME_ORDER.map((g) => [g, REGIMES[g].label]));

// `daily` is src/data/regimes-daily.json, `indicator` src/data/indicator.json;
// the caller reads them, so this module never touches the file system.
function toData(daily, indicator) {
  // regimes-daily.json stores one-letter codes and carries its own key.
  const codeToRegime = Object.fromEntries(Object.entries(daily.codes).map(([g, c]) => [c, g]));
  const rows = daily.rows.map(([date, close, code]) => ({ date, close, regime: codeToRegime[code] }));
  return { rows, indicator };
}

const r1 = (x) => Math.round(x * 10) / 10;

const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const DAY = 86400000;

// ─── Exhibit 1: S&P 500 with regime ribbon ──────────────────────────────────
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
  const episodes = [];
  for (const r of rows) {
    const e = episodes[episodes.length - 1];
    if (e && e.regime === r.regime) e.end = r.date; else episodes.push({ regime: r.regime, start: r.date, end: r.date });
  }
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


  // Signals: ringed markers on the line.
  const closeOn = new Map(rows.map((r) => [r.date, r.close]));
  // Signals: an upward arrow just below the close, pointing up at it.
  const arrow = (x, y) => `M${x} ${r1(y + 3)}l7.5 10h-4.5v9h-6v-9h-4.5z`;
  const markers = indicator.signals.map((s) => `<path d="${arrow(r1(X(s.date)), Y(closeOn.get(s.date)))}" class="ex-signal"><title>Signal ${fmtDateShort(s.date)}</title></path>`).join('');

  // Endpoint direct label.
  const lastRow = rows[rows.length - 1];
  const endX = r1(X(lastRow.date)), endY = r1(Y(lastRow.close));
  const endLabel = `<circle cx="${endX}" cy="${endY}" r="4" class="ex-end"/>`;

  const first = fmtMonthYear(rows[0].date), last = fmtMonthYear(lastRow.date);
  const svg = `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ex1-title ex1-desc" preserveAspectRatio="xMidYMid meet">
<title id="ex1-title">S&amp;P 500 and the DoubleTrends regime classification, ${first} to ${last}</title>
<desc id="ex1-desc">Weekly S&amp;P 500 closes on a logarithmic scale, with the three bear-regime episodes shaded, ${indicator.signals.length} signal dates marked, and a ribbon below showing the daily regime: calm, correction, panic or bear. Readings are back-tested unless they were published on the day.</desc>
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
    points: weekly.map((p) => [r1(X(p.date)), r1(Y(p.close)), p.date, p.close, REGIME_LABEL[p.regime]]),
  };
  return { svg, hover: JSON.stringify(hover) };
}

// ─── Exhibit 2: regime mix by calendar year ─────────────────────────────────
function regimeMixChart({ rows }) {
  const byYear = new Map();
  for (const r of rows) {
    const y = r.date.slice(0, 4);
    if (y === '1995') continue; // a single session; the series starts with 1996
    if (!byYear.has(y)) byYear.set(y, { calm: 0, correction: 0, panic: 0, bear: 0, n: 0 });
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
      const label = `${y === lastYear ? `${y} year to date` : y} · ${REGIME_LABEL[g]}: ${share.toFixed(0)}% of sessions (${t[g]} of ${t.n})`;
      return `<rect x="${r1(cx - barW / 2)}" y="${r1(yTop + SEG_GAP)}" width="${r1(barW)}" height="${r1(h)}" class="fill-${g}" tabindex="-1" data-tip="${esc(label)}"><title>${esc(label)}</title></rect>`;
    }).join('');
    const showLabel = Number(y) % 5 === 0 || y === years[0] || y === lastYear;
    const tick = showLabel ? `<text x="${r1(cx)}" y="${H - 10}" text-anchor="middle" class="ex-tick">${y === lastYear ? `${y}*` : y}</text>` : '';
    return segs + tick;
  }).join('');
  return `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ex2-title ex2-desc">
<title id="ex2-title">Share of trading sessions in each regime, by calendar year, ${years[0]} to ${lastYear}</title>
<desc id="ex2-desc">One stacked column per year: calm at the base, then correction, panic and bear. Bear sessions appear only in 2001–2003, 2008–2009 and 2022–2023.</desc>
${grid}
<g class="ex-bars">${bars}</g>
</svg>`;
}

// ─── Research-note exhibits: Maximum Drawdown ───────────────────────────────
// Drawn at the reading-column width (760 viewBox units ≈ 1:1 on screen), so
// type sizes match the page. House style: ink lines, hairline grids, regime
// colours only where the regime is the subject (exhibit 3).
const NOTE_W = 760;

// Drawdown from the trailing one-year (252-session) high, inclusive of today.
function trailingDrawdown(rows) {
  const out = new Array(rows.length);
  const dq = []; // monotonic deque of indices with decreasing closes
  for (let i = 0; i < rows.length; i++) {
    while (dq.length && rows[dq[dq.length - 1]].close <= rows[i].close) dq.pop();
    dq.push(i);
    if (dq[0] <= i - 252) dq.shift();
    out[i] = (rows[i].close / rows[dq[0]].close - 1) * 100;
  }
  return out;
}

// Declines of 10% or more from a record close: peak, trough, depth, sessions.
function recordDeclines(rows, minDepth = -10) {
  const eps = [];
  let peak = 0, ep = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].close >= rows[peak].close) {
      if (ep && ep.depth <= minDepth) eps.push(ep);
      ep = null; peak = i; continue;
    }
    const v = (rows[i].close / rows[peak].close - 1) * 100;
    if (!ep) ep = { peak, trough: i, depth: v };
    else if (v < ep.depth) { ep.depth = v; ep.trough = i; }
  }
  if (ep && ep.depth <= minDepth) eps.push({ ...ep, open: true });
  return eps.map((e) => ({ ...e, peakDate: rows[e.peak].date, troughDate: rows[e.trough].date, sessions: e.trough - e.peak }));
}

// Exhibit: drawdown from the trailing one-year high, 1996 to date.
function mddDepthChart({ rows }) {
  const series = rows.filter((r) => r.date >= '1996-01-01');
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
  const eps = recordDeclines(rows.filter((r) => r.date >= '1996-01-01'));
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
  const runs = [];
  series.forEach((r, i) => {
    const last = runs[runs.length - 1];
    if (last && last.regime === r.regime) last.end = i; else runs.push({ regime: r.regime, start: i, end: i });
  });
  const areas = runs.map((run) => {
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

// ─── HTML fragments (tables, figures) ───────────────────────────────────────
function signalTable(indicator, { limit } = {}) {
  const list = [...indicator.signals].reverse();
  const rowsHtml = (limit ? list.slice(0, limit) : list).map((s) => {
    // Forward returns: gains green, losses red (--gain / --loss); zero stays
    // ink. "From 1-yr high" is a distance, not a return, and stays uncolored.
    const sign = (v) => (v > 0 ? ' gain' : v < 0 ? ' loss' : '');
    const cell = (v) => (v === null ? '<td class="num pending">Pending</td>' : `<td class="num${sign(v)}">${fmtPct(v)}</td>`);
    return `<tr>
<td class="date">${s.date}</td>
<td class="regime"><span class="regime-key regime-key-${s.regime}"></span>${REGIME_LABEL[s.regime]}</td>
<td class="num">${fmtNum(s.close)}</td>
<td class="num">${fmtPct(s.drawdown_pct)}</td>
${cell(s.r3m_pct)}${cell(s.r1y_pct)}${cell(s.r2y_pct)}
<td class="basis">${s.basis === 'live' ? 'Live' : 'Back-tested'}</td>
</tr>`;
  }).join('\n');
  return `<table class="data-table">
<thead><tr>
<th scope="col">Signal date</th><th scope="col">Regime</th><th scope="col" class="num">S&amp;P 500 close</th><th scope="col" class="num">From 1-yr high</th>
<th scope="col" class="num">3 months</th><th scope="col" class="num">1 year</th><th scope="col" class="num">2 years</th><th scope="col">Basis</th>
</tr></thead>
<tbody>
${rowsHtml}
</tbody>
</table>`;
}

function regimeTable(indicator) {
  const desc = {
    calm: 'Low implied volatility relative to its own trailing year. Selloffs are treated as noise.',
    correction: 'Neither calm nor acute. Contained pullbacks; the default state of a market under mild pressure.',
    panic: 'An acute decline from a recent high, or volatility in the top of its one-year range.',
    bear: 'A deep, persistent drawdown with repeated oversold readings and macro pressure. Sticky until a material recovery.',
  };
  const signalRule = {
    calm: 'Not eligible', correction: 'Not eligible',
    panic: 'Eligible — every qualifying reversal', bear: 'Eligible — late-cluster reversals with same-day confirmation only',
  };
  const rowsHtml = REGIME_ORDER.map((g) => {
    const s = indicator.regimes[g];
    return `<tr>
<th scope="row"><span class="regime-key regime-key-${g}"></span>${REGIME_LABEL[g]}</th>
<td class="text">${desc[g]}</td>
<td class="text">${signalRule[g]}</td>
<td class="num">${s.share_pct.toFixed(1)}%</td>
<td class="num">${s.episodes.toLocaleString('en-US')}</td>
<td class="num">${s.median_episode_days}</td>
</tr>`;
  }).join('\n');
  return `<table class="data-table data-table-wide">
<thead><tr>
<th scope="col">Regime</th><th scope="col">Definition (summary)</th><th scope="col">Signal eligibility</th>
<th scope="col" class="num">Share of sessions</th><th scope="col" class="num">Episodes</th><th scope="col" class="num">Median episode (sessions)</th>
</tr></thead>
<tbody>
${rowsHtml}
</tbody>
</table>`;
}

function legend({ signal = true, bear = true } = {}) {
  const items = REGIME_ORDER.map((g) => `<li><span class="regime-key regime-key-${g}"></span>${REGIME_LABEL[g]}</li>`);
  if (bear) items.push('<li><span class="legend-wash"></span>Bear episode</li>');
  if (signal) items.push('<li><svg class="legend-signal" viewBox="-9 -2 18 23" aria-hidden="true"><path d="M0 0l7.5 10h-4.5v9h-6v-9h-4.5z"/></svg>Signal</li>');
  return `<ul class="exhibit-legend" aria-label="Legend">${items.join('')}</ul>`;
}

// Signal-record figures for a sub-period (research notes quote the record
// since a given date); same definitions as the full-record figures.
function sinceFigures(signals, from, key) {
  const list = signals.filter((s) => s.date >= from);
  const matured = list.filter((s) => s.r1y_pct !== null).map((s) => s.r1y_pct).sort((a, b) => a - b);
  const m = matured.length >> 1;
  const med = matured.length % 2 ? matured[m] : (matured[m - 1] + matured[m]) / 2;
  return {
    [`SIG_COUNT_SINCE_${key}`]: String(list.length),
    [`SIG_POSITIVE_1Y_SINCE_${key}`]: `${matured.filter((x) => x > 0).length} of ${matured.length}`,
    [`SIG_MEDIAN_1Y_SINCE_${key}`]: fmtPct(Math.round(med * 10) / 10),
  };
}

// ─── Placeholder map for build.js ───────────────────────────────────────────
function buildExhibits({ daily, indicator }) {
  const data = toData(daily, indicator);
  const L = indicator.latest, S = indicator.signal_stats;
  const history = regimeHistoryChart(data);

  return {
    EXHIBIT_REGIME_HISTORY: history.svg,
    EXHIBIT_REGIME_HISTORY_DATA: history.hover.replace(/</g, '\\u003c'),
    EXHIBIT_REGIME_MIX: regimeMixChart(data),
    EXHIBIT_LEGEND: legend(),
    EXHIBIT_LEGEND_REGIMES: legend({ signal: false, bear: false }),
    TABLE_SIGNALS_ALL: signalTable(indicator),
    TABLE_SIGNALS_RECENT: signalTable(indicator, { limit: 6 }),
    TABLE_REGIMES: regimeTable(indicator),
    EXHIBIT_MDD_DEPTH: mddDepthChart(data),
    EXHIBIT_MDD_DURATION: mddDurationChart(data),
    EXHIBIT_MDD_REGIME: mddRegimeChart(data),
    MDD_DECLINE_COUNT: String(recordDeclines(data.rows.filter((r) => r.date >= '1996-01-01')).length),

    IND_AS_OF: fmtDateLong(L.date),
    IND_REGIME: REGIME_LABEL[L.regime],
    IND_REGIME_KEY: L.regime,
    IND_REGIME_SINCE: fmtDateShort(L.regime_since),
    IND_REGIME_SESSIONS: String(L.regime_days),
    IND_CLOSE: fmtNum(L.close),
    IND_DRAWDOWN: fmtPct(L.drawdown_pct),

    IND_FIRST_DATE: fmtDateLong(indicator.first_date),
    IND_FIRST_YEAR: indicator.first_date.slice(0, 4),
    IND_FIRST_MONTH: fmtMonthYearLong(indicator.first_date),
    IND_TRADING_DAYS: indicator.trading_days.toLocaleString('en-US'),

    SIG_COUNT: String(S.count),
    ...sinceFigures(indicator.signals, '2016-07-01', 'JUL_2016'),
    SIG_FIRST: fmtMonthYear(S.first),
    SIG_PER_DECADE: S.per_decade.toFixed(1),
    SIG_POSITIVE_1Y: `${S.positive_1y} of ${S.matured_1y}`,
    SIG_MEDIAN_3M: fmtPct(S.median_3m_pct),
    SIG_MEDIAN_1Y: fmtPct(S.median_1y_pct),
    SIG_MEDIAN_2Y: fmtPct(S.median_2y_pct),
    SIG_WORST_1Y: fmtPct(S.worst_1y_pct),
    SIG_BEST_1Y: fmtPct(S.best_1y_pct),
  };
}

module.exports = { buildExhibits };
