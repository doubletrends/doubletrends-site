(async function () {
  const chartEl = document.getElementById('chart');
  const replayShell = document.getElementById('replay-shell');

  if (!chartEl || !replayShell || typeof LightweightCharts === 'undefined') return;

  const response = await fetch(chartEl.dataset.replaySrc);
  const data = await response.json();
  const candles = data.candles;
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
    timeScale: { borderColor: 'rgba(0,0,0,0.12)', rightOffset: 4, fixLeftEdge: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: false,
    handleScale: false,
  });

  const series = chart.addCandlestickSeries({
    upColor: '#2E9E7B',
    downColor: '#C8413B',
    wickUpColor: '#2E9E7B',
    wickDownColor: '#C8413B',
    borderVisible: false,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  const readout = document.getElementById('readout');
  const statusEl = document.getElementById('status');
  const replayBtn = document.getElementById('replayBtn');
  const flashBands = Array.from(document.querySelectorAll('.flash-band'));

  let cursor = 0;
  let markers = [];
  let signalsShown = 0;
  let pausedUntil = 0;
  let timer = null;
  let hasStarted = false;

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

  function updateReadout(time) {
    readout.innerHTML = `Signals: <b style="color: #C2410C;">${signalsShown}</b> · ${time}`;
  }

  function addCandle() {
    const candle = candles[cursor];
    const time = candle.time;
    const isSignal = signalSet.has(time);

    series.update({ ...candle });
    updateReadout(time);

    if (isSignal) {
      markers.push({
        time,
        position: 'belowBar',
        color: '#C2410C',
        shape: 'arrowUp',
        size: 2,
      });
      series.setMarkers(markers);
      signalsShown++;
      updateReadout(time);
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
    replayBtn.textContent = 'Replay';

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

      readout.innerHTML = `Signals: <b style="color: #C2410C;">${signalsShown}</b> · 2016 → 2026`;
      statusEl.textContent = `${signalsShown} signals · ${candles[0].time} → ${candles[total - 1].time}`;
    }

    requestAnimationFrame(animate);
  }

  function step() {
    if (performance.now() < pausedUntil) return;

    if (cursor >= candles.length) {
      finish();
      return;
    }

    const stepSize = nextSignalDistance(cursor) <= SLOW_WINDOW ? SLOW_STEP : FAST_STEP;
    for (let i = 0; i < stepSize && cursor < candles.length; i++) {
      if (addCandle()) break;
    }
    scrollChart();
  }

  function start() {
    if (timer) clearInterval(timer);

    series.setData([]);
    series.setMarkers([]);
    cursor = 0;
    markers = [];
    signalsShown = 0;
    pausedUntil = 0;
    statusEl.textContent = 'replaying...';
    replayBtn.textContent = 'Replaying';
    timer = setInterval(step, TICK_MS);
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
