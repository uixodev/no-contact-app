/** days.js — "Your days": tap the orb to pop a balloon for every day, or watch the seconds of the current minute fill in. */
import { confetti } from './fx.js';

const COLORS = ['#58CC02', '#1CB0F6', '#FFC800', '#FF9600', '#CE82FF', '#FF86D0', '#2B70C9'];
const NOTES = [
  'You chose yourself.', 'One more day that belongs to you.', 'That urge passed, and you stayed.',
  'Quiet, and yours.', 'You didn’t have to. You did.', 'Proud of this one.',
  'Still here. Still going.', 'This day was hard-won and it counts.',
];
const MAX_BALLOONS = 90;
const fmtDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);

export function createDays(getInfo) {
  const dlg = $('#daysDialog');
  const field = $('#balloonField');
  const status = $('#balloonStatus');
  const note = $('#balloonNote');
  const grid = $('#secGrid');
  let popped = new Set();
  let builtFor = '';
  let timer = null;
  let opener = null;

  const groupSize = (days) => Math.max(1, Math.ceil(days / MAX_BALLOONS));
  const count = (days) => Math.max(1, Math.ceil(days / groupSize(days)));

  function labelFor(i, days, anchorTs) {
    const g = groupSize(days);
    const first = i * g + 1;
    const last = Math.min(days, first + g - 1);
    if (days === 0) return { title: 'Today', sub: 'Your first day is still in the making. Every second of it counts.' };
    const when = fmtDate.format(new Date(anchorTs + (first - 1) * 864e5));
    return { title: first === last ? `Day ${first}` : `Days ${first}–${last}`, sub: when };
  }

  function buildBalloons(force) {
    const { days, anchorTs } = getInfo();
    const key = `${days}|${anchorTs}`;
    if (!force && key === builtFor) return;
    if (key !== builtFor) popped = new Set();
    builtFor = key;
    field.replaceChildren();
    const n = count(days);
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'balloon';
      b.dataset.i = i;
      const l = labelFor(i, days, anchorTs);
      b.setAttribute('aria-label', `Pop the balloon for ${l.title}`);
      b.style.setProperty('--c', COLORS[i % COLORS.length]);
      b.style.setProperty('--d', `${(-(i * 0.7) % 5).toFixed(2)}s`);
      b.style.setProperty('--dur', `${(4 + (i % 4) * 0.6).toFixed(1)}s`);
      b.innerHTML = '<i class="b-body"></i><i class="b-knot"></i><i class="b-string"></i>';
      if (popped.has(i)) b.classList.add('gone');
      field.append(b);
    }
    updateStatus();
  }

  function updateStatus(msg) {
    const { days } = getInfo();
    const n = count(days);
    const left = n - popped.size;
    status.textContent = left === 0
      ? `All ${days || 1} ${days === 1 ? 'day' : 'days'} popped`
      : `${popped.size} of ${n} popped`;
    $('#balloonReset').hidden = popped.size === 0;
    if (msg !== undefined) note.textContent = msg;
    else if (popped.size === 0) note.textContent = days === 0 ? 'Pop today’s balloon. Each one is a day you kept for yourself.' : 'Pop a balloon. Each one is a day you kept for yourself.';
  }

  function burst(el) {
    if (reduced()) return;
    const r = el.getBoundingClientRect();
    const host = field.getBoundingClientRect();
    const color = getComputedStyle(el).getPropertyValue('--c');
    for (let k = 0; k < 10; k++) {
      const p = document.createElement('i');
      p.className = 'shard';
      const a = (k / 10) * Math.PI * 2;
      p.style.cssText = `left:${r.left - host.left + r.width / 2 + field.scrollLeft}px;top:${r.top - host.top + r.height * 0.4 + field.scrollTop}px;background:${color};--x:${Math.round(Math.cos(a) * 46)}px;--y:${Math.round(Math.sin(a) * 46)}px`;
      field.append(p);
      setTimeout(() => p.remove(), 700);
    }
  }

  function pop(el) {
    const i = Number(el.dataset.i);
    if (popped.has(i)) return;
    popped.add(i);
    const { days, anchorTs } = getInfo();
    burst(el);
    navigator.vibrate?.(14);
    el.classList.add('popping');
    setTimeout(() => el.classList.add('gone'), reduced() ? 0 : 180);
    const l = labelFor(i, days, anchorTs);
    const done = popped.size === count(days);
    updateStatus(done
      ? `Every single one was yours. ${days || 1} ${days === 1 ? 'day' : 'days'}, and not one of them wasted.`
      : `${l.title}${days ? ` · ${l.sub}` : ''} · ${NOTES[i % NOTES.length]}`);
    if (done) confetti();
  }

  field.addEventListener('click', (e) => { const b = e.target.closest('.balloon'); if (b) pop(b); });
  $('#balloonReset').addEventListener('click', () => { popped = new Set(); buildBalloons(true); });

  // ---- Candles tab ----
  const cField = $('#candleField');
  const cNote = $('#candleNote');
  let lit = new Set();
  let candlesFor = '';
  function buildCandles(force) {
    const { days, anchorTs } = getInfo();
    const key = `${days}|${anchorTs}`;
    if (!force && key === candlesFor) return;
    if (key !== candlesFor) lit = new Set();
    candlesFor = key;
    cField.replaceChildren();
    for (let i = 0; i < count(days); i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'candle' + (lit.has(i) ? ' lit' : '');
      b.dataset.i = i;
      b.style.setProperty('--f', `${(-(i * 0.37) % 3).toFixed(2)}s`);
      b.setAttribute('aria-pressed', lit.has(i));
      b.setAttribute('aria-label', `Light the candle for ${labelFor(i, days, anchorTs).title}`);
      b.innerHTML = '<i class="c-flame"></i><i class="c-wick"></i><i class="c-wax"></i>';
      cField.append(b);
    }
    updateCandles();
  }
  function updateCandles(msg) {
    const { days } = getInfo();
    const n = count(days);
    $('#candleStatus').textContent = lit.size === n ? `All ${days || 1} ${days === 1 ? 'day' : 'days'} lit` : `${lit.size} of ${n} lit`;
    $('#candleRoom').classList.toggle('glow', lit.size === n);
    $('#candleReset').hidden = lit.size === 0;
    $('#candleAll').hidden = lit.size === n;
    if (msg !== undefined) cNote.textContent = msg;
    else if (lit.size === 0) cNote.textContent = 'Light a candle for each day you kept for yourself.';
  }
  function lightOne(el, silent) {
    const i = Number(el.dataset.i);
    if (lit.has(i)) return;
    lit.add(i); el.classList.add('lit'); el.setAttribute('aria-pressed', 'true');
    if (silent) return;
    navigator.vibrate?.(10);
    const { days, anchorTs } = getInfo();
    const l = labelFor(i, days, anchorTs);
    const done = lit.size === count(days);
    updateCandles(done ? `The whole room is glowing. ${days || 1} ${days === 1 ? 'day' : 'days'}, every one of them yours.` : `${l.title}${days ? ` · ${l.sub}` : ''} · ${NOTES[i % NOTES.length]}`);
  }
  cField.addEventListener('click', (e) => {
    const b = e.target.closest('.candle');
    if (!b) return;
    if (lit.has(Number(b.dataset.i))) {
      const { days, anchorTs } = getInfo();
      const l = labelFor(Number(b.dataset.i), days, anchorTs);
      cNote.textContent = `${l.title}${days ? ` · ${l.sub}` : ''} · ${NOTES[Number(b.dataset.i) % NOTES.length]}`;
    } else lightOne(b);
  });
  $('#candleAll').addEventListener('click', () => {
    cField.querySelectorAll('.candle:not(.lit)').forEach((c) => lightOne(c, true));
    const { days } = getInfo();
    updateCandles(`The whole room is glowing. ${days || 1} ${days === 1 ? 'day' : 'days'}, every one of them yours.`);
  });
  $('#candleReset').addEventListener('click', () => { lit = new Set(); buildCandles(true); });

  // ---- Seconds tab ----
  function buildGrid() {
    if (grid.children.length) return;
    for (let i = 0; i < 60; i++) {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'sec';
      d.setAttribute('aria-label', `Second ${i + 1} of this minute`);
      d.textContent = '';
      grid.append(d);
    }
  }
  const SEC_NOTES = ['This second is yours.', 'Nobody took it from you.', 'Breathe. It is quiet and it is yours.', 'One more second of peace.', 'You are doing this, second by second.'];
  let secTap = 0;
  grid.addEventListener('click', (e) => {
    const d = e.target.closest('.sec');
    if (!d) return;
    d.classList.remove('ping'); void d.offsetWidth; d.classList.add('ping');
    navigator.vibrate?.(8);
    $('#secNote').textContent = SEC_NOTES[secTap++ % SEC_NOTES.length];
  });
  function tickSeconds() {
    const { anchorTs } = getInfo();
    const ms = Date.now() - anchorTs;
    const s = new Date().getSeconds();
    [...grid.children].forEach((d, i) => d.classList.toggle('lit', i <= s));
    $('#secNow').textContent = `${s + 1} / 60`;
    const total = Math.max(0, Math.floor(ms / 1000));
    $('#secTotal').textContent = total.toLocaleString('en-GB');
    $('#secMinutes').textContent = Math.floor(total / 60).toLocaleString('en-GB');
  }

  // ---- Peace tab: what your seconds look like ----
  const PEACE_NOTES = [
    'Every one of them is a moment you didn’t have to carry.',
    'Slow down. Nothing is asking you to act right now.',
    'The sea doesn’t hurry, and neither do you.',
    'Each second you didn’t reach out is a second you gave to yourself.',
  ];
  let peaceNoteAt = 0;
  const fmt = (n) => Math.floor(n).toLocaleString('en-GB');
  function tickPeace() {
    const { anchorTs } = getInfo();
    const s = Math.max(0, Math.floor((Date.now() - anchorTs) / 1000));
    $('#pzSecs').textContent = fmt(s);
    $('#pzBeats').textContent = fmt(s);          // about one calm heartbeat a second
    $('#pzBreaths').textContent = fmt(s / 5);    // a slow breath is about five seconds
    $('#pzSongs').textContent = fmt(s / 210);    // a song is about 3½ minutes
    $('#pzNights').textContent = fmt(s / (8 * 3600));
    $('#pzDays').textContent = fmt(s / 86400);
    if (s % 20 === 0 && s !== peaceNoteAt) { peaceNoteAt = s; $('#peaceNote').textContent = PEACE_NOTES[(s / 20) % PEACE_NOTES.length]; }
  }

  // ---- tabs & lifecycle ----
  function show(tab) {
    for (const t of dlg.querySelectorAll('[role=tab]')) {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    }
    $('#panelBalloons').hidden = tab !== 'balloons';
    $('#panelCandles').hidden = tab !== 'candles';
    $('#panelPeace').hidden = tab !== 'peace';
    $('#panelSeconds').hidden = tab !== 'seconds';
    if (tab === 'candles') buildCandles(false);
    clearInterval(timer);
    if (tab === 'peace') { tickPeace(); timer = setInterval(tickPeace, 1000); }
    if (tab === 'seconds') { buildGrid(); tickSeconds(); timer = setInterval(tickSeconds, 250); }
  }
  dlg.querySelectorAll('[role=tab]').forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  dlg.querySelector('[role=tablist]').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const tabs = [...dlg.querySelectorAll('[role=tab]')];
    const next = tabs[(tabs.indexOf(document.activeElement) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus(); show(next.dataset.tab);
  });

  function open() {
    opener = document.activeElement;
    const { days } = getInfo();
    $('#daysTitle').textContent = days === 0 ? 'Your first day' : `${days} ${days === 1 ? 'day' : 'days'} that are yours`;
    buildBalloons(false);
    show('balloons');
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('close', () => { clearInterval(timer); opener?.focus?.(); });
  $('#daysClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  return { open };
}
