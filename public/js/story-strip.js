(function () {
  var DURATION = 400; // must match .story-strip transition (0.4s ease)

  function initCarousel(root) {
    var viewport = root.querySelector('.story-viewport');
    var strip    = root.querySelector('.story-strip');
    var prevBtn  = root.querySelector('[data-story-prev]');
    var nextBtn  = root.querySelector('[data-story-next]');

    if (!viewport || !strip || !prevBtn || !nextBtn) return;

    var origCards = Array.from(strip.querySelectorAll('.story-card'));
    if (origCards.length < 2) return;

    var origCount = origCards.length;

    // Clone for seamless wrap
    origCards.forEach(function (c) { strip.appendChild(c.cloneNode(true)); });
    var cards = Array.from(strip.querySelectorAll('.story-card'));

    var index        = 0;
    var visibleCount = 3;
    var busy         = false;
    var autoId       = null;
    var reduce       = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function readGap() {
      return parseFloat(window.getComputedStyle(strip).gap) || 0;
    }

    function measure() {
      visibleCount = window.innerWidth <= 767 ? 1 : 3;
    }

    // Only the on-screen cards keep their drop-shadow. Off-screen cards are
    // flagged so CSS removes their shadow — otherwise it bleeds past the clip
    // into the visible edges and reads as a cut-off shadow.
    function markOffscreen(startIdx) {
      cards.forEach(function (c, i) {
        c.classList.toggle('is-offscreen', i < startIdx || i >= startIdx + visibleCount);
      });
    }

    function applyTransform(idx, animated) {
      var gap       = readGap();
      var cardWidth = cards[0].getBoundingClientRect().width;
      var offset    = idx * (cardWidth + gap);
      if (!animated) {
        strip.style.transition = 'none';
        strip.style.transform  = 'translateX(' + (-offset) + 'px)';
        strip.getBoundingClientRect(); // force reflow
        strip.style.transition = '';
      } else {
        strip.style.transform = 'translateX(' + (-offset) + 'px)';
      }
      markOffscreen(idx);
    }

    function stepNext() {
      if (busy) return;
      busy = true;
      index++;
      applyTransform(index, true);
      if (index >= origCount) {
        setTimeout(function () {
          index -= origCount;
          applyTransform(index, false);
          busy = false;
        }, DURATION);
      } else {
        setTimeout(function () { busy = false; }, DURATION);
      }
    }

    function stepPrev() {
      if (busy) return;
      busy = true;
      if (index <= 0) {
        // Jump silently to clone end, then animate one step back
        index = origCount;
        applyTransform(index, false);
        setTimeout(function () {
          index--;
          applyTransform(index, true);
          setTimeout(function () { busy = false; }, DURATION);
        }, 20);
        return;
      }
      index--;
      applyTransform(index, true);
      setTimeout(function () { busy = false; }, DURATION);
    }

    function restartAutoAdvance() {
      if (autoId) clearInterval(autoId);
      if (reduce) return;                       // reduced motion: manual controls only
      autoId = setInterval(stepNext, 2000); 
    }
    function pauseAutoAdvance() {
      if (autoId) { clearInterval(autoId); autoId = null; }
    }

    prevBtn.addEventListener('click', function () { stepPrev(); restartAutoAdvance(); });
    nextBtn.addEventListener('click', function () { stepNext(); restartAutoAdvance(); });

    // Pause while the reader is engaged (hover or keyboard focus within).
    root.addEventListener('mouseenter', pauseAutoAdvance);
    root.addEventListener('mouseleave', restartAutoAdvance);
    root.addEventListener('focusin', pauseAutoAdvance);
    root.addEventListener('focusout', restartAutoAdvance);

    window.addEventListener('resize', function () {
      measure();
      applyTransform(index, false);
    });

    measure();
    applyTransform(0, false);
    restartAutoAdvance();
  }

  document.querySelectorAll('[data-story-carousel]').forEach(initCarousel);
})();
