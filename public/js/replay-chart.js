(async function () {
  const chartEl = document.getElementById('chart');
  const replayShell = document.getElementById('replay-shell');

  if (!chartEl || !replayShell || typeof LightweightCharts === 'undefined') return;

  let data;
  try {
    const response = await fetch(chartEl.dataset.replaySrc);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    console.error('replay-chart: failed to load replay data', err);
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = 'chart unavailable';
    return;
  }
  const candles = data.candles;
  // sp500.json now carries the authoritative signal list from build-replay-data.js;
  // tolerate older shapes that only had `signals` and no per-candle enrichment.
  const signalSet = new Set(data.signals);
  const signalIdx = [];

  candles.forEach((candle, index) => {
    if (signalSet.has(candle.time)) signalIdx.push(index);
  });

  const FAST_STEP = 5;
  const SLOW_STEP = 1;
  const SLOW_WINDOW = 22;
  const SIGNAL_PAUSE_MS = 1000;
  const TICK_MS = 32;
  const WINDOW_SIZE = 180;

  const shellStyle = getComputedStyle(replayShell);
  const cssVar = (name) => shellStyle.getPropertyValue(name).trim();
  const rgbaVar = (rgbVar, alphaVar) => `rgba(${cssVar(rgbVar)}, ${cssVar(alphaVar)})`;

  // Regime band tints come from the replay shell palette so the chart,
  // terminal legend, and flash overlay stay in sync.
  const REGIME_COLOR = {
    calm: rgbaVar('--replay-calm-rgb', '--replay-band-alpha-calm'),
    correction: rgbaVar('--replay-correction-rgb', '--replay-band-alpha-correction'),
    panic: rgbaVar('--replay-panic-rgb', '--replay-band-alpha-panic'),
    bear: rgbaVar('--replay-bear-rgb', '--replay-band-alpha-bear'),
  };
  const NEUTRAL_TINT = 'rgba(0, 0, 0, 0)';

  // Inline SVG icons. Match the buttons' currentColor so they inherit the
  // light/dark theme without extra styling. Replay button flips between play
  // (during playback) and circular-arrow (once finished); FF button never
  // changes — clicking it is a one-shot speed-up for the remainder of the
  // current replay.
  const PLAY_SVG =
    '<svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor" ' +
    'aria-hidden="true" style="display:inline-block;vertical-align:-1px;' +
    'margin-right:0.45em;"><path d="M0 0L9 5.5L0 11Z"/></svg>';
  const REPLAY_SVG =
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" style="display:inline-block;' +
    'vertical-align:-2px;margin-right:0.45em;">' +
    '<path d="M14 8 A6 6 0 1 1 8 2"/>' +
    '<polyline points="11 5 8 2 5 5"/></svg>';

  const chartHeight = () => window.matchMedia('(max-width: 767px)').matches ? 330 : 480;
  const chart = LightweightCharts.createChart(chartEl, {
    width: chartEl.clientWidth,
    height: chartHeight(),
    layout: {
      background: { type: 'solid', color: '#FFFFFF' },
      textColor: '#5A6473',
      fontFamily: "'JetBrains Mono', monospace",
    },
    grid: {
      vertLines: { color: 'rgba(0,0,0,0.06)' },
      horzLines: { color: 'rgba(0,0,0,0.06)' },
    },
    rightPriceScale: { borderColor: 'rgba(0,0,0,0.12)' },
    // minBarSpacing default is 0.5 — at ~2600 candles that needs >1300px of
    // chart width or the overview clamps to the right edge and crops the
    // start. Drop it so fitContent can fit everything.
    timeScale: { borderColor: 'rgba(0,0,0,0.12)', rightOffset: 4, fixLeftEdge: false, minBarSpacing: 0.1 },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: false,
    handleScale: false,
  });

  // Regime band: a histogram series mounted on a hidden, full-height price
  // scale. Each bar is value=1 with a per-bar color picked from REGIME_COLOR.
  // Added BEFORE the candle series so candles render on top of the tint.
  const regimeSeries = chart.addHistogramSeries({
    priceScaleId: 'regime',
    priceFormat: { type: 'volume' },
    base: 0,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  chart.priceScale('regime').applyOptions({
    scaleMargins: { top: 0, bottom: 0 },
    visible: false,
  });

  // Candle colors come from the brand semantic tokens on :root (see
  // primitives.html). Read at series-init time and composed as rgba so the
  // chart stays in sync with history-table.js without a second source of truth.
  const rootStyle = getComputedStyle(document.documentElement);
  const cssVarRoot = (name) => rootStyle.getPropertyValue(name).trim();
  const colorGain = `rgba(${cssVarRoot('--gain-rgb')}, 1)`;
  const colorLoss = `rgba(${cssVarRoot('--loss-rgb')}, 1)`;

  const series = chart.addCandlestickSeries({
    upColor: colorGain,
    downColor: colorLoss,
    wickUpColor: colorGain,
    wickDownColor: colorLoss,
    borderVisible: false,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  const statusEl = document.getElementById('status');
  const replayBtn = document.getElementById('replayBtn');
  const datePill = document.getElementById('date-pill');
  const statePill = document.getElementById('replay-state-pill');
  const signalPill = document.getElementById('signal-pill');
  const flashBands = Array.from(document.querySelectorAll('.flash-band'));

  function setStatePill(label) {
    if (!statePill) return;
    statePill.innerHTML = `<span class="status-dot"></span>${label}`;
  }
  function setReplayBtnEnabled(enabled) {
    if (!replayBtn) return;
    replayBtn.disabled = !enabled;
    replayBtn.style.opacity = enabled ? '1' : '0.45';
    replayBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  let cursor = 0;
  let markers = [];
  let signalsShown = 0;
  let pausedUntil = 0;
  let timer = null;
  let hasStarted = false;
  let fastForward = false;
  const FF_STEP = 20;

  function nextSignalDistance(index) {
    for (const signalIndex of signalIdx) {
      if (signalIndex >= index) return signalIndex - index;
    }
    return Infinity;
  }

  function scrollChart() {
    const from = Math.max(0, cursor - WINDOW_SIZE);
    chart.timeScale().setVisibleLogicalRange({ from, to: cursor + 4 });
  }

  function fireFlash() {
    flashBands.forEach((band) => {
      band.style.opacity = '1';
    });

    setTimeout(() => {
      flashBands.forEach((band) => {
        band.style.opacity = '0';
      });
    }, 220);
  }

  function updateSignalPill() {
    if (!signalPill) return;
    signalPill.innerHTML = `Signals: <b style="color:#C2410C;">${signalsShown}</b>`;
  }

  function updateDatePill(time) {
    if (!datePill) return;
    datePill.innerHTML = `Date: <b style="color:#C2410C;">${time ?? '—'}</b>`;
  }

  function addCandle() {
    const candle = candles[cursor];
    const time = candle.time;
    // Signal fires exactly once per cluster — the first day of the active
    // window. signalSet carries the distinct signal_dates from the backfill;
    // the remaining 4–5 days where candle.signal === 1 are the trailing
    // window and should not re-fire the ▲.
    const isSignal = signalSet.has(time);

    series.update({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });

    regimeSeries.update({
      time,
      value: 1,
      color: REGIME_COLOR[candle.regime] ?? NEUTRAL_TINT,
    });
    updateDatePill(time);

    if (isSignal) {
      markers.push({
        time,
        position: 'belowBar',
        color: '#C8413B',
        shape: 'arrowUp',
        size: 2,
      });
      series.setMarkers(markers);
      signalsShown++;
      updateSignalPill();
      fireFlash();
      pausedUntil = performance.now() + SIGNAL_PAUSE_MS;
      cursor++;
      scrollChart();
      return true;
    }

    cursor++;
    return false;
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    replayBtn.innerHTML = `${REPLAY_SVG}Replay`;

    const total = candles.length;
    const startFrom = Math.max(0, total - WINDOW_SIZE);
    const startTo = total + 4;
    const endFrom = -6;
    const endTo = total + 6;
    const duration = 1200;
    const startedAt = performance.now();
    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    statusEl.textContent = 'overview...';

    function animate(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = easeOutCubic(progress);

      chart.timeScale().setVisibleLogicalRange({
        from: startFrom + (endFrom - startFrom) * eased,
        to: startTo + (endTo - startTo) * eased,
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
        return;
      }

      // setVisibleLogicalRange gets clamped when the requested range exceeds
      // the chart width at minBarSpacing — anchoring to the right edge and
      // cropping the oldest bars (so the overview would start at ~2018
      // instead of 2016). fitContent lets the library pick a bar spacing
      // that actually fits everything.
      chart.timeScale().fitContent();
      setStatePill('Replay finished');
      setReplayBtnEnabled(true);
      updateSignalPill();
      statusEl.textContent = `${signalsShown} signals · ${candles[0].time} → ${candles[total - 1].time}`;
    }

    requestAnimationFrame(animate);
  }

  function step() {
    if (!fastForward && performance.now() < pausedUntil) return;

    if (cursor >= candles.length) {
      finish();
      return;
    }

    const stepSize = fastForward
      ? FF_STEP
      : (nextSignalDistance(cursor) <= SLOW_WINDOW ? SLOW_STEP : FAST_STEP);
    for (let i = 0; i < stepSize && cursor < candles.length; i++) {
      // In fast-forward, the signal-fire short-circuit (return true) still
      // breaks the inner loop but we don't honor the pause — so the next
      // tick keeps moving.
      if (addCandle() && !fastForward) break;
    }
    scrollChart();
  }

  function start() {
    if (timer) clearInterval(timer);

    series.setData([]);
    series.setMarkers([]);
    regimeSeries.setData([]);
    cursor = 0;
    markers = [];
    signalsShown = 0;
    pausedUntil = 0;
    fastForward = false;
    updateDatePill(null);
    updateSignalPill();
    setStatePill('Live replay');
    setReplayBtnEnabled(true);
    statusEl.textContent = 'replaying...';
    replayBtn.innerHTML = `${PLAY_SVG}Replaying`;
    timer = setInterval(step, TICK_MS);
  }

  const fastForwardBtn = document.getElementById('fastForwardBtn');
  // One-shot: clicking fast-forward speeds up the rest of the current replay
  // and locks the Replay button until the overview finishes. Label/icon
  // never change. To slow back down, wait for finish, then click Replay.
  if (fastForwardBtn) {
    fastForwardBtn.addEventListener('click', () => {
      fastForward = true;
      setStatePill('Fast forwarding');
      setReplayBtnEnabled(false);
    });
  }

  replayBtn.addEventListener('click', start);
  window.addEventListener('resize', () => {
    chart.applyOptions({ width: chartEl.clientWidth, height: chartHeight() });
  });

  statusEl.textContent = 'ready';

  const observer = new IntersectionObserver((entries) => {
    if (!hasStarted && entries.some((entry) => entry.isIntersecting)) {
      hasStarted = true;
      start();
      observer.disconnect();
    }
  }, { threshold: 0.35 });

  observer.observe(replayShell);
})();
