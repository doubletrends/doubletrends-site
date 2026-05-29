(function () {
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

  document.querySelectorAll('.site-footer-mobile-menu').forEach(bindFooterMenu);
})();
