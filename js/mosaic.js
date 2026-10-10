/**
 * mosaic.js — the Peace picture. Every dot is a slice of the time you stayed away; the dots slowly paint a scene.
 * Every visit gets a brand-new scene: a random type (hills, mandala, aurora, ripples, planet, bloom), a random palette
 * and random shapes, all moving gently. Drawn with p5.js (loaded the first time the tab opens; bundled in js/vendor).
 */
const COLS = 24;
const UNITS = [
  [1, 'one second'], [10, '10 seconds'], [60, 'one minute'], [600, '10 minutes'], [3600, 'one hour'],
  [21600, '6 hours'], [86400, 'one day'], [604800, 'one week'], [2592000, '30 days'],
];
const fmtWhen = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- small colour helpers (colours are [r, g, b]) ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const grad = (stops, t) => {
  const x = clamp(t) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
};
const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dark = (c, k = 0.25) => [c[0] * k, c[1] * k, c[2] * k];
const shine = (c) => [255 * clamp(c[0] / 255) ** 0.78, 255 * clamp(c[1] / 255) ** 0.78, 255 * clamp(c[2] / 255) ** 0.78];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const PALETTES = [
  { name: 'Rose dusk', sky: ['#2b1055', '#c04a86', '#ffb199'], glow: '#fff1c9', hills: ['#7b3f8c', '#4a2a73', '#241349'], acc: ['#ff9ac6', '#ffd1a1', '#b69cff'] },
  { name: 'Ocean night', sky: ['#06142e', '#16508a', '#7fd0e8'], glow: '#f4fbff', hills: ['#2c6d9c', '#17456e', '#0a2342'], acc: ['#5ee6d8', '#7fb2ff', '#c8f3ff'] },
  { name: 'Forest dawn', sky: ['#0f2b2b', '#3f8a6b', '#f5e6a8'], glow: '#fffbd1', hills: ['#5aa178', '#2f6f55', '#14403a'], acc: ['#a8e6a1', '#f5e6a8', '#6fd0b5'] },
  { name: 'Lavender', sky: ['#1c1442', '#6a5acd', '#f3c5ff'], glow: '#fff0ff', hills: ['#8f7fe0', '#5a4bb5', '#2e2477'], acc: ['#d7b8ff', '#ff9ee0', '#9ec5ff'] },
  { name: 'Peach sky', sky: ['#3a1c71', '#d76d77', '#ffaf7b'], glow: '#fff4d6', hills: ['#b8578a', '#7a3a85', '#3d1f5c'], acc: ['#ffd29a', '#ff8fa3', '#c9a0ff'] },
  { name: 'Mint night', sky: ['#04121f', '#0f5257', '#7be0c3'], glow: '#e8fff7', hills: ['#2f9c8b', '#1a6a68', '#0b3d46'], acc: ['#7be0c3', '#80b3ff', '#e0ff9e'] },
  { name: 'Golden hour', sky: ['#2d1b4e', '#e0663a', '#ffd36e'], glow: '#fffbe0', hills: ['#c0522f', '#7d3226', '#3c1b24'], acc: ['#ffd36e', '#ff9d6e', '#ffe9a8'] },
].map((p) => ({ name: p.name, sky: p.sky.map(hex), glow: hex(p.glow), hills: p.hills.map(hex), acc: p.acc.map(hex) }));

const stars = (u, v, t, density = 0.93) => {
  const a = Math.floor((u + 1) * 11), b = Math.floor((v + 1) * 11), h = hash(a, b);
  return h > density ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2 + h * 40)) : 0;
};

