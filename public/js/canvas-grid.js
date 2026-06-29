(function () {
  var SQ = 20, GAP = 4, TILE = SQ + GAP;
  var ALPHA = 0.20;
  var SWAP_INTERVAL = 200;
  var FADE_MS = 500;

  function prob(x) {
    if (x < 0.50) return 0;
    if (x < 0.60) return (x - 0.50) / 0.10 * 0.15;
    if (x < 0.70) return 0.15 + (x - 0.60) / 0.10 * 0.15;
    if (x < 0.80) return 0.30 + (x - 0.70) / 0.10 * 0.15;
    if (x < 0.90) return 0.45 + (x - 0.80) / 0.10 * 0.15;
    return 0.60 + (x - 0.90) / 0.10 * 0.15;
  }

  function initSection(section) {
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;-webkit-mask-image:linear-gradient(to right,transparent 0%,transparent 50%,rgba(0,0,0,0.15) 60%,rgba(0,0,0,0.45) 75%,rgba(0,0,0,0.70) 90%,rgba(0,0,0,0.80) 100%);mask-image:linear-gradient(to right,transparent 0%,transparent 50%,rgba(0,0,0,0.15) 60%,rgba(0,0,0,0.45) 75%,rgba(0,0,0,0.70) 90%,rgba(0,0,0,0.80) 100%);';
    section.insertBefore(canvas, section.firstChild);

    var ctx = canvas.getContext('2d');
    var w = 0;
    var h = 0;
    var cols = 0;
    var rows = 0;
    var squares = {};
    var fades = [];
    var rafId = null;
    var resizeRafId = null;

    function seedSquares() {
      squares = {};
      fades = [];
      for (var c = 0; c < cols; c++) {
        var p = prob(c / (cols - 1 || 1));
        for (var r = 0; r < rows; r++) {
          if (Math.random() < p) squares[c + ',' + r] = ALPHA;
        }
      }
    }

    function resize() {
      var nextW = section.offsetWidth;
      var nextH = section.offsetHeight;
      if (!nextW || !nextH) return;
      if (nextW === w && nextH === h) return;

      w = nextW;
      h = nextH;
      canvas.width = w;
      canvas.height = h;
      cols = Math.ceil(w / TILE);
      rows = Math.ceil(h / TILE);
      seedSquares();
      if (!rafId) rafId = requestAnimationFrame(render);
    }

    function render(now) {
      ctx.clearRect(0, 0, w, h);
      var remaining = [];
      for (var i = 0; i < fades.length; i++) {
        var f = fades[i];
        var t = Math.min((now - f.start) / FADE_MS, 1);
        squares[f.key] = f.from + (f.to - f.from) * t;
        if (t < 1) remaining.push(f);
        else if (f.to === 0) delete squares[f.key];
      }
      fades = remaining;
      for (var key in squares) {
        var a = squares[key];
        if (a <= 0) continue;
        var pt = key.split(',');
        ctx.fillStyle = 'rgba(194,65,12,' + a + ')';
        ctx.fillRect(+pt[0] * TILE, +pt[1] * TILE, SQ, SQ);
      }
      rafId = fades.length ? requestAnimationFrame(render) : null;
    }

    resize();

    function swap() {
      if (!cols || !rows) return;
      var fadingKeys = {};
      for (var i = 0; i < fades.length; i++) fadingKeys[fades[i].key] = true;
      var stable = Object.keys(squares).filter(function (k) { return !fadingKeys[k]; });
      if (!stable.length) return;
      var removeKey = stable[Math.floor(Math.random() * stable.length)];
      var newKey = null;
      for (var attempt = 0; attempt < 200; attempt++) {
        var nc = Math.floor(Math.random() * cols);
        var nr = Math.floor(Math.random() * rows);
        var candidate = nc + ',' + nr;
        if (squares[candidate] !== undefined) continue;
        if (Math.random() < prob(nc / (cols - 1 || 1))) { newKey = candidate; break; }
      }
      if (!newKey) return;
      var now = performance.now();
      fades.push({ key: removeKey, from: ALPHA, to: 0, start: now });
      squares[newKey] = 0;
      fades.push({ key: newKey, from: 0, to: ALPHA, start: now });
      if (!rafId) rafId = requestAnimationFrame(render);
    }

    setInterval(function () {
      var swapsPerTick = Math.max(1, Math.ceil(rows / 3));
      for (var i = 0; i < swapsPerTick; i++) swap();
    }, SWAP_INTERVAL);

    function requestResize() {
      if (resizeRafId) return;
      resizeRafId = requestAnimationFrame(function () {
        resizeRafId = null;
        resize();
      });
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(requestResize).observe(section);
    } else {
      window.addEventListener('resize', requestResize);
    }
  }

  document.querySelectorAll('.decor-banner:not(.decor-banner-dark)').forEach(initSection);
})();
