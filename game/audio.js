// Sound effects and music, synthesized with the Web Audio API: no audio files to load or license.
// Browsers only allow sound after the player interacts, so call Sound.unlock() from a click or key.
window.Sound = (function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  let ctx = null, master, sfxBus, musicBus, noiseBuf;
  let sfxOn = store.get('ch-sfx') !== '0';
  let musicOn = store.get('ch-music') !== '0';
  const lastPlayed = {};

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxOn ? 0.6 : 0;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicOn ? 0.28 : 0;
      musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (wantMusic && !musicTimer) startScheduler();
  }

  // ---- building blocks -------------------------------------------------------
  function tone({ type = 'square', f0, f1, dur, vol = 0.25, attack = 0.004, delay = 0, bus = sfxBus, at }) {
    const t = at ?? ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise({ dur, vol = 0.2, type = 'lowpass', f0 = 1000, f1, q = 1, delay = 0, bus = sfxBus, at }) {
    const t = at ?? ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ---- sound effects ---------------------------------------------------------
  const SFX = {
    jump: () => tone({ f0: 330, f1: 700, dur: 0.13, vol: 0.14 }),
    double: () => { tone({ f0: 520, f1: 1100, dur: 0.12, vol: 0.13 }); tone({ type: 'triangle', f0: 780, f1: 1560, dur: 0.12, vol: 0.12, delay: 0.04 }); },
    land: () => noise({ dur: 0.07, vol: 0.12, f0: 500 }),
    coin: () => { tone({ f0: 988, dur: 0.07, vol: 0.12 }); tone({ f0: 1319, dur: 0.22, vol: 0.12, delay: 0.07 }); },
    box: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.2, delay: i * 0.05 })),
    fire: () => { noise({ dur: 0.35, vol: 0.3, type: 'bandpass', f0: 2500, f1: 300, q: 2 }); tone({ type: 'sawtooth', f0: 240, f1: 90, dur: 0.3, vol: 0.12 }); },
    slime: () => { tone({ type: 'sine', f0: 420, f1: 70, dur: 0.28, vol: 0.35 }); noise({ dur: 0.15, vol: 0.12, f0: 800, delay: 0.05 }); },
    bolt: () => { noise({ dur: 0.5, vol: 0.4, type: 'highpass', f0: 1500 }); tone({ type: 'sawtooth', f0: 1600, f1: 90, dur: 0.35, vol: 0.18 }); },
    speed: () => { tone({ f0: 300, f1: 1500, dur: 0.32, vol: 0.12 }); tone({ type: 'triangle', f0: 600, f1: 2400, dur: 0.32, vol: 0.08, delay: 0.05 }); },
    hit: () => { tone({ f0: 500, f1: 110, dur: 0.32, vol: 0.18 }); noise({ dur: 0.18, vol: 0.2, f0: 1200 }); },
    stomp: () => { tone({ type: 'sine', f0: 180, f1: 55, dur: 0.16, vol: 0.5 }); noise({ dur: 0.08, vol: 0.15, f0: 900 }); },
    respawn: () => tone({ type: 'triangle', f0: 220, f1: 880, dur: 0.3, vol: 0.18 }),
    beep: () => tone({ f0: 523, dur: 0.18, vol: 0.18 }),
    go: () => { tone({ f0: 1047, dur: 0.4, vol: 0.2 }); tone({ type: 'triangle', f0: 523, dur: 0.4, vol: 0.15 }); },
    finish: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 4 ? 0.5 : 0.12, vol: 0.13, delay: i * 0.09 })),
    win: () => {
      [[523, 0], [523, 0.15], [523, 0.3], [698, 0.45], [880, 0.75], [784, 1.0], [1047, 1.2]].forEach(([f, d], i, a) =>
        tone({ type: 'square', f0: f, dur: i === a.length - 1 ? 0.8 : 0.16, vol: 0.13, delay: d }));
      [262, 330, 392].forEach((f) => tone({ type: 'triangle', f0: f, dur: 1.2, vol: 0.1, delay: 1.2 }));
    },
    click: () => tone({ type: 'triangle', f0: 880, dur: 0.05, vol: 0.12 }),
  };

  function play(name) {
    if (!ctx || !sfxOn || ctx.state !== 'running' || !SFX[name]) return;
    const now = performance.now();
    if (now - (lastPlayed[name] || 0) < 40) return;
    lastPlayed[name] = now;
    try { SFX[name](); } catch (e) { /* ignore audio errors */ }
  }

  // ---- music: a small chiptune loop, scheduled slightly ahead of time -----------
  // Eight bars, C - G - Am - F twice; section B has a different melody.
  const CHORDS = [48, 43, 45, 41, 48, 43, 45, 41];
  const MELODY = [
    [72, -1, 76, -1, 79, -1, 76, -1, 84, -1, 79, -1, 76, -1, 74, -1],
    [74, -1, 79, -1, 83, -1, 79, -1, 86, -1, 83, -1, 79, -1, 74, -1],
    [72, -1, 76, -1, 81, -1, 76, -1, 84, -1, 81, -1, 76, -1, 72, -1],
    [77, -1, 81, -1, 84, -1, 81, -1, 79, -1, 77, -1, 76, -1, 74, -1],
    [79, -1, -1, 79, 76, -1, 79, -1, 81, -1, 79, -1, 76, -1, 72, -1],
    [74, -1, -1, 74, 79, -1, 74, -1, 83, -1, 81, -1, 79, -1, -1, -1],
    [76, -1, -1, 76, 81, -1, 76, -1, 84, -1, 83, -1, 81, -1, 79, -1],
    [77, -1, 76, -1, 74, -1, 72, -1, 74, -1, -1, -1, 79, -1, -1, -1],
  ];
  let wantMusic = false, mode = 'menu', musicTimer = null, step = 0, nextTime = 0;

  function startScheduler() {
    if (!ctx || musicTimer) return;
    nextTime = ctx.currentTime + 0.05;
    step = 0;
    musicTimer = setInterval(schedule, 25);
  }

  function schedule() {
    if (!ctx) return;
    const bpm = mode === 'race' ? 150 : 108;
    const stepDur = 60 / bpm / 4;
    while (nextTime < ctx.currentTime + 0.12) {
      const bar = Math.floor(step / 16) % 8;
      const s = step % 16;
      const root = CHORDS[bar];
      const t = nextTime;
      // Bass: eighth notes bouncing between root and octave.
      if (s % 2 === 0) tone({ type: 'triangle', f0: midi(root + (s % 4 === 2 ? 12 : 0)), dur: stepDur * 1.8, vol: 0.32, bus: musicBus, at: t });
      // Lead melody.
      const n = MELODY[bar][s];
      if (n > 0) tone({ type: 'square', f0: midi(mode === 'race' ? n : n - 12), dur: stepDur * (mode === 'race' ? 1.6 : 2.6), vol: mode === 'race' ? 0.09 : 0.07, bus: musicBus, at: t });
      if (mode === 'race') {
        if (s === 0 || s === 8 || s === 10) tone({ type: 'sine', f0: 150, f1: 45, dur: 0.12, vol: 0.55, bus: musicBus, at: t });
        if (s === 4 || s === 12) noise({ dur: 0.12, vol: 0.22, type: 'highpass', f0: 1800, bus: musicBus, at: t });
        if (s % 2 === 1) noise({ dur: 0.03, vol: 0.08, type: 'highpass', f0: 7000, bus: musicBus, at: t });
      } else if (s % 4 === 2) {
        noise({ dur: 0.03, vol: 0.05, type: 'highpass', f0: 7000, bus: musicBus, at: t });
      }
      nextTime += stepDur;
      step = (step + 1) % 128;
    }
  }

  function music(newMode) {
    wantMusic = !!newMode;
    if (!newMode) { stopScheduler(); return; }
    if (newMode !== mode) { mode = newMode; step = 0; }
    if (ctx && ctx.state === 'running' && !musicTimer) startScheduler();
  }

  function stopScheduler() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  function setSfx(on) { sfxOn = on; store.set('ch-sfx', on ? '1' : '0'); if (sfxBus) sfxBus.gain.value = on ? 0.6 : 0; }
  function setMusic(on) { musicOn = on; store.set('ch-music', on ? '1' : '0'); if (musicBus) musicBus.gain.value = on ? 0.28 : 0; }

  return {
    unlock, play, music,
    setSfx, setMusic,
    sfxOn: () => sfxOn,
    musicOn: () => musicOn,
  };
})();
