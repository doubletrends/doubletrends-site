(function () {
  const WORKER_URL = window.DOUBLETRENDS_WORKER_URL;
  const sessionId = new URLSearchParams(window.location.search).get('session_id');

  const loading = document.getElementById('state-loading');
  const ready = document.getElementById('state-ready');
  const pending = document.getElementById('state-pending');
  const nosession = document.getElementById('state-nosession');
  const retryBtn = document.getElementById('retry-btn');
  const inviteLink = document.getElementById('invite-link');

  if (!WORKER_URL || !loading || !ready || !pending || !nosession || !retryBtn || !inviteLink) return;

  const MAX_ATTEMPTS = 60;
  const INTERVAL_MS = 2000;
  let attempt = 0;

  function show(panel) {
    [loading, ready, pending, nosession].forEach((item) => {
      item.classList.add('hidden');
      item.classList.remove('flex');
    });
    panel.classList.remove('hidden');
    panel.classList.add('flex');
  }

  function scheduleRetry() {
    if (attempt >= MAX_ATTEMPTS) {
      show(pending);
      return;
    }
    setTimeout(poll, INTERVAL_MS);
  }

  function poll() {
    attempt += 1;

    fetch(`${WORKER_URL}/access?session_id=${encodeURIComponent(sessionId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data && data.deep_link) {
          inviteLink.href = data.deep_link;
          show(ready);
          return;
        }
        scheduleRetry();
      })
      .catch(scheduleRetry);
  }

  retryBtn.addEventListener('click', () => {
    attempt = 0;
    show(loading);
    poll();
  });

  if (!sessionId) {
    show(nosession);
    return;
  }

  poll();
})();
