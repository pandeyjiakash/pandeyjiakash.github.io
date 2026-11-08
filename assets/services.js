(() => {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const resetters = [];
  const limit = value => Math.max(-5, Math.min(5, value));

  document.querySelectorAll('[data-service-row]').forEach(row => {
    const surface = row.querySelector('[data-service-tilt]');
    const deck = row.querySelector('[data-service-deck]');
    const cards = Array.from(row.querySelectorAll('[data-service-card]'));
    const shuffles = Array.from(row.querySelectorAll('[data-service-shuffle]'));
    const choices = Array.from(row.querySelectorAll('[data-service-choice]'));
    const status = row.querySelector('[data-service-status]');
    if (!surface || !deck || !status || cards.length < 2 || choices.length !== cards.length) return;
    let selected = 0;
    let scheduled = 0;
    let latestPoint = null;

    function resetTilt() {
      if (scheduled) cancelAnimationFrame(scheduled);
      scheduled = 0;
      latestPoint = null;
      deck.style.setProperty('--tilt-x', '0deg');
      deck.style.setProperty('--tilt-y', '0deg');
    }
    resetters.push(resetTilt);

    function select(index) {
      if (!Number.isInteger(index) || index < 0 || index >= cards.length) return;
      const changed = index !== selected;
      resetTilt();
      selected = index;
      deck.dataset.pose = String(selected % 3);
      cards.forEach((card, cardIndex) => {
        card.dataset.position = ['front', 'middle', 'back', 'parked'][(cardIndex - selected + cards.length) % cards.length];
      });
      choices.forEach((choice, choiceIndex) => choice.setAttribute('aria-pressed', String(choiceIndex === selected)));
      status.textContent = cards[selected].dataset.serviceName;
      if (changed) window.portfolioSound?.play('shuffle');
    }

    function tilt(event) {
      if (!finePointer.matches || reducedMotion.matches || document.hidden || event.pointerType !== 'mouse') return;
      const samples = event.getCoalescedEvents?.();
      const point = samples?.length ? samples[samples.length - 1] : event;
      latestPoint = {x: point.clientX, y: point.clientY};
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        if (!latestPoint || !finePointer.matches || reducedMotion.matches || document.hidden) return;
        const bounds = surface.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const x = limit(((latestPoint.x - bounds.left) / bounds.width - .5) * 10);
        const y = limit(((latestPoint.y - bounds.top) / bounds.height - .5) * -10);
        deck.style.setProperty('--tilt-x', y.toFixed(2) + 'deg');
        deck.style.setProperty('--tilt-y', x.toFixed(2) + 'deg');
      });
    }

    surface.addEventListener('pointerenter', tilt, {passive:true});
    surface.addEventListener('pointermove', tilt, {passive:true});
    surface.addEventListener('pointerleave', resetTilt);
    surface.addEventListener('pointercancel', resetTilt);
    shuffles.forEach(button => {
      button.addEventListener('click', () => select((selected + 1) % cards.length));
      button.disabled = false;
    });
    choices.forEach(button => {
      button.addEventListener('click', () => select(Number(button.dataset.serviceChoice)));
      button.disabled = false;
    });
  });

  function resetAll() {resetters.forEach(reset => reset());}
  window.addEventListener('pagehide', resetAll);
  document.addEventListener('visibilitychange', () => {if (document.hidden) resetAll();});
  finePointer.addEventListener('change', resetAll);
  reducedMotion.addEventListener('change', resetAll);
})();
