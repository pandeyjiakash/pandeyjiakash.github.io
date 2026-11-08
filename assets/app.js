(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const dialog = document.querySelector('.film-dialog');
  const dataElement = document.getElementById('project-data');
  if (!dialog || !dataElement) return;
  const projects = JSON.parse(dataElement.textContent);
  const video = dialog.querySelector('video');
  const error = dialog.querySelector('.video-error');
  let selected = 0;
  let opener = null;
  let restoringFocus = false;
  let pageLock = null;
  function lockPage() {
    if (pageLock) return;
    const body = document.body;
    const root = document.documentElement;
    pageLock = {x: window.scrollX, y: window.scrollY, bodyStyle: body.style.cssText, scrollBehavior: root.style.scrollBehavior};
    root.style.scrollBehavior = 'auto';
    body.style.position = 'fixed';
    body.style.top = `-${pageLock.y}px`;
    body.style.left = `-${pageLock.x}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }
  function unlockPage() {
    if (!pageLock) return;
    const previous = pageLock;
    pageLock = null;
    document.body.style.cssText = previous.bodyStyle;
    window.scrollTo({left: previous.x, top: previous.y, behavior: 'auto'});
    document.documentElement.style.scrollBehavior = previous.scrollBehavior;
  }
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const previews = Array.from(document.querySelectorAll('.project-open')).map(link => ({
    link,
    video: link.querySelector('.project-preview'),
    control: link.closest('.project-card').querySelector('[data-preview-toggle]'),
    title: projects.find(project => project.id === link.dataset.film)?.title || 'film',
    manual: false,
    request: 0
  })).filter(preview => preview.video);
  let activePreview = null;

  function previewControl(preview, playing) {
    if (!preview.control) return;
    preview.control.setAttribute('aria-pressed', String(playing));
    preview.control.setAttribute('aria-label', `${playing ? 'Stop preview of' : 'Preview'} ${preview.title}${playing ? '' : ' silently'}`);
    preview.control.querySelector('[data-preview-label]').textContent = playing ? 'Stop' : 'Preview';
  }

  function loadPreview(preview) {
    if (preview.video.hasAttribute('src') || preview.failed) return;
    preview.video.muted = true;
    preview.video.defaultMuted = true;
    preview.video.preload = 'auto';
    preview.video.src = preview.video.dataset.previewSrc;
    preview.video.load();
  }

  function stopPreview(preview) {
    preview.request++;
    preview.video.pause();
    preview.link.classList.remove('is-previewing');
    preview.manual = false;
    previewControl(preview, false);
    if (preview.video.readyState > 0) preview.video.currentTime = 0;
    if (activePreview === preview) activePreview = null;
  }

  function stopPreviews() {
    previews.forEach(stopPreview);
  }

  function startPreview(preview, manual = false) {
    if (restoringFocus || (!manual && reduced.matches) || document.hidden || dialog.open || preview.failed) return;
    if (activePreview === preview) return;
    if (activePreview) stopPreview(activePreview);
    activePreview = preview;
    preview.manual = manual;
    previewControl(preview, true);
    const request = ++preview.request;
    loadPreview(preview);
    preview.video.muted = true;
    preview.video.play().then(() => {
      // A quick exit or modal opening can happen while playback is starting.
      if (activePreview !== preview || request !== preview.request || dialog.open) {
        if (activePreview !== preview) preview.video.pause();
        return;
      }
      preview.link.classList.add('is-previewing');
    }).catch(() => {
      if (request === preview.request) stopPreview(preview);
    });
  }

  previews.forEach(preview => {
    preview.control?.addEventListener('click', () => {
      if (activePreview === preview) stopPreview(preview);
      else startPreview(preview, true);
    });
    preview.link.addEventListener('pointerenter', event => {
      if (finePointer.matches && event.pointerType !== 'touch') startPreview(preview);
    });
    preview.link.addEventListener('pointerleave', () => {
      if (!preview.manual && !preview.link.matches(':focus-visible')) stopPreview(preview);
    });
    preview.link.addEventListener('focus', () => {
      if (preview.link.matches(':focus-visible')) startPreview(preview);
    });
    preview.link.addEventListener('blur', () => {
      if (!preview.manual && !preview.link.matches(':hover')) stopPreview(preview);
    });
    preview.video.addEventListener('error', () => {
      preview.failed = true;
      stopPreview(preview);
      if (preview.control) {
        preview.control.disabled = true;
        preview.control.querySelector('[data-preview-label]').textContent = 'No preview';
        preview.control.setAttribute('aria-label', `Preview unavailable for ${preview.title}; use Play to watch the full film`);
      }
    });
  });

  // Warm only nearby small clips, leaving full films unloaded until clicked.
  if ('IntersectionObserver' in window) {
    const nearbyPreviews = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const preview = previews.find(item => item.link === entry.target);
        if (!entry.isIntersecting) return;
        if (finePointer.matches && !reduced.matches && !navigator.connection?.saveData) loadPreview(preview);
      });
    }, {rootMargin: '200px'});
    previews.forEach(preview => nearbyPreviews.observe(preview.link));
    const visiblePreviews = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) return;
        const preview = previews.find(item => item.link.closest('.project-card') === entry.target);
        if (preview && activePreview === preview) stopPreview(preview);
      });
    });
    previews.forEach(preview => visiblePreviews.observe(preview.link.closest('.project-card')));
  }
  reduced.addEventListener('change', () => { if (reduced.matches) stopPreviews(); });
  finePointer.addEventListener('change', () => { if (!finePointer.matches) stopPreviews(); });
  window.addEventListener('pagehide', () => { stopPreviews(); if (dialog.open) dialog.close(); unlockPage(); });
  window.addEventListener('pageshow', stopPreviews);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.open) stopPreviews();
  });

  function showFilm(index) {
    stopPreviews();
    restoringFocus = true;
    selected = index;
    const project = projects[index];
    error.hidden = true;
    dialog.querySelector('#film-title').textContent = project.title;
    dialog.querySelector('#film-subtitle').textContent = project.subtitle;
    dialog.querySelector('[data-film-index]').textContent = `${String(index + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}`;
    video.setAttribute('aria-label', project.title);
    const mediaQuery = project.mediaVersion ? `?v=${encodeURIComponent(project.mediaVersion)}` : '';
    video.poster = `../assets/images/${project.id}.jpg${mediaQuery}`;
    video.src = `../assets/video/${project.id}.mp4${mediaQuery}`;
    dialog.querySelector('[data-direct-video]').href = video.src;
    if (!dialog.open) {
      lockPage();
      dialog.showModal();
      if (!reduced.matches && finePointer.matches && window.matchMedia('(min-width: 700px)').matches) dialog.querySelector('.film-shell').animate([
        {clipPath: 'inset(12% 5% 12% 5%)', transform: 'translateY(24px)'},
        {clipPath: 'inset(0%)', transform: 'translateY(0)'}
      ], {duration: 620, easing: 'cubic-bezier(.22,.8,.2,1)'});
    }
    dialog.scrollTop = 0;
    video.play().catch(() => {});
  }
  document.querySelectorAll('[data-film]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const index = projects.findIndex(project => project.id === link.dataset.film);
      if (index < 0) return;
      event.preventDefault();
      opener = link;
      showFilm(index);
    });
  });
  dialog.querySelector('.close-film').addEventListener('click', () => dialog.close());
  dialog.querySelector('.next-film').addEventListener('click', () => showFilm((selected + 1) % projects.length));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    unlockPage();
    restoringFocus = true;
    opener?.focus({preventScroll: true});
    requestAnimationFrame(() => { restoringFocus = false; });
  });
  video.addEventListener('error', () => { if (dialog.open && video.getAttribute('src')) error.hidden = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { video.pause(); stopPreviews(); }
  });
})();
