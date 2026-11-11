// Live reading: fills the top bar and the reading card with the latest
// reading from the backend (GET /api/public/reading, worker src/public.ts in
// doubletrends-backend), which updates hourly through the session and again
// after the close.
//
// There is no fallback reading: pages are built with the LOADING words, and a
// failed request, an error status or a malformed answer shows the ERROR words
// (and logs to the console), so a broken feed is visible at once instead of
// hidden behind an old reading. The script only ever sets the text of
// [data-live] elements (and the swatch's regime class).
//
// The build writes the LOADING words with this same file (src/exhibits/
// figures.js requires it), so the two never drift. The script tag carries the
// API address (data-api) and the regime labels (data-labels).
(function () {
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function dateLong(iso) {
    var p = iso.split('-').map(Number);
    return MONTHS[p[1] - 1] + ' ' + p[2] + ', ' + p[0];
  }

  // "4:10 p.m." and "Nov 6" in New York time, from an ISO timestamp.
  function nyParts(ts) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
    var o = {};
    f.formatToParts(new Date(ts)).forEach(function (x) { o[x.type] = x.value; });
    return { time: o.hour + ':' + o.minute + ' ' + (o.dayPeriod === 'AM' ? 'a.m.' : 'p.m.'), day: o.month + ' ' + o.day };
  }

  // The words for a reading { date, regime, close, updated_at, final }.
  function texts(r, labels) {
    var at = nyParts(r.updated_at);
    return {
      regime: labels[r.regime],
      close: r.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      'top-asof': r.final ? 'as of ' + dateLong(r.date) + ' close' : 'intraday, ' + at.time + ' ET',
      'card-asof': r.final ? 'As of the ' + dateLong(r.date) + ' close' : 'As of ' + at.time + ' ET, ' + dateLong(r.date) + ' · market open',
      updated: at.day + ', ' + at.time + ' ET',
    };
  }

  function valid(r, labels) {
    return !!r && typeof r === 'object' &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
      Object.prototype.hasOwnProperty.call(labels, r.regime) &&
      typeof r.close === 'number' && isFinite(r.close) &&
      typeof r.updated_at === 'string' && !isNaN(Date.parse(r.updated_at)) &&
      typeof r.final === 'boolean';
  }

  // The words before the reading arrives, and when it can't be had.
  var LOADING = { regime: '…', 'top-asof': 'loading the latest reading', 'card-asof': 'Loading the latest reading…', close: '…', updated: '…' };
  var ERROR = { regime: 'Unavailable', 'top-asof': 'reading unavailable', 'card-asof': 'Reading unavailable · try again shortly', close: '—', updated: '—' };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { texts: texts, valid: valid, LOADING: LOADING, ERROR: ERROR };
    return;
  }

  var script = document.currentScript;
  if (!script) return;
  var api = script.getAttribute('data-api');
  var labels = {};
  try { labels = JSON.parse(script.getAttribute('data-labels') || '{}'); } catch (e) { /* every reading will fail validation */ }

  // Set the [data-live] text from `t`; the swatch takes `regime`'s colour, or none.
  function show(t, regime) {
    document.querySelectorAll('[data-live]').forEach(function (el) {
      var key = el.getAttribute('data-live');
      if (key === 'swatch') {
        el.className = el.className.replace(/\s*\bregime-key-[a-z]+\b/g, '') + (regime ? ' regime-key-' + regime : '');
      } else if (Object.prototype.hasOwnProperty.call(t, key)) {
        el.textContent = t[key];
      }
    });
  }

  function fail(why) {
    console.error('Live reading unavailable:', why);
    show(ERROR, null);
  }

  if (!window.fetch) return fail('this browser cannot fetch');
  var ctrl = window.AbortController ? new AbortController() : null;
  if (ctrl) setTimeout(function () { ctrl.abort(); }, 8000);
  fetch(api, { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + api);
      return res.json();
    })
    .then(function (r) {
      if (!valid(r, labels)) throw new Error('malformed reading ' + JSON.stringify(r));
      show(texts(r, labels), r.regime);
    })
    .catch(fail);
})();
