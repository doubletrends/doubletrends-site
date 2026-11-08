/**
 * shared.js — geometry and conventions every exhibit uses.
 */

// Round to one decimal: SVG coordinates stay short and stable.
const r1 = (x) => Math.round(x * 10) / 10;

const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const DAY = 86400000;

// Research-note exhibits are drawn at the reading-column width (760 viewBox
// units ≈ 1:1 on screen), so type sizes match the page.
const NOTE_W = 760;

// The exhibits' history starts with 1996, the first full calendar year: the
// data begins with a single session in December 1995.
const HISTORY_START = '1996-01-01';

// The signal marker: an upward arrow whose tip is the path's start point.
const SIGNAL_ARROW = 'l7.5 10h-4.5v9h-6v-9h-4.5z';

module.exports = { r1, toMs, DAY, NOTE_W, HISTORY_START, SIGNAL_ARROW };
