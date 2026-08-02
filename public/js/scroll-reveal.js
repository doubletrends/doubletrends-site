// Scroll-reveal: fade content up as it enters the viewport, with a staggered
// load-in for whatever is already on screen at first paint.
//
// Two regimes, one motion:
//   - Elements already inside the first viewport reveal immediately as a
//     staggered cascade, continuing the hero load-in. Leaving first-screen
//     content to a scroll trigger is why it used to read as static: the user
//     can already see it, so nothing ever "enters".
//   - Elements below the fold are observed and reveal on scroll as before.
//
// Uses IntersectionObserver (never a scroll listener) and only engages when
// motion is allowed. Content is authored visible; the hidden start state exists
// only once this script sets html.reveal-on, so JS-off and reduced-motion users
// always see fully-rendered content.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  document.documentElement.classList.add('reveal-on');

  // Once an entrance finishes, strip the reveal so it no longer owns
  // transform/transition. Otherwise the resting transform outranks a card's
  // :hover lift, and the long reveal transition makes that lift sluggish. The
  // element is already at its final state, so removal is seamless. Guard on
  // e.target so a child's transitionend (a hover image, etc.) bubbling up does
  // not trigger cleanup early.
  function reveal(el) {
    el.classList.add('is-revealed');
    var done = function (e) {
      if (e.target !== el) return;
      el.removeEventListener('transitionend', done);
      el.removeAttribute('data-reveal');
      el.classList.remove('is-revealed');
      el.style.removeProperty('--reveal-delay');
    };
    el.addEventListener('transitionend', done);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      reveal(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  // Split into "already on screen" and "below the fold". The 0.92 factor mirrors
  // the observer's -8% bottom margin so an element does not count as on-screen
  // here yet fail to trigger the observer there.
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var onScreen = [];
  els.forEach(function (el) {
    if (el.getBoundingClientRect().top < vh * 0.92) onScreen.push(el);
    else io.observe(el);
  });

  // Cascade the on-screen group top-to-bottom. The hero is the first tagged
  // block, so it leads at 0ms; the per-item stagger is capped so a tall first
  // screen never trails too far.
  onScreen.forEach(function (el, i) {
    el.style.setProperty('--reveal-delay', Math.min(i * 90, 630) + 'ms');
  });

  // Reveal the on-screen cascade after a paint, so the hidden start state
  // renders first and the transition actually plays (adding the class in the
  // same frame would collapse the 0 -> 1 change with no animation).
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      onScreen.forEach(function (el) { reveal(el); });
    });
  });
})();
