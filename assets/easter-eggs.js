(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const gestureResetters = [];
  const doubleWindow = 280;

  // A completed native click, rather than pointerup, keeps scrolling swipes out
  // of the discovery path. Wordmark pointer navigation waits one short double-
  // click window; keyboard and modified link activations keep native behaviour.
  function doubleGesture(element, activate, options = {}) {
    let first = null;
    let pointer = null;
    let navigationTimer = 0;
    let lastActivation = -Infinity;
    let ignoreUntil = 0;
    const enabled = options.enabled || (() => true);
    function clearNavigation() {
      if (navigationTimer) clearTimeout(navigationTimer);
      navigationTimer = 0;
    }
    function reset() {
      clearNavigation();
      first = null;
      pointer = null;
    }
    gestureResetters.push(reset);
    function fire(event) {
      reset();
      const now = performance.now();
      if (now - lastActivation < 360 || !enabled()) return;
      lastActivation = now;
      activate(element, event);
    }
    function navigate() {
      navigationTimer = 0;
      first = null;
      const destination = new URL(element.href, window.location.href);
      const homePath = path => path.replace(/index\.html$/, '');
      if (destination.origin === window.location.origin &&
          homePath(destination.pathname) === homePath(window.location.pathname)) {
        window.scrollTo({top: 0, left: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth'});
      } else window.location.assign(destination.href);
    }
    element.addEventListener('pointerdown', event => {
      if (event.isPrimary === false) {
        ignoreUntil = performance.now() + doubleWindow;
        reset();
        return;
      }
      if (event.button > 0) return;
      pointer = {id: event.pointerId, type: event.pointerType || 'mouse', x: event.clientX, y: event.clientY, cancelled: false};
    }, {capture: true, passive: true});
    element.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId || pointer.cancelled) return;
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) {
        pointer.cancelled = true;
        first = null;
        clearNavigation();
        ignoreUntil = performance.now() + doubleWindow;
      }
    }, {capture: true, passive: true});
    element.addEventListener('pointercancel', () => {
      ignoreUntil = performance.now() + doubleWindow;
      reset();
    }, {capture: true});
    element.addEventListener('blur', reset);
    element.addEventListener('click', event => {
      if (!enabled()) {reset(); return;}
      if (event.button > 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {reset(); return;}
      if (event.detail === 0) {
        reset();
        if (options.keyboardActivates) {event.preventDefault(); fire(event);}
        return;
      }
      const now = performance.now();
      if (pointer?.cancelled || now < ignoreUntil) {
        event.preventDefault();
        reset();
        return;
      }
      const kind = event.pointerType || pointer?.type || 'mouse';
      const x = pointer?.x ?? event.clientX;
      const y = pointer?.y ?? event.clientY;
      const isDouble = first && first.kind === kind && now - first.time <= doubleWindow && Math.hypot(x - first.x, y - first.y) <= 28;
      pointer = null;
      if (options.deferLink || options.preventFirst) event.preventDefault();
      if (isDouble) {fire(event); return;}
      clearNavigation();
      first = {time: now, kind, x, y};
      if (options.deferLink) navigationTimer = setTimeout(navigate, doubleWindow);
    }, true);
    // Some assistive/browser integrations dispatch dblclick without two click
    // events. The guard also prevents compatibility dblclick after a touch pair
    // from immediately stopping the storm it just started.
    element.addEventListener('dblclick', event => {
      if (!enabled() || performance.now() < ignoreUntil || event.button > 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      fire(event);
    }, true);
    if (options.secretKeyboard) {
      element.setAttribute('aria-keyshortcuts', 'Shift+Enter');
      element.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || !event.shiftKey || event.repeat) return;
        event.preventDefault();
        event.stopPropagation();
        fire(event);
      }, true);
    }
  }

  document.querySelectorAll('[data-trainer-secret]').forEach(disclosure => {
    const summary = disclosure.querySelector('summary');
    if (!summary) return;
    doubleGesture(summary, () => {
      disclosure.dataset.discovered = 'true';
      disclosure.open = true;
      window.portfolioSound?.play('reveal');
    }, {
      preventFirst: true,
      keyboardActivates: true,
      enabled: () => disclosure.dataset.discovered !== 'true'
    });
    summary.addEventListener('click', event => {
      if (disclosure.dataset.discovered !== 'true' || event.defaultPrevented || event.button > 0) return;
      window.portfolioSound?.play(disclosure.open ? 'close' : 'reveal');
    });
  });

  const copyTimers = new Map();
  document.querySelectorAll('[data-copy-trainer]').forEach(button => {
    const disclosure = button.closest('.trainer-egg');
    const status = disclosure?.querySelector('[data-copy-status]');
    const label = button.querySelector('[data-copy-label]');
    const code = button.dataset.copyTrainer;
    if (!disclosure || !status || !label || !/^\d{12}$/.test(code)) return;
    button.hidden = false;
    button.addEventListener('click', async () => {
      const previous = copyTimers.get(button);
      if (previous) clearTimeout(previous);
      try {
        await navigator.clipboard.writeText(code);
        label.textContent = 'Copied';
        status.textContent = 'Trainer code copied.';
      } catch {
        status.textContent = 'Select the code above to copy it.';
      }
      const pending = copyTimers.get(button);
      if (pending) clearTimeout(pending);
      copyTimers.set(button, setTimeout(() => {
        label.textContent = 'Copy code';
        status.textContent = '';
        copyTimers.delete(button);
      }, 3000));
    });
  });

  document.querySelectorAll('[data-catch-egg]').forEach(egg => {
    const button = egg.querySelector('[data-catch-trigger]');
    const line = egg.querySelector('[data-catch-line]');
    if (!button || !line) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      line.hidden = !open;
      line.classList.toggle('is-discovered', open);
      window.portfolioSound?.play(open ? 'reveal' : 'close');
    });
  });

  const overlay = document.querySelector('[data-storm-overlay]');
  const stormButtons = [...document.querySelectorAll('[data-storm-toggle]')];
  let stormTimer = 0;
  let stormSource = null;
  let stormSound = null;
  let retiringSound = null;
  let soundReleaseTimer = 0;
  let thunderBuffer = null;

  // Original, locally synthesized foley: close cracks, a rolling low body and
  // a little stereo rain. No download or autoplay before the hidden gesture.
  function makeThunder(context) {
    const rate = context.sampleRate;
    const length = Math.ceil(rate * 6.6);
    const buffer = context.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let seed = 0x4d415452;
    const random = () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) / 2147483648 - 1;
    };
    const coefficient = frequency => 1 - Math.exp(-2 * Math.PI * frequency / rate);
    const bassRate = coefficient(75);
    const bodyRate = coefficient(370);
    const airRate = coefficient(2300);
    let bass = 0, body = 0, air = 0, peak = 0;
    for (let i = 0; i < length; i++) {
      const time = i / rate;
      const noise = random();
      bass += bassRate * (noise - bass);
      body += bodyRate * (noise - body);
      air += airRate * (noise - air);
      const fade = Math.min(1, time / .12, (6.6 - time) / .65);
      let value = bass * .045 + (air - bass) * .022;
      let spread = .012;
      // These coincide with the two bolt appearances, not the initial trigger.
      for (const strike of [.74, 3.90]) {
        const elapsed = time - strike;
        if (elapsed < 0) continue;
        const attack = Math.min(1, elapsed / .006);
        const roll = Math.min(1, elapsed / .055) * Math.exp(-elapsed / 1.10);
        const texture = .72 + .28 * Math.sin(elapsed * 13) ** 2;
        value += attack * Math.exp(-elapsed / .055) * (noise * .24 + air * .65);
        value += roll * texture * (bass * 5.4 + body * 1.75);
        // Diffuse reflections give the impact distance and a tumbling tail.
        for (const echo of [.13, .29, .52]) {
          const after = elapsed - echo;
          if (after >= 0) value += Math.min(1, after / .012) * Math.exp(-after / .16) * body * .43;
        }
        spread += roll * .045;
      }
      const side = (random() - random()) * spread;
      left[i] = Math.tanh(value + side) * fade;
      right[i] = Math.tanh(value - side) * fade;
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    // Leave headroom at both the buffer and output; never amplify a quiet tail.
    const level = peak > 0 ? .76 / peak : 1;
    for (let i = 0; i < length; i++) {left[i] *= level; right[i] *= level;}
    return buffer;
  }
  function disposeStormSound(sound, stop = true) {
    if (!sound) return;
    if (stop) {try {sound.source.stop();} catch {}}
    sound.source.disconnect();
    sound.output.disconnect();
    if (sound.context.state !== 'closed') {
      try {sound.context.close()?.catch(() => {});} catch {}
    }
  }
  function stopStormSound(status = 'stopped', immediate = false) {
    const sound = stormSound;
    stormSound = null;
    if (overlay) overlay.dataset.stormAudio = status;
    if (soundReleaseTimer) clearTimeout(soundReleaseTimer);
    soundReleaseTimer = 0;
    disposeStormSound(retiringSound, false);
    retiringSound = null;
    if (!sound) return;
    if (!immediate && sound.context.state === 'running') {
      const now = sound.context.currentTime;
      sound.output.gain.cancelScheduledValues(now);
      sound.output.gain.setValueAtTime(sound.output.gain.value, now);
      sound.output.gain.linearRampToValueAtTime(0, now + .025);
      try {sound.source.stop(now + .03);} catch {}
      retiringSound = sound;
      soundReleaseTimer = setTimeout(() => {
        soundReleaseTimer = 0;
        if (retiringSound === sound) retiringSound = null;
        disposeStormSound(sound, false);
      }, 35);
      return;
    }
    // Closing also cancels a pending Safari resume; returning to the tab must
    // never start an old thunderclap after the visual sequence has ended.
    disposeStormSound(sound);
  }
  function startStormSound() {
    stopStormSound('stopped', true);
    if (window.portfolioSound?.enabled === false) {
      if (overlay) overlay.dataset.stormAudio = 'muted';
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {if (overlay) overlay.dataset.stormAudio = 'unavailable'; return;}
    let context;
    try {
      context = new AudioContext({latencyHint: 'interactive'});
      // Resume inside the accepted click/key event, before any promise work.
      const resumed = context.state === 'suspended' ? context.resume() : null;
      const source = context.createBufferSource();
      const output = context.createGain();
      stormSound = {context, source, output};
      if (overlay) overlay.dataset.stormAudio = context.state === 'running' ? 'playing' : 'starting';
      resumed?.then(() => {
        if (stormSound?.context === context && !document.hidden && context.state === 'running' && overlay) overlay.dataset.stormAudio = 'playing';
      }, () => {if (stormSound?.context === context) stopStormSound('unavailable');});
      if (!thunderBuffer || thunderBuffer.sampleRate !== context.sampleRate) thunderBuffer = makeThunder(context);
      source.buffer = thunderBuffer;
      output.gain.value = .7;
      source.connect(output);
      output.connect(context.destination);
      // Schedule while the gesture is active. A rejected resume stays silent,
      // and no asynchronous callback is allowed to restart a cancelled sound.
      source.start(context.currentTime + .015);
    } catch {
      stopStormSound('unavailable');
      if (context && context.state !== 'closed') {
        try {context.close()?.catch(() => {});} catch {}
      }
    }
  }
  function positionSignal() {
    if (!stormSource) return;
    const fromName = stormSource.matches('.wordmark');
    const anchor = fromName ? stormSource.closest('.header-identity') || stormSource : stormSource;
    const bounds = anchor.getBoundingClientRect();
    const left = Math.max(12, Math.min(document.documentElement.clientWidth - 56, fromName ? bounds.right + 8 : bounds.right - 32));
    const top = Math.max(12, Math.min(window.innerHeight - 56, fromName ? bounds.top : bounds.top - 42));
    stormButtons.forEach(button => {
      button.style.setProperty('--signal-left', left + 'px');
      button.style.setProperty('--signal-top', top + 'px');
    });
  }
  function stopStorm(options = {}) {
    if (stormTimer) clearTimeout(stormTimer);
    stormTimer = 0;
    stopStormSound('stopped', options.immediate === true);
    document.body.classList.remove('is-storming');
    if (overlay) overlay.hidden = true;
    const restoreSource = stormButtons.includes(document.activeElement) && stormSource?.isConnected;
    stormButtons.forEach(button => {
      button.setAttribute('aria-pressed', 'false');
      button.hidden = true;
    });
    if (restoreSource) stormSource.focus({preventScroll: true});
    stormSource = null;
  }
  function startStorm(source) {
    if (!overlay || document.hidden) return;
    if (stormTimer) clearTimeout(stormTimer);
    window.portfolioSound?.stop();
    startStormSound();
    stormSource = source;
    positionSignal();
    overlay.hidden = false;
    document.body.classList.add('is-storming');
    stormButtons.forEach(button => {
      button.setAttribute('aria-pressed', 'true');
      button.hidden = false;
    });
    stormTimer = setTimeout(stopStorm, 6600);
  }
  if (overlay) {
    stormButtons.forEach(button => button.addEventListener('click', stopStorm));
    document.querySelectorAll('[data-storm-secret]').forEach(secret => {
      doubleGesture(secret, source => {
        if (document.body.classList.contains('is-storming')) stopStorm();
        else startStorm(source);
      }, {deferLink: secret.matches('a[href]'), secretKeyboard: true});
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      stopStorm();
      document.querySelectorAll('.trainer-egg[open]').forEach(disclosure => {
        disclosure.open = false;
        disclosure.querySelector('summary')?.focus();
      });
    }
  });
  function resetGestures() {gestureResetters.forEach(reset => reset());}
  function cleanup() {
    resetGestures();
    stopStorm({immediate: true});
    copyTimers.forEach((timer, button) => {
      clearTimeout(timer);
      button.querySelector('[data-copy-label]').textContent = 'Copy code';
      button.closest('.trainer-egg').querySelector('[data-copy-status]').textContent = '';
    });
    copyTimers.clear();
  }
  window.addEventListener('blur', resetGestures);
  window.addEventListener('portfolio-soundchange', event => {
    if (event.detail?.enabled === false && document.body.classList.contains('is-storming')) stopStormSound('muted', true);
  });
  window.addEventListener('resize', positionSignal, {passive: true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {resetGestures(); stopStorm({immediate: true});}
  });
  window.addEventListener('pagehide', cleanup);
})();
