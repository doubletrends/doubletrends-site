/**
 * format.js — how dates, numbers and text are written on the site: long and
 * short dates from ISO strings, fixed-decimal numbers, small counts as words,
 * signed percentages with a true minus sign, HTML escaping, and JSON made safe
 * inside a <script>. Used by the exhibits and the build.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const parts = (iso) => iso.split('-').map(Number);
const fmtDateLong = (iso) => { const [y, m, d] = parts(iso); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const fmtDateShort = (iso) => { const [y, m, d] = parts(iso); return `${MON[m - 1]} ${d}, ${y}`; };
const fmtMonthYear = (iso) => { const [y, m] = parts(iso); return `${MON[m - 1]} ${y}`; };
const fmtMonthYearLong = (iso) => { const [y, m] = parts(iso); return `${MONTHS[m - 1]} ${y}`; };
const fmtNum = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
// Small counts in running text are spelled out ("three episodes").
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const fmtCount = (n) => NUMBER_WORDS[n] ?? String(n);
const fmtPct = (x, d = 1) => (x === null || x === undefined ? null : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Escapes bare ampersands only, leaving entities already in the text intact.
const escAmp = (s) => s.replace(/&(?![a-z]+;|#[0-9]+;)/gi, '&amp;');
// JSON placed inside a <script> element: no "</" can close it early.
const jsonInScript = (json) => json.replace(/</g, '\\u003c');

module.exports = { fmtDateLong, fmtDateShort, fmtMonthYear, fmtMonthYearLong, fmtNum, fmtCount, fmtPct, esc, escAmp, jsonInScript };
