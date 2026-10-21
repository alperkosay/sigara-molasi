// Düşmanlar, mermiler, parçacıklar, patlamalar, eşyalar.
// G: game.js tarafından doldurulan ortak bağlam (sahne, oyuncu, geri çağırmalar).
const G = {};

// ================= PARÇACIKLAR =================
class Particles {
  constructor(max, { additive = false, near = 1.2, maxSize = 50 } = {}) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.a0 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol); g.setAttribute('psize', this.aSize); g.setAttribute('palpha', this.aAlpha);
    g.setDrawRange(0, 0);
    // uNear: kameraya bu mesafeden yakın parçacıklar söner (ekranı kaplayan dev kareler olmasın)
    this.uniforms = { uScale: { value: 300 }, uNear: { value: near }, uMax: { value: maxSize } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float uScale, uNear, uMax;
        varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(psize * uScale / max(0.05, -mv.z), 1.0, uMax); vC = pcolor;
          vA = palpha * (uNear > 0.0 ? smoothstep(uNear * 0.35, uNear, -mv.z) : 1.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ if (vA <= 0.01) discard; gl_FragColor = vec4(vC, vA); }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false;
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, drag = 0, grow = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = this.maxLife[i] = life; this.size[i] = size; this.a0[i] = this.alpha[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.copy(--this.n, i); continue; }
      const i3 = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i3 + 1] = 0.02; this.vel[i3] *= 0.3; this.vel[i3 + 2] *= 0.3; this.vel[i3 + 1] = 0; }
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * Math.min(1, this.life[i] / this.maxLife[i] * 2);
      i++;
    }
    const g = this.points.geometry; g.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
  copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (const arr of [this.pos, this.vel, this.col]) { arr[t3] = arr[f3]; arr[t3 + 1] = arr[f3 + 1]; arr[t3 + 2] = arr[f3 + 2]; }
    for (const arr of [this.size, this.alpha, this.life, this.maxLife, this.a0, this.grav, this.drag, this.grow]) arr[to] = arr[from];
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

const FX = (() => {
  let add, norm, smoke, wisp;
  const decals = []; let decalMat;
  const fireballs = [];
  const R = (a = 1) => (Math.random() - 0.5) * 2 * a;
  return {
    init(scene) {
      add = new Particles(3000, { additive: true, near: 0.8 }); norm = new Particles(3000, { near: 0.6 }); smoke = new Particles(1500, { near: 1.4, maxSize: 70 });
      wisp = new Particles(800, { near: 0, maxSize: 5 });   // sigara ucundan yükselen ince duman
      scene.add(norm.points, smoke.points, wisp.points, add.points);
      decalMat = new THREE.MeshBasicMaterial({ map: TEX.get('blood'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    },
    get systems() { return [add, norm, smoke, wisp]; },
    wisp(p, vel) { wisp.spawn(p.x, p.y, p.z, vel.x * 0.9 + R(0.04), vel.y + 0.25 + Math.random() * 0.15, vel.z * 0.9 + R(0.04), 2 + Math.random(), 0.006, 0.85, 0.85, 0.88, 0.13, -0.1, 1.2, 0.02); },
    update(dt) {
      add.update(dt); norm.update(dt); smoke.update(dt); wisp.update(dt);
      for (let i = fireballs.length - 1; i >= 0; i--) {
        const f = fireballs[i]; f.t += dt; const k = f.t / f.life;
        f.m.scale.setScalar(f.size * (0.3 + Math.sqrt(k) * 1.2)); f.m.material.opacity = 1 - k;
        if (k >= 1) { G.scene.remove(f.m); f.m.material.dispose(); fireballs.splice(i, 1); }
      }
    },
    clear() { add.clear(); norm.clear(); smoke.clear(); wisp.clear(); decals.forEach(d => G.scene.remove(d)); decals.length = 0; },
    blood(p, dir, n = 12, spread = 3) {
      for (let i = 0; i < n; i++) {
        const s = 3 + Math.random() * 5;
        norm.spawn(p.x, p.y, p.z, dir.x * s + R(spread), dir.y * s + R(spread) + 2, dir.z * s + R(spread), 0.6 + Math.random() * 0.6, 0.07 + Math.random() * 0.07, 0.45 + Math.random() * 0.3, 0, 0, 1, 18, 0.5);
      }
    },
    debris(p, n = 10, color = [0.15, 0.15, 0.17]) {   // fırlayan klavye tuşları vb.
      for (let i = 0; i < n; i++) { const c = Math.random() < 0.25 ? [0.85, 0.85, 0.85] : color; norm.spawn(p.x + R(0.2), p.y, p.z + R(0.08), R(1.5), 2 + Math.random() * 2.5, R(1.2), 0.9 + Math.random() * 0.5, 0.025, ...c, 1, 14, 0.3); }
    },
    sparks(p, n = 6, color = [1, 0.8, 0.3]) {
      for (let i = 0; i < n; i++) add.spawn(p.x, p.y, p.z, R(5), R(4) + 2, R(5), 0.2 + Math.random() * 0.25, 0.05, ...color, 1, 15, 1);
      smoke.spawn(p.x, p.y, p.z, R(0.3), 0.4, R(0.3), 0.6, 0.2, 0.35, 0.33, 0.3, 0.5, 0, 1, 0.6);
    },
    smoke(p, n = 1, { size = 0.18, life = 1.8, color = [0.75, 0.75, 0.75], vel = null, a = 0.35, grow = 0.35 } = {}) {
      for (let i = 0; i < n; i++) {
        const v = vel || { x: 0, y: 0, z: 0 };
        smoke.spawn(p.x + R(0.02), p.y, p.z + R(0.02), v.x + R(0.12), v.y + 0.35 + Math.random() * 0.25, v.z + R(0.12), life * (0.7 + Math.random() * 0.6), size, ...color, a, -0.15, 0.9, grow);
      }
    },
    fire(p, n = 2, s = 0.3) {
      for (let i = 0; i < n; i++) add.spawn(p.x + R(s), p.y + R(s), p.z + R(s), R(0.6), 1.5 + Math.random() * 2, R(0.6), 0.35 + Math.random() * 0.3, 0.25, 1, 0.35 + Math.random() * 0.3, 0.05, 1, -2, 1, -0.3);
    },
    flame(p, color, s = 1) {   // mangal / meşale alevi (renk temadan)
      const k = 0.8 + Math.random() * 0.4;
      add.spawn(p.x + R(0.25 * s), p.y + R(0.1), p.z + R(0.25 * s), R(0.3), (1.6 + Math.random() * 1.6) * s, R(0.3), 0.3 + Math.random() * 0.35, 0.3 * s, color[0] * k, color[1] * k, color[2] * k, 1, -1.5, 1.2, -0.35 * s);
      if (Math.random() < 0.08) smoke.spawn(p.x, p.y + 0.6 * s, p.z, R(0.2), 1.0, R(0.2), 2.2, 0.35 * s, 0.12, 0.1, 0.1, 0.35, -0.2, 0.8, 0.5);
    },
    ember(p, color) {   // havada süzülen köz
      add.spawn(p.x, p.y, p.z, R(0.4), 0.5 + Math.random() * 0.9, R(0.4), 3 + Math.random() * 3, 0.045, color[0], color[1], color[2], 1, -0.05, 0.1);
    },
    glowDot(p, color, size = 0.1, life = 0.15) { add.spawn(p.x, p.y, p.z, 0, 0, 0, life, size, ...color, 1); },
    trail(p, color, size = 0.12) { add.spawn(p.x + R(0.05), p.y + R(0.05), p.z + R(0.05), R(0.3), R(0.3), R(0.3), 0.25, size, ...color, 0.9, 0, 2, -0.3); },
    teleport(p) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * 6.28, r = 0.6 + Math.random() * 0.4;
        add.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * 0.4, p.z + Math.sin(a) * r, 0, 3 + Math.random() * 5, 0, 0.6 + Math.random() * 0.4, 0.12, 1, 0.2, 0.1, 1, 0, 0.5);
      }
    },
    explosion(p, size = 1) {
      for (let i = 0; i < 60 * size; i++) { const s = 4 + Math.random() * 10; const d = new THREE.Vector3(R(), R() * 0.8 + 0.3, R()).normalize(); add.spawn(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, 0.3 + Math.random() * 0.5, 0.25 + Math.random() * 0.3, 1, 0.4 + Math.random() * 0.5, 0.05, 1, 4, 3); }
      for (let i = 0; i < 25 * size; i++) smoke.spawn(p.x + R(1), p.y + R(0.8) + 0.3, p.z + R(1), R(2), 1 + Math.random() * 2, R(2), 1.5 + Math.random() * 1.5, 0.6, 0.12, 0.1, 0.09, 0.8, -0.3, 1.2, 0.8);
      for (let i = 0; i < 20; i++) add.spawn(p.x, p.y, p.z, R(16), R(10) + 6, R(16), 0.6 + Math.random() * 0.6, 0.06, 1, 0.9, 0.5, 1, 20, 0.3);
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(p); G.scene.add(m); fireballs.push({ m, t: 0, life: 0.35, size: 2.6 * size });
    },
    decal(p, size = 1.2) {
      const hit = World.raycast(new THREE.Vector3(p.x, p.y + 0.2, p.z), new THREE.Vector3(0, -1, 0), 12);
      if (!hit) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), decalMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28;
      m.position.set(p.x, p.y + 0.2 - hit.t + 0.012 + Math.random() * 0.004, p.z);
      G.scene.add(m); decals.push(m);
      if (decals.length > 90) { const o = decals.shift(); G.scene.remove(o); o.geometry.dispose(); }
    },
  };
})();

