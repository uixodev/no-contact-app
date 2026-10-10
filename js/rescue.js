/**
 * rescue.js — the guided "urgent help" flow, shown when the urge to reach out is at its peak.
 *
 * Seven short, interactive steps inside #urgentDialog, led by the mascot:
 *   1 How strong is it?   2 Breathe   3 Ground yourself (5-4-3-2-1)   4 Think it through
 *   5 Let it out (unsent message)   6 Ride the wave (activity + timer + trusted person)   7 How do you feel now?
 *
 * app.js passes in what it owns (settings, the live count, toasts, saving). The wave timer lives here
 * and keeps running if the dialog is closed.
 */
import { splitElapsed, formatElapsed } from './streaks.js';

const STEPS = 7;
const BREATH_ROUNDS = 3;
const BREATH_PHASES = [['in', 'Breathe in…', 4], ['hold', 'Hold…', 4], ['out', 'Breathe out slowly…', 6]];
const TAGS = [
  ['lonely', '😔 Lonely'], ['bored', '🥱 Bored'], ['night', '🌙 Late night'], ['saw', '👀 Saw something'],
  ['memory', '💭 A memory'], ['angry', '😤 Angry'], ['drinking', '🍷 Drinking'], ['other', '✨ Something else'],
];
const SENSES = [[5, 'things you can see', '👀'], [4, 'things you can touch', '✋'], [3, 'sounds you can hear', '👂'], [2, 'things you can smell', '👃'], [1, 'thing you can taste', '👅']];
const TOTAL_TAPS = SENSES.reduce((n, [count]) => n + count, 0);
const ACTIVITIES = [
  ['🚶', 'Take a walk'], ['💧', 'Drink water'], ['🚿', 'Cold water on your face'], ['🧘', 'Stretch'],
  ['🎧', 'Put music on'], ['🧹', 'Tidy something'], ['📝', 'Journal'], ['🍎', 'Eat something'],
];
const WAIT_CHOICES = [5, 10, 20];
const COACH = [
  'Hey. I’m right here. Let’s slow this down together.',
  'Slow breaths tell your body it’s safe.',
  'Let’s bring you back to this room.',
  'Let’s check that urge against what you really want.',
  'Say it all. It stays here, and it never gets sent.',
  'Give the wave something else to do.',
  'Look at you. Let’s see how it feels now.',
];

/** Tiny DOM builder: el('button', { class: 'x', onclick: fn, text: 'Hi' }, child, child) */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => c != null && n.append(c));
  return n;
}