// ---------- scene makers: each returns f(u, v, t) -> [r, g, b], u and v in [-1, 1], v pointing down ----------
const SCENES = {
  Hills(rng, pal) {
    const sx = rng() * 1.2 - 0.6, sy = -0.62 + rng() * 0.3, sr = 0.13 + rng() * 0.1, moon = rng() < 0.5;
    const n = 3 + Math.floor(rng() * 3);
    const layers = Array.from({ length: n }, (_, i) => ({
      base: 0.05 + (i / n) * 0.8, amp: 0.1 + rng() * 0.16, f: 1.3 + rng() * 2.2, ph: rng() * 6.28, f2: 3 + rng() * 3, ph2: rng() * 6.28,
      col: grad([mix(pal.sky[1], pal.hills[0], 0.55), pal.hills[1], dark(pal.hills[2], 0.5)], n === 1 ? 1 : i / (n - 1)), sw: 0.04 + rng() * 0.05,
    }));
    return (u, v, t) => {
      let c = grad(pal.sky, (v + 1) / 1.7);
      const d = Math.hypot(u - sx, v - sy);
      c = add(c, pal.glow, 0.55 * Math.exp(-((d / (sr * 3)) ** 2)));
      if (d < sr) c = moon ? mix(pal.glow, [200, 205, 230], smooth(-sr, sr, u - sx) * 0.6) : pal.glow;
      const s = v < -0.1 ? stars(u, v, t) : 0;
      if (s) c = mix(c, [255, 255, 255], s * 0.9);
      for (let i = n - 1; i >= 0; i--) {
        const L = layers[i];
        const y = L.base + L.amp * Math.sin(u * L.f + L.ph + t * L.sw) + L.amp * 0.4 * Math.sin(u * L.f2 + L.ph2 - t * L.sw * 1.3);
        if (v > y) { return mix(L.col, pal.sky[1], Math.exp(-(v - y) * 7) * 0.3 * (1 - i / n)); }
      }
      return c;
    };
  },

  Mandala(rng, pal) {
    const n = 5 + Math.floor(rng() * 8), k = 2 + rng() * 4, sp = 0.15 + rng() * 0.3, k2 = 6 + rng() * 8, ring = rng() * 6;
    const bg = dark(pal.sky[0], 0.6), cols = [bg, ...pal.acc.map((c) => mix(c, bg, 0.2)), pal.glow];
    return (u, v, t) => {
      const r = Math.hypot(u, v), a = Math.atan2(v, u);
      const w = Math.sin(n * a + k * r * 5 - t * sp * 3), w2 = Math.sin(r * k2 - t * sp * 2 + ring);
      const val = clamp((w * 0.5 + 0.5) * (0.55 + 0.45 * w2) * 1.15);
      const edge = smooth(1.08, 0.6, r);
      return mix(bg, grad(cols, val), edge * (0.35 + 0.65 * smooth(0, 0.25, r)));
    };
  },

  Aurora(rng, pal) {
    const bands = Array.from({ length: 3 }, (_, i) => ({ y: -0.5 + i * 0.2 + rng() * 0.1, f: 1 + rng() * 1.6, ph: rng() * 6.28, sp: 0.15 + rng() * 0.25, w: 0.1 + rng() * 0.1, col: pal.acc[(i + Math.floor(rng() * 3)) % 3] }));
    const mf = 1.5 + rng() * 2.5, mph = rng() * 6.28, ma = 0.08 + rng() * 0.1;
    const night = [dark(pal.sky[0], 0.45), dark(mix(pal.sky[0], pal.sky[1], 0.5), 0.5)];
    return (u, v, t) => {
      let c = grad(night, (v + 1) / 2);
      const s = stars(u, v, t, 0.9); if (s) c = mix(c, [255, 255, 255], s * 0.9);
      for (const b of bands) {
        const yc = b.y + 0.18 * Math.sin(u * b.f * 2 + b.ph + t * b.sp) + 0.06 * Math.sin(u * 7 - t * b.sp * 2);
        const inten = Math.exp(-(((v - yc) / b.w) ** 2)) * (0.65 + 0.35 * Math.sin(u * 3 + t * 0.5 + b.ph));
        c = add(c, b.col, inten * 0.85);
      }
      const gy = 0.66 + ma * Math.sin(u * mf + mph);
      if (v > gy) return dark(mix(pal.hills[2], night[0], 0.4), 0.7);
      return c;
    };
  },

  Ripples(rng, pal) {
    const K = 2 + Math.floor(rng() * 3);
    const src = Array.from({ length: K }, () => ({ x: rng() * 1.4 - 0.7, y: rng() * 1.2 - 0.6, spd: 0.15 + rng() * 0.2, f: 9 + rng() * 9, ph: rng() * 6.28, col: pal.acc[Math.floor(rng() * 3)] }));
    const deep = dark(pal.sky[0], 0.7), shallow = mix(pal.sky[1], pal.sky[2], 0.3);
    return (u, v, t) => {
      let c = mix(deep, shallow, smooth(-1, 1, v + 0.25 * Math.sin(u * 2 + t * 0.3)) * 0.8);
      for (const s of src) {
        const d = Math.hypot(u - s.x, v - s.y);
        const ring = Math.max(0, Math.sin((d - t * s.spd) * s.f + s.ph)) ** 3 * Math.exp(-d * 1.1);
        c = add(c, s.col, ring * 0.85);
      }
      return c;
    };
  },

  Planet(rng, pal) {
    const px = rng() * 0.7 - 0.35, py = rng() * 0.5 - 0.25, R = 0.38 + rng() * 0.16;
    const lx = rng() * 1.2 - 0.9, ly = -0.5 - rng() * 0.4, lz = 0.7, ll = Math.hypot(lx, ly, lz);
    const bandsK = 5 + rng() * 8, warp = 0.3 + rng() * 0.6, tilt = -0.5 + rng() * 1, ringR = R * (1.5 + rng() * 0.4), ringW = R * (0.2 + rng() * 0.14), hasRing = rng() < 0.7;
    const body = [dark(pal.hills[2], 0.8), pal.acc[0], pal.acc[1], pal.glow];
    const night = dark(pal.sky[0], 0.45);
    return (u, v, t) => {
      let c = mix(night, dark(pal.sky[1], 0.5), smooth(-1, 1, v));
      const s = stars(u, v, t, 0.9); if (s) c = mix(c, [255, 255, 255], s * 0.9);
      const dx = u - px, dy = v - py, d = Math.hypot(dx, dy);
      const ct = Math.cos(tilt), st = Math.sin(tilt), rx = dx * ct + dy * st, ry = (-dx * st + dy * ct) / 0.28;
      const ringD = Math.abs(Math.hypot(rx, ry) - ringR), onRing = hasRing && ringD < ringW && Math.abs(ry * 0.28) < ringR * 0.9;
      const front = ry > 0;
      c = add(c, pal.acc[1], 0.2 * Math.exp(-(((d - R) / 0.12) ** 2)) * (d > R ? 1 : 0));
      if (onRing && !front && d > R) return mix(c, mix(pal.acc[2], pal.glow, 0.5), 0.85 - ringD / ringW * 0.4);
      if (d < R) {
        const nx = dx / R, ny = dy / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const light = smooth(-0.05, 0.85, (nx * lx + ny * ly + nz * lz) / ll) * 0.95 + 0.1;
        const band = 0.5 + 0.5 * Math.sin(ny * bandsK + warp * Math.sin(nx * 2.5 + t * 0.15) + t * 0.05);
        c = mix(dark(grad(body, band), 0.3), grad(body, 0.25 + band * 0.75), clamp(light));
      }
      if (onRing && front) return mix(c, mix(pal.acc[2], pal.glow, 0.5), 0.9 - ringD / ringW * 0.4);
      return c;
    };
  },

  Bloom(rng, pal) {
    const n = 5 + Math.floor(rng() * 6), R = 0.55 + rng() * 0.2, cy = -0.1 + rng() * 0.2, rot = rng() * 6.28, depth = 0.25 + rng() * 0.3;
    const bg = [dark(pal.sky[0], 0.6), mix(pal.sky[1], pal.sky[0], 0.4)];
    const pet = [pal.acc[0], pal.acc[1], pal.glow];
    return (u, v, t) => {
      let c = grad(bg, (v + 1) / 2);
      const s = stars(u, v, t, 0.95); if (s) c = mix(c, [255, 255, 255], s * 0.6);
      const dx = u, dy = v - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + rot + t * 0.04;
      c = add(c, pal.acc[2], 0.22 * Math.exp(-((r / (R * 1.2)) ** 2)));
      const open = 0.5 + 0.5 * Math.sin(t * 0.35);
      for (let layer = 1; layer >= 0; layer--) {
        const rr = R * (1 - layer * depth) * (0.94 + 0.06 * open), aa = a + layer * Math.PI / n;
        const shape = rr * (0.45 + 0.55 * Math.abs(Math.cos((n / 2) * aa)));
        if (r < shape) return mix(grad(pet, 1 - r / rr + layer * 0.2), dark(pal.acc[0], 0.6), smooth(0.8, 1, r / shape) * 0.45);
      }
      if (r < R * 0.2) return mix(pal.glow, pal.acc[1], r / (R * 0.2));
      return c;
    };
  },
};
const SCENE_NAMES = Object.keys(SCENES);

