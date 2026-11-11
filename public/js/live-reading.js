// Live reading: replaces the build-time reading in the top bar and the reading
// card with the latest from the backend (GET /api/public/reading, worker
// src/public.ts in doubletrends-backend), which updates hourly through the
// session and again after the close.
//
// The page is built with a correct, possibly older reading (src/data/
// indicator.json), so search engines, visitors without JavaScript and any
// failed fetch still see one; this script only ever swaps the text of
// [data-live] elements, and only for a reading that is well formed and not
// older than the one the page was built with.
//
// The build formats that fallback with texts() below (src/exhibits/
// figures.js requires this file), so the HTML and the swap word a reading
// identically. The script tag carries the API address (data-api), the regime
// labels (data-labels) and the build's own reading time (data-built).
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { texts: texts, valid: valid };
    return;
  }

  var script = document.currentScript;
  if (!script || !window.fetch) return;
  var api = script.getAttribute('data-api');
  var built = Date.parse(script.getAttribute('data-built') || '');
  var labels;
  try { labels = JSON.parse(script.getAttribute('data-labels') || '{}'); } catch (e) { return; }

  function apply(r) {
    var t = texts(r, labels);
    document.querySelectorAll('[data-live]').forEach(function (el) {
      var key = el.getAttribute('data-live');
      if (key === 'swatch') {
        el.className = el.className.replace(/\bregime-key-[a-z]+\b/, 'regime-key-' + r.regime);
      } else if (Object.prototype.hasOwnProperty.call(t, key)) {
        el.textContent = t[key];
      }
    });
  }

  var ctrl = window.AbortController ? new AbortController() : null;
  if (ctrl) setTimeout(function () { ctrl.abort(); }, 8000);
  fetch(api, { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (r) {
      if (!valid(r, labels)) return;
      if (!isNaN(built) && Date.parse(r.updated_at) < built) return; // never older than the page
      apply(r);
    })
    .catch(function () { /* keep the reading the page was built with */ });
})();
