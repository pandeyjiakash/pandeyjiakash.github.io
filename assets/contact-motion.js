(() => {
  const title = document.querySelector('[data-contact-take]');
  if (!title) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let timer = 0;
  let arrived = false;
  let tap = null;
  let visible = !('IntersectionObserver' in window);
  let ignoreUntil = 0;
  function reset() {
    clearTimeout(timer);
    timer = 0;
    tap = null;
    title.classList.remove('is-advancing', 'is-quiet');
    title.dataset.playing = 'false';
  }
  function advance(userInitiated = false) {
    if (!visible || document.hidden || timer) return;
    if (userInitiated) window.portfolioSound?.play('take');
    title.classList.add(reduced.matches ? 'is-quiet' : 'is-advancing');
    title.dataset.playing = 'true';
    timer = setTimeout(reset, reduced.matches ? 500 : 950);
  }
  title.disabled = false;
  title.addEventListener('pointerdown', event => {
    if (event.isPrimary === false) {
      if (tap) tap.cancelled=true;
      ignoreUntil=performance.now()+350;
      return;
    }
    if (event.button > 0) return;
    ignoreUntil=0;
    tap = {id:event.pointerId,x:event.clientX,y:event.clientY,cancelled:false};
  }, {passive:true});
  title.addEventListener('pointermove', event => {
    if (tap && event.pointerId === tap.id && Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>12) {
      tap.cancelled=true;
      ignoreUntil=performance.now()+350;
    }
  }, {passive:true});
  title.addEventListener('pointercancel', event => {
    if (!tap || event.pointerId===tap.id) {tap=null;ignoreUntil=performance.now()+350;}
  });
  title.addEventListener('click', event => {
    if (event.detail && (tap?.cancelled || performance.now()<ignoreUntil)) {tap=null;return;}
    tap=null;
    advance(true);
  });
  title.addEventListener('pointerenter', event => {if (fine.matches && event.pointerType==='mouse') advance(true);});
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible=entries[0].isIntersecting;
      if (!visible) reset();
      else if (!arrived) {arrived=true;advance();}
    }, {threshold:.35}).observe(title);
  }
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => {if (document.hidden) reset();});
  reduced.addEventListener('change', reset);
})();
