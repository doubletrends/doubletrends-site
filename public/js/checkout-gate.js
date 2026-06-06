(function () {
  const gate = document.getElementById('checkout-gate');
  if (!gate) return;

  const continueBtn = document.getElementById('checkout-gate-continue');
  const cancelBtn = document.getElementById('checkout-gate-cancel');
  const backdrop = document.getElementById('checkout-gate-backdrop');
  let lastFocus = null;

  if (!continueBtn || !cancelBtn || !backdrop) return;

  function isCheckoutLink(link) {
    if (!link || !link.href) return false;
    try {
      return new URL(link.href).host === 'buy.stripe.com';
    } catch (_err) {
      return false;
    }
  }

  function openGate(href) {
    continueBtn.setAttribute('href', href);
    gate.classList.remove('hidden');
    gate.classList.add('flex');
    gate.setAttribute('aria-hidden', 'false');
    lastFocus = document.activeElement;
    continueBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeGate() {
    gate.classList.add('hidden');
    gate.classList.remove('flex');
    gate.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest ? event.target.closest('a') : null;
    if (!link || link.id === 'checkout-gate-continue') return;

    if (isCheckoutLink(link)) {
      event.preventDefault();
      openGate(link.href);
    }
  });

  cancelBtn.addEventListener('click', closeGate);
  backdrop.addEventListener('click', closeGate);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !gate.classList.contains('hidden')) closeGate();
  });
})();
