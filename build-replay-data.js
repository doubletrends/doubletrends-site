/**
 * build-replay-data.js
 *
 * Reads ../doubletrends-backend/signal/backfill/fast/backfill_fast.csv and
 * emits the JSON artifacts the homepage chart and the /try sandbox
 * page consume:
 *
 *   public/replay/sp500.json     OHLC (from the existing file) enriched with
 *                                regime/watch/setup/signal per candle, plus the
 *                                authoritative signals list. Chart reads this.
 *   public/replay/history.json   One entry per signal fire (unique signal_date)
 *                                with 90d/1y/2y forward closes — same shape the
 *                                /history Telegram command produces server-side.
 *   public/replay/brief-demo.json
 *                                Trimmed BriefSnapshot fixtures for the public
 *                                /brief sandbox window, exported by the backend
 *                                worker TypeScript.
 *
 * The backfill CSV only stores `close`. OHL comes from the existing sp500.json
 * (originally sourced from yfinance) — we join the two by date.
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_CSV = path.resolve(
  __dirname,
  '..',
  'doubletrends-backend',
  'signal',
  'backfill',
  'fast',
  'backfill_fast.csv',
);
const EXISTING_SP500 = path.join(__dirname, 'public', 'replay', 'sp500.json');
const OUT_DIR = path.join(__dirname, 'public', 'replay');
const BACKEND_WORKER_DIR = path.resolve(__dirname, '..', 'doubletrends-backend', 'worker');
const BACKEND_BRIEF_DEMO_SCRIPT = path.join(
  BACKEND_WORKER_DIR,
  'src',
  'export_public_brief_demo.ts',
);
const BACKEND_BRIEF_DEMO_ARTIFACT = path.join(
  BACKEND_WORKER_DIR,
  'artifacts',
  'public-brief-demo.json',
);

// Chart trim: the homepage replay starts on 2016-07-01 so the visible window
// matches the homepage copy. History table trim: 2004 — matches the Telegram bot's
// TELEGRAM_HISTORY_CUTOFF_DATE so the homepage and /history command agree.
// Backfill itself goes back to 1995.
const CHART_START_DATE = '2016-07-01';
const HISTORY_START_DATE = '2004-01-01';

// ─── CSV parsing ──────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i];
    });
    return row;
  });
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  return v === 'True';
}

// Normalize one CSV row into a typed in-memory record.
function normalizeRow(r) {
  return {
    as_of_date: r.as_of_date,
    updated_at: r.updated_at,
    ticker: r.ticker,
    display_name: r.display_name,
    close: num(r.close),
    regime: r.regime,
    watch_active: bool(r.watch_active),
    setup_active: bool(r.setup_active),
    signal_active: bool(r.signal_active),
    signal_date: r.signal_date || null,
    vix: num(r.vix),
    fedfunds: num(r.fedfunds),
    unrate: num(r.unrate),
    cpi: num(r.cpi),
    open_at: r.open_at,
    minutes_after_open: num(r.minutes_after_open),
    closed_at: r.closed_at,
    minutes_after_close: num(r.minutes_after_close),
  };
}

// Pack the row into the BriefSnapshot shape the ported brief.ts formatters
// expect (close → close_value, vix → vix_value, etc., booleans → 0/1).
function toBriefSnapshot(row) {
  return {
    ticker: row.ticker,
    display_name: row.display_name,
    as_of_date: row.as_of_date,
    updated_at: row.updated_at,
    close_value: row.close,
    regime: row.regime,
    watch_active: row.watch_active ? 1 : 0,
    setup_active: row.setup_active ? 1 : 0,
    signal_active: row.signal_active ? 1 : 0,
    signal_date: row.signal_date,
    vix_value: row.vix,
    fedfunds_value: row.fedfunds,
    unrate_value: row.unrate,
    cpi_value: row.cpi,
    open_at: row.open_at,
    minutes_after_open: row.minutes_after_open,
    closed_at: row.closed_at,
    minutes_after_close: row.minutes_after_close,
  };
}

// ─── Date math for /history forward returns ───────────────────────────────────
function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Mirrors the D1 query in worker/src/telegram.ts /history:
//   first trading day at or after signal_date + N calendar days.
function findCloseAtOrAfter(rowsAsc, targetISO) {
  for (const r of rowsAsc) {
    if (r.as_of_date >= targetISO) return r.close;
  }
  return null;
}

// ─── Build ────────────────────────────────────────────────────────────────────
function build() {
  if (!fs.existsSync(BACKEND_CSV)) {
    throw new Error(
      `Backfill CSV not found at ${BACKEND_CSV} — check that doubletrends-backend ` +
        `is checked out beside doubletrends-frontend and that backfill/prod has run.`,
    );
  }
  if (!fs.existsSync(EXISTING_SP500)) {
    throw new Error(
      `Existing sp500.json not found at ${EXISTING_SP500} — backfill CSV has close ` +
        `only, the OHLC the chart renders comes from this file.`,
    );
  }
  if (!fs.existsSync(BACKEND_BRIEF_DEMO_SCRIPT)) {
    throw new Error(
      `Backend brief demo exporter not found at ${BACKEND_BRIEF_DEMO_SCRIPT} — ` +
        `check that doubletrends-backend is checked out beside doubletrends-frontend.`,
    );
  }

  childProcess.execFileSync(
    'node',
    ['--import', 'tsx', BACKEND_BRIEF_DEMO_SCRIPT],
    { cwd: BACKEND_WORKER_DIR, stdio: 'inherit' },
  );
  if (!fs.existsSync(BACKEND_BRIEF_DEMO_ARTIFACT)) {
    throw new Error(
      `Backend brief demo artifact not found at ${BACKEND_BRIEF_DEMO_ARTIFACT} ` +
        `after running the worker exporter.`,
    );
  }

  const csvText = fs.readFileSync(BACKEND_CSV, 'utf8');
  const rows = parseCSV(csvText).map(normalizeRow);
  rows.sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));

  const byDate = new Map(rows.map((r) => [r.as_of_date, r]));

  // ── 1. Enrich sp500.json ────────────────────────────────────────────────────
  const existing = JSON.parse(fs.readFileSync(EXISTING_SP500, 'utf8'));
  const enrichedCandles = existing.candles
    .filter((c) => c.time >= CHART_START_DATE)
    .map((c) => {
      const row = byDate.get(c.time);
      const enrichment = row
        ? {
            regime: row.regime,
            watch: row.watch_active ? 1 : 0,
            setup: row.setup_active ? 1 : 0,
            signal: row.signal_active ? 1 : 0,
          }
        : {};
      return { ...c, ...enrichment };
    });

  // Backfill is authoritative for which dates are signal fires.
  const signalDatesInRange = Array.from(
    new Set(
      rows
        .filter((r) => r.signal_active && r.signal_date && r.signal_date >= CHART_START_DATE)
        .map((r) => r.signal_date),
    ),
  ).sort();

  const sp500 = {
    ticker: existing.ticker,
    source: existing.source,
    candles: enrichedCandles,
    signals: signalDatesInRange,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'sp500.json'), JSON.stringify(sp500));
  console.log(
    `✓  sp500.json — ${enrichedCandles.length} candles, ${signalDatesInRange.length} signals`,
  );

  // ── 2. history.json — every signal fire + forward returns ──────────────────
  const allSignalDates = Array.from(
    new Set(rows.filter((r) => r.signal_active && r.signal_date).map((r) => r.signal_date)),
  ).sort();

  const historyEntries = allSignalDates
    .filter((d) => d >= HISTORY_START_DATE)
    .map((signalDate) => {
      const fire = byDate.get(signalDate);
      return {
        signal_date: signalDate,
        regime: fire ? fire.regime : null,
        signal_close: fire ? fire.close : null,
        close_90d: findCloseAtOrAfter(rows, addDaysISO(signalDate, 90)),
        close_365d: findCloseAtOrAfter(rows, addDaysISO(signalDate, 365)),
        close_730d: findCloseAtOrAfter(rows, addDaysISO(signalDate, 730)),
      };
    });

  // Summary metrics. `metrics_since_replay_start` matches the chart's visible window
  // and is what the homepage track-record tiles display. `metrics` is the
  // full-history view, kept around for the academy / longer-form pages.
  const metrics = computeMetrics(historyEntries);
  const sinceReplayStart = historyEntries.filter((e) => e.signal_date >= CHART_START_DATE);
  const metrics_since_replay_start = computeMetrics(sinceReplayStart);

  const history = {
    ticker: '^GSPC',
    display: 'S&P 500',
    entries: historyEntries,
    metrics,
    metrics_since_replay_start,
    replay_start_date: CHART_START_DATE,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'history.json'), JSON.stringify(history));
  console.log(
    `✓  history.json — ${historyEntries.length} signals total (${sinceReplayStart.length} since 2016-07-01), ` +
      `median 1y return ${metrics_since_replay_start.median_1y_pct}% / all-time ${metrics.median_1y_pct}%`,
  );

  // ── 3. brief-demo.json — worker-exported public /brief fixtures ────────────
  // Defensive boundary scrub: drop fields known to leak local state (source_csv
  // is the dev's absolute backfill-CSV path) and abort if any string value
  // still looks like an absolute filesystem path. Catches future backend
  // additions that would silently ship a path to the CDN.
  const briefDemo = JSON.parse(fs.readFileSync(BACKEND_BRIEF_DEMO_ARTIFACT, 'utf8'));
  delete briefDemo.source_csv;
  assertNoPathLeak(briefDemo, 'brief-demo.json');
  fs.writeFileSync(path.join(OUT_DIR, 'brief-demo.json'), JSON.stringify(briefDemo, null, 2));
  console.log(`✓  brief-demo.json — ${Object.keys(briefDemo.briefs ?? {}).length} demo briefs`);

  const legacyScenariosPath = path.join(OUT_DIR, 'scenarios.json');
  if (fs.existsSync(legacyScenariosPath)) {
    fs.rmSync(legacyScenariosPath, { force: true });
  }
}

// Walk every string in an arbitrary JSON value and throw on anything that
// looks like an absolute path (Windows drive letters or POSIX /Users//home/).
// Used as a build-time tripwire before writing a public artifact.
const ABSOLUTE_PATH_RE = /(?:[A-Za-z]:[\\/]|\/(?:Users|home|root|var|opt|etc)\/)/;
function assertNoPathLeak(value, label, keyPath = '') {
  if (typeof value === 'string') {
    if (ABSOLUTE_PATH_RE.test(value)) {
      throw new Error(`${label}: path-shaped value at ${keyPath || '<root>'} — ${value}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoPathLeak(item, label, `${keyPath}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assertNoPathLeak(v, label, keyPath ? `${keyPath}.${k}` : k);
    }
  }
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeMetrics(entries) {
  const pctReturn = (e, k) => (e[k] / e.signal_close - 1) * 100;

  const matured1y = entries.filter((e) => e.signal_close !== null && e.close_365d !== null);
  const returns1y = matured1y.map((e) => pctReturn(e, 'close_365d'));
  const median1y = median(returns1y);
  const positive1y = returns1y.filter((r) => r > 0).length;

  const matured90 = entries.filter((e) => e.signal_close !== null && e.close_90d !== null);
  const returns90 = matured90.map((e) => pctReturn(e, 'close_90d'));
  const median90 = median(returns90);

  return {
    total_signals: entries.length,
    matured_1y_count: matured1y.length,
    positive_1y_count: positive1y,
    median_1y_pct: median1y === null ? null : Number(median1y.toFixed(1)),
    median_90d_pct: median90 === null ? null : Number(median90.toFixed(1)),
    first_signal: entries[0]?.signal_date ?? null,
    last_signal: entries[entries.length - 1]?.signal_date ?? null,
  };
}

build();
