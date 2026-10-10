/** Echo: watch the orbs light up in a soft pattern, then repeat it. Calm tones, glowing orbs, and it asks for real focus. */
import { getBest, setBest, reduced } from './store.js';

const ORBS = [
  { name: 'green', color: '#58cc02', freq: 261.63 }, { name: 'blue', color: '#1cb0f6', freq: 329.63 },
  { name: 'yellow', color: '#ffc800', freq: 392.0 }, { name: 'purple', color: '#ce82ff', freq: 523.25 },
];
const SOUND_KEY = 'nc-echo-sound';

export function createEcho(root) {
  root.innerHTML = `
    <div class="game-bar"><span>Round <strong class="e-round">0</strong></span><span>Best <strong class="e-best">0</strong></span></div>
    <div class="echo-board" role="group" aria-label="Four glowing orbs">${ORBS.map((o, i) => `<button type="button" class="echo-orb" data-i="${i}" aria-label="${o.name} orb" style="--c:${o.color}"><i></i></button>`).join('')}</div>
    <p class="balloon-note e-note" aria-live="polite"></p>
    <div class="game-actions"><button type="button" class="btn btn-primary btn-sm e-start">Start</button><button type="button" class="btn btn-ghost btn-sm e-sound" aria-pressed="true">🔊 Sound on</button></div>`;
  const $ = (s) => root.querySelector(s);
  const orbs = [...root.querySelectorAll('.echo-orb')];
  let seq = [], pos = 0, playing = false, accepting = false, token = 0, ctx = null;
  let sound = true;
  try { sound = localStorage.getItem(SOUND_KEY) !== 'off'; } catch { /* default on */ }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function tone(i, ms = 400) {
    if (!sound) return;
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = ORBS[i].freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + ms / 1000 + 0.05);
    } catch { /* no audio available */ }
  }
  async function glow(i, ms) {
    orbs[i].classList.add('lit'); tone(i, ms);
    await sleep(ms);
    orbs[i].classList.remove('lit');
  }
  function setSoundLabel() { const b = $('.e-sound'); b.setAttribute('aria-pressed', sound); b.textContent = sound ? '🔊 Sound on' : '🔇 Sound off'; }
  function stats() { $('.e-round').textContent = Math.max(0, seq.length - (playing ? 0 : 1)); $('.e-best').textContent = getBest('echo'); }

  async function playback(my) {
    accepting = false; $('.e-note').textContent = 'Watch…';
    await sleep(500);
    const step = Math.max(300, 620 - seq.length * 22);
    for (const i of seq) { if (my !== token) return; await glow(i, step); await sleep(160); }
    if (my !== token) return;
    accepting = true; pos = 0; $('.e-note').textContent = 'Your turn. Repeat it.';
  }
  async function nextRound() {
    const my = ++token;
    seq.push(Math.floor(Math.random() * ORBS.length));
    stats();
    await playback(my);
  }
  async function lose() {
    accepting = false; playing = false;
    const score = seq.length - 1;
    if (score > getBest('echo')) setBest('echo', score);
    $('.e-note').textContent = score > 0 ? `So close. You held ${score} in your mind. Breathe, then go again.` : 'No worries. Breathe and try again.';
    root.querySelector('.echo-board').classList.add('shake'); await sleep(450); root.querySelector('.echo-board').classList.remove('shake');
    $('.e-start').hidden = false; $('.e-start').textContent = 'Try again'; stats();
  }
  function start() { seq = []; playing = true; $('.e-start').hidden = true; nextRound(); }

  root.querySelector('.echo-board').addEventListener('pointerdown', async (e) => {
    const b = e.target.closest('.echo-orb');
    if (!b || !accepting) return;
    const i = Number(b.dataset.i);
    glow(i, 260);
    if (i !== seq[pos]) { await lose(); return; }
    pos++;
    if (pos === seq.length) { accepting = false; $('.e-note').textContent = 'Lovely.'; stats(); await sleep(650); if (playing) nextRound(); }
  });
  $('.e-start').addEventListener('click', start);
  $('.e-sound').addEventListener('click', () => { sound = !sound; try { localStorage.setItem(SOUND_KEY, sound ? 'on' : 'off'); } catch { /* ignore */ } setSoundLabel(); if (sound) tone(1, 250); });

  return {
    start() { token++; seq = []; playing = false; accepting = false; $('.e-start').hidden = false; $('.e-start').textContent = 'Start'; $('.e-note').textContent = 'Watch the pattern, then repeat it. It grows by one each round.'; setSoundLabel(); stats(); $('.e-round').textContent = 0; },
    stop() { token++; accepting = false; playing = false; orbs.forEach((o) => o.classList.remove('lit')); },
  };
}
