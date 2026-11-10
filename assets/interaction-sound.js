(() => {
  const root = document.documentElement;
  const toggles = [...document.querySelectorAll('[data-sound-toggle]')];
  const preferenceKey = 'portfolio-sound-enabled-v1';
  const controls = 'a,button,summary,[data-glitch-trigger],[data-pixel-portrait]';
  const buffers = new Map();
  const voices = new Set();
  const lastCueTimes = new Map();
  let enabled = true;
  let context = null;
  let master = null;
  let unlocked = false;
  let resumePending = false;
  let generation = 0;
  let lastPlay = -Infinity;
  let lastCue = '';
  let count = 0;
  let tap = null;
  let ignoreTouchUntil = 0;
  const acceptedClicks = new WeakSet();
  try {enabled = window.localStorage.getItem(preferenceKey) !== '0';} catch {}

  function sync(state) {
    root.dataset.soundState = state || (!enabled ? 'off' : context?.state === 'running' && unlocked ? 'on' : 'armed');
    toggles.forEach(button => {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(enabled));
      const label = enabled ? 'Mute sound effects' : 'Enable sound effects';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    });
  }

  function disposeVoice(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    try {voice.source.disconnect(); voice.gain.disconnect();} catch {}
  }

  function stop() {
    const now = context?.currentTime || 0;
    for (const voice of [...voices]) {
      try {
        if (context?.state === 'running') {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
          voice.gain.gain.linearRampToValueAtTime(0, now + .012);
          voice.source.stop(now + .015);
        } else {voice.source.stop(); disposeVoice(voice);}
      } catch {disposeVoice(voice);}
    }
  }

  function shutdown(state) {
    generation++;
    unlocked = false;
    resumePending = false;
    tap = null;
    const previous = context;
    context = null;
    for (const voice of [...voices]) {
      try {voice.source.stop();} catch {}
      disposeVoice(voice);
    }
    try {master?.disconnect();} catch {}
    master = null;
    if (previous && previous.state !== 'closed') {
      try {previous.close()?.catch(() => {});} catch {}
    }
    sync(state);
  }

  function setEnabled(next) {
    enabled = next;
    if (!enabled) shutdown('off');
    else sync();
    try {window.localStorage.setItem(preferenceKey, enabled ? '1' : '0');} catch {}
    window.dispatchEvent(new CustomEvent('portfolio-soundchange', {detail: {enabled}}));
  }

  // Resume is called directly from a completed, trusted interaction. No page
  // arrival, hover, scroll or delayed promise is allowed to unlock sound.
  function unlock(event) {
    if (!enabled || document.hidden || !event.isTrusted) return false;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {sync('unavailable'); return false;}
    try {
      if (!context || context.state === 'closed') {
        context = new AudioContext({latencyHint: 'interactive'});
        master = context.createGain();
        master.gain.value = .58;
        master.connect(context.destination);
      }
      unlocked = true;
      const active = context;
      const token = generation;
      if (active.state !== 'running' && !resumePending) {
        resumePending = true;
        const resumed = active.resume();
        resumed?.then(() => {
          if (context !== active || token !== generation || !enabled || document.hidden) return;
          resumePending = false;
          if (active.state === 'running') sync();
          else shutdown('unavailable');
        }, () => {if (context === active && token === generation) shutdown('unavailable');});
      }
      sync();
      return true;
    } catch {shutdown('unavailable'); return false;}
  }

  const durations = {hover: .045, glitch: .135, shuffle: .125, open: .14, close: .075, reveal: .20, take: .16};
  function bufferFor(cue) {
    const rate = context.sampleRate;
    const key = rate + ':' + cue;
    if (buffers.has(key)) return buffers.get(key);
    const duration = durations[cue];
    const buffer = context.createBuffer(1, Math.ceil(duration * rate), rate);
    const samples = buffer.getChannelData(0);
    let seed = 0x53584631;
    const noise = () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) / 2147483648 - 1;
    };
    let held = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      const edge = Math.max(0, Math.min(1, t / .003, (duration - t) / .012));
      const sine = frequency => Math.sin(2 * Math.PI * frequency * t);
      let value = 0;
      if (cue === 'hover') {
        value = (.075 * sine(1250) + noise() * .018) * Math.exp(-t * 90);
      } else if (cue === 'glitch') {
        if (i % Math.max(1, Math.round(rate / 4800)) === 0) held = Math.round(noise() * 5) / 5;
        const slice = Math.floor(t / .029);
        const gate = t % .029 < .016 ? 1 : .12;
        value = gate * (held * .11 + sine(1040 - slice * 180) * .065) * Math.exp(-t * 11);
      } else if (cue === 'shuffle' || cue === 'take') {
        const strikes = cue === 'shuffle' ? [0, .054] : [0, .052, .104];
        for (const at of strikes) {
          const elapsed = t - at;
          if (elapsed >= 0) value += (noise() * .10 + Math.sin(elapsed * 2 * Math.PI * 310) * .07) * Math.exp(-elapsed * 135);
        }
      } else if (cue === 'close') {
        value = (.10 * Math.sin(2 * Math.PI * (480 * t - 1800 * t * t)) + noise() * .025) * Math.exp(-t * 65);
      } else {
        const notes = cue === 'reveal' ? [660, 880, 1320] : [740, 1110];
        const spacing = cue === 'reveal' ? .054 : .052;
        notes.forEach((frequency, n) => {
          const elapsed = t - n * spacing;
          if (elapsed >= 0 && elapsed < .07) {
            const envelope = Math.min(1, elapsed / .003) * Math.exp(-elapsed * 47);
            value += envelope * (.095 * Math.sin(2 * Math.PI * frequency * elapsed) + .018 * Math.sin(6 * Math.PI * frequency * elapsed));
          }
        });
      }
      // Each cue has a hard headroom bound; three concurrent voices still sit
      // below unity. The storm remains the one deliberately louder sequence.
      samples[i] = Math.max(-.22, Math.min(.22, value)) * edge;
    }
    buffers.set(key, buffer);
    return buffer;
  }

  function play(cue = 'hover') {
    if (!Object.prototype.hasOwnProperty.call(durations, cue) || !enabled || !unlocked || !context || document.hidden) return false;
    if (document.body.classList.contains('is-storming') || document.querySelector('.film-dialog[open]')) return false;
    if (context.state !== 'running' && !resumePending) return false;
    const now = performance.now();
    if (now < ignoreTouchUntil) return false;
    if (now - (lastCueTimes.get(cue) ?? -Infinity) < 140) return false;
    if (now - lastPlay < 90 && !(lastCue === 'hover' && cue !== 'hover')) return false;
    if (voices.size >= 3) return false;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = bufferFor(cue);
      gain.gain.value = 1;
      source.connect(gain); gain.connect(master);
      const voice = {source, gain};
      voices.add(voice);
      source.onended = () => disposeVoice(voice);
      source.start(context.currentTime);
      lastPlay = now; lastCue = cue; lastCueTimes.set(cue, now);
      root.dataset.soundLastCue = cue;
      root.dataset.soundCount = String(++count);
      return true;
    } catch {shutdown('unavailable'); return false;}
  }

  window.portfolioSound = {play, stop, get enabled() {return enabled;}};

  const controlFor = target => target instanceof Element ? target.closest(controls) : null;
  const disabled = element => !element || element.disabled || element.getAttribute('aria-disabled') === 'true';
  const modified = event => event.button > 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.isPrimary === false) {tap = null; ignoreTouchUntil = performance.now() + 350; return;}
    if (event.button > 0) return;
    tap = {id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false};
  }, {capture: true, passive: true});
  document.addEventListener('pointermove', event => {
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) tap.cancelled = true;
  }, {capture: true, passive: true});
  document.addEventListener('pointercancel', event => {
    if (!tap || tap.id === event.pointerId) {tap = null; ignoreTouchUntil = performance.now() + 350;}
  }, {capture: true, passive: true});
  document.addEventListener('click', event => {
    const control = controlFor(event.target);
    if (!event.isTrusted || event.defaultPrevented || modified(event) || disabled(control) || control.matches('[data-sound-toggle]')) return;
    const cancelled = event.detail > 0 && (tap?.cancelled || performance.now() < ignoreTouchUntil);
    tap = null;
    if (cancelled) {ignoreTouchUntil = performance.now() + 350; return;}
    acceptedClicks.add(event);
    unlock(event);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
    const control = controlFor(event.target);
    if (!disabled(control) && !control.matches('[data-sound-toggle]')) unlock(event);
  }, true);
  document.addEventListener('click', event => {
    if (!acceptedClicks.has(event) || event.defaultPrevented || event.shiftKey) return;
    const control = controlFor(event.target);
    if (disabled(control)) return;
    // These own their sound at the actual state change, not at a second
    // delegated click. In particular a restored focus is never a cue.
    if (control.matches('[data-service-shuffle],[data-service-choice],[data-pixel-portrait],[data-film],[data-preview-toggle],[data-contact-take],[data-phone-reveal],.experience-toggle,.brand-link,[data-trainer-secret] summary,[data-catch-trigger],[data-copy-trainer],.close-film,.next-film')) return;
    let cue = 'hover';
    if (control.matches('[data-glitch-trigger]')) cue = 'glitch';
    else if (control.matches('summary')) cue = 'open';
    play(cue);
  });
  toggles.forEach(button => button.addEventListener('click', event => {
    if (!event.isTrusted || event.defaultPrevented || modified(event)) return;
    const cancelled = event.detail > 0 && (tap?.cancelled || performance.now() < ignoreTouchUntil);
    tap = null;
    if (cancelled) {ignoreTouchUntil = performance.now() + 350; return;}
    setEnabled(!enabled);
    if (enabled) {unlock(event); play('reveal');}
  }));
  document.addEventListener('visibilitychange', () => {if (document.hidden) shutdown();});
  window.addEventListener('pagehide', () => shutdown());
  window.addEventListener('pageshow', () => sync());
  window.addEventListener('storage', event => {
    if (event.key !== preferenceKey) return;
    const next = event.newValue !== '0';
    if (next === enabled) return;
    enabled = next;
    if (!enabled) shutdown('off'); else sync();
    window.dispatchEvent(new CustomEvent('portfolio-soundchange', {detail: {enabled}}));
  });
  root.dataset.soundCount = '0';
  sync();
})();
