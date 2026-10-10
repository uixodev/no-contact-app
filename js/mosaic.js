/**
 * mosaic.js — "Peace" picture: every dot is a slice of time you stayed away, and the dots slowly paint a picture.
 * Drawn with p5.js (loaded the first time the Peace tab opens; bundled in js/vendor so it works offline).
 */
const COLS = 30;
const UNITS = [
  [1, 'one second'], [10, '10 seconds'], [60, 'one minute'], [600, '10 minutes'], [3600, 'one hour'],
  [21600, '6 hours'], [86400, 'one day'], [604800, 'one week'], [2592000, '30 days'],
];
const fmtWhen = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Each picture is a function over (u, v) in [-1, 1] (v points down) that returns a colour, or null for empty space. */
const PICTURES = [
  { name: 'Heart', f: (u, v) => {
    const x = u * 1.25, y = -v * 1.25 + 0.15;
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0 ? (v < -0.2 ? '#ff7b9c' : v < 0.3 ? '#ff4d79' : '#e0245e') : null;
  } },
  { name: 'Moon and stars', f: (u, v) => {
    const moon = u * u + v * v < 0.62 && (u - 0.38) ** 2 + (v + 0.1) ** 2 > 0.4;
    if (moon) return v < 0 ? '#fff3c4' : '#ffe08a';
    const h = hash(Math.round(u * 20), Math.round(v * 20));
    return h > 0.93 ? '#ffffff' : h > 0.88 ? '#bcd0ff' : null;
  } },
  { name: 'Sun', f: (u, v) => {
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    if (r < 0.42) return r < 0.25 ? '#ffd23f' : '#ffb627';
    if (r > 0.55 && r < 0.92 && Math.sin(a * 8) > 0.15) return '#ff9f1c';
    return null;
  } },
  { name: 'Flower', f: (u, v) => {
    const r = Math.hypot(u, v - -0.18), a = Math.atan2(v + 0.18, u);
    if (r < 0.15) return '#ffd23f';
    if (r < 0.62 * (0.6 + 0.4 * Math.abs(Math.cos(2.5 * a)))) return Math.abs(Math.cos(2.5 * a)) > 0.7 ? '#ff8fb8' : '#ffb3d0';
    if (Math.abs(u) < 0.06 && v > 0.45) return '#3ea34a';
    if (v > 0.55 && v < 0.8 && Math.abs(u - 0.28 - (v - 0.55) * 0.4) < 0.17 - Math.abs(v - 0.67) * 0.5) return '#5ccf6e';
    return null;
  } },
  { name: 'Mountains', f: (u, v) => {
    const ridge = (x) => 0.1 - 0.75 * Math.max(0, 1 - Math.abs(x + 0.35) * 1.5) - 0.45 * Math.max(0, 1 - Math.abs(x - 0.45) * 2);
    const sun = Math.hypot(u - 0.5, v + 0.6) < 0.2;
    if (sun) return '#ffd23f';
    const h = ridge(u);
    if (v > h) return v < h + 0.14 && h < -0.35 ? '#ffffff' : v > 0.55 ? '#2f6f8f' : '#5a7fa8';
    return v < -0.3 ? '#3b4a8a' : '#f4a6a0';
  } },
  { name: 'Tree', f: (u, v) => {
    if (Math.abs(u) < 0.09 && v > 0.2 && v < 0.85) return '#8a5a2b';
    if (Math.hypot(u, v + 0.2) < 0.62) return hash(Math.round(u * 15), Math.round(v * 15)) > 0.7 ? '#7ad06b' : '#3ea34a';
    return v > 0.85 && Math.abs(u) < 0.5 ? '#6bbf59' : null;
  } },
  { name: 'Sea', f: (u, v) => {
    if (Math.hypot(u + 0.45, v + 0.55) < 0.22) return '#fff3c4';
    const w = (k, s, o) => 0.18 * v * 0 + Math.sin(u * k + o) * s;
    if (v > 0.05 + w(5, 0.08, 0)) return v > 0.5 + w(6, 0.07, 1.5) ? '#1f5f99' : v > 0.28 + w(4, 0.06, 3) ? '#3b8bd0' : '#6db8ee';
    return v < -0.5 ? '#20305e' : '#33497f';
  } },
];

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

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
  let inst = null;
  let timer = null;
  let picIndex = Math.floor(Math.random() * PICTURES.length);
  let shape = 'circle';
  let cells = [];
  let selected = -1;
  let ripple = 0;
  let size = 300;
  let want = false;

  function build() {
    const pic = PICTURES[picIndex];
    cells = [];
    for (let r = 0; r < COLS; r++) for (let c = 0; c < COLS; c++) {
      const u = ((c + 0.5) / COLS) * 2 - 1, v = ((r + 0.5) / COLS) * 2 - 1;
      const col = pic.f(u, v);
      if (col) cells.push({ c, r, col, ph: Math.random() * 6.28, order: 0 });
    }
    const rng = mulberry32(Math.round((getInfo().anchorTs / 1000) % 2147483647) + picIndex * 101);
    const idx = cells.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    idx.forEach((cellIndex, rank) => { cells[cellIndex].order = rank; });
    selected = -1;
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
    const done = s.whole >= cells.length;
    onText?.(done ? `The picture is complete: ${PICTURES[picIndex].name}. Every dot is yours.`
      : `${PICTURES[picIndex].name} · each dot is ${s.label} of peace · ${s.whole.toLocaleString('en-GB')} of ${cells.length.toLocaleString('en-GB')} dots painted`);
  }

  function pick(ev) {
    const cv = host.querySelector('canvas');
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const cell = size / COLS;
    const c = Math.floor((ev.clientX - rect.left) / cell), r = Math.floor((ev.clientY - rect.top) / cell);
    const i = cells.findIndex((k) => k.c === c && k.r === r);
    if (i < 0) return;
    const s = state();
    const k = cells[i];
    selected = i; ripple = 1;
    navigator.vibrate?.(8);
    if (k.order < s.whole) {
      const t0 = s.anchorTs + k.order * s.unit * 1000;
      onText?.(`This dot is ${s.label} of peace: ${fmtWhen.format(new Date(t0))}. You were there for it.`);
    } else {
      onText?.(k.order === s.whole ? 'This one is filling in right now.' : 'Not painted yet. It fills in as time passes.');
    }
    inst?.redraw();
  }

  function sketch(p) {
    p.setup = () => {
      size = Math.max(200, Math.floor(host.clientWidth));
      const cv = p.createCanvas(size, size);
      cv.parent(host);
      cv.elt.setAttribute('role', 'img');
      cv.elt.setAttribute('aria-label', 'A picture painted by your days of peace, one dot at a time');
      cv.elt.addEventListener('pointerdown', pick);
      p.frameRate(30);
      p.noStroke();
      if (reduced()) p.noLoop();
    };
    p.draw = () => {
      p.clear();
      const cell = size / COLS, s = state(), t = reduced() ? 0 : p.millis() / 1000;
      for (let i = 0; i < cells.length; i++) {
        const k = cells[i];
        const x = (k.c + 0.5) * cell, y = (k.r + 0.5) * cell;
        let d;
        if (k.order < s.whole) { d = cell * 0.84 * (1 + 0.07 * Math.sin(t * 0.9 + k.ph)); p.fill(k.col); }
        else if (k.order === s.whole) { d = cell * (0.25 + 0.6 * s.frac); p.fill(k.col); }
        else { d = cell * 0.18; p.fill(255, 255, 255, 38); }
        if (shape === 'circle') p.circle(x, y, d); else { p.rectMode(p.CENTER); p.rect(x, y, d, d, d * 0.12); }
      }
      if (selected >= 0) {
        const k = cells[selected];
        p.noFill(); p.stroke(255, 255, 255, 200); p.strokeWeight(2);
        p.circle((k.c + 0.5) * cell, (k.r + 0.5) * cell, cell * (1.3 + (1 - ripple) * 0.9));
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
  function next() {
    let n; do { n = Math.floor(Math.random() * PICTURES.length); } while (n === picIndex && PICTURES.length > 1);
    picIndex = n; build(); legend(); inst?.redraw();
  }
  function toggleShape() { shape = shape === 'circle' ? 'square' : 'circle'; inst?.redraw(); return shape; }
  return { start, stop, next, toggleShape };
}