const mmss = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export function createRescue(ctx) {
  const $ = (sel) => document.querySelector(sel);
  const dlg = $('#urgentDialog');
  const body = $('#rescueBody');
  const nextBtn = $('#rescueNext');
  const backBtn = $('#rescueBack');

  const wait = { end: null, state: 'idle', min: 20 }; // state: idle | running | done — survives closing the dialog
  let r = fresh();
  let breathTimer = null;

  function fresh() {
    return {
      step: 0, before: 5, after: 5, tags: new Set(),
      breath: 'idle', round: 1,
      sense: 0, left: SENSES[0][0], taps: 0, sensesDone: false,
      flipped: new Set(), released: false, activity: null,
    };
  }

  /* ---------- open / close / navigation ---------- */
  function open(startStep = 0) {
    r = fresh();
    r.step = Number.isInteger(startStep) && startStep >= 0 && startStep < STEPS ? startStep : 0;
    render();
    dlg.showModal();
    tick();
  }
  function close() { stopBreath(); if (dlg.open) dlg.close(); }
  function go(step) { r.step = Math.max(0, Math.min(STEPS - 1, step)); render(); }

  /* ---------- rendering ---------- */
  function render() {
    stopBreath();
    const i = r.step;

    const prog = $('#rescueProgress');
    if (prog.children.length !== STEPS) prog.replaceChildren(...Array.from({ length: STEPS }, () => el('i')));
    [...prog.children].forEach((seg, k) => { seg.className = k < i ? 'done' : k === i ? 'now' : ''; });
    prog.setAttribute('aria-valuemax', String(STEPS));
    prog.setAttribute('aria-valuenow', String(i + 1));
    $('#rescueCount').textContent = `${i + 1}/${STEPS}`;
    backBtn.hidden = i === 0;
    nextBtn.textContent = i === STEPS - 1 ? 'Finish' : i === 0 ? 'Let’s start' : 'Continue';
    nextBtn.disabled = false;

    const view = [stepRate, stepBreathe, stepGround, stepThink, stepLetGo, stepWave, stepAfter][i]();
    const mascot = el('span', { class: 'coach-mascot', 'aria-hidden': 'true' });
    mascot.append($('#mascotTpl').content.cloneNode(true));
    body.replaceChildren(
      el('div', { class: 'coach' }, mascot, el('p', { class: 'coach-bubble', text: COACH[i] })),
      el('h2', { id: 'urgentTitle', class: 'rescue-title', tabindex: '-1', text: view.title }),
      ...view.content,
    );
    body.scrollTop = 0;
    $('#urgentTitle').focus({ preventScroll: true });
    updateReady();
    updateWaitUI();
  }

  /** The Continue button gently pulses once the step's little task is done. */
  function isReady() {
    switch (r.step) {
      case 1: return r.breath === 'done';
      case 2: return r.sensesDone;
      case 3: return r.flipped.size === 3;
      case 4: return r.released;
      case 5: return wait.state !== 'idle';
      default: return false;
    }
  }
  const updateReady = () => nextBtn.classList.toggle('ready', isReady());

  /* ---------- step 1: how strong is it? ---------- */
  function stepRate() {
    const out = el('output', { class: 'feel-num', text: String(r.before) });
    const word = el('span', { class: 'feel-word' });
    const setWord = () => { word.textContent = r.before >= 8 ? 'Peak — the hardest part' : r.before >= 5 ? 'Strong' : r.before >= 3 ? 'Noticeable' : 'Mild'; };
    setWord();
    const range = el('input', {
      type: 'range', min: '0', max: '10', value: String(r.before), id: 'beforeRange', 'aria-label': 'How strong is the urge right now, from 0 to 10',
      oninput: (e) => { r.before = Number(e.target.value); out.textContent = r.before; setWord(); },
    });
    const chips = TAGS.map(([key, label]) => {
      const b = el('button', {
        type: 'button', class: 'chip', text: label, 'aria-pressed': String(r.tags.has(key)),
        onclick: () => { if (r.tags.has(key)) r.tags.delete(key); else r.tags.add(key); b.setAttribute('aria-pressed', String(r.tags.has(key))); },
      });
      return b;
    });
    return {
      title: 'How strong is the urge?',
      content: [
        el('div', { class: 'feel' }, el('div', { class: 'feel-head' }, out, el('span', { class: 'feel-of', text: '/ 10' })), word, range),
        el('h3', { class: 'rescue-sub', text: 'What’s pulling at you?' }),
        el('p', { class: 'muted small', text: 'Optional. It helps you spot patterns later.' }),
        el('div', { class: 'chips' }, chips),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-block', id: 'jumpTimer', onclick: () => go(5) }),
      ],
    };
  }

  /* ---------- step 2: breathe ---------- */
  function stepBreathe() {
    const done = r.breath === 'done';
    const orb = el('div', { class: 'breath-orb', id: 'breathOrb', 'data-phase': done ? 'out' : 'idle' }, el('span', { class: 'breath-count', id: 'breathCount' }));
    return {
      title: 'Breathe',
      content: [
        el('p', { class: 'muted', text: `Follow the circle: in for 4, hold for 4, out for 6. ${BREATH_ROUNDS} slow rounds.` }),
        el('div', { class: 'breath', 'aria-hidden': 'true' }, orb),
        el('p', { class: 'breath-label', id: 'breathLabel', role: 'status', text: done ? 'Beautifully done ✓' : 'Ready when you are' }),
        el('p', { class: 'muted small', id: 'breathRound', text: done ? `${BREATH_ROUNDS} of ${BREATH_ROUNDS} rounds complete` : '' }),
        el('button', { type: 'button', class: 'btn btn-primary btn-block', id: 'breathStart', text: done ? 'Breathe again' : 'Start breathing', onclick: startBreath }),
      ],
    };
  }
  function stopBreath() { clearTimeout(breathTimer); breathTimer = null; if (r.breath === 'running') r.breath = 'idle'; }
  function startBreath() {
    clearTimeout(breathTimer);
    r.breath = 'running'; r.round = 1;
    $('#breathStart').hidden = true;
    let phase = 0, remain = 0;
    const paint = () => {
      const orb = $('#breathOrb');
      if (!orb || !orb.isConnected) return false;
      const [key, text, secs] = BREATH_PHASES[phase];
      orb.dataset.phase = key;
      orb.style.transitionDuration = `${secs}s`;
      $('#breathLabel').textContent = text;
      $('#breathRound').textContent = `Round ${r.round} of ${BREATH_ROUNDS}`;
      remain = secs;
      $('#breathCount').textContent = remain;
      return true;
    };
    const step = () => {
      remain -= 1;
      if (remain > 0) { const c = $('#breathCount'); if (c) c.textContent = remain; }
      else {
        phase += 1;
        if (phase === BREATH_PHASES.length) {
          phase = 0;
          if (r.round === BREATH_ROUNDS) return finishBreath();
          r.round += 1;
        }
        if (!paint()) return;
      }
      breathTimer = setTimeout(step, 1000);
    };
    if (paint()) breathTimer = setTimeout(step, 1000);
  }
  function finishBreath() {
    r.breath = 'done';
    const label = $('#breathLabel'); if (!label) return;
    label.textContent = 'Beautifully done ✓';
    $('#breathRound').textContent = `${BREATH_ROUNDS} of ${BREATH_ROUNDS} rounds complete`;
    $('#breathCount').textContent = '';
    const again = $('#breathStart'); again.hidden = false; again.textContent = 'Breathe again';
    navigator.vibrate?.(20);
    updateReady();
  }

  /* ---------- step 3: 5-4-3-2-1 grounding ---------- */
  function stepGround() {
    const wrap = el('div', { class: 'ground' });
    const line = el('p', { class: 'ground-line' });
    const num = el('b');
    const icon = el('span', { class: 'sense-icon', 'aria-hidden': 'true' });
    const btn = el('button', {
      type: 'button', class: 'sense-btn',
      onclick: () => {
        r.taps += 1; r.left -= 1;
        navigator.vibrate?.(10);
        btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
        if (r.left === 0) {
          r.sense += 1;
          if (r.sense >= SENSES.length) { r.sensesDone = true; navigator.vibrate?.(20); }
          else r.left = SENSES[r.sense][0];
        }
        paint();
        updateReady();
      },
    }, icon, num);
    const dots = el('div', { class: 'dots', 'aria-hidden': 'true' }, Array.from({ length: TOTAL_TAPS }, () => el('i')));
    const hint = el('p', { class: 'muted small', text: 'Look around and tap each time you notice one.' });
    const doneBox = el('div', { class: 'ground-done', hidden: true }, el('span', { class: 'ground-check', text: '✓', 'aria-hidden': 'true' }), el('p', { class: 'ground-line', text: 'All five senses. You’re back in the room.' }));
    wrap.append(line, btn, hint, dots, doneBox);
    function paint() {
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k < r.taps));
      if (r.sensesDone) { line.hidden = btn.hidden = hint.hidden = true; doneBox.hidden = false; return; }
      const [, what, emoji] = SENSES[r.sense];
      line.textContent = `Name ${r.left} ${what}`;
      num.textContent = r.left;
      icon.textContent = emoji;
      btn.setAttribute('aria-label', `${r.left} ${what} left to name. Tap each time you notice one.`);
    }
    paint();
    return { title: 'Come back to the room', content: [wrap] };
  }

  /* ---------- step 4: think it through ---------- */
  function stepThink() {
    const reason = (ctx.settings().reason || '').trim() || 'For peace, room to heal, and a clear head.';
    const cards = [
      ['Will sending it fix how I feel?', 'Relief lasts minutes. The urge usually returns stronger every time you feed it.'],
      ['Why did I start this?', `“${reason}”`],
      ['How far have I come?', null],
    ].map(([q, a], k) => {
      const back = a == null ? el('span', { class: 'flip-a', id: 'rescueTime' }) : el('span', { class: 'flip-a', text: a });
      const card = el('button', {
        type: 'button', class: 'flip', 'aria-pressed': String(r.flipped.has(k)),
        onclick: () => {
          r.flipped.add(k);
          card.setAttribute('aria-pressed', 'true');
          card.classList.add('is-flipped');
          updateReady(); tick();
        },
      }, el('span', { class: 'flip-q' }, el('span', { class: 'flip-tag', text: 'Tap to reveal' }), q), back);
      if (r.flipped.has(k)) card.classList.add('is-flipped');
      return card;
    });
    return { title: 'Think it through', content: [el('p', { class: 'muted', text: 'Tap each card. Be honest with yourself.' }), el('div', { class: 'flips' }, cards)] };
  }

  /* ---------- step 5: let it out ---------- */
  function stepLetGo() {
    const hint = el('p', { class: 'muted small', id: 'letGoHint', role: 'status', text: r.released ? 'Released. It never reached them, and it’s out of your head now. 🍃' : 'Never sent. Never leaves this device.' });
    const area = el('textarea', { id: 'rescueText', rows: '6', maxlength: '1000', placeholder: 'Everything you want to say…', 'aria-label': 'Write what you want to say. It will never be sent.' });
    const box = el('div', { class: 'letgo-box' }, area);
    const letGo = el('button', {
      type: 'button', class: 'btn btn-primary', id: 'letGoBtn', text: 'Let it go 🍃',
      onclick: () => {
        if (!area.value.trim()) { hint.textContent = 'Write something first, even one word.'; area.focus(); return; }
        letGo.disabled = true; keep.disabled = true; area.readOnly = true;
        box.classList.add('letting-go');
        setTimeout(() => {
          area.value = ''; area.readOnly = false; box.classList.remove('letting-go');
          letGo.disabled = false; keep.disabled = false;
          r.released = true;
          hint.textContent = 'Released. It never reached them, and it’s out of your head now. 🍃';
          navigator.vibrate?.(20);
          updateReady();
        }, 1100);
      },
    });
    const keep = el('button', {
      type: 'button', class: 'btn btn-ghost', id: 'keepBtn', text: 'Keep in today’s note', hidden: !ctx.canKeepNote(),
      onclick: () => {
        if (!area.value.trim()) { hint.textContent = 'Write something first, even one word.'; area.focus(); return; }
        ctx.keepInNote(area.value.trim());
        area.value = ''; r.released = true;
        hint.textContent = 'Saved in today’s check-in note, only on this device.';
        updateReady();
      },
    });
    return { title: 'Say it here instead', content: [box, hint, el('div', { class: 'btn-row' }, letGo, keep)] };
  }

  /* ---------- step 6: ride the wave ---------- */
  function stepWave() {
    const tip = el('p', { class: 'muted small', id: 'activityTip', text: r.activity ? `Do this for the whole timer: ${r.activity.toLowerCase()}. Even five minutes of it helps.` : 'Pick one, then start the timer.' });
    const acts = ACTIVITIES.map(([emoji, label]) => {
      const b = el('button', {
        type: 'button', class: 'chip', text: `${emoji} ${label}`, 'aria-pressed': String(r.activity === label),
        onclick: () => {
          r.activity = r.activity === label ? null : label;
          acts.forEach((x) => x.setAttribute('aria-pressed', String(x === b && r.activity === label)));
          tip.textContent = r.activity ? `Do this for the whole timer: ${r.activity.toLowerCase()}. Even five minutes of it helps.` : 'Pick one, then start the timer.';
        },
      });
      return b;
    });
    const lens = WAIT_CHOICES.map((m) => el('button', {
      type: 'button', class: 'seg', text: `${m} min`, 'data-min': String(m), 'aria-pressed': String(wait.min === m),
      onclick: () => { if (wait.state === 'running') return; wait.min = m; updateWaitUI(); },
    }));
    const friend = friendRow();
    return {
      title: 'Ride the wave',
      content: [
        el('p', { class: 'muted', text: 'Urges peak and pass, usually within 20 minutes. Do something else while it does.' }),
        el('div', { class: 'chips' }, acts), tip,
        el('div', { class: 'timer-card' },
          el('div', { class: 'segs', role: 'group', 'aria-label': 'Timer length' }, lens),
          el('p', { class: 'wait-time', id: 'waitTime', text: mmss(wait.min * 60000) }),
          el('p', { class: 'muted small', id: 'waitNote' }),
          el('button', { type: 'button', class: 'btn btn-primary btn-block', id: 'waitBtn', onclick: toggleWait })),
        friend,
      ],
    };
  }
  function friendRow() {
    const { friendName, friendPhone } = ctx.settings();
    const phone = String(friendPhone || '').replace(/[^\d+]/g, '');
    if (!phone) return el('p', { class: 'muted small friend-hint', text: 'Tip: add a trusted person in Settings for one-tap text and call buttons here.' });
    const name = (friendName || '').trim() || 'them';
    return el('div', { class: 'friend' },
      el('p', { class: 'field-label', text: `Reach out to someone safe` }),
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn btn-ghost', id: 'friendText', href: `sms:${phone}`, text: `💬 Text ${name}` }),
        el('a', { class: 'btn btn-ghost', id: 'friendCall', href: `tel:${phone}`, text: `📞 Call ${name}` })));
  }
  function toggleWait() {
    if (wait.state === 'running') { wait.state = 'idle'; wait.end = null; }
    else { wait.state = 'running'; wait.end = Date.now() + wait.min * 60000; }
    updateWaitUI(); updateReady();
  }
  function updateWaitUI() {
    const running = wait.state === 'running';
    const t = $('#waitTime');
    if (t) {
      t.textContent = running ? mmss(wait.end - Date.now()) : wait.state === 'done' ? 'Done ✓' : mmss(wait.min * 60000);
      $('#waitBtn').textContent = running ? 'Cancel timer' : wait.state === 'done' ? `Wait another ${wait.min} minutes` : `Start ${wait.min}-minute timer`;
      $('#waitNote').textContent = wait.state === 'done' ? 'You rode out the wave. How does the urge feel now?' : running ? 'Keep doing your activity. You can close this and come back.' : '';
      body.querySelectorAll('.seg').forEach((s) => { s.setAttribute('aria-pressed', String(Number(s.dataset.min) === wait.min)); s.disabled = running; });
    }
    const jump = $('#jumpTimer');
    if (jump) jump.textContent = running ? `⏱ Go to my timer · ${mmss(wait.end - Date.now())} left` : wait.state === 'done' ? '⏱ Timer finished — go back to it' : '⏱ Skip ahead to the timer';
  }

  /* ---------- step 7: how do you feel now? ---------- */
  function stepAfter() {
    const out = el('output', { class: 'feel-num', text: String(r.after) });
    const compare = el('div', { class: 'compare', role: 'status' });
    const paint = () => {
      out.textContent = r.after;
      const d = r.before - r.after;
      compare.replaceChildren(
        el('div', { class: 'compare-row' }, el('span', { class: 'compare-pill', text: `Before ${r.before}` }), el('span', { 'aria-hidden': 'true', text: '→' }), el('span', { class: 'compare-pill now', text: `Now ${r.after}` })),
        el('p', { class: 'compare-msg', text: d > 0 ? `Down ${d} ${d === 1 ? 'point' : 'points'}. You did that.` : d === 0 ? 'Still the same? That’s okay. Urges can take a few rounds to ease.' : 'It feels stronger right now. That happens. Do another round, or reach out to someone safe.' }));
    };
    const range = el('input', {
      type: 'range', min: '0', max: '10', value: String(r.after), id: 'afterRange', 'aria-label': 'How strong is the urge now, from 0 to 10',
      oninput: (e) => { r.after = Number(e.target.value); paint(); },
    });
    paint();
    return {
      title: 'How does it feel now?',
      content: [
        el('div', { class: 'feel' }, el('div', { class: 'feel-head' }, out, el('span', { class: 'feel-of', text: '/ 10' })), range),
        compare,
        el('div', { class: 'btn-row' },
          el('button', { type: 'button', class: 'btn btn-ghost', id: 'anotherRound', text: '🔁 Another round', onclick: () => { r.breath = 'idle'; r.sensesDone = false; r.sense = 0; r.left = SENSES[0][0]; r.taps = 0; r.released = false; go(1); } }),
          el('button', { type: 'button', class: 'btn btn-ghost', id: 'addToCheckin', text: '📝 Add to today’s check-in', onclick: () => { close(); ctx.openCheckin(r.before); } })),
      ],
    };
  }

  /* ---------- finishing ---------- */
  async function finish() {
    nextBtn.disabled = true;
    const rec = {
      at: new Date().toISOString(),
      before: r.before, after: r.after,
      tags: [...r.tags], activity: r.activity,
      waitedMin: wait.state === 'done' ? wait.min : 0,
    };
    let saved = true;
    try { await ctx.saveUrge(rec); } catch (err) { console.error(err); saved = false; }
    close();
    confetti();
    navigator.vibrate?.([30, 40, 30]);
    ctx.toast(saved ? `Urge ${ctx.urgesCount()} survived. Every second COUNTS!` : 'You did it. (I couldn’t save this one, but it still counts.)');
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#58CC02', '#FFC800', '#FF9600', '#FF4B4B', '#CE82FF', '#89E219'];
    const box = el('div', { class: 'confetti', 'aria-hidden': 'true' }, Array.from({ length: 40 }, (_, k) => el('i', {
      style: `left:${Math.random() * 100}%;background:${colors[k % colors.length]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.4).toFixed(2)}s;--drift:${Math.round(Math.random() * 120 - 60)}px`,
    })));
    document.body.append(box);
    setTimeout(() => box.remove(), 3600);
  }

  /* ---------- once a second ---------- */
  function tick() {
    if (wait.state === 'running' && Date.now() >= wait.end) {
      wait.state = 'done'; wait.end = null;
      navigator.vibrate?.([120, 60, 120]);
      if (!dlg.open) ctx.toast('Your timer finished. You rode out the wave. How does the urge feel now?');
      updateReady();
    }
    if (!dlg.open) return;
    const anchor = ctx.anchorTs();
    const live = $('#rescueTime');
    if (live && anchor != null) live.textContent = `You’ve held ${formatElapsed(splitElapsed(Date.now() - anchor))}.`;
    updateWaitUI();
  }

  /* ---------- wiring ---------- */
  nextBtn.addEventListener('click', () => { if (r.step === STEPS - 1) finish(); else go(r.step + 1); });
  backBtn.addEventListener('click', () => go(r.step - 1));
  dlg.addEventListener('close', stopBreath);

  return { open, close, tick, isOpen: () => dlg.open };
}
