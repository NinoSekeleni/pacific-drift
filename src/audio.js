// Sound of the sea, wind and rain, paddle splashes, and the radio's static and time signal tones.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let sea, wind, windFilter, rain, radioStatic, radioBus, noiseBuf;
  const listeners = [];

  function noise(seconds = 4) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = w;
      last = last * 0.98 + w * 0.02;
    }
    return b;
  }
  function loop(buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 3);
    return s;
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    noiseBuf = noise(5);

    // Sea: low wash
    const seaSrc = loop(noiseBuf);
    const seaLp = ctx.createBiquadFilter();
    seaLp.type = 'lowpass'; seaLp.frequency.value = 420; seaLp.Q.value = 0.3;
    sea = ctx.createGain(); sea.gain.value = 0;
    seaSrc.connect(seaLp).connect(sea).connect(master);

    // Wind: band of hiss that rises with speed
    const windSrc = loop(noiseBuf);
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 700; windFilter.Q.value = 0.8;
    wind = ctx.createGain(); wind.gain.value = 0;
    windSrc.connect(windFilter).connect(wind).connect(master);

    // Rain: bright patter
    const rainSrc = loop(noiseBuf);
    const rainHp = ctx.createBiquadFilter();
    rainHp.type = 'highpass'; rainHp.frequency.value = 2800;
    rain = ctx.createGain(); rain.gain.value = 0;
    rainSrc.connect(rainHp).connect(rain).connect(master);

    // Radio: static band through its own bus
    radioBus = ctx.createGain(); radioBus.gain.value = 1;
    radioBus.connect(master);
    const stSrc = loop(noiseBuf);
    const stBp = ctx.createBiquadFilter();
    stBp.type = 'bandpass'; stBp.frequency.value = 2300; stBp.Q.value = 0.45;
    radioStatic = ctx.createGain(); radioStatic.gain.value = 0;
    stSrc.connect(stBp).connect(radioStatic).connect(radioBus);
    for (const fn of listeners) fn(ctx);
  }

  const set = (param, v, tc = 0.25) => param.setTargetAtTime(v, ctx.currentTime, tc);

  /** Ambient levels: wind speed (m/s), wave height (m), rain 0..1, heave rate (m/s). */
  function update(windSpeed, waveH, rainAmt, heaveRate) {
    if (!ctx) return;
    set(sea.gain, Math.min(0.5, 0.06 + waveH * 0.05 + Math.abs(heaveRate) * 0.12), 0.4);
    set(wind.gain, Math.min(0.32, 0.0008 * windSpeed * windSpeed), 0.6);
    set(windFilter.frequency, 450 + windSpeed * 45, 0.8);
    set(rain.gain, Math.min(0.25, rainAmt * 0.22), 1.0);
  }

  function splash(strength = 1) {
    if (!ctx || muted) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 600; f.Q.value = 0.9;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * strength, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 3, 0.5);
  }

  function setStatic(level) {
    if (!ctx) return;
    set(radioStatic.gain, level, 0.08);
  }

  /** A sine tone through the radio (time signal ticks and markers). */
  function tone(freq, dur, level, when = 0) {
    if (!ctx || muted || level <= 0.001) return;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.002);
    g.gain.setValueAtTime(level, t + dur - 0.002);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(radioBus);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  function crackle(level) {
    if (!ctx || muted || Math.random() > 0.18) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(level * (0.4 + Math.random()), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.01 + Math.random() * 0.03);
    s.connect(g).connect(radioBus);
    s.start(t, Math.random() * 4, 0.05);
  }

  // Water slapping the hull as it rises and falls
  function lap(strength = 1) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 500; f.Q.value = 2.5;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * Math.min(1.5, strength), t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + Math.random() * 0.25);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 3, 0.7);
  }
  // Wood and lashings working as the hull flexes
  function creak(strength = 1) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 90 + Math.random() * 80;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (1.15 + Math.random() * 0.3), t + 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03 * strength, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + 0.3);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.35);
  }
  // Rolling thunder after a flash, delayed by the distance to the strike
  function thunder(delay, strength = 1) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 160 + 120 * strength; f.Q.value = 0.7;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * strength, t + 0.15);
    g.gain.linearRampToValueAtTime(0.32 * strength, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random(), 4.8);
  }
  // The soft roar of a kerosene lantern
  let hiss = null;
  function setLantern(level) {
    if (!ctx) return;
    if (!hiss) {
      const src = loop(noiseBuf);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
      hiss = ctx.createGain();
      hiss.gain.value = 0;
      src.connect(f).connect(hiss).connect(master);
    }
    set(hiss.gain, 0.012 * level, 0.5);
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  }

  return {
    start, update, splash, setStatic, tone, crackle, setMuted, lap, creak, thunder, setLantern,
    onStart(fn) { listeners.push(fn); if (ctx) fn(ctx); },
    get muted() { return muted; },
    get ready() { return !!ctx; }
  };
}
