// Sonsuz arena zinciri: koridor -> arena -> koridor -> ... (−Z yönünde ilerler)
// Çarpışma: eksen hizalı kutular (AABB). Mermi/ışın: slab testi.
const World = (() => {
  let scene;
  const solids = [];
  const chunks = [];
  const matCache = {};
  const lightPool = [];
  let hemi;

  const THEMES = [
    { name: 'tech', wall: 'metal', wall2: 'brick', floor: 'floor', ceil: 'ceiling', fog: 0x07090c, light: 0xa8ccff, sky: 0x2a3440, ground: 0x141414, lava: 0, height: 6.5 },
    { name: 'ruin', wall: 'brick', wall2: 'metal', floor: 'floor', ceil: 'ceiling', fog: 0x120705, light: 0xffa050, sky: 0x40281c, ground: 0x1a0c08, lava: 1, height: 7.5 },
    { name: 'hell', wall: 'hellrock', wall2: 'flesh', floor: 'hellrock', ceil: null, fog: 0x260403, light: 0xff4018, sky: 0x5a1408, ground: 0x200404, lava: 2, height: 10 },
  ];
  const themeFor = i => i < 2 ? THEMES[0] : i < 5 ? THEMES[1] : i < 9 ? THEMES[2] : THEMES[[0, 1, 2, 2][(i * 7) % 4]];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function mat(tex, opts = {}) {
    const key = tex + JSON.stringify(opts);
    if (matCache[key]) return matCache[key];
    let m;
    if (opts.basic) m = new THREE.MeshBasicMaterial({ map: tex ? TEX.get(tex) : null, color: opts.color ?? 0xffffff, fog: opts.fog ?? true });
    else m = new THREE.MeshPhongMaterial({ map: TEX.get(tex), color: opts.color ?? 0xffffff, specular: 0x000000, shininess: 2, emissive: opts.emissive ?? 0x000000 });
    return (matCache[key] = m);
  }

  // UV'leri dünya boyutuna göre ölçeklenmiş kutu
  function boxGeo(w, h, d, s = 2) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s);
    }
    return g;
  }

  function addBox(chunk, x0, y0, z0, x1, y1, z1, material, { solid = true, s = 2, kind = 'wall' } = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    let mesh = null;
    if (material) {
      mesh = new THREE.Mesh(boxGeo(w, h, d, s), material);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      chunk.group.add(mesh);
    }
    let sol = null;
    if (solid) {
      sol = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), active: true, kind, mesh, chunk };
      solids.push(sol); chunk.solids.push(sol);
    }
    return { mesh, solid: sol };
  }

  function addPlane(chunk, x, y, z, w, d, material, rotZ = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2; m.rotation.z = rotZ; m.position.set(x, y, z);
    chunk.group.add(m); return m;
  }

  function addDoor(chunk, zMin, zMax, open, room) {
    const m = new THREE.Mesh(boxGeo(4, 4, zMax - zMin - 0.3, 4), mat('door'));
    m.position.set(0, 2 + open * 4, (zMin + zMax) / 2);
    chunk.group.add(m);
    const sol = { min: new THREE.Vector3(-2, 0, zMin), max: new THREE.Vector3(2, 4, zMax), active: open < 0.5, kind: 'door', mesh: m, chunk };
    solids.push(sol); chunk.solids.push(sol);
    return { mesh: m, solid: sol, open, target: open, room };
  }

  function lightFixture(chunk, x, y, z, color, room) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.5), new THREE.MeshBasicMaterial({ map: TEX.get('light'), color }));
    m.position.set(x, y, z); chunk.group.add(m);
    room.lights.push({ pos: new THREE.Vector3(x, y - 0.6, z), mesh: m, flicker: Math.random() < 0.25 });
  }

  function overlapsAny(x0, y0, z0, x1, y1, z1) {
    for (const s of solids) {
      if (!s.active) continue;
      if (x1 <= s.min.x || x0 >= s.max.x || y1 <= s.min.y || y0 >= s.max.y || z1 <= s.min.z || z0 >= s.max.z) continue;
      return true;
    }
    return false;
  }

  // --------- bir parça üret: koridor + arena ---------
  function build(index, z0) {
    const theme = themeFor(index);
    const chunk = { index, group: new THREE.Group(), solids: [], z0, theme, lights: [], barrels: [], lavas: [], spawns: [], decals: [] };
    scene.add(chunk.group);
    const wallM = mat(theme.wall), wall2M = mat(theme.wall2), floorM = mat(theme.floor);
    const ceilM = theme.ceil ? mat(theme.ceil) : null;

    // --- koridor ---
    const Lc = index === 0 ? 14 : Math.round(rand(10, 16));
    const cz1 = z0 - Lc;
    addBox(chunk, -3, -1, cz1, 3, 0, z0, floorM, { kind: 'floor' });
    addBox(chunk, -3, 4, cz1, 3, 5, z0, mat(THEMES[0].ceil));
    addBox(chunk, -3, -1, cz1, -2, 5, z0, wall2M);
    addBox(chunk, 2, -1, cz1, 3, 5, z0, wall2M);
    if (index === 0) addBox(chunk, -3, -1, z0, 3, 5, z0 + 1, wall2M);
    const corridorLights = [];
    for (let z = z0 - 3; z > cz1 + 1; z -= 5) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.4), new THREE.MeshBasicMaterial({ map: TEX.get('light'), color: theme.light }));
      m.position.set(0, 3.95, z); chunk.group.add(m); corridorLights.push(new THREE.Vector3(0, 3.3, z));
    }
    chunk.corridorLights = corridorLights;
    chunk.corridor = { z0, z1: cz1 };

    // --- arena ---
    const W = 2 * Math.round(rand(11, 17) + Math.min(index, 6) * 0.5);
    const L = Math.round(rand(28, 40) + Math.min(index, 8));
    const H = theme.height;
    const rz0 = cz1, rz1 = rz0 - L, hw = W / 2;
    Object.assign(chunk, { W, L, H, rz0, rz1, hw, z1: rz1 });
    addBox(chunk, -hw - 1, -1, rz1, hw + 1, 0, rz0, floorM, { kind: 'floor', s: theme.floor === 'hellrock' ? 3 : 2 });
    if (ceilM) addBox(chunk, -hw - 1, H, rz1, hw + 1, H + 1, rz0, ceilM, { s: 3 });
    else addBox(chunk, -hw - 1, H + 3, rz1, hw + 1, H + 4, rz0, null);     // görünmez tavan (gökyüzü)
    // yan duvarlar
    addBox(chunk, -hw - 1, 0, rz1, -hw, H + 3, rz0, wallM, { s: 3 });
    addBox(chunk, hw, 0, rz1, hw + 1, H + 3, rz0, wallM, { s: 3 });
    // güney (giriş) ve kuzey (çıkış) duvarları, 4m kapı boşluğu
    for (const [za, zb] of [[rz0 - 1, rz0], [rz1, rz1 + 1]]) {
      addBox(chunk, -hw, 0, za, -2, H + 3, zb, wallM, { s: 3 });
      addBox(chunk, 2, 0, za, hw, H + 3, zb, wallM, { s: 3 });
      addBox(chunk, -2, 4, za, 2, H + 3, zb, wallM, { s: 3 });
    }
    // duvar diplerinde süpürgelik / kan
    chunk.entryDoor = addDoor(chunk, rz0 - 1, rz0, 1, chunk);
    chunk.exitDoor = addDoor(chunk, rz1, rz1 + 1, 0, chunk);
    // çıkış kapısı lambası
    chunk.exitLamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.2), new THREE.MeshBasicMaterial({ color: 0xff1000 }));
    chunk.exitLamp.position.set(0, 4.5, rz1 + 1.12); chunk.group.add(chunk.exitLamp);

    // ışık armatürleri
    const lz = [rz0 - L * 0.22, rz0 - L * 0.5, rz0 - L * 0.78];
    for (const z of lz) {
      if (ceilM) { lightFixture(chunk, -hw * 0.5, H - 0.08, z, theme.light, chunk); lightFixture(chunk, hw * 0.5, H - 0.08, z, theme.light, chunk); }
      else { lightFixture(chunk, -hw + 0.3, 5, z, theme.light, chunk); lightFixture(chunk, hw - 0.3, 5, z, theme.light, chunk); }
    }
    chunk.lights.forEach(l => { if (!ceilM) l.mesh.rotation.z = Math.PI / 2; });

    // --- iç düzen ---
    const ix0 = -hw + 1.5, ix1 = hw - 1.5, iz0 = rz0 - 4, iz1 = rz1 + 4;
    const freeLane = (x, z) => Math.abs(x) < 3 && (z > rz0 - 6 || z < rz1 + 6);
    const layout = index === 0 ? 'crates' : pick(['pillars', 'crates', 'platform', 'mixed', 'platform']);
    const crateM = mat('crate'), pillarM = theme.name === 'hell' ? mat('flesh') : wall2M;

    const crate = (x, z, size = 1.3, stack = 1) => {
      for (let k = 0; k < stack; k++) addBox(chunk, x - size / 2, k * size, z - size / 2, x + size / 2, (k + 1) * size, z + size / 2, crateM, { s: size, kind: 'crate' });
    };
    if (layout === 'pillars' || layout === 'mixed') {
      const sx = layout === 'mixed' ? hw * 0.7 : 6.5;
      for (let x = -hw + 4.5; x <= hw - 4.5; x += sx) for (let z = rz0 - 7; z > rz1 + 6; z -= 7.5) {
        if (Math.abs(x) < 2.5) continue;
        addBox(chunk, x - 0.8, 0, z - 0.8, x + 0.8, H, z + 0.8, pillarM, { s: 2 });
      }
    }
    if (layout === 'crates' || layout === 'mixed') {
      const n = Math.round(rand(7, 12) + W / 6);
      for (let i = 0; i < n; i++) {
        const x = rand(ix0 + 1, ix1 - 1), z = rand(iz1 + 1, iz0 - 1);
        if (freeLane(x, z) || overlapsAny(x - 1, 0, z - 1, x + 1, 3, z + 1)) continue;
        crate(x, z, Math.random() < 0.3 ? 1.8 : 1.3, Math.random() < 0.3 ? 2 : 1);
      }
    }
    if (layout === 'platform') {
      const pw = Math.min(10, W * 0.4), pl = Math.min(12, L * 0.3), pz = (rz0 + rz1) / 2, ph = 1.6;
      addBox(chunk, -pw / 2, 0, pz - pl / 2, pw / 2, ph, pz + pl / 2, mat(theme.wall2), { s: 2 });
      for (let k = 0; k < 4; k++) { // basamaklar (adım yüksekliği 0.4)
        const h = (k + 1) * 0.4, off = (4 - k) * 0.7;
        addBox(chunk, -1.6, 0, pz + pl / 2, 1.6, h, pz + pl / 2 + off, floorM, { kind: 'step' });
        addBox(chunk, -1.6, 0, pz - pl / 2 - off, 1.6, h, pz - pl / 2, floorM, { kind: 'step' });
      }
      const pg = addPlane(chunk, 0, ph + 0.02, pz, Math.min(pw, pl) * 0.9, Math.min(pw, pl) * 0.9,
        new THREE.MeshBasicMaterial({ map: TEX.get('pentagram'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      chunk.pentagram = pg;
      chunk.platform = { y: ph, x0: -pw / 2, x1: pw / 2, z0: pz - pl / 2, z1: pz + pl / 2 };
      for (const sx of [-1, 1]) crate(sx * (hw - 3), rand(iz1 + 2, iz0 - 2), 1.3, 1);
    } else if (theme.name !== 'tech') {
      const pg = addPlane(chunk, 0, 0.02, (rz0 + rz1) / 2, 9, 9,
        new THREE.MeshBasicMaterial({ map: TEX.get('pentagram'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      chunk.pentagram = pg;
    }

    // lav havuzları
    const lavaN = theme.lava ? Math.round(rand(1, 2 + theme.lava)) : 0;
    for (let i = 0; i < lavaN; i++) {
      const w = rand(3, 6), d = rand(3, 7);
      const x = Math.random() < 0.5 ? rand(ix0, -3 - w) : rand(3, ix1 - w), z = rand(iz1, iz0 - d);
      if (overlapsAny(x, 0, z, x + w, 1, z + d)) continue;
      const m = addPlane(chunk, x + w / 2, 0.03, z + d / 2, w, d, mat('lava', { basic: true, fog: false }));
      m.material = m.material.clone(); m.material.map = TEX.get('lava').clone(); m.material.map.needsUpdate = true;
      m.material.map.repeat.set(w / 3, d / 3);
      chunk.lavas.push({ x0: x, x1: x + w, z0: z, z1: z + d, mesh: m });
    }

    // patlayıcı variller
    const nb = Math.round(rand(2, 5));
    for (let i = 0; i < nb; i++) {
      const x = rand(ix0, ix1), z = rand(iz1, iz0);
      if (freeLane(x, z) || overlapsAny(x - 0.6, 0, z - 0.6, x + 0.6, 1.3, z + 0.6)) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 10), mat('barrel'));
      m.position.set(x, 0.6, z); chunk.group.add(m);
      const sol = { min: new THREE.Vector3(x - 0.42, 0, z - 0.42), max: new THREE.Vector3(x + 0.42, 1.2, z + 0.42), active: true, kind: 'barrel', mesh: m, chunk };
      solids.push(sol); chunk.solids.push(sol);
      const b = { mesh: m, solid: sol, pos: new THREE.Vector3(x, 0.6, z), hp: 20, alive: true, fuse: -1 };
      sol.barrel = b; chunk.barrels.push(b);
    }

    // doğma noktaları
    for (let tries = 0; tries < 120 && chunk.spawns.length < 40; tries++) {
      const x = rand(ix0, ix1), z = rand(iz1, rz0 - 10);
      if (overlapsAny(x - 0.9, 0.05, z - 0.9, x + 0.9, 3, z + 0.9)) continue;
      if (chunk.lavas.some(l => x > l.x0 - 1 && x < l.x1 + 1 && z > l.z0 - 1 && z < l.z1 + 1)) continue;
      chunk.spawns.push(new THREE.Vector3(x, 0, z));
    }
    chunk.state = 'idle';
    chunks.push(chunk);
    return chunk;
  }

  function removeChunk(chunk) {
    scene.remove(chunk.group);
    chunk.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const s of chunk.solids) { const i = solids.indexOf(s); if (i >= 0) solids.splice(i, 1); }
    chunks.splice(chunks.indexOf(chunk), 1);
  }

  // --------- OFİS: açılış sahnesi. Ana zincirden ayrı (x = OX), portalla bağlanır ---------
  const OX = 200;
  const OFFICE_THEME = { name: 'office', fog: 0x0e1012, light: 0xeef2ff, sky: 0x8a90a0, ground: 0x2a2622 };
  let office = null, portalLight;
  const portalMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, open: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, open; varying vec2 vUv;
      void main(){
        vec2 q = (vUv - 0.5) * vec2(2.4, 3.2) / vec2(1.05, 1.45);
        float r = length(q) / max(open, 0.001);
        if (r > 1.2) discard;
        float a = atan(q.y, q.x);
        float sw = sin(a * 6.0 + r * 10.0 - time * 7.0) * 0.5 + 0.5;
        float sw2 = sin(a * 3.0 - r * 16.0 + time * 4.0) * 0.5 + 0.5;
        vec3 col = mix(vec3(0.06, 0.0, 0.0), vec3(1.0, 0.22, 0.02), sw * smoothstep(0.0, 0.95, r));
        col += vec3(1.0, 0.75, 0.25) * pow(sw2, 6.0) * r;
        float rim = smoothstep(0.82, 1.0, r) * (1.0 - smoothstep(1.0, 1.2, r));
        col += vec3(1.0, 0.55, 0.1) * rim * 2.0;
        col = floor(col * 6.0) / 6.0;
        gl_FragColor = vec4(col, r < 1.0 ? 1.0 : 1.0 - smoothstep(1.0, 1.2, r));
      }`,
  });

  function buildOffice() {
    const o = { index: -1, group: new THREE.Group(), solids: [], lights: [], screens: [], heads: [], theme: OFFICE_THEME, open: 0, opening: false };
    scene.add(o.group);
    const W = 18, L = 20, H = 3.4, x0 = OX - W / 2, x1 = OX + W / 2, z1 = -L;
    Object.assign(o, { x0, x1, z1, H });
    const wallM = mat('officeWall');
    const M = c => new THREE.MeshLambertMaterial({ color: c });
    const B = (w, h, d, m, x, y, z, parent = o.group) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); parent.add(k); return k; };
    const plane = (w, h, m, x, y, z, ry) => { const k = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); k.position.set(x, y, z); k.rotation.y = ry; o.group.add(k); return k; };

    addBox(o, x0 - 1, -1, z1 - 1, x1 + 1, 0, 1, mat('carpet'), { s: 3, kind: 'floor' });
    addBox(o, x0 - 1, H, z1 - 1, x1 + 1, H + 1, 1, mat('ceilingTile'), { s: 1.2 });
    addBox(o, x0 - 1, 0, z1 - 1, x0, H, 1, wallM, { s: 3 });
    addBox(o, x1, 0, z1 - 1, x1 + 1, H, 1, wallM, { s: 3 });
    addBox(o, x0, 0, 0, x1, H, 1, wallM, { s: 3 });
    addBox(o, x0, 0, z1 - 1, x1, H, z1, wallM, { s: 3 });

    // floresanlar, gece manzaralı camlar, poster, saat
    for (const z of [-3.5, -10, -16.5]) for (const x of [OX - 4.5, OX + 4.5]) lightFixture(o, x, H - 0.05, z, OFFICE_THEME.light, o);
    o.lights.forEach(l => { l.flicker = false; });
    const winM = new THREE.MeshBasicMaterial({ map: TEX.get('windowNight') });
    for (const z of [-4, -10, -16]) plane(3.6, 1.6, winM, x1 - 0.01, 1.7, z, -Math.PI / 2);
    plane(0.9, 1.2, new THREE.MeshLambertMaterial({ map: TEX.get('poster') }), x0 + 0.01, 1.8, -9, Math.PI / 2);
    plane(0.9, 0.45, new THREE.MeshBasicMaterial({ map: TEX.get('clock') }), OX - 3.4, 2.6, z1 + 0.01, 0);

    // masalar + bölmeler + çalışanlar
    const desk = (x, z, worker) => {
      addBox(o, x - 1, 0, z - 0.45, x + 1, 0.78, z + 0.45, null);                                   // çarpışma
      B(2, 0.05, 0.9, mat('desk'), x, 0.76, z);
      B(0.05, 0.74, 0.86, M(0x3a3a3e), x - 0.95, 0.37, z); B(0.05, 0.74, 0.86, M(0x3a3a3e), x + 0.95, 0.37, z);
      addBox(o, x - 1.1, 0, z - 0.62, x + 1.1, 1.35, z - 0.52, mat('cubicle'), { s: 1.5 });       // bölme
      B(0.08, 0.25, 0.08, M(0x1a1a1c), x, 0.9, z - 0.25);
      B(0.62, 0.4, 0.05, M(0x1a1a1c), x, 1.14, z - 0.27);
      const sm = new THREE.MeshBasicMaterial({ map: TEX.get('screen') });
      plane(0.56, 0.34, sm, x, 1.14, z - 0.243, 0); o.screens.push(sm);
      B(0.46, 0.02, 0.15, M(0x2a2a2e), x, 0.79, z + 0.08);
      if (Math.random() < 0.6) { const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8), M(0xe8e4dc)); mug.position.set(x + 0.6, 0.83, z + 0.1); o.group.add(mug); }
      // sandalye
      B(0.5, 0.08, 0.5, M(0x222226), x, 0.5, z + 0.75); B(0.5, 0.62, 0.06, M(0x222226), x, 0.86, z + 1.0);
      B(0.06, 0.45, 0.06, M(0x555558), x, 0.24, z + 0.75);
      if (worker) coworker(o, x, z + 0.72);
    };
    function coworker(o, x, z) {
      const g = new THREE.Group(); g.position.set(x, 0, z); o.group.add(g);
      const shirt = M([0xd8dce0, 0x9ab0d0, 0xe0c8c8, 0xc8d8c0][Math.floor(Math.random() * 4)]), skin = M(0xc09070), pants = M(0x2a2c34);
      B(0.5, 0.6, 0.28, shirt, 0, 0.88, 0, g);
      B(0.42, 0.16, 0.5, pants, 0, 0.52, -0.2, g); B(0.4, 0.5, 0.14, pants, 0, 0.25, -0.42, g);
      B(0.12, 0.12, 0.42, shirt, -0.3, 0.95, -0.22, g); B(0.12, 0.12, 0.42, shirt, 0.3, 0.95, -0.22, g);
      const head = new THREE.Group(); head.position.set(0, 1.33, 0); g.add(head);
      B(0.26, 0.3, 0.26, skin, 0, 0, 0, head); B(0.28, 0.08, 0.28, M([0x2a1a10, 0x111111, 0x8a6a40][Math.floor(Math.random() * 3)]), 0, 0.15, 0.01, head);
      const eyes = new THREE.Group(); eyes.visible = false; head.add(eyes);
      const eyeM = new THREE.MeshBasicMaterial({ color: 0xff2000 });
      for (const s of [-1, 1]) B(0.05, 0.03, 0.02, eyeM, s * 0.06, 0.02, -0.135, eyes);
      o.heads.push({ head, eyes, x, z, phase: Math.random() * 6 });
    }
    for (const z of [-6.5, -11, -15.5]) { desk(OX - 5, z, Math.random() < 0.75); desk(OX + 5, z, Math.random() < 0.75); }
    // --- SENİN masan: mail yağan ekran, kağıt yığınları, post-it'ler, kupa ---
    const px = OX - 5, pz = -2.6;
    addBox(o, px - 1, 0, pz - 0.45, px + 1, 0.78, pz + 0.45, null);
    B(2, 0.05, 0.9, mat('desk'), px, 0.76, pz);
    B(0.05, 0.74, 0.86, M(0x3a3a3e), px - 0.95, 0.37, pz); B(0.05, 0.74, 0.86, M(0x3a3a3e), px + 0.95, 0.37, pz);
    addBox(o, px - 1.1, 0, pz - 0.62, px + 1.1, 1.35, pz - 0.52, mat('cubicle'), { s: 1.5 });
    const mon = new THREE.Group(); mon.position.set(px, 0.78, pz - 0.22); o.group.add(mon);
    B(0.1, 0.22, 0.1, M(0x1a1a1c), 0, 0.11, 0, mon);
    B(0.86, 0.54, 0.05, M(0x1a1a1c), 0, 0.47, 0, mon);
    const ic = document.createElement('canvas'); ic.width = 160; ic.height = 100;
    const itex = new THREE.CanvasTexture(ic); itex.magFilter = THREE.NearestFilter; itex.minFilter = THREE.LinearFilter;
    const inboxMat = new THREE.MeshBasicMaterial({ map: itex });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.48), inboxMat); scr.position.set(0, 0.47, 0.026); mon.add(scr);
    o.screens.push(inboxMat);
    o.inbox = { ctx: ic.getContext('2d'), tex: itex };
    for (let i = 0; i < 5; i++) {   // post-it'ler
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ color: [0xffe060, 0xff90c0, 0x90e0ff][i % 3] }));
      n.position.set(i % 2 ? 0.43 : -0.43, 0.3 + Math.floor(i / 2) * 0.1, 0.028); n.rotation.z = (Math.random() - 0.5) * 0.4; mon.add(n);
    }
    const kb = B(0.5, 0.025, 0.16, M(0x2a2a2e), px, 0.79, pz + 0.14);
    const mug = new THREE.Group(); mug.position.set(px + 0.55, 0.835, pz + 0.08); o.group.add(mug);
    B(0.09, 0.1, 0.09, M(0xe8e4dc), 0, 0, 0, mug); B(0.092, 0.02, 0.092, M(0xb01818), 0, 0.01, 0, mug);
    const spill = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), new THREE.MeshBasicMaterial({ color: 0x3a1e0e, transparent: true, opacity: 0.9 }));
    spill.rotation.x = -Math.PI / 2; spill.position.set(px + 0.5, 0.788, pz + 0.12); spill.scale.setScalar(0.01); spill.visible = false; o.group.add(spill);
    const papers = [B(0.3, 0.26, 0.22, M(0xeeeeea), px - 0.62, 0.92, pz - 0.05), B(0.3, 0.14, 0.22, M(0xe4e4dc), px - 0.3, 0.86, pz + 0.05)];
    papers[1].rotation.y = 0.3;
    B(0.5, 0.08, 0.5, M(0x222226), px, 0.5, pz + 1.05); B(0.5, 0.62, 0.06, M(0x222226), px, 0.86, pz + 1.3);
    o.props = [kb, mug, ...papers, mon].map(m => ({ m, base: m.position.y, y: 0, vy: 0 }));
    Object.assign(o, { mug, spill, seat: new THREE.Vector3(px, 0, pz + 1.05), keyboard: kb.position.clone() });

    // su sebili, yazıcı, saksılar
    addBox(o, x1 - 1.1, 0, -1.9, x1 - 0.5, 1.0, -1.3, null);
    B(0.6, 1.0, 0.6, M(0xdcdcdc), x1 - 0.8, 0.5, -1.6);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 10), M(0x4a7ac0)); bottle.position.set(x1 - 0.8, 1.24, -1.6); o.group.add(bottle);
    addBox(o, x0 + 0.5, 0, -3.3, x0 + 1.2, 0.95, -2.5, null);
    B(0.7, 0.9, 0.8, M(0x2c2c30), x0 + 0.85, 0.45, -2.9); B(0.6, 0.06, 0.5, M(0x6a6a70), x0 + 0.85, 0.93, -2.9);
    for (const [x, z] of [[x0 + 0.6, z1 + 0.6], [x1 - 0.6, z1 + 0.6], [x1 - 0.6, -0.6]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 8), M(0x6a3a20)); pot.position.set(x, 0.2, z); o.group.add(pot);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 6), M(0x2a5a24)); leaf.position.set(x, 0.9, z); o.group.add(leaf);
    }

    // portal: masanın hemen sağında, koridorda, sana bakar
    o.portal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), portalMat);
    o.portal.position.set(OX - 2.3, 1.6, -1.9); o.portal.rotation.y = -Math.PI / 2; o.portal.visible = false; o.group.add(o.portal);
    portalMat.uniforms.open.value = 0;
    office = o;
    return o;
  }

  function removeOffice() {
    if (!office) return;
    scene.remove(office.group);
    office.group.traverse(k => { if (k.geometry) k.geometry.dispose(); });
    for (const s of office.solids) { const i = solids.indexOf(s); if (i >= 0) solids.splice(i, 1); }
    office = null; portalLight.intensity = 0;
  }

  function openPortal() {
    if (!office || office.opening) return;
    office.opening = true; office.portal.visible = true;
    office.screens.forEach(m => m.color.setHex(0xff3020));
    office.heads.forEach(h => { h.eyes.visible = true; });
    lightPool.forEach(L => { L.userData.flicker = L.userData.base > 0; });
  }

  function slamDesk(final) {
    for (const p of office.props) { p.vy = (p.m === office.props[4].m ? 0.8 : 1.6) + Math.random() * 1.4; p.spin = (Math.random() - 0.5) * 1.5; }
    if (final) { office.mugDown = true; office.spill.visible = true; }
  }

  // ekrandaki e-posta istemcisi (canvas, her yeni mailde yeniden çizilir)
  function drawInbox(mails, unread, stress) {
    if (!office) return;
    const g = office.inbox.ctx, W = 160, H = 100;
    g.fillStyle = '#e8ecf2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1a4a90'; g.fillRect(0, 0, W, 12);
    g.textBaseline = 'top'; g.fillStyle = '#fff'; g.font = 'bold 8px monospace';
    g.fillText(`Gelen Kutusu (${unread})`, 3, 2);
    g.fillStyle = '#c8d0dc'; g.fillRect(0, 12, 24, H - 12);
    g.fillStyle = '#1a4a90'; g.font = '6px monospace';
    ['Gelen', 'Taslak', 'Spam'].forEach((t, i) => g.fillText(t, 2, 16 + i * 9));
    mails.slice(0, 8).forEach((m, i) => {
      const y = 13 + i * 10.8;
      g.fillStyle = i === 0 ? '#ffe8a0' : i % 2 ? '#ffffff' : '#f2f4f8'; g.fillRect(25, y, W - 25, 10.4);
      if (m.urgent) { g.fillStyle = '#d01010'; g.fillRect(26, y + 2, 3, 7); }
      g.fillStyle = '#101820'; g.font = (i < 3 ? 'bold ' : '') + '7px monospace';
      g.fillText(m.s.slice(0, 26), 31, y + 2);
    });
    if (stress > 0.6) {   // panik popup'ı
      g.fillStyle = '#d01010'; g.fillRect(36, 38, 92, 26);
      g.fillStyle = '#fff'; g.font = 'bold 8px monospace'; g.textAlign = 'center';
      g.fillText(`${unread} OKUNMAMIŞ`, 82, 42); g.fillText('!!! ACİL !!!', 82, 53); g.textAlign = 'left';
    }
    office.inbox.tex.needsUpdate = true;
  }

  // portal animasyonu + iş arkadaşlarının kafaları yavaşça sana döner
  function officeUpdate(dt, playerPos) {
    if (!office) return;
    portalMat.uniforms.time.value += dt;
    if (office.opening) office.open = Math.min(1, office.open + dt * 0.9);
    portalMat.uniforms.open.value = office.open;
    portalLight.position.copy(office.portal.position).x -= 1.2;
    portalLight.intensity = office.open * (2.6 + Math.sin(portalMat.uniforms.time.value * 9) * 0.6);
    // masaya vurunca zıplayan eşyalar
    for (const p of office.props) {
      if (p.y === 0 && p.vy === 0) continue;
      p.vy -= 14 * dt; p.y += p.vy * dt;
      if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) > 0.6 ? -p.vy * 0.3 : 0; }
      p.m.position.y = p.base + p.y;
      if (p.m !== office.mug || !office.mugDown) p.m.rotation.z = p.y * (p.spin || 0);
    }
    if (office.mugDown) {   // kupa devrildi, kahve yayılıyor
      office.mug.rotation.z += (Math.PI / 2 - office.mug.rotation.z) * Math.min(1, dt * 12);
      office.spill.scale.setScalar(Math.min(1, office.spill.scale.x + dt * 0.8));
    }
    for (const h of office.heads) {
      if (office.opening) {
        const want = Math.atan2(-(playerPos.x - h.x), -(playerPos.z - h.z));
        let d = want - h.head.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        h.head.rotation.y += d * Math.min(1, dt * 1.2);
      } else h.head.rotation.x = 0.15 + Math.sin(portalMat.uniforms.time.value * 2 + h.phase) * 0.04;   // ekrana gömülmüş
    }
  }

  // --------- çarpışma ---------
  // Varlığı (silindir ~ kare AABB, yarıçap r, boy h) tek eksende hareket ettir.
  function moveAxis(pos, r, h, axis, delta, step) {
    if (delta === 0) return null;
    pos[axis] += delta;
    let hit = null;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (!s.active) continue;
      if (pos.x + r <= s.min.x || pos.x - r >= s.max.x) continue;
      if (pos.z + r <= s.min.z || pos.z - r >= s.max.z) continue;
      if (pos.y + h <= s.min.y || pos.y >= s.max.y) continue;
      if (axis === 'y') {
        pos.y = delta < 0 ? s.max.y : s.min.y - h;
        hit = s;
      } else {
        const rise = s.max.y - pos.y;
        if (step > 0 && rise > 0 && rise <= step && !overlapsAny(pos.x - r, s.max.y + 0.01, pos.z - r, pos.x + r, s.max.y + h, pos.z + r)) {
          pos.y = s.max.y; continue;
        }
        pos[axis] = delta > 0 ? s.min[axis] - r - 0.0005 : s.max[axis] + r + 0.0005;
        hit = s;
      }
    }
    return hit;
  }

  const _inv = new THREE.Vector3();
  // ışın-AABB (slab). dönüş: {t, normal, solid} veya null
  function raycast(o, d, maxT, skipKind) {
    _inv.set(1 / d.x, 1 / d.y, 1 / d.z);
    let best = maxT, bestS = null, bestAxis = 0;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (!s.active || (skipKind && s.kind === skipKind)) continue;
      let tx1 = (s.min.x - o.x) * _inv.x, tx2 = (s.max.x - o.x) * _inv.x;
      let tmin = Math.min(tx1, tx2), tmax = Math.max(tx1, tx2), ax = 0;
      const ty1 = (s.min.y - o.y) * _inv.y, ty2 = (s.max.y - o.y) * _inv.y;
      const tymin = Math.min(ty1, ty2);
      if (tymin > tmin) { tmin = tymin; ax = 1; }
      tmax = Math.min(tmax, Math.max(ty1, ty2));
      const tz1 = (s.min.z - o.z) * _inv.z, tz2 = (s.max.z - o.z) * _inv.z;
      const tzmin = Math.min(tz1, tz2);
      if (tzmin > tmin) { tmin = tzmin; ax = 2; }
      tmax = Math.min(tmax, Math.max(tz1, tz2));
      if (tmax >= Math.max(tmin, 0) && tmin < best && tmin >= 0) { best = tmin; bestS = s; bestAxis = ax; }
    }
    if (!bestS) return null;
    const n = new THREE.Vector3();
    n.setComponent(bestAxis, -Math.sign(d.getComponent(bestAxis)));
    return { t: best, normal: n, solid: bestS };
  }

  function chunkAt(z) { return chunks.find(c => z <= c.z0 + 0.5 && z >= c.z1 - 0.5) || null; }

  // ışık havuzu: sabit sayıda PointLight (shader yeniden derlenmesin)
  function focus(chunk) {
    const pts = chunk.lights.map(l => l.pos);
    const next = chunks.find(c => c.index === chunk.index + 1);
    const extra = [...(next ? next.corridorLights : []), ...(chunk.corridorLights || [])];   // önce ilerideki koridor
    lightPool.forEach((L, i) => {
      const p = pts[i] || extra[i - pts.length];
      if (p) { L.position.copy(p); L.visible = true; L.color.setHex(chunk.theme.light); L.userData.base = i < pts.length ? 1.15 : 0.7; L.userData.flicker = i < pts.length && chunk.lights[i].flicker; L.userData.mesh = chunk.lights[i] && chunk.lights[i].mesh; }
      else { L.intensity = 0; L.userData.base = 0; }
    });
    hemi.color.setHex(chunk.theme.sky); hemi.groundColor.setHex(chunk.theme.ground);
  }

  let time = 0;
  function update(dt) {
    time += dt;
    for (const c of chunks) {
      for (const d of [c.entryDoor, c.exitDoor]) {
        if (d.open !== d.target) {
          d.open += Math.sign(d.target - d.open) * dt * 2.2;
          if (Math.abs(d.open - d.target) < 0.03) d.open = d.target;
          d.mesh.position.y = 2 + d.open * 4;
          d.solid.active = d.open < 0.6;
        }
      }
      for (const l of c.lavas) { l.mesh.material.map.offset.x = time * 0.05; l.mesh.material.map.offset.y = Math.sin(time * 0.3) * 0.1; }
      if (c.pentagram) c.pentagram.material.opacity = 0.55 + Math.sin(time * 3) * 0.3;
    }
    for (const L of lightPool) {
      const b = L.userData.base || 0;
      let k = 1;
      if (L.userData.flicker) { k = (Math.sin(time * 37) + Math.sin(time * 13.7) > 1.2 || Math.random() < 0.04) ? 0.15 : 1; if (L.userData.mesh) L.userData.mesh.visible = k > 0.5; }
      L.intensity = b * k;
    }
  }

  return {
    THEMES, themeFor, solids, chunks,
    init(s) {
      scene = s;
      hemi = new THREE.HemisphereLight(0x303844, 0x101010, 0.85); scene.add(hemi);
      for (let i = 0; i < 8; i++) { const L = new THREE.PointLight(0xffffff, 0, 26, 1.2); scene.add(L); lightPool.push(L); }
      portalLight = new THREE.PointLight(0xff5010, 0, 14, 1.3); scene.add(portalLight);
    },
    reset() { while (chunks.length) removeChunk(chunks[0]); removeOffice(); },
    build, removeChunk, moveAxis, raycast, overlapsAny, chunkAt, focus, update, mat, boxGeo,
    OX, buildOffice, removeOffice, openPortal, officeUpdate, slamDesk, drawInbox,
    get office() { return office; },
  };
})();
