// SİGARA MOLASI — ana oyun: render, oyuncu fiziği (Quake tarzı bhop), silahlar, sigara, arena akışı.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ================= AYARLAR =================
  const C = {
    renderH: 300, fov: 100, sens: 0.0022,
    gravity: 25, jump: 8.4, maxSpeed: 10.5, accel: 11, friction: 6, stopSpeed: 3,
    airAccel: 30, airCap: 0.95, maxAirSpeed: 32,   // CS tarzı: havada A/D + fare ile hızlan
    radius: 0.4, height: 1.8, eye: 1.6,
    dashSpeed: 17, dashRecharge: 1.1, dashMax: 2,
  };
  const MAX = { bullets: 400, rockets: 25 };
  const WEP = [
    { id: 'shotgun', name: 'ÇİFTE', ammo: null, rate: 0.95, pellets: 16, spread: 0.085, dmg: 8.5, knock: 1.1, shake: 0.35, kick: { p: 3.3, y: 0.8, r: 2.0, b: 1.9, fov: 10, push: 3.5, ca: 1.1, flash: 0.12 } },
    { id: 'chaingun', name: 'MAKİNELİ', ammo: 'bullets', rate: 0.068, pellets: 1, spread: 0.022, dmg: 14, knock: 1.6, shake: 0.06, kick: { p: 0.38, y: 0.4, r: 0.45, b: 0.35, fov: 1.2, push: 0.22, ca: 0.35, flash: 0.025 } },
    { id: 'rocket', name: 'ROKETATAR', ammo: 'rockets', rate: 0.75, rocket: true, shake: 0.2, kick: { p: 1.7, y: 0.35, r: 1.1, b: 1.5, fov: 6, push: 2.2, ca: 0.8, flash: 0.07 } },
  ];

  // ================= RENDER =================
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07090c, 8, 58);
  const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const rt = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const post = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, hurt: { value: 0 }, slowmo: { value: 0 }, flash: { value: 0 }, warm: { value: 0 }, kick: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 res; uniform float hurt, slowmo, flash, warm, kick, time; varying vec2 vUv;
      float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      void main(){
        vec2 uv = 0.5 + (vUv - 0.5) * (1.0 - kick * 0.025); vec2 d = uv - 0.5;   // atışta hafif içe vuruş
        float ca = hurt * 0.008 + slowmo * 0.003 + kick * 0.012;
        vec3 col = vec3(texture2D(tDiffuse, uv + d * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ca).b);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(l * 1.25, l * 1.0, l * 0.75), slowmo * 0.7);
        col = (col - 0.5) * 1.15 + 0.5 + vec3(0.05, 0.02, 0.0) * warm;
        float r = length(d);
        col *= 1.0 - r * r * 1.3;
        col = mix(col, vec3(0.55, 0.0, 0.0), clamp(hurt, 0.0, 1.0) * smoothstep(0.2, 0.75, r));
        col *= 1.0 + kick * 0.18;
        col += flash * vec3(1.0, 0.85, 0.6);
        vec2 px = floor(vUv * res);
        float levels = 18.0;
        col = floor(clamp(col, 0.0, 1.0) * levels + bayer4(px)) / levels;
        col *= 0.93 + 0.07 * step(1.0, mod(gl_FragCoord.y, 3.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const rh = C.renderH, rw = Math.round(rh * w / h);
    rt.setSize(rw, rh); post.uniforms.res.value.set(rw, rh);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    VM.camera.aspect = w / h; VM.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // dünya ışıkları (sabit sayı -> shader yeniden derlenmez)
  const muzzleLight = new THREE.PointLight(0xffc060, 0, 14, 1.5); scene.add(muzzleLight);
  const cigLight = new THREE.PointLight(0xff7020, 0, 5, 1.5); scene.add(cigLight);
  const exLights = [0, 1].map(() => { const L = new THREE.PointLight(0xff8020, 0, 18, 1.2); scene.add(L); return L; });
  let exIdx = 0;

  World.init(scene);
  FX.init(scene);

  // ================= OYUNCU =================
  const P = {
    pos: V3(), vel: V3(), yaw: 0, pitch: 0, hp: 100, grounded: false, dash: 2, dashT: 0, weapon: 0, lastWeapon: 1,
    ammo: { bullets: 120, rockets: 6 }, smoking: false, fireCD: 0, kills: 0, score: 0,
    combo: 0, comboT: 0, slowmo: 0, hurtFx: 0, flashFx: 0, shake: 0, fovKick: 0, landDip: 0,
    airT: 0, bobT: 0, dead: false, deadT: 0, killWindow: [], floor: 1, dmgMul: 1,
  };
  let state = 'menu', time = 0, hitstop = 0, worldScale = 1;
  let best = 0; try { best = +localStorage.getItem('sigaramolasi.best') || 0; } catch (e) { /* yok */ }
  const showBest = () => { $('best').textContent = best ? `EN İYİ SKOR: ${best}` : ''; };
  showBest();

  // ateş hissi: kamera yayları (pitch / yaw / roll / geri itme); hafif aşırı salınım bırakır
  const K = { p: 0, pv: 0, y: 0, yv: 0, r: 0, rv: 0, b: 0, bv: 0 };
  function springs(dt) {   // sabit alt adımlar: düşük fps'de de aynı sertlik
    const n = Math.ceil(dt * 240), h = dt / n;
    for (let i = 0; i < n; i++) for (const [x, v] of [['p', 'pv'], ['y', 'yv'], ['r', 'rv'], ['b', 'bv']]) { K[v] += (-K[x] * 240 - K[v] * 17) * h; K[x] += K[v] * h; }
  }

  // ================= G bağlamı (entities.js için) =================
  Object.assign(G, {
    scene, camera, player: P, time: 0, chunk: null, difficulty: 0,
    sfx: (n, ...a) => SND.play(n, ...a),
    shake: a => { P.shake = Math.min(1.5, P.shake + a); },
    feed: (t, hot) => HUD.feed(t, hot),
    flashLight(p) { const L = exLights[exIdx++ % 2]; L.position.copy(p); L.intensity = 5; },
    knock(dir, h, v) { P.vel.x += dir.x * h; P.vel.z += dir.z * h; P.vel.y = Math.max(P.vel.y, 0) + Math.max(0, dir.y) * h + v * 0.35; P.grounded = false; },
    hurt(amount, from, self) {
      if (P.dead || state !== 'play') return;
      const a = amount * (P.smoking ? 0.85 : 1) * (self ? 1 : 1);
      P.hp -= a; P.hurtFx = Math.min(1, P.hurtFx + 0.35 + a / 40); P.shake = Math.min(1.5, P.shake + 0.25);
      SND.play('hurt'); HUD.mood('ouch', 0.5);
      if (P.hp <= 0) die();
    },
    needs() {
      const a = P.ammo, opts = [
        ['health', P.hp < 100 ? (1 - P.hp / 100) * 1.8 + 0.15 : 0.08],
        ['bullets', 1 - a.bullets / MAX.bullets + 0.2],
        ['rockets', (1 - a.rockets / MAX.rockets) * 0.6 + 0.05],
      ];
      let sum = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * sum;
      for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
      return 'bullets';
    },
    collect(kind) {
      const a = P.ammo;
      if (kind === 'health') { if (P.hp >= 150) return false; P.hp = Math.min(150, P.hp + 12); }
      else { const amt = { bullets: 35, rockets: 2 }[kind]; if (a[kind] >= MAX[kind]) return false; a[kind] = Math.min(MAX[kind], a[kind] + amt); }
      SND.play('pickup');
      return true;
    },
    onKill,
  });

  // ================= AYARLAR (kalıcı) =================
  const settings = { sens: 1, fullscreen: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('sigaramolasi.settings') || '{}')); } catch (e) { /* yok */ }
  const saveSettings = () => { try { localStorage.setItem('sigaramolasi.settings', JSON.stringify(settings)); } catch (e) { /* yok */ } };
  function syncSettingsUI() {
    document.querySelectorAll('.sens').forEach(el => { el.value = settings.sens; });
    document.querySelectorAll('.sensVal').forEach(el => { el.textContent = settings.sens.toFixed(2); });
    document.querySelectorAll('.fs').forEach(el => { el.checked = settings.fullscreen; });
  }
  function setSens(v) { settings.sens = Math.round(Math.max(0.1, Math.min(4, v)) * 100) / 100; syncSettingsUI(); saveSettings(); }
  // panel tıklamaları oyunu başlatmasın / ateş sayılmasın
  document.querySelectorAll('.settings').forEach(el => ['click', 'mousedown', 'mouseup'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation())));
  document.querySelectorAll('.sens').forEach(el => el.addEventListener('input', () => setSens(+el.value)));
  document.querySelectorAll('.fs').forEach(el => el.addEventListener('change', () => {
    settings.fullscreen = el.checked; syncSettingsUI(); saveSettings();
    if (!el.checked && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }));
  syncSettingsUI();

  // ================= GİRDİ =================
  const keys = {};
  let mouseDown = false, mdx = 0, mdy = 0, locked = false;
  addEventListener('keydown', e => {
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (state !== 'play') return;
    if (e.code === 'Digit1') selectWeapon(0);
    if (e.code === 'Digit2') selectWeapon(1);
    if (e.code === 'Digit3') selectWeapon(2);
    if (e.code === 'KeyQ') selectWeapon(P.lastWeapon);
    if (e.code === 'KeyF') cigAction();
    if (e.code === 'KeyE') kick();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
    if (e.code === 'KeyM') HUD.feed(SND.toggleMusic() ? 'MÜZİK: AÇIK' : 'MÜZİK: KAPALI');
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { setSens(settings.sens + (e.code === 'BracketLeft' ? -0.1 : 0.1)); HUD.feed(`HASSASİYET ${settings.sens.toFixed(2)}`); }
    if (e.code === 'Space') { e.preventDefault(); if (P.office) slam(); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  let fireQueued = 0;   // hızlı tek tıklar kaybolmasın
  addEventListener('mousedown', e => { if (e.button === 0) { mouseDown = true; fireQueued = 0.25; } });
  addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  let ignoreMouse = 0;
  addEventListener('mousemove', e => {
    if (state !== 'play' || (!locked && !mouseDown)) return;   // kilit yoksa sürükleyerek bak
    if (ignoreMouse > 0) { ignoreMouse--; return; }            // kilit alındıktan hemen sonraki olaylar güvenilmez
    // Chrome pointer-lock hatası: tek olayda yüzlerce piksellik sahte sıçrama gelebiliyor -> at
    if (Math.abs(e.movementX) > 220 || Math.abs(e.movementY) > 220) return;
    mdx += e.movementX; mdy += e.movementY;
  });
  addEventListener('wheel', e => { if (state === 'play') selectWeapon((P.weapon + (e.deltaY > 0 ? 1 : 2)) % 3); }, { passive: true });
  addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (locked) { ignoreMouse = 3; mdx = mdy = 0; }
    if (!locked && state === 'play') { state = 'pause'; $('pause').classList.remove('hidden'); mouseDown = false; SND.muffle(0.8); }
  });
  // ham fare girdisi (OS ivmesi yok, daha az sıçrama); desteklenmezse normal kilit
  function pointerLock() {
    const plain = () => { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* desteklenmiyor */ } };
    try {
      const r = canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(plain); else if (!r) plain();
    } catch (e) { plain(); }
  }
  const lock = () => {
    if (settings.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
    pointerLock();
  };
  // tam ekrana geçiş kilidi bozduysa yeniden dene
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement && state === 'play' && !locked) pointerLock(); });

  $('legal').addEventListener('click', () => { $('legal').classList.add('hidden'); $('menu').classList.remove('hidden'); });   // önce yasal uyarı
  $('menu').addEventListener('click', () => { SND.init(); startGame(); lock(); });
  $('pause').addEventListener('click', () => { $('pause').classList.add('hidden'); state = 'play'; SND.muffle(0); mouseDown = false; fireQueued = 0; lock(); });
  $('dead').addEventListener('click', () => { if (P.deadT < 1.5) return; $('dead').classList.add('hidden'); startGame(); lock(); });

  // ================= OYUN KURULUMU =================
  function setupWorld() {
    E.clear(); FX.clear(); World.reset(); spawnQueue.length = 0;
    const c0 = World.build(0, 0); World.build(1, c0.z1);
    G.chunk = c0;
    const o = World.buildOffice();
    World.focus(o); applyTheme(o.theme, true);
    World.drawInbox(MAILS.slice(0, 5), 37, 0);
    return c0;
  }
  let runs = 0;
  function startGame() {
    setupWorld();
    Object.assign(P, {
      hp: 100, grounded: false, dash: 2, dashT: 0, weapon: 0, lastWeapon: 1, ammo: { bullets: 120, rockets: 6 },
      smoking: false, fireCD: 0, kills: 0, score: 0, combo: 0, comboT: 0, slowmo: 0, hurtFx: 0, flashFx: 0, shake: 0,
      dead: false, deadT: 0, killWindow: [], floor: 1, airT: 0, fovKick: 0,
      bedoT: 0, office: true, officeT: 0, officePhase: 'desk', stress: 0.15, slams: 0, mailT: 1.2, mailGap: runs++ === 0 ? 1.4 : 0.8,
      unread: 37, mails: MAILS.slice(0, 5), beatT: 0, prompted: false, seatDip: 0.42, turnT: 0, feedN: 0,
    });
    P.pos.copy(World.office.seat); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = -0.12;
    World.drawInbox(P.mails, P.unread, 0);
    mouseDown = false; fireQueued = 0;   // menü tıklaması ateş sayılmasın
    VM.reset(); VM.setOffice(true);
    HUD.clearFeed(); HUD.show(true); HUD.mood('normal', 0);
    $('menu').classList.add('hidden'); $('dead').classList.add('hidden'); $('pause').classList.add('hidden');
    state = 'play';
    SND.Music.set(0); SND.muffle(0);
    HUD.msg('17:59', "pazartesi · Bedirhan Abi'nin masası artık senin", 3, true);
  }

  // ================= OFİS → PORTAL =================
  const MAILS = [
    ["İK: Bedirhan Bey'in ayrılışı hk.", 0], ["Bedirhan Bey'in masası size verildi", 0],
    ['ACİL: Rapor nerede??', 1], ['RE: RE: RE: FW: toplantı', 0], ['Patron: Odama gel. Hemen.', 1], ['Cumartesi mesaisi hk.', 1],
    ["Excel'de makro bozuldu", 0], ['Bu mail yanlışlıkla gitti', 0], ['Hatırlatma: rapor', 0], ['Hatırlatma: hatırlatma', 0],
    ['Müşteri: Neden cevap yok?', 1], ['İK: Mutluluk anketi', 0], ["Toplantı 18:00'e alındı", 1], ['son_son_v7_GERCEKSON.pptx', 0],
    ['Herkese Yanıtla: teşekkürler', 0], ['Kahve makinesi yine bozuk', 0], ['ACİL ACİL ACİL', 1], ['Bugün içinde lütfen :)', 1],
    ['Prim bu yıl da yok', 0], ['Hafta sonu ulaşılabilir ol', 1], ['Sunuma bir daha bakalım', 0], ['Müşteri tekrar aradı', 1],
  ].map(([s, u]) => ({ s, urgent: !!u }));

  function officeTick(dt) {
    const o = World.office;
    P.officeT += dt;
    if (P.officePhase === 'drawer' || P.officePhase === 'flick') {
      // çekmece fırladı: kamera zippoya kayar, F ile çakılır
      P.pos.copy(o.seat); P.vel.set(0, 0, 0);
      if (P.lookT > 0) { P.lookT -= dt; const e = 1 - Math.exp(-dt * 6); P.yaw += (P.lookYaw - P.yaw) * e; P.pitch += (P.lookPitch - P.pitch) * e; }
      if (P.officePhase === 'drawer' && P.officeT - P.drawerT > 15) lightWithZippo();   // takılan oyuncu için
      HUD.mood('stress', 0.3);
      return;
    }
    if (P.officePhase === 'desk') {
      // masa başı: mail yağmuru, stres, kalp atışı. Kaçış: klavyeye vur.
      P.pos.copy(o.seat); P.vel.set(0, 0, 0);
      P.yaw = Math.max(-1.3, Math.min(1.3, P.yaw));
      if (Math.random() < dt * 9) SND.play('typing');
      if (Math.random() < dt * 0.18) SND.play('phone');
      P.mailT -= dt;
      if (P.mailT <= 0) { newMail(); P.mailGap = Math.max(0.22, P.mailGap * 0.86); P.mailT = P.mailGap * (0.6 + Math.random() * 0.8); }
      P.stress = Math.min(1, P.stress + dt * 0.03);
      P.beatT -= dt;
      if (P.beatT <= 0) { SND.play('heartbeat', P.stress); P.beatT = 1.05 - P.stress * 0.6; P.shake = Math.min(1.5, P.shake + P.stress * 0.12); }
      HUD.mood('stress', 0.3);
      if (!P.prompted && P.officeT > 3) { P.prompted = true; HUD.msg('KLAVYEYE VUR', 'sol tık / space', 60, true); }
      if (P.officeT > 25) openDrawerNow();   // takılan oyuncu için
      return;
    }
    // portal açıldı: ayağa kalk, kafanı portala çevir, geç
    P.seatDip = Math.max(0, P.seatDip - dt * 0.9);
    if (P.turnT > 0) { P.turnT -= dt; P.yaw += (-1.3 - P.yaw) * Math.min(1, dt * 5); }
    if (Math.random() < dt * 5) SND.play('buzz');
    const pp = o.portal.position;
    for (let i = 0; i < 3; i++) {   // portala çekilen kıvılcımlar
      const a = Math.random() * Math.PI * 2, r = 1.0 + Math.random() * 0.5;
      FX.glowDot(V3(pp.x - 0.15, pp.y + Math.sin(a) * r * 1.35 * o.open, pp.z + Math.cos(a) * r * o.open), [1, 0.4 + Math.random() * 0.3, 0.05], 0.06, 0.3);
    }
    if (o.open > 0.7 && P.pos.x > pp.x - 0.45 && Math.abs(P.pos.z - pp.z) < 1.15) enterPortal();
  }
  function newMail(special) {
    const m = special ? { s: special, urgent: true } : MAILS[2 + Math.floor(Math.random() * (MAILS.length - 2))];
    P.unread++; P.mails.unshift(m); P.mails.length = Math.min(P.mails.length, 8);
    World.drawInbox(P.mails, P.unread, P.stress);
    SND.play('ding', P.unread - 37);
    P.stress = Math.min(1, P.stress + 0.045);
    if (P.feedN++ < 6 || special) HUD.feed('✉ ' + m.s, m.urgent);
  }
  function slam() { if (P.office && P.officePhase === 'desk') VM.slam(); }
  VM.on('slam', () => {
    if (!P.office || P.officePhase !== 'desk') return;
    const o = World.office;
    P.slams++;
    SND.play('slam'); P.shake = Math.min(1.5, P.shake + 0.9); P.fovKick -= 6; post.uniforms.kick.value = 1.2;
    K.pv -= 1.5; K.rv += (Math.random() - 0.5) * 3;
    World.slamDesk(P.slams >= 3);
    FX.debris(V3(o.keyboard.x, o.keyboard.y + 0.05, o.keyboard.z), 16);
    HUD.msg(['ARGH!', 'BIKTIM!!', 'YETER!!!'][Math.min(2, P.slams - 1)], P.slams < 3 ? 'bir daha!' : '', 1.2, true);
    P.stress = Math.min(1, P.stress + 0.1);
    if (P.slams === 1) setTimeout(() => { if (P.office) newMail('Yan masa: biraz sessiz?'); }, 500);
    if (P.slams === 2) setTimeout(() => { if (P.office) newMail("Güvenlik: Bedirhan Bey'in çekmecesini AÇMAYIN"); }, 400);
    if (P.slams >= 3) openDrawerNow();
  });
  // 3. yumrukta çekmece fırlar: içinde Bedirhan Abi'nin pentagramlı zipposu
  function openDrawerNow() {
    if (P.officePhase !== 'desk') return;
    const o = World.office;
    P.officePhase = 'drawer'; P.drawerT = P.officeT;
    World.openDrawer(); SND.play('kick');
    const eye = V3(o.seat.x, C.eye - P.seatDip, o.seat.z), d = o.drawerPos.clone().sub(eye);
    P.lookYaw = Math.atan2(-d.x, -d.z); P.lookPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); P.lookT = 1.4;
    HUD.msg("BEDİRHAN ABİ'NİN ZİPPOSU", 'F / sol tık — bir tane yak', 60, true);
    // bu çağrı portaldan geçene kadar ekranda kalır
    setTimeout(() => { if (P.office) { HUD.dm('Bak çekmecede ne var... Yak bir tane kardeşim. Mola zamanı.', Infinity); SND.play('phone'); setTimeout(() => SND.play('talk'), 350); } }, 900);
  }
  // zippoyu al, ofiste (yasağa rağmen) ilk sigarayı yak; portal ilk nefeste açılır ('lit' olayı)
  function lightWithZippo() {
    if (P.officePhase !== 'drawer' || !VM.lightCig()) return;
    P.officePhase = 'flick'; World.takeZippo();
    HUD.msg('', '', 0.05);
  }
  function openPortalBeside() {
    if (!P.office || P.officePhase === 'portal') return;
    P.officePhase = 'portal'; P.turnT = 0.9; P.stress = 0;
    World.openPortal(); SND.play('portalOpen');
    fogTarget.setHex(0x2a0806); P.shake = Math.min(1.5, P.shake + 1);
    HUD.mood('grin', 1.5);
    HUD.msg('KAPIDAN GİR', 'yanında bir portal açıldı · kalk ve geç', Infinity);   // portaldan geçene kadar ortada kalır
    HUD.feed('ŞEYTANLAR ARIYOR...', true);
  }
  function enterPortal() {
    P.office = false; P.seatDip = 0; HUD.mood('normal', 0); HUD.dmHide(); bedoIdle = 10;   // önce 'hoş geldin' gelsin
    World.removeOffice();
    const c0 = World.chunks[0]; G.chunk = c0; World.focus(c0); applyTheme(c0.theme, true);
    P.pos.set(0, 0, -2.5); P.vel.set(0, 2, -8); P.yaw = 0; P.pitch = 0;
    post.uniforms.flash.value = 1.3; P.fovKick = 35; P.shake = 1;
    SND.play('portalEnter'); SND.Music.set(1);
    VM.setOffice(false);
    FX.teleport(V3(0, 0, -4));
    HUD.msg('SİGARA MOLASI', '5 dakikan var · şeytanlar bekliyor', 3);
    setTimeout(() => { if (state === 'play' && !P.office) bedo('Hoş geldin kardeşim. Burda kimse karışmaz.', true); }, 3200);
    // ilk sigara şirketten
    setTimeout(() => { if (state === 'play' && !P.dead && !P.office && VM.cigState === 'none') VM.lightCig(); }, 900);
  }

  let fogTarget = new THREE.Color(0x07090c);
  function applyTheme(theme, instant) {
    fogTarget.setHex(theme.fog);
    if (instant) { scene.fog.color.copy(fogTarget); }
    VM.setAmbient({ ates: 0x704030, kemik: 0x6a6450, et: 0x703038, office: 0x8a8a90 }[theme.name]);
    const office = theme.name === 'office';
    scene.fog.near = office ? 8 : 16; scene.fog.far = office ? 40 : 88;
  }

  // ================= HAREKET (Quake) =================
  const wish = V3();
  function physics(dt) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    wish.set(-sy * f + cy * s, 0, -cy * f - sy * s);
    const wl = wish.length(); if (wl > 0) wish.divideScalar(wl);
    const wishSpeed = wl > 0 ? C.maxSpeed : 0;

    let jumped = false;
    if (P.grounded && keys.Space) {
      P.vel.y = C.jump; P.grounded = false; jumped = true; SND.play('jump');
      // zıplama karesi CS gibi: sürtünme yok. Sadece koşu hızının altındaysan (duruştan kalkış) anında koşu hızına çık;
      // hız asla mevcut hızın / koşu hızının üstüne çıkmaz (A/D'yle yana sahte hız sıçraması yok)
      const before = Math.hypot(P.vel.x, P.vel.z);
      if (before < C.maxSpeed) {
        accelerate(wishSpeed, 1e4, wishSpeed, dt);
        const after = Math.hypot(P.vel.x, P.vel.z), lim = Math.max(before, C.maxSpeed);
        if (after > lim) { P.vel.x *= lim / after; P.vel.z *= lim / after; }
      }
    }
    if (P.grounded && !jumped) {
      const sp = Math.hypot(P.vel.x, P.vel.z);
      if (sp > 0.001) {
        const drop = Math.max(sp, C.stopSpeed) * C.friction * dt, ns = Math.max(0, sp - drop) / sp;
        P.vel.x *= ns; P.vel.z *= ns;
      }
      accelerate(wishSpeed, C.accel, wishSpeed, dt);
    } else {
      accelerate(Math.min(wishSpeed, C.airCap), C.airAccel, wishSpeed, dt);
      const hs = Math.hypot(P.vel.x, P.vel.z);
      if (hs > C.maxAirSpeed) { P.vel.x *= C.maxAirSpeed / hs; P.vel.z *= C.maxAirSpeed / hs; }
    }
    P.vel.y -= C.gravity * dt;

    const step = P.grounded ? 0.5 : 0;
    if (World.moveAxis(P.pos, C.radius, C.height, 'x', P.vel.x * dt, step)) P.vel.x = 0;
    if (World.moveAxis(P.pos, C.radius, C.height, 'z', P.vel.z * dt, step)) P.vel.z = 0;
    const vy = P.vel.y;
    const hy = World.moveAxis(P.pos, C.radius, C.height, 'y', P.vel.y * dt, 0);
    if (hy) {
      if (vy < 0) {
        if (!P.grounded && vy < -6) { P.landed = -vy; SND.play('land'); P.landDip = Math.min(0.25, -vy * 0.012); }
        P.grounded = true;
      }
      P.vel.y = 0;
    } else P.grounded = false;
  }
  function accelerate(ws, accel, fullWish, dt) {
    if (ws <= 0) return;
    const cur = P.vel.x * wish.x + P.vel.z * wish.z;
    const add = ws - cur; if (add <= 0) return;
    const acc = Math.min(accel * fullWish * dt, add);
    P.vel.x += wish.x * acc; P.vel.z += wish.z * acc;
  }

  function dash() {
    if (P.dash < 1 || P.dead) return;
    P.dash--; if (P.dashT <= 0) P.dashT = C.dashRecharge;
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    const d = V3(-sy * f + cy * s, 0, -cy * f - sy * s);
    if (d.lengthSq() < 0.01) d.set(-sy, 0, -cy);
    d.normalize();
    const hs = Math.hypot(P.vel.x, P.vel.z);
    const ns = Math.max(hs + 5, C.dashSpeed);
    P.vel.x = d.x * ns; P.vel.z = d.z * ns;
    if (!P.grounded) P.vel.y = Math.max(P.vel.y, 2);
    P.fovKick = 12; SND.play('dash');
    for (let i = 0; i < 10; i++) FX.smoke(V3(P.pos.x, P.pos.y + 0.2, P.pos.z), 1, { size: 0.3, life: 0.6, color: [0.6, 0.85, 1], a: 0.3, grow: 1.5 });
  }

  // ================= SİLAHLAR =================
  function selectWeapon(i) {
    if (P.office) return;
    if (i === P.weapon && !VM.switching) return;
    if (VM.select(i)) { P.lastWeapon = P.weapon; P.weapon = i; P.fireCD = Math.max(P.fireCD, 0.28); }
  }
  const fwd = V3(), right = V3(), up = V3();
  function camBasis() {
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd).normalize();
  }
  function fire() {
    if (P.office) {   // ofiste: klavyeye yumruk / çekmecedeki zippoyu al
      if (P.officePhase === 'drawer') lightWithZippo(); else slam();
      P.fireCD = 0.3; return;
    }
    const w = WEP[P.weapon];
    if (w.ammo && P.ammo[w.ammo] < 1) {
      SND.play('empty'); P.fireCD = 0.3;
      const alt = [0, 1, 2].find(i => !WEP[i].ammo || P.ammo[WEP[i].ammo] > 0);
      if (alt !== undefined) selectWeapon(alt);
      return;
    }
    if (w.ammo) P.ammo[w.ammo]--;   // çifte sınırsız
    P.fireCD = w.rate;
    VM.fire(P.weapon, w.rate);
    SND.play(w.id === 'rocket' ? 'rocket' : w.id);
    P.shake = Math.min(1.5, P.shake + w.shake);
    camBasis();
    const k = w.kick;
    K.pv += k.p * (0.85 + Math.random() * 0.3); K.yv += (Math.random() - 0.5) * 2 * k.y;
    K.rv += (Math.random() < 0.5 ? -1 : 1) * k.r; K.bv += k.b;
    P.fovKick += k.fov;
    post.uniforms.kick.value = Math.min(1.5, post.uniforms.kick.value + k.ca);
    post.uniforms.flash.value = Math.max(post.uniforms.flash.value, k.flash);
    P.vel.addScaledVector(fwd, -k.push * (P.grounded ? 0.6 : 1));   // tepme oyuncuyu da iter (yere sıkınca havalanırsın)
    muzzleLight.position.copy(camera.position).addScaledVector(fwd, 1.2); muzzleLight.intensity = w.id === 'chaingun' ? 2.2 : 4;
    const origin = camera.position.clone();
    if (w.rocket) {
      const o = origin.clone().addScaledVector(fwd, 0.5).addScaledVector(right, 0.18).addScaledVector(up, -0.12);
      E.fireRocket(o, fwd);
      return;
    }
    const hits = new Map();
    for (let i = 0; i < w.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * w.spread;
      const d = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const wall = World.raycast(origin, d, 150);
      const maxT = wall ? wall.t : 150;
      const eh = E.rayEnemies(origin, d, maxT);
      if (eh) {
        let dmg = w.dmg * (eh.head ? 2 : 1);
        if (w.id === 'shotgun' && eh.t > 10) dmg *= Math.max(0.35, 1 - (eh.t - 10) / 25);
        const h = hits.get(eh.e) || { dmg: 0, n: 0, head: false, pt: null };
        h.dmg += dmg; h.n++; h.head = h.head || eh.head; h.pt = origin.clone().addScaledVector(d, eh.t);
        hits.set(eh.e, h);
        FX.blood(h.pt, d, w.id === 'shotgun' ? 3 : 5, 2);
      } else if (wall) {
        const p = origin.clone().addScaledVector(d, wall.t).addScaledVector(wall.normal, 0.02);
        FX.sparks(p, w.id === 'shotgun' ? 2 : 4);
        if (wall.solid.barrel) E.barrelHit(wall.solid.barrel, w.dmg, w.id);
      }
    }
    let anyKill = false, anyHead = false;
    for (const [e, h] of hits) {
      const killed = E.damage(e, h.dmg, { src: w.id, dir: fwd.clone(), knock: w.knock * h.n, head: h.head });
      anyKill = anyKill || killed; anyHead = anyHead || h.head;
    }
    if (hits.size) { HUD.hit(anyKill); SND.play(anyHead ? 'headshot' : 'hit'); }
  }

  function kick() {
    if (P.dead || !VM.kick()) return;
    SND.play('kick');
  }
  VM.on('kickHit', () => {
    camBasis();
    let hit = false;
    for (const e of E.list) {
      if (e.dead) continue;
      const to = V3(e.pos.x - P.pos.x, (e.pos.y + e.h * 0.5) - (P.pos.y + 1), e.pos.z - P.pos.z);
      const d = to.length();
      if (d > 2.6 + e.r) continue;
      if (to.normalize().dot(fwd) < 0.45) continue;
      const dir = fwd.clone(); dir.y = Math.max(0.35, dir.y);
      E.damage(e, 35, { src: 'kick', dir, knock: 18 });
      hit = true;
    }
    if (hit) { SND.play('kickHit'); P.shake += 0.4; HUD.hit(false); hitstop = 0.06; }
  });

  // ================= SİGARA =================
  function cigAction() {
    if (P.dead) return;
    if (P.office) {
      if (P.officePhase === 'drawer') { lightWithZippo(); return; }
      if (VM.cigState === 'none') { HUD.feed('OFİSTE SİGARA İÇİLMEZ!', true); HUD.mood('ouch', 0.8); SND.play('empty'); return; }
    }
    if (VM.cigState === 'none') {
      VM.lightCig();   // sigara sınırsız
    } else if (VM.cigState === 'lit') VM.throwCig();
  }
  function cigTipWorld() {
    const v = VM.tipView(); const dist = v.length();
    v.project(VM.camera);
    const dir = V3(v.x, v.y, 0.5).unproject(camera).sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(dir, dist);
  }
  function mouthWorld() { camBasis(); return camera.position.clone().addScaledVector(fwd, 0.25).addScaledVector(up, -0.12); }
  function puff(n, strength) {
    const m = mouthWorld();
    for (let i = 0; i < n; i++) {
      const v = fwd.clone().multiplyScalar(strength * (0.6 + Math.random() * 0.6)).add(P.vel.clone().multiplyScalar(0.6));
      v.x += (Math.random() - 0.5) * 0.6; v.z += (Math.random() - 0.5) * 0.6; v.y += 0.1;
      FX.smoke(m, 1, { size: 0.05, life: 2.2, color: [0.62, 0.62, 0.65], vel: v, a: 0.14, grow: 0.4 });
    }
  }
  VM.on('zippoOpen', () => SND.play('zippoOpen'));
  VM.on('zippoStrike', () => { SND.play('zippoStrike'); post.uniforms.flash.value = 0.08; });
  VM.on('inhale', () => SND.play('inhale'));
  VM.on('zippoClose', () => SND.play('zippoClose'));
  VM.on('lit', () => {
    P.smoking = true;
    if (P.office) { HUD.mood('grin', 1.5); openPortalBeside(); return; }   // ilk nefes: portal açılır
    if (E.aliveCount() > 0) { P.slowmo = 3.5; SND.play('slowIn'); HUD.feed('SOĞUKKANLI', true); bedo(line(BEDO.slow)); }
    else HUD.feed('SİGARA MOLASI');
    HUD.mood('grin', 1);
  });
  VM.on('exhale', () => { SND.play('exhale'); puff(26, 2.2); });
  VM.on('drag', () => { SND.play('inhale'); setTimeout(() => { if (P.smoking && !P.dead) { SND.play('exhale'); puff(14, 1.6); } }, 1200); });
  VM.on('burnout', () => { P.smoking = false; HUD.feed('İZMARİT'); });
  VM.on('release', burn => {
    P.smoking = false; SND.play('flick');
    camBasis();
    const o = camera.position.clone().addScaledVector(fwd, 0.4).addScaledVector(up, -0.1);
    E.throwCig(o, fwd.clone().multiplyScalar(17).add(V3(0, 3, 0)).addScaledVector(P.vel, 0.5));
    void burn;
  });

  // ================= BEDİRHAN ABİ (solda, sürekli muhabbet) =================
  const BEDO = {
    desk: ['Boşver mailleri kardeşim.', 'Rapor yarın da yazılır kardeşim, kafana takma.', 'Derin nefes al kardeşim. Abin burda.',
      '"Acil" yazan mail acil değildir kardeşim, ezberle bunu.', 'Klavyeye bi vur kardeşim, rahatlarsın. Ciddiyim.',
      'Bu masa seni yutmasın kardeşim. Ben yutuldum, biliyorum.', 'O mailler bitmez kardeşim. Sen bitmeden kalk.',
      'Patron sana değil kardeşim, korkusuna bağırıyor.', 'Prim yok, zam yok, izin yok kardeşim. Ama bir çıkış var.',
      'Ben de o sandalyede oturdum kardeşim. Sonra uyandım.', 'Bu şirket kimseyi beklemez kardeşim. Sen de onu bekleme.',
      'Gözlerin kızarmış kardeşim. Ekrandan mı, öfkeden mi?'],
    hell: ['Burda kimse rapor istemiyor kardeşim. Tadını çıkar.', 'Zıpla kardeşim, sağ sol yap, uç.', 'Mesai bitmeden döneriz kardeşim, merak etme.',
      'Rahat ol kardeşim, mola uzun.', 'Yavaşlama kardeşim, hız senin silahın.', 'Hepsini yak kardeşim. Kül bile kalmasın.',
      'Merhamet yok kardeşim. Onlar da göstermezdi.', 'Burası artık bizim mekan kardeşim.', 'Durma kardeşim. Duran yem olur.',
      'Patrondan beter olamazlar kardeşim. Bunlar ısınma turu.', 'Yerle bir et kardeşim. Abin arkanda.',
      'Ateşe gir, ateşten çık kardeşim. Bizim işimiz bu.', 'Sakin ol kardeşim. Nişan al, sık, yürü.',
      'Cehennem dediğin ne ki kardeşim? Pazartesi toplantısına gir bi.', 'Ben burda yıllarımı geçirdim kardeşim. Sen bir molada fethediyorsun.'],
    noSmoke: ['Elin boş duruyor kardeşim, yak bi tane.', "F'ye bas kardeşim, keyfin gelsin.", 'Zippoyu cebinde paslandırma kardeşim, ateşle.'],
    low: ['Yak bi tane kardeşim, can gelsin.', 'Kan kaybediyorsun kardeşim, bi nefes çek. F.', "Abin burada kardeşim. F'ye bas, toparlan.",
      'Kalk ayağa kardeşim. Ölmek yok, daha işimiz var.', 'Kanını silme kardeşim, bırak görsünler.', 'Bi mola ver kardeşim, onlar bekler.'],
    combo: ['Helal be kardeşim!', 'İşte bu kardeşim. Abisinin aslanı.', 'Temiz iş kardeşim. Çok temiz.', 'Böyle bir mesai görmedim kardeşim.',
      'Bunu kimse unutmaz kardeşim.'],
    clear: ['Temiz iş kardeşim. Bi tane yak, devam.', 'Kapı açıldı kardeşim, yürü.', 'Bunu da hallettik kardeşim. Sıradaki.',
      'Hiçbiri kalmadı kardeşim. Tıpkı primimiz gibi.'],
    slow: ['Soğukkanlı ol kardeşim... nişan al...', 'Zaman dursun kardeşim, sen yak.', 'Yavaş kardeşim... şimdi.'],
    gib: ['Paramparça kardeşim. Mesaj alındı.', 'Bu da istifa etti kardeşim. Kalıcı olarak.', 'Arkasında tek parça bırakma kardeşim.'],
  };
  let bedoNext = 0, bedoIdle = 4, noSmokeT = 0;
  const line = arr => arr[Math.floor(Math.random() * arr.length)];
  function bedo(text, force) {   // force: sırayı beklemez (can uyarısı, hikâye anları)
    if (!force && time < bedoNext) return false;
    HUD.dm(text, Math.max(3.5, text.length * 0.09 + 2)); SND.play('phone'); setTimeout(() => SND.play('talk'), 350);
    bedoNext = time + 5;
    bedoIdle = P.office ? 5 + Math.random() * 2 : 8 + Math.random() * 5;   // sık sık arar
    return true;
  }
  function bedoTick(dt) {
    bedoIdle -= dt; P.bedoT -= dt;
    if (P.office) { if (P.officePhase === 'desk' && P.officeT > 2.5 && bedoIdle <= 0) bedo(line(BEDO.desk)); return; }
    noSmokeT = P.smoking || VM.cigState !== 'none' ? 0 : noSmokeT + dt;
    if (P.hp < 35 && !P.smoking && VM.cigState === 'none' && P.bedoT <= 0) { P.bedoT = 20; bedo(line(BEDO.low), true); return; }
    if (noSmokeT > 12) { noSmokeT = 0; bedo(line(BEDO.noSmoke)); return; }
    if (bedoIdle <= 0) bedo(line(BEDO.hell));
  }

  // ================= LEŞ / KOMBO =================
  function onKill(e, info) {
    P.kills++;
    P.combo++; P.comboT = 3.5;
    const mult = 1 + Math.min(4, Math.floor(P.combo / 4));
    let pts = e.T.score;
    const tags = [];
    const hs = Math.hypot(P.vel.x, P.vel.z);
    if (!P.grounded && P.airT > 0.15) tags.push(['HAVADA', 50]);
    if (hs > 15) tags.push(['HIZ ŞEYTANI', 75]);
    if (info.head) tags.push(['KAFADAN', 25]);
    if (info.gib) { tags.push(['PARAMPARÇA', 40]); if (Math.random() < 0.25) bedo(line(BEDO.gib)); }
    if (info.src === 'kick') tags.push(['TEKME', 60]);
    if (info.src === 'cig') tags.push(['İZMARİT İNFAZI', 300, true]);
    if (info.src === 'barrel') tags.push(['VARİL', 80]);
    if (info.src === 'lava') tags.push(['LAVA GÖMÜLDÜ', 100]);
    if (P.smoking) tags.push(['SİGARA MOLASI', 30]);
    if (P.slowmo > 0) tags.push(['SOĞUKKANLI', 30]);
    P.killWindow = P.killWindow.filter(t => time - t < 0.3); P.killWindow.push(time);
    if (P.killWindow.length === 2) tags.push(['ÇİFTE LEŞ', 100]);
    if (P.killWindow.length >= 3) tags.push(['KATLİAM', 250, true]);
    for (const t of tags) pts += t[1];
    pts *= mult;
    P.score += Math.round(pts);
    HUD.feed(`${e.T.name} +${Math.round(pts)}`);
    tags.slice(0, 3).forEach(t => HUD.feed(t[0], t[2]));
    HUD.hit(true); HUD.mood('grin', 0.7);
    if (P.combo === 6 || P.combo === 12 || P.combo === 20) bedo(line(BEDO.combo));
    SND.play('combo', P.combo);
    if (info.src === 'shotgun' || info.gib) hitstop = Math.max(hitstop, 0.045);
    P.shake = Math.min(1.5, P.shake + 0.12);
    // leş başına küçük can (akış devam etsin)
    if (info.src === 'kick' || info.gib) P.hp = Math.min(Math.max(P.hp, 100), P.hp + 5);
  }

  function die() {
    P.dead = true; P.deadT = 0; P.hp = 0; state = 'dead';
    SND.Music.set(0); SND.muffle(0.7); SND.play('die', 0.6);
    HUD.mood('dead', 99);
    if (P.score > best) { best = P.score; try { localStorage.setItem('sigaramolasi.best', String(best)); } catch (e) { /* yok */ } }
    setTimeout(() => {
      if (document.pointerLockElement) document.exitPointerLock();
      $('deadStats').innerHTML = `KAT <span>${P.floor}</span> · LEŞ <span>${P.kills}</span><br>SKOR <span>${P.score}</span> · EN İYİ <span>${best}</span>`;
      $('dead').classList.remove('hidden'); showBest();
    }, 1300);
  }

  // ================= ARENA AKIŞI =================
  const spawnQueue = [];
  function waveFor(c, wave) {
    const d = c.index;
    const n = Math.min(18, 4 + Math.floor(d * 1.4) + wave * 2);
    const pool = [['grunt', 4], ['runner', 3]];
    if (d >= 1) pool.push(['skull', 2]);
    if (d >= 2) pool.push(['brute', 0.6 + d * 0.12]);
    const out = [];
    let brutes = 0;
    for (let i = 0; i < n; i++) {
      let sum = pool.reduce((s, p) => s + p[1], 0), r = Math.random() * sum, t = 'grunt';
      for (const p of pool) { r -= p[1]; if (r <= 0) { t = p[0]; break; } }
      if (t === 'brute' && ++brutes > 1 + Math.floor(d / 4)) t = 'grunt';
      out.push(t);
    }
    return out;
  }
  function spawnWave(c) {
    const types = waveFor(c, c.wave);
    const pts = c.spawns.filter(p => Math.hypot(p.x - P.pos.x, p.z - P.pos.z) > 9).sort(() => Math.random() - 0.5);
    types.forEach((t, i) => spawnQueue.push({ t, p: pts[i % Math.max(1, pts.length)] || c.spawns[0], delay: i * 0.18 }));
    c.wave++;
    HUD.msg(c.wave === 1 ? 'ARENA KİLİTLENDİ' : `DALGA ${c.wave}/${c.waves}`, c.wave === 1 ? `kat ${c.index + 1}` : '', 1.6);
    SND.play('alarm');
  }
  function arena(dt) {
    const c = World.chunkAt(P.pos.z);
    if (!c) return;
    if (c !== G.chunk) { G.chunk = c; World.focus(c); applyTheme(c.theme); }
    G.difficulty = c.index;
    if (c.state === 'idle' && P.pos.z < c.rz0 - 2.5) {
      c.state = 'fight'; c.entryDoor.target = 0; SND.play('door');
      c.waves = Math.min(4, 2 + Math.floor(c.index / 3)); c.wave = 0; c.waveDelay = 0.4;
      SND.Music.set(2); P.floor = c.index + 1;
      if (!World.chunks.find(k => k.index === c.index + 1)) World.build(c.index + 1, c.z1);
    }
    if (c.state === 'fight') {
      // eski parçaları kapı kapanınca sil
      if (c.entryDoor.open === 0) for (const k of [...World.chunks]) if (k.index < c.index) World.removeChunk(k);
      const alive = E.aliveCount() + spawnQueue.length;
      if (c.wave < c.waves && alive <= (c.wave === 0 ? 0 : 3)) {
        c.waveDelay -= dt;
        if (c.waveDelay <= 0) { spawnWave(c); c.waveDelay = 1.2; }
      } else if (c.wave >= c.waves && alive === 0) {
        c.state = 'clear'; c.exitDoor.target = 1; c.exitLamp.material.color.setHex(0x20ff40);
        SND.play('door'); SND.Music.set(1);
        const bonus = 500 * (c.index + 1); P.score += bonus;
        HUD.msg('KAPI AÇILDI', `ilerle · +${bonus}`, 2.5);
        setTimeout(() => bedo(line(BEDO.clear)), 1500);
        for (let i = 0; i < 3; i++) E.drop(G.needs(), V3(P.pos.x, P.pos.y + 2, P.pos.z));
      }
    }
    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      const s = spawnQueue[i]; s.delay -= dt;
      if (s.delay <= 0) { E.spawn(s.t, s.p); spawnQueue.splice(i, 1); }
    }
    // lav
    if (P.grounded && P.pos.y < 0.1) for (const l of c.lavas) {
      if (P.pos.x > l.x0 && P.pos.x < l.x1 && P.pos.z > l.z0 && P.pos.z < l.z1) {
        P.hp -= 30 * dt; P.hurtFx = Math.min(1, P.hurtFx + dt * 2); if (Math.random() < 0.2) FX.fire(P.pos, 1, 0.4);
        if (P.hp <= 0) die();
      }
    }
    if (P.pos.y < -15) { P.pos.set(0, 0.5, c.rz0 - 3); P.vel.set(0, 0, 0); G.hurt(15, P.pos); }
  }

  // ekranda sürekli duran, duruma göre değişen tuş yönergeleri
  function keyHints(atDesk, atDrawer) {
    if (atDesk) return [['SOL_TIK SPACE', 'KLAVYEYE VUR', 'hot'], ['FARE', 'ETRAFA BAK']];
    if (atDrawer) return [['F SOL_TIK', P.officePhase === 'drawer' ? 'ZİPPOYU AL, YAK' : 'YAKIYORSUN...', P.officePhase === 'drawer' ? 'hot' : ''], ['FARE', 'ETRAFA BAK']];
    if (P.office) return [['W', 'KAPIDAN GİR', 'hot'], ['W A S D', 'YÜRÜ']];
    const cs = VM.cigState;
    return [
      ['SPACE', 'BAS TUT: BUNNYHOP'],
      ['A D', 'HAVADA + FARE: HIZLAN'],
      ['SHIFT', 'ATIL', P.dash < 1 ? 'off' : ''],
      ['E', 'TEKME'],
      ['F', cs === 'lit' ? 'İZMARİTİ AT' : cs === 'none' ? 'SİGARA YAK' : 'YAKIYORSUN...', cs === 'none' && P.hp < 50 ? 'hot' : cs === 'none' || cs === 'lit' ? '' : 'off'],
      ['1 2 3', 'SİLAH DEĞİŞTİR'],
    ];
  }

  // ================= DÖNGÜ =================
  let last = performance.now(), menuT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'play' || state === 'dead') update(rdt);
    else if (state === 'menu') menuCam(rdt);
    render(rdt);
  }

  function menuCam(dt) {
    menuT += dt;
    // menü arkası: boş ofis, mesai bitmek üzere
    camera.position.set(World.OX + Math.sin(menuT * 0.15) * 2.5, 1.65, -2 + Math.cos(menuT * 0.1) * 0.8);
    camera.rotation.set(-0.06, Math.sin(menuT * 0.2) * 0.5, 0);
    World.update(dt); World.officeUpdate(dt, camera.position); FX.update(dt);
  }

  function update(rdt) {
    time += rdt; G.time = time;
    // zaman ölçeği: ağır çekim + vuruş durması
    let ts = 1;
    if (P.slowmo > 0) { P.slowmo -= rdt; ts = 0.32; if (P.slowmo <= 0) { HUD.feed('NORMAL HIZ'); } }
    if (hitstop > 0) { hitstop -= rdt; ts = Math.min(ts, 0.06); }
    worldScale += (ts - worldScale) * Math.min(1, rdt * 20);
    const wdt = rdt * worldScale;
    SND.muffle(P.slowmo > 0 ? 0.55 : 0);

    if (!P.dead) {
      // bakış
      P.yaw -= mdx * C.sens * settings.sens; P.pitch -= mdy * C.sens * settings.sens;
      P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch));
      // fizik (alt adımlar: yüksek hızda duvar delmesin)
      const pdt = rdt * (P.slowmo > 0 ? 0.8 : 1);
      const n = Math.ceil(pdt / (1 / 125));
      const wasGround = P.grounded; P.landed = 0;
      if (!(P.office && P.officePhase !== 'portal')) for (let i = 0; i < n; i++) physics(pdt / n);
      if (!P.grounded) P.airT += rdt; else P.airT = 0;
      void wasGround;
      // dash şarjı
      if (P.dash < C.dashMax) { P.dashT -= rdt; if (P.dashT <= 0) { P.dash++; P.dashT = P.dash < C.dashMax ? C.dashRecharge : 0; } }
      // ateş
      P.fireCD -= rdt;
      fireQueued -= rdt;
      if ((mouseDown || fireQueued > 0) && P.fireCD <= 0 && !VM.switching) { fireQueued = 0; fire(); }
      // sigara
      if (P.smoking) {
        P.hp = Math.min(Math.max(P.hp, 100), P.hp + 3 * rdt);
        if (Math.random() < rdt * 22) FX.wisp(cigTipWorld(), P.vel.clone().multiplyScalar(0.05));
        cigLight.position.copy(camera.position); cigLight.intensity = 0.6 + Math.random() * 0.15;
      } else cigLight.intensity = VM.cigState === 'lighting' ? 1.2 + Math.random() * 0.4 : 0;
      if (P.hp > 100) P.hp = Math.max(100, P.hp - rdt * 1.5);   // fazla can yavaşça erir
      bedoTick(rdt);
      // kombo
      if (P.comboT > 0) { P.comboT -= rdt; if (P.comboT <= 0) P.combo = 0; }
      if (P.office) officeTick(rdt); else arena(wdt);
    } else {
      P.deadT += rdt;
    }

    E.update(wdt); FX.update(wdt); World.update(wdt); World.officeUpdate(rdt, P.pos);
    scene.fog.color.lerp(fogTarget, Math.min(1, rdt * 2));
    renderer.setClearColor(scene.fog.color);

    // kamera
    const hs = Math.hypot(P.vel.x, P.vel.z);
    if (P.grounded && hs > 1) P.bobT += rdt * (7 + hs * 0.5);
    P.landDip += -P.landDip * Math.min(1, rdt * 9);
    springs(rdt);
    P.shake = Math.max(0, P.shake - rdt * 2.5);
    P.fovKick *= Math.exp(-rdt * 9);
    post.uniforms.kick.value = Math.max(0, post.uniforms.kick.value - rdt * 7);
    P.hurtFx = Math.max(0, P.hurtFx - rdt * 1.6);
    const bob = P.grounded ? Math.abs(Math.sin(P.bobT)) * Math.min(1, hs / 10) * 0.06 : 0;
    const eye = (P.dead ? Math.max(0.25, C.eye - P.deadT * 2.5) : C.eye) - (P.seatDip || 0);
    camera.position.set(P.pos.x, P.pos.y + eye - bob - P.landDip, P.pos.z);
    const sh = P.shake * P.shake * 0.05;
    const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    P.roll = (P.roll || 0) + ((P.dead ? 0.6 : -strafe * 0.018) - (P.roll || 0)) * Math.min(1, rdt * 8);
    camera.position.x += Math.sin(P.yaw) * K.b; camera.position.z += Math.cos(P.yaw) * K.b;   // geri itme
    World.followSky(camera.position);
    if (!P.office && !P.dead && G.chunk && Math.random() < rdt * 50) {   // havada süzülen közler
      FX.ember(V3(P.pos.x + (Math.random() - 0.5) * 30, Math.random() * 5, P.pos.z + (Math.random() - 0.5) * 30), G.chunk.theme.fire);
    }
    camera.rotation.set(P.pitch + K.p - VM.headPitch + (Math.random() - 0.5) * sh, P.yaw + K.y + (Math.random() - 0.5) * sh, P.roll + K.r * 0.5 + (Math.random() - 0.5) * sh);
    const atDesk = P.office && P.officePhase === 'desk';
    const atDrawer = P.office && (P.officePhase === 'drawer' || P.officePhase === 'flick');
    const targetFov = C.fov + Math.max(0, Math.min(16, (hs - C.maxSpeed) * 0.9)) - (P.slowmo > 0 ? 8 : 0) - (atDesk ? P.stress * 16 : 0);
    P.fovBase = (P.fovBase || C.fov) + (targetFov - (P.fovBase || C.fov)) * Math.min(1, rdt * 8);
    camera.fov = P.fovBase + P.fovKick; camera.updateProjectionMatrix();

    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - rdt * 60);
    exLights.forEach(L => { L.intensity = Math.max(0, L.intensity - rdt * 12); });

    VM.update(rdt, { mdx, mdy, speed: hs, grounded: P.grounded, landed: P.landed, strafe, firing: mouseDown && P.weapon === 1 && P.ammo.bullets > 0 });
    mdx = 0; mdy = 0;

    // post efekt
    post.uniforms.hurt.value = Math.min(1, P.hurtFx + (P.hp < 30 && !P.dead ? 0.25 + Math.sin(time * 6) * 0.1 : 0) + (P.dead ? 0.8 : 0)
      + (atDesk ? P.stress * 0.4 * (0.5 + 0.5 * Math.sin(time * 7)) : 0));
    post.uniforms.slowmo.value += ((P.slowmo > 0 ? 1 : 0) - post.uniforms.slowmo.value) * Math.min(1, rdt * 6);
    post.uniforms.flash.value = Math.max(0, post.uniforms.flash.value - rdt * 2);
    post.uniforms.warm.value = VM.cigState === 'lighting' ? 1 : P.smoking ? 0.3 : 0;
    post.uniforms.time.value = time;

    // HUD
    const w = WEP[P.weapon];
    HUD.update({
      hp: P.hp, ammo: atDesk ? '%' + Math.round(P.stress * 100) : atDrawer ? 'F' : P.office ? '→' : w.ammo ? P.ammo[w.ammo] : '∞',
      wname: atDesk ? 'STRES' : atDrawer ? 'ZİPPO' : P.office ? 'MOLA' : w.name,
      keys: keyHints(atDesk, atDrawer), office: P.office, weapon: P.weapon, slots: WEP.map(x => x.ammo ? P.ammo[x.ammo] : '∞'),
      smoking: P.smoking, burn: VM.burn, floor: P.floor, score: P.score, kills: P.kills, speed: hs,
      combo: P.combo, mult: 1 + Math.min(4, Math.floor(P.combo / 4)), comboFrac: Math.max(0, P.comboT / 3.5), dash: P.dash, slowmo: P.slowmo, time,
    }, rdt);
  }

  function render() {
    const scale = post.uniforms.res.value.y / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    FX.systems.forEach(s => { s.uniforms.uScale.value = scale; });
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    if (state !== 'menu' && !P.dead) { renderer.clearDepth(); renderer.render(VM.scene, VM.camera); }
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCam);
  }

  // başlangıç: menü arkasında ilk arena
  resize();
  setupWorld();
  requestAnimationFrame(frame);
})();
