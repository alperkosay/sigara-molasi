// Prosedürel, düşük çözünürlüklü piksel dokular (canvas ile çizilir).
const TEX = (() => {
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));

  function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

  function speckle(g, w, h, n, base, vary, alpha = 1) {
    for (let i = 0; i < n; i++) {
      const v = (rnd() - 0.5) * vary;
      g.fillStyle = rgb(base[0] + v, base[1] + v, base[2] + v, alpha);
      g.fillRect(ri(0, w - 1), ri(0, h - 1), 1, 1);
    }
  }
  function grime(g, w, h, n = 40) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rgb(0, 0, 0, 0.08 + rnd() * 0.15);
      g.fillRect(ri(0, w), ri(0, h), ri(1, 6), ri(1, 4));
    }
  }
  function bloodStreaks(g, w, h, n) {
    for (let i = 0; i < n; i++) {
      const x = ri(0, w - 1), y = ri(0, h / 2), len = ri(6, h - y);
      for (let k = 0; k < len; k++) { g.fillStyle = rgb(110 + rnd() * 40, 5, 5, 0.85 - k / len * 0.6); g.fillRect(x + (rnd() < 0.1 ? 1 : 0), y + k, rnd() < 0.3 ? 2 : 1, 1); }
    }
  }
  function cracks(g, n, col, hot) {   // rastgele yürüyen parlak çatlaklar
    for (let i = 0; i < n; i++) {
      let x = ri(0, 63), y = ri(0, 63);
      const len = ri(14, 30);
      for (let k = 0; k < len; k++) {
        g.fillStyle = k % 5 === 0 ? hot : col; g.fillRect((x + 64) % 64, (y + 64) % 64, 1, 1);
        if (rnd() < 0.5) x += rnd() < 0.5 ? -1 : 1; else y += rnd() < 0.5 ? -1 : 1;
      }
    }
  }
  function finish(c, repeat = true) {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  const make = {
    hellrock() { const [c, g] = canvas(64);
      g.fillStyle = '#16100e'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 26; i++) {
        const x = ri(0, 63), y = ri(0, 63), r = ri(5, 11), v = ri(-20, 20);
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (dx * dx + dy * dy > r * r) continue;
          const sh = (dy < 0 ? 18 : -10);
          g.fillStyle = rgb(72 + v + sh, 54 + v * 0.8 + sh * 0.8, 46 + v * 0.7 + sh * 0.6);
          g.fillRect((x + dx + 64) % 64, (y + dy + 64) % 64, 1, 1);
        }
      }
      speckle(g, 64, 64, 400, [56, 42, 36], 34);
      g.fillStyle = '#ff7a20'; for (let i = 0; i < 18; i++) g.fillRect(ri(0, 63), ri(0, 63), 1, 1);
      return finish(c); },
    flesh() { const [c, g] = canvas(64);
      g.fillStyle = '#4a2428'; g.fillRect(0, 0, 64, 64);
      speckle(g, 64, 64, 1400, [112, 62, 66], 46);
      for (let i = 0; i < 7; i++) { // damarlar
        let x = ri(0, 63), y = ri(0, 63);
        for (let k = 0; k < 50; k++) { g.fillStyle = rgb(40, 10, 40, 0.9); g.fillRect((x + 64) % 64, (y + 64) % 64, 2, 1); x += ri(-1, 1); y += ri(-1, 1); }
      }
      for (let i = 0; i < 10; i++) { g.fillStyle = rgb(200, 150, 90, 0.8); g.fillRect(ri(0, 62), ri(0, 62), 2, 2); }
      return finish(c); },
    lava() { const [c, g] = canvas(64);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const v = Math.sin(x * 0.3 + Math.sin(y * 0.2) * 2) + Math.sin(y * 0.25 + Math.cos(x * 0.15) * 2);
        const k = (v + 2) / 4;
        g.fillStyle = k > 0.7 ? '#ffe070' : k > 0.5 ? '#ff9a10' : k > 0.3 ? '#e04008' : '#801404';
        g.fillRect(x, y, 1, 1);
      }
      return finish(c); },
    light() { const [c, g] = canvas(16);
      g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#d0d0c0'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2);
      return finish(c); },
    blood() { const [c, g] = canvas(32);
      for (let i = 0; i < 9; i++) {
        const x = 16 + (rnd() - 0.5) * 18, y = 16 + (rnd() - 0.5) * 18, r = 2 + rnd() * 6;
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) {
          g.fillStyle = rgb(100 + rnd() * 50, 0, 0, 0.95); g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
        }
      }
      return finish(c, false); },
    pentagram() { const [c, g] = canvas(64);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;   // beyaz: renk malzemeden gelir
      g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5; const x = 32 + Math.cos(a) * 24, y = 32 + Math.sin(a) * 24; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      // pikselleştir
      const d = g.getImageData(0, 0, 64, 64); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 ? 255 : 0; g.putImageData(d, 0, 0);
      return finish(c, false); },
    skull() { const [c, g] = canvas(16);
      const map = [
        '................',
        '....XXXXXXXX....',
        '...XXXXXXXXXX...',
        '..XXXXXXXXXXXX..',
        '..XXXXXXXXXXXX..',
        '..XXOOOXXOOOXX..',
        '..XXORRXXRROXX..',
        '..XXOOOXXOOOXX..',
        '...XXXXOOXXXX...',
        '....XXXOOXXX....',
        '.....XXXXXX.....',
        '.....X.X.X.X....',
        '.....XXXXXXX....',
        '......X.X.X.....',
        '................',
        '................'];
      map.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.') return;
        g.fillStyle = ch === 'X' ? (rnd() < 0.2 ? '#bfae8a' : '#e6dcc0') : ch === 'O' ? '#120402' : '#ff2000';
        g.fillRect(x, y, 1, 1);
      }));
      return finish(c, false); },
    flash() { const [c, g] = canvas(32);
      for (let i = 0; i < 9; i++) { // yıldız şeklinde namlu alevi
        const a = i / 9 * Math.PI * 2, len = 10 + rnd() * 6;
        for (let k = 0; k < len; k++) { const x = 16 + Math.cos(a) * k, y = 16 + Math.sin(a) * k; g.fillStyle = k < 5 ? '#fff6c0' : k < 9 ? '#ffc040' : '#ff6010'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
      }
      g.fillStyle = '#fffbe0'; g.fillRect(12, 12, 8, 8);
      return finish(c, false); },
    // ---------- CEHENNEM ----------
    hellfloor() { const [c, g] = canvas(64);   // bazalt levhalar + içinden lav sızan çatlaklar
      g.fillStyle = '#1a0c08'; g.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
        const v = ri(-8, 8), ox = ri(0, 2), oy = ri(0, 2);
        g.fillStyle = rgb(48 + v, 26 + v / 2, 20 + v / 3); g.fillRect(x + 1 + ox, y + 1 + oy, 14 - ox, 14 - oy);
        g.fillStyle = rgb(66 + v, 38 + v / 2, 28); g.fillRect(x + 1 + ox, y + 1 + oy, 14 - ox, 1);
      }
      speckle(g, 64, 64, 700, [44, 24, 18], 26);
      cracks(g, 7, '#ff6010', '#ffd060');
      return finish(c); },
    bone() { const [c, g] = canvas(64);   // kafatası ve kemiklerden örülü duvar
      g.fillStyle = '#2a2216'; g.fillRect(0, 0, 64, 64);
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const x = col * 8 + (row % 2) * 4, y = row * 8, v = ri(-18, 12);
        if (rnd() < 0.55) {   // kafatası
          g.fillStyle = rgb(200 + v, 186 + v, 150 + v); g.fillRect(x + 1, y + 1, 6, 5); g.fillRect(x + 2, y + 6, 4, 1);
          g.fillStyle = '#140c06'; g.fillRect(x + 2, y + 3, 1, 1); g.fillRect(x + 5, y + 3, 1, 1); g.fillRect(x + 3, y + 5, 2, 1);
        } else {   // çapraz kemik
          g.fillStyle = rgb(176 + v, 162 + v, 128 + v); g.fillRect(x, y + 3, 8, 2); g.fillRect(x, y + 2, 1, 4); g.fillRect(x + 7, y + 2, 1, 4);
        }
      }
      speckle(g, 64, 64, 300, [60, 50, 36], 30); grime(g, 64, 64, 40);
      return finish(c); },
    bonefloor() { const [c, g] = canvas(64);
      g.fillStyle = '#4a4232'; g.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) {
        const v = ri(-10, 10); g.fillStyle = rgb(110 + v, 100 + v, 78 + v); g.fillRect(x + 1, y + 1, 30, 30);
        g.fillStyle = rgb(140 + v, 128 + v, 100 + v); g.fillRect(x + 1, y + 1, 30, 1);
      }
      speckle(g, 64, 64, 900, [100, 92, 70], 34); grime(g, 64, 64, 70);
      cracks(g, 5, '#3a3020', '#1a140a');
      for (let i = 0; i < 4; i++) { g.fillStyle = '#d8ccb0'; const x = ri(4, 56), y = ri(4, 56); g.fillRect(x, y, 5, 1); g.fillRect(x, y - 1, 1, 3); g.fillRect(x + 4, y - 1, 1, 3); }
      return finish(c); },
    gate() { const [c, g] = canvas(64);   // dövme demir parmaklık
      g.fillStyle = '#0a0606'; g.fillRect(0, 0, 64, 64);
      for (let x = 2; x < 64; x += 8) { g.fillStyle = '#3a3230'; g.fillRect(x, 0, 4, 64); g.fillStyle = '#5a4a44'; g.fillRect(x, 0, 1, 64);
        g.fillStyle = '#2a2220'; g.beginPath(); g.moveTo(x - 1, 64); g.lineTo(x + 5, 64); g.lineTo(x + 2, 56); g.fill(); }
      for (const y of [10, 34]) { g.fillStyle = '#4a3c36'; g.fillRect(0, y, 64, 5); g.fillStyle = '#6a5a50'; g.fillRect(0, y, 64, 1); }
      for (let i = 0; i < 70; i++) { g.fillStyle = rgb(110 + rnd() * 40, 40, 16, 0.7); g.fillRect(ri(0, 63), ri(0, 63), 1, ri(1, 3)); }   // pas
      return finish(c); },
    rune() { const [c, g] = canvas(64, 16);   // parlayan rün şeridi (renk malzemeden gelir)
      g.fillStyle = '#000'; g.fillRect(0, 0, 64, 16);
      g.fillStyle = '#fff';
      for (let x = 2; x < 62; x += 8) {
        const k = ri(0, 3);
        g.fillRect(x + 2, 3, 1, 10);
        if (k === 0) { g.fillRect(x, 3, 5, 1); g.fillRect(x, 8, 5, 1); }
        if (k === 1) { g.fillRect(x, 6, 5, 1); g.fillRect(x + 4, 3, 1, 5); }
        if (k === 2) { g.fillRect(x, 12, 5, 1); g.fillRect(x, 3, 1, 4); }
        if (k === 3) { for (let d = 0; d < 5; d++) g.fillRect(x + d, 3 + d * 2, 1, 1); }
      }
      return finish(c); },
    urn() { const [c, g] = canvas(32);   // kükürt kazanı: çatlak taş
      g.fillStyle = '#2a2420'; g.fillRect(0, 0, 32, 32);
      for (let x = 0; x < 32; x++) { const v = Math.sin(x / 32 * Math.PI * 2) * 14; g.fillStyle = rgb(62 + v, 52 + v, 44 + v); g.fillRect(x, 0, 1, 32); }
      g.fillStyle = '#1a1410'; g.fillRect(0, 5, 32, 2); g.fillRect(0, 25, 32, 2);
      g.fillStyle = '#e8c020'; for (let x = 2; x < 32; x += 6) { g.fillRect(x, 13, 3, 1); g.fillRect(x + 1, 12, 1, 3); }   // kükürt işareti
      cracks(g, 3, '#ff7010', '#ffc040');
      return finish(c); },
    // ---------- OFİS ----------
    carpet() { const [c, g] = canvas(64);
      g.fillStyle = '#3a4250'; g.fillRect(0, 0, 64, 64);
      speckle(g, 64, 64, 1800, [58, 66, 80], 26);
      g.fillStyle = 'rgba(20,24,32,.5)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 1, 64); g.fillRect(0, i, 64, 1); }
      g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(40, 10, 9, 6); g.fillRect(42, 15, 5, 3);   // kahve lekesi
      return finish(c); },
    officeWall() { const [c, g] = canvas(64);
      g.fillStyle = '#b8b0a0'; g.fillRect(0, 0, 64, 64);
      speckle(g, 64, 64, 700, [180, 172, 156], 14);
      g.fillStyle = '#5a554c'; g.fillRect(0, 58, 64, 6); g.fillStyle = '#7a7466'; g.fillRect(0, 58, 64, 1);  // süpürgelik
      g.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < 6; i++) g.fillRect(ri(0, 60), ri(0, 50), ri(2, 5), ri(4, 12));
      return finish(c); },
    ceilingTile() { const [c, g] = canvas(32);
      g.fillStyle = '#d4d2cc'; g.fillRect(0, 0, 32, 32);
      speckle(g, 32, 32, 200, [190, 188, 182], 30);
      g.fillStyle = '#8a8880'; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
      g.fillStyle = 'rgba(120,90,40,.25)'; g.fillRect(18, 20, 7, 5);   // su lekesi
      return finish(c); },
    cubicle() { const [c, g] = canvas(32);
      g.fillStyle = '#5a6068'; g.fillRect(0, 0, 32, 32);
      speckle(g, 32, 32, 400, [92, 98, 106], 22);
      g.fillStyle = '#8a9098'; g.fillRect(0, 0, 32, 2);
      return finish(c); },
    desk() { const [c, g] = canvas(32);
      for (let y = 0; y < 32; y++) { const v = Math.sin(y * 0.7) * 8; g.fillStyle = rgb(150 + v, 120 + v, 84 + v); g.fillRect(0, y, 32, 1); }
      speckle(g, 32, 32, 100, [140, 110, 76], 20);
      return finish(c); },
    screen() { const [c, g] = canvas(32, 24);
      g.fillStyle = '#10244a'; g.fillRect(0, 0, 32, 24);
      g.fillStyle = '#2a5aa0'; g.fillRect(0, 0, 32, 3);
      for (let y = 5; y < 22; y += 3) for (let x = 2; x < 30; x += 7) { g.fillStyle = rnd() < 0.15 ? '#40c060' : '#c0d0e8'; g.fillRect(x, y, ri(3, 6), 1); }   // excel
      return finish(c, false); },
    windowNight() { const [c, g] = canvas(64, 32);
      g.fillStyle = '#060a18'; g.fillRect(0, 0, 64, 32);
      for (let i = 0; i < 9; i++) { const x = ri(0, 58), w = ri(4, 9), h = ri(8, 22); g.fillStyle = '#0c1226'; g.fillRect(x, 32 - h, w, h);
        for (let k = 0; k < 6; k++) if (rnd() < 0.6) { g.fillStyle = rnd() < 0.8 ? '#e8c060' : '#80a0ff'; g.fillRect(x + ri(1, w - 2), 32 - ri(2, h - 2), 1, 1); } }
      g.fillStyle = '#2a2e36'; g.fillRect(0, 0, 64, 1); g.fillRect(31, 0, 2, 32); g.fillRect(0, 31, 64, 1);
      return finish(c, false); },
    poster() { const [c, g] = canvas(48, 64);
      g.fillStyle = '#101010'; g.fillRect(0, 0, 48, 64);
      for (let y = 4; y < 40; y++) { const k = (y - 4) / 36; g.fillStyle = rgb(255 * (0.5 + k * 0.5), 120 + k * 60, 60 + k * 20); g.fillRect(4, y, 40, 1); }
      g.fillStyle = '#1a1010'; g.beginPath(); g.moveTo(4, 40); g.lineTo(18, 18); g.lineTo(26, 28); g.lineTo(34, 14); g.lineTo(44, 40); g.fill();
      g.fillStyle = '#e8e0d0'; g.font = 'bold 8px monospace'; g.textAlign = 'center';
      g.fillText('TAKIM', 24, 50); g.fillText('RUHU', 24, 58);
      return finish(c, false); },
    clock() { const [c, g] = canvas(32, 16);
      g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 32, 16);
      g.fillStyle = '#ff2010'; g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.fillText('17:59', 16, 12);
      return finish(c, false); },
    marker() { const [c, g] = canvas(16);   // baş üstü hedef işareti: siyah kenarlı aşağı ok (renk malzemeden)
      g.fillStyle = '#000'; g.beginPath(); g.moveTo(0.5, 2.5); g.lineTo(15.5, 2.5); g.lineTo(8, 14); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(3, 4); g.lineTo(13, 4); g.lineTo(8, 11.5); g.fill();
      const d = g.getImageData(0, 0, 16, 16); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0; g.putImageData(d, 0, 0);
      return finish(c, false); },
    glow() { const [c, g] = canvas(16);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5) / 8; const a = Math.max(0, 1 - d);
        g.fillStyle = rgb(255, 255, 255, Math.round(a * a * 4) / 4); g.fillRect(x, y, 1, 1);
      }
      return finish(c, false); },
  };

  const cache = {};
  return { get(name) { return cache[name] || (cache[name] = make[name]()); } };
})();
