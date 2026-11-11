// Scroll reveal: fade content up as it enters the viewport, with a staggered
// load-in for whatever is already on screen when the page is first shown.
//
// Two regimes, one motion:
//   - Blocks already inside the first viewport reveal as a staggered cascade
//     (the hero leads). Leaving first-screen content to a scroll trigger would
//     read as static: the reader can already see it, so nothing "enters".
//   - Blocks below the fold are observed and reveal on scroll.
//
// The guard in <head> (src/partials/head.html) sets html.reveal-on before first
// paint, so tagged blocks start hidden, and holds the page until the house
// faces are in; window.pageShown resolves when it shows. The cascade starts
// then, so it plays where the reader can see it. Tagging: scripts/build-reveal.js.
// Uses IntersectionObserver (never a scroll listener). Reduced motion, no
// IntersectionObserver, or no JS: the guard never sets reveal-on and content
// shows as authored.
(function () {
  var root = document.documentElement;
  root.setAttribute('data-reveal-ready', '');
  if (!root.classList.contains('reveal-on')) return;

  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  // Once an entrance finishes, strip the reveal so it no longer owns
  // transform/transition: a resting transform would outrank a :hover lift, and
  // the long transition would make it sluggish. The element is already at its
  // final state, so removal is seamless. Guard on e.target so a child's
  // transitionend bubbling up does not end it early.
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

  function start() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        reveal(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    // Split into "already on screen" and "below the fold". The 0.92 factor
    // mirrors the observer's -8% bottom margin so an element does not count as
    // on-screen here yet fail to trigger the observer there.
    var vh = window.innerHeight || root.clientHeight;
    var onScreen = [];
    els.forEach(function (el) {
      if (el.getBoundingClientRect().top < vh * 0.92) onScreen.push(el);
      else io.observe(el);
    });

    // Cascade the on-screen group top to bottom; the stagger is capped so a
    // tall first screen never trails too far.
    onScreen.forEach(function (el, i) {
      el.style.setProperty('--reveal-delay', Math.min(i * 90, 630) + 'ms');
    });

    // Reveal after a paint, so the hidden start state renders first and the
    // transition plays (the same frame would collapse 0 -> 1 with no motion).
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        onScreen.forEach(reveal);
      });
    });
  }

  (window.pageShown || Promise.resolve()).then(start);
})();
