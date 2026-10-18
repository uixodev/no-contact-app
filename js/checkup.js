/**
 * checkup.js — "Want to check on him?" A step-by-step pause before looking at his account, the group or your own inbox.
 *
 *   1 Before you look   an honest disclaimer and the words that hurt (written by you, kept on your device)
 *   2 Why now?          write why you want to reach out right now
 *   3 A thought to hold a calming thought (editable), after a slow pause
 *   4 Do you still want to check?   shows what you wrote after earlier times
 *        no  → swipe him out of your mind → a win
 *        yes → wait 20 minutes → ask again → no = a win; yes = write a short report (why, how you felt afterwards)
 *
 * Every pass is saved as a note you can read and edit later (setting "checkLog", part of your backup).
 */
import { confetti } from './fx.js';
import { TAGS, labelOf } from './tags.js';

const KINDS = {
  account: { icon: '👤', label: 'His account', what: 'his account', line: 'His page will not answer anything. It shows a curated moment, and you will carry it around for the rest of the day.' },
  group: { icon: '👥', label: 'The group', what: 'the group', line: 'The group will show you life going on, and nothing about what is true. You will read between lines that are not there.' },
  gmail: { icon: '✉️', label: 'My Gmail', what: 'your Gmail', line: 'If there is nothing there you will feel the hole. If there is something, you will fall straight back in. Neither is a good trade.' },
};
const OUTCOMES = { resisted: '🏆 I did not look', waited: '⏳ I waited, then did not look', checked: '👀 I looked', open: '… not finished' };
const STARTERS = ['I miss him', 'I am bored', 'I feel lonely', 'I am angry', 'I want to know he is okay', 'I want him to see me okay'];
const DEFAULT_THOUGHT = 'If he is the right person, God will send him to you, even without you trying to check on him all the time. Do not worry. God can do this.';
const NEEDED = 5;                                                       // flicks to clear him out of your mind
const WAIT_MS = () => Number(window.NC_WAIT_MS) || 20 * 60 * 1000;     // twenty minutes (tests can shorten it)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function createCheckup({ get, set, onGames, urges }) {
  const dlg = $('#checkDialog');
  const SLIDES = ['truth', 'why', 'faith', 'ask', 'swipe', 'calm', 'wait', 'report', 'done', 'notes', 'edit', 'urges', 'uedit'];
  const slides = Object.fromEntries(SLIDES.map((s) => [s, $(`#cs-${s}`)]));
  const FLOW = ['truth', 'why', 'faith', 'ask'];                         // the slides with Back and progress dots
  const stage = $('#mindStage'), token = $('#himToken');
  let kind = 'account', entry = null, current = 'truth', busy = false, flicks = 0, opener = null, tick = null, faithTimer = null, editing = null, second = false;

  // ---------- the saved log ----------
  const log = () => get('checkLog') || [];
  const saveLog = (arr) => set('checkLog', arr);
  async function upsert(patch) {
    const arr = log().slice();
    const i = arr.findIndex((e) => e.id === entry.id);
    entry = { ...entry, ...patch, updatedAt: new Date().toISOString() };
    if (i >= 0) arr[i] = entry; else arr.push(entry);
    await saveLog(arr);
  }
  const wins = () => log().filter((e) => e.outcome === 'resisted' || e.outcome === 'waited').length + (Number(get('checkResisted')) || 0);

  // ---------- the card on the Help tab ----------
  function refresh() {
    const n = wins();
    $('#checkCount').hidden = !n;
    $('#checkCount').textContent = n ? `🛡️ You chose not to look ${n} ${n === 1 ? 'time' : 'times'}.` : '';
    const total = log().length;
    $('#notesBtn').textContent = `📒 My notes${total ? ` (${total})` : ''}`;
    const nu = urges?.all().length || 0;
    $('#urgeNotesBtn').textContent = `📒 My urge notes${nu ? ` (${nu})` : ''}`;
    const open = log().filter((e) => e.outcome === 'open' && e.waitUntil).sort((a, b) => b.waitUntil - a.waitUntil)[0];
    const needReport = log().filter((e) => e.outcome === 'checked' && !e.felt).length;
    const box = $('#checkPending');
    box.hidden = !open && !needReport;
    box.replaceChildren();
    if (open) {
      const left = open.waitUntil - Date.now();
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pending-btn';
      b.innerHTML = left > 0 ? `<span>⏳</span><strong>Waiting: ${mmss(left)} left</strong><small>Tap to see it</small>` : `<span>🔔</span><strong>Time is up. Ask yourself again.</strong><small>Do you still want to check?</small>`;
      b.addEventListener('click', () => resume(open.id));
      box.append(b);
    }
    if (needReport) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pending-btn';
      b.innerHTML = `<span>📝</span><strong>${needReport === 1 ? 'A report is waiting for you' : `${needReport} reports are waiting`}</strong><small>Write how you felt afterwards</small>`;
      b.addEventListener('click', () => openNotes(true));
      box.append(b);
    }
    clearInterval(tick);
    if (open && open.waitUntil - Date.now() > 0) tick = setInterval(() => { if (document.hidden) return; refresh(); }, 1000);
  }

  // ---------- slides ----------
  function show(name) {
    current = name;
    for (const [k, el] of Object.entries(slides)) el.hidden = k !== name;
    const inFlow = FLOW.includes(name);
    $('#checkDots').hidden = !inFlow;
    [...$('#checkDots').children].forEach((d, i) => d.classList.toggle('on', i <= FLOW.indexOf(name)));
    $('#checkBack').hidden = !(inFlow && name !== 'truth') && name !== 'edit' && name !== 'uedit';
    $('#checkFoot').hidden = !['truth', 'why', 'faith'].includes(name);
    $('#checkNext').textContent = name === 'faith' ? 'Continue' : 'Continue';
    $('#checkNext').disabled = false;
    dlg.querySelector('.check-body').scrollTop = 0;
    $('#checkTitle').textContent = { truth: 'Before you look', why: 'Why now?', faith: 'A thought to hold', ask: 'One question', swipe: 'Let him go', calm: 'Quiet', wait: 'Wait', report: 'Your report', done: 'Saved', notes: 'My notes', edit: 'Edit note', urges: 'My urge notes', uedit: 'Edit urge note' }[name];
    clearInterval(faithTimer);
    if (name === 'why') validateWhy();
    if (name === 'faith') startFaith();
    if (name === 'ask') renderAsk();
    if (name === 'wait') startWait();
    if (name !== 'wait') stopWait();
  }

  // 1 — truth
  function renderWords() {
    const words = get('hurtWords') || [];
    $('#hurtList').replaceChildren(...words.map((w) => { const q = document.createElement('blockquote'); q.className = 'hurt'; q.textContent = `“${w}”`; return q; }));
    $('#hurtEmpty').hidden = words.length > 0;
    $('#hurtEdit').hidden = true;
    $('#hurtOpen').textContent = words.length ? '✏️ Edit' : '✏️ Add the words that hurt';
    $('#hurtText').value = words.join('\n');
  }
  $('#hurtOpen').addEventListener('click', () => { const h = $('#hurtEdit'); h.hidden = !h.hidden; if (!h.hidden) $('#hurtText').focus(); });
  $('#hurtSave').addEventListener('click', async () => {
    await set('hurtWords', $('#hurtText').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 200)));
    renderWords();
  });

  // 2 — why now
  const whyBox = $('#whyText');
  function validateWhy() { $('#checkNext').disabled = whyBox.value.trim().length < 3; }
  whyBox.addEventListener('input', validateWhy);
  $('#whyStarters').replaceChildren(...STARTERS.map((s) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = s;
    b.addEventListener('click', () => { whyBox.value = (whyBox.value.trim() ? `${whyBox.value.trim()}. ` : '') + s; whyBox.focus(); validateWhy(); });
    return b;
  }));

  // 3 — a thought to hold (the button unlocks after a slow breath)
  const thought = () => get('peaceThought') || DEFAULT_THOUGHT;
  function startFaith() {
    $('#thoughtText').textContent = thought();
    $('#thoughtEdit').hidden = true;
    const btn = $('#checkNext'); let left = reduced() ? 0 : 5;
    const label = () => { btn.disabled = left > 0; btn.textContent = left > 0 ? `Breathe… ${left}` : 'Continue'; };
    label();
    if (left > 0) faithTimer = setInterval(() => { left--; label(); if (left <= 0) clearInterval(faithTimer); }, 1000);
  }
  $('#thoughtEditBtn').addEventListener('click', () => { $('#thoughtEdit').hidden = !$('#thoughtEdit').hidden; $('#thoughtInput').value = thought(); });
  $('#thoughtSave').addEventListener('click', async () => { await set('peaceThought', $('#thoughtInput').value.trim().slice(0, 400)); $('#thoughtText').textContent = thought(); $('#thoughtEdit').hidden = true; });

  // 4 — the question, with your own earlier words
  function echoes() {
    const prev = log().filter((e) => e.id !== entry?.id && (e.felt || e.reason));
    prev.sort((a, b) => (b.felt ? 1 : 0) - (a.felt ? 1 : 0) || (b.kind === kind) - (a.kind === kind) || String(b.at).localeCompare(String(a.at)));
    return prev.slice(0, 3);
  }
  function renderAsk() {
    $('#askTitle').textContent = second ? 'It has been a while. Do you still want to check?' : 'Do you still want to check?';
    const list = $('#echoList'), e = echoes();
    const own = entry?.why ? [{ own: true, text: entry.why }] : [];
    const cards = [...own.map((o) => ({ head: second ? 'Twenty minutes ago you wrote' : 'Just now you wrote', text: o.text })),
      ...e.map((x) => ({ head: x.felt ? `${fmtDay.format(new Date(x.at))}, after you looked, you felt` : `${fmtDay.format(new Date(x.at))}, you wrote`, text: x.felt || x.reason }))];
    list.replaceChildren(...cards.map((c) => { const f = document.createElement('figure'); f.className = 'echo'; const h = document.createElement('figcaption'); h.textContent = c.head; const q = document.createElement('blockquote'); q.textContent = `“${c.text}”`; f.append(h, q); return f; }));
    $('#askNo').textContent = second ? 'No. I am okay now' : 'No. I do not want to';
  }
  $('#askNo').addEventListener('click', async () => { await upsert({ outcome: second ? 'waited' : 'resisted', waitUntil: null }); refresh(); startSwipe(); });
  $('#askYes').addEventListener('click', async () => {
    if (!second) { await upsert({ outcome: 'open', waitUntil: Date.now() + WAIT_MS() }); refresh(); show('wait'); }
    else { await upsert({ outcome: 'checked', waitUntil: null }); refresh(); show('report'); fillReport(); }
  });

  // wait twenty minutes
  const RING = 2 * Math.PI * 70;
  function startWait() {
    const ring = $('#waitRing'); ring.style.strokeDasharray = String(RING);
    const draw = () => {
      const left = (entry.waitUntil || 0) - Date.now(), total = WAIT_MS();
      $('#waitClock').textContent = mmss(left);
      ring.style.strokeDashoffset = String(RING * Math.min(1, Math.max(0, 1 - left / total)));
      if (left <= 0) { stopWait(); second = true; show('ask'); navigator.vibrate?.([30, 60, 30]); }
    };
    draw(); stopWait(); waitTick = setInterval(draw, 500);
  }
  let waitTick = null;
  function stopWait() { clearInterval(waitTick); waitTick = null; }
  $('#waitGame').addEventListener('click', () => onGames?.open?.('menu'));
  $('#waitLater').addEventListener('click', () => dlg.close());

  // report
  function fillReport() { $('#repReason').value = entry.reason || entry.why || ''; $('#repFelt').value = entry.felt || ''; }
  $('#repSave').addEventListener('click', async () => { await upsert({ reason: $('#repReason').value.trim(), felt: $('#repFelt').value.trim(), outcome: 'checked' }); refresh(); show('done'); });
  $('#repLater').addEventListener('click', async () => { await upsert({ reason: $('#repReason').value.trim(), outcome: 'checked' }); refresh(); show('done'); });
  $('#doneClose').addEventListener('click', () => dlg.close());
  $('#doneNotes').addEventListener('click', () => openNotes());

  // ---------- the swipe-him-away scene ----------
  const scale = () => Math.max(0.26, 1 - flicks * 0.17);
  const setCalm = () => stage.style.setProperty('--calm', String(Math.min(1, flicks / NEEDED)));
  function placeHome(animate) {
    token.style.transition = animate && !reduced() ? 'transform .5s cubic-bezier(.3,1.4,.5,1), opacity .4s' : 'none';
    token.style.transform = `translate(0px, 0px) scale(${scale()})`;
    token.style.opacity = String(Math.max(0.3, 1 - flicks * 0.15));
  }
  function startSwipe() {
    flicks = 0; busy = false;
    stage.querySelectorAll('.puff, .shock, .ghost, .lmote, .spark').forEach((n) => n.remove());
    stage.querySelectorAll('.thought').forEach((t) => t.classList.remove('popped'));
    $('#flickPips').replaceChildren(...Array.from({ length: NEEDED }, () => document.createElement('i')));
    $('#flickNote').textContent = 'Swipe him out of your mind. Flick hard, away from you.';
    token.hidden = false; token.querySelector('.him-badge').textContent = KINDS[kind].icon;
    stage.classList.remove('empty', 'dawn'); setCalm(); placeHome(false);
    show('swipe');
    token.focus({ preventScroll: true });
  }
  function ring(x, y, cls = 'shock') {
    if (reduced()) return;
    const r = document.createElement('i'); r.className = cls; r.style.left = `${x}px`; r.style.top = `${y}px`;
    stage.append(r); setTimeout(() => r.remove(), 900);
  }
  function motes(n) {
    if (reduced()) return;
    for (let k = 0; k < n; k++) {
      const m = document.createElement('i'); m.className = 'lmote';
      m.style.cssText = `left:${Math.random() * 100}%;bottom:-10px;--d:${(3 + Math.random() * 3).toFixed(1)}s;--s:${(4 + Math.random() * 7).toFixed(0)}px;--x:${Math.round(Math.random() * 60 - 30)}px`;
      stage.append(m); setTimeout(() => m.remove(), 6500);
    }
  }
  function puff(dx, dy) {
    if (reduced()) return;
    const r = stage.getBoundingClientRect();
    for (let k = 0; k < 16; k++) {
      const p = document.createElement('i'); p.className = 'puff';
      const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6, d = 50 + Math.random() * 90;
      p.style.cssText = `left:${r.width / 2}px;top:${r.height / 2}px;--x:${Math.cos(ang) * d}px;--y:${Math.sin(ang) * d}px`;
      stage.append(p); setTimeout(() => p.remove(), 700);
    }
  }
  /** A trail of fading ghosts behind him as he flies off. */
  function trail(until) {
    if (reduced()) return;
    const sr = stage.getBoundingClientRect(), t0 = performance.now();
    const id = setInterval(() => {
      if (performance.now() - t0 > until) { clearInterval(id); return; }
      const r = token.getBoundingClientRect();
      const g = document.createElement('i'); g.className = 'ghost';
      g.style.cssText = `left:${r.left - sr.left + r.width / 2}px;top:${r.top - sr.top + r.height / 2}px;width:${r.width}px;height:${r.height}px`;
      stage.append(g); setTimeout(() => g.remove(), 450);
    }, 45);
  }
  async function flick(dx, dy) {
    if (busy) return;
    busy = true; flicks++;
    navigator.vibrate?.(15);
    const len = Math.hypot(dx, dy) || 1, far = Math.max(stage.clientWidth, stage.clientHeight) * 1.1;
    const tx = (dx / len) * far, ty = (dy / len) * far;
    [...$('#flickPips').children].forEach((p, i) => p.classList.toggle('on', i < flicks));
    setCalm();
    stage.classList.add('hit'); setTimeout(() => stage.classList.remove('hit'), 240);
    ring(stage.clientWidth / 2, stage.clientHeight / 2);
    puff(dx, dy); motes(4 + flicks * 2);
    const bubbles = [...stage.querySelectorAll('.thought:not(.popped)')];
    if (bubbles.length && flicks % 2 === 1) bubbles[0].classList.add('popped');
    const msgs = ['Gone. Notice the space he left.', 'Again. He gets smaller each time.', 'Good. He is fading.', 'Almost. Feel how quiet it is getting.'];
    if (flicks < NEEDED) $('#flickNote').textContent = msgs[flicks - 1];
    if (!reduced()) {
      trail(380);
      await token.animate([
        { transform: token.style.transform || 'translate(0,0)', opacity: token.style.opacity || 1 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${dx > 0 ? 720 : -720}deg) scale(.1)`, opacity: 0 },
      ], { duration: 460, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).finished.catch(() => {});
      token.getAnimations().forEach((a) => a.cancel());
    }
    if (flicks >= NEEDED) { vanish(); return; }
    const a = Math.random() * 6.283, fx = Math.cos(a) * far * 0.6, fy = Math.sin(a) * far * 0.6;
    token.style.transition = 'none'; token.style.transform = `translate(${fx}px, ${fy}px) scale(.1)`; token.style.opacity = '0';
    void token.offsetWidth;
    await new Promise((r) => setTimeout(r, reduced() ? 50 : 450));
    placeHome(true);
    setTimeout(() => { busy = false; }, reduced() ? 0 : 200);
  }
  function vanish() {
    token.hidden = true;
    stage.classList.add('empty', 'dawn');
    stage.querySelectorAll('.thought').forEach((t) => t.classList.add('popped'));
    $('#flickNote').textContent = 'He is not here anymore.';
    ring(stage.clientWidth / 2, stage.clientHeight / 2); setTimeout(() => ring(stage.clientWidth / 2, stage.clientHeight / 2, 'shock slow'), 300);
    motes(26);
    if (!reduced()) for (let k = 0; k < 12; k++) { const s = document.createElement('i'); s.className = 'spark'; s.style.cssText = `left:${10 + Math.random() * 80}%;top:${10 + Math.random() * 70}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s`; stage.append(s); }
    confetti();
    navigator.vibrate?.([20, 40, 20]);
    setTimeout(() => {
      const n = wins();
      $('#calmCount').textContent = `That is ${n} ${n === 1 ? 'win' : 'wins'}. You chose not to look.`;
      refresh();
      show('calm');
    }, reduced() ? 300 : 2200);
  }

  let drag = null;
  token.addEventListener('pointerdown', (e) => {
    if (busy) return;
    token.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, pts: [[performance.now(), e.clientX, e.clientY]], dx: 0, dy: 0 };
    token.style.transition = 'none'; token.classList.add('held');
  });
  token.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y;
    drag.pts.push([performance.now(), e.clientX, e.clientY]); if (drag.pts.length > 6) drag.pts.shift();
    token.style.transform = `translate(${drag.dx}px, ${drag.dy}px) scale(${scale()}) rotate(${drag.dx * 0.05}deg)`;
  });
  const release = () => {
    if (!drag) return;
    const d = drag; drag = null; token.classList.remove('held');
    const a = d.pts[0], b = d.pts[d.pts.length - 1], dt = Math.max(16, b[0] - a[0]);
    const speed = Math.hypot((b[1] - a[1]) / dt, (b[2] - a[2]) / dt), dist = Math.hypot(d.dx, d.dy);
    if (dist < 8) { wobble(); return; }
    if (speed > 0.6 || dist > 110) flick(d.dx || 1, d.dy || 0);
    else { placeHome(true); $('#flickNote').textContent = 'Harder. Flick him away, do not just move him.'; }
  };
  token.addEventListener('pointerup', release);
  token.addEventListener('pointercancel', release);
  function wobble() {
    if (reduced()) return;
    const s = scale();
    token.animate([{ transform: `translate(0,0) scale(${s}) rotate(0)` }, { transform: `translate(-8px,0) scale(${s}) rotate(-6deg)` }, { transform: `translate(8px,0) scale(${s}) rotate(6deg)` }, { transform: `translate(0,0) scale(${s}) rotate(0)` }], { duration: 300 });
    $('#flickNote').textContent = 'Do not tap him. Swipe him away.';
  }
  token.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flick(Math.random() < 0.5 ? -1 : 1, -0.4); } });
  $('#pushBtn').addEventListener('click', () => flick(Math.random() < 0.5 ? -1 : 1, Math.random() - 0.5));
  $('#calmDone').addEventListener('click', () => dlg.close());
  $('#calmGame').addEventListener('click', () => { dlg.close(); onGames?.open?.('menu'); });

  // ---------- notes: read and edit later ----------
  function openNotes(onlyPending) {
    const arr = log().slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const list = $('#notesList');
    $('#notesEmpty').hidden = arr.length > 0;
    list.replaceChildren(...arr.map((e) => {
      const li = document.createElement('li'); li.className = 'note' + (onlyPending && e.outcome === 'checked' && !e.felt ? ' flag' : '');
      const d = new Date(e.at);
      li.innerHTML = `<header><strong>${KINDS[e.kind]?.icon ?? ''} ${fmtDay.format(d)}, ${fmtTime.format(d)}</strong><span class="note-chip ${e.outcome}"></span></header>`;
      li.querySelector('.note-chip').textContent = OUTCOMES[e.outcome] || '';
      const add = (label, text) => { if (!text) return; const p = document.createElement('p'); const b = document.createElement('b'); b.textContent = label; const s = document.createElement('span'); s.textContent = text; p.append(b, s); li.append(p); };
      add('Why I wanted to reach out', e.why); add('The real reason', e.reason); add('How I felt afterwards', e.felt);
      if (e.outcome === 'checked' && !e.felt) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '📝 Add how you felt afterwards.'; li.append(p); }
      const row = document.createElement('div'); row.className = 'note-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-ghost btn-sm'; edit.textContent = 'Edit'; edit.addEventListener('click', () => openEdit(e.id));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn btn-ghost btn-sm'; del.textContent = 'Delete';
      del.addEventListener('click', async () => { if (!confirm('Delete this note?')) return; await saveLog(log().filter((x) => x.id !== e.id)); refresh(); openNotes(); });
      row.append(edit, del); li.append(row);
      return li;
    }));
    show('notes');
    if (!dlg.open) dlg.showModal();
  }
  function openEdit(id) {
    editing = log().find((e) => e.id === id);
    if (!editing) return;
    $('#editWhy').value = editing.why || ''; $('#editReason').value = editing.reason || ''; $('#editFelt').value = editing.felt || ''; $('#editOutcome').value = ['resisted', 'waited', 'checked'].includes(editing.outcome) ? editing.outcome : 'resisted';
    $('#editOutcome').closest('.field').hidden = editing.outcome === 'open' && !!editing.waitUntil;
    show('edit');
  }
  $('#editSave').addEventListener('click', async () => {
    const arr = log().map((e) => e.id === editing.id ? { ...e, why: $('#editWhy').value.trim(), reason: $('#editReason').value.trim(), felt: $('#editFelt').value.trim(), outcome: $('#editOutcome').closest('.field').hidden ? e.outcome : $('#editOutcome').value, updatedAt: new Date().toISOString() } : e);
    await saveLog(arr); refresh(); openNotes();
  });
  $('#notesBtn').addEventListener('click', () => { opener = document.activeElement; openNotes(); });

  // ---------- urge notes (from the urgent-help steps) ----------
  function openUrges() {
    const arr = (urges?.all() || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    $('#urgesEmpty').hidden = arr.length > 0;
    $('#urgesList').replaceChildren(...arr.map((u) => {
      const li = document.createElement('li'); li.className = 'note';
      const d = new Date(u.at);
      li.innerHTML = `<header><strong>🛡️ ${fmtDay.format(d)}, ${fmtTime.format(d)}</strong><span class="note-chip"></span></header>`;
      li.querySelector('.note-chip').textContent = `Urge ${u.before} → ${u.after}`;
      const faces = ['', '😞', '😕', '😐', '🙂', '😄'];
      const add = (label, text) => { if (!text) return; const p = document.createElement('p'); const b = document.createElement('b'); b.textContent = label; const s = document.createElement('span'); s.textContent = text; p.append(b, s); li.append(p); };
      if (u.moodBefore || u.moodAfter) add('Mood', `${faces[u.moodBefore] || '·'} → ${faces[u.moodAfter] || '·'}`);
      const pulls = (u.tags || []).map((t) => (t === 'other' && u.tagOther ? `✨ ${u.tagOther}` : labelOf(TAGS, t)));
      add('Pulling at me', pulls.join(', '));
      add('Activity', u.activity); add('What I did', u.did);
      if (u.waitedMin) add('Waited', `${u.waitedMin} minutes`);
      const row = document.createElement('div'); row.className = 'note-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-ghost btn-sm'; edit.textContent = 'Edit'; edit.addEventListener('click', () => openUrgeEdit(u.at));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn btn-ghost btn-sm'; del.textContent = 'Delete';
      del.addEventListener('click', async () => { if (!confirm('Delete this urge note?')) return; await urges.remove(u.at); refresh(); openUrges(); });
      row.append(edit, del); li.append(row);
      return li;
    }));
    show('urges');
    if (!dlg.open) dlg.showModal();
  }
  let editingUrge = null;
  function openUrgeEdit(at) {
    editingUrge = (urges?.all() || []).find((u) => u.at === at);
    if (!editingUrge) return;
    $('#ueOther').value = editingUrge.tagOther || ''; $('#ueDid').value = editingUrge.did || '';
    $('#ueOtherField').hidden = !(editingUrge.tags || []).includes('other');
    show('uedit');
  }
  $('#ueSave').addEventListener('click', async () => {
    await urges.save({ ...editingUrge, tagOther: $('#ueOther').value.trim(), did: $('#ueDid').value.trim() });
    refresh(); openUrges();
  });
  $('#urgeNotesBtn').addEventListener('click', () => { opener = document.activeElement; openUrges(); });

  // ---------- shell ----------
  $('#checkNext').addEventListener('click', async () => {
    if (current === 'truth') show('why');
    else if (current === 'why') {
      if (!entry) entry = { id: `c${Date.now()}`, at: new Date().toISOString(), kind, outcome: 'open', why: '' };
      await upsert({ why: whyBox.value.trim(), kind });
      refresh(); show('faith');
    } else if (current === 'faith') show('ask');
  });
  $('#checkBack').addEventListener('click', () => {
    if (current === 'edit') { openNotes(); return; }
    if (current === 'uedit') { openUrges(); return; }
    const i = FLOW.indexOf(current);
    if (i > 0) show(FLOW[i - 1]);
  });
  $('#checkClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { stopWait(); clearInterval(faithTimer); token.getAnimations().forEach((a) => a.cancel()); opener?.focus?.(); refresh(); });

  function open(which) {
    opener = document.activeElement;
    kind = KINDS[which] ? which : 'account';
    entry = null; second = false;
    $('#checkWhat').textContent = KINDS[kind].what;
    $('#checkLine').textContent = KINDS[kind].line;
    whyBox.value = '';
    renderWords();
    show('truth');
    if (!dlg.open) dlg.showModal();
  }
  /** Pick up a waiting pass: still counting down, or time is up and you are asked again. */
  function resume(id) {
    entry = log().find((e) => e.id === id);
    if (!entry) return;
    opener = document.activeElement;
    kind = entry.kind in KINDS ? entry.kind : 'account';
    $('#checkWhat').textContent = KINDS[kind].what;
    second = (entry.waitUntil || 0) <= Date.now();
    if (!dlg.open) dlg.showModal();
    show(second ? 'ask' : 'wait');
  }
  // legacy cleanup: the dots under the header
  $('#checkDots').replaceChildren(...FLOW.map(() => document.createElement('i')));
  return { open, refresh, openNotes, openUrges };
}
