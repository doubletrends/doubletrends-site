/**
 * charts.js — house-style exhibits rendered to static SVG at build time.
 *
 * Inputs come from src/data/ (see build-indicator-data.js). Output is plain
 * markup injected into pages via {{EXHIBIT_*}} placeholders, so every chart
 * renders without JavaScript and prints cleanly. public/js/exhibits.js layers
 * the interactive parts on top (crosshair + tooltip, keyboard stepping).
 *
 * House style (validated palette, see styles/tokens/colors.css):
 *   price line 2px ink · hairline solid gridlines · regime colors only on the
 *   regime ribbon / mix bars / bear washes · 2px surface ring on markers ·
 *   right-hand log axis · sparse direct labels.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

const REGIME_ORDER = ['calm', 'correction', 'panic', 'bear'];
const REGIME_LABEL = { calm: 'Calm', correction: 'Correction', panic: 'Panic', bear: 'Bear' };
const CODE_TO_REGIME = { c: 'calm', k: 'correction', p: 'panic', b: 'bear' };

function loadData() {
  const daily = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'regimes-daily.json'), 'utf8'));
  const indicator = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'indicator.json'), 'utf8'));
  const rows = daily.rows.map(([date, close, code]) => ({ date, close, regime: CODE_TO_REGIME[code] }));
  return { rows, indicator };
}

// ─── Formatting ─────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const parts = (iso) => iso.split('-').map(Number);
const fmtDateLong = (iso) => { const [y, m, d] = parts(iso); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const fmtDateShort = (iso) => { const [y, m, d] = parts(iso); return `${MON[m - 1]} ${d}, ${y}`; };
const fmtMonthYear = (iso) => { const [y, m] = parts(iso); return `${MON[m - 1]} ${y}`; };
const fmtNum = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (x, d = 1) => (x === null || x === undefined ? null : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  // Live publication boundary.
  const live = indicator.live_since;
  const xl = r1(X(live));
  const liveMark = `<line x1="${xl}" x2="${xl}" y1="${padT - 14}" y2="${bottom}" class="ex-live"/>`
    + `<text x="${xl - 6}" y="${padT - 18}" text-anchor="end" class="ex-note">Back-tested</text>`
    + `<text x="${xl + 6}" y="${padT - 18}" class="ex-note ex-note-strong">Live</text>`;

  // Signals: ringed markers on the line.
  const closeOn = new Map(rows.map((r) => [r.date, r.close]));
  const markers = indicator.signals.map((s) => `<circle cx="${r1(X(s.date))}" cy="${r1(Y(closeOn.get(s.date)))}" r="4.5" class="ex-signal"><title>Signal ${fmtDateShort(s.date)}</title></circle>`).join('');

  // Endpoint direct label.
  const lastRow = rows[rows.length - 1];
  const endX = r1(X(lastRow.date)), endY = r1(Y(lastRow.close));
  const endLabel = `<circle cx="${endX}" cy="${endY}" r="4" class="ex-end"/>`;

  const first = fmtMonthYear(rows[0].date), last = fmtMonthYear(lastRow.date);
  const svg = `<svg class="exhibit-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ex1-title ex1-desc" preserveAspectRatio="xMidYMid meet">
<title id="ex1-title">S&amp;P 500 and the DoubleTrends regime classification, ${first} to ${last}</title>
<desc id="ex1-desc">Weekly S&amp;P 500 closes on a logarithmic scale, with the three bear-regime episodes shaded, ${indicator.signals.length} signal dates marked, and a ribbon below showing the daily regime: calm, correction, panic or bear. Readings before ${fmtDateLong(live)} are back-tested.</desc>
<g class="ex-washes">${washes}</g>
<g class="ex-grid-g">${grid}</g>
<path d="${line}" class="ex-line"/>
<g class="ex-markers">${markers}</g>
${endLabel}
<g class="ex-ribbon">${ribbon}</g>
<line x1="${padL}" x2="${W - padR}" y1="${bottom}" y2="${bottom}" class="ex-axis"/>
${xTicks}
${liveMark}
<g class="ex-hover" aria-hidden="true"><line class="ex-cross" x1="0" x2="0" y1="${padT}" y2="${bottom}"/><circle class="ex-cross-dot" r="4.5" cx="0" cy="0"/></g>
</svg>`;

  // Hover payload: plot geometry + weekly points (x in viewBox units).
  const hover = {
    w: W, plotLeft: padL, plotRight: W - padR, top: padT, bottom,
    points: weekly.map((p) => [r1(X(p.date)), r1(Y(p.close)), p.date, p.close, p.regime[0]]),
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

// ─── HTML fragments (tables, figures) ───────────────────────────────────────
function signalTable(indicator, { limit } = {}) {
  const list = [...indicator.signals].reverse();
  const rowsHtml = (limit ? list.slice(0, limit) : list).map((s) => {
    const cell = (v) => (v === null ? '<td class="num pending">Pending</td>' : `<td class="num ${v < 0 ? 'neg' : ''}">${fmtPct(v)}</td>`);
    return `<tr>
<td class="date">${s.date}</td>
<td class="regime"><span class="regime-key regime-key-${s.regime}"></span>${REGIME_LABEL[s.regime]}</td>
<td class="num">${fmtNum(s.close)}</td>
<td class="num ${s.drawdown_pct < 0 ? '' : ''}">${fmtPct(s.drawdown_pct)}</td>
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
  if (signal) items.push('<li><span class="legend-signal"></span>Signal</li>');
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
function buildExhibits() {
  const data = loadData();
  const { indicator } = data;
  const L = indicator.latest, S = indicator.signal_stats;
  const history = regimeHistoryChart(data);
  const daysSinceSignal = Math.round((toMs(L.date) - toMs(L.last_signal)) / DAY);
  const signalState = L.signal_active ? 'Active' : L.setup ? 'Setup forming' : L.watch ? 'Watch' : 'None active';

  return {
    EXHIBIT_REGIME_HISTORY: history.svg,
    EXHIBIT_REGIME_HISTORY_DATA: history.hover.replace(/</g, '\\u003c'),
    EXHIBIT_REGIME_MIX: regimeMixChart(data),
    EXHIBIT_LEGEND: legend(),
    EXHIBIT_LEGEND_REGIMES: legend({ signal: false, bear: false }),
    TABLE_SIGNALS_ALL: signalTable(indicator),
    TABLE_SIGNALS_RECENT: signalTable(indicator, { limit: 6 }),
    TABLE_REGIMES: regimeTable(indicator),

    IND_AS_OF: fmtDateLong(L.date),
    IND_AS_OF_ISO: L.date,
    IND_REGIME: REGIME_LABEL[L.regime],
    IND_REGIME_KEY: L.regime,
    IND_REGIME_SINCE: fmtDateShort(L.regime_since),
    IND_REGIME_SESSIONS: String(L.regime_days),
    IND_CLOSE: fmtNum(L.close),
    IND_DRAWDOWN: fmtPct(L.drawdown_pct),
    IND_SIGNAL_STATE: signalState,
    IND_LAST_SIGNAL: fmtDateShort(L.last_signal),
    IND_DAYS_SINCE_SIGNAL: daysSinceSignal.toLocaleString('en-US'),

    IND_FIRST_DATE: fmtDateLong(indicator.first_date),
    IND_FIRST_YEAR: indicator.first_date.slice(0, 4),
    IND_FIRST_MONTH: MONTHS[Number(indicator.first_date.slice(5, 7)) - 1] + ' ' + indicator.first_date.slice(0, 4),
    IND_TRADING_DAYS: indicator.trading_days.toLocaleString('en-US'),
    IND_LIVE_SINCE: fmtDateLong(indicator.live_since),

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

    REG_PANIC_SHARE: `${indicator.regimes.panic.share_pct.toFixed(0)}%`,
    REG_BEAR_SHARE: `${indicator.regimes.bear.share_pct.toFixed(0)}%`,
    REG_CALM_SHARE: `${indicator.regimes.calm.share_pct.toFixed(0)}%`,
    REG_CORRECTION_SHARE: `${indicator.regimes.correction.share_pct.toFixed(0)}%`,
  };
}

module.exports = { buildExhibits, fmtDateLong, fmtDateShort };
