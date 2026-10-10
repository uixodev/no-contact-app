/** Sort: pour the colours until every tube holds just one. No timer, no limit on moves, undo any time. */
import { getBest, setBest, reduced } from './store.js';
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
  let level = Math.max(1, getBest('sortLevel', 1)), tubes = [], initial = [], history = [], selected = -1, moves = 0, won = false, busy = false;

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
  function reset() { tubes = initial.map((t) => t.slice()); history = []; selected = -1; moves = 0; won = false; busy = false; $('.s-next').hidden = true; $('.s-note').textContent = 'Tap a tube, then tap where to pour. Same colours stack.'; render(); }
  const done = (t) => t.length === 0 || (t.length === CAP && t.every((c) => c === t[0]));

  function render() {
    boardEl.style.setProperty('--tubes', Math.ceil(tubes.length / 2));
    boardEl.replaceChildren(...tubes.map((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tube' + (i === selected ? ' sel' : '') + (t.length === CAP && done(t) ? ' full' : '');
      b.dataset.i = i;
      b.setAttribute('aria-label', `Tube ${i + 1}: ${t.length ? t.map((c) => COLORS.indexOf(c) + 1).join(', ') + ' (colour numbers, bottom to top)' : 'empty'}${i === selected ? ', selected' : ''}`);
      t.forEach((c) => { const ball = document.createElement('i'); ball.className = 'ball'; ball.style.setProperty('--c', c); ball.dataset.n = COLORS.indexOf(c) + 1; b.append(ball); });
      return b;
    }));
    $('.s-level').textContent = level; $('.s-moves').textContent = moves;
    $('.s-undo').disabled = !history.length || busy;
  }
  /** Lift or put back the top ball without rebuilding anything, so it glides smoothly. */
  function select(i) {
    selected = i;
    boardEl.querySelectorAll('.tube').forEach((t, k) => {
      t.classList.toggle('sel', k === i);
      t.setAttribute('aria-label', t.getAttribute('aria-label').replace(/, selected$/, '') + (k === i ? ', selected' : ''));
    });
  }
  /** How many balls would move if we poured from → to (0 means not allowed). */
  function pourCount(from, to) {
    const src = tubes[from], dst = tubes[to];
    if (from === to || !src.length || dst.length >= CAP) return 0;
    const c = src[src.length - 1];
    if (dst.length && dst[dst.length - 1] !== c) return 0;
    let k = 0;
    while (k < src.length && src[src.length - 1 - k] === c && dst.length + k < CAP) k++;
    return k;
  }
  /** Fly each ball up out of its tube, across, and down into the new one. */
  function fly(from, to, k, olds) {
    const tubeEls = boardEl.querySelectorAll('.tube');
    const srcTop = olds.srcTop, dstTop = tubeEls[to].getBoundingClientRect().top;
    const dur = 520, gap = 110;
    const landing = [...tubeEls[to].children].slice(-k);          // bottom to top
    const anims = olds.rects.map((o, m) => {                       // m = 0 is the top ball of the source
      const el = landing[m];
      const n = el.getBoundingClientRect();
      const dx = o.left - n.left, dy = o.top - n.top;
      const rise = srcTop - 34 - n.top, over = dstTop - 34 - n.top;
      el.style.position = 'relative'; el.style.zIndex = 5;
      const a = el.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${dx}px, ${rise}px)`, offset: 0.24 },
        { transform: `translate(0px, ${over}px)`, offset: 0.68 },
        { transform: 'translate(0px, 0px)' },
      ], { duration: dur, delay: m * gap, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'backwards' });
      a.finished.then(() => { el.style.position = ''; el.style.zIndex = ''; }).catch(() => {});
      return a.finished;
    });
    return Promise.all(anims);
  }
  boardEl.addEventListener('click', async (e) => {
    const tube = e.target.closest('.tube');
    if (!tube || won || busy) return;
    const i = Number(tube.dataset.i);
    if (selected < 0) { if (tubes[i].length) { select(i); navigator.vibrate?.(5); } return; }
    if (selected === i) { select(-1); return; }
    const from = selected, k = pourCount(from, i);
    if (!k) { if (tubes[i].length) select(i); else select(-1); return; }
    const srcEls = [...boardEl.querySelectorAll('.tube')[from].children];
    const olds = { srcTop: boardEl.querySelectorAll('.tube')[from].getBoundingClientRect().top, rects: srcEls.slice(-k).reverse().map((el) => el.getBoundingClientRect()) };
    history.push(tubes.map((t) => t.slice()));
    const c = tubes[from][tubes[from].length - 1];
    for (let n = 0; n < k; n++) { tubes[from].pop(); tubes[i].push(c); }
    moves++; selected = -1; navigator.vibrate?.(8);
    render();
    if (!reduced()) { busy = true; $('.s-undo').disabled = true; await fly(from, i, k, olds).catch(() => {}); busy = false; $('.s-undo').disabled = !history.length; }
    if (tubes.every(done)) {
      won = true; confetti();
      if (level >= getBest('sortLevel', 1)) setBest('sortLevel', level + 1);
      $('.s-note').textContent = `Sorted in ${moves} moves. Calm and clear.`; $('.s-next').hidden = false;
    }
  });
  $('.s-undo').addEventListener('click', () => { if (!history.length || won || busy) return; tubes = history.pop(); moves = Math.max(0, moves - 1); selected = -1; render(); });
  $('.s-restart').addEventListener('click', () => { if (!busy) reset(); });
  $('.s-next').addEventListener('click', () => { level++; generate(); });

  return { start() { generate(); }, stop() {} };
}
