/**
 * tables.js — the data tables: the signal record and the regime summary, and
 * the legend the regime exhibits share.
 */
const { REGIMES, REGIME_ORDER } = require('../regimes');
const { fmtNum, fmtPct } = require('../format');
const { SIGNAL_ARROW } = require('./shared');

function signalTable(indicator, { limit } = {}) {
  const list = [...indicator.signals].reverse();
  const rowsHtml = (limit ? list.slice(0, limit) : list).map((s) => {
    // Forward returns: gains green, losses red (--gain / --loss); zero stays
    // ink. "From 1-yr high" is a distance, not a return, and stays uncolored.
    const sign = (v) => (v > 0 ? ' gain' : v < 0 ? ' loss' : '');
    const cell = (v) => (v === null ? '<td class="num pending">Pending</td>' : `<td class="num${sign(v)}">${fmtPct(v)}</td>`);
    return `<tr>
<td class="date">${s.date}</td>
<td class="regime"><span class="regime-key regime-key-${s.regime}"></span>${REGIMES[s.regime].label}</td>
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
  const rowsHtml = REGIME_ORDER.map((g) => {
    const s = indicator.regimes[g];
    return `<tr>
<th scope="row"><span class="regime-key regime-key-${g}"></span>${REGIMES[g].label}</th>
<td class="text">${REGIMES[g].definition}</td>
<td class="text">${REGIMES[g].eligibility}</td>
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
  const items = REGIME_ORDER.map((g) => `<li><span class="regime-key regime-key-${g}"></span>${REGIMES[g].label}</li>`);
  if (bear) items.push('<li><span class="legend-wash"></span>Bear episode</li>');
  if (signal) items.push(`<li><svg class="legend-signal" viewBox="-9 -2 18 23" aria-hidden="true"><path d="M0 0${SIGNAL_ARROW}"/></svg>Signal</li>`);
  return `<ul class="exhibit-legend" aria-label="Legend">${items.join('')}</ul>`;
}

module.exports = { signalTable, regimeTable, legend };
