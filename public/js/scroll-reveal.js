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
      var el = entry.target;
      io.unobserve(el);
      el.classList.add('is-revealed');
      // Once the entrance finishes, strip the reveal so it no longer owns
      // `transform`/`transition`. Otherwise the resting `transform` outranks a
      // card's :hover lift, and the 1.5s reveal transition makes that lift
      // sluggish. The element is already at its final state, so removal is
      // seamless. Guard on e.target so a child's transitionend (a hover image,
      // etc.) bubbling up does not trigger cleanup early.
      var done = function (e) {
        if (e.target !== el) return;
        el.removeEventListener('transitionend', done);
        el.removeAttribute('data-reveal');
        el.classList.remove('is-revealed');
      };
      el.addEventListener('transitionend', done);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  els.forEach(function (el) { io.observe(el); });
})();
