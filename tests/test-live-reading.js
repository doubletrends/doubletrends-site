// Live reading contract (public/js/live-reading.js, src/partials/header.html,
// src/partials/reading-card.html, the backend's GET /api/public/reading):
//
//   - every page's top bar carries the regime and as-of hooks, and every page
//     loads the script with the API address, the regime labels and the
//     build's reading time;
//   - every reading card carries its five hooks;
//   - the built HTML says exactly what the script would write for the same
//     reading, so a swap only ever changes the reading, never the wording;
//   - an intraday reading is worded as one; malformed readings are refused;
//   - the script writes text only (never HTML) and only into [data-live].
const fs = require('fs');
const path = require('path');
const { ROOT, DIST, walk, relPosix, decode, report } = require('./utils');
const { texts, valid } = require('../public/js/live-reading');
const { REGIMES } = require('../src/regimes');
const { PUBLIC_READING_URL } = require('../src/site.config');
const indicator = require('../src/data/indicator.json');

const LABELS = Object.fromEntries(Object.entries(REGIMES).map(([k, r]) => [k, r.label]));
const TOP = ['regime', 'top-asof'];
const CARD = ['card-asof', 'swatch', 'regime', 'close', 'updated'];

function liveText(html, key) {
  return [...html.matchAll(new RegExp(`<[a-z0-9]+\\b[^>]*\\bdata-live="${key}"[^>]*>([^<]*)<`, 'g'))].map((m) => decode(m[1]));
}

function main() {
  const errors = [];
  const L = indicator.latest;
  const expected = texts({ date: L.date, regime: L.regime, close: L.close, updated_at: L.updated_at, final: true }, LABELS);
  const pages = walk(DIST).filter((f) => f.endsWith('.html') && !relPosix(f, DIST).startsWith('public/'));
  let cards = 0;

  for (const file of pages) {
    const rel = relPosix(file, DIST);
    const html = fs.readFileSync(file, 'utf8');

    const tag = (html.match(/<script\b[^>]*live-reading\.js[^>]*>/) || [''])[0];
    if (!tag) { errors.push(`${rel}: does not load live-reading.js`); continue; }
    if (!tag.includes(`data-api="${PUBLIC_READING_URL}"`)) errors.push(`${rel}: script lacks data-api ${PUBLIC_READING_URL}`);
    if (!tag.includes(`data-built="${L.updated_at}"`)) errors.push(`${rel}: script lacks data-built ${L.updated_at}`);
    const labels = (tag.match(/data-labels='([^']*)'/) || [])[1];
    try { if (JSON.stringify(JSON.parse(labels)) !== JSON.stringify(LABELS)) errors.push(`${rel}: data-labels differ from src/regimes.js`); }
    catch { errors.push(`${rel}: data-labels is not JSON`); }

    const header = (html.match(/<div class="utility-bar">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
    for (const k of TOP) if (!new RegExp(`data-live="${k}"`).test(header)) errors.push(`${rel}: top bar lacks data-live="${k}"`);

    const card = (html.match(/<aside class="reading"[\s\S]*?<\/aside>/) || [''])[0];
    if (card) {
      cards++;
      for (const k of CARD) if (!new RegExp(`data-live="${k}"`).test(card)) errors.push(`${rel}: reading card lacks data-live="${k}"`);
      if (!new RegExp(`data-live="swatch"`).test(card) || !card.includes(`regime-key-${L.regime}`)) errors.push(`${rel}: swatch is not regime-key-${L.regime}`);
    }

    for (const [k, want] of Object.entries(expected)) {
      for (const got of liveText(html, k)) if (got !== want) errors.push(`${rel}: data-live="${k}" says "${got}", the script would write "${want}"`);
    }
  }
  if (!cards) errors.push('no page has a reading card');

  // Intraday wording, and refusals.
  const intraday = texts({ date: '2026-11-11', regime: 'correction', close: 7001.5, updated_at: '2026-11-11T19:00:12Z', final: false }, LABELS);
  const want = { regime: 'Correction', close: '7,001.50', 'top-asof': 'intraday, 2:00 p.m. ET', 'card-asof': 'As of 2:00 p.m. ET, November 11, 2026 · market open', updated: 'Nov 11, 2:00 p.m. ET' };
  for (const [k, v] of Object.entries(want)) if (intraday[k] !== v) errors.push(`intraday ${k}: "${intraday[k]}", expected "${v}"`);
  const good = { date: '2026-11-11', regime: 'panic', close: 1, updated_at: '2026-11-11T21:20:00Z', final: true };
  if (!valid(good, LABELS)) errors.push('a well-formed reading is refused');
  for (const [why, bad] of [
    ['unknown regime', { ...good, regime: 'boom' }], ['bad date', { ...good, date: '11/11/2026' }],
    ['close as text', { ...good, close: '7000' }], ['no final flag', { ...good, final: undefined }],
    ['bad timestamp', { ...good, updated_at: 'soon' }], ['inherited key', { ...good, regime: 'toString' }],
  ]) if (valid(bad, LABELS)) errors.push(`a reading with ${why} is accepted`);

  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'live-reading.js'), 'utf8');
  if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src)) errors.push('live-reading.js writes HTML; it may set text only');
  if (!/querySelectorAll\('\[data-live\]'\)/.test(src)) errors.push('live-reading.js must select [data-live] elements only');

  report(errors, `Live reading test (${pages.length} pages, ${cards} cards)`);
}

main();
