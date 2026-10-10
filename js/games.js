/** games.js — calm little games to occupy your hands and mind while an urge passes: Memory match, Merge, Echo, Sort and Count & pop. */
import { getBest, setBest, reduced } from './games/store.js';
import { createEcho } from './games/echo.js';
import { createSort } from './games/sort.js';
import { createBubbles } from './games/bubbles.js';

const $ = (s, r = document) => r.querySelector(s);

// ---------- Merge: the pure rules, exported so they can be tested ----------
/** Slide one row to the left, merging equal neighbours once. Returns the new row and the points scored. */
export function slideRow(row) {
  const tiles = row.filter(Boolean);
  const out = [];
  let score = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) { out.push(tiles[i] * 2); score += tiles[i] * 2; i++; } else out.push(tiles[i]);
  }
  while (out.length < row.length) out.push(0);
  return { row: out, score };
}
export function move(board, dir) {
  const n = board.length;
  let moved = false, score = 0;
  const get = (i, j) => (dir === 'left' ? board[i][j] : dir === 'right' ? board[i][n - 1 - j] : dir === 'up' ? board[j][i] : board[n - 1 - j][i]);
  const next = board.map((r) => r.slice());
  for (let i = 0; i < n; i++) {
    const line = Array.from({ length: n }, (_, j) => get(i, j));
    const res = slideRow(line);
    score += res.score;
    res.row.forEach((val, j) => {
      const [r, c] = dir === 'left' ? [i, j] : dir === 'right' ? [i, n - 1 - j] : dir === 'up' ? [j, i] : [n - 1 - j, i];
      if (next[r][c] !== val) moved = true;
      next[r][c] = val;
    });
  }
  return { board: next, moved, score };
}
export const canMove = (board) => ['left', 'right', 'up', 'down'].some((d) => move(board, d).moved);

// ---------- Memory ----------
const FACES = ['🌸', '🌙', '⭐', '🍀', '🦋', '🐢', '🌊', '🍓', '🐳', '🌻', '🍄', '🪐', '🦊', '🍉', '🌈'];
const LEVELS = [[3, 4], [4, 4], [4, 5], [5, 6]]; // columns × rows, always an even number of cards

