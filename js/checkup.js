/**
 * checkup.js — "Want to check on him?" A short pause before looking at his account, the group chat or your own inbox:
 * an honest disclaimer, the words that hurt (written by you, kept only on your device), a question, and then an
 * interactive moment where you flick him out of your mind until the space is yours again.
 */
import { confetti } from './fx.js';

const KINDS = {
  account: { icon: '👤', what: 'his account', line: 'His page will not answer anything. It shows a curated moment, and you will carry it around for the rest of the day.' },
  group: { icon: '👥', what: 'the group', line: 'The group will show you life going on, and nothing about what is true. You will read between lines that are not there.' },
  gmail: { icon: '✉️', what: 'your Gmail', line: 'If there is nothing there you will feel the hole. If there is something, you will fall straight back in. Neither is a good trade.' },
};
const REASONS = [
  'I miss who I thought he was', 'I want to know he is okay', 'I want him to see I am okay', 'Unfinished feelings',
  'Habit', 'I am bored or lonely', 'I want to be proven right', 'I am angry',
];
const NEEDED = 5;                          // flicks to clear him out of your mind
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);

export function createCheckup({ get, set, onGames }) {
  const dlg = $('#checkDialog');
  const stages = { truth: $('#checkTruth'), swipe: $('#checkSwipe'), calm: $('#checkCalm') };
  const stage = $('#mindStage'), token = $('#himToken');
  let kind = 'account', flicks = 0, busy = false, opener = null, picked = new Set();

  function show(name) {
    for (const [k, el] of Object.entries(stages)) el.hidden = k !== name;
    $('#checkTitle').textContent = name === 'truth' ? 'Before you look' : name === 'swipe' ? 'Let him go' : 'Quiet';
    dlg.querySelector('.check-body').scrollTop = 0;
  }

  // ---------- stage 1: the truth ----------
  function renderWords() {
    const words = get('hurtWords') || [];
    const list = $('#hurtList');
    list.replaceChildren(...words.map((w) => { const q = document.createElement('blockquote'); q.className = 'hurt'; q.textContent = `“${w}”`; return q; }));
    $('#hurtEmpty').hidden = words.length > 0;
    $('#hurtEdit').hidden = true;
    $('#hurtOpen').textContent = words.length ? '✏️ Edit' : '✏️ Add the words that hurt';
    $('#hurtText').value = words.join('\n');
  }
  function renderReasons() {
    $('#reasonChips').replaceChildren(...REASONS.map((r) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = r; b.setAttribute('aria-pressed', picked.has(r));
      b.addEventListener('click', () => { picked.has(r) ? picked.delete(r) : picked.add(r); b.setAttribute('aria-pressed', picked.has(r)); respond(); });
      return b;
    }));
  }
  /** A gentle line that answers what you picked. */
  function respond() {
    const el = $('#reasonReply');
    if (!picked.size) { el.textContent = ''; return; }
    const r = [...picked].pop();
    el.textContent = {
      'I miss who I thought he was': 'You miss a version of him you built. The real one said those words.',
      'I want to know he is okay': 'He is okay enough to say what he said. You can wish him well from here, not from his page.',
      'I want him to see I am okay': 'The proof is in your days, not in his view count. You do not need an audience to heal.',
      'Unfinished feelings': 'Feelings finish in you, not in him. Write them in the check-in, not in his inbox.',
      Habit: 'A habit is a loop, and you just broke it by stopping here.',
      'I am bored or lonely': 'That is real. Looking at him will not fix it. A game or a message to a friend will.',
      'I want to be proven right': 'You do not need to win. You only need to be free.',
      'I am angry': 'Anger is energy. Spend it on a walk, not on a screen about him.',
    }[r] || '';
  }
  $('#hurtOpen').addEventListener('click', () => { const h = $('#hurtEdit'); h.hidden = !h.hidden; if (!h.hidden) $('#hurtText').focus(); });
  $('#hurtSave').addEventListener('click', async () => {
    const words = $('#hurtText').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 200));
    await set('hurtWords', words);
    renderWords();
  });
  $('#checkGo').addEventListener('click', startSwipe);

  // ---------- stage 2: flick him out of your mind ----------
  const scale = () => Math.max(0.28, 1 - flicks * 0.16);
  function setCalm() { stage.style.setProperty('--calm', String(Math.min(1, flicks / NEEDED))); }
  function placeHome(animate) {
    token.style.transition = animate && !reduced() ? 'transform .45s cubic-bezier(.3,1.4,.5,1), opacity .4s' : 'none';
    token.style.transform = `translate(0px, 0px) scale(${scale()})`;
    token.style.opacity = String(Math.max(0.3, 1 - flicks * 0.15));
  }
  function startSwipe() {
    flicks = 0; busy = false;
    $('#flickPips').replaceChildren(...Array.from({ length: NEEDED }, () => { const i = document.createElement('i'); return i; }));
    $('#flickNote').textContent = 'Swipe him out of your mind. Flick hard, away from you.';
    token.hidden = false; token.querySelector('.him-badge').textContent = KINDS[kind].icon;
    stage.classList.remove('empty'); setCalm(); placeHome(false);
    show('swipe');
    token.focus({ preventScroll: true });
  }
  async function flick(dx, dy) {
    if (busy) return;
    busy = true;
    flicks++;
    navigator.vibrate?.(15);
    const len = Math.hypot(dx, dy) || 1, far = Math.max(stage.clientWidth, stage.clientHeight) * 1.1;
    const tx = (dx / len) * far, ty = (dy / len) * far;
    [...$('#flickPips').children].forEach((p, i) => p.classList.toggle('on', i < flicks));
    setCalm();
    stage.classList.add('hit'); setTimeout(() => stage.classList.remove('hit'), 220);
    puff(dx, dy);
    const msgs = ['Gone. Notice the space he left.', 'Again. He gets smaller each time.', 'Good. He is fading.', 'Almost. Feel how quiet it is getting.'];
    if (flicks < NEEDED) $('#flickNote').textContent = msgs[flicks - 1];
    if (!reduced()) {
      await token.animate([
        { transform: token.style.transform || 'translate(0,0)', opacity: token.style.opacity || 1 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${dx > 0 ? 540 : -540}deg) scale(.12)`, opacity: 0 },
      ], { duration: 440, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).finished.catch(() => {});
      token.getAnimations().forEach((a) => a.cancel());
    }
    if (flicks >= NEEDED) { vanish(); return; }
    // he drifts back from a random edge, smaller and fainter
    const a = Math.random() * 6.283, fx = Math.cos(a) * far * 0.6, fy = Math.sin(a) * far * 0.6;
    token.style.transition = 'none'; token.style.transform = `translate(${fx}px, ${fy}px) scale(.1)`; token.style.opacity = '0';
    void token.offsetWidth;
    await new Promise((r) => setTimeout(r, reduced() ? 50 : 450));
    placeHome(true);
    setTimeout(() => { busy = false; }, reduced() ? 0 : 200);
  }
  function puff(dx, dy) {
    if (reduced()) return;
    const r = stage.getBoundingClientRect();
    for (let k = 0; k < 14; k++) {
      const p = document.createElement('i'); p.className = 'puff';
      const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6, d = 50 + Math.random() * 70;
      p.style.cssText = `left:${r.width / 2}px;top:${r.height / 2}px;--x:${Math.cos(ang) * d}px;--y:${Math.sin(ang) * d}px`;
      stage.append(p); setTimeout(() => p.remove(), 700);
    }
  }
  function vanish() {
    token.hidden = true;
    stage.classList.add('empty');
    $('#flickNote').textContent = 'He is not here anymore.';
    confetti();
    navigator.vibrate?.([20, 40, 20]);
    setTimeout(async () => {
      await set('checkResisted', (Number(get('checkResisted')) || 0) + 1);
      onGames?.update?.();
      $('#calmCount').textContent = `That is ${Number(get('checkResisted'))} ${Number(get('checkResisted')) === 1 ? 'time' : 'times'} you chose not to look.`;
      show('calm');
    }, reduced() ? 300 : 1500);
  }

  // dragging and flicking
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
    const vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt, speed = Math.hypot(vx, vy);   // px per ms
    const dist = Math.hypot(d.dx, d.dy);
    if (dist < 8) { wobble(); return; }                                                  // a tap is not a flick
    if (speed > 0.6 || dist > 110) flick(d.dx || vx, d.dy || vy);
    else { placeHome(true); $('#flickNote').textContent = 'Harder. Flick him away, do not just move him.'; }
  };
  token.addEventListener('pointerup', release);
  token.addEventListener('pointercancel', release);
  function wobble() {
    if (reduced()) return;
    token.animate([{ transform: `translate(0,0) scale(${scale()}) rotate(0)` }, { transform: `translate(-8px,0) scale(${scale()}) rotate(-6deg)` }, { transform: `translate(8px,0) scale(${scale()}) rotate(6deg)` }, { transform: `translate(0,0) scale(${scale()}) rotate(0)` }], { duration: 300 });
    $('#flickNote').textContent = 'Do not tap him. Swipe him away.';
  }
  token.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flick(Math.random() < 0.5 ? -1 : 1, -0.4); } });
  $('#pushBtn').addEventListener('click', () => flick(Math.random() < 0.5 ? -1 : 1, (Math.random() - 0.5)));

  // ---------- stage 3 + shell ----------
  $('#calmDone').addEventListener('click', () => dlg.close());
  $('#calmGame').addEventListener('click', () => { dlg.close(); onGames?.open?.('menu'); });
  $('#checkClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { opener?.focus?.(); token.getAnimations().forEach((a) => a.cancel()); });

  function open(which) {
    opener = document.activeElement;
    kind = KINDS[which] ? which : 'account';
    picked = new Set();
    $('#checkLine').textContent = KINDS[kind].line;
    $('#checkWhat').textContent = KINDS[kind].what;
    $('#reasonText').value = '';
    $('#reasonReply').textContent = '';
    renderWords(); renderReasons();
    show('truth');
    if (!dlg.open) dlg.showModal();
  }
  return { open };
}
