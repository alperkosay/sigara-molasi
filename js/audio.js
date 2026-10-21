// Tamamen sentezlenmiş ses: efektler + prosedürel metal müzik. Dış dosya yok.
const SND = (() => {
  let ctx = null, master, sfxBus, musicBus, filter, noiseBuf, distCurve;
  let musicOn = true;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5;
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 20000;
    master = ctx.createGain(); master.gain.value = 0.8;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32;
    sfxBus.connect(filter); musicBus.connect(filter);
    filter.connect(comp); comp.connect(master); master.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 9) * 0.9; }
    Music.start();
  }

  const now = () => ctx.currentTime;

  function env(g, t, a, peak, dec, sus = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(sus, t + a + dec);
  }

  function noise(t, dur, { type = 'lowpass', f0 = 3000, f1 = 300, q = 0.7, vol = 0.5, a = 0.002, bus = sfxBus } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bq = ctx.createBiquadFilter(); bq.type = type; bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t); bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    src.connect(bq); bq.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + a + 0.05);
  }

  function tone(t, dur, { type = 'sine', f0 = 200, f1 = 50, vol = 0.5, a = 0.002, dist = false, bus = sfxBus } = {}) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain(); env(g, t, a, vol, dur);
    if (dist) { const ws = ctx.createWaveShaper(); ws.curve = distCurve; o.connect(ws); ws.connect(g); }
    else o.connect(g);
    g.connect(bus); o.start(t); o.stop(t + dur + a + 0.05);
  }

  const S = {
    shotgun() { const t = now();
      noise(t, 0.45, { f0: 5000, f1: 200, vol: 0.9 });
      tone(t, 0.18, { f0: 140, f1: 35, vol: 0.9, dist: true });
      tone(t, 0.32, { f0: 70, f1: 28, vol: 1.0 });                                         // göğse vuran alt bas
      noise(t + 0.38, 0.05, { type: 'bandpass', f0: 2200, f1: 1800, q: 4, vol: 0.25 });   // kırma
      noise(t + 0.62, 0.06, { type: 'bandpass', f0: 1600, f1: 1400, q: 4, vol: 0.3 });    // kapama
    },
    chaingun() { const t = now();
      noise(t, 0.09, { f0: 4000, f1: 600, vol: 0.45 });
      tone(t, 0.06, { type: 'square', f0: 110, f1: 50, vol: 0.25 });
      tone(t, 0.08, { f0: 90, f1: 40, vol: 0.45 });
    },
    rocket() { const t = now();
      noise(t, 0.5, { type: 'bandpass', f0: 600, f1: 2500, q: 1.5, vol: 0.6, a: 0.02 });
      tone(t, 0.2, { f0: 90, f1: 40, vol: 0.6 });
      tone(t, 0.3, { f0: 60, f1: 25, vol: 0.9, dist: true });
    },
    explosion(v = 1) { const t = now();
      noise(t, 1.3, { f0: 1600, f1: 60, vol: 1.0 * v, a: 0.005 });
      tone(t, 0.6, { f0: 90, f1: 22, vol: 1.0 * v, dist: true });
    },
    hit() { const t = now(); tone(t, 0.04, { type: 'square', f0: 1800, f1: 1500, vol: 0.12 }); },
    headshot() { const t = now(); tone(t, 0.08, { type: 'triangle', f0: 2600, f1: 2400, vol: 0.2 }); },
    die(p = 1) { const t = now();
      tone(t, 0.5, { type: 'sawtooth', f0: 220 * p, f1: 40 * p, vol: 0.4, dist: true });
      noise(t, 0.3, { f0: 1200, f1: 200, vol: 0.5 });
    },
    gib() { const t = now();
      noise(t, 0.4, { f0: 900, f1: 120, vol: 0.8 });
      noise(t + 0.05, 0.25, { type: 'bandpass', f0: 400, f1: 150, q: 3, vol: 0.6 });
    },
    enemyShot() { const t = now(); tone(t, 0.2, { type: 'square', f0: 700, f1: 160, vol: 0.12 }); },
    hurt() { const t = now(); tone(t, 0.18, { f0: 160, f1: 60, vol: 0.6, dist: true }); noise(t, 0.12, { f0: 1500, f1: 300, vol: 0.4 }); },
    land() { const t = now(); tone(t, 0.08, { f0: 120, f1: 50, vol: 0.25 }); },
    jump() { const t = now(); noise(t, 0.06, { type: 'highpass', f0: 2000, f1: 3000, vol: 0.06 }); },
    dash() { const t = now(); noise(t, 0.3, { type: 'bandpass', f0: 500, f1: 3000, q: 1, vol: 0.5, a: 0.01 }); },
    kick() { const t = now(); noise(t, 0.15, { type: 'bandpass', f0: 1200, f1: 300, q: 1, vol: 0.4, a: 0.03 }); },
    kickHit() { const t = now(); tone(t, 0.15, { f0: 180, f1: 50, vol: 0.8, dist: true }); },
    empty() { const t = now(); tone(t, 0.03, { type: 'square', f0: 900, f1: 800, vol: 0.12 }); },
    pickup() { const t = now(); [0, 0.05, 0.1].forEach((d, i) => tone(t + d, 0.06, { type: 'square', f0: 500 + i * 250, f1: 520 + i * 250, vol: 0.08 })); },
    spawn() { const t = now(); tone(t, 0.6, { type: 'sawtooth', f0: 60, f1: 600, vol: 0.12, a: 0.3 }); },
    door() { const t = now(); tone(t, 1.0, { type: 'sawtooth', f0: 55, f1: 40, vol: 0.25, dist: true, a: 0.1 }); noise(t, 1.0, { f0: 400, f1: 100, vol: 0.3, a: 0.1 }); },
    alarm() { const t = now(); for (let i = 0; i < 3; i++) tone(t + i * 0.25, 0.2, { type: 'square', f0: 880, f1: 440, vol: 0.12 }); },
    // --- sigara ---
    zippoOpen() { const t = now();
      tone(t, 0.12, { type: 'triangle', f0: 3200, f1: 3000, vol: 0.18 });
      tone(t + 0.01, 0.2, { type: 'sine', f0: 4700, f1: 4500, vol: 0.12 });
      noise(t, 0.03, { type: 'highpass', f0: 4000, f1: 5000, vol: 0.2 });
    },
    zippoStrike() { const t = now();
      noise(t, 0.07, { type: 'bandpass', f0: 3500, f1: 2500, q: 2, vol: 0.4 });
      noise(t + 0.05, 0.5, { f0: 900, f1: 500, vol: 0.35, a: 0.03 });   // alev "fuff"
    },
    zippoClose() { const t = now(); tone(t, 0.1, { type: 'triangle', f0: 2100, f1: 1900, vol: 0.2 }); noise(t, 0.04, { f0: 3000, f1: 1000, vol: 0.2 }); },
    inhale() { const t = now();
      noise(t, 0.9, { type: 'bandpass', f0: 1800, f1: 2400, q: 0.8, vol: 0.12, a: 0.3 });
      for (let i = 0; i < 9; i++) noise(t + 0.1 + Math.random() * 0.8, 0.015, { type: 'highpass', f0: 5000, f1: 6000, vol: 0.18 }); // çıtırtı
    },
    exhale() { const t = now(); noise(t, 1.3, { f0: 900, f1: 300, vol: 0.22, a: 0.08 }); },
    flick() { const t = now(); noise(t, 0.12, { type: 'bandpass', f0: 2500, f1: 800, q: 1, vol: 0.2 }); },
    sizzle() { const t = now(); noise(t, 0.5, { type: 'highpass', f0: 3000, f1: 6000, vol: 0.25 }); },
    slowIn() { const t = now(); tone(t, 0.8, { type: 'sawtooth', f0: 300, f1: 40, vol: 0.2 }); },
    // --- ofis ---
    ding(n = 0) { const t = now(), k = 1 + Math.min(n, 80) * 0.004;   // yeni e-posta
      tone(t, 0.14, { f0: 1318 * k, f1: 1318 * k, vol: 0.13 });
      tone(t + 0.09, 0.22, { f0: 1760 * k, f1: 1760 * k, vol: 0.11 });
    },
    heartbeat(s = 0.5) { const t = now(), v = 0.25 + s * 0.55;
      tone(t, 0.13, { f0: 75, f1: 42, vol: v }); tone(t + 0.17, 0.12, { f0: 68, f1: 40, vol: v * 0.7 });
    },
    slam() { const t = now();   // klavyeye yumruk
      tone(t, 0.22, { f0: 130, f1: 38, vol: 1.0, dist: true });
      noise(t, 0.28, { type: 'highpass', f0: 2500, f1: 3500, vol: 0.55 });          // tuş takırtısı
      for (let i = 0; i < 6; i++) noise(t + 0.05 + Math.random() * 0.25, 0.02, { type: 'highpass', f0: 3000, f1: 4000, vol: 0.25 });
      noise(t, 0.35, { f0: 700, f1: 90, vol: 0.7 });
    },
    phone() { const t = now();   // ofis telefonu: iki kısa zil
      for (let r = 0; r < 2; r++) for (let i = 0; i < 14; i++) { const f = i % 2 ? 1250 : 1550; tone(t + r * 0.55 + i * 0.03, 0.028, { type: 'square', f0: f, f1: f, vol: 0.035 }); }
    },
    talk() { const t = now();   // retro diyalog "bıdı bıdı"
      for (let i = 0; i < 6; i++) { const f = 170 + Math.random() * 130; tone(t + i * 0.065, 0.045, { type: 'square', f0: f, f1: f * 0.85, vol: 0.05 }); }
    },
    typing() { const t = now(); noise(t, 0.015, { type: 'highpass', f0: 3500, f1: 4000, vol: 0.05 + Math.random() * 0.04 }); },
    buzz() { const t = now(); tone(t, 0.12, { type: 'square', f0: 100, f1: 98, vol: 0.05 }); },
    portalOpen() { const t = now();
      tone(t, 2.8, { type: 'sawtooth', f0: 38, f1: 30, vol: 0.4, a: 0.6, dist: true });
      noise(t, 2.4, { f0: 150, f1: 1200, vol: 0.4, a: 1.2 });
      tone(t + 0.4, 1.8, { type: 'sawtooth', f0: 1400, f1: 180, vol: 0.06, a: 0.3 });  // çığlık
    },
    portalEnter() { const t = now();
      noise(t, 1.2, { f0: 3000, f1: 80, vol: 1.0, a: 0.01 });
      tone(t, 0.9, { f0: 260, f1: 28, vol: 0.9, dist: true });
    },
    combo(n) { const t = now(); tone(t, 0.1, { type: 'square', f0: 300 + Math.min(n, 20) * 40, f1: 320 + Math.min(n, 20) * 40, vol: 0.06 }); },
  };

  // ---------------- MÜZİK ----------------
  // 16'lık adım sekanserı. riff: sayı = açık power chord (E'den yarım ton), 'm' = palm-mute chug, null = es
  const Music = (() => {
    const BPM = 168, STEP = 60 / BPM / 4;
    const RIFFS = [
      [0,'m','m',0,'m','m',3,'m','m',0,'m','m',5,'m',6,5, 0,'m','m',0,'m','m',3,'m','m',0,'m',7,6,5,3,1],
      ['m','m',0,'m','m',0,'m',1,'m','m',0,'m',3,'m',2,1, 'm','m',0,'m','m',0,'m',1,'m','m',8,7,6,5,3,1],
      [0,null,0,null,'m','m',10,null,8,null,'m','m',7,null,5,null, 0,null,0,null,'m','m',3,null,5,null,6,null,5,3,1,0],
    ];
    let step = 0, nextTime = 0, timer = null, intensity = 0, riffIdx = 0, targetIntensity = 0;

    function kick(t, v = 1) { tone(t, 0.12, { f0: 150, f1: 42, vol: 0.9 * v, bus: musicBus }); noise(t, 0.01, { type: 'highpass', f0: 3000, f1: 3000, vol: 0.2 * v, bus: musicBus }); }
    function snare(t) { noise(t, 0.16, { type: 'highpass', f0: 1200, f1: 900, vol: 0.55, bus: musicBus }); tone(t, 0.08, { type: 'triangle', f0: 200, f1: 150, vol: 0.4, bus: musicBus }); }
    function hat(t, v = 1) { noise(t, 0.03, { type: 'highpass', f0: 8000, f1: 9000, vol: 0.14 * v, bus: musicBus }); }
    function guitar(t, semi, muted, len) {
      const base = 82.41 * Math.pow(2, semi / 12);
      const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = muted ? 750 : 2600; lp.Q.value = 1.2;
      const ws = ctx.createWaveShaper(); ws.curve = distCurve;
      const dur = muted ? STEP * 0.8 : len;
      env(g, t, 0.004, muted ? 0.32 : 0.28, dur, muted ? 0.0001 : 0.05);
      g.gain.setValueAtTime(muted ? 0.0001 : 0.05, t + dur + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
      [1, 1.4983, 2].forEach((m, i) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = base * m; o.detune.value = (i - 1) * 7;
        o.connect(ws); o.start(t); o.stop(t + dur + 0.1);
      });
      ws.connect(lp); lp.connect(g); g.connect(musicBus);
    }
    function drone(t) { // menü / sakin anlar: kasvetli uğultu
      tone(t, STEP * 15, { type: 'sawtooth', f0: 41.2, f1: 40, vol: 0.12, a: 0.6, bus: musicBus });
      noise(t, STEP * 14, { f0: 300, f1: 120, vol: 0.06, a: 0.8, bus: musicBus });
    }

    function schedule(t, s) {
      const riff = RIFFS[riffIdx], i = s % 32, q = s % 16;
      if (q === 0 && i === 0) intensity = targetIntensity;
      if (intensity === 0) { if (q === 0) { drone(t); if (s % 64 === 0) kick(t, 0.5); } return; }
      const n = riff[i];
      // davul
      if (intensity >= 2) {
        if (n === 'm' || n === 0 || q % 4 === 0) kick(t, 0.85);
        if (q === 4 || q === 12) snare(t);
        hat(t, q % 2 ? 0.5 : 1);
      } else {
        if (q === 0 || q === 8 || q === 10) kick(t, 0.7);
        if (q === 4 || q === 12) snare(t);
        if (q % 2 === 0) hat(t, 0.6);
      }
      // gitar
      if (n !== null && n !== undefined) {
        if (intensity >= 2 || q % 4 === 0) {
          let len = STEP; let j = i + 1;
          while (j < 32 && riff[j] === null) { len += STEP; j++; }
          guitar(t, n === 'm' ? 0 : n, n === 'm', len * 0.95);
        }
      }
      if (i === 31 && s % 128 === 127) riffIdx = (riffIdx + 1) % RIFFS.length;
    }

    function tick() {
      if (!ctx) return;
      while (nextTime < ctx.currentTime + 0.12) {
        if (musicOn) schedule(nextTime, step);
        nextTime += STEP; step++;
      }
    }
    return {
      start() { if (timer) return; nextTime = ctx.currentTime + 0.1; timer = setInterval(tick, 25); },
      set(level) { targetIntensity = level; },
      get level() { return targetIntensity; },
    };
  })();

  return {
    init, S, Music,
    get ready() { return !!ctx; },
    play(name, ...a) { if (ctx && S[name]) S[name](...a); },
    muffle(amount) { // 0 = net, 1 = boğuk (ağır çekim)
      if (!ctx) return;
      filter.frequency.setTargetAtTime(20000 * Math.pow(0.03, amount), ctx.currentTime, 0.05);
    },
    toggleMusic() { musicOn = !musicOn; if (ctx) musicBus.gain.setTargetAtTime(musicOn ? 0.32 : 0, ctx.currentTime, 0.1); return musicOn; },
  };
})();
