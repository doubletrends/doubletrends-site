/**
 * format.js — how dates, numbers and text are written on the site: long and
 * short dates from ISO strings, fixed-decimal numbers, signed percentages with
 * a true minus sign, and HTML escaping. Used by the exhibits and the build.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const parts = (iso) => iso.split('-').map(Number);
const fmtDateLong = (iso) => { const [y, m, d] = parts(iso); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const fmtDateShort = (iso) => { const [y, m, d] = parts(iso); return `${MON[m - 1]} ${d}, ${y}`; };
const fmtMonthYear = (iso) => { const [y, m] = parts(iso); return `${MON[m - 1]} ${y}`; };
const fmtMonthYearLong = (iso) => { const [y, m] = parts(iso); return `${MONTHS[m - 1]} ${y}`; };
const fmtNum = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (x, d = 1) => (x === null || x === undefined ? null : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = { fmtDateLong, fmtDateShort, fmtMonthYear, fmtMonthYearLong, fmtNum, fmtPct, esc };
