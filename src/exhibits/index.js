/**
 * exhibits/ — house-style exhibits rendered to static SVG and HTML at build
 * time, and the figures pages quote. One exhibit (or family) per file;
 * calculations are in src/measures.js, formatting in src/format.js.
 *
 * Inputs are the parsed src/data/ files, passed in by build.js (written by
 * scripts/indicator-data.js), so nothing here touches the file system. Output
 * is plain markup injected into pages via {{EXHIBIT_*}}, {{TABLE_*}} and
 * figure placeholders, so every chart renders without JavaScript and prints
 * cleanly. public/scripts/exhibits.js layers the interactive parts on top
 * (crosshair + tooltip, keyboard stepping).
 *
 * House style (validated palette, see styles/tokens/colors.css):
 *   price line 2px ink · hairline solid gridlines · regime colors only on the
 *   regime ribbon / mix bars / bear washes · 2px surface ring on markers ·
 *   right-hand log axis · sparse direct labels.
 */
const { jsonInScript } = require('../format');
const { regimeHistoryChart } = require('./regime-history');
const { regimeMixChart } = require('./regime-mix');
const { mddDepthChart, mddDurationChart, mddRegimeChart, historyDeclines } = require('./drawdowns');
const { signalTable, regimeTable, legend } = require('./tables');
const { indicatorFigures } = require('./figures');

// `rows` are the daily rows (dailyRows in src/regimes.js), `indicator` the
// parsed src/data/indicator.json. Returns the placeholder map: name → markup
// or text.
function buildExhibits({ rows, indicator }) {
  const data = { rows, indicator };
  const history = regimeHistoryChart(data);

  return {
    EXHIBIT_REGIME_HISTORY: history.svg,
    EXHIBIT_REGIME_HISTORY_DATA: jsonInScript(history.hover),
    EXHIBIT_REGIME_MIX: regimeMixChart(data),
    EXHIBIT_LEGEND: legend(),
    EXHIBIT_LEGEND_REGIMES: legend({ signal: false, bear: false }),
    TABLE_SIGNALS_ALL: signalTable(indicator),
    TABLE_SIGNALS_RECENT: signalTable(indicator, { limit: 6 }),
    TABLE_REGIMES: regimeTable(indicator),
    EXHIBIT_MDD_DEPTH: mddDepthChart(data),
    EXHIBIT_MDD_DURATION: mddDurationChart(data),
    EXHIBIT_MDD_REGIME: mddRegimeChart(data),
    MDD_DECLINE_COUNT: String(historyDeclines(data.rows).length),

    ...indicatorFigures(indicator),
  };
}

module.exports = { buildExhibits };
