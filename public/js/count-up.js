// Count-up effect (vanilla port of the ReactBits "CountUp" bit). A number eases
// from 0 to its real value when it scrolls into view, preserving the literal's
// prefix/suffix and decimal places (e.g. "-5%", "USD $12.42", "+71%").
// IntersectionObserver, never a scroll listener.
//
// Two entry points:
//   - automatic: every .data-value present at load
//   - window.CountUp.observe(el): for numbers injected later (history-table.js)
//
// Progressive enhancement: real numbers are server-rendered / already computed
// (SEO-safe, works with JS off) and it all no-ops under prefers-reduced-motion.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DURATION = 1200;
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // Split "USD $12.42" -> { prefix:"USD $", target:12.42, suffix:"", ... }.
  function parse(text) {
    var m = text.match(/^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/);
    if (!m) return null;
    var numStr = m[2];
    return {
      prefix: m[1],
      suffix: m[3],
      target: parseFloat(numStr.replace(/,/g, '')),
      decimals: numStr.indexOf('.') >= 0 ? numStr.split('.')[1].length : 0,
      grouped: numStr.indexOf(',') >= 0,
    };
  }

  function format(value, info) {
    var s = value.toFixed(info.decimals);
    if (info.grouped) {
      var parts = s.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      s = parts.join('.');
    }
    return info.prefix + s + info.suffix;
  }

  function animate(el) {
    var d = el.__cu, start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / DURATION, 1);
      el.textContent = format(d.info.target * easeOutCubic(p), d.info);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = d.original; // exact original, entities and all
    }
    requestAnimationFrame(tick);
  }

  var io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          animate(entry.target);
        });
      }, { threshold: 0.6 })
    : null;

  function observe(el) {
    if (reduce || !el || el.__cu) return;       // gated / already claimed
    var info = parse(el.textContent);
    if (!info) return;                          // not a number — leave it
    el.__cu = { info: info, original: el.textContent };
    el.textContent = format(0, info);
    if (io) io.observe(el); else animate(el);
  }

  // Public hook for dynamically-injected numbers.
  window.CountUp = { observe: observe };

  document.querySelectorAll('.data-value').forEach(observe);
})();
