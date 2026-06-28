(function () {
  const DURATION = 260;
  const timers   = new WeakMap();

  function getContent(details) {
    for (const child of details.children) {
      if (child.tagName !== 'SUMMARY') return child;
    }
    return null;
  }

  function prepare(content, open) {
    if (content.dataset.accordionReady === 'true') return;

    // Re-use the existing sole child as the grid inner so we avoid DOM
    // mutations where possible; only inject a wrapper for multi-child content.
    let inner;
    if (content.children.length === 1) {
      inner = content.children[0];
    } else {
      inner = document.createElement('div');
      while (content.firstChild) inner.appendChild(content.firstChild);
      content.appendChild(inner);
    }
    inner.style.minHeight = '0';

    content.style.overflow         = 'hidden';
    content.style.display          = 'grid';
    content.style.gridTemplateRows = open ? '1fr' : '0fr';
    content.style.opacity          = open ? '1'   : '0';
    content.style.transition       =
      `grid-template-rows ${DURATION}ms ease, opacity ${DURATION}ms ease`;
    content.dataset.accordionReady = 'true';
  }

  function openPanel(details, content) {
    const t = timers.get(content);
    if (t) clearTimeout(t);
    details.open = true;
    content.style.gridTemplateRows = '0fr';
    content.style.opacity = '0';
    requestAnimationFrame(() => {
      content.style.gridTemplateRows = '1fr';
      content.style.opacity = '1';
    });
  }

  function closePanel(details, content) {
    const t = timers.get(content);
    if (t) clearTimeout(t);
    content.style.gridTemplateRows = '1fr';
    content.style.opacity = '1';
    requestAnimationFrame(() => {
      content.style.gridTemplateRows = '0fr';
      content.style.opacity = '0';
    });
    timers.set(content, setTimeout(() => {
      details.open = false;
    }, DURATION));
  }

  document.querySelectorAll('details').forEach((details) => {
    const summary = details.querySelector('summary');
    const content = getContent(details);
    if (!summary || !content) return;

    prepare(content, details.open);

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (details.open) closePanel(details, content);
      else              openPanel(details, content);
    });
  });
}());
