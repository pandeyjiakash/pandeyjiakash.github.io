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
  let closingByUser = false;
  let filmRequest = 0;
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
  const projector = document.querySelector('[data-projector]');
  const projection = projector?.querySelector('[data-projector-preview]');
  const projectionPoster = projector?.querySelector('[data-projector-poster]');
  let projectorVisible = !('IntersectionObserver' in window);
  let projectorPageActive = true;
  let projectionRequest = 0;
  let projectionPending = false;
  let projectionSource = '';
  let projectionFailedSource = '';
  let projectionFinished = false;
  let projectionFilmId = projection?.dataset.filmId || '';
  let projectionBag = shuffledProjectionIds().filter(id => id !== projectionFilmId);
  function shuffledProjectionIds() {
    const ids = projects.map(project => project.id);
    for (let index = ids.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [ids[index], ids[other]] = [ids[other], ids[index]];
    }
    if (ids.length > 1 && ids[0] === projectionFilmId) [ids[0], ids[1]] = [ids[1], ids[0]];
    return ids;
  }
  function highlightProjection(id) {
    projector?.querySelectorAll('[data-projector-key]').forEach(key => key.classList.toggle('is-selected', key.dataset.film === id));
  }
  function advanceProjection() {
    if (!projectionBag.length) projectionBag = shuffledProjectionIds();
    const id = projectionBag.shift();
    const project = projects.find(item => item.id === id);
    if (project) selectProjection(project);
  }
  function projectorCanRun() {
    return projectorPageActive && projectorVisible && !reduced.matches && !document.hidden && !dialog.open;
  }
  function stopProjection() {
    if (!projection) return;
    projectionRequest++;
    projectionPending = false;
    projection.pause();
    projector.dataset.projecting = 'false';
  }
  function syncProjector() {
    if (!projector) return;
    const running = projectorCanRun();
    projector.dataset.running = String(running);
    if (!projection) return;
    if (!running || navigator.connection?.saveData) {stopProjection(); return;}
    if (projectionFinished) advanceProjection();
    const source = projection.dataset.previewSrc;
    if (!source || source === projectionFailedSource) return;
    if (projectionSource !== source) {
      stopProjection();
      projectionSource = source;
      projection.preload = 'auto';
      projection.src = source;
      projection.load();
    }
    if (projectionPending || !projection.paused) return;
    const request = ++projectionRequest;
    projectionPending = true;
    projection.muted = true;
    const failed = () => {
      if (request !== projectionRequest) return;
      projectionFailedSource = source;
      stopProjection();
    };
    try {
      Promise.resolve(projection.play()).then(() => {
        if (request !== projectionRequest) {
          if (!projectorCanRun()) projection.pause();
          return;
        }
        projectionPending = false;
        if (!projectorCanRun()) {stopProjection(); return;}
        projector.dataset.projecting = 'true';
      }).catch(failed);
    } catch (_) {failed();}
  }
  function selectProjection(project) {
    const mediaQuery = project.mediaVersion ? `?v=${encodeURIComponent(project.mediaVersion)}` : '';
    const poster = `../assets/images/${project.id}.jpg${mediaQuery}`;
    projectionFilmId = project.id;
    projectionBag = projectionBag.filter(id => id !== projectionFilmId);
    projectionFinished = false;
    highlightProjection(project.id);
    if (projectionPoster) projectionPoster.src = poster;
    if (!projection) return;
    stopProjection();
    projection.dataset.filmId = project.id;
    projection.dataset.previewSrc = `../assets/video/previews/${project.id}.mp4${mediaQuery}`;
    projection.poster = poster;
    projectionFailedSource = '';
  }
  if (projector) {
    if (projection) {
      projection.muted = true;
      projection.defaultMuted = true;
      projection.loop = false;
      projection.playsInline = true;
      highlightProjection(projectionFilmId);
      projection.addEventListener('ended', () => {
        if (projectionSource !== projection.dataset.previewSrc) return;
        projectionFinished = true;
        if (projectorCanRun()) syncProjector();
      });
      projection.addEventListener('error', () => {
        projectionFailedSource = projectionSource;
        stopProjection();
        projection.removeAttribute('src');
        projectionSource = '';
        projection.load();
      });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        projectorVisible = entries[0].isIntersecting;
        syncProjector();
      }).observe(projector);
    }
    reduced.addEventListener('change', syncProjector);
    window.addEventListener('pageshow', () => {projectorPageActive = true; syncProjector();});
    window.addEventListener('pagehide', () => {projectorPageActive = false; syncProjector();});
    syncProjector();
  }
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
      window.portfolioSound?.play(activePreview === preview ? 'close' : 'open');
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

  function showFilm(index, fromProjector = false) {
    const request = ++filmRequest;
    if (!dialog.open) window.portfolioSound?.play('open');
    stopPreviews();
    restoringFocus = true;
    selected = index;
    const project = projects[index];
    selectProjection(project);
    if (projector) {
      dialog.classList.toggle('is-projector-launch', fromProjector && !reduced.matches);
    }
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
      if (!fromProjector && !reduced.matches && finePointer.matches && window.matchMedia('(min-width: 700px)').matches) dialog.querySelector('.film-shell').animate([
        {clipPath: 'inset(12% 5% 12% 5%)', transform: 'translateY(24px)'},
        {clipPath: 'inset(0%)', transform: 'translateY(0)'}
      ], {duration: 620, easing: 'cubic-bezier(.22,.8,.2,1)'});
    }
    syncProjector();
    dialog.scrollTop = 0;
    const source = video.src;
    const playbackFailed = reason => {
      // A pause, film switch or navigation can reject an older play request.
      // Only the current, visible film should show its direct-play recovery.
      if (reason?.name === 'AbortError' || request !== filmRequest ||
          !dialog.open || document.hidden || video.src !== source) return;
      error.hidden = false;
    };
    try {video.play()?.catch(playbackFailed);} catch (reason) {playbackFailed(reason);}
  }
  document.querySelectorAll('[data-film]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const index = projects.findIndex(project => project.id === link.dataset.film);
      if (index < 0) return;
      event.preventDefault();
      opener = link;
      showFilm(index, link.dataset.projectorKey !== undefined);
    });
  });
  dialog.querySelector('.close-film').addEventListener('click', () => {closingByUser = true; dialog.close();});
  dialog.addEventListener('cancel', () => {closingByUser = true;});
  dialog.querySelector('.next-film').addEventListener('click', () => showFilm((selected + 1) % projects.length));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {closingByUser = true; dialog.close();}
  });
  dialog.addEventListener('close', () => {
    filmRequest++;
    const playClose = closingByUser && !document.hidden;
    closingByUser = false;
    if (projector) dialog.classList.remove('is-projector-launch');
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (playClose) window.portfolioSound?.play('close');
    unlockPage();
    restoringFocus = true;
    opener?.focus({preventScroll: true});
    requestAnimationFrame(() => { restoringFocus = false; });
    syncProjector();
  });
  video.addEventListener('error', () => { if (dialog.open && video.getAttribute('src')) error.hidden = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { filmRequest++; video.pause(); stopPreviews(); }
    syncProjector();
  });
})();