let p5Loading = null;
function loadP5() {
  if (window.p5) return Promise.resolve();
  p5Loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/p5.min.js', import.meta.url).href;
    s.onload = resolve;
    s.onerror = () => { p5Loading = null; reject(new Error('p5 failed to load')); };
    document.head.append(s);
  });
  return p5Loading;
}

export function createMosaic({ host, getInfo, onText }) {
  let inst = null, timer = null, want = false;
  let shape = 'circle';
  let scene = null;
  let lastType = '';
  let cells = [];
  let flies = [];
  let selected = -1, ripple = 0, size = 300, born = 0;

  function build() {
    let type; do { type = SCENE_NAMES[Math.floor(Math.random() * SCENE_NAMES.length)]; } while (type === lastType);
    lastType = type;
    const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
    scene = { type, pal, f: SCENES[type](rng, pal), title: `${pal.name} · ${type}` };
    const ox = rng() * 1.2 - 0.6, oy = rng() * 1.2 - 0.6;
    cells = [];
    for (let r = 0; r < COLS; r++) for (let c = 0; c < COLS; c++) {
      const u = ((c + 0.5) / COLS) * 2 - 1, v = ((r + 0.5) / COLS) * 2 - 1;
      cells.push({ c, r, u, v, ph: rng() * 6.28, key: Math.hypot(u - ox, v - oy) + rng() * 0.45, order: 0 });
    }
    [...cells].sort((a, b) => a.key - b.key).forEach((k, i) => { k.order = i; });
    flies = Array.from({ length: 16 }, () => ({ x: rng(), y: rng(), vx: (rng() - 0.5) * 0.02, vy: -0.01 - rng() * 0.02, ph: rng() * 6.28, r: 1.5 + rng() * 2.5 }));
    selected = -1;
    born = performance.now();
  }

  function state() {
    const { anchorTs } = getInfo();
    const total = Math.max(0, (Date.now() - anchorTs) / 1000);
    const [unit, label] = UNITS.find(([u]) => Math.floor(total / u) <= cells.length) ?? UNITS[UNITS.length - 1];
    const whole = Math.min(cells.length, Math.floor(total / unit));
    return { total, unit, label, whole, frac: whole >= cells.length ? 0 : (total / unit) - whole, anchorTs };
  }

  function legend() {
    const s = state();
    onText?.(s.whole >= cells.length ? `${scene.title}: the picture is complete. Every dot is yours.`
      : `${scene.title} · each dot is ${s.label} of peace · ${s.whole.toLocaleString('en-GB')} of ${cells.length.toLocaleString('en-GB')} painted`);
  }

  function pick(ev) {
    const cv = host.querySelector('canvas');
    if (!cv) return;
    const rect = cv.getBoundingClientRect(), cell = rect.width / COLS;
    const c = Math.floor((ev.clientX - rect.left) / cell), r = Math.floor((ev.clientY - rect.top) / cell);
    const i = cells.findIndex((k) => k.c === c && k.r === r);
    if (i < 0) return;
    const s = state(), k = cells[i];
    selected = i; ripple = 1;
    navigator.vibrate?.(8);
    onText?.(k.order < s.whole ? `This dot is ${s.label} of peace: ${fmtWhen.format(new Date(s.anchorTs + k.order * s.unit * 1000))}. You were there for it.`
      : k.order === s.whole ? 'This one is filling in right now.' : 'Not painted yet. It fills in as time passes.');
    inst?.redraw();
  }

  function sketch(p) {
    p.setup = () => {
      size = Math.max(200, Math.floor(host.clientWidth));
      const cv = p.createCanvas(size, size);
      cv.parent(host);
      cv.elt.setAttribute('role', 'img');
      cv.elt.setAttribute('aria-label', 'A picture painted by your days of peace, one dot at a time. It is different every visit.');
      cv.elt.addEventListener('pointerdown', pick);
      p.frameRate(30);
      p.noStroke();
      if (reduced()) p.noLoop();
    };
    p.draw = () => {
      p.clear();
      const cell = size / COLS, s = state(), still = reduced();
      const t = still ? 2 : p.millis() / 1000, age = still ? 1e6 : performance.now() - born;
      p.rectMode(p.CENTER);
      for (const k of cells) {
        const x = (k.c + 0.5) * cell, y = (k.r + 0.5) * cell;
        let d, col;
        if (k.order < s.whole) {
          const e = clamp((age - Math.min(k.order * 5, 1600)) / 650);
          const pop = e < 1 ? 1 + 2.70158 * (e - 1) ** 3 + 1.70158 * (e - 1) ** 2 : 1;   // ease-out-back
          const wave = 0.5 + 0.5 * Math.sin(t * 1.3 - Math.hypot(k.u, k.v) * 5 + k.ph * 0.3);
          d = cell * (0.74 + 0.2 * wave) * clamp(pop, 0, 1.25) * (e > 0 ? 1 : 0);
          col = shine(scene.f(k.u, k.v, t));
        } else if (k.order === s.whole) {
          d = cell * (0.25 + 0.5 * s.frac) * (0.9 + 0.1 * Math.sin(t * 3));
          col = shine(scene.f(k.u, k.v, t));
        } else { d = cell * 0.16; col = null; }
        if (d <= 0) continue;
        if (col) p.fill(col[0], col[1], col[2]); else p.fill(255, 255, 255, 34);
        if (shape === 'circle') p.circle(x, y, d); else p.rect(x, y, d, d, d * 0.18);
      }
      if (!still) {
        const glow = scene.pal.glow;
        for (const f of flies) {
          f.x += f.vx + Math.sin(t * 0.5 + f.ph) * 0.0008; f.y += f.vy * 0.5;
          if (f.y < -0.05) { f.y = 1.05; f.x = Math.random(); }
          const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.7 + f.ph));
          p.fill(glow[0], glow[1], glow[2], 40 * a); p.circle(f.x * size, f.y * size, f.r * 5);
          p.fill(glow[0], glow[1], glow[2], 200 * a); p.circle(f.x * size, f.y * size, f.r);
        }
      }
      if (selected >= 0) {
        const k = cells[selected];
        p.noFill(); p.stroke(255, 255, 255, 200); p.strokeWeight(2);
        p.circle((k.c + 0.5) * cell, (k.r + 0.5) * cell, cell * (1.2 + (1 - ripple) * 1.1));
        p.noStroke();
        ripple = Math.max(0, ripple - 0.03);
      }
    };
  }

  async function start() {
    stop();
    want = true;
    await loadP5();
    if (!want || inst) return;
    build();
    inst = new window.p5(sketch);
    legend();
    timer = setInterval(() => { legend(); if (reduced()) inst?.redraw(); }, 1000);
  }
  function stop() {
    want = false;
    clearInterval(timer); timer = null;
    inst?.remove(); inst = null;
  }
  function next() { build(); legend(); inst?.redraw(); }
  function toggleShape() { shape = shape === 'circle' ? 'square' : 'circle'; inst?.redraw(); return shape; }
  return { start, stop, next, toggleShape };
}
