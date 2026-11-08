/**
 * regimes.js — the four regimes of the DoubleTrends™ Regime Indicator, in order
 * of rising stress: the one list every exhibit, legend, table, tooltip and data
 * file reads. Each regime's color is a brand token (REGIME_COLORS in
 * brand.config.js); tests/test-brand-tokens.js keeps the two key lists equal.
 *
 *   code         one-letter code in src/data/regimes-daily.json
 *   label        the name shown on the site
 *   definition   one-line summary in the regime table
 *   eligibility  whether, and how, a signal can fire in the regime
 */
const REGIMES = {
  calm: {
    code: 'c',
    label: 'Calm',
    definition: 'Low implied volatility relative to its own trailing year. Selloffs are treated as noise.',
    eligibility: 'Not eligible',
  },
  correction: {
    code: 'k',
    label: 'Correction',
    definition: 'Neither calm nor acute. Contained pullbacks; the default state of a market under mild pressure.',
    eligibility: 'Not eligible',
  },
  panic: {
    code: 'p',
    label: 'Panic',
    definition: 'An acute decline from a recent high, or volatility in the top of its one-year range.',
    eligibility: 'Eligible — every qualifying reversal',
  },
  bear: {
    code: 'b',
    label: 'Bear',
    definition: 'A deep, persistent drawdown with repeated oversold readings and macro pressure. Sticky until a material recovery.',
    eligibility: 'Eligible — late-cluster reversals with same-day confirmation only',
  },
};

const REGIME_ORDER = Object.keys(REGIMES);

// The parsed src/data/regimes-daily.json as { date, close, regime } rows. The
// file stores one-letter codes and carries its own key (`codes`, written from
// the codes above by indicator-data.js), so it decodes even if a code changes
// before the data is regenerated.
function dailyRows(daily) {
  const regimeFor = Object.fromEntries(Object.entries(daily.codes).map(([g, c]) => [c, g]));
  return daily.rows.map(([date, close, code]) => ({ date, close, regime: regimeFor[code] }));
}

module.exports = { REGIMES, REGIME_ORDER, dailyRows };
