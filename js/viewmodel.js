// Birinci şahıs görünümü: silahlar, sol el, sigara + zippo, tekme. Ayrı sahnede çizilir.
const VM = (() => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.005, 10);
  const handlers = {};
  const emit = (n, a) => handlers[n] && handlers[n](a);

  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const M = {
    gun: lam(0x2c2e33), gunLight: lam(0x55595f), wood: lam(0x5e3418), skin: lam(0xc08868), sleeve: lam(0xd2d6dc),
    olive: lam(0x3e4a2c), red: lam(0xa01808), chrome: lam(0x8a8e92), paper: lam(0xf2efe6), filter: lam(0xc88a3a),
    ash: lam(0x6a6a66), boot: lam(0x0c0c0e), jeans: lam(0x2a2c34), brass: lam(0xb08a30), shell: lam(0xb01010),
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent && parent.add(o); return o; };
  const cyl = (r, len, m, x = 0, y = 0, z = 0, parent, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); parent && parent.add(o); return o; };

  // ---------- ışıklar ----------
  const amb = new THREE.AmbientLight(0x6a5a50, 0.75); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff0e0, 0.7); sun.position.set(0.3, 1, 0.4); scene.add(sun);
  const flashLight = new THREE.PointLight(0xffb040, 0, 2.5, 1.5); flashLight.position.set(0.2, -0.1, -0.8); scene.add(flashLight);
  const fireLight = new THREE.PointLight(0xff3a18, 0, 1.2, 1.5); scene.add(fireLight);

  // ---------- sağ el + silahlar ----------
  const gunRoot = new THREE.Group(); scene.add(gunRoot);
  const BASE = new THREE.Vector3(0.2, -0.22, -0.42);
  const arm = new THREE.Group(); gunRoot.add(arm);
  box(0.075, 0.085, 0.1, M.skin, 0, -0.07, 0.1, arm);             // el
  box(0.02, 0.02, 0.05, M.skin, -0.035, -0.045, 0.06, arm);         // işaret parmağı
  const sleeve = box(0.11, 0.11, 0.5, M.sleeve, 0.03, -0.12, 0.38, arm); sleeve.rotation.x = 0.25;

  const flashTex = TEX.get('flash');
  function makeFlash(scale) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(scale); s.visible = false; return s;
  }

  // ÇİFTE (çift namlu)
  const shotgun = new THREE.Group();
  const barrels = new THREE.Group(); barrels.position.set(0, 0, -0.06); shotgun.add(barrels);
  cyl(0.027, 0.6, M.gunLight, -0.029, 0, -0.3, barrels, 10); cyl(0.027, 0.6, M.gunLight, 0.029, 0, -0.3, barrels, 10);
  box(0.02, 0.012, 0.58, M.gun, 0, 0.028, -0.3, barrels);
  box(0.1, 0.055, 0.24, M.wood, 0, -0.04, -0.24, barrels);
  cyl(0.009, 0.012, M.gun, -0.029, 0, -0.6, barrels).material = lam(0x050505);
  cyl(0.009, 0.012, M.gun, 0.029, 0, -0.6, barrels).material = lam(0x050505);
  box(0.11, 0.085, 0.16, M.gun, 0, -0.01, 0.02, shotgun);
  const stock = box(0.075, 0.11, 0.34, M.wood, 0, -0.07, 0.24, shotgun); stock.rotation.x = -0.18;
  box(0.012, 0.03, 0.03, M.gunLight, 0, -0.07, 0.05, shotgun);    // tetik
  const sgFlash = makeFlash(0.45); sgFlash.position.set(0, 0, -0.75); shotgun.add(sgFlash);
  shotgun.userData = { flash: sgFlash };
  // fırlayan kovanlar
  const shells = [];
  for (let i = 0; i < 2; i++) { const s = cyl(0.014, 0.06, M.shell, 0, 0, 0, null, 6); s.visible = false; scene.add(s); shells.push({ m: s, v: new THREE.Vector3(), t: 0 }); }

  // MAKİNELİ (döner namlu)
  const chaingun = new THREE.Group();
  const spin = new THREE.Group(); spin.position.set(0, 0, -0.2); chaingun.add(spin);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(0.011, 0.5, M.gunLight, Math.cos(a) * 0.035, Math.sin(a) * 0.035, -0.12, spin, 6); }
  cyl(0.055, 0.03, M.gun, 0, 0, -0.32, spin, 10); cyl(0.055, 0.03, M.gun, 0, 0, 0.05, spin, 10);
  box(0.13, 0.13, 0.28, M.gun, 0, -0.01, 0.06, chaingun);
  box(0.09, 0.11, 0.12, M.olive, 0.1, -0.03, 0.04, chaingun);
  box(0.03, 0.12, 0.05, M.gun, 0, 0.1, 0.0, chaingun);
  const cgFlash = makeFlash(0.32); cgFlash.position.set(0, 0, -0.62); chaingun.add(cgFlash);
  chaingun.userData = { flash: cgFlash };

  // ROKETATAR
  const launcher = new THREE.Group();
  cyl(0.075, 0.8, M.olive, 0, 0.02, -0.18, launcher, 12);
  cyl(0.085, 0.06, M.gun, 0, 0.02, -0.58, launcher, 12);
  cyl(0.085, 0.06, M.gun, 0, 0.02, 0.2, launcher, 12);
  const rocketTip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), M.red); rocketTip.rotation.x = -Math.PI / 2; rocketTip.position.set(0, 0.02, -0.6); launcher.add(rocketTip);
  box(0.03, 0.05, 0.12, M.gun, 0.06, 0.1, -0.1, launcher);
  box(0.035, 0.1, 0.05, M.gun, 0, -0.08, 0.05, launcher);
  const rlFlash = makeFlash(0.5); rlFlash.position.set(0, 0.02, -0.68); launcher.add(rlFlash);
  launcher.userData = { flash: rlFlash };

  const weapons = [shotgun, chaingun, launcher];
  weapons.forEach(w => { gunRoot.add(w); w.visible = false; });
  let cur = 0, pending = -1, switchT = 0;
  weapons[0].visible = true;

  // ofis modu: elde silah yok, sadece klavyeye inecek bir yumruk
  let office = false, slamT = -1, slamHit = false;

  // ---------- sol el ----------
  // "yüz" grubu: sigara yakarken kafa öne eğilir -> el, zippo ve sigara ekranın ortasına gelir
  const face = new THREE.Group(); scene.add(face); face.add(fireLight);
  let tilt = 0;
  const lh = new THREE.Group(); face.add(lh);
  box(0.065, 0.075, 0.085, M.skin, 0, 0, 0, lh);
  box(0.018, 0.04, 0.018, M.skin, 0.03, 0.035, -0.02, lh);         // başparmak
  for (let i = 0; i < 3; i++) box(0.017, 0.017, 0.05, M.skin, -0.02 + i * 0.019, 0.03, -0.055, lh);
  const lsleeve = box(0.1, 0.1, 0.45, M.sleeve, -0.03, -0.06, 0.25, lh); lsleeve.rotation.x = 0.35;
  box(0.074, 0.082, 0.024, lam(0x111111), 0, 0, 0.052, lh);                  // kol saati kayışı
  box(0.042, 0.012, 0.03, lam(0xc8a040), 0, 0.044, 0.052, lh);               // kadran

  // zippo (sol elde)
  const zippo = new THREE.Group(); zippo.position.set(0.0, 0.07, -0.03); lh.add(zippo);
  box(0.034, 0.05, 0.014, M.chrome, 0, 0, 0, zippo);
  box(0.016, 0.016, 0.016, lam(0xb00c08, { emissive: 0x500000 }), 0, -0.004, 0, zippo);   // kazınmış pentagram (Bedirhan Abi'nin)
  const lidPivot = new THREE.Group(); lidPivot.position.set(0.017, 0.025, 0); zippo.add(lidPivot);
  box(0.034, 0.02, 0.014, M.chrome, -0.017, 0.01, 0, lidPivot);
  box(0.006, 0.012, 0.006, M.gunLight, -0.004, 0.031, 0, zippo); // çark
  const flame = new THREE.Group(); flame.position.set(-0.004, 0.05, 0); zippo.add(flame);
  const fOut = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.04, 6), new THREE.MeshBasicMaterial({ color: 0xff1a08, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const fIn = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.022, 6), new THREE.MeshBasicMaterial({ color: 0xffb0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  fIn.position.y = -0.006; flame.add(fOut, fIn); flame.visible = false;
  const FLAME_LOCAL = new THREE.Vector3(-0.004, 0.07 + 0.05, -0.03);   // el uzayında alevin konumu

  // ---------- sigara ----------
  const cig = new THREE.Group(); face.add(cig);
  const CIG_LEN = 0.1;
  const filt = cyl(0.0046, 0.026, M.filter, 0, 0, -0.013, cig, 8);
  const paper = new THREE.Group(); paper.position.z = -0.026; cig.add(paper);
  const paperMesh = cyl(0.0043, 1, M.paper, 0, 0, -0.5, paper, 8);     // ölçeklenir
  const emberMat = new THREE.MeshBasicMaterial({ color: 0x302826 });
  const ember = cyl(0.0045, 0.007, emberMat, 0, 0, 0, cig, 8);
  const emberGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xff6010, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  emberGlow.scale.setScalar(0.035); cig.add(emberGlow);
  cig.visible = false;
  const MOUTH = { p: [-0.016, -0.07, -0.065], r: [-0.03, 0.15, 0] };   // ağzın sol köşesi
  let paperLen = CIG_LEN - 0.026;
  function setCigLength(frac) {
    const L = Math.max(0.004, (CIG_LEN - 0.026) * frac);
    paperLen = L; paperMesh.scale.y = L; paperMesh.position.z = -L / 2;
    ember.position.z = -0.026 - L; emberGlow.position.z = -0.026 - L - 0.002;
  }
  setCigLength(1);
  const tipLocal = () => new THREE.Vector3(0, 0, -0.026 - paperLen - 0.004);

  // ---------- tekme bacağı ----------
  const leg = new THREE.Group(); scene.add(leg); leg.visible = false;
  box(0.16, 0.13, 0.26, M.boot, 0, 0, -0.05, leg);
  box(0.17, 0.04, 0.28, lam(0x111111), 0, -0.07, -0.05, leg);
  const shin = box(0.14, 0.4, 0.14, M.jeans, 0, -0.2, 0.08, leg); shin.rotation.x = -0.4;

  // ---------- poz yardımcıları ----------
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  function track(t, keys, out) { // keys: [[t, p[3], r[3]], ...]
    if (t <= keys[0][0]) return apply(out, keys[0][1], keys[0][2]);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t <= b[0]) {
        const k = ease((t - a[0]) / (b[0] - a[0]));
        return apply(out, a[1].map((v, j) => v + (b[1][j] - v) * k), a[2].map((v, j) => v + (b[2][j] - v) * k));
      }
    }
    const l = keys[keys.length - 1]; apply(out, l[1], l[2]);
  }
  function apply(o, p, r) { o.position.set(p[0], p[1], p[2]); o.rotation.set(r[0], r[1], r[2]); }

  const H_OFF = [[-0.3, -0.42, -0.25], [0.6, 0.3, 0.5]];
  // sigaranın ucu ağız pozunda nerede?
  const mouthObj = new THREE.Object3D(); apply(mouthObj, MOUTH.p, MOUTH.r); mouthObj.updateMatrix();
  const TIP_AT_MOUTH = new THREE.Vector3(0, 0, -CIG_LEN - 0.004).applyMatrix4(mouthObj.matrix);
  const H_LIGHT = [[TIP_AT_MOUTH.x - FLAME_LOCAL.x, TIP_AT_MOUTH.y - FLAME_LOCAL.y - 0.012, TIP_AT_MOUTH.z - FLAME_LOCAL.z], [0, 0, 0]];
  const H_CIG = [[-0.03, -0.12, -0.15], [0.2, -0.3, 0.3]];

  const LIGHT_KEYS = [
    [0.0, ...H_OFF], [0.35, ...H_CIG], [0.5, [-0.025, -0.125, -0.15], [0.2, -0.3, 0.3]],
    [0.72, ...H_OFF], [1.0, ...H_LIGHT], [1.72, H_LIGHT[0].map((v, i) => v + [0.004, -0.002, 0][i]), [0, 0, 0.05]], [2.05, ...H_OFF],
  ];
  const CIG_HAND = cigFromHand(H_CIG);
  const CIG_LIGHT_KEYS = [[0.0, CIG_HAND[0].map((v, i) => v + H_OFF[0][i] - H_CIG[0][i]), CIG_HAND[1]], [0.35, ...CIG_HAND], [0.48, MOUTH.p, MOUTH.r]];
  function cigFromHand(h) { return [[h[0][0] + 0.02, h[0][1] + 0.035, h[0][2] - 0.02], [h[1][0] * 0.5 - 0.1, h[1][1], 0]]; }

  const H_GRAB = [[MOUTH.p[0] - 0.03, MOUTH.p[1] - 0.045, MOUTH.p[2] - 0.05], [0.2, -0.3, 0.3]];
  const THROW_KEYS = [[0, ...H_OFF], [0.16, ...H_GRAB], [0.28, [-0.12, -0.1, -0.22], [0.6, -0.2, 0.6]], [0.36, [0.04, -0.03, -0.5], [-0.4, 0.1, -0.2]], [0.62, ...H_OFF]];
  const CIG_THROW_KEYS = [[0.16, MOUTH.p, MOUTH.r], [0.28, [-0.1, -0.06, -0.26], [0.3, 0.6, 0]], [0.35, [0.05, 0.0, -0.52], [-0.6, 0.2, 0]]];
  const LEG_KEYS = [[0, [0.06, -0.85, -0.15], [0.6, 0, 0]], [0.09, [0.05, -0.2, -0.48], [-0.3, 0, 0]], [0.2, [0.05, -0.2, -0.5], [-0.3, 0, 0]], [0.42, [0.06, -0.85, -0.15], [0.6, 0, 0]]];

  // ---------- durum ----------
  const st = {
    cig: 'none', cigT: 0, burn: 1, glow: 0, dragT: 3, kickT: -1, headPitch: 0,
    rec: 0, recV: 0, recRoll: 0, jit: new THREE.Vector3(), reload: 0, reloadDur: 0, sway: new THREE.Vector2(), bobT: 0, land: 0, flashT: 0, spinV: 0,
    events: {},
  };
  function fireEvent(key, t, at, fn) { if (t >= at && !st.events[key]) { st.events[key] = true; fn(); } }

  return {
    scene, camera, weapons,
    on(n, fn) { handlers[n] = fn; },
    get current() { return cur; },
    get cigState() { return st.cig; },
    get busyLeft() { return st.cig === 'lighting' || st.cig === 'throwing'; },
    get headPitch() { return st.headPitch; },
    get switching() { return pending >= 0; },
    setOffice(on) {
      office = on; pending = -1; slamT = -1;
      weapons.forEach((w, i) => { w.visible = !on && i === cur; });
      if (!on) switchT = 1;   // silah aşağıdan kalkarak gelsin
    },
    slam() { if (slamT >= 0) return false; slamT = 0; slamHit = false; return true; },
    setAmbient(hex) { amb.color.setHex(hex); },
    reset() {
      st.cig = 'none'; cig.visible = false; lh.visible = false; flame.visible = false; fireLight.intensity = 0; st.burn = 1; setCigLength(1);
      st.kickT = -1; leg.visible = false; pending = -1; switchT = 0; weapons.forEach((w, i) => w.visible = i === 0); cur = 0;
    },
    select(i) { if (i === cur && pending < 0) return false; if (i === pending) return false; pending = i; switchT = Math.max(switchT, 0); return true; },
    fire(idx, dur) {
      st.recV += [13, 3.2, 10][idx];
      st.recRoll = (Math.random() < 0.5 ? -1 : 1) * (idx === 1 ? 0.4 : 1);
      if (idx === 1) st.jit.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, 0);
      const f = weapons[idx].userData.flash; f.visible = true; f.material.rotation = Math.random() * 6.28; st.flashT = idx === 1 ? 0.035 : 0.06;
      flashLight.intensity = idx === 1 ? 1.5 : 3;
      if (idx === 0) { st.reload = 0.0001; st.reloadDur = dur; st.events.shells = false; }
      if (idx === 1) st.spinV = 30;
      if (idx === 2) { st.reload = 0.0001; st.reloadDur = dur; }
    },
    kick() { if (st.kickT >= 0) return false; st.kickT = 0; st.events.kick = false; leg.visible = true; return true; },
    lightCig() {
      if (st.cig !== 'none') return false;
      st.cig = 'lighting'; st.cigT = 0; st.burn = 1; setCigLength(1); st.events = {}; st.glow = 0;
      cig.visible = true; lh.visible = true; zippo.visible = false; flame.visible = false; lidPivot.rotation.z = 0; emberMat.color.setHex(0x302826);
      return true;
    },
    throwCig() { if (st.cig !== 'lit') return false; st.cig = 'throwing'; st.cigT = 0; st.events = {}; lh.visible = true; zippo.visible = false; return true; },
    get burn() { return st.burn; },
    tipView() { return tipLocal().applyMatrix4(cig.matrixWorld); },   // görüş uzayında sigara ucu
    update(dt, o) {
      const t = performance.now() / 1000;
      // --- silah değiştirme ---
      if (pending >= 0) {
        switchT += dt * 6;
        if (switchT >= 1) { weapons[cur].visible = false; cur = pending; pending = -1; weapons[cur].visible = true; switchT = 1; st.reload = 0; }
      } else if (switchT > 0) switchT = Math.max(0, switchT - dt * 6);

      // --- geri tepme yayı ---
      for (let i = 0, n = Math.ceil(dt * 240); i < n; i++) { const h = dt / n; st.recV += (-st.rec * 160 - st.recV * 16) * h; st.rec += st.recV * h; }
      // --- salınım / sallanma ---
      st.sway.x += ((-o.mdx * 0.0006) - st.sway.x) * Math.min(1, dt * 10);
      st.sway.y += ((o.mdy * 0.0006) - st.sway.y) * Math.min(1, dt * 10);
      st.sway.clampScalar(-0.05, 0.05);
      const sp = Math.min(1, o.speed / 11);
      if (o.grounded) st.bobT += dt * (6 + sp * 8);
      const bobA = o.grounded ? sp : 0;
      if (o.landed) st.land = Math.min(0.08, 0.02 + o.landed * 0.004);
      st.land += -st.land * Math.min(1, dt * 10);

      const p = gunRoot.position;
      p.copy(BASE);
      p.x += Math.sin(st.bobT) * 0.014 * bobA + st.sway.x;
      p.y += -Math.abs(Math.cos(st.bobT)) * 0.018 * bobA + st.sway.y - st.land - switchT * 0.45 + (o.grounded ? 0 : 0.015);
      // geri tepme: silah geriye ve yukarı fırlar, hafif yana yatar; makinelide titreme
      st.jit.multiplyScalar(Math.pow(0.0005, dt));
      p.z += st.rec * 0.09; p.y += st.rec * 0.025; p.add(st.jit);
      gunRoot.rotation.set(st.rec * 0.32 - switchT * 0.6, st.sway.x * 2, -o.strafe * 0.06 + st.sway.x * 1.5 + st.rec * st.recRoll * 0.25);

      // ofiste yumruk biraz daha önde dursun; klavyeye vurma: kaldır -> hızla indir -> geri çek
      if (office) { gunRoot.position.z -= 0.1; gunRoot.position.x -= 0.04; }
      if (slamT >= 0) {
        slamT += dt;
        const up = slamT < 0.16 ? ease(slamT / 0.16) : 0;
        const down = slamT < 0.16 ? 0 : slamT < 0.22 ? (slamT - 0.16) / 0.06 : Math.max(0, 1 - Math.max(0, slamT - 0.32) / 0.3);
        gunRoot.position.y += up * 0.16 - down * 0.17; gunRoot.position.z -= down * 0.14; gunRoot.position.x -= down * 0.07;
        gunRoot.rotation.x += -up * 0.8 + down * 0.45; gunRoot.rotation.z += up * 0.3;
        if (slamT >= 0.22 && !slamHit) { slamHit = true; emit('slam'); }
        if (slamT > 0.65) slamT = -1;
      }
      // çifte kırma animasyonu
      if (st.reload > 0) {
        st.reload += dt;
        const k = st.reload / st.reloadDur;
        if (cur === 0) {
          const open = k < 0.35 ? 0 : k < 0.55 ? (k - 0.35) / 0.2 : k < 0.8 ? 1 : Math.max(0, 1 - (k - 0.8) / 0.12);
          barrels.rotation.x = -open * 0.55;
          gunRoot.rotation.x += open * 0.35; gunRoot.position.y -= open * 0.04;
          if (k > 0.5 && !st.events.shells) { st.events.shells = true; shells.forEach((s, i) => { s.m.visible = true; s.t = 0; s.m.position.set(BASE.x + (i ? 0.03 : -0.03), BASE.y + 0.05, BASE.z - 0.02); s.v.set((Math.random() - 0.3) * 0.6, 1.2 + Math.random() * 0.4, 0.6); }); }
        } else if (cur === 2) rocketTip.visible = k > 0.6;
        if (k >= 1) { st.reload = 0; barrels.rotation.x = 0; rocketTip.visible = true; }
      }
      shells.forEach(s => { if (!s.m.visible) return; s.t += dt; s.v.y -= 6 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 15; if (s.t > 0.7) s.m.visible = false; });

      // makineli namlu dönüşü
      if (o.firing && cur === 1) st.spinV = Math.min(40, st.spinV + dt * 120);
      st.spinV *= Math.pow(0.15, dt); spin.rotation.z += st.spinV * dt;

      // namlu alevi
      if (st.flashT > 0) { st.flashT -= dt; if (st.flashT <= 0) weapons.forEach(w => w.userData.flash.visible = false); }
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 40);

      // --- sigara ---
      const wantTilt = st.cig === 'lighting' && st.cigT > 0.55 && st.cigT < 1.85 ? 0.38 : 0;
      tilt += (wantTilt - tilt) * Math.min(1, dt * 7);
      face.rotation.x = tilt;
      st.headPitch = tilt * 0.35;
      if (st.cig === 'lighting') {
        const ct = (st.cigT += dt);
        track(ct, LIGHT_KEYS, lh);
        if (ct < 0.48) track(ct, CIG_LIGHT_KEYS, cig); else apply(cig, MOUTH.p, MOUTH.r);
        zippo.visible = ct > 0.62;
        lidPivot.rotation.z = ct < 0.92 ? 0 : ct < 1.0 ? (ct - 0.92) / 0.08 * 2.4 : ct < 1.72 ? 2.4 : Math.max(0, 2.4 - (ct - 1.72) / 0.06 * 2.4);
        fireEvent('open', ct, 0.92, () => emit('zippoOpen'));
        fireEvent('strike', ct, 1.04, () => { emit('zippoStrike'); flame.visible = true; });
        fireEvent('inhale', ct, 1.12, () => emit('inhale'));
        fireEvent('close', ct, 1.72, () => { flame.visible = false; emit('zippoClose'); });
        fireEvent('lit', ct, 1.6, () => emit('lit'));
        fireEvent('exhale', ct, 2.05, () => emit('exhale'));
        if (flame.visible) {
          const f = 0.8 + Math.random() * 0.4; flame.scale.set(f, 0.8 + Math.random() * 0.5, f); fOut.rotation.y += dt * 20;
          fireLight.intensity = 0.6 + Math.random() * 0.3; fireLight.position.copy(lh.position).add(FLAME_LOCAL);
        } else fireLight.intensity = Math.max(0, fireLight.intensity - dt * 10);
        if (ct > 1.12 && ct < 1.7) st.glow = Math.min(1, st.glow + dt * 2.5);
        if (ct > 2.4) { st.cig = 'lit'; lh.visible = false; zippo.visible = false; }
      } else if (st.cig === 'lit') {
        apply(cig, MOUTH.p, MOUTH.r);
        st.burn -= dt / 32; setCigLength(Math.max(0.05, st.burn));
        st.dragT -= dt;
        if (st.dragT < 0) { st.dragT = 5 + Math.random() * 4; st.glow = 1; emit('drag'); }
        st.glow = Math.max(0.35, st.glow - dt * 0.6);
        if (st.burn <= 0) { st.cig = 'none'; cig.visible = false; emit('burnout'); }
      } else if (st.cig === 'throwing') {
        const ct = (st.cigT += dt);
        track(ct, THROW_KEYS, lh);
        if (ct < 0.36) track(ct, CIG_THROW_KEYS, cig);
        fireEvent('release', ct, 0.36, () => { cig.visible = false; emit('release', st.burn); });
        if (ct > 0.62) { st.cig = 'none'; lh.visible = false; }
      }
      // kor rengi
      if (st.cig === 'lit' || st.cig === 'throwing' || (st.cig === 'lighting' && st.glow > 0)) {
        const g = st.glow * (0.85 + Math.random() * 0.15);
        emberMat.color.setRGB(0.25 + g * 0.75, 0.08 + g * 0.35, 0.03 + g * 0.05);
        emberGlow.material.opacity = g * 0.9;
        if (st.cig === 'lit' || st.cig === 'throwing') { fireLight.intensity = g * 0.5; fireLight.position.set(0.03, -0.07, -0.18); }
      }
      if (st.cig === 'none') { emberGlow.material.opacity = 0; if (!flame.visible) fireLight.intensity = Math.max(0, fireLight.intensity - dt * 4); }

      // --- tekme ---
      if (st.kickT >= 0) {
        st.kickT += dt; track(st.kickT, LEG_KEYS, leg);
        fireEvent('kick', st.kickT, 0.09, () => emit('kickHit'));
        if (st.kickT > 0.45) { st.kickT = -1; leg.visible = false; }
      }
      camera.updateMatrixWorld(); scene.updateMatrixWorld();
      void t;
    },
  };
})();
