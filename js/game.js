// SİGARA MOLASI — ana oyun: render, oyuncu fiziği (Quake tarzı bhop), silahlar, sigara, arena akışı.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ================= AYARLAR =================
  const C = {
    renderH: 300, fov: 100, sens: 0.0022,
    gravity: 25, jump: 8.4, maxSpeed: 10.5, accel: 11, friction: 6, stopSpeed: 3,
    airAccel: 12, airCap: 0.95,
    radius: 0.4, height: 1.8, eye: 1.6,
    dashSpeed: 17, dashRecharge: 1.1, dashMax: 2,
  };
  const MAX = { shells: 60, bullets: 400, rockets: 25, cigs: 20 };
  const WEP = [
    { id: 'shotgun', name: 'ÇİFTE', ammo: 'shells', rate: 0.95, pellets: 16, spread: 0.085, dmg: 8.5, knock: 1.1, shake: 0.35, kick: 0.07 },
    { id: 'chaingun', name: 'MAKİNELİ', ammo: 'bullets', rate: 0.068, pellets: 1, spread: 0.022, dmg: 14, knock: 1.6, shake: 0.06, kick: 0.012 },
    { id: 'rocket', name: 'ROKETATAR', ammo: 'rockets', rate: 0.75, rocket: true, shake: 0.2, kick: 0.04 },
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
    uniforms: { tDiffuse: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, hurt: { value: 0 }, slowmo: { value: 0 }, flash: { value: 0 }, warm: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 res; uniform float hurt, slowmo, flash, warm, time; varying vec2 vUv;
      float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      void main(){
        vec2 uv = vUv; vec2 d = uv - 0.5;
        float ca = hurt * 0.008 + slowmo * 0.003;
        vec3 col = vec3(texture2D(tDiffuse, uv + d * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ca).b);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(l * 1.25, l * 1.0, l * 0.75), slowmo * 0.7);
        col = (col - 0.5) * 1.15 + 0.5 + vec3(0.05, 0.02, 0.0) * warm;
        float r = length(d);
        col *= 1.0 - r * r * 1.3;
        col = mix(col, vec3(0.55, 0.0, 0.0), clamp(hurt, 0.0, 1.0) * smoothstep(0.2, 0.75, r));
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
    ammo: { shells: 24, bullets: 120, rockets: 6 }, cigs: 5, smoking: false, fireCD: 0, kills: 0, score: 0,
    combo: 0, comboT: 0, slowmo: 0, hurtFx: 0, flashFx: 0, recoil: 0, recoilYaw: 0, shake: 0, fovKick: 0, landDip: 0,
    airT: 0, bobT: 0, dead: false, deadT: 0, killWindow: [], floor: 1, dmgMul: 1,
  };
  let state = 'menu', time = 0, hitstop = 0, worldScale = 1;
  let best = 0; try { best = +localStorage.getItem('sigaramolasi.best') || 0; } catch (e) { /* yok */ }
  const showBest = () => { $('best').textContent = best ? `EN İYİ SKOR: ${best}` : ''; };
  showBest();

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
        ['shells', 1 - a.shells / MAX.shells + 0.25],
        ['bullets', 1 - a.bullets / MAX.bullets + 0.2],
        ['rockets', (1 - a.rockets / MAX.rockets) * 0.6 + 0.05],
      ];
      let sum = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * sum;
      for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
      return 'shells';
    },
    collect(kind) {
      const a = P.ammo;
      if (kind === 'health') { if (P.hp >= 150) return false; P.hp = Math.min(150, P.hp + 12); }
      else if (kind === 'cigs') { if (P.cigs >= MAX.cigs) return false; P.cigs = Math.min(MAX.cigs, P.cigs + 3); HUD.feed('+3 SİGARA'); }
      else { const amt = { shells: 6, bullets: 35, rockets: 2 }[kind]; if (a[kind] >= MAX[kind]) return false; a[kind] = Math.min(MAX[kind], a[kind] + amt); }
      SND.play('pickup');
      return true;
    },
    onKill,
  });

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
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  let fireQueued = 0;   // hızlı tek tıklar kaybolmasın
  addEventListener('mousedown', e => { if (e.button === 0) { mouseDown = true; fireQueued = 0.25; } });
  addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  addEventListener('mousemove', e => {
    if (state !== 'play' || (!locked && !mouseDown)) return;   // kilit yoksa sürükleyerek bak
    mdx += e.movementX; mdy += e.movementY;
  });
  addEventListener('wheel', e => { if (state === 'play') selectWeapon((P.weapon + (e.deltaY > 0 ? 1 : 2)) % 3); }, { passive: true });
  addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && state === 'play') { state = 'pause'; $('pause').classList.remove('hidden'); mouseDown = false; SND.muffle(0.8); }
  });
  const lock = () => { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* desteklenmiyor */ } };

  $('menu').addEventListener('click', () => { SND.init(); startGame(); lock(); });
  $('pause').addEventListener('click', () => { $('pause').classList.add('hidden'); state = 'play'; SND.muffle(0); lock(); });
  $('dead').addEventListener('click', () => { if (P.deadT < 1.5) return; $('dead').classList.add('hidden'); startGame(); lock(); });

  // ================= OYUN KURULUMU =================
  function setupWorld() {
    E.clear(); FX.clear(); World.reset(); spawnQueue.length = 0;
    const c0 = World.build(0, 0); World.build(1, c0.z1);
    G.chunk = c0;
    const o = World.buildOffice();
    World.focus(o); applyTheme(o.theme, true);
    return c0;
  }
  let runs = 0;
  function startGame() {
    setupWorld();
    Object.assign(P, {
      hp: 100, grounded: false, dash: 2, dashT: 0, weapon: 0, lastWeapon: 1, ammo: { shells: 24, bullets: 120, rockets: 6 }, cigs: 5,
      smoking: false, fireCD: 0, kills: 0, score: 0, combo: 0, comboT: 0, slowmo: 0, hurtFx: 0, flashFx: 0, recoil: 0, shake: 0,
      dead: false, deadT: 0, killWindow: [], floor: 1, airT: 0, fovKick: 0,
      office: true, officeT: 0, portalAt: runs++ === 0 ? 5 : 2.2,
    });
    P.pos.set(World.OX, 0, -2.6); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = -0.05;
    mouseDown = false; fireQueued = 0;   // menü tıklaması ateş sayılmasın
    VM.reset(); VM.setOffice(true);
    HUD.clearFeed(); HUD.show(true); HUD.mood('normal', 0);
    $('menu').classList.add('hidden'); $('dead').classList.add('hidden'); $('pause').classList.add('hidden');
    state = 'play';
    SND.Music.set(0); SND.muffle(0);
    HUD.msg('17:59', 'pazartesi · rapor yarına yetişecek', 3.5);
  }

  // ================= OFİS → PORTAL =================
  function officeTick(dt) {
    const o = World.office;
    P.officeT += dt;
    if (!o.opening) {
      if (Math.random() < dt * 10) SND.play('typing');
      if (P.officeT > P.portalAt) {
        World.openPortal(); SND.play('portalOpen');
        fogTarget.setHex(0x2a0806); P.shake = Math.min(1.5, P.shake + 0.7);
        HUD.msg('MOLA ZAMANI', 'portaldan geç', 4);
        HUD.feed('ŞEYTANLAR ARIYOR...', true);
      }
      return;
    }
    if (Math.random() < dt * 5) SND.play('buzz');
    // portala çekilen kıvılcımlar
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.0 + Math.random() * 0.5;
      FX.glowDot(V3(World.OX + Math.cos(a) * r * o.open, 1.6 + Math.sin(a) * r * 1.35 * o.open, o.z1 + 0.45), [1, 0.4 + Math.random() * 0.3, 0.05], 0.06, 0.3);
    }
    if (o.open > 0.7 && Math.abs(P.pos.x - World.OX) < 1.25 && P.pos.z < o.z1 + 1.0) enterPortal();
  }
  function enterPortal() {
    P.office = false;
    World.removeOffice();
    const c0 = World.chunks[0]; G.chunk = c0; World.focus(c0); applyTheme(c0.theme, true);
    P.pos.set(0, 0, -2.5); P.vel.set(0, 2, -8); P.yaw = 0; P.pitch = 0;
    post.uniforms.flash.value = 1.3; P.fovKick = 35; P.shake = 1;
    SND.play('portalEnter'); SND.Music.set(1);
    VM.setOffice(false);
    FX.teleport(V3(0, 0, -4));
    HUD.msg('SİGARA MOLASI', '5 dakikan var · şeytanlar bekliyor', 3);
    // ilk sigara şirketten
    setTimeout(() => { if (state === 'play' && !P.dead && !P.office && VM.cigState === 'none') VM.lightCig(); }, 900);
  }

  let fogTarget = new THREE.Color(0x07090c);
  function applyTheme(theme, instant) {
    fogTarget.setHex(theme.fog);
    if (instant) { scene.fog.color.copy(fogTarget); }
    VM.setAmbient({ tech: 0x606878, ruin: 0x6a5040, hell: 0x703028, office: 0x8a8a90 }[theme.name]);
    scene.fog.far = theme.name === 'hell' ? 50 : theme.name === 'office' ? 40 : 58;
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
      // zıplama karesinde sürtünme yok, ama istenen yönde anında koşu hızına çık (bhop akıcı başlasın)
      accelerate(wishSpeed, 1e4, wishSpeed, dt);
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
    if (P.office) { if (VM.sip()) SND.play('slurp'); P.fireCD = 0.4; return; }   // ofiste: kahve
    const w = WEP[P.weapon];
    if (P.ammo[w.ammo] < 1) {
      SND.play('empty'); P.fireCD = 0.3;
      const alt = [0, 1, 2].find(i => P.ammo[WEP[i].ammo] > 0);
      if (alt !== undefined) selectWeapon(alt);
      return;
    }
    P.ammo[w.ammo]--;
    P.fireCD = w.rate;
    VM.fire(P.weapon, w.rate);
    SND.play(w.id === 'rocket' ? 'rocket' : w.id);
    P.recoil += w.kick; P.recoilYaw += (Math.random() - 0.5) * w.kick * 0.4;
    P.shake = Math.min(1.5, P.shake + w.shake);
    camBasis();
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
    if (P.office) { HUD.feed('OFİSTE SİGARA İÇİLMEZ!', true); HUD.mood('ouch', 0.8); SND.play('empty'); return; }
    if (VM.cigState === 'none') {
      if (P.cigs <= 0) { HUD.feed('SİGARA BİTTİ'); SND.play('empty'); return; }
      if (VM.lightCig()) P.cigs--;
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
    if (E.aliveCount() > 0) { P.slowmo = 3.5; SND.play('slowIn'); HUD.feed('SOĞUKKANLI', true); }
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
    if (info.gib) tags.push(['PARAMPARÇA', 40]);
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
      P.yaw -= mdx * C.sens; P.pitch -= mdy * C.sens;
      P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch));
      // fizik (alt adımlar: yüksek hızda duvar delmesin)
      const pdt = rdt * (P.slowmo > 0 ? 0.8 : 1);
      const n = Math.ceil(pdt / (1 / 125));
      const wasGround = P.grounded; P.landed = 0;
      for (let i = 0; i < n; i++) physics(pdt / n);
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
    P.recoil += -P.recoil * Math.min(1, rdt * 12); P.recoilYaw += -P.recoilYaw * Math.min(1, rdt * 12);
    P.shake = Math.max(0, P.shake - rdt * 2.5);
    P.fovKick += -P.fovKick * Math.min(1, rdt * 5);
    P.hurtFx = Math.max(0, P.hurtFx - rdt * 1.6);
    const bob = P.grounded ? Math.abs(Math.sin(P.bobT)) * Math.min(1, hs / 10) * 0.06 : 0;
    const eye = P.dead ? Math.max(0.25, C.eye - P.deadT * 2.5) : C.eye;
    camera.position.set(P.pos.x, P.pos.y + eye - bob - P.landDip, P.pos.z);
    const sh = P.shake * P.shake * 0.05;
    const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    P.roll = (P.roll || 0) + ((P.dead ? 0.6 : -strafe * 0.018) - (P.roll || 0)) * Math.min(1, rdt * 8);
    camera.rotation.set(P.pitch + P.recoil - VM.headPitch + (Math.random() - 0.5) * sh, P.yaw + P.recoilYaw + (Math.random() - 0.5) * sh, P.roll + (Math.random() - 0.5) * sh);
    const targetFov = C.fov + Math.max(0, Math.min(16, (hs - C.maxSpeed) * 0.9)) + P.fovKick - (P.slowmo > 0 ? 8 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov += (targetFov - camera.fov) * Math.min(1, rdt * 8); camera.updateProjectionMatrix(); }

    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - rdt * 60);
    exLights.forEach(L => { L.intensity = Math.max(0, L.intensity - rdt * 12); });

    VM.update(rdt, { mdx, mdy, speed: hs, grounded: P.grounded, landed: P.landed, strafe, firing: mouseDown && P.weapon === 1 && P.ammo.bullets > 0 });
    mdx = 0; mdy = 0;

    // post efekt
    post.uniforms.hurt.value = Math.min(1, P.hurtFx + (P.hp < 30 && !P.dead ? 0.25 + Math.sin(time * 6) * 0.1 : 0) + (P.dead ? 0.8 : 0));
    post.uniforms.slowmo.value += ((P.slowmo > 0 ? 1 : 0) - post.uniforms.slowmo.value) * Math.min(1, rdt * 6);
    post.uniforms.flash.value = Math.max(0, post.uniforms.flash.value - rdt * 2);
    post.uniforms.warm.value = VM.cigState === 'lighting' ? 1 : P.smoking ? 0.3 : 0;
    post.uniforms.time.value = time;

    // HUD
    const w = WEP[P.weapon];
    HUD.update({
      hp: P.hp, ammo: P.office ? '∞' : P.ammo[w.ammo], wname: P.office ? 'KAHVE' : w.name,
      wlist: P.office ? 'mesai bitmek üzere' : WEP.map((x, i) => i === P.weapon ? `<b>${i + 1}</b>` : `${i + 1}`).join(' ') + `&nbsp; ${P.ammo.shells}/${P.ammo.bullets}/${P.ammo.rockets}`,
      cigs: P.cigs, smoking: P.smoking, burn: VM.burn, floor: P.floor, score: P.score, kills: P.kills, speed: hs,
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
