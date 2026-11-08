(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const alphabet = '01<>/#_{}';
  const activeScrambles = new Map();
  const glitchTimers = new Map();
  const touchTimers = new Map();
  const resetTouchCandidates = [];

  function restoreText(node, job) {
    cancelAnimationFrame(job.frame);
    node.textContent = job.original;
    node.style.width = job.width;
    node.removeAttribute('data-scrambling');
    activeScrambles.delete(node);
  }

  function scramble(node) {
    if (reduced.matches || activeScrambles.has(node)) return;
    const job = {original: node.textContent, width: node.style.width, frame: 0, start: performance.now(), last: 0};
    node.style.width = node.getBoundingClientRect().width + 'px';
    node.setAttribute('data-scrambling', 'true');
    activeScrambles.set(node, job);
    function tick(now) {
      const elapsed = now - job.start;
      if (elapsed >= 390 || reduced.matches || document.hidden) {
        restoreText(node, job);
        return;
      }
      if (now - job.last >= 48) {
        const revealed = Math.max(0, Math.floor((elapsed - 65) / 310 * job.original.length));
        node.textContent = Array.from(job.original).map((character, index) => {
          if (character === ' ' || index < revealed) return character;
          return alphabet[Math.floor(Math.random() * alphabet.length)];
        }).join('');
        job.last = now;
      }
      job.frame = requestAnimationFrame(tick);
    }
    job.frame = requestAnimationFrame(tick);
  }

  function pulseGlitch(element) {
    if (reduced.matches || glitchTimers.has(element)) return;
    element.classList.add('is-glitching');
    glitchTimers.set(element, setTimeout(() => {
      element.classList.remove('is-glitching');
      glitchTimers.delete(element);
    }, 310));
  }

  function activate(element) {
    pulseGlitch(element);
    element.querySelectorAll('[data-scramble]').forEach(scramble);
  }

  document.querySelectorAll('[data-glitch-trigger], .project-open').forEach(trigger => {
    let tap = null;
    resetTouchCandidates.push(() => { tap = null; });
    trigger.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      tap = {id: event.pointerId, x: event.clientX, y: event.clientY};
    }, {passive: true});
    trigger.addEventListener('pointermove', event => {
      if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) tap = null;
    }, {passive: true});
    trigger.addEventListener('pointercancel', () => { tap = null; });
    trigger.addEventListener('pointerup', event => {
      if (!tap || tap.id !== event.pointerId) return;
      tap = null;
      activate(trigger);
      if (reduced.matches) return;
      clearTimeout(touchTimers.get(trigger));
      trigger.classList.add('is-touch-active');
      touchTimers.set(trigger, setTimeout(() => {
        trigger.classList.remove('is-touch-active');
        touchTimers.delete(trigger);
      }, 420));
    }, {passive: true});
    trigger.addEventListener('pointerenter', event => {
      if (!finePointer.matches || event.pointerType === 'touch') return;
      activate(trigger);
    });
    trigger.addEventListener('focus', () => {
      if (!tap && trigger.matches(':focus-visible')) activate(trigger);
    });
  });

  function stopMotion() {
    resetTouchCandidates.forEach(reset => reset());
    activeScrambles.forEach((job, node) => restoreText(node, job));
    glitchTimers.forEach((timer, element) => {
      clearTimeout(timer);
      element.classList.remove('is-glitching');
    });
    glitchTimers.clear();
    touchTimers.forEach((timer, element) => { clearTimeout(timer); element.classList.remove('is-touch-active'); });
    touchTimers.clear();
  }
  window.addEventListener('pagehide', stopMotion);
  reduced.addEventListener('change', () => { if (reduced.matches) stopMotion(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMotion(); });

  const brandStrip = document.querySelector('[data-brand-strip]');
  if (brandStrip) {
    const viewport = brandStrip.querySelector('.brand-viewport');
    const brandLinks = [...brandStrip.querySelectorAll('.brand-link')];
    let touchPointer = null;
    let keyboardNavigation = false;
    document.addEventListener('keydown', event => { if (event.key === 'Tab') keyboardNavigation = true; });
    brandStrip.addEventListener('focusin', () => {
      if (keyboardNavigation) brandStrip.dataset.keyboardFocus = 'true';
    });
    brandStrip.addEventListener('focusout', event => {
      if (!brandStrip.contains(event.relatedTarget)) delete brandStrip.dataset.keyboardFocus;
    });
    let touchTimer = 0;
    function clearBrandTouch() {
      clearTimeout(touchTimer);
      touchPointer = null;
      brandStrip.classList.remove('is-touch-active');
    }
    brandStrip.addEventListener('pointerdown', event => {
      keyboardNavigation = false;
      delete brandStrip.dataset.keyboardFocus;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      clearTimeout(touchTimer);
      touchPointer = event.pointerId;
      brandStrip.classList.add('is-touch-active');
    }, {passive: true});
    document.addEventListener('pointerup', event => {
      if (event.pointerId !== touchPointer) return;
      touchPointer = null;
      touchTimer = setTimeout(clearBrandTouch, 500);
    }, {passive: true});
    document.addEventListener('pointercancel', event => { if (event.pointerId === touchPointer) clearBrandTouch(); }, {passive: true});
    let onScreen = !('IntersectionObserver' in window);
    function syncBrands() {
      brandStrip.dataset.animated = String(!reduced.matches);
      brandStrip.dataset.running = String(onScreen && !reduced.matches && !document.hidden);
    }
    function drawBrandPixels() {
      brandStrip.style.setProperty('--brand-span', viewport.clientWidth + 'px');
      brandLinks.forEach(link => {
        const name = link.querySelector('.brand-name');
        const canvas = link.querySelector('.brand-pixels');
        const width = name.offsetWidth;
        const height = name.offsetHeight;
        if (!width || !height) return;
        const cell = 1.25;
        canvas.width = Math.max(1, Math.round(width / cell));
        canvas.height = Math.max(1, Math.round(height / cell));
        const context = canvas.getContext('2d');
        if (!context) return;
        const style = getComputedStyle(name);
        context.scale(canvas.width / width, canvas.height / height);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        context.fillStyle = '#001215';
        context.textBaseline = 'alphabetic';
        const lines = [];
        let line = '';
        name.textContent.split(' ').forEach(word => {
          const candidate = line ? line + ' ' + word : word;
          if (style.whiteSpace !== 'nowrap' && line && context.measureText(candidate).width > width + 1) {
            lines.push(line);
            line = word;
          } else line = candidate;
        });
        lines.push(line);
        const lineHeight = height / lines.length;
        lines.forEach((text, index) => {
          const metrics = context.measureText(text);
          const baseline = index * lineHeight + (lineHeight + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
          context.fillText(text, 0, baseline, width);
        });
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i] >= 96 ? 255 : 0;
        context.putImageData(pixels, 0, 0);
        link.dataset.pixelReady = 'true';
      });
    }
    let paint = 0;
    function scheduleBrandPixels() {
      cancelAnimationFrame(paint);
      paint = requestAnimationFrame(drawBrandPixels);
    }
    if ('ResizeObserver' in window) new ResizeObserver(scheduleBrandPixels).observe(brandStrip);
    else window.addEventListener('resize', scheduleBrandPixels);
    document.fonts.ready.then(scheduleBrandPixels);
    document.fonts.addEventListener('loadingdone', scheduleBrandPixels);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        onScreen = entries[0].isIntersecting;
        syncBrands();
      });
      observer.observe(brandStrip);
    }
    reduced.addEventListener('change', syncBrands);
    document.addEventListener('visibilitychange', syncBrands);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearBrandTouch(); });
    syncBrands();
    scheduleBrandPixels();
  }

  const portrait = document.querySelector('[data-pixel-portrait]');
  if (portrait) {
    const pixel = portrait.querySelector('.pixel-portrait');
    let ready = false;
    let pointerInside = false;
    let keyboardInside = false;
    let touchSelected = false;
    let lastPointerType = '';
    const renderPortrait = () => {
      const showingPixels = ready && (pointerInside || keyboardInside || touchSelected);
      portrait.dataset.pixelMode = String(showingPixels);
      portrait.setAttribute('aria-pressed', String(showingPixels));
    };
    const markReady = () => { ready = Boolean(pixel.naturalWidth); renderPortrait(); };
    if (pixel.complete && pixel.naturalWidth) markReady();
    else pixel.addEventListener('load', markReady, {once: true});
    portrait.addEventListener('pointerenter', event => {
      if (!finePointer.matches || event.pointerType === 'touch') return;
      pointerInside = true;
      keyboardInside = false;
      touchSelected = false;
      renderPortrait();
      pulseGlitch(portrait);
    });
    portrait.addEventListener('pointerdown', event => {
      lastPointerType = event.pointerType;
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        pointerInside = false;
        keyboardInside = false;
      }
    });
    // Native click fires for a completed tap, but is cancelled by a scrolling swipe.
    // Track pointerdown as well: some Safari versions emit a MouseEvent for click.
    portrait.addEventListener('click', event => {
      if (event.detail === 0) {
        const wasShowingPixels = portrait.dataset.pixelMode === 'true';
        pointerInside = false;
        touchSelected = false;
        keyboardInside = !wasShowingPixels;
      } else if (event.pointerType === 'touch' || event.pointerType === 'pen' ||
                 lastPointerType === 'touch' || lastPointerType === 'pen' || !finePointer.matches) {
        pointerInside = false;
        keyboardInside = false;
        touchSelected = !touchSelected;
      } else return;
      renderPortrait();
      if (portrait.dataset.pixelMode === 'true') pulseGlitch(portrait);
    });
    portrait.addEventListener('pointerleave', () => { pointerInside = false; renderPortrait(); });
    portrait.addEventListener('focus', () => { keyboardInside = portrait.matches(':focus-visible'); renderPortrait(); });
    portrait.addEventListener('blur', () => { keyboardInside = false; renderPortrait(); });
    portrait.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        keyboardInside = false;
        pointerInside = false;
        touchSelected = false;
        renderPortrait();
      }
    });
  }

  const experienceEntries = [...document.querySelectorAll('.experience-entry')];
  if (experienceEntries.length) {
    let hoveredEntry = null;
    let pendingEntry = null;
    let dismissedEntry = null;
    let openTimer = 0;
    let closeTimer = 0;

    function cancelPending() {
      clearTimeout(openTimer);
      openTimer = 0;
      pendingEntry = null;
    }

    function closeHovered() {
      clearTimeout(closeTimer);
      closeTimer = 0;
      const previous = hoveredEntry;
      hoveredEntry = null;
      if (previous && !previous.querySelector('summary').matches(':focus-visible')) previous.open = false;
    }

    function leaveExperience() {
      cancelPending();
      if (!hoveredEntry) return;
      if (!closeTimer) closeTimer = setTimeout(closeHovered, 120);
    }

    function revealExperience(entry) {
      clearTimeout(closeTimer);
      closeTimer = 0;
      if (entry === dismissedEntry) return;
      if (entry === hoveredEntry && entry.open) { cancelPending(); return; }
      if (entry === pendingEntry) return;
      cancelPending();
      pendingEntry = entry;
      openTimer = setTimeout(() => {
        if (pendingEntry !== entry || !finePointer.matches) return;
        pendingEntry = null;
        openTimer = 0;
        hoveredEntry = entry;
        entry.open = true;
      }, 90);
    }

    // Actual pointer motion avoids opening adjacent jobs when a drawer changes layout.
    document.addEventListener('pointermove', event => {
      if (!finePointer.matches || event.pointerType === 'touch' || event.buttons) return;
      let entry = event.target instanceof Element ? event.target.closest('.experience-entry') : null;
      if (!entry && hoveredEntry) {
        const box = hoveredEntry.getBoundingClientRect();
        if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) entry = hoveredEntry;
      }
      if (entry !== dismissedEntry) dismissedEntry = null;
      if (entry) revealExperience(entry);
      else leaveExperience();
    }, {passive: true});
    document.documentElement.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'touch') { dismissedEntry = null; leaveExperience(); }
    });

    experienceEntries.forEach(entry => {
      const summary = entry.querySelector('summary');
      let pointerType = 'mouse';
      summary.addEventListener('pointerdown', event => { pointerType = event.pointerType; });
      summary.addEventListener('click', event => {
        if (finePointer.matches && pointerType === 'mouse' && event.detail > 0) {
          event.preventDefault();
          return;
        }
        if (entry.open) {
          dismissedEntry = entry;
          if (hoveredEntry === entry) hoveredEntry = null;
          cancelPending();
        }
      });
      entry.addEventListener('toggle', () => { if (entry.open) pulseGlitch(entry); });
      entry.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        cancelPending();
        dismissedEntry = entry;
        if (hoveredEntry === entry) hoveredEntry = null;
        entry.open = false;
      });
    });

    function updateExperienceMode() {
      cancelPending();
      closeHovered();
      dismissedEntry = null;
      experienceEntries.forEach(entry => { entry.dataset.hoverEnabled = String(finePointer.matches); });
    }
    finePointer.addEventListener('change', updateExperienceMode);
    updateExperienceMode();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelPending(); closeHovered(); }
    });
  }

  const journeyData = document.getElementById('journey-data');
  const journey = document.querySelector('.journey-widget');
  if (journey && journeyData) {
    const chapters = JSON.parse(journeyData.textContent);
    const detail = journey.querySelector('[data-chapter-detail]');
    journey.querySelectorAll('[data-chapter]').forEach(button => {
      button.addEventListener('click', () => {
        const chapter = chapters[button.dataset.chapter];
        if (!chapter) return;
        journey.querySelectorAll('[data-chapter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        detail.textContent = chapter;
        pulseGlitch(journey);
      });
    });
  }
})();