export function createGames() {
  const dlg = $('#gameDialog');
  const views = { menu: $('#gameMenu'), memory: $('#gameMemory'), merge: $('#gameMerge'), echo: $('#gameEcho'), sort: $('#gameSort'), bubbles: $('#gameBubbles') };
  const TITLES = { menu: 'Distract me', memory: 'Memory match', merge: 'Merge', echo: 'Echo', sort: 'Sort', bubbles: 'Count & pop' };
  const extra = { echo: createEcho(views.echo), sort: createSort(views.sort), bubbles: createBubbles(views.bubbles) };
  let opener = null;
  let current = 'menu';

  /** "Best" lines on the menu cards, shown only once there is something to show. */
  function refreshBests() {
    const memBest = [0, 1, 2, 3].map((l) => getBest(`memory${l}`, 0)).find(Boolean);
    const lines = {
      memory: memBest ? `Best: ${memBest} moves (level 1)` : '', merge: getBest('merge') ? `Best: ${getBest('merge').toLocaleString('en-GB')}` : '',
      bubbles: getBest('bubbles', 1) > 1 ? `Reached wave ${getBest('bubbles', 1)}` : '', sort: getBest('sortLevel', 1) > 1 ? `Reached level ${getBest('sortLevel', 1)}` : '',
      echo: getBest('echo') ? `Best: ${getBest('echo')} in a row` : '',
    };
    dlg.querySelectorAll('[data-best]').forEach((el) => { el.textContent = lines[el.dataset.best] || ''; el.hidden = !lines[el.dataset.best]; });
  }

  function show(name) {
    if (name === 'menu') refreshBests();
    current = name;
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    $('#gameBack').hidden = name === 'menu';
    $('#gameTitle').textContent = TITLES[name];
    for (const [k, m] of Object.entries(extra)) if (k !== name) m.stop();
    if (name === 'memory') startMemory(memLevel);
    if (name === 'merge' && !mergeBoard) newMerge();
    if (extra[name]) extra[name].start();
    $('#gameTitle').focus?.({ preventScroll: true });
  }

  // ----- Memory -----
  let memLevel = 0, memFirst = null, memLock = false, memMoves = 0, memLeft = 0;
  function startMemory(level) {
    memLevel = level; memFirst = null; memLock = false; memMoves = 0;
    const [cols, rows] = LEVELS[level];
    const pairs = (cols * rows) / 2;
    memLeft = pairs;
    const faces = [...FACES].sort(() => Math.random() - 0.5).slice(0, pairs);
    const deck = [...faces, ...faces].sort(() => Math.random() - 0.5);
    const board = $('#memBoard');
    board.style.setProperty('--cols', cols);
    board.replaceChildren(...deck.map((f, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mem-card'; b.dataset.face = f; b.dataset.i = i;
      b.setAttribute('aria-label', `Card ${i + 1}, face down`);
      b.innerHTML = `<span class="mem-inner"><span class="mem-back" aria-hidden="true"></span><span class="mem-front" aria-hidden="true"><b class="mem-emoji">${f}</b></span></span>`;
      return b;
    }));
    $('#memLevel').textContent = `Level ${level + 1}`;
    $('#memNote').textContent = 'Find the pairs. There is no timer.';
    $('#memNext').hidden = true;
    updateMemStats();
  }
  function updateMemStats() {
    const b = getBest(`memory${memLevel}`, 0);
    $('#memMoves').textContent = `${memMoves} ${memMoves === 1 ? 'move' : 'moves'}${b ? ` · best ${b}` : ''}`;
  }
  function flip(card, up) {
    card.classList.toggle('up', up);
    card.setAttribute('aria-label', up ? `Card ${Number(card.dataset.i) + 1}, ${card.dataset.face}` : `Card ${Number(card.dataset.i) + 1}, face down`);
  }
  $('#memBoard').addEventListener('click', (e) => {
    const card = e.target.closest('.mem-card');
    if (!card || memLock || card.classList.contains('up') || card.classList.contains('matched')) return;
    flip(card, true);
    navigator.vibrate?.(6);
    if (!memFirst) { memFirst = card; return; }
    memMoves++; updateMemStats();
    const a = memFirst; memFirst = null;
    if (a.dataset.face === card.dataset.face) {
      a.classList.add('matched'); card.classList.add('matched'); memLeft--;
      if (memLeft === 0) {
        const prev = getBest(`memory${memLevel}`, 0);
        if (!prev || memMoves < prev) setBest(`memory${memLevel}`, memMoves);
        updateMemStats();
        $('#memNote').textContent = memMoves <= LEVELS[memLevel][0] * LEVELS[memLevel][1] / 2 + 3 ? 'Beautiful. That was a clear mind.' : 'Well done. Slow and steady.';
        $('#memNext').hidden = false;
        $('#memNext').textContent = memLevel + 1 < LEVELS.length ? 'Next level →' : 'Play again';
      }
    } else {
      memLock = true;
      setTimeout(() => { flip(a, false); flip(card, false); memLock = false; }, reduced() ? 500 : 750);
    }
  });
  $('#memNext').addEventListener('click', () => startMemory(memLevel + 1 < LEVELS.length ? memLevel + 1 : 0));
  $('#memRestart').addEventListener('click', () => startMemory(memLevel));

  // ----- Merge -----
  let mergeBoard = null, mergeScore = 0, mergeOver = false, lastNew = -1, lastMerged = new Set();
  const N = 4;
  function addTile(b) {
    const empty = [];
    b.forEach((r, i) => r.forEach((v, j) => { if (!v) empty.push([i, j]); }));
    if (!empty.length) return -1;
    const [i, j] = empty[Math.floor(Math.random() * empty.length)];
    b[i][j] = Math.random() < 0.9 ? 2 : 4;
    return i * N + j;
  }
  function newMerge() {
    mergeBoard = Array.from({ length: N }, () => Array(N).fill(0));
    mergeScore = 0; mergeOver = false; lastMerged = new Set();
    addTile(mergeBoard); lastNew = addTile(mergeBoard);
    renderMerge();
  }
  function renderMerge() {
    const board = $('#mergeBoard');
    if (!board.children.length) for (let i = 0; i < N * N; i++) { const c = document.createElement('div'); c.className = 'tile'; board.append(c); }
    mergeBoard.flat().forEach((v, i) => {
      const t = board.children[i];
      t.textContent = v || '';
      t.dataset.v = v || '';
      t.classList.toggle('new', i === lastNew);
      t.classList.toggle('merged', lastMerged.has(i));
    });
    board.setAttribute('aria-label', `Merge board. ${mergeBoard.map((r) => r.map((v) => v || 'empty').join(', ')).join('. Next row: ')}`);
    $('#mergeScore').textContent = mergeScore.toLocaleString('en-GB');
    if (mergeScore > getBest('merge')) setBest('merge', mergeScore);
    $('#mergeBest').textContent = getBest('merge').toLocaleString('en-GB');
    $('#mergeNote').textContent = mergeOver ? 'No more moves. That was a good one. Start again whenever you like.' : 'Swipe to slide the tiles. Equal numbers merge.';
  }
  function doMove(dir) {
    if (mergeOver) return;
    const r = move(mergeBoard, dir);
    if (!r.moved) return;
    // remember which cells now hold a merged tile
    lastMerged = new Set();
    r.board.flat().forEach((v, i) => { if (v && v !== mergeBoard.flat()[i] && v > 2) lastMerged.add(i); });
    mergeBoard = r.board; mergeScore += r.score;
    lastNew = addTile(mergeBoard);
    if (!canMove(mergeBoard)) mergeOver = true;
    navigator.vibrate?.(r.score ? 10 : 4);
    renderMerge();
  }
  const board = $('#mergeBoard');
  let sx = 0, sy = 0, tracking = false;
  board.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; tracking = true; board.setPointerCapture?.(e.pointerId); });
  board.addEventListener('pointerup', (e) => {
    if (!tracking) return; tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  board.addEventListener('pointercancel', () => { tracking = false; });
  dlg.addEventListener('keydown', (e) => {
    if (current !== 'merge') return;
    const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (d) { e.preventDefault(); doMove(d); }
  });
  dlg.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => doMove(b.dataset.move)));
  $('#mergeNew').addEventListener('click', newMerge);

  // ----- shell -----
  $('#gamePickMemory').addEventListener('click', () => show('memory'));
  $('#gamePickMerge').addEventListener('click', () => show('merge'));
  dlg.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => show(b.dataset.pick)));
  $('#gameBack').addEventListener('click', () => show('menu'));
  $('#gameClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { Object.values(extra).forEach((m) => m.stop()); opener?.focus?.(); });
  function open(game) {
    opener = document.activeElement;
    show(game || 'menu');
    if (!dlg.open) dlg.showModal();
  }
  return { open };
}
