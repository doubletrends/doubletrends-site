(function () {
  const detailsItems = Array.from(document.querySelectorAll('#faq details'));
  if (!detailsItems.length) return;

  const timers = new WeakMap();
  const DURATION_MS = 260;

  function getContent(details) {
    return Array.from(details.children).find((child) => child.tagName !== 'SUMMARY');
  }

  function clearTimer(content) {
    const timer = timers.get(content);
    if (timer) clearTimeout(timer);
  }

  function prepareContent(content, open) {
    if (content.dataset.prepared === 'true') return;

    content.style.overflow = 'hidden';
    content.style.display = 'grid';
    content.style.gridTemplateRows = open ? '1fr' : '0fr';
    content.style.opacity = open ? '1' : '0';
    content.style.transition = `grid-template-rows ${DURATION_MS}ms ease, opacity ${DURATION_MS}ms ease`;

    const inner = document.createElement('div');
    inner.style.minHeight = '0';
    while (content.firstChild) inner.appendChild(content.firstChild);
    content.appendChild(inner);
    content.dataset.prepared = 'true';
  }

  function openDetails(details, content) {
    clearTimer(content);
    details.open = true;
    content.style.gridTemplateRows = '0fr';
    content.style.opacity = '0';

    requestAnimationFrame(() => {
      content.style.gridTemplateRows = '1fr';
      content.style.opacity = '1';
    });
  }

  function closeDetails(details, content) {
    clearTimer(content);
    content.style.gridTemplateRows = '1fr';
    content.style.opacity = '1';

    requestAnimationFrame(() => {
      content.style.gridTemplateRows = '0fr';
      content.style.opacity = '0';
    });

    timers.set(content, setTimeout(() => {
      details.open = false;
      content.style.gridTemplateRows = '0fr';
    }, DURATION_MS));
  }

  detailsItems.forEach((details) => {
    const summary = details.querySelector('summary');
    const content = getContent(details);
    if (!summary || !content) return;

    prepareContent(content, details.open);

    summary.addEventListener('click', (event) => {
      event.preventDefault();

      if (details.open) {
        closeDetails(details, content);
      } else {
        openDetails(details, content);
      }
    });
  });
})();
