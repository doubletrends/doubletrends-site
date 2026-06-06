/**
 * bot-sandbox.js
 *
 * Browser port of the DoubleTrends™ Telegram bot's user-facing surface.
 * Ports formatBriefMessage, formatHistoryMessage, REGIME_META, parseCommand,
 * and the brief.ts/telegram.ts copy verbatim — so the output the user sees on
 * the /try page is identical to what a paying subscriber sees in Telegram.
 *
 * Data comes from public/replay/brief-demo.json (worker-exported
 * BriefSnapshot fixtures for the public demo window) and
 * public/replay/history.json (signal list with forward returns) — both built
 * from production backfill artifacts.
 *
 * Anchored to history. The public demo only exposes a trimmed historical
 * window, so it is clearly retrospective and doesn't substitute for the
 * real-time DM that subscribers pay for.
 */
(async function () {
  const chatLog = document.getElementById('chat-log');
  const chipsRoot = document.getElementById('command-chips');
  const input = document.getElementById('command-input');
  const form = document.getElementById('command-form');
  if (!chatLog || !chipsRoot || !input || !form) return;
  const BOT_REPLY_DELAY_MS = 442;
  const BOT_REPLY_GAP_MS = 208;

  // ─── Ported from worker/src/brief.ts ────────────────────────────────────────
  const REGIME_META = {
    calm: {
      emoji: '\u{1F7E2}',
      label: 'Calm',
      description:
        'Markets are at or near recent highs. No stress markers are firing — the everyday state where signals rarely come.',
    },
    correction: {
      emoji: '\u{1F7E1}',
      label: 'Correction',
      description:
        'Markets are off their recent highs but not in acute stress. Pullbacks of this depth happen multiple times a year and usually resolve quickly.',
    },
    bear: {
      emoji: '\u{1F534}',
      label: 'Bear',
      description:
        'Markets have been chronically below their recent highs. Elevated stress — historically the environment where the DoubleTrends™ signal fires.',
    },
    panic: {
      emoji: '\u{1F7E0}',
      label: 'Panic',
      description:
        'Markets are in acute stress — sharp drawdown with high volatility. The rare, high-stakes environment the signal is designed to catch.',
    },
  };
  const UNKNOWN_REGIME = {
    emoji: '⚪',
    label: 'Loading',
    description: 'Market read unavailable.',
  };

  const INVALID_DATE_MESSAGE =
    'Use ISO date format: /brief YYYY-MM-DD (e.g. /brief 2020-03-23).';
  const NO_HISTORY_MESSAGE = 'No signal history available yet. Try /history again shortly.';

  const TELEGRAM_HISTORY_CUTOFF_DATE = '2004-01-01';
  const TELEGRAM_HISTORY_CUTOFF_YEAR = TELEGRAM_HISTORY_CUTOFF_DATE.slice(0, 4);
  // Demo window bounds (PUBLIC_BRIEF_DEMO_START_DATE / END_DATE) are derived
  // from the loaded brief-demo.json below — the JSON is the single source of
  // truth so the suppression range never drifts from the shipped fixtures.

  function isValidDateArg(arg) {
    return /^\d{4}-\d{2}-\d{2}$/.test(arg);
  }
  function isTelegramHistoryDateAllowed(arg) {
    return arg >= TELEGRAM_HISTORY_CUTOFF_DATE;
  }

  function isActive(value) {
    return value === true || value === 1;
  }

  function regimeLegend() {
    return ['calm', 'correction', 'panic', 'bear']
      .map((key) => `${REGIME_META[key].emoji} ${REGIME_META[key].label}`)
      .join(' | ');
  }

  function formatContextLines(s) {
    const primary = [];
    if (typeof s.vix_value === 'number' && Number.isFinite(s.vix_value)) {
      primary.push(`VIX ${Math.round(s.vix_value)}`);
    }
    if (typeof s.fedfunds_value === 'number' && Number.isFinite(s.fedfunds_value)) {
      primary.push(`Fed ${s.fedfunds_value.toFixed(1)}%`);
    }
    if (typeof s.cpi_value === 'number' && Number.isFinite(s.cpi_value)) {
      primary.push(`CPI ${s.cpi_value.toFixed(1)}`);
    }
    const lines = [];
    if (primary.length > 0) lines.push(primary.join(' · '));
    if (typeof s.unrate_value === 'number' && Number.isFinite(s.unrate_value)) {
      lines.push(`Unemployment ${s.unrate_value.toFixed(1)}%`);
    }
    return lines;
  }

  function formatAlert(s) {
    if (isActive(s.watch_active) || isActive(s.setup_active)) {
      return '\u{1F440} Watching — early reversal pressure is forming.';
    }
    return '⚪ Listening — no reversal pressure right now.';
  }
  function formatSignal(s) {
    if (isActive(s.signal_active)) {
      const suffix = s.signal_date ? ` ${s.signal_date}` : '';
      return `✅ Fired — DoubleTrends™ signal fired${suffix}.`;
    }
    return '⚪ Monitoring — no signal in the current window.';
  }

  const NY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  function formatOffsetLabel(minutesAfterOpen, minutesAfterClose) {
    if (minutesAfterClose >= 0) return `+${minutesAfterClose} min after close`;
    if (minutesAfterOpen >= 0) return `+${minutesAfterOpen} min after open`;
    return `${minutesAfterOpen} min before open`;
  }
  function formatUpdatedAt(updatedAt, minutesAfterOpen, minutesAfterClose) {
    const label = formatOffsetLabel(minutesAfterOpen, minutesAfterClose);
    const ms = Date.parse(updatedAt);
    if (Number.isNaN(ms)) return `${updatedAt} · ${label}`;
    const parts = NY_FORMATTER.formatToParts(new Date(ms));
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '??';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')} NY · ${label}`;
  }

  function formatBriefMessage(s, options = {}) {
    const meta = REGIME_META[s.regime] ?? UNKNOWN_REGIME;
    const alertLine = formatAlert(s);
    const signalLine = formatSignal(s);
    const footer = options.historical
      ? 'This is what subscribers would have seen on that date, using only data available back then.'
      : `Updated ${formatUpdatedAt(s.updated_at, s.minutes_after_open, s.minutes_after_close)}`;

    const lines = [];
    lines.push('\u{1F4CA} DoubleTrends™ Market Brief');
    lines.push('');
    lines.push(`${s.display_name} (${s.ticker})`);
    lines.push(`${s.as_of_date} · Close ${s.close_value.toFixed(2)}`);
    const ctx = formatContextLines(s);
    if (ctx.length > 0) lines.push(...ctx);
    lines.push('');
    lines.push(`● Regime: ${meta.emoji} ${meta.label}`);
    lines.push('');
    lines.push(meta.description);
    lines.push('');
    lines.push(`All possible regimes: ${regimeLegend()}`);
    lines.push('');
    lines.push(`● Alert: ${alertLine}`);
    lines.push(`● Signal: ${signalLine}`);
    lines.push('');
    lines.push(footer);
    lines.push('');
    lines.push('Educational information only — not financial advice.');
    return lines.join('\n');
  }

  function formatReturn(base, future) {
    if (future === null || !Number.isFinite(future)) return 'pending';
    const pct = (future / base - 1) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}%`;
  }

  function padEnd(s, n) {
    s = String(s);
    return s.length >= n ? s : s + ' '.repeat(n - s.length);
  }

  function formatHistoryMessage(display, _ticker, entries) {
    if (entries.length === 0) return NO_HISTORY_MESSAGE;
    const dateW = 11, regimeW = 10, closeW = 8, returnW = 7;

    const headerRow =
      padEnd('Signal Date', dateW) + '  ' +
      padEnd('Regime', regimeW) + '  ' +
      padEnd('Close', closeW) + '  ' +
      padEnd('90d', returnW) + '  ' +
      padEnd('1y', returnW) + '  ' +
      padEnd('2y', returnW);

    const dataRows = entries.map((e) =>
      padEnd(e.signal_date, dateW) + '  ' +
      padEnd(e.regime, regimeW) + '  ' +
      padEnd(e.signal_close.toFixed(2), closeW) + '  ' +
      padEnd(formatReturn(e.signal_close, e.close_90d), returnW) + '  ' +
      padEnd(formatReturn(e.signal_close, e.close_365d), returnW) + '  ' +
      padEnd(formatReturn(e.signal_close, e.close_730d), returnW),
    );

    const header = `\u{1F4DC} DoubleTrends™ Signal History (${display})`;
    return {
      __html: true,
      text: [
        header,
        '',
        '<pre>',
        headerRow,
        ...dataRows,
        '</pre>',
        `Each row is the DoubleTrends™ signal subscribers would have seen on that date, using only data available back then. ${entries.length} signals since ${TELEGRAM_HISTORY_CUTOFF_YEAR}.`,
        '',
        'Educational information only — not financial advice.',
      ].join('\n'),
    };
  }

  // ─── Ported from worker/src/access.ts ──────────────────────────────────────
  function parseCommand(text) {
    if (!text) return { command: '', arg: null };
    const trimmed = text.trim();
    const [rawCommand, ...rest] = trimmed.split(/\s+/);
    const command = rawCommand.split('@')[0].toLowerCase();
    const arg = rest.length > 0 ? rest.join(' ') : null;
    return { command, arg };
  }

  // ─── Ported from worker/src/telegram.ts ────────────────────────────────────
  const COMMANDS_MESSAGE =
    'Commands:\n' +
    '/help — show this list\n' +
    '/status — check your subscription\n' +
    '/brief — latest market read (suppressed for demo)\n' +
    '/brief YYYY-MM-DD — market read for a past trading day\n' +
    `/history — DoubleTrends™ Signal History since ${TELEGRAM_HISTORY_CUTOFF_YEAR}`;

  const ACTIVE_HEADER =
    '✅ Your DoubleTrends™ subscription is active.\n' +
    "The next S&P 500 oversold-reversal signal will arrive here as a DM. " +
    "Signals are rare — there's nothing to do in the meantime.";
  const ACTIVE_START_MESSAGE = `${ACTIVE_HEADER}\n\n${COMMANDS_MESSAGE}`;

  function buildActiveStatusMessage(row) {
    const dash = (v) => v ?? '—';
    return (
      `${ACTIVE_HEADER}\n\n` +
      'Account:\n' +
      `● Name: ${dash(row.full_name)}\n` +
      `● Email: ${dash(row.email)}\n` +
      `● Stripe Customer: ${row.stripe_customer_id}\n` +
      `● Telegram ID: ${dash(row.telegram_user_id)}\n\n` +
      '(Include these if contacting info@doubletrends.com.)'
    );
  }

  // ─── Synthetic subscriber for the demo ─────────────────────────────────────
  const SYNTHETIC_SUBSCRIBER = {
    stripe_customer_id: 'cus_demo_sandbox',
    subscription_id: 'sub_demo_sandbox',
    claim_token: null,
    telegram_user_id: 'sandbox-user',
    status: 'active',
    email: 'demo@doubletrends.com',
    full_name: 'Demo Visitor',
  };

  // ─── Data layer ────────────────────────────────────────────────────────────
  const [briefDemo, history] = await Promise.all([
    fetch('public/replay/brief-demo.json').then((r) => r.json()),
    fetch('public/replay/history.json').then((r) => r.json()),
  ]);

  const briefsByDate = new Map(Object.entries(briefDemo.briefs ?? {}));
  const PUBLIC_BRIEF_DEMO_START_DATE = briefDemo.start_date;
  const PUBLIC_BRIEF_DEMO_END_DATE = briefDemo.end_date;
  const isPublicBriefDemoDate = (arg) =>
    arg >= PUBLIC_BRIEF_DEMO_START_DATE && arg <= PUBLIC_BRIEF_DEMO_END_DATE;
  const NO_BRIEF_FOR_DATE_MESSAGE =
    `The public demo only exposes trading days from ${PUBLIC_BRIEF_DEMO_START_DATE} to ${PUBLIC_BRIEF_DEMO_END_DATE}. ` +
    'Other dates are suppressed here on purpose. Try one of the demo dates above, or /history for the full signal record.';

  function resolveBotMessages(text) {
    const { command, arg } = parseCommand(text);

    if (command === '/start') {
      return [{ text: ACTIVE_START_MESSAGE }];
    }
    if (command === '/status') {
      return [{ text: buildActiveStatusMessage(SYNTHETIC_SUBSCRIBER) }];
    }
    if (command === '/help') {
      return [{ text: COMMANDS_MESSAGE }];
    }
    if (command === '/brief') {
      if (!arg) return [{ text: INVALID_DATE_MESSAGE }];
      if (!isValidDateArg(arg)) return [{ text: INVALID_DATE_MESSAGE }];
      if (!isTelegramHistoryDateAllowed(arg)) return [{ text: NO_BRIEF_FOR_DATE_MESSAGE }];
      if (!isPublicBriefDemoDate(arg)) return [{ text: NO_BRIEF_FOR_DATE_MESSAGE }];
      const row = briefsByDate.get(arg);
      return [{ text: row ? formatBriefMessage(row, { historical: true }) : NO_BRIEF_FOR_DATE_MESSAGE }];
    }
    if (command === '/history') {
      return [formatHistoryMessage(history.display, history.ticker, history.entries)];
    }
    return [{ text: COMMANDS_MESSAGE + '\n\nNot subscribed yet? Visit doubletrends.com.' }];
  }

  // ─── Chat rendering ────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // formatHistoryMessage returns html=true and embeds <pre>...</pre> blocks.
  // Render those literal tags as actual <pre>. Everything else is escape +
  // \n → <br/>.
  function renderMessageBody(message) {
    if (message.__html || message.html) {
      const safe = message.text.replace(/<pre>([\s\S]*?)<\/pre>/g, (_, inner) =>
        `<pre>${escapeHtml(inner)}</pre>`,
      );
      const withoutPre = safe.replace(/<pre>[\s\S]*?<\/pre>/g, '');
      const escapedRest = escapeHtml(withoutPre).replace(/\n/g, '<br/>');
      // Reconstruct by scanning again — simpler: split message by pre, escape
      // non-pre chunks, leave pre chunks as-is (already inner-escaped above).
      let out = '';
      let i = 0;
      const text = message.text;
      const re = /<pre>([\s\S]*?)<\/pre>/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        out += escapeHtml(text.slice(i, m.index)).replace(/\n/g, '<br/>');
        out += `<pre>${escapeHtml(m[1])}</pre>`;
        i = m.index + m[0].length;
      }
      out += escapeHtml(text.slice(i)).replace(/\n/g, '<br/>');
      return out;
    }
    return escapeHtml(message.text).replace(/\n/g, '<br/>');
  }

  function animateBubbleIn(wrap, side, mode = 'default') {
    const bubble = wrap.querySelector('.chat-bubble');
    if (!bubble) return;

    if (side === 'user') {
      const launchRect = form.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const dx = launchRect.right - bubbleRect.right - 10;
      const dy = launchRect.top - bubbleRect.bottom + 12;
      bubble.animate(
        [
          { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.92)` },
          { opacity: 1, transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 372, easing: 'cubic-bezier(0.22, 0.88, 0.24, 1)', fill: 'both' },
      );
      return;
    }

    const start = mode === 'typing'
      ? { opacity: 0, transform: 'translate(-6px, 8px) scale(0.96)' }
      : { opacity: 0, transform: 'translate(-4px, 6px) scale(0.98)' };
    bubble.animate(
      [start, { opacity: 1, transform: 'translate(0, 0) scale(1)' }],
      { duration: mode === 'typing' ? 304 : 287, easing: 'cubic-bezier(0.2, 0.9, 0.2, 1)', fill: 'both' },
    );
  }

  function appendBubble(side, body, extraClass = '', bubbleClass = '', motion = 'default') {
    const wrap = document.createElement('div');
    wrap.className = `chat-row chat-row-${side}${extraClass ? ` ${extraClass}` : ''}`;
    wrap.innerHTML = `<div class="chat-bubble chat-bubble-${side}${bubbleClass ? ` ${bubbleClass}` : ''}">${body}</div>`;
    chatLog.appendChild(wrap);
    requestAnimationFrame(() => animateBubbleIn(wrap, side, motion));
    chatLog.scrollTop = chatLog.scrollHeight;
    return wrap;
  }

  function addTypingIndicator() {
    return appendBubble(
      'bot',
      '<div class="chat-typing" aria-label="Typing"><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span></div>',
      'chat-bubble-typing',
      'typing',
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sendUserCommand(text) {
    if (!text) return;
    appendBubble('user', escapeHtml(text));
    const messages = resolveBotMessages(text);
    const typing = addTypingIndicator();
    await sleep(BOT_REPLY_DELAY_MS);
    typing.remove();
    for (const m of messages) {
      appendBubble('bot', renderMessageBody(m));
      if (messages.length > 1) await sleep(BOT_REPLY_GAP_MS);
    }
  }

  // ─── Wire up the UI ────────────────────────────────────────────────────────
  chipsRoot.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    input.value = cmd;
    void sendUserCommand(cmd);
    input.value = '';
    input.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    void sendUserCommand(text);
    input.value = '';
    input.focus();
  });

  // Seed the conversation to mirror a real first-touch Telegram exchange.
  appendBubble('user', escapeHtml('/start'));
  appendBubble('bot', renderMessageBody({ text: ACTIVE_START_MESSAGE }));
})();
