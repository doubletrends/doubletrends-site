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

  function formatReturn(base, future) {
    if (future === null || !Number.isFinite(future)) return { text: 'pending', color: '#5A6473' };
    const pct = (future / base - 1) * 100;
    const sign = pct >= 0 ? '+' : '';
    const color = pct >= 0 ? '#2E9E7B' : '#C8413B';
    return { text: `${sign}${pct.toFixed(0)}%`, color };
  }

  function regimeCell(regime) {
    const emoji = REGIME_EMOJI[regime] ?? '';
    const label = regime ? regime[0].toUpperCase() + regime.slice(1) : '';
    return `${emoji} ${label}`.trim();
  }

  let history;
  try {
    const response = await fetch('public/replay/history.json');
    history = await response.json();
  } catch (err) {
    body.innerHTML =
      '<tr><td colspan="6" class="px-5 py-6 text-center" style="color: #C8413B;">' +
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
        <td class="px-3 py-3 text-right" style="color: ${r90.color};">${r90.text}</td>
        <td class="px-3 py-3 text-right" style="color: ${r1y.color};">${r1y.text}</td>
        <td class="px-5 py-3 text-right" style="color: ${r2y.color};">${r2y.text}</td>
      </tr>
    `;
  }).join('');

  body.innerHTML = rows;

  if (summary && history.metrics) {
    const m = history.metrics;
    summary.innerHTML =
      `<b style="color: #1E2530;">${m.total_signals}</b> signals &middot; ` +
      `median 1y <b style="color: #C2410C;">+${m.median_1y_pct}%</b> &middot; ` +
      `<b style="color: #1E2530;">${m.positive_1y_count}</b>/${m.matured_1y_count} positive at 1y`;
  }
})();