// ================= DÜŞMANLAR =================
const ETYPES = {
  grunt:  { name: 'KÖLE',   hp: 60,  speed: 4.6, r: 0.45, h: 1.9, score: 100, ranged: true, rate: [1.5, 2.6], projSpeed: 17, projDmg: 9, proj: [0.3, 1, 0.2], prefer: [7, 14] },
  runner: { name: 'İT',     hp: 40,  speed: 10.5, r: 0.4, h: 1.5, score: 120, melee: 12, lunge: true },
  brute:  { name: 'KASAP',  hp: 330, speed: 3.6, r: 0.95, h: 2.9, score: 450, melee: 28, ranged: true, rate: [2.6, 3.6], projSpeed: 14, projDmg: 14, spread: 5, proj: [1, 0.45, 0.1], prefer: [0, 6] },
  skull:  { name: 'KAFA',   hp: 45,  speed: 5.5, r: 0.45, h: 0.9, score: 150, fly: true, melee: 16 },
};

const E = (() => {
  const list = [], pending = [], projs = [], rockets = [], gibs = [], cigs = [], pickups = [];
  const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const R = (a = 1) => (Math.random() - 0.5) * 2 * a;
  let skullTex, glowTex;
  const gibGeo = [new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.BoxGeometry(0.28, 0.12, 0.14), new THREE.BoxGeometry(0.1, 0.3, 0.1)];

  function part(parent, w, h, d, m, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; }
  function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  const MARK = { grunt: 0x70e8ff, runner: 0xffe040, brute: 0xff50ff, skull: 0xffffff };
  function buildModel(type) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const P = { body };
    let mats = [];
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xff2000 });
    if (type === 'grunt') {
      const skin = lam(0x9aa890), cloth = lam(0xe4e4dc), dark = lam(0x1a1c24), gunM = lam(0x202024), tie = lam(0xc01010);
      mats = [skin, cloth, dark, tie];
      P.legL = pivot(body, -0.15, 0.95, 0); part(P.legL, 0.22, 0.95, 0.25, dark, 0, -0.47, 0);
      P.legR = pivot(body, 0.15, 0.95, 0); part(P.legR, 0.22, 0.95, 0.25, dark, 0, -0.47, 0);
      part(body, 0.62, 0.72, 0.36, cloth, 0, 1.3, 0);
      part(body, 0.64, 0.1, 0.38, dark, 0, 1.0, 0);
      part(body, 0.1, 0.5, 0.02, tie, 0, 1.36, 0.19);   // kravat
      P.head = part(body, 0.34, 0.36, 0.34, skin, 0, 1.85, 0);
      part(P.head, 0.36, 0.12, 0.36, lam(0x2c3020), 0, 0.15, 0);
      part(P.head, 0.07, 0.05, 0.02, eyeM, -0.08, 0.02, 0.175); part(P.head, 0.07, 0.05, 0.02, eyeM, 0.08, 0.02, 0.175);
      P.armL = pivot(body, -0.4, 1.6, 0); part(P.armL, 0.18, 0.7, 0.2, skin, 0, -0.35, 0);
      P.armR = pivot(body, 0.4, 1.6, 0); part(P.armR, 0.18, 0.7, 0.2, cloth, 0, -0.35, 0);
      part(P.armR, 0.1, 0.12, 0.5, gunM, 0, -0.68, 0.15);
      P.armR.rotation.x = -1.3; P.armL.rotation.x = -0.9;
      P.muzzle = new THREE.Vector3(0.4, 1.5, 0.75);
    } else if (type === 'runner') {
      const skin = lam(0x5a4658), dark = lam(0x241a24), bone = lam(0xd8ccb0);
      mats = [skin, dark];
      P.legL = pivot(body, -0.16, 0.7, 0); part(P.legL, 0.18, 0.7, 0.22, dark, 0, -0.35, 0);
      P.legR = pivot(body, 0.16, 0.7, 0); part(P.legR, 0.18, 0.7, 0.22, dark, 0, -0.35, 0);
      P.torso = pivot(body, 0, 0.75, 0); P.torso.rotation.x = 0.7;
      part(P.torso, 0.55, 0.65, 0.35, skin, 0, 0.32, 0);
      for (let i = 0; i < 3; i++) part(P.torso, 0.08, 0.12, 0.1, bone, 0, 0.15 + i * 0.18, -0.2);  // omurga dikenleri
      P.head = part(P.torso, 0.32, 0.3, 0.36, skin, 0, 0.75, 0.08);
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 5), bone); hornL.position.set(-0.13, 0.22, -0.02); hornL.rotation.z = 0.4; P.head.add(hornL);
      const hornR = hornL.clone(); hornR.position.x = 0.13; hornR.rotation.z = -0.4; P.head.add(hornR);
      part(P.head, 0.07, 0.04, 0.02, eyeM, -0.08, 0.03, 0.185); part(P.head, 0.07, 0.04, 0.02, eyeM, 0.08, 0.03, 0.185);
      part(P.head, 0.22, 0.06, 0.04, bone, 0, -0.1, 0.18);  // dişler
      P.armL = pivot(P.torso, -0.35, 0.55, 0); part(P.armL, 0.13, 0.8, 0.15, skin, 0, -0.4, 0); part(P.armL, 0.16, 0.14, 0.12, bone, 0, -0.85, 0.03);
      P.armR = pivot(P.torso, 0.35, 0.55, 0); part(P.armR, 0.13, 0.8, 0.15, skin, 0, -0.4, 0); part(P.armR, 0.16, 0.14, 0.12, bone, 0, -0.85, 0.03);
    } else if (type === 'brute') {
      const skin = lam(0x6a4a80), plate = lam(0x4a4a52), dark = lam(0x241830);
      mats = [skin, plate, dark];
      P.legL = pivot(body, -0.38, 1.1, 0); part(P.legL, 0.42, 1.1, 0.46, dark, 0, -0.55, 0);
      P.legR = pivot(body, 0.38, 1.1, 0); part(P.legR, 0.42, 1.1, 0.46, dark, 0, -0.55, 0);
      part(body, 1.35, 1.15, 0.9, skin, 0, 1.7, 0);
      part(body, 1.0, 0.5, 0.2, plate, 0, 1.95, 0.45);
      P.core = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xff7010 })); P.core.position.set(0, 1.55, 0.46); body.add(P.core);
      P.head = part(body, 0.42, 0.4, 0.42, skin, 0, 2.45, 0.15);
      part(P.head, 0.09, 0.06, 0.02, eyeM, -0.1, 0.04, 0.215); part(P.head, 0.09, 0.06, 0.02, eyeM, 0.1, 0.04, 0.215);
      P.armL = pivot(body, -0.85, 2.1, 0); part(P.armL, 0.38, 1.2, 0.4, skin, 0, -0.6, 0); part(P.armL, 0.5, 0.4, 0.5, plate, 0, -1.25, 0);
      P.armR = pivot(body, 0.85, 2.1, 0); part(P.armR, 0.38, 1.2, 0.4, skin, 0, -0.6, 0);
      part(P.armR, 0.08, 0.6, 0.7, lam(0x9aa0a4), 0, -1.35, 0.25);   // satır
      P.muzzle = new THREE.Vector3(0, 1.55, 0.6);
    } else { // skull
      if (!skullTex) skullTex = TEX.get('skull');
      const bone = lam(0xd8ccb0), face = lam(0xffffff, { map: skullTex });
      mats = [bone, face];
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), [bone, bone, bone, bone, face, bone]);
      head.position.y = 0.45; body.add(head); P.head = head;
      P.jaw = part(body, 0.5, 0.15, 0.5, bone, 0, 0.05, 0.05);
      const hornM = lam(0x2a1a10);
      for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), hornM); h.position.set(s * 0.38, 0.8, 0); h.rotation.z = -s * 0.6; body.add(h); }
    }
    g.traverse(o => { if (o.isMesh) o.userData.enemy = true; });
    // okunabilirlik: hafif öz ışık + kafanın üstünde türe göre renkli hedef işareti (ekranda sabit boy, sisten etkilenmez)
    for (const m of mats) { m.userData.base = m.color.clone().multiplyScalar(0.22); m.emissive.copy(m.userData.base); }
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('marker'), color: MARK[type], sizeAttenuation: false, depthWrite: false, fog: false, transparent: true }));
    marker.scale.set(0.075, 0.075, 1); g.add(marker);
    return { g, P, mats, marker };
  }

  function spawn(type, pos) {
    pending.push({ type, pos: pos.clone(), t: 0.75 });
    FX.teleport(pos);
    G.sfx('spawn');
  }

  function create(type, pos) {
    const T = ETYPES[type];
    const { g, P, mats, marker } = buildModel(type);
    const e = {
      type, T, g, P, mats, marker, pos: pos.clone(), vel: new THREE.Vector3(), hp: T.hp * (1 + G.difficulty * 0.08), maxHp: T.hp,
      r: T.r, h: T.h, dead: false, deadT: 0, flash: 0, cool: 1 + Math.random() * 1.5, meleeCool: 0, phase: Math.random() * 6,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, grounded: true, stun: 0, burn: 0, burnBy: null, charge: 0, telegraph: 0,
      stuck: 0, yaw: 0, flyH: 2 + Math.random() * 2, lastHitBy: null,
    };
    if (T.fly) e.pos.y = 2.5;
    g.position.copy(e.pos);
    G.scene.add(g);
    list.push(e);
    return e;
  }

  function aliveCount() { return list.filter(e => !e.dead).length + pending.length; }

  function los(from, to) {
    tmp.subVectors(to, from); const d = tmp.length(); tmp.divideScalar(d);
    const hit = World.raycast(from, tmp, d, 'barrel');
    return !hit;
  }

  // ışın - düşman: en yakın {e, t, head}
  function rayEnemies(o, d, maxT, extra = 0) {
    let best = null;
    for (const e of list) {
      if (e.dead) continue;
      const r = e.r + extra;
      const mn = tmp.set(e.pos.x - r, e.pos.y - extra, e.pos.z - r), mx = tmp2.set(e.pos.x + r, e.pos.y + e.h + extra, e.pos.z + r);
      let t0 = 0, t1 = maxT, ok = true;
      for (const ax of ['x', 'y', 'z']) {
        const inv = 1 / d[ax];
        let a = (mn[ax] - o[ax]) * inv, b = (mx[ax] - o[ax]) * inv;
        if (a > b) { const s = a; a = b; b = s; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && (!best || t0 < best.t)) {
        const hy = o.y + d.y * t0 - e.pos.y;
        best = { e, t: t0, head: e.type !== 'skull' && hy > e.h * 0.78 };
      }
    }
    return best;
  }

  function damage(e, amount, info = {}) {
    if (e.dead) return false;
    e.hp -= amount; e.flash = 0.08;
    e.lastHitBy = info.src;
    if (info.dir && info.knock) {
      const k = info.knock * (e.type === 'brute' ? 0.25 : 1);
      e.vel.x += info.dir.x * k; e.vel.z += info.dir.z * k; e.vel.y += Math.max(0, info.dir.y * k) + k * 0.25;
      e.stun = Math.max(e.stun, Math.min(0.5, k * 0.04)); e.grounded = false;
    }
    if (e.hp <= 0) { die(e, { ...info, overkill: -e.hp }); return true; }
    return false;
  }

  function die(e, info) {
    e.dead = true; e.deadT = 0;
    e.marker.visible = false;   // ceset: işaret kaybolur
    const center = tmp.set(e.pos.x, e.pos.y + e.h * 0.6, e.pos.z).clone();
    const gib = info.explosive || info.overkill > 30 || e.type === 'skull' || (info.src === 'kick' && Math.random() < 0.3);
    info.gib = gib;
    if (gib) {
      G.sfx('gib');
      const n = e.type === 'brute' ? 18 : 11;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(gibGeo[i % 3], e.mats[i % e.mats.length]);
        m.position.set(center.x + R(0.3), center.y + R(0.4), center.z + R(0.3));
        G.scene.add(m);
        const dir = info.dir || new THREE.Vector3();
        gibs.push({ m, v: new THREE.Vector3(R(5) + dir.x * 8, 3 + Math.random() * 7, R(5) + dir.z * 8), rv: new THREE.Vector3(R(12), R(12), R(12)), t: 0, rest: false });
      }
      while (gibs.length > 120) { const o = gibs.shift(); G.scene.remove(o.m); }
      FX.blood(center, info.dir || new THREE.Vector3(0, 1, 0), 45, 6);
      for (let i = 0; i < 3; i++) FX.decal(new THREE.Vector3(center.x + R(1.5), center.y, center.z + R(1.5)), 1 + Math.random() * 1.4);
      G.scene.remove(e.g);
    } else {
      G.sfx('die', e.type === 'brute' ? 0.5 : e.type === 'runner' ? 1.4 : 1);
      FX.blood(center, info.dir || new THREE.Vector3(0, 1, 0), 20, 3);
      FX.decal(e.pos, 1.3);
    }
    e.gibbed = gib;
    dropLoot(e);
    G.onKill(e, info);
  }

  // ---------- yapay zeka ----------
  function updateEnemy(e, dt) {
    const T = e.T, pl = G.player;
    e.marker.position.y = e.h + 0.5 + Math.sin(G.time * 4 + e.phase) * 0.08;   // hafif zıplayan işaret
    e.marker.material.color.setHex(e.flash > 0 ? 0xffffff : MARK[e.type]);
    if (e.flash > 0) {
      e.flash -= dt;
      e.mats.forEach(m => { if (!m.emissive) return; if (e.flash > 0) m.emissive.setHex(0xffffff); else if (e.burn > 0) m.emissive.setHex(0x802000); else m.emissive.copy(m.userData.base); });
    }
    if (e.dead) {
      e.deadT += dt;
      if (!e.gibbed) {
        const k = Math.min(1, e.deadT / 0.35);
        e.g.rotation.x = -k * Math.PI / 2 * (e.type === 'skull' ? 0 : 1);
        e.vel.y -= 25 * dt; e.vel.x *= Math.pow(0.05, dt); e.vel.z *= Math.pow(0.05, dt);
        move(e, dt);
        e.g.position.copy(e.pos);
        if (e.deadT > 4) e.g.position.y -= (e.deadT - 4) * 0.6;
      }
      return e.deadT > 5.5;
    }
    const toP = new THREE.Vector3(pl.pos.x - e.pos.x, 0, pl.pos.z - e.pos.z);
    const dist = toP.length(); toP.divideScalar(dist || 1);
    const eye = new THREE.Vector3(e.pos.x, e.pos.y + e.h * 0.85, e.pos.z);
    const pEye = new THREE.Vector3(pl.pos.x, pl.pos.y + 1.5, pl.pos.z);
    e.cool -= dt; e.meleeCool -= dt; e.stun -= dt; e.strafeT -= dt;
    if (e.strafeT < 0) { e.strafeT = 1 + Math.random() * 2; if (Math.random() < 0.5) e.strafe *= -1; }

    // yanma
    if (e.burn > 0) {
      e.burn -= dt; FX.fire(new THREE.Vector3(e.pos.x, e.pos.y + e.h * 0.5, e.pos.z), 2, e.r);
      if (damage(e, 22 * dt, { src: e.burnBy || 'burn' })) return false;
      if (e.burn <= 0) e.mats.forEach(m => m.emissive && m.emissive.copy(m.userData.base));
    }

    let want = new THREE.Vector3(), spd = T.speed;
    if (e.burn > 0 && e.type !== 'brute') { // panikle koş
      want.set(Math.sin(G.time * 3 + e.phase), 0, Math.cos(G.time * 2.3 + e.phase)); spd *= 1.2;
    } else if (e.type === 'grunt') {
      const [lo, hi] = T.prefer;
      if (dist > hi) want.copy(toP); else if (dist < lo) want.copy(toP).negate();
      want.addScaledVector(new THREE.Vector3(-toP.z, 0, toP.x), e.strafe * 0.9);
    } else if (e.type === 'runner') {
      want.copy(toP).addScaledVector(new THREE.Vector3(-toP.z, 0, toP.x), Math.sin(G.time * 3 + e.phase) * 0.5);
      if (dist < 7 && dist > 2.5 && e.grounded && e.cool < 0) {
        e.cool = 1.6 + Math.random(); e.vel.set(toP.x * 17, 6.5, toP.z * 17); e.grounded = false; e.stun = 0.4;
      }
    } else if (e.type === 'brute') {
      want.copy(toP);
    } else if (e.type === 'skull') {
      want.copy(toP).addScaledVector(new THREE.Vector3(-toP.z, 0, toP.x), e.strafe);
      if (e.charge > 0) { e.charge -= dt; }
      else if (dist < 16 && e.cool < 0 && los(eye, pEye)) {
        e.cool = 2.5 + Math.random() * 2; e.charge = 0.9;
        tmp2.subVectors(pEye, e.pos).normalize(); e.vel.copy(tmp2).multiplyScalar(19); G.sfx('enemyShot');
      }
    }
    want.y = 0; if (want.lengthSq() > 0) want.normalize();

    // hareket
    if (T.fly) {
      if (e.charge <= 0 && e.stun <= 0) {
        const ty = Math.max(1.2, pl.pos.y + e.flyH + Math.sin(G.time * 2 + e.phase) * 0.6);
        e.vel.x += (want.x * spd - e.vel.x) * Math.min(1, dt * 3);
        e.vel.z += (want.z * spd - e.vel.z) * Math.min(1, dt * 3);
        e.vel.y += ((ty - e.pos.y) * 2 - e.vel.y) * Math.min(1, dt * 3);
      }
      FX.fire(new THREE.Vector3(e.pos.x, e.pos.y + 0.5, e.pos.z), 1, 0.3);
    } else {
      if (e.stun <= 0 && e.grounded) {
        const a = Math.min(1, dt * 10);
        e.vel.x += (want.x * spd - e.vel.x) * a; e.vel.z += (want.z * spd - e.vel.z) * a;
      } else if (e.grounded) { e.vel.x *= Math.pow(0.02, dt); e.vel.z *= Math.pow(0.02, dt); }
      e.vel.y -= 25 * dt;
    }
    const before = e.pos.clone();
    move(e, dt);
    // takılma -> zıpla / yön değiştir
    const moved = Math.hypot(e.pos.x - before.x, e.pos.z - before.z);
    if (!T.fly && e.grounded && want.lengthSq() > 0 && moved < spd * dt * 0.25) {
      e.stuck += dt; if (e.stuck > 0.35) { e.stuck = 0; e.strafe *= -1; e.strafeT = 1.2; if (e.type !== 'brute') { e.vel.y = 7.5; e.grounded = false; } }
    } else e.stuck = 0;

    // lav
    const ch = G.chunk;
    if (ch && !T.fly && e.pos.y < 0.1) for (const l of ch.lavas) if (e.pos.x > l.x0 && e.pos.x < l.x1 && e.pos.z > l.z0 && e.pos.z < l.z1) { e.burn = Math.max(e.burn, 1); e.burnBy = 'lava'; }

    // yakın dövüş
    const d3 = Math.hypot(pl.pos.x - e.pos.x, (pl.pos.y + 0.9) - (e.pos.y + e.h * 0.5), pl.pos.z - e.pos.z);
    if (T.melee && e.meleeCool < 0 && d3 < e.r + 0.9 + (e.type === 'brute' ? 0.9 : 0)) {
      e.meleeCool = e.type === 'brute' ? 1.4 : 0.8;
      G.hurt(T.melee, e.pos);
      if (e.type === 'skull') { e.vel.multiplyScalar(-0.6); e.charge = 0; }
      if (e.type === 'brute') { e.swing = 0.4; G.knock(toP, 9, 4); }
    }
    // menzilli saldırı (önce gözler parlar)
    if (T.ranged && e.cool < 0 && e.burn <= 0 && dist < 35) {
      if (e.telegraph <= 0) {
        if (los(eye, pEye)) e.telegraph = 0.45; else e.cool = 0.5;
      }
    }
    if (e.telegraph > 0) {
      e.telegraph -= dt;
      const glow = new THREE.Vector3(e.pos.x, e.pos.y + e.h * 0.85, e.pos.z);
      if (Math.random() < 0.5) FX.glowDot(glow.addScaledVector(toP, e.r + 0.05), T.proj, 0.18, 0.08);
      if (e.telegraph <= 0) {
        e.cool = T.rate[0] + Math.random() * (T.rate[1] - T.rate[0]);
        const mz = e.P.muzzle;
        const origin = new THREE.Vector3(mz.x, mz.y, mz.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), e.yaw).add(e.pos);
        const lead = tmp2.copy(pl.vel).multiplyScalar(Math.min(0.6, dist / T.projSpeed) * 0.6);
        const target = new THREE.Vector3(pl.pos.x + lead.x, pl.pos.y + 1.1, pl.pos.z + lead.z);
        const n = T.spread || 1;
        for (let i = 0; i < n; i++) {
          const dir = target.clone().sub(origin).normalize();
          if (n > 1) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (n - 1) / 2) * 0.13);
          fireProj(origin, dir, T.projSpeed, T.projDmg, T.proj, e.type === 'brute' ? 0.35 : 0.22);
        }
        G.sfx('enemyShot');
      }
    }

    // yön + animasyon
    const targetYaw = Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z);
    let dy = targetYaw - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += dy * Math.min(1, dt * 8);
    e.g.rotation.y = e.yaw;
    const hs = Math.hypot(e.vel.x, e.vel.z);
    e.phase += dt * hs * 1.6;
    const P = e.P;
    if (P.legL) { const s = Math.sin(e.phase) * Math.min(1, hs / 3) * 0.7; P.legL.rotation.x = s; P.legR.rotation.x = -s; }
    if (e.type === 'runner') { const s = Math.sin(e.phase) * 0.8; P.armL.rotation.x = -0.6 - s; P.armR.rotation.x = -0.6 + s; }
    if (e.type === 'brute') {
      const s = Math.sin(e.phase) * 0.3; P.armL.rotation.x = s;
      if (e.swing > 0) { e.swing -= dt; P.armR.rotation.x = -2.6 * Math.sin((0.4 - e.swing) / 0.4 * Math.PI); } else P.armR.rotation.x = -s;
      P.core.material.color.setHex(e.telegraph > 0 ? 0xffff80 : 0xff7010);
    }
    if (e.type === 'grunt') { const s = Math.sin(e.phase) * 0.4; P.armL.rotation.x = -0.9 + s; }
    if (e.type === 'skull') { P.jaw.position.y = 0.05 - (e.charge > 0 ? 0.12 : Math.abs(Math.sin(G.time * 6)) * 0.05); e.g.rotation.x = e.charge > 0 ? 0.3 : 0; }
    e.g.position.copy(e.pos);
    return false;
  }

  function move(e, dt) {
    const step = e.grounded && !e.T.fly ? 0.55 : 0;
    World.moveAxis(e.pos, e.r, e.h, 'x', e.vel.x * dt, step);
    World.moveAxis(e.pos, e.r, e.h, 'z', e.vel.z * dt, step);
    const hy = World.moveAxis(e.pos, e.r, e.h, 'y', e.vel.y * dt, 0);
    if (hy) { if (e.vel.y < 0) e.grounded = true; e.vel.y = 0; }
    else if (!e.T.fly) e.grounded = false;
    if (e.pos.y < -10) { e.hp = 0; e.dead = true; e.deadT = 99; G.scene.remove(e.g); }
  }

  function separate() {
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]; if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          const ax = dx / d * push, az = dz / d * push;
          World.moveAxis(a.pos, a.r, a.h, 'x', -ax, 0); World.moveAxis(a.pos, a.r, a.h, 'z', -az, 0);
          World.moveAxis(b.pos, b.r, b.h, 'x', ax, 0); World.moveAxis(b.pos, b.r, b.h, 'z', az, 0);
        }
      }
    }
  }

  // ---------- düşman mermileri ----------
  function fireProj(o, dir, speed, dmg, color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex || (glowTex = TEX.get('glow')), color: new THREE.Color(...color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(size * 3); s.position.copy(o); G.scene.add(s);
    projs.push({ m: s, vel: dir.clone().multiplyScalar(speed), dmg, color, t: 0, size });
  }

  function updateProjs(dt) {
    const pl = G.player;
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i]; p.t += dt;
      const step = p.vel.length() * dt; const dir = tmp.copy(p.vel).normalize();
      const hit = World.raycast(p.m.position, dir, step);
      let kill = p.t > 6;
      if (hit) { tmp2.copy(p.m.position).addScaledVector(dir, hit.t); FX.sparks(tmp2, 8, p.color); kill = true; }
      else p.m.position.addScaledVector(p.vel, dt);
      FX.trail(p.m.position, p.color, p.size * 0.5);
      const dx = pl.pos.x - p.m.position.x, dy = pl.pos.y + 0.9 - p.m.position.y, dz = pl.pos.z - p.m.position.z;
      if (!kill && dx * dx + dz * dz < 0.36 && Math.abs(dy) < 1.0) { G.hurt(p.dmg, p.m.position); FX.sparks(p.m.position, 10, p.color); kill = true; }
      if (kill) { G.scene.remove(p.m); p.m.material.dispose(); projs.splice(i, 1); }
    }
  }

  // ---------- roketler ----------
  const rocketGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6); rocketGeo.rotateX(Math.PI / 2);
  const rocketMat = new THREE.MeshBasicMaterial({ color: 0x8a9070 });
  function fireRocket(o, dir) {
    const m = new THREE.Mesh(rocketGeo, rocketMat); m.position.copy(o); m.lookAt(o.clone().add(dir)); G.scene.add(m);
    rockets.push({ m, vel: dir.clone().multiplyScalar(36), t: 0 });
  }
  function updateRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.t += dt;
      const step = r.vel.length() * dt; const dir = tmp.copy(r.vel).normalize().clone();
      const wh = World.raycast(r.m.position, dir, step + 0.2);
      const eh = rayEnemies(r.m.position, dir, step + 0.2, 0.25);
      let at = null;
      if (wh && (!eh || wh.t < eh.t)) at = r.m.position.clone().addScaledVector(dir, wh.t - 0.15);
      else if (eh) at = r.m.position.clone().addScaledVector(dir, eh.t);
      if (at || r.t > 5) {
        G.scene.remove(r.m); rockets.splice(i, 1);
        explode(at || r.m.position, 4.8, 130, 'rocket', eh && eh.e);
        continue;
      }
      r.m.position.addScaledVector(r.vel, dt);
      FX.trail(r.m.position, [1, 0.6, 0.2], 0.2);
      FX.smoke(r.m.position, 1, { size: 0.25, life: 0.9, color: [0.5, 0.5, 0.5], a: 0.5, grow: 1 });
    }
  }

  // ---------- patlama ----------
  function explode(p, radius, dmg, src, direct) {
    FX.explosion(p, radius / 4.8);
    G.sfx('explosion');
    G.flashLight(p);
    const pl = G.player;
    const pc = new THREE.Vector3(pl.pos.x, pl.pos.y + 0.9, pl.pos.z);
    const pd = pc.distanceTo(p);
    G.shake(Math.max(0.15, 1.2 - pd / 15));
    for (const e of list) {
      if (e.dead) continue;
      const c = new THREE.Vector3(e.pos.x, e.pos.y + e.h * 0.5, e.pos.z);
      const d = Math.max(0, c.distanceTo(p) - e.r);
      if (d > radius && e !== direct) continue;
      const k = e === direct ? 1 : 1 - d / radius;
      const dir = c.sub(p).normalize(); dir.y = Math.max(dir.y, 0.3);
      damage(e, dmg * k, { src, dir, knock: 14 * k, explosive: true });
    }
    // variller zincirleme
    if (G.chunk) for (const ch of World.chunks) for (const b of ch.barrels) {
      if (!b.alive || b.fuse >= 0) continue;
      if (b.pos.distanceTo(p) < radius + 0.4) b.fuse = 0.12 + Math.random() * 0.1;
    }
    // oyuncu: roket zıplaması
    if (pd < radius) {
      const k = 1 - pd / radius;
      const dir = pc.sub(p); if (dir.lengthSq() < 0.01) dir.set(0, 1, 0); dir.normalize();
      G.knock(dir, 15 * k, 9 * k);
      G.hurt(src === 'rocket' ? dmg * k * 0.12 : dmg * k * 0.35, p, true);
    }
  }

  function barrelHit(b, dmg, src) {
    if (!b.alive) return;
    b.hp -= dmg; b.lastSrc = src;
    if (b.hp <= 0 && b.fuse < 0) b.fuse = 0.05;
  }
  function updateBarrels(dt) {
    for (const ch of World.chunks) for (const b of ch.barrels) {
      if (!b.alive || b.fuse < 0) continue;
      b.fuse -= dt;
      if (Math.random() < 0.5) FX.fire(b.pos, 1, 0.3);
      if (b.fuse <= 0) {
        b.alive = false; b.solid.active = false; ch.group.remove(b.mesh);
        explode(b.pos.clone().setY(0.8), 5.5, 160, 'barrel');
      }
    }
  }

  // ---------- fırlatılan izmarit ----------
  const cigGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6); cigGeo.rotateX(Math.PI / 2);
  const cigMat = new THREE.MeshBasicMaterial({ color: 0xf0ece0 });
  function throwCig(o, vel) {
    const m = new THREE.Mesh(cigGeo, cigMat); m.position.copy(o); G.scene.add(m);
    cigs.push({ m, vel: vel.clone(), t: 0, landed: false });
  }
  function updateCigs(dt) {
    for (let i = cigs.length - 1; i >= 0; i--) {
      const c = cigs[i]; c.t += dt;
      if (!c.landed) {
        c.vel.y -= 18 * dt;
        const sp = c.vel.length(), dir = tmp.copy(c.vel).normalize().clone();
        const hit = World.raycast(c.m.position, dir, sp * dt + 0.05);
        if (hit) {
          c.m.position.addScaledVector(dir, Math.max(0, hit.t - 0.03));
          if (hit.solid.barrel) { barrelHit(hit.solid.barrel, 999, 'cig'); G.feed('İZMARİT → VARİL', true); remove(i); continue; }
          if (hit.normal.y > 0.5 && sp < 6) { c.landed = true; G.sfx('sizzle'); FX.sparks(c.m.position, 12, [1, 0.5, 0.1]); }
          else { c.vel.reflect(hit.normal).multiplyScalar(0.45); FX.sparks(c.m.position, 6, [1, 0.5, 0.1]); }
        } else c.m.position.addScaledVector(c.vel, dt);
        c.m.rotation.x += dt * 25; c.m.rotation.y += dt * 9;
        FX.trail(c.m.position, [1, 0.45, 0.1], 0.09);
        // düşmana isabet
        const eh = rayEnemies(c.m.position, dir, 0.01, 0.35);
        if (eh) {
          eh.e.burn = 5.5; eh.e.burnBy = 'cig'; G.sfx('sizzle'); FX.sparks(c.m.position, 20, [1, 0.5, 0.1]);
          damage(eh.e, 15, { src: 'cig', dir, knock: 3 });
          G.feed('ATEŞE VERİLDİ', true);
          remove(i); continue;
        }
      } else {
        if (Math.random() < 0.3) FX.smoke(c.m.position, 1, { size: 0.05, life: 1.5, a: 0.25, grow: 0.15 });
        if (Math.random() < 0.2) FX.glowDot(c.m.position, [1, 0.4, 0.05], 0.06, 0.2);
        // yere düşen izmarit varil yakınındaysa
        for (const b of G.chunk ? G.chunk.barrels : []) if (b.alive && b.fuse < 0 && b.pos.distanceTo(c.m.position) < 1.1) { barrelHit(b, 999, 'cig'); G.feed('İZMARİT → VARİL', true); }
      }
      if (c.t > 6) remove(i);
    }
    function remove(i) { G.scene.remove(cigs[i].m); cigs.splice(i, 1); }
  }

  // ---------- et parçaları ----------
  function updateGibs(dt) {
    for (const g of gibs) {
      g.t += dt;
      if (g.rest) { if (g.t > 8) g.m.position.y -= dt * 0.1; continue; }
      g.v.y -= 22 * dt; g.m.position.addScaledVector(g.v, dt);
      g.m.rotation.x += g.rv.x * dt; g.m.rotation.y += g.rv.y * dt; g.m.rotation.z += g.rv.z * dt;
      if (Math.random() < 0.3) FX.blood(g.m.position, new THREE.Vector3(), 1, 0.5);
      if (g.m.position.y < 0.08) {
        g.m.position.y = 0.08;
        if (Math.abs(g.v.y) < 2) { g.rest = true; FX.decal(g.m.position, 0.6); }
        g.v.y *= -0.35; g.v.x *= 0.6; g.v.z *= 0.6; g.rv.multiplyScalar(0.6);
      }
    }
  }

  // ---------- eşyalar ----------
  const PICK = {
    health:  { color: 0xff2020, glow: [1, 0.1, 0.1] },
    bullets: { color: 0xd0b020, glow: [1, 0.9, 0.2] },
    rockets: { color: 0x70a040, glow: [0.4, 1, 0.3] },
  };
  function pickupMesh(kind) {
    const g = new THREE.Group();
    const M = c => new THREE.MeshBasicMaterial({ color: c });
    if (kind === 'health') { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.12), M(0xff2020)), new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), M(0xff2020))); }
    else { const n = kind === 'rockets' ? 1 : 3; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(kind === 'rockets' ? 0.14 : 0.08, kind === 'rockets' ? 0.45 : 0.22, kind === 'rockets' ? 0.14 : 0.08), M(PICK[kind].color)); m.position.x = (i - (n - 1) / 2) * 0.12; g.add(m); } }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: new THREE.Color(...PICK[kind].glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    s.scale.setScalar(1.0); g.add(s);
    return g;
  }
  function drop(kind, p) {
    const m = pickupMesh(kind); m.position.copy(p); G.scene.add(m);
    pickups.push({ kind, m, vel: new THREE.Vector3(R(3), 5 + Math.random() * 3, R(3)), t: 0, base: 0 });
  }
  function dropLoot(e) {
    const p = new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z);
    const n = e.type === 'brute' ? 4 : 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) drop(G.needs(), p);
  }
  function updatePickups(dt) {
    const pl = G.player, pp = new THREE.Vector3(pl.pos.x, pl.pos.y + 0.9, pl.pos.z);
    for (let i = pickups.length - 1; i >= 0; i--) {
      const k = pickups[i]; k.t += dt;
      const d = k.m.position.distanceTo(pp);
      if (k.t > 0.5 && d < 7) { // mıknatıs
        tmp.subVectors(pp, k.m.position).normalize();
        k.vel.lerp(tmp.multiplyScalar(20), Math.min(1, dt * 8));
      } else {
        k.vel.y -= 20 * dt;
      }
      k.m.position.addScaledVector(k.vel, dt);
      const fl = World.raycast(k.m.position, new THREE.Vector3(0, -1, 0), 0.4);
      if (fl && k.vel.y < 0 && d >= 7) { k.m.position.y += 0.4 - fl.t; k.vel.set(0, 0, 0); }
      k.m.rotation.y += dt * 3;
      if (d < 1.0 && k.t > 0.3) {
        if (G.collect(k.kind)) { G.scene.remove(k.m); pickups.splice(i, 1); }
      }
      if (k.t > 40) { G.scene.remove(k.m); pickups.splice(i, 1); }
    }
  }

  return {
    list, pending, ETYPES, spawn, aliveCount, rayEnemies, damage, explode, barrelHit, fireRocket, throwCig, drop,
    update(dt) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i]; p.t -= dt;
        if (Math.random() < 0.6) FX.teleport(p.pos);
        if (p.t <= 0) { pending.splice(i, 1); create(p.type, p.pos); FX.explosion(p.pos.clone().setY(1), 0.25); }
      }
      for (let i = list.length - 1; i >= 0; i--) {
        if (updateEnemy(list[i], dt)) { G.scene.remove(list[i].g); list.splice(i, 1); }
      }
      separate();
      updateProjs(dt); updateRockets(dt); updateBarrels(dt); updateCigs(dt); updateGibs(dt); updatePickups(dt);
    },
    clear() {
      for (const e of list) G.scene.remove(e.g);
      for (const arr of [projs, rockets, gibs, cigs, pickups]) { for (const o of arr) G.scene.remove(o.m); arr.length = 0; }
      list.length = 0; pending.length = 0;
    },
  };
})();
