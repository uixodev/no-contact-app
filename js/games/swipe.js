/**
 * Swipe away: figures of him drift in towards the middle of your mind. Swipe across them to knock them off screen
 * before they reach it. Big ones take three knocks, swift ones are quick. Clearing waves earns Breath (slow time) and
 * Clear all. If the fog gets thick you simply start fresh: nothing here can be lost for good.
 */
import { getBest, setBest, reduced } from './store.js';

const TYPES = {
  normal: { r: 27, hp: 1, speed: 1, tint: [150, 140, 175], pts: 10 },
  big: { r: 40, hp: 3, speed: 0.7, tint: [120, 100, 150], pts: 30 },
  swift: { r: 21, hp: 1, speed: 1.9, tint: [110, 150, 200], pts: 20 },
};
const MAX_BREATH = 3, MAX_SWEEP = 2;

export function createSwipe(root) {
  root.innerHTML = `
    <div class="game-bar"><span>Wave <strong class="w-wave">1</strong></span><span>Score <strong class="w-score">0</strong></span><span>Best <strong class="w-best">0</strong></span></div>
    <div class="clarity" role="progressbar" aria-label="Clear mind" aria-valuemin="0" aria-valuemax="100"><i class="w-clarity"></i></div>
    <div class="swp-stage"><canvas class="swp-canvas" role="img" aria-label="Figures drift towards the middle of your mind. Swipe across them to knock them away."></canvas><p class="swp-combo" aria-live="polite"></p></div>
    <p class="balloon-note w-note" aria-live="polite"></p>
    <div class="swp-powers">
      <button type="button" class="btn btn-ghost btn-sm w-breath">Breathe <b>0</b></button>
      <button type="button" class="btn btn-ghost btn-sm w-sweep">Clear all <b>0</b></button>
      <button type="button" class="btn btn-ghost btn-sm w-restart">Start over</button>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const cv = $('.swp-canvas'), g = cv.getContext('2d');
  let W = 320, H = 400, dpr = 1, raf = 0, last = 0, running = false;
  let figs = [], bits = [], trail = [], queue = [];
  let wave = 1, score = 0, clarity = 60, combo = 0, comboAt = 0, flicksTotal = 0, slowUntil = 0, state = 'play', nextSpawn = 0, betweenAt = 0;
  let charges = { breath: 1, sweep: 0 };
  let stars = [];
  let ptr = null;                                   // the finger: { x, y, t }

  const now = () => performance.now();
  const calm = () => (reduced() ? 0.6 : 1);

  function fit() {
    const r = cv.parentElement.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(r.width); H = Math.floor(r.height);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.4, p: Math.random() * 6.28 }));
  }
  const mindR = () => Math.min(W, H) * 0.15;

  // ---------- waves ----------
  function buildWave() {
    const n = Math.min(30, 5 + wave * 2);
    queue = Array.from({ length: n }, () => {
      const roll = Math.random();
      if (wave >= 3 && roll < 0.16) return 'big';
      if (wave >= 2 && roll < 0.38) return 'swift';
      return 'normal';
    });
    nextSpawn = now() + 700;
    state = 'play';
    $('.w-wave').textContent = wave;
    say(wave === 1 ? 'Swipe across the figures to knock them away.' : `Wave ${wave}. Soft eyes.`);
  }
  function spawn(type) {
    const t = TYPES[type], side = Math.floor(Math.random() * 4), pad = t.r + 6;
    const x = side === 0 ? -pad : side === 1 ? W + pad : Math.random() * W, y = side === 2 ? -pad : side === 3 ? H + pad : Math.random() * H;
    const tx = W / 2 + (Math.random() - 0.5) * W * 0.2, ty = H / 2 + (Math.random() - 0.5) * H * 0.2;
    const d = Math.hypot(tx - x, ty - y) || 1, sp = (24 + Math.min(40, wave * 3.2)) * t.speed * calm();
    figs.push({ x, y, vx: ((tx - x) / d) * sp, vy: ((ty - y) / d) * sp, type, hp: t.hp, r: t.r, ph: Math.random() * 6.28, rot: 0, vrot: 0, mode: 'in', hitAt: 0, shake: 0, alpha: 1 });
  }
  function say(t) { $('.w-note').textContent = t; }

  // ---------- hitting ----------
  function award(f, byWave) {
    if (!byWave) {
      combo = now() - comboAt < 1300 ? combo + 1 : 1; comboAt = now();
      if (combo >= 3) { const el = $('.swp-combo'); el.textContent = `${combo}× in a row`; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    }
    score += TYPES[f.type].pts * (byWave ? 1 : Math.max(1, combo));
    flicksTotal++;
    clarity = Math.min(100, clarity + 2);
    if (flicksTotal % 8 === 0 && charges.breath < MAX_BREATH) { charges.breath++; say('You earned a slow breath.'); }
    if (flicksTotal % 15 === 0 && charges.sweep < MAX_SWEEP) { charges.sweep++; say('You earned a clear-all.'); }
    updateHud();
  }
  function launch(f, dx, dy, speed) {
    const len = Math.hypot(dx, dy) || 1;
    f.mode = 'out'; f.vx = (dx / len) * Math.max(520, speed * 900); f.vy = (dy / len) * Math.max(520, speed * 900); f.vrot = (dx >= 0 ? 1 : -1) * (6 + Math.random() * 6);
    burst(f, 12);
  }
  function knock(f, dx, dy, speed) {
    if (now() - f.hitAt < 140) return;
    f.hitAt = now(); navigator.vibrate?.(8);
    f.hp--;
    if (f.hp <= 0) { award(f, false); launch(f, dx, dy, speed); return; }
    f.r *= 0.8; f.shake = 0.3;
    const len = Math.hypot(dx, dy) || 1;
    f.x += (dx / len) * 26; f.y += (dy / len) * 26;                     // pushed back a little
    burst(f, 6);
    say(f.hp === 2 ? 'Big one. Two more.' : 'One more.');
  }
  function burst(f, n) {
    if (reduced()) return;
    for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, sp = 40 + Math.random() * 110; bits.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 1.5 + Math.random() * 3, life: 0.6, max: 0.6 }); }
  }
  function segHit(f, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((f.x - x0) * dx + (f.y - y0) * dy) / l2));
    return Math.hypot(f.x - (x0 + t * dx), f.y - (y0 + t * dy)) <= f.r * 1.15 + 6;
  }
  function move(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = now();
    if (ptr && state === 'play') {
      const dx = x - ptr.x, dy = y - ptr.y, dt = Math.max(8, t - ptr.t), speed = Math.hypot(dx, dy) / dt;     // px per ms
      if (speed > 0.45 && Math.hypot(dx, dy) > 3) for (const f of figs) if (f.mode === 'in' && segHit(f, ptr.x, ptr.y, x, y)) knock(f, dx, dy, speed);
    }
    if (ptr) { trail.push({ x, y, t }); if (trail.length > 10) trail.shift(); }
    ptr = { x, y, t };
  }
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); const r = cv.getBoundingClientRect(); ptr = { x: e.clientX - r.left, y: e.clientY - r.top, t: now() }; trail = [{ ...ptr }]; });
  cv.addEventListener('pointermove', (e) => { if (ptr) move(e); });
  const up = () => { ptr = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);

  // ---------- powers ----------
  function breathe() {
    if (charges.breath < 1 || now() < slowUntil || state !== 'play') return;
    charges.breath--; slowUntil = now() + 5000; say('Breathe in… everything slows down.'); updateHud();
  }
  function sweep() {
    if (charges.sweep < 1 || state !== 'play') return;
    charges.sweep--;
    for (const f of figs) if (f.mode === 'in') { award(f, true); launch(f, f.x - W / 2, f.y - H / 2, 1.2); }
    queue = queue.slice(Math.ceil(queue.length / 2));          // and half of what is still coming fades too
    say('Everything clears.'); navigator.vibrate?.([12, 30, 12]); updateHud();
  }
  $('.w-breath').addEventListener('click', breathe);
  $('.w-sweep').addEventListener('click', sweep);
  $('.w-restart').addEventListener('click', reset);

  function updateHud() {
    $('.w-score').textContent = score.toLocaleString('en-GB');
    $('.w-best').textContent = Math.max(getBest('swipeScore', 0), score).toLocaleString('en-GB');
    $('.w-clarity').style.width = `${Math.max(0, clarity)}%`;
    $('.clarity').setAttribute('aria-valuenow', Math.round(clarity));
    $('.w-breath b').textContent = charges.breath; $('.w-sweep b').textContent = charges.sweep;
    $('.w-breath').disabled = charges.breath < 1 || now() < slowUntil; $('.w-sweep').disabled = charges.sweep < 1;
  }
  function reset() {
    figs = []; bits = []; queue = []; wave = 1; score = 0; clarity = 60; combo = 0; flicksTotal = 0; slowUntil = 0; charges = { breath: 1, sweep: 0 };
    $('.w-restart').hidden = false; buildWave(); updateHud();
  }
  function save() {
    if (score > getBest('swipeScore', 0)) setBest('swipeScore', score);
    if (wave > getBest('swipeWave', 0)) setBest('swipeWave', wave);
  }

  // ---------- drawing ----------
  function drawFig(f, t) {
    const c = TYPES[f.type].tint;
    g.save(); g.translate(f.x + (f.shake > 0 ? Math.sin(t * 60) * 4 * f.shake * 3 : 0), f.y); g.rotate(f.rot); g.globalAlpha = f.alpha;
    const r = f.r, grd = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    grd.addColorStop(0, `rgb(${c[0] + 60},${c[1] + 60},${c[2] + 60})`); grd.addColorStop(1, `rgb(${c[0] - 40},${c[1] - 40},${c[2] - 30})`);
    g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fillStyle = grd; g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.clip();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.arc(0, -r * 0.2, r * 0.32, 0, 6.283); g.fill();
    g.beginPath(); g.ellipse(0, r * 0.95, r * 0.78, r * 0.62, 0, Math.PI, 0); g.fill();
    g.restore();
    if (f.hp > 1) { g.fillStyle = '#fff'; g.font = `900 ${Math.round(r * 0.5)}px Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(f.hp), 0, r * 0.72); }
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.stroke();
    g.restore();
  }
  function draw(t) {
    g.clearRect(0, 0, W, H);
    const cl = Math.max(0, Math.min(100, clarity)) / 100, cx = W / 2, cy = H / 2, R = mindR();
    // dawn: the lighter your mind, the warmer the glow
    const dawn = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    dawn.addColorStop(0, `rgba(255,236,190,${0.12 + cl * 0.5})`); dawn.addColorStop(0.5, `rgba(255,200,160,${cl * 0.22})`); dawn.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = dawn; g.fillRect(0, 0, W, H);
    for (const s of stars) { g.globalAlpha = (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.4 + s.p))) * (1 - cl * 0.7); g.fillStyle = '#fff'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill(); }
    g.globalAlpha = 1;
    // the middle of your mind
    const pulse = 1 + 0.06 * Math.sin(t * 1.6);
    const orb = g.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4 * pulse);
    orb.addColorStop(0, `rgba(255,248,220,${0.55 + cl * 0.4})`); orb.addColorStop(0.35, `rgba(255,214,150,${0.2 + cl * 0.3})`); orb.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = orb; g.beginPath(); g.arc(cx, cy, R * 2.4 * pulse, 0, 6.283); g.fill();
    g.lineWidth = 2; g.strokeStyle = `rgba(255,255,255,${0.35 + cl * 0.4})`; g.beginPath(); g.arc(cx, cy, R * pulse, 0, 6.283); g.stroke();
    if (now() < slowUntil) { g.strokeStyle = 'rgba(160,220,255,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R * (1.4 + 0.15 * Math.sin(t * 3)), 0, 6.283); g.stroke(); }
    for (const f of figs) drawFig(f, t);
    for (const p of bits) { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fill(); }
    g.globalAlpha = 1;
    // the swipe trail
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) { const a = trail[i - 1], b = trail[i], age = (now() - b.t) / 260; if (age > 1) continue; g.strokeStyle = `rgba(255,255,255,${(1 - age) * 0.85})`; g.lineWidth = 7 * (1 - age) + 1; g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    }
    if (state === 'over') { g.fillStyle = 'rgba(30,25,50,.45)'; g.fillRect(0, 0, W, H); }
  }
  function frame(tms) {
    if (!running) return;
    const dt = Math.min(0.05, (tms - last) / 1000 || 0.016); last = tms;
    const t = tms / 1000, slow = now() < slowUntil ? 0.3 : 1, cd = dt * slow;
    if (state === 'play') {
      if (queue.length && now() >= nextSpawn) { spawn(queue.shift()); nextSpawn = now() + Math.max(450, 1500 - wave * 70) / slow; }
      const R = mindR();
      for (const f of figs) {
        if (f.mode === 'in') {
          f.ph += cd; f.x += (f.vx + Math.sin(f.ph * 1.6) * 8) * cd; f.y += (f.vy + Math.cos(f.ph * 1.3) * 8) * cd; f.shake = Math.max(0, f.shake - dt);
          if (Math.hypot(f.x - W / 2, f.y - H / 2) < R) { f.mode = 'gone'; clarity -= 9 + (f.type === 'big' ? 6 : 0); burst(f, 10); navigator.vibrate?.(20); say('One slipped into your mind. Breathe, and keep going.'); updateHud(); }
        } else if (f.mode === 'out') { f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vrot * dt; f.alpha = Math.max(0, f.alpha - dt * 0.6); }
        else if (f.mode === 'gone') f.alpha -= dt * 3;
      }
      figs = figs.filter((f) => !(f.mode === 'out' && (f.x < -80 || f.x > W + 80 || f.y < -80 || f.y > H + 80)) && f.alpha > 0.02);
      if (combo && now() - comboAt > 1500) { combo = 0; $('.swp-combo').textContent = ''; }
      if (clarity <= 0) { state = 'over'; save(); say(`The fog is thick. You cleared ${flicksTotal} figures. Take a breath, then start fresh.`); updateHud(); }
      else if (!queue.length && !figs.some((f) => f.mode === 'in')) {
        state = 'between'; betweenAt = now(); clarity = Math.min(100, clarity + 10); save();
        say(`Wave ${wave} cleared. Slow breath…`); updateHud();
      }
    } else if (state === 'between') {
      for (const f of figs) if (f.mode === 'out') { f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vrot * dt; f.alpha -= dt * 0.6; }
      figs = figs.filter((f) => f.alpha > 0.02);
      if (now() - betweenAt > 1700) { wave++; buildWave(); }
    }
    for (const p of bits) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; }
    bits = bits.filter((p) => p.life > 0);
    if (flickHud++ % 10 === 0) updateHud();
    draw(t);
    raf = requestAnimationFrame(frame);
  }
  let flickHud = 0;
  root.swipeState = () => ({ figs, wave, score, clarity, state, queue: queue.length, W, H, charges, combo }); // lets tests find the figures
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (running) fit(); }) : null;

  return {
    start() { running = true; fit(); reset(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); ro?.observe(cv.parentElement); },
    stop() { running = false; cancelAnimationFrame(raf); ro?.disconnect(); if (score) save(); },
  };
}
