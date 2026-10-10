/** Count & pop: numbered bubbles drift like a lullaby. Pop them in order, 1, 2, 3… Calm to watch, and it keeps your eyes busy. */
import { getBest, setBest, reduced } from './store.js';

const PALETTE = ['#58cc02', '#1cb0f6', '#ffc800', '#ff9600', '#ce82ff', '#ff86d0', '#2ec4b6'];

export function createBubbles(root) {
  root.innerHTML = `
    <div class="game-bar"><span>Wave <strong class="b-wave">1</strong></span><span>Pop <strong class="b-next">1</strong></span><span>Best <strong class="b-best">1</strong></span></div>
    <div class="bub-stage"><canvas class="bub-canvas" aria-label="Numbered bubbles. Pop them in order from one." role="img"></canvas></div>
    <p class="balloon-note b-note" aria-live="polite"></p>
    <div class="game-actions"><button type="button" class="btn btn-ghost btn-sm b-restart">Start over</button></div>`;
  const $ = (s) => root.querySelector(s);
  const cv = $('.bub-canvas'), g = cv.getContext('2d');
  let W = 300, H = 380, dpr = 1, bubbles = [], bits = [], wave = 1, next = 1, raf = 0, last = 0, running = false, msg = '';

  function fit() {
    const r = cv.parentElement.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(r.width); H = Math.floor(r.height);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn() {
    const n = Math.min(20, 4 + wave * 2);
    const radius = Math.max(24, Math.min(32, Math.sqrt((W * H) / (n * 14))));
    bubbles = Array.from({ length: n }, (_, i) => ({
      n: i + 1, r: radius, x: radius + Math.random() * (W - radius * 2), y: radius + Math.random() * (H - radius * 2),
      vx: (Math.random() - 0.5) * 22, vy: (Math.random() - 0.5) * 22, ph: Math.random() * 6.28, col: PALETTE[i % PALETTE.length], shake: 0, pop: 0, gone: false,
    }));
    next = 1; bits = [];
    $('.b-wave').textContent = wave; $('.b-next').textContent = 1; $('.b-best').textContent = getBest('bubbles', 1);
    $('.b-note').textContent = wave === 1 ? 'Pop the bubbles in order: 1, 2, 3…' : `Wave ${wave}. Eyes soft, one at a time.`;
  }
  const speed = () => (reduced() ? 0.35 : 1);

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    g.clearRect(0, 0, W, H);
    for (const b of bubbles) {
      if (b.gone) continue;
      b.ph += dt;
      b.x += (b.vx + Math.sin(b.ph * 0.7) * 6) * dt * speed(); b.y += (b.vy + Math.cos(b.ph * 0.5) * 6) * dt * speed();
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); } if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); } if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
      const sh = b.shake > 0 ? Math.sin(b.shake * 60) * 4 * b.shake * 4 : 0; b.shake = Math.max(0, b.shake - dt);
      const target = b.n === next, s = 1 + (target ? 0.05 * Math.sin(b.ph * 4) : 0);
      const x = b.x + sh, y = b.y, r = b.r * s;
      const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,.85)'); grd.addColorStop(0.35, b.col + 'cc'); grd.addColorStop(1, b.col + '66');
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fillStyle = grd; g.fill();
      g.lineWidth = target ? 3 : 1.5; g.strokeStyle = target ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.55)'; g.stroke();
      g.fillStyle = '#fff'; g.font = `900 ${Math.round(r * 0.85)}px Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 4; g.fillText(b.n, x, y + 1); g.shadowBlur = 0;
    }
    for (const p of bits) {
      p.life -= dt; if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt;
      g.globalAlpha = Math.max(0, p.life / p.max); g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fillStyle = p.col; g.fill(); g.globalAlpha = 1;
    }
    bits = bits.filter((p) => p.life > 0);
    raf = requestAnimationFrame(frame);
  }

  function burst(b) {
    if (reduced()) return;
    for (let k = 0; k < 14; k++) { const a = (k / 14) * 6.283, sp = 40 + Math.random() * 50; bits.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 2 + Math.random() * 3, col: b.col, life: 0.7, max: 0.7 }); }
  }
  cv.addEventListener('pointerdown', (e) => {
    const rect = cv.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = [...bubbles].reverse().find((b) => !b.gone && Math.hypot(b.x - x, b.y - y) <= b.r + 10);
    if (!hit) return;
    if (hit.n !== next) { hit.shake = 0.4; navigator.vibrate?.([5, 30, 5]); $('.b-note').textContent = `Look for ${next}.`; return; }
    hit.gone = true; burst(hit); navigator.vibrate?.(8); next++;
    $('.b-next').textContent = next;
    if (next > bubbles.length) {
      if (wave >= getBest('bubbles', 1)) setBest('bubbles', wave + 1);
      $('.b-note').textContent = 'Wave complete. Slow breath…';
      setTimeout(() => { if (running) { wave++; spawn(); } }, 1100);
    } else $('.b-note').textContent = next === 2 ? 'Nice. Keep going.' : '';
  });
  $('.b-restart').addEventListener('click', () => { wave = 1; spawn(); });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (running) { const ow = W, oh = H; fit(); bubbles.forEach((b) => { b.x = Math.min(b.x * W / ow, W - b.r); b.y = Math.min(b.y * H / oh, H - b.r); }); } }) : null;

  root.bubbleState = () => ({ bubbles, next, W, H }); // lets tests find the bubbles on the canvas

  return {
    start() { running = true; fit(); wave = 1; spawn(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); ro?.observe(cv.parentElement); },
    stop() { running = false; cancelAnimationFrame(raf); ro?.disconnect(); },
  };
}
