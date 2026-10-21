// Sonsuz arena zinciri: koridor -> arena -> koridor -> ... (−Z yönünde ilerler)
// Çarpışma: eksen hizalı kutular (AABB). Mermi/ışın: slab testi.
const World = (() => {
  let scene;
  const solids = [];
  const chunks = [];
  const matCache = {};
  const lightPool = [];
  let hemi;

  // Üç cehennem: ateş (lav, bazalt), kemik (kafatası duvarlar, ruh ateşi), et (et duvarlar, kan gölleri)
  const THEMES = [
    { name: 'ates', wall: 'hellrock', floor: 'hellfloor', fog: 0x1c120e, skyTop: 0x0a0606, skyLow: 0x6a3420, light: 0xffa050, fire: [1, 0.5, 0.12], hemiSky: 0xb09080, ground: 0x382820, lava: 0xffffff, layouts: ['river', 'altar', 'obelisks'] },
    { name: 'kemik', wall: 'bone', floor: 'bonefloor', fog: 0x16160e, skyTop: 0x060806, skyLow: 0x4a5a2a, light: 0xb0ff70, fire: [0.55, 1, 0.3], hemiSky: 0xa0a088, ground: 0x2a2818, lava: 0x80ff60, layouts: ['ribs', 'altar', 'obelisks'] },
    { name: 'et', wall: 'flesh', floor: 'hellfloor', fog: 0x1a0e10, skyTop: 0x080406, skyLow: 0x5a2432, light: 0xff9070, fire: [1, 0.35, 0.3], hemiSky: 0xa88890, ground: 0x302024, lava: 0xff3048, layouts: ['ribs', 'river', 'altar'] },
  ];
  const themeFor = i => THEMES[Math.floor(i / 3) % 3];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function mat(tex, opts = {}) {
    const key = tex + JSON.stringify(opts);
    if (matCache[key]) return matCache[key];
    let m;
    if (opts.basic) m = new THREE.MeshBasicMaterial({ map: tex ? TEX.get(tex) : null, color: opts.color ?? 0xffffff, fog: opts.fog ?? true });
    else m = new THREE.MeshPhongMaterial({ map: TEX.get(tex), color: opts.color ?? 0xffffff, specular: 0x000000, shininess: 2, emissive: opts.emissive ?? 0x000000, flatShading: !!opts.flat });
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
    const m = new THREE.Mesh(boxGeo(4, 4, zMax - zMin - 0.3, 4), mat('gate'));
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

  // --------- cehennem süsleri ---------
  let M_IRON, M_SKULL, M_BONE;
  function stdMats() {
    if (M_IRON) return;
    M_IRON = new THREE.MeshLambertMaterial({ color: 0x2a2220 });
    M_SKULL = new THREE.MeshLambertMaterial({ map: TEX.get('skull'), color: 0xffffff });
    M_BONE = new THREE.MeshPhongMaterial({ color: 0xd8ccb0, specular: 0, shininess: 2, flatShading: true });
  }
  const glowSprite = (color, scale, x = 0, y = 0, z = 0) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    s.scale.setScalar(scale); s.position.set(x, y, z); return s;
  };
  const pentaMat = color => new THREE.MeshBasicMaterial({ map: TEX.get('pentagram'), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  function torch(chunk, x, y, z) {   // koridor duvarında meşale
    const g = new THREE.Group(); g.position.set(x, y, z); chunk.group.add(g);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), M_IRON); b.rotation.z = x < 0 ? -0.35 : 0.35; g.add(b);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.16, 6), M_IRON); cup.position.y = 0.28; g.add(cup);
    g.add(glowSprite(chunk.theme.light, 1.4, 0, 0.5, 0));
    chunk.flames.push({ p: new THREE.Vector3(x, y + 0.4, z), size: 0.45 });
  }
  function brazier(chunk, x, y, z, light = true) {   // ayaklı ateş kazanı
    const g = new THREE.Group(); g.position.set(x, y, z); chunk.group.add(g);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 1.2, 6), M_IRON); st.position.y = 0.6; g.add(st);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.38, 0.45, 8), M_IRON); bowl.position.y = 1.4; g.add(bowl);
    const coal = new THREE.Mesh(new THREE.CircleGeometry(0.68, 8), new THREE.MeshBasicMaterial({ color: chunk.theme.light })); coal.rotation.x = -Math.PI / 2; coal.position.y = 1.62; g.add(coal);
    g.add(glowSprite(chunk.theme.light, 3.2, 0, 2.0, 0));
    addBox(chunk, x - 0.6, y, z - 0.6, x + 0.6, y + 1.6, z + 0.6, null);
    chunk.flames.push({ p: new THREE.Vector3(x, y + 1.7, z), size: 1.1 });
    if (light) chunk.lights.push({ pos: new THREE.Vector3(x, y + 2.8, z), fire: true });
  }
  function obelisk(chunk, x, z, h) {   // sivrilen taş, ortasında parlayan rün bandı
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.05, h, 4), mat('hellrock', { flat: true })); m.rotation.y = Math.PI / 4; m.position.set(x, h / 2, z); chunk.group.add(m);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.86, 0.9, 4, 1, true), chunk.runeM); band.rotation.y = Math.PI / 4; band.position.set(x, h * 0.42, z); chunk.group.add(band);
    chunk.group.add(glowSprite(chunk.theme.light, 1.6, x, h + 0.3, z));
    addBox(chunk, x - 0.85, 0, z - 0.85, x + 0.85, h, z + 0.85, null);
  }
  function spike(chunk, x, z) {   // kazık + saplanmış kafatası
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 3.4, 5), M_IRON); c.position.set(x, 1.7, z); chunk.group.add(c);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), M_SKULL); s.position.set(x, 2.4, z); s.rotation.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3)); chunk.group.add(s);
    addBox(chunk, x - 0.3, 0, z - 0.3, x + 0.3, 3.4, z + 0.3, null);
  }
  function skullPile(chunk, x, z) {
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), M_SKULL);
      s.position.set(x + rand(-0.7, 0.7), 0.17 + (i > 4 ? 0.3 : 0), z + rand(-0.7, 0.7)); s.rotation.y = rand(0, 6.28); chunk.group.add(s);
    }
  }
  function boulder(chunk, x, z, s) {
    const sx = s * rand(0.9, 1.3), sy = s * rand(0.6, 1.1), sz = s * rand(0.9, 1.3);
    if (overlapsAny(x - sx, 0.05, z - sz, x + sx, sy * 1.4, z + sz)) return;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat(chunk.theme.wall, { flat: true }));
    m.scale.set(sx, sy, sz); m.position.set(x, sy * 0.55, z); m.rotation.y = rand(0, 6.28); chunk.group.add(m);
    addBox(chunk, x - sx * 0.75, 0, z - sz * 0.75, x + sx * 0.75, sy * 1.4, z + sz * 0.75, null);
  }
  function lavaPool(chunk, x, z, w, d) {   // lav / asit / kan: temaya göre renk
    const m = addPlane(chunk, x + w / 2, 0.03, z + d / 2, w, d, new THREE.MeshBasicMaterial({ map: TEX.get('lava').clone(), color: chunk.theme.lava, fog: false }));
    m.material.map.needsUpdate = true; m.material.map.repeat.set(w / 3, d / 3);
    chunk.lavas.push({ x0: x, x1: x + w, z0: z, z1: z + d, mesh: m });
  }
  function urn(chunk, x, z) {   // kükürt kazanı: ateşle / vurunca patlar
    const g = new THREE.Group(); g.position.set(x, 0, z); chunk.group.add(g);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.32, 1.0, 8), mat('urn')); body.position.y = 0.5; g.add(body);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), new THREE.MeshBasicMaterial({ color: 0xffc030 })); top.rotation.x = -Math.PI / 2; top.position.y = 1.0; g.add(top);
    const sol = { min: new THREE.Vector3(x - 0.42, 0, z - 0.42), max: new THREE.Vector3(x + 0.42, 1.1, z + 0.42), active: true, kind: 'barrel', mesh: g, chunk };
    solids.push(sol); chunk.solids.push(sol);
    const b = { mesh: g, solid: sol, pos: new THREE.Vector3(x, 0.6, z), hp: 20, alive: true, fuse: -1 };
    sol.barrel = b; chunk.barrels.push(b);
    chunk.flames.push({ p: new THREE.Vector3(x, 1.1, z), size: 0.3, owner: b });
  }

  // --------- bir parça üret: meşaleli kaya tüneli + açık gökyüzü altında cehennem arenası ---------
  function build(index, z0) {
    stdMats();
    const theme = themeFor(index);
    const chunk = { index, group: new THREE.Group(), solids: [], z0, theme, lights: [], barrels: [], lavas: [], spawns: [], flames: [] };
    scene.add(chunk.group);
    const wallM = mat(theme.wall), floorM = mat(theme.floor), rockM = mat('hellrock');
    chunk.runeM = new THREE.MeshBasicMaterial({ map: TEX.get('rune'), color: theme.light, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

    // --- koridor ---
    const Lc = index === 0 ? 14 : Math.round(rand(10, 15));
    const cz1 = z0 - Lc;
    addBox(chunk, -3, -1, cz1, 3, 0, z0, floorM, { kind: 'floor', s: 3 });
    addBox(chunk, -4, 4.6, cz1, 4, 6, z0, rockM, { s: 3 });
    addBox(chunk, -4, -1, cz1, -2, 6, z0, rockM, { s: 3 });
    addBox(chunk, 2, -1, cz1, 4, 6, z0, rockM, { s: 3 });
    if (index === 0) addBox(chunk, -4, -1, z0, 4, 6, z0 + 1, rockM, { s: 3 });
    chunk.corridorLights = [];
    for (let z = z0 - 3, k = 0; z > cz1 + 1.5; z -= 5, k++) {
      const x = k % 2 ? 1.88 : -1.88;
      torch(chunk, x, 2.4, z);
      chunk.corridorLights.push(new THREE.Vector3(x * 0.6, 3.0, z));
    }
    chunk.corridor = { z0, z1: cz1 };

    // --- arena (tavan yok: gökyüzü) ---
    const W = 2 * Math.round(rand(20, 25) + Math.min(index, 8) * 0.3);
    const L = Math.round(rand(48, 60) + Math.min(index, 8));
    const rz0 = cz1, rz1 = rz0 - L, hw = W / 2, mz = (rz0 + rz1) / 2;
    Object.assign(chunk, { W, L, rz0, rz1, hw, z1: rz1 });
    addBox(chunk, -hw - 4, -1, rz1 - 4, hw + 4, 0, rz0, floorM, { kind: 'floor', s: 4 });
    addBox(chunk, -hw - 4, 40, rz1 - 4, hw + 4, 41, rz0, null);   // görünmez tavan (roketle kaçılmasın)

    // yan duvarlar: farklı yükseklik ve girintilerde kaya blokları
    for (let z = rz0; z > rz1 + 0.01;) {
      const seg = Math.min(z - rz1, rand(4, 8));
      for (const side of [-1, 1]) {
        const jut = rand(0, 1.4), h = rand(10, 19);
        if (side < 0) addBox(chunk, -hw - 4, 0, z - seg, -hw + jut, h, z, wallM, { s: 4 });
        else addBox(chunk, hw - jut, 0, z - seg, hw + 4, h, z, wallM, { s: 4 });
        if (Math.random() < 0.35) boulder(chunk, side * (hw - jut - rand(1.2, 2.2)), z - seg / 2, rand(0.8, 1.6));
      }
      z -= seg;
    }
    // güney (giriş) ve kuzey (çıkış) duvarları + cehennem kapısı çerçevesi
    for (const [za, zb, south] of [[rz0 - 1, rz0, true], [rz1, rz1 + 1, false]]) {
      for (const [xa, xb] of [[-hw, -2], [2, hw]]) {
        for (let x = xa; x < xb - 0.01;) {
          const seg = Math.min(xb - x, rand(4, 8));
          const near = Math.min(Math.abs(x), Math.abs(x + seg)) < 5;
          const jut = near ? 0 : rand(0, 1.2), h = rand(10, 19);
          if (south) addBox(chunk, x, 0, za - jut, x + seg, h, zb + 4, wallM, { s: 4 });
          else addBox(chunk, x, 0, za - 4, x + seg, h, zb + jut, wallM, { s: 4 });
          x += seg;
        }
      }
      addBox(chunk, -2, 4, za, 2, 12, zb, wallM, { s: 4 });
      const inner = south ? za : zb, dir = south ? -1 : 1;   // arenaya doğru yön
      const fz0 = Math.min(inner, inner + dir * 0.9), fz1 = Math.max(inner, inner + dir * 0.9);
      addBox(chunk, -3.6, 0, fz0, -2, 7.5, fz1, rockM, { s: 2 });
      addBox(chunk, 2, 0, fz0, 3.6, 7.5, fz1, rockM, { s: 2 });
      addBox(chunk, -2, 5.2, fz0, 2, 7.5, fz1, rockM, { s: 2 });
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), chunk.runeM);
      rune.position.set(0, 6.35, inner + dir * 0.92); rune.rotation.y = south ? Math.PI : 0; chunk.group.add(rune);
      const sk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), M_SKULL); sk.position.set(0, 8.1, inner + dir * 0.5); sk.rotation.y = south ? Math.PI : 0; chunk.group.add(sk);
      if (!south) {   // çıkış mührü: kilitliyken kırmızı, açılınca yeşil
        chunk.exitLamp = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), pentaMat(0xff1000));
        chunk.exitLamp.position.set(0, 9.8, inner + dir * 0.3); chunk.group.add(chunk.exitLamp);
      }
      for (const sx of [-1, 1]) torch(chunk, sx * 2.8, 4.2, inner + dir * 1.05);
    }
    chunk.entryDoor = addDoor(chunk, rz0 - 1, rz0, 1, chunk);
    chunk.exitDoor = addDoor(chunk, rz1, rz1 + 1, 0, chunk);

    // çevre mangalları (ışık kaynakları)
    for (const z of [rz0 - 9, mz, rz1 + 9]) for (const sx of [-1, 1]) brazier(chunk, sx * (hw - 4.5), 0, z);

    // --- ana düzen ---
    const ix0 = -hw + 3, ix1 = hw - 3, iz0 = rz0 - 6, iz1 = rz1 + 6;
    const freeLane = (x, z) => Math.abs(x) < 3.5 && (z > rz0 - 9 || z < rz1 + 9);
    const layout = index === 0 ? 'altar' : pick(theme.layouts);
    chunk.layout = layout;
    if (layout === 'altar') {   // basamaklı sunak + dikilitaş halkası
      for (const [s, h] of [[17, 0.5], [12, 1.0], [7, 1.5]]) addBox(chunk, -s / 2, 0, mz - s / 2, s / 2, h, mz + s / 2, rockM, { s: 3, kind: 'step' });
      chunk.pentagram = addPlane(chunk, 0, 1.52, mz, 6.4, 6.4, pentaMat(theme.light));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) brazier(chunk, sx * 2.7, 1.5, mz + sz * 2.7, false);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; obelisk(chunk, Math.cos(a) * 14, mz + Math.sin(a) * 14, rand(7, 11)); }
    } else if (layout === 'river') {   // arenayı ikiye bölen nehir: köprüden geç ya da üstünden zıpla
      const rw = rand(4.5, 6), rzc = mz + rand(-5, 5);
      lavaPool(chunk, -hw, rzc - rw / 2, W, rw);
      for (const bx of [-hw * 0.45, hw * 0.45]) {
        addBox(chunk, bx - 2, 0, rzc - rw / 2 - 0.8, bx + 2, 0.32, rzc + rw / 2 + 0.8, rockM, { s: 2, kind: 'step' });
        for (const sz of [-1, 1]) spike(chunk, bx + 2.4, rzc + sz * (rw / 2 + 1.4));
      }
      for (let i = 0; i < 6; i++) obelisk(chunk, rand(ix0 + 2, ix1 - 2), rzc + (i % 2 ? 1 : -1) * rand(rw / 2 + 4, rw / 2 + 9), rand(6, 10));
    } else if (layout === 'ribs') {   // dev bir canavarın kaburgaları arenanın üstünde kemer yapar
      const R = Math.min(hw - 7, 14);
      for (let z = rz0 - 11; z > rz1 + 11; z -= 7) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.6, 6, 18, Math.PI), M_BONE); arc.position.set(0, 0, z); chunk.group.add(arc);
        for (const sx of [-1, 1]) addBox(chunk, sx * R - 0.8, 0, z - 0.8, sx * R + 0.8, 3, z + 0.8, null);
      }
      for (let z = rz0 - 13; z > rz1 + 13; z -= 3.6) addBox(chunk, -1.3, 0, z - 0.8, 1.3, 1.0, z + 0.8, mat('bone'), { s: 1.5, kind: 'step' });   // omurga
    } else {   // dikilitaş ormanı
      for (let i = 0, n = 0; i < 40 && n < 11; i++) {
        const x = rand(ix0 + 2, ix1 - 2), z = rand(iz1 + 2, iz0 - 2);
        if (freeLane(x, z) || overlapsAny(x - 2.5, 0.05, z - 2.5, x + 2.5, 3, z + 2.5)) continue;
        obelisk(chunk, x, z, rand(6, 13)); n++;
      }
    }
    if (!chunk.pentagram) chunk.pentagram = addPlane(chunk, 0, 0.02, layout === 'river' ? rz0 - 14 : mz, 10, 10, pentaMat(theme.light));

    // dağınık süs: kayalar, kazıklar, kafatası yığınları, kükürt kazanları, küçük göller
    const free = (x, z, r) => !freeLane(x, z) && !overlapsAny(x - r, 0.05, z - r, x + r, 2, z + r) &&
      !chunk.lavas.some(l => x > l.x0 - r && x < l.x1 + r && z > l.z0 - r && z < l.z1 + r);
    const scatter = (n, r, fn) => { for (let i = 0, k = 0; i < n * 6 && k < n; i++) { const x = rand(ix0, ix1), z = rand(iz1, iz0); if (free(x, z, r)) { fn(x, z); k++; } } };
    scatter(Math.round(rand(5, 9)), 2.2, (x, z) => boulder(chunk, x, z, rand(1, 2.2)));
    scatter(Math.round(rand(6, 10)), 0.8, (x, z) => spike(chunk, x, z));
    scatter(5, 1, (x, z) => skullPile(chunk, x, z));
    scatter(Math.round(rand(3, 6)), 0.9, (x, z) => urn(chunk, x, z));
    if (layout !== 'river') scatter(Math.round(rand(1, 3)), 4, (x, z) => lavaPool(chunk, x - 2, z - 2, rand(3, 6), rand(3, 6)));

    // doğma noktaları
    for (let tries = 0; tries < 220 && chunk.spawns.length < 50; tries++) {
      const x = rand(ix0, ix1), z = rand(iz1, rz0 - 12);
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
    const W = 24, L = 24, H = 3.4, x0 = OX - W / 2, x1 = OX + W / 2, z1 = -L;
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
    for (const z of [-3.5, -9.5, -15.5, -21]) for (const x of [OX - 6.5, OX + 6.5]) lightFixture(o, x, H - 0.05, z, OFFICE_THEME.light, o);
    o.lights.forEach(l => { l.flicker = false; });
    const winM = new THREE.MeshBasicMaterial({ map: TEX.get('windowNight') });
    for (const z of [-4, -10, -16, -21.5]) plane(3.6, 1.6, winM, x1 - 0.01, 1.7, z, -Math.PI / 2);
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
      o.heads.push({ head, eyes, x, z, g, phase: Math.random() * 6, lookT: 0 });
    }
    // ayakta duran / yürüyen çalışan (-Z'ye bakar, yaw ile döndürülür)
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    function person(x, z, yaw, { suit = false, solid = true, carry = false } = {}) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; o.group.add(g);
      const shirt = M(suit ? 0x22242a : pick([0xd8dce0, 0x9ab0d0, 0xe0c8c8, 0xc8d8c0, 0xe8d8a0])), skin = M(pick([0xc09070, 0xa87850, 0xd8a888]));
      const pants = M(suit ? 0x22242a : pick([0x2a2c34, 0x3a3226, 0x1e2a3a]));
      const legL = new THREE.Group(); legL.position.set(-0.11, 0.85, 0); g.add(legL); B(0.17, 0.85, 0.2, pants, 0, -0.42, 0, legL);
      const legR = new THREE.Group(); legR.position.set(0.11, 0.85, 0); g.add(legR); B(0.17, 0.85, 0.2, pants, 0, -0.42, 0, legR);
      B(0.5, 0.65, 0.28, shirt, 0, 1.17, 0, g);
      if (suit) { B(0.14, 0.4, 0.02, M(0xe8e8e8), 0, 1.25, -0.145, g); B(0.06, 0.34, 0.02, M(0xb01010), 0, 1.22, -0.155, g); }
      if (carry) {   // kucakta dosya kutusu
        B(0.11, 0.11, 0.4, shirt, -0.3, 1.2, -0.2, g); B(0.11, 0.11, 0.4, shirt, 0.3, 1.2, -0.2, g);
        B(0.42, 0.28, 0.3, M(0xa08050), 0, 1.24, -0.42, g);
      } else if (suit) B(0.56, 0.14, 0.18, shirt, 0, 1.22, -0.2, g);   // kollar kavuşmuş
      else { B(0.11, 0.6, 0.13, shirt, -0.31, 1.15, 0, g); B(0.11, 0.6, 0.13, shirt, 0.31, 1.15, 0, g); }
      const head = new THREE.Group(); head.position.set(0, 1.66, 0); g.add(head);
      B(0.26, 0.3, 0.26, skin, 0, 0, 0, head); B(0.28, 0.08, 0.28, M(pick([0x2a1a10, 0x111111, 0x8a6a40, 0x9a9a9a])), 0, 0.15, 0.01, head);
      const eyes = new THREE.Group(); eyes.visible = false; head.add(eyes);
      const eyeM = new THREE.MeshBasicMaterial({ color: 0xff2000 });
      for (const sx of [-1, 1]) B(0.05, 0.03, 0.02, eyeM, sx * 0.06, 0.02, -0.135, eyes);
      if (solid) addBox(o, x - 0.3, 0, z - 0.3, x + 0.3, 1.8, z + 0.3, null);
      const h = { head, eyes, x, z, g, phase: Math.random() * 6, standing: true, lookT: 0 };
      o.heads.push(h);
      return { g, legL, legR, h };
    }
    for (const z of [-7, -11, -15, -19]) for (const x of [OX - 8.5, OX - 5, OX + 5, OX + 8.5]) desk(x, z, Math.random() < 0.88);
    desk(OX - 8.5, -2.6, true);   // yan masa komşusu
    // ayaktakiler: patron arkanda seni izliyor, sebil başında dedikodu, yazıcı kuyruğu, koridor sohbeti
    const boss = person(OX - 3.4, -5.0, face(OX - 3.4, -5.0, OX - 5, -1.55), { suit: true });
    boss.h.track = true;
    person(x1 - 1.9, -1.0, face(x1 - 1.9, -1.0, x1 - 0.8, -1.6));
    person(x1 - 1.7, -2.5, face(x1 - 1.7, -2.5, x1 - 0.8, -1.6));
    person(x0 + 2.0, -2.9, face(x0 + 2.0, -2.9, x0 + 0.85, -2.9));
    person(OX + 1.7, -12.6, face(OX + 1.7, -12.6, OX + 2.6, -13.3));
    person(OX + 2.6, -13.3, face(OX + 2.6, -13.3, OX + 1.7, -12.6));
    person(OX + 6.6, -5.4, face(OX + 6.6, -5.4, OX + 5, -6.2));
    o.walkers = [
      { ...person(OX + 0.6, -6, 0, { solid: false, carry: true }), xw: OX + 0.6, z: -6, dir: -1, zMin: -21, zMax: -4, speed: 1.3 },
      { ...person(OX - 1.0, -18, Math.PI, { solid: false }), xw: OX - 1.0, z: -18, dir: 1, zMin: -21, zMax: -6, speed: 1.1 },
    ];
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
    // Bedirhan Abi'nin çekmecesi: içinde pentagram kazılı zippo
    B(0.5, 0.7, 0.8, M(0x3a3a3e), px + 0.45, 0.36, pz);
    const drawer = new THREE.Group(); drawer.position.set(px + 0.45, 0.56, pz + 0.41); o.group.add(drawer);
    B(0.46, 0.2, 0.04, M(0x4a4a50), 0, 0, 0, drawer); B(0.12, 0.03, 0.03, M(0x9a9aa0), 0, 0.02, 0.03, drawer);
    B(0.42, 0.14, 0.42, M(0x1c1c20), 0, -0.02, -0.22, drawer);
    const zp = new THREE.Group(); zp.position.set(0.04, 0.08, -0.16); drawer.add(zp);
    B(0.05, 0.07, 0.022, M(0xb0b4b8), 0, 0, 0, zp); B(0.03, 0.03, 0.002, M(0xc01010), 0, 0, 0.012, zp);
    const zpGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.get('glow'), color: 0xff1a00, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    zpGlow.scale.setScalar(0.35); zp.add(zpGlow);
    Object.assign(o, { drawer, drawerZ: pz + 0.41, drawerOpen: 0, drawerTarget: 0, zippo: zp, zippoGlow: zpGlow, drawerPos: new THREE.Vector3(px + 0.45, 0.62, pz + 0.72) });
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

  function openDrawer() { office.drawerTarget = 1; }
  function takeZippo() { office.zippo.visible = false; }
  function slamDesk(final) {
    for (const p of office.props) { p.vy = (p.m === office.props[4].m ? 0.8 : 1.6) + Math.random() * 1.4; p.spin = (Math.random() - 0.5) * 1.5; }
    if (final) { office.mugDown = true; office.spill.visible = true; }
    for (const h of office.heads) if (Math.hypot(h.x - office.seat.x, h.z - office.seat.z) < 9) h.lookT = 2 + Math.random();
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
    // çekmece kayarak açılır, zippo kırmızı nabız gibi parlar
    office.drawerOpen += (office.drawerTarget - office.drawerOpen) * Math.min(1, dt * 7);
    office.drawer.position.z = office.drawerZ + office.drawerOpen * 0.38;
    office.zippoGlow.material.opacity = office.drawerTarget ? 0.55 + Math.sin(portalMat.uniforms.time.value * 5) * 0.35 : 0;
    if (office.mugDown) {   // kupa devrildi, kahve yayılıyor
      office.mug.rotation.z += (Math.PI / 2 - office.mug.rotation.z) * Math.min(1, dt * 12);
      office.spill.scale.setScalar(Math.min(1, office.spill.scale.x + dt * 0.8));
    }
    const t = portalMat.uniforms.time.value;
    for (const w of office.walkers) {   // koridorda dosya taşıyanlar (portal açılınca donup kalırlar)
      if (office.opening) { w.legL.rotation.x = w.legR.rotation.x = 0; continue; }
      w.z += w.dir * w.speed * dt;
      if (w.z < w.zMin) { w.dir = 1; w.g.rotation.y = Math.PI; } else if (w.z > w.zMax) { w.dir = -1; w.g.rotation.y = 0; }
      w.g.position.z = w.z; w.h.z = w.z;
      const sw = Math.sin(t * 7 + w.h.phase) * 0.5; w.legL.rotation.x = sw; w.legR.rotation.x = -sw;
    }
    for (const h of office.heads) {
      h.lookT = Math.max(0, h.lookT - dt);
      if (office.opening || h.track || h.lookT > 0) {
        const want = Math.atan2(-(playerPos.x - h.x), -(playerPos.z - h.z)) - h.g.rotation.y;
        let d = want - h.head.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        h.head.rotation.y += d * Math.min(1, dt * (h.lookT > 0 ? 6 : 1.2));
        h.head.rotation.x *= 0.9;
      } else if (h.standing) {   // sohbet: kafa sallama
        h.head.rotation.y += (Math.sin(t * 0.7 + h.phase) * 0.35 - h.head.rotation.y) * Math.min(1, dt * 3);
        h.head.rotation.x = Math.sin(t * 2.6 + h.phase) * 0.06;
      } else {   // ekrana gömülmüş
        h.head.rotation.y += -h.head.rotation.y * Math.min(1, dt * 2);
        h.head.rotation.x = 0.15 + Math.sin(t * 2 + h.phase) * 0.04;
      }
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
      if (p) {
        const fire = !!chunk.theme.skyTop;
        L.position.copy(p); L.visible = true; L.color.setHex(chunk.theme.light);
        L.userData.base = i < pts.length ? (fire ? 1.6 : 1.15) : 0.8; L.userData.fire = fire;
        L.userData.flicker = !fire && i < pts.length && chunk.lights[i].flicker; L.userData.mesh = chunk.lights[i] && chunk.lights[i].mesh;
      }
      else { L.intensity = 0; L.userData.base = 0; }
    });
    hemi.color.setHex(chunk.theme.hemiSky ?? chunk.theme.sky); hemi.groundColor.setHex(chunk.theme.ground);
    hemi.intensity = chunk.theme.skyTop ? 1.15 : 0.85;   // cehennemde göz gözü görsün
    focused = chunk.index;
    sky.visible = !!chunk.theme.skyTop;
    if (sky.visible) { const u = sky.material.uniforms; u.top.value.setHex(chunk.theme.skyTop); u.low.value.setHex(chunk.theme.skyLow); u.fog.value.setHex(chunk.theme.fog); }
  }

  let time = 0, focused = 0;
  // gökyüzü: kızıl bulutlar + kara güneş (sis rengine yumuşak geçiş)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, low: { value: new THREE.Color() }, fog: { value: new THREE.Color() }, time: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, low, fog; uniform float time; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){
        float h = vDir.y;
        vec3 col = mix(fog, low, smoothstep(-0.02, 0.12, h));
        col = mix(col, top, smoothstep(0.1, 0.7, h));
        vec2 uv = vDir.xz / (h + 0.3) * 1.6;
        float n = noise(uv * 1.3 + vec2(time * 0.02, 0.0)) * 0.6 + noise(uv * 3.0 - vec2(0.0, time * 0.035)) * 0.4;
        col += low * smoothstep(0.5, 0.85, n) * smoothstep(0.02, 0.4, h) * 0.55;
        vec3 sd = normalize(vec3(0.3, 0.42, -0.86));
        float d = dot(normalize(vDir), sd);
        col += low * 1.6 * smoothstep(0.975, 0.995, d);
        col = mix(col, vec3(0.0), smoothstep(0.9955, 0.997, d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sky.visible = false; sky.renderOrder = -1;

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
    // mangal / meşale alevleri: sadece içinde bulunulan ve sıradaki parça
    for (const c of chunks) {
      if (c.index < focused || c.index > focused + 1) continue;
      for (const f of c.flames) if ((!f.owner || f.owner.alive) && Math.random() < dt * 34 * f.size) FX.flame(f.p, c.theme.fire, f.size);
    }
    sky.material.uniforms.time.value = time;
    for (let li = 0; li < lightPool.length; li++) {
      const L = lightPool[li];
      const b = L.userData.base || 0;
      let k = 1;
      if (L.userData.fire) k = 0.78 + Math.sin(time * 11 + li * 1.7) * 0.12 + Math.sin(time * 23 + li) * 0.07 + Math.random() * 0.08;
      else if (L.userData.flicker) { k = (Math.sin(time * 37) + Math.sin(time * 13.7) > 1.2 || Math.random() < 0.04) ? 0.15 : 1; if (L.userData.mesh) L.userData.mesh.visible = k > 0.5; }
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
      scene.add(sky);
    },
    reset() { while (chunks.length) removeChunk(chunks[0]); removeOffice(); },
    build, removeChunk, moveAxis, raycast, overlapsAny, chunkAt, focus, update, mat, boxGeo,
    followSky(pos) { sky.position.copy(pos); },
    OX, buildOffice, removeOffice, openPortal, officeUpdate, slamDesk, drawInbox, openDrawer, takeZippo,
    get office() { return office; },
  };
})();
