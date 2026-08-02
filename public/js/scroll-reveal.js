// Scroll-reveal: fade sections up as they enter the viewport.
// Uses IntersectionObserver (never a scroll listener) and only engages
// when motion is allowed. Content is authored visible; the hidden start
// state exists only once this script sets html.reveal-on, so JS-off and
// reduced-motion users always see fully-rendered content.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  document.documentElement.classList.add('reveal-on');

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  els.forEach(function (el) { io.observe(el); });
})();
