(function () {
  "use strict";

  let ctx = null;
  let master = null;
  let muted = false;
  let started = false;
  let musicTimer = null;

  function ensureCtx() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
      } catch (_) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function noiseBuffer(seconds) {
    const c = ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  function startAmbience() {
    const c = ctx;
    // 风：布朗噪声 + 缓慢起伏
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
    const lfoGain = c.createGain(); lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
    // 灯管微鸣
    const hum = c.createOscillator(); hum.type = "sine"; hum.frequency.value = 118;
    const humG = c.createGain(); humG.gain.value = 0.012;
    hum.connect(humG); humG.connect(master); hum.start();
  }

  const SCALE = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99]; // G4 A4 C5 D5 E5 G5
  let melodyStep = 0;
  function pluck(freq, when, dur, vol) {
    const c = ctx;
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = "triangle"; o2.frequency.value = freq * 2.01;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const g2 = c.createGain(); g2.gain.value = 0.22;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
    o.start(when); o2.start(when);
    o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }
  let musicEl = null;
  function startSynthMusic() {
    if (musicTimer) return;
    const tick = () => {
      if (!ctx || muted) return;
      const t = ctx.currentTime + 0.05;
      const seq = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 1, 4];
      const idx = seq[melodyStep % seq.length];
      melodyStep++;
      pluck(SCALE[idx], t, 2.6, 0.05);
      if (melodyStep % 4 === 0) pluck(SCALE[idx] / 2, t + 0.9, 3.4, 0.035);
    };
    tick();
    musicTimer = setInterval(tick, 2600);
  }
  function startMusic() {
    if (musicEl || musicTimer) return;
    // 优先使用生成的本地配乐；加载或播放失败时回退到 WebAudio 合成旋律
    try {
      const el = new Audio("assets/bgm.mp3");
      el.loop = true;
      el.volume = muted ? 0 : 0.4;
      el.play().then(() => { musicEl = el; }).catch(() => { startSynthMusic(); });
    } catch (_) { startSynthMusic(); }
  }

  function blip(freq, dur, type, vol, when) {
    const c = ctx;
    const t = when != null ? when : c.currentTime;
    const o = c.createOscillator(); o.type = type || "sine"; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noiseSwell(dur, freq, vol) {
    const c = ctx;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(dur);
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(); src.stop(t + dur + 0.1);
  }

  const SFX = {
    item() { blip(523.25, 0.16, "sine", 0.14); blip(783.99, 0.22, "sine", 0.12, ctx.currentTime + 0.09); },
    error() { blip(138, 0.2, "square", 0.08); },
    reveal() { [523.25, 659.25, 783.99].forEach((f, i) => blip(f, 0.5, "sine", 0.1, ctx.currentTime + i * 0.12)); },
    tape() { noiseSwell(0.7, 900, 0.05); blip(660, 0.1, "square", 0.06, ctx.currentTime + 0.72); },
    clock() { blip(1568, 0.5, "sine", 0.12); blip(1046.5, 0.7, "sine", 0.08, ctx.currentTime + 0.18); },
    train() { noiseSwell(1.6, 320, 0.09); blip(196, 0.8, "sawtooth", 0.05, ctx.currentTime + 0.2); },
    unlock() { blip(880, 0.12, "triangle", 0.12); blip(1174.66, 0.2, "triangle", 0.1, ctx.currentTime + 0.08); },
    signal() { blip(740, 0.1, "sine", 0.1); },
    tick() { blip(2200, 0.05, "sine", 0.05); },
    loop() { noiseSwell(1.8, 500, 0.08); },
    open() { blip(392, 0.09, "sine", 0.06); },
  };

  function init() {
    if (started) return;
    if (!ensureCtx()) return;
    started = true;
    startAmbience();
    startMusic();
  }
  function sfx(name) {
    if (!started || muted) return;
    if (!ensureCtx()) return;
    if (SFX[name]) { try { SFX[name](); } catch (_) {} }
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.55;
    if (musicEl) musicEl.volume = m ? 0 : 0.4;
    if (!m && ctx && ctx.state === "suspended") ctx.resume();
  }

  function getState() {
    return {
      started: started,
      muted: muted,
      ctxState: ctx ? ctx.state : "none",
      musicMode: musicEl ? "file" : (musicTimer ? "synth" : "none"),
      musicPaused: musicEl ? musicEl.paused : null,
      musicVolume: musicEl ? musicEl.volume : null,
    };
  }

  window.MidnightAudio = { init, sfx, setMuted, isMuted: function () { return muted; }, getState };
})();
