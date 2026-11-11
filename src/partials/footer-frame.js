// Footer frame: a banknote border drawn round the whole footer, edge to edge,
// sized to it. A lathe ribbon (18 strands that swell and pinch) with a lens
// chain woven through it and a rule each side, runs along a rounded
// rectangle; a spirograph medallion sits in each corner, with the band cut
// away around it. Every wave count is a whole number around the loop, so the
// band closes on itself with no seam at any size. The footer's own layout is
// untouched: the frame is drawn into it, behind the content. Inlined after the
// footer by the build, so it draws before the page is shown; redrawn when the
// footer resizes (the footnotes toggle, a window resize).
(function () {
  var footer = document.querySelector('.site-footer');
  if (!footer || !window.SVGElement) return;
  var NS = 'http://www.w3.org/2000/svg', TAU = Math.PI * 2;
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'site-footer-frame');
  svg.setAttribute('aria-hidden', 'true');
  footer.insertBefore(svg, footer.firstChild);

  function r1(v) { return Math.round(v * 10) / 10; }
  function rel(pts) {
    var x = r1(pts[0][0]), y = r1(pts[0][1]), d = 'M' + x + ' ' + y + 'l';
    for (var i = 1; i < pts.length; i++) {
      var nx = r1(pts[i][0]), ny = r1(pts[i][1]);
      d += (i > 1 ? ' ' : '') + r1(nx - x) + ' ' + r1(ny - y);
      x = nx; y = ny;
    }
    return d.replace(/ -/g, '-');
  }

  function draw() {
    // Geometry at full size, scaled down on narrow footers.
    var W = footer.clientWidth, H = footer.clientHeight, s = Math.max(0.6, Math.min(1, W / 900));
    if (W < 200 || H < 200) { svg.innerHTML = ''; return; }
    var INSET = 30 * s, RC = 42 * s, A = 18 * s, MK = 0.19 * s, HOLE = 236 * MK + 4 * s;
    var w = W - 2 * INSET - 2 * RC, h = H - 2 * INSET - 2 * RC, q = Math.PI / 2 * RC;
    var P = 2 * w + 2 * h + 4 * q;
    var x0 = INSET + RC, x1 = W - INSET - RC, y0 = INSET + RC, y1 = H - INSET - RC;
    var segs = [
      [w, function (d) { return [x0 + d, INSET, 1, 0]; }],
      [q, function (d) { return arc(x1, y0, -Math.PI / 2 + d / RC); }],
      [h, function (d) { return [W - INSET, y0 + d, 0, 1]; }],
      [q, function (d) { return arc(x1, y1, d / RC); }],
      [w, function (d) { return [x1 - d, H - INSET, -1, 0]; }],
      [q, function (d) { return arc(x0, y1, Math.PI / 2 + d / RC); }],
      [h, function (d) { return [INSET, y1 - d, 0, -1]; }],
      [q, function (d) { return arc(x0, y0, Math.PI + d / RC); }],
    ];
    function arc(cx, cy, a) { return [cx + RC * Math.cos(a), cy + RC * Math.sin(a), -Math.sin(a), Math.cos(a)]; }
    // Points along the centre line once, then every strand offsets them.
    var n = Math.ceil(P / 2), base = [];
    for (var i = 0; i <= n; i++) {
      var sArc = (i / n) * P, k = 0;
      while (k < segs.length - 1 && sArc > segs[k][0]) { sArc -= segs[k][0]; k++; }
      base.push(segs[k][1](Math.min(sArc, segs[k][0])));
    }
    function loop(across) {
      var pts = [];
      for (var j = 0; j <= n; j++) {
        var p = base[j], o = across((j / n) * TAU);
        pts.push([p[0] - p[3] * o, p[1] + p[2] * o]); // offset along the inward normal
      }
      return rel(pts) + 'Z';
    }
    function waves(len) { return Math.max(1, Math.round(P / (len * s))); }

    var paths = [], N = 18, nr = waves(44), m = waves(176), nl = waves(44);
    for (var t = 0; t < N; t++) {
      (function (ph) {
        paths.push(loop(function (u) { return A * (0.58 + 0.42 * Math.cos(m * u)) * Math.sin(nr * u + ph); }));
      })((t / N) * TAU);
    }
    [1, 0.62, 0.3].forEach(function (f) {
      paths.push(loop(function (u) { return A * f * Math.sin(nl * u); }));
      paths.push(loop(function (u) { return -A * f * Math.sin(nl * u); }));
    });
    paths.push(loop(function () { return A + 3 * s; }), loop(function () { return -(A + 3 * s); }));

    var corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], medals = [];
    corners.forEach(function (c) { medals = medals.concat(rosette(c[0], c[1], MK)); });

    var id = 'footer-frame-cut';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML =
      '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' +
      corners.map(function (c) { return '<circle cx="' + r1(c[0]) + '" cy="' + r1(c[1]) + '" r="' + r1(HOLE) + '" fill="#000"/>'; }).join('') +
      '</mask></defs>' +
      '<g mask="url(#' + id + ')"><path d="' + paths.join('"/><path d="') + '"/></g>' +
      '<g><path d="' + medals.join('"/><path d="') + '"/></g>';
  }

  // Spirograph medallion: two interlaced rings of hypotrochoids, the rosette
  // the footer used to carry, scaled by k (outer radius 236 k).
  function rosette(cx, cy, k) {
    var out = [];
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    [[240, 66, 62], [110, 30, 30]].forEach(function (L) {
      var R = L[0], r = L[1], d = L[2], turns = r / gcd(R, r), lobes = R / gcd(R, r), steps = turns * 90;
      [0, Math.PI / lobes].forEach(function (rot) {
        var pts = [];
        for (var i = 0; i <= steps; i++) {
          var t = (i / steps) * turns * TAU;
          var x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
          var y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
          pts.push([cx + k * (x * Math.cos(rot) - y * Math.sin(rot)), cy + k * (x * Math.sin(rot) + y * Math.cos(rot))]);
        }
        out.push(rel(pts) + 'Z');
      });
    });
    return out;
  }

  draw();
  if (window.ResizeObserver) {
    var size = [footer.clientWidth, footer.clientHeight], queued = false;
    new ResizeObserver(function () {
      if (queued || (footer.clientWidth === size[0] && footer.clientHeight === size[1])) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        size = [footer.clientWidth, footer.clientHeight];
        draw();
      });
    }).observe(footer);
  }
})();
