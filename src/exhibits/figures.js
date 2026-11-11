/**
 * figures.js — the numbers the pages quote in running text ({{IND_*}},
 * {{SIG_*}}), formatted from src/data/indicator.json.
 */
const { REGIMES } = require('../regimes');
const { median } = require('../measures');
const { fmtDateLong, fmtMonthYear, fmtMonthYearLong, fmtPct } = require('../format');
const { LOADING } = require('../../public/js/live-reading');

// Signal-record figures for a sub-period (research notes quote the record
// since a given date); same definitions as the full-record figures.
function sinceFigures(signals, from, key) {
  const list = signals.filter((s) => s.date >= from);
  const matured = list.map((s) => s.r1y_pct).filter((x) => x !== null);
  return {
    [`SIG_COUNT_SINCE_${key}`]: String(list.length),
    [`SIG_POSITIVE_1Y_SINCE_${key}`]: `${matured.filter((x) => x > 0).length} of ${matured.length}`,
    [`SIG_MEDIAN_1Y_SINCE_${key}`]: fmtPct(Math.round(median(matured) * 10) / 10),
  };
}

// The live reading (top bar, reading card) has no build-time value: pages carry
// the LOADING words of public/js/live-reading.js, which then fills them in, or
// says the reading is unavailable. The script tag gets the regime labels.
const REGIME_LABELS = Object.fromEntries(Object.entries(REGIMES).map(([k, r]) => [k, r.label]));
const LIVE_FIGURES = {
  LIVE_REGIME: LOADING.regime,
  LIVE_CLOSE: LOADING.close,
  LIVE_TOP_ASOF: LOADING['top-asof'],
  LIVE_CARD_ASOF: LOADING['card-asof'],
  LIVE_UPDATED: LOADING.updated,
  LIVE_LABELS: JSON.stringify(REGIME_LABELS),
};

function indicatorFigures(indicator) {
  const L = indicator.latest, S = indicator.signal_stats;
  return {
    ...LIVE_FIGURES,
    // The data's cut-off date, quoted by pages whose tables and charts end there.
    IND_AS_OF: fmtDateLong(L.date),

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

module.exports = { indicatorFigures };
