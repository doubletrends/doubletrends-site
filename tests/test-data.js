// The published record agrees with itself (README: "No number is typed by
// hand"). indicator-data.js writes three files from one backfill and
// they are committed together; this fails when they drift apart — a partial
// regeneration, a hand edit, or a generator change that updates one output
// and not another.
//
//   A. Signals sit on the daily history: each signal's date, regime and close
//      are those of that trading day in regimes-daily.json.
//   B. Forward returns are the S&P 500 price change from the signal close to
//      the first close on or after 91 / 365 / 730 calendar days later
//      (null while that day is still ahead).
//   C. Labelling: a signal is "live" exactly when it falls on or after
//      live_since; every earlier one is "back-tested".
//   D. Headline figures (count, first/last, live count, 1-year hit rate,
//      medians, best/worst) are computed from the published signal list.
//   E. Regime figures: regime days add up to the trading days in the daily
//      history, and the latest reading is its last row.
//   F. The CSV download carries the same signals, row for row.
//
// Returns are compared to ±0.1 pt: they are published to one decimal and the
// daily file keeps closes to the cent.
const fs   = require('fs');
const path = require('path');
const { ROOT, report } = require('./utils');

const indicator = require('../src/data/indicator.json');
const daily     = require('../src/data/regimes-daily.json');

const HORIZONS = { r3m_pct: 91, r1y_pct: 365, r2y_pct: 730 };
const pct = (a, b) => (b / a - 1) * 100;
const round1 = (x) => Math.round(x * 10) / 10;
const median = (xs) => {
  const a = xs.filter((x) => x !== null).sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const addDays = (iso, n) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

function main() {
  const errors = [];
  const regimeOf = Object.fromEntries(Object.entries(daily.codes).map(([name, code]) => [code, name]));
  const rows = daily.rows.map(([date, close, code]) => ({ date, close, regime: regimeOf[code] }));
  const at = new Map(rows.map((r, i) => [r.date, i]));
  const firstOnOrAfter = (iso) => rows.findIndex((r) => r.date >= iso);
  const { signals, signal_stats: S, regimes, latest } = indicator;
  if (!signals.length) errors.push('indicator.json has no signals');

  for (const s of signals) {
    // A
    const i = at.get(s.date);
    if (i === undefined) { errors.push(`A: signal ${s.date} is not a trading day in regimes-daily.json`); continue; }
    if (s.regime !== rows[i].regime) errors.push(`A: signal ${s.date} regime ${s.regime}, daily history says ${rows[i].regime}`);
    if (Math.abs(s.close - rows[i].close) > 0.005) errors.push(`A: signal ${s.date} close ${s.close}, daily history says ${rows[i].close}`);
    // B
    for (const [key, days] of Object.entries(HORIZONS)) {
      const j = firstOnOrAfter(addDays(s.date, days));
      const want = j < 0 ? null : round1(pct(rows[i].close, rows[j].close));
      const ok = want === null ? s[key] === null : s[key] !== null && Math.abs(s[key] - want) <= 0.1 + 1e-9;
      if (!ok) errors.push(`B: signal ${s.date} ${key} is ${s[key]}, daily history gives ${want}`);
    }
    // C
    const basis = s.date >= indicator.live_since ? 'live' : 'back-tested';
    if (s.basis !== basis) errors.push(`C: signal ${s.date} labelled ${s.basis}, should be ${basis} (live since ${indicator.live_since})`);
  }

  // D
  const matured = signals.filter((s) => s.r1y_pct !== null).map((s) => s.r1y_pct);
  const expected = {
    count: signals.length,
    first: signals[0]?.date,
    last: signals.at(-1)?.date,
    live_count: signals.filter((s) => s.basis === 'live').length,
    matured_1y: matured.length,
    positive_1y: matured.filter((x) => x > 0).length,
    worst_1y_pct: Math.min(...matured),
    best_1y_pct: Math.max(...matured),
    median_3m_pct: round1(median(signals.map((s) => s.r3m_pct))),
    median_1y_pct: round1(median(matured)),
    median_2y_pct: round1(median(signals.map((s) => s.r2y_pct))),
  };
  for (const [key, want] of Object.entries(expected)) {
    // Medians of one-decimal returns can land on a half-step; allow the rounding.
    const ok = key.startsWith('median') ? Math.abs(S[key] - want) <= 0.1 + 1e-9 : S[key] === want;
    if (!ok) errors.push(`D: signal_stats.${key} is ${S[key]}, the signal list gives ${want}`);
  }

  // E
  const days = Object.values(regimes).reduce((n, r) => n + r.days, 0);
  if (days !== rows.length || indicator.trading_days !== rows.length) {
    errors.push(`E: regime days ${days} and trading_days ${indicator.trading_days} should both equal the ${rows.length} daily rows`);
  }
  const last = rows.at(-1);
  if (latest.date !== last.date || latest.regime !== last.regime) {
    errors.push(`E: latest reading ${latest.date} ${latest.regime}, daily history ends ${last.date} ${last.regime}`);
  }

  // F
  const csv = fs.readFileSync(path.join(ROOT, 'public', 'data', 'doubletrends-signals.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
  const fromJson = signals.map((s) => [s.date, s.regime, s.close, s.drawdown_pct, s.r3m_pct ?? '', s.r1y_pct ?? '', s.r2y_pct ?? '', s.basis].join(','));
  if (csv.length !== fromJson.length) errors.push(`F: CSV has ${csv.length} signals, indicator.json has ${fromJson.length}`);
  csv.forEach((line, k) => {
    if (fromJson[k] !== undefined && line !== fromJson[k]) errors.push(`F: CSV row ${k + 1} "${line}" ≠ indicator.json "${fromJson[k]}"`);
  });

  report(errors, `Data test (${signals.length} signals, ${rows.length} days)`);
}

main();
