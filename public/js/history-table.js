(async function () {
  const body = document.getElementById('history-table-body');
  const summary = document.getElementById('history-summary');
  if (!body) return;

  const REGIME_EMOJI = {
    calm:       '\u{1F7E2}',
    correction: '\u{1F7E1}',
    bear:       '\u{1F534}',
    panic:      '\u{1F7E0}',
  };

  // Read brand semantic colors from :root so the table stays in sync with
  // styles/tokens/colors.css / brand.config.js. Composed as rgba() with full
  // alpha; future translucent uses can drop alpha at the call site.
  const rootStyle = getComputedStyle(document.documentElement);
  const cssVar = (name) => rootStyle.getPropertyValue(name).trim();
  const COLOR_GAIN = `rgba(${cssVar('--color-gain-rgb')}, 1)`;
  const COLOR_LOSS = `rgba(${cssVar('--color-loss-rgb')}, 1)`;
  const COLOR_PENDING = '#5A6473';  // brand `muted`

  function formatReturn(base, future) {
    if (future === null || !Number.isFinite(future)) return { text: 'pending', color: COLOR_PENDING };
    const pct = (future / base - 1) * 100;
    const sign = pct >= 0 ? '+' : '';
    const color = pct >= 0 ? COLOR_GAIN : COLOR_LOSS;
    return { text: `${sign}${pct.toFixed(0)}%`, color };
  }

  function regimeCell(regime) {
    const emoji = REGIME_EMOJI[regime] ?? '';
    const label = regime ? regime[0].toUpperCase() + regime.slice(1) : '';
    return `${emoji} ${label}`.trim();
  }

  // Ease a numeric cell from 0 to its value, keeping sign/suffix (e.g. "+71%",
  // "-5%"). Non-numeric cells ("pending") are left untouched.
  function countUp(el, duration) {
    const text = el.textContent;
    const m = text.match(/^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const prefix = m[1], suffix = m[3];
    const target = parseFloat(m[2].replace(/,/g, ''));
    const decimals = m[2].indexOf('.') >= 0 ? m[2].split('.')[1].length : 0;
    let start = null;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    function tick(ts) {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      el.textContent = prefix + (target * ease(p)).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = text;
    }
    requestAnimationFrame(tick);
  }

  let history;
  try {
    const response = await fetch('public/replay/history.json');
    history = await response.json();
  } catch (err) {
    body.innerHTML =
      `<tr><td colspan="6" class="px-5 py-6 text-center" style="color: ${COLOR_LOSS};">` +
      'Could not load history.</td></tr>';
    return;
  }

  // Show newest first. The /history command shows oldest first; the homepage
  // tail-first ordering matches what a returning subscriber would care about.
  const entries = [...history.entries].reverse();

  const rows = entries.map((e) => {
    const r90 = formatReturn(e.signal_close, e.close_90d);
    const r1y = formatReturn(e.signal_close, e.close_365d);
    const r2y = formatReturn(e.signal_close, e.close_730d);
    return `
      <tr style="border-bottom: 1px solid rgba(30,37,48,0.06);">
        <td class="px-5 py-3" style="color: #1E2530;">${e.signal_date}</td>
        <td class="px-3 py-3" style="color: #1E2530;">${regimeCell(e.regime)}</td>
        <td class="px-3 py-3 text-right" style="color: #1E2530;">${e.signal_close.toFixed(2)}</td>
        <td class="px-3 py-3 text-right ret" style="color: ${r90.color};">${r90.text}</td>
        <td class="px-3 py-3 text-right ret" style="color: ${r1y.color};">${r1y.text}</td>
        <td class="px-5 py-3 text-right ret" style="color: ${r2y.color};">${r2y.text}</td>
      </tr>
    `;
  }).join('');

  body.innerHTML = rows;

  if (summary && history.metrics) {
    const m = history.metrics;
    summary.innerHTML =
      `<b class="cu" style="color: #1E2530;">${m.total_signals}</b> signals &middot; ` +
      `median 1y <b class="cu" style="color: ${COLOR_GAIN};">+${m.median_1y_pct}%</b> &middot; ` +
      `<b class="cu" style="color: #1E2530;">${m.positive_1y_count}</b>/${m.matured_1y_count} positive at 1y`;
  }

  // Reveal + count-up when the table scrolls into view: each row fades in and
  // its 90d/1y/2y returns tick up from zero, cascading down the table (a quiet
  // "terminal computing returns" beat), then the headline metrics count up.
  // No-ops under prefers-reduced-motion, which leaves the real figures in place.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const rowEls = Array.from(body.querySelectorAll('tr'));
    rowEls.forEach((tr) => tr.classList.add('hist-row'));

    const reveal = () => {
      rowEls.forEach((tr, i) => {
        setTimeout(() => {
          tr.classList.add('is-in');
          tr.querySelectorAll('.ret').forEach((cell) => countUp(cell, 800));
        }, i * 45);
      });
      if (summary) summary.querySelectorAll('.cu').forEach((el) => countUp(el, 1200));
    };

    if ('IntersectionObserver' in window) {
      const rio = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => { if (entry.isIntersecting) { reveal(); obs.disconnect(); } });
      }, { threshold: 0.1 });
      rio.observe(body);
    } else {
      requestAnimationFrame(reveal);
    }
  }
})();
