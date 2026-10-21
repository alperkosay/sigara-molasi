// HUD: değerler sadece değiştiğinde DOM'a yazılır. Surat portresi 32x32 piksel çizilir.
const HUD = (() => {
  const $ = id => document.getElementById(id);
  const el = {
    hud: $('hud'), hp: $('hp'), ammo: $('ammo'), wname: $('wname'), cigs: $('cigs'), pack: $('pack'), cigstick: $('cigstick'), pWep: $('pWep'), hpbar: $('hpbar'),
    floor: $('floor'), score: $('score'), kills: $('kills'), speed: $('speed'), combo: $('combo'), comboX: $('comboX'), comboT: $('comboT'),
    feed: $('feed'), msg: $('msg'), slowmo: $('slowmo'), hit: $('hitmarker'), dash: $('dash').children, face: $('face'),
  };
  const fctx = el.face.getContext('2d');
  const paper = el.cigstick.querySelector('.paper');
  const slots = [...document.querySelectorAll('#slots .slot')], slotAmmo = slots.map(x => x.querySelector('span'));
  const hpSegs = Array.from({ length: 15 }, () => el.hpbar.appendChild(document.createElement('i')));   // 15 dilim = 150 can

  // ------- piksel ikonlar: kalp + silah önizlemeleri -------
  const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  (function drawHeart() {
    const g = $('heart').getContext('2d');
    ['..XX..XX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...', '....XX....']
      .forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') R(g, y < 3 ? '#ff4a30' : '#c01810', x + 1, y + 1, 1, 1); }));
    R(g, '#ffd0c0', 3, 3, 1, 1);
  })();
  (function drawWeapons() {
    const draw = [
      g => {   // ÇİFTE: çift namlu + ahşap dipçik
        R(g, '#5a5e64', 4, 5, 30, 2); R(g, '#5a5e64', 4, 8, 30, 2); R(g, '#9a9ea4', 4, 5, 30, 1);
        R(g, '#2c2e33', 32, 4, 6, 7); R(g, '#5a3418', 14, 10, 12, 2);
        R(g, '#6a3a18', 38, 5, 9, 4); R(g, '#6a3a18', 40, 8, 7, 4); R(g, '#8a5a30', 38, 5, 9, 1); R(g, '#2c2e33', 34, 11, 2, 3);
      },
      g => {   // MAKİNELİ: döner namlular + cephane kutusu
        for (let i = 0; i < 3; i++) R(g, '#6a6e74', 2, 4 + i * 2, 20, 1);
        R(g, '#3a3e44', 2, 3, 3, 8); R(g, '#3a3e44', 18, 3, 3, 8);
        R(g, '#2c2e33', 21, 2, 16, 10); R(g, '#4a5a30', 26, 10, 10, 5); R(g, '#2c2e33', 36, 5, 9, 4); R(g, '#2c2e33', 29, 0, 3, 3);
      },
      g => {   // ROKETATAR: tüp + kırmızı roket ucu
        R(g, '#4a5a30', 4, 4, 38, 7); R(g, '#62743f', 4, 4, 38, 1); R(g, '#2c2e33', 2, 3, 4, 9); R(g, '#2c2e33', 40, 3, 4, 9);
        R(g, '#c01810', 0, 6, 3, 3); R(g, '#2c2e33', 22, 11, 4, 4); R(g, '#2c2e33', 18, 1, 6, 3);
      },
    ];
    slots.forEach((sl, i) => draw[i](sl.querySelector('canvas').getContext('2d')));
  })();
  const cache = {};
  const put = (key, node, val, prop = 'textContent') => { if (cache[key] !== val) { cache[key] = val; node[prop] = val; } };
  const style = (key, node, prop, val) => { if (cache[key] !== val) { cache[key] = val; node.style[prop] = val; } };
  let msgT = 0, hitT = 0, moodT = 0, mood = 'normal', look = 0, lookT = 0, dmT = 0, dmFull = '', dmShown = 0, dmFrame = -1;
  const dmEl = $('dm'), dmText = $('dmText'), bctx = $('dmFace').getContext('2d');

  // Bedirhan Abi: kumral saç, güneş gözlüğü, kirli sakal, ağzının kenarında sigara, deri ceket
  function drawBedirhan(frame, talking) {
    const g = bctx, px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    g.clearRect(0, 0, 32, 32); px('#120806', 0, 0, 32, 32);
    const skin = '#c89068', shade = '#a07050', hair = '#a87442', hairHi = '#c89458', beard = '#7a5434';
    px('#1a1410', 4, 27, 24, 5); px('#2a201a', 9, 27, 14, 2); px('#e8e4dc', 13, 27, 6, 2);   // deri ceket + gömlek yakası
    px(skin, 8, 6, 16, 20); px(skin, 7, 9, 18, 13); px(shade, 9, 24, 14, 3); px(shade, 7, 17, 2, 5); px(shade, 23, 17, 2, 5);
    px(hair, 7, 3, 18, 5); px(hair, 6, 5, 3, 8); px(hair, 23, 5, 3, 7); px(hair, 10, 2, 13, 2);   // geriye taranmış kumral saç
    px(hairHi, 11, 3, 8, 1); px(hairHi, 8, 5, 3, 1); px(hair, 18, 7, 6, 1);
    for (let i = 0; i < 26; i++) px(beard, 9 + (i * 7) % 14, 19 + (i * 3) % 7);                      // kirli sakal
    px(beard, 12, 20, 8, 1);                                                                      // bıyık
    px('#050505', 8, 11, 7, 4); px('#050505', 17, 11, 7, 4); px('#050505', 14, 11, 4, 1); px('#050505', 6, 11, 2, 1); px('#050505', 24, 11, 2, 1);
    px('#ffffff', 9, 12, 2, 1); px('#ffffff', 18, 12, 2, 1); px('#6a6a70', 13, 14, 1, 1);           // gözlük parlaması
    px(shade, 15, 14, 2, 5); px('#8a5a3a', 14, 18, 4, 1);                                          // burun
    if (talking && frame % 2) { px('#2a0a06', 12, 22, 7, 3); px('#e8e0d0', 13, 22, 5, 1); }        // konuşan ağız
    else { px('#5a2a1a', 12, 22, 8, 1); px('#5a2a1a', 18, 21, 2, 1); }                             // yan sırıtış
    px('#c88a3a', 19, 22, 2, 1); px('#f2efe6', 21, 22, 6, 1); px(frame % 3 ? '#ff6010' : '#ffb040', 27, 22, 1, 1);   // sigara
    const sm = 'rgba(210,210,210,.55)';
    px(sm, 27 + (frame % 2), 19, 1, 2); px(sm, 28 - (frame % 2), 16, 1, 2); px('rgba(210,210,210,.3)', 27 + ((frame >> 1) % 2), 13, 1, 2);
  }

  // ------- surat -------
  const BLOOD = Array.from({ length: 40 }, (_, i) => [8 + (i * 37) % 17, 6 + (i * 23) % 22]);
  function drawFace(s) {
    const g = fctx, px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    g.clearRect(0, 0, 32, 32);
    px('#120a06', 0, 0, 32, 32);
    if (s.mood === 'dead') {
      px('#5a3a2a', 7, 6, 18, 22); px('#6a1010', 7, 6, 18, 22);
      px('#e8dcc0', 10, 13, 4, 1); px('#e8dcc0', 18, 13, 4, 1); px('#e8dcc0', 11, 12, 2, 3); px('#e8dcc0', 19, 12, 2, 3);
      px('#200', 12, 21, 8, 3); return;
    }
    const skin = '#b07850', shade = '#8a5a3a', dark = '#3a2418';
    px(skin, 8, 6, 16, 20); px(skin, 7, 9, 18, 14); px(shade, 9, 24, 14, 3); px(shade, 7, 18, 2, 5); px(shade, 23, 18, 2, 5);
    px(dark, 7, 4, 18, 4); px(dark, 6, 6, 2, 6); px(dark, 24, 6, 2, 6);                    // kısa saç
    for (let i = 0; i < 18; i++) px('#6a4632', 9 + (i * 7) % 14, 20 + (i * 3) % 6);            // sakal
    px(shade, 15, 13, 2, 6); px('#5a3a28', 14, 18, 4, 1);                                        // burun
    // kaşlar (öfkeli)
    px(dark, 9, 10, 2, 1); px(dark, 11, 11, 3, 1); px(dark, 21, 10, 2, 1); px(dark, 18, 11, 3, 1);
    if (s.shades) {
      px('#050505', 8, 12, 7, 3); px('#050505', 17, 12, 7, 3); px('#050505', 14, 12, 4, 1);
      px('#ffffff', 9, 12, 2, 1); px('#ffffff', 18, 12, 2, 1);
    } else {
      const ex = s.look;
      px('#e8e0d0', 10, 12, 4, 2); px('#e8e0d0', 18, 12, 4, 2);
      px('#203040', 11 + ex, 12, 2, 2); px('#203040', 19 + ex, 12, 2, 2);
      if (s.mood === 'ouch') { px(skin, 10, 12, 4, 1); px(skin, 18, 12, 4, 1); }
    }
    // ağız
    if (s.mood === 'stress') {   // diş sıkma, ter, alında damar
      px('#2a0a06', 11, 21, 10, 3); px('#e8e0d0', 12, 21, 8, 2); for (let x = 13; x < 20; x += 2) px('#8a7a68', x, 21, 1, 2);
      px('#90c8ff', 24, 10 + (Math.floor(s.t * 2) % 4), 1, 2); px('#90c8ff', 7, 13, 1, 2);
      px('#7a3020', 19, 7, 1, 2); px('#7a3020', 20, 8, 1, 1);
      px('#e8e0d0', 10, 12, 4, 2); px('#e8e0d0', 18, 12, 4, 2); px('#101010', 11 + s.look, 12, 1, 1); px('#101010', 19 + s.look, 12, 1, 1);
    } else if (s.mood === 'grin') { px('#2a0a06', 11, 21, 10, 3); px('#e8e0d0', 12, 21, 8, 1); px('#e8e0d0', 12, 23, 8, 1); }
    else if (s.mood === 'ouch') { px('#2a0a06', 13, 20, 6, 4); }
    else { px('#4a2216', 11, 22, 10, 1); px('#4a2216', 19, 21, 2, 1); }
    // sigara
    if (s.cig) {
      px('#c88a3a', 19, 22, 2, 1); px('#f2efe6', 21, 22, 6, 1); px(s.t % 1 < 0.5 ? '#ff6010' : '#ffb040', 27, 22, 1, 1);
      px('rgba(200,200,200,.6)', 27 + Math.round(Math.sin(s.t * 3)), 19, 1, 2); px('rgba(200,200,200,.4)', 28 - Math.round(Math.sin(s.t * 2)), 16, 1, 2);
    }
    // kan (can azaldıkça)
    const n = Math.floor((1 - Math.max(0, Math.min(1, s.hp / 100))) * BLOOD.length);
    for (let i = 0; i < n; i++) px(i % 3 ? '#8a0c08' : '#c01810', BLOOD[i][0], BLOOD[i][1], 1, i % 4 ? 1 : 2);
  }

  return {
    show(on) { el.hud.classList.toggle('on', on); },
    mood(m, dur = 0.6) { mood = m; moodT = dur; },
    msg(big, small = '', dur = 2, low = false) { el.msg.innerHTML = big + (small ? `<small>${small}</small>` : ''); el.msg.style.top = low ? '62%' : ''; el.msg.style.opacity = 1; msgT = dur; },
    feed(text, hot) {
      const d = document.createElement('div'); d.textContent = text; if (hot) d.className = 'hot';
      el.feed.prepend(d); while (el.feed.children.length > 6) el.feed.lastChild.remove();
      setTimeout(() => d.remove(), 2300);
    },
    hit(kill) { el.hit.className = kill ? 'kill' : ''; el.hit.style.opacity = 1; hitT = kill ? 0.2 : 0.1; },
    dmHide() { dmT = 0; dmEl.classList.remove('on'); },
    dm(text, dur = 5) { dmFull = text; dmShown = 0; dmText.textContent = ''; dmEl.classList.add('on'); dmT = dur; },   // Bedirhan Abi arıyor
    clearFeed() { dmEl.classList.remove('on'); dmT = 0; el.feed.innerHTML = ''; el.msg.style.opacity = 0; },
    update(s, dt) {
      put('hp', el.hp, String(Math.max(0, Math.ceil(s.hp))));
      put('hpl', el.hp, s.hp <= 30 ? 'val low' : 'val', 'className');
      const segs = Math.ceil(Math.max(0, s.hp) / 10);
      for (let i = 0; i < 15; i++) put('hs' + i, hpSegs[i], i < Math.min(segs, 10) ? 'on' : i >= 10 && i < segs ? 'over' : '', 'className');
      put('hpbl', el.hpbar, s.hp <= 30 ? 'low' : '', 'className');
      put('ammo', el.ammo, String(s.ammo));
      put('wname', el.wname, s.wname);
      put('pwep', el.pWep, s.office ? 'panel right office' : 'panel right', 'className');
      s.slots.forEach((a, i) => {
        put('sl' + i, slots[i], 'slot' + (i === s.weapon ? ' sel' : '') + (a === 0 ? ' empty' : ''), 'className');
        put('sa' + i, slotAmmo[i], String(a));
      });
      put('pack', el.pack, '<i></i>'.repeat(10), 'innerHTML');   // sigara sınırsız: paket hep dolu
      put('cigs', el.cigs, '×∞');
      put('cigon', el.cigstick, s.smoking ? 'on' : '', 'className');
      style('paper', paper, 'width', Math.round((s.smoking ? Math.max(0.05, s.burn) : 1) * 60) + 'px');
      put('floor', el.floor, String(s.floor));
      put('score', el.score, String(s.score));
      put('kills', el.kills, String(s.kills));
      const sp = Math.round(s.speed * 32);   // Quake birimi gibi göster (u/s)
      put('speed', el.speed, String(sp));
      put('speedc', el.speed, sp > 650 ? 'insane' : sp > 420 ? 'fast' : '', 'className');
      for (let i = 0; i < el.dash.length; i++) put('dash' + i, el.dash[i], i < s.dash ? '' : 'off', 'className');
      style('combo', el.combo, 'opacity', s.combo > 1 ? '1' : '0');
      put('comboX', el.comboX, 'x' + s.mult + (s.combo > 1 ? `<span style="font-size:32px;color:#e8dcc0"> ${s.combo} LEŞ</span>` : ''), 'innerHTML');
      style('comboT', el.comboT, 'width', Math.round(s.comboFrac * 160) + 'px');
      style('slowmo', el.slowmo, 'opacity', s.slowmo > 0 ? '1' : '0');

      if (msgT > 0) { msgT -= dt; if (msgT <= 0) el.msg.style.opacity = 0; }
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) el.hit.style.opacity = 0; }
      if (dmT > 0) {   // balon: daktilo efektiyle yaz
        dmT -= dt;
        if (dmShown < dmFull.length) { dmShown = Math.min(dmFull.length, dmShown + dt * 32); dmText.textContent = dmFull.slice(0, Math.floor(dmShown)); }
        if (dmT <= 0) dmEl.classList.remove('on');
      }
      const fr = Math.floor(s.time * 7);   // arama sırasında: sigarası tüter, konuşurken ağzı oynar
      if (dmT > 0 && fr !== dmFrame) { dmFrame = fr; drawBedirhan(fr, dmShown < dmFull.length); }
      if (moodT > 0) { moodT -= dt; if (moodT <= 0) mood = 'normal'; }
      lookT -= dt; if (lookT < 0) { lookT = 0.8 + Math.random() * 1.6; look = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]; }
      const f = { hp: Math.ceil(s.hp / 5) * 5, mood: s.hp <= 0 ? 'dead' : mood, look, cig: s.smoking, shades: s.slowmo > 0, t: Math.floor(s.time * 4) / 4 };
      const key = JSON.stringify(f);
      if (cache.face !== key) { cache.face = key; drawFace(f); }
    },
  };
})();
