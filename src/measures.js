/**
 * measures.js — the calculations the site's figures and exhibits share, on
 * daily rows ({ date, close, regime }, oldest first): drawdown from the
 * trailing one-year high, declines from a record close, regime episodes, and
 * the median. Used by the exhibits (src/exhibits/), the brand ribbon
 * (scripts/build-brand.js) and the data generator (scripts/indicator-data.js).
 */

// Median of the non-null values; null when there are none.
function median(xs) {
  const a = xs.filter((x) => x !== null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Drawdown (%) from the trailing one-year (252-session) high, inclusive of today.
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

// Runs of consecutive rows in the same regime: { regime, start, end } with
// start and end as row indices (inclusive).
function regimeEpisodes(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const last = out[out.length - 1];
    if (last && last.regime === r.regime) last.end = i; else out.push({ regime: r.regime, start: i, end: i });
  });
  return out;
}

module.exports = { median, trailingDrawdown, recordDeclines, regimeEpisodes };
