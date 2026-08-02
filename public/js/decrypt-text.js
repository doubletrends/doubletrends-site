// Decrypted-text effect (vanilla port of the ReactBits "DecryptedText" bit),
// scoped to monospace overlines. Each [data-decrypt] element scrambles through
// random glyphs and resolves left-to-right into the real text as it scrolls
// into view. Because overlines are JetBrains Mono (fixed-width), a plain
// string swap is rock-steady — no per-character width tricks needed.
//
// Progressive enhancement: elements are server-rendered with the final text
// (works with JS off, SEO-safe) and the whole thing no-ops under
// prefers-reduced-motion. Uses IntersectionObserver — never a scroll listener.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var els = document.querySelectorAll('[data-decrypt]');
  if (!els.length) return;

  var CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#%&*<>/=+?';
  function rnd() { return CHARSET.charAt((Math.random() * CHARSET.length) | 0); }

  var DURATION = 700; // ms to fully resolve
  var STEP = 40;      // ms between glyph shuffles

  function decrypt(el) {
    var text = el.textContent;
    if (!text.trim()) return;
    var chars = text.split('');
    var realCount = 0;
    for (var i = 0; i < chars.length; i++) if (chars[i] !== ' ') realCount++;

    function render(revealCount) {
      var out = '', seen = 0;
      for (var i = 0; i < chars.length; i++) {
        if (chars[i] === ' ') { out += ' '; continue; }
        out += seen < revealCount ? chars[i] : rnd();
        seen++;
      }
      return out;
    }

    el.setAttribute('aria-label', text); // screen readers read the real text

    var start = null, last = -Infinity;
    function tick(ts) {
      if (start === null) start = ts;
      var elapsed = ts - start;
      if (ts - last >= STEP) {
        last = ts;
        el.textContent = render(Math.floor((elapsed / DURATION) * realCount));
      }
      if (elapsed < DURATION) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = text;
        el.removeAttribute('aria-label');
      }
    }
    requestAnimationFrame(tick);
  }

  function observe() {
    if (!('IntersectionObserver' in window)) { els.forEach(decrypt); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        decrypt(entry.target);
      });
    }, { rootMargin: '0px 0px -15% 0px', threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  // Wait for webfonts so the mono metrics are in place before scrambling.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(observe);
  } else {
    observe();
  }
})();
