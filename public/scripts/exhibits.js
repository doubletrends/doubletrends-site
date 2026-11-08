/**
 * exhibits.js — interaction layer for the build-time SVG exhibits.
 *
 * Charts render fully without this script (see src/charts.js). It adds:
 *   [data-exhibit="series"]  crosshair + tooltip over the weekly series;
 *                            keyboard: ←/→ one week, Shift+←/→ one year,
 *                            Home/End; announced via a polite live region.
 *   [data-exhibit="tips"]    tooltip for any mark carrying data-tip.
 */
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function fmtDate(iso) {
    var p = iso.split('-');
    return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
  }
  function fmtNum(x) {
    return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function tooltipFor(body) {
    var tip = document.createElement('div');
    tip.className = 'ex-tooltip';
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
    body.appendChild(tip);
    return tip;
  }
  function place(tip, body, xPx, yPx) {
    var bw = body.clientWidth;
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = xPx + 14;
    if (left + tw > bw) left = xPx - tw - 14;
    if (left < 0) left = 0;
    var top = Math.max(0, yPx - th - 12);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  // ── Series exhibit ─────────────────────────────────────────────────────────
  function initSeries(fig) {
    var dataEl = fig.querySelector('script[type="application/json"]');
    var svg = fig.querySelector('svg');
    var body = fig.querySelector('.exhibit-body');
    if (!dataEl || !svg || !body) return;
    var data = JSON.parse(dataEl.textContent);
    var pts = data.points;
    var cross = svg.querySelector('.ex-cross');
    var dot = svg.querySelector('.ex-cross-dot');
    var tip = tooltipFor(body);
    var live = fig.querySelector('.ex-live-region');
    var current = pts.length - 1;

    function nearest(vx) {
      var lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (pts[mid][0] < vx) lo = mid; else hi = mid;
      }
      return (vx - pts[lo][0] < pts[hi][0] - vx) ? lo : hi;
    }
    function show(i, announce) {
      current = Math.max(0, Math.min(pts.length - 1, i));
      var p = pts[current];
      cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]);
      dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
      fig.setAttribute('data-active', '');
      tip.innerHTML = '<b>Week ending ' + fmtDate(p[2]) + '</b>'
        + '<div class="row"><span>S&amp;P 500</span><span>' + fmtNum(p[3]) + '</span></div>'
        + '<div class="row"><span>Regime</span><span>' + p[4] + '</span></div>';
      var scale = svg.getBoundingClientRect().width / data.w;
      var svgTop = svg.getBoundingClientRect().top - body.getBoundingClientRect().top;
      place(tip, body, p[0] * scale, svgTop + p[1] * scale);
      if (announce && live) live.textContent = fmtDate(p[2]) + ': S&P 500 ' + fmtNum(p[3]) + ', ' + p[4] + ' regime.';
    }
    function hide() {
      fig.removeAttribute('data-active');
      tip.hidden = true;
    }

    svg.addEventListener('pointermove', function (e) {
      var r = svg.getBoundingClientRect();
      var vx = (e.clientX - r.left) / r.width * data.w;
      if (vx < data.plotLeft || vx > data.plotRight) { hide(); return; }
      show(nearest(vx), false);
    });
    svg.addEventListener('pointerleave', hide);

    var target = fig.querySelector('.exhibit-interactive') || svg;
    target.addEventListener('focus', function () { show(current, true); });
    target.addEventListener('blur', hide);
    target.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 52 : 1;
      if (e.key === 'ArrowLeft') { show(current - step, true); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { show(current + step, true); e.preventDefault(); }
      else if (e.key === 'Home') { show(0, true); e.preventDefault(); }
      else if (e.key === 'End') { show(pts.length - 1, true); e.preventDefault(); }
      else if (e.key === 'Escape') { hide(); }
    });
  }

  // ── Tip exhibit ────────────────────────────────────────────────────────────
  function initTips(fig) {
    var body = fig.querySelector('.exhibit-body');
    if (!body) return;
    var tip = tooltipFor(body);
    function showFor(el) {
      var text = el.getAttribute('data-tip');
      if (!text) return;
      tip.textContent = text;
      var r = el.getBoundingClientRect(), b = body.getBoundingClientRect();
      place(tip, body, r.left - b.left + r.width / 2, r.top - b.top);
    }
    body.addEventListener('pointerover', function (e) {
      var el = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (el) showFor(el);
    });
    body.addEventListener('pointerleave', function () { tip.hidden = true; });
    // Keyboard: the figure is focusable; arrows walk the marks.
    var marks = Array.prototype.slice.call(body.querySelectorAll('[data-tip]'));
    var i = -1;
    var host = fig.querySelector('.exhibit-interactive');
    if (!host || !marks.length) return;
    host.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { i = Math.min(marks.length - 1, i + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { i = Math.max(0, i - 1); }
      else if (e.key === 'Escape') { tip.hidden = true; return; }
      else return;
      e.preventDefault();
      showFor(marks[i]);
      var live = fig.querySelector('.ex-live-region');
      if (live) live.textContent = marks[i].getAttribute('data-tip');
    });
    host.addEventListener('blur', function () { tip.hidden = true; });
  }

  document.querySelectorAll('[data-exhibit="series"]').forEach(initSeries);
  document.querySelectorAll('[data-exhibit="tips"]').forEach(initTips);
})();
