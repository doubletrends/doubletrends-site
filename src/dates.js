/**
 * dates.js — the site's calendar. Dates on the site are New York dates
 * (TIME_ZONE in site.config.js), the market's: the build's "today", and the
 * offset stamped on every machine-readable date (JSON-LD, article meta tags).
 */
const { TIME_ZONE } = require('./site.config');

const ymd = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const offsetFmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' });

// Today's date (YYYY-MM-DD) in TIME_ZONE.
function today() {
  const parts = ymd.formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// TIME_ZONE's UTC offset ("-04:00") at an instant.
function offsetAt(instant) {
  const name = offsetFmt.formatToParts(instant).find((part) => part.type === 'timeZoneName').value; // "GMT-04:00", or "GMT" at UTC
  return name === 'GMT' ? '+00:00' : name.slice(3);
}

// Midnight starting `date` (YYYY-MM-DD) in TIME_ZONE, as an ISO 8601 date-time
// with that midnight's offset: "2026-11-08T00:00:00-05:00". The offset is read
// at a first guess of the instant, then again at the instant it implies, so a
// date on which daylight saving changes gets its midnight's own offset.
function isoMidnight(date) {
  const at = (offset) => new Date(`${date}T00:00:00${offset}`);
  const guess = offsetAt(at('Z'));
  return `${date}T00:00:00${offsetAt(at(guess))}`;
}

module.exports = { today, isoMidnight };
