/**
 * build-indicator-data.js — `npm run indicator-data`
 *
 * Reads the backend's point-in-time backfill
 *   ../doubletrends-backend/signal/backfill/fast/backfill_fast.csv
 * (produced and parity-validated by `python -m backfill.prod`) and writes the
 * data the site is built from:
 *
 *   src/data/regimes-daily.json   build input: every classified trading day
 *                                 [date, close, regime code]. Charts are drawn
 *                                 from it at build time; not shipped as-is.
 *   src/data/indicator.json       build input: the latest reading plus every
 *                                 statistic the site quotes (regime shares,
 *                                 episode lengths, signal record), so no number
 *                                 on the site is typed by hand.
 *   public/data/doubletrends-signals.csv
 *                                 public download: every signal with forward
 *                                 returns, back-tested vs live flagged.
 *
 * Run it whenever the backend backfill is regenerated; commit the outputs.
 * Everything here is derived from closes and the backend's regime/signal
 * columns — no parameter of the method is needed or exposed.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..'); // scripts/ lives one level below the repo root

const BACKEND_CSV = path.resolve(ROOT, '..', 'doubletrends-backend', 'signal', 'backfill', 'fast', 'backfill_fast.csv');
const SRC_DATA = path.join(ROOT, 'src', 'data');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

// First trading day the live pipeline wrote brief_history (first D1 row with a
// live, non-backfill timestamp). Everything before it is a point-in-time
// reconstruction and is labelled back-tested.
const LIVE_SINCE = '2026-06-15';

// Published signal record starts here. All signals the backfill contains are
// shown, including the early misses — a provider publishes its whole history.
const SIGNAL_RECORD_START = '1996-01-01';

const REGIME_CODE = { calm: 'c', correction: 'k', panic: 'p', bear: 'b' };
const REGIMES = ['calm', 'correction', 'panic', 'bear'];

// ─── Load ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(BACKEND_CSV)) {
  console.error(`✗  Missing ${BACKEND_CSV}\n   Run \`python -m backfill.prod\` in doubletrends-backend/signal first.`);
  process.exit(1);
}
const lines = fs.readFileSync(BACKEND_CSV, 'utf8').trim().split(/\r?\n/);
const header = lines[0].split(',');
const rows = lines.slice(1).map((line) => {
  const v = line.split(',');
  const o = {};
  header.forEach((h, i) => { o[h] = v[i]; });
  return {
    date: o.as_of_date,
    close: Number(o.close),
    regime: o.regime,
    watch: o.watch_active === 'True',
    setup: o.setup_active === 'True',
    signalActive: o.signal_active === 'True',
    signalDate: o.signal_date || null,
  };
});
for (const r of rows) {
  if (!REGIME_CODE[r.regime]) throw new Error(`unknown regime "${r.regime}" on ${r.date}`);
  if (!Number.isFinite(r.close)) throw new Error(`bad close on ${r.date}`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const round = (x, d = 1) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const median = (xs) => {
  const a = xs.filter((x) => x !== null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const addDays = (iso, n) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
// First trading day on/after `iso`, or null if the history ends before it.
const firstOnOrAfter = (() => {
  const dates = rows.map((r) => r.date);
  return (iso) => {
    let lo = 0, hi = dates.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] < iso) lo = mid + 1; else hi = mid; }
    return lo < dates.length ? lo : null;
  };
})();
const index = new Map(rows.map((r, i) => [r.date, i]));

// Drawdown from the trailing 252-session closing high (inclusive of today).
const drawdown = rows.map((r, i) => {
  let hi = -Infinity;
  for (let j = Math.max(0, i - 251); j <= i; j++) hi = Math.max(hi, rows[j].close);
  return (r.close / hi - 1) * 100;
});

// ─── Regime episodes and shares ─────────────────────────────────────────────
const episodes = [];
for (const r of rows) {
  const last = episodes[episodes.length - 1];
  if (last && last.regime === r.regime) { last.end = r.date; last.days++; }
  else episodes.push({ regime: r.regime, start: r.date, end: r.date, days: 1 });
}
const regimeStats = Object.fromEntries(REGIMES.map((g) => {
  const eps = episodes.filter((e) => e.regime === g);
  const days = eps.reduce((s, e) => s + e.days, 0);
  return [g, {
    days,
    share_pct: round((days / rows.length) * 100),
    episodes: eps.length,
    median_episode_days: median(eps.map((e) => e.days)),
    longest_episode_days: Math.max(...eps.map((e) => e.days)),
  }];
}));
const bearEpisodes = episodes
  .filter((e) => e.regime === 'bear')
  .map(({ start, end, days }) => ({ start, end, days }));

// ─── Signals ────────────────────────────────────────────────────────────────
const signalDates = [...new Set(rows.map((r) => r.signalDate).filter(Boolean))]
  .filter((d) => d >= SIGNAL_RECORD_START)
  .sort();
const forward = (i0, calendarDays) => {
  const j = firstOnOrAfter(addDays(rows[i0].date, calendarDays));
  return j === null ? null : round((rows[j].close / rows[i0].close - 1) * 100);
};
const signals = signalDates.map((d) => {
  const i = index.get(d);
  if (i === undefined) throw new Error(`signal date ${d} not in history`);
  return {
    date: d,
    regime: rows[i].regime,
    close: round(rows[i].close, 2),
    drawdown_pct: round(drawdown[i]),
    r3m_pct: forward(i, 91),
    r1y_pct: forward(i, 365),
    r2y_pct: forward(i, 730),
    basis: d >= LIVE_SINCE ? 'live' : 'back-tested',
  };
});
const matured = (k) => signals.filter((s) => s[k] !== null);
const signalStats = {
  count: signals.length,
  first: signals[0]?.date ?? null,
  last: signals[signals.length - 1]?.date ?? null,
  live_count: signals.filter((s) => s.basis === 'live').length,
  per_decade: round(signals.length / (rows.length / 252) * 10, 1),
  matured_1y: matured('r1y_pct').length,
  positive_1y: matured('r1y_pct').filter((s) => s.r1y_pct > 0).length,
  median_3m_pct: round(median(signals.map((s) => s.r3m_pct))),
  median_1y_pct: round(median(signals.map((s) => s.r1y_pct))),
  median_2y_pct: round(median(signals.map((s) => s.r2y_pct))),
  worst_1y_pct: Math.min(...matured('r1y_pct').map((s) => s.r1y_pct)),
  best_1y_pct: Math.max(...matured('r1y_pct').map((s) => s.r1y_pct)),
};

// ─── Latest reading ─────────────────────────────────────────────────────────
const last = rows[rows.length - 1];
const lastEpisode = episodes[episodes.length - 1];
const latest = {
  date: last.date,
  close: round(last.close, 2),
  regime: last.regime,
  regime_since: lastEpisode.start,
  regime_days: lastEpisode.days,
  drawdown_pct: round(drawdown[rows.length - 1]),
  watch: last.watch,
  setup: last.setup,
  signal_active: last.signalActive,
  last_signal: signalStats.last,
};

const indicator = {
  generated_from: 'doubletrends-backend/signal/backfill/fast/backfill_fast.csv',
  first_date: rows[0].date,
  last_date: last.date,
  trading_days: rows.length,
  live_since: LIVE_SINCE,
  latest,
  regimes: regimeStats,
  bear_episodes: bearEpisodes,
  signals,
  signal_stats: signalStats,
};

// ─── Write ──────────────────────────────────────────────────────────────────
fs.mkdirSync(SRC_DATA, { recursive: true });
fs.mkdirSync(PUBLIC_DATA, { recursive: true });

fs.writeFileSync(path.join(SRC_DATA, 'indicator.json'), JSON.stringify(indicator, null, 2) + '\n');
fs.writeFileSync(
  path.join(SRC_DATA, 'regimes-daily.json'),
  JSON.stringify({ fields: ['date', 'close', 'regime'], codes: REGIME_CODE, rows: rows.map((r) => [r.date, round(r.close, 2), REGIME_CODE[r.regime]]) }) + '\n',
);
const csv = [
  'signal_date,regime_at_signal,sp500_close,drawdown_from_1y_high_pct,return_3m_pct,return_1y_pct,return_2y_pct,basis',
  ...signals.map((s) => [s.date, s.regime, s.close, s.drawdown_pct, s.r3m_pct ?? '', s.r1y_pct ?? '', s.r2y_pct ?? '', s.basis].join(',')),
].join('\n') + '\n';
fs.writeFileSync(path.join(PUBLIC_DATA, 'doubletrends-signals.csv'), csv);

console.log(`✓  ${rows.length} trading days ${rows[0].date} → ${last.date}`);
console.log(`✓  latest: ${latest.date} ${latest.regime} (since ${latest.regime_since})`);
console.log(`✓  ${signals.length} signals; ${signalStats.positive_1y}/${signalStats.matured_1y} positive at 1y, median ${signalStats.median_1y_pct}%`);
console.log('✓  wrote src/data/indicator.json, src/data/regimes-daily.json, public/data/doubletrends-signals.csv');
