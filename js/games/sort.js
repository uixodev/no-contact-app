/** Sort: pour the colours until every tube holds just one. No timer, no limit on moves, undo any time. */
import { getBest, setBest } from './store.js';
import { confetti } from '../fx.js';

const COLORS = ['#ff6b6b', '#ffc800', '#58cc02', '#1cb0f6', '#ce82ff', '#ff9600', '#2ec4b6', '#ff86d0', '#8d7bff'];
const CAP = 4;

export function createSort(root) {
  root.innerHTML = `
    <div class="game-bar"><span>Level <strong class="s-level">1</strong></span><span>Moves <strong class="s-moves">0</strong></span></div>
    <div class="sort-board" role="group" aria-label="Tubes"></div>
    <p class="balloon-note s-note" aria-live="polite"></p>
    <div class="game-actions"><button type="button" class="btn btn-ghost btn-sm s-undo">↶ Undo</button><button type="button" class="btn btn-ghost btn-sm s-restart">Restart</button><button type="button" class="btn btn-primary btn-sm s-next" hidden>Next level →</button></div>`;
  const $ = (s) => root.querySelector(s);
  const boardEl = $('.sort-board');
  let level = Math.max(1, getBest('sortLevel', 1)), tubes = [], initial = [], history = [], selected = -1, moves = 0, won = false, lastMoved = new Set();

  function generate() {
    const n = Math.min(COLORS.length, 3 + level);        // colours: 4 at level 1 … 9 at level 6+
    let balls;
    do {
      balls = COLORS.slice(0, n).flatMap((c) => Array(CAP).fill(c)).sort(() => Math.random() - 0.5);
      tubes = Array.from({ length: n + 2 }, (_, i) => (i < n ? balls.slice(i * CAP, (i + 1) * CAP) : []));
    } while (tubes.some((t) => t.length === CAP && t.every((c) => c === t[0])));   // never start with a finished tube
    initial = tubes.map((t) => t.slice());
    reset();
  }
  function reset() { tubes = initial.map((t) => t.slice()); history = []; selected = -1; moves = 0; won = false; lastMoved = new Set(); $('.s-next').hidden = true; $('.s-note').textContent = 'Tap a tube, then tap where to pour. Same colours stack.'; render(); }
  const done = (t) => t.length === 0 || (t.length === CAP && t.every((c) => c === t[0]));

  function render() {
    boardEl.style.setProperty('--tubes', Math.ceil(tubes.length / 2));
    boardEl.replaceChildren(...tubes.map((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tube' + (i === selected ? ' sel' : '') + (t.length === CAP && done(t) ? ' full' : '');
      b.dataset.i = i;
      b.setAttribute('aria-label', `Tube ${i + 1}: ${t.length ? t.map((c) => COLORS.indexOf(c) + 1).join(', ') + ' (colour numbers, bottom to top)' : 'empty'}${i === selected ? ', selected' : ''}`);
      t.forEach((c, k) => { const ball = document.createElement('i'); ball.className = 'ball' + (i === selected && k === t.length - 1 ? ' lift' : '') + (lastMoved.has(`${i}:${k}`) ? ' drop' : ''); ball.style.setProperty('--c', c); ball.dataset.n = COLORS.indexOf(c) + 1; b.append(ball); });
      return b;
    }));
    $('.s-level').textContent = level; $('.s-moves').textContent = moves;
    $('.s-undo').disabled = !history.length;
  }
  function pour(from, to) {
    const src = tubes[from], dst = tubes[to];
    if (!src.length || from === to) return false;
    const c = src[src.length - 1];
    if (dst.length && dst[dst.length - 1] !== c) return false;
    if (dst.length >= CAP) return false;
    history.push(tubes.map((t) => t.slice()));
    lastMoved = new Set();
    while (src.length && src[src.length - 1] === c && dst.length < CAP) { dst.push(src.pop()); lastMoved.add(`${to}:${dst.length - 1}`); }
    moves++;
    return true;
  }
  boardEl.addEventListener('click', (e) => {
    const tube = e.target.closest('.tube');
    if (!tube || won) return;
    const i = Number(tube.dataset.i);
    if (selected < 0) { if (tubes[i].length) { selected = i; navigator.vibrate?.(5); } }
    else if (selected === i) selected = -1;
    else { const ok = pour(selected, i); if (ok) navigator.vibrate?.(8); selected = ok ? -1 : (tubes[i].length ? i : -1); }
    render();
    if (tubes.every(done)) {
      won = true; confetti();
      if (level >= getBest('sortLevel', 1)) setBest('sortLevel', level + 1);
      $('.s-note').textContent = `Sorted in ${moves} moves. Calm and clear.`; $('.s-next').hidden = false;
    }
  });
  $('.s-undo').addEventListener('click', () => { if (!history.length || won) return; tubes = history.pop(); moves = Math.max(0, moves - 1); selected = -1; lastMoved = new Set(); render(); });
  $('.s-restart').addEventListener('click', reset);
  $('.s-next').addEventListener('click', () => { level++; generate(); });

  return { start() { generate(); }, stop() {} };
}
