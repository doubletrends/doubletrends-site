(function () {
  const timers = new WeakMap();
  const DURATION_MS = 260;

  function getAnimatedContent(details) {
    return details.querySelector('.site-footer-details-content');
  }

  function clearTimer(content) {
    const timer = timers.get(content);
    if (timer) clearTimeout(timer);
  }

  function prepareAnimatedContent(content, open) {
    if (!content || content.dataset.prepared === 'true') return;

    content.style.overflow = 'hidden';
    content.style.display = 'grid';
    content.style.gridTemplateRows = open ? '1fr' : '0fr';
    content.style.opacity = open ? '1' : '0';
    content.style.transition = `grid-template-rows ${DURATION_MS}ms ease, opacity ${DURATION_MS}ms ease`;
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

  function bindFooterAccordion(root) {
    root.querySelectorAll('.site-footer-details').forEach((details) => {
      const summary = details.querySelector('.site-footer-summary');
      const content = getAnimatedContent(details);
      if (!summary || !content) return;

      prepareAnimatedContent(content, details.open);

      summary.addEventListener('click', (event) => {
        event.preventDefault();

        if (details.open) {
          closeDetails(details, content);
        } else {
          openDetails(details, content);
        }
      });
    });
  }

  function bindFooterMenu(menu) {
    const tabs = Array.from(menu.querySelectorAll('.site-footer-tab'));
    const panels = Array.from(menu.querySelectorAll('.site-footer-panel'));

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const shouldOpen = tab.getAttribute('aria-selected') !== 'true';
        const targetPanelId = tab.getAttribute('aria-controls');

        tabs.forEach((item) => {
          const active = shouldOpen && item === tab;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        panels.forEach((panel) => {
          const active = shouldOpen && panel.id === targetPanelId;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      });
    });
  }

  bindFooterAccordion(document);
  document.querySelectorAll('.site-footer-mobile-menu').forEach(bindFooterMenu);
})();
