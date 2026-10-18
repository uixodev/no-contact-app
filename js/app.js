import * as db from './db.js';
import { createRescue } from './rescue.js';
import { computeStats, buildCalendar, urgeStats, weekStrip, insights, WEEKDAYS, splitElapsed, formatElapsed, openStreak, longestOpenStreak, toTimestamp, toKey, fromKey, MILESTONES } from './streaks.js';
import { TAGS, WINS, ENERGY, labelOf } from './tags.js';
import { lineChart } from './charts.js';
import { confetti } from './fx.js';
import { createDays } from './days.js';
import { createGames } from './games.js';
import { createCheckup } from './checkup.js';
import { setupPressFeedback } from './press.js';

const $ = (sel) => document.querySelector(sel);
const fmtMoment = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const MOOD_WORDS = ['', 'Very low', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_EMOJI = ['🙂', '😞', '😕', '😐', '🙂', '😄'];
const RING_LEN = 2 * Math.PI * 112; // matches the r="112" progress ring around the orb

const NOTE_MAX = 2000;                // longest note you can write
const LOG_PAGE = 14;                 // entries shown at a time in Recent entries
const LOG_FILTERS = [['all', 'All'], ['held', 'Held'], ['contact', 'Contact'], ['notes', 'With notes']];
const PEAK_URGE = 8;                 // urge level (0–10) treated as a "peak"

// anchorTs = the exact moment the current No Contact run began (ms); days = whole days elapsed since then.
const state = { settings: {}, checkins: [], urges: [], editing: null, days: 0, anchorTs: null, logFilter: 'all', logLimit: LOG_PAGE, returnToEntry: null };

// The guided "urgent help" flow lives in rescue.js; it gets what it needs from here.
const games = createGames();
const checkup = createCheckup({
  get: (k) => state.settings[k],
  set: async (k, v) => { await db.setSetting(k, v); state.settings[k] = v; },
  onGames: { open: (g) => games.open(g) },
  urges: {
    all: () => state.urges,
    save: async (rec) => { await db.saveUrge(rec); const i = state.urges.findIndex((u) => u.at === rec.at); if (i >= 0) state.urges[i] = rec; },
    remove: async (at) => { await db.deleteUrge(at); state.urges = state.urges.filter((u) => u.at !== at); render(); },
  },
});
const daysPlay = createDays(() => ({ days: state.days, anchorTs: state.anchorTs ?? Date.now() }));
const rescue = createRescue({
  settings: () => state.settings,
  anchorTs: () => state.anchorTs,
  toast: (msg) => toast(msg),
  urgesCount: () => state.urges.length,
  saveUrge: async (rec) => { await db.saveUrge(rec); state.urges.push(rec); render(); },
  openCheckin: (level) => openCheckinWithUrge(level),
  canKeepNote: () => { const f = $('#checkinForm'); return !f.hidden && f.date.value === toKey(); },
  keepInNote: (text) => { const f = $('#checkinForm'); f.note.value = f.note.value ? `${f.note.value}\n\n${text}` : text; f.dataset.dirty = '1'; },
});

/* ---------------- Loading screen ---------------- */
const SPLASH_MIN_MS = 1700; // long enough to enjoy the animation, counted from when the page started loading
const splashEl = document.querySelector('#splash');
let splashSeen = false;
try { splashSeen = sessionStorage.getItem('nc-splash') === '1'; } catch {}
if (splashSeen) removeSplash();                // reloads in the same session (e.g. after an update) skip it
else try { sessionStorage.setItem('nc-splash', '1'); } catch {}

function removeSplash() {
  splashEl?.setAttribute('hidden', '');
  document.body.classList.remove('splashing');
}
function hideSplash({ immediately = false } = {}) {
  if (!splashEl || splashEl.hidden) return;
  const wait = immediately ? 0 : Math.max(0, SPLASH_MIN_MS - performance.now());
  setTimeout(() => {
    splashEl.classList.add('out');
    setTimeout(removeSplash, 600);
  }, wait);
}

/* ---------------- Sections (bottom menu) ---------------- */
const TABS = ['home', 'checkin', 'progress', 'help'];
let currentTab = 'home';
const tabFromHash = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');

function showTab(name, { scroll = true } = {}) {
  if (!TABS.includes(name)) name = 'home';
  currentTab = name;
  document.querySelectorAll('.page').forEach((pg) => { pg.hidden = pg.dataset.page !== name; });
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.tab === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  if (name === 'home') syncOrbit();
  if (scroll) scrollPage({ top: 0 });
}
/** Go to a section and keep the address bar (and the Back button) in step. */
function goTab(name) {
  showTab(name);
  if (location.hash !== `#${name}`) location.hash = name;
}

const pad2 = (n) => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const startTimeOf = (settings) => settings.startTime || '00:00'; // older data has no time: midnight, as before

/* ---------------- Boot ---------------- */
init().catch((err) => {
  console.error(err);
  $('#loading').hidden = true;
  hideSplash({ immediately: true });
  toast(`Couldn't open local storage: ${err.message}`);
});

async function init() {
  setupPressFeedback();
  fillMascots();
  buildPicks();
  bindUI();
  showTab(tabFromHash(), { scroll: false });
  await db.openDB();
  await load();
  await recordOpen();
  $('#loading').hidden = true;
  render();
  registerServiceWorker();
  setupInstall();
  setupNetwork();
  db.requestPersistence().then(updateStorageInfo);

  const params = new URLSearchParams(location.search);
  const action = params.get('action');            // home-screen shortcuts
  if (action === 'checkin') { goTab('checkin'); $('#checkinForm input[name="status"]')?.focus(); }
  else if (action === 'help') goTab('help');
  else if (action === 'urgent') { goTab('help'); rescue.open(); }
  window.__ncReady = true;                        // tells the loading-screen watchdog that startup worked
  document.getElementById('fixit')?.remove();
  hideSplash();

  // Live clock: tick once a second, aligned to the wall-clock second so it never drifts.
  // Also re-renders when the date changes, and catches up when the app returns to the foreground.
  let lastDay = toKey();
  const tick = () => {
    if (toKey() !== lastDay) { lastDay = toKey(); recordOpen().then(render); }
    updateClock();
    rescue.tick();
  };
  const loop = () => { tick(); setTimeout(loop, 1000 - (Date.now() % 1000) + 5); };
  loop();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncOrbit(); tick(); } });
}

/**
 * Remember that the app was opened today. This is what the streak counts: only opening the app, never what you wrote
 * in a check-in. The first time, days that already have a check-in count as opened so nobody starts from zero.
 */
async function recordOpen() {
  const today = toKey();
  const have = state.settings.openDays;
  if (Array.isArray(have) && have.includes(today)) return;
  const base = Array.isArray(have) ? have : [...new Set(state.checkins.map((c) => c.date))].filter((d) => d <= today);
  const next = [...new Set([...base, today])].sort();
  await db.setSetting('openDays', next);
  state.settings.openDays = next;
}

async function load() {
  const [settings, checkins, urges] = await Promise.all([db.getAllSettings(), db.getAllCheckins(), db.getAllUrges()]);
  state.settings = settings;
  state.checkins = checkins;
  state.urges = urges;
}

function fillMascots() {
  const mascot = $('#mascotTpl'), logo = $('#logoTpl');
  document.querySelectorAll('.mascot-slot').forEach((el) => el.replaceChildren(mascot.content.cloneNode(true)));
  document.querySelectorAll('.logo-slot').forEach((el) => el.replaceChildren(logo.content.cloneNode(true)));
}

/* ---------------- Render ---------------- */
function render() {
  const { startDate } = state.settings;
  document.body.dataset.view = startDate ? 'app' : 'onboarding';
  $('#onboarding').hidden = !!startDate;
  $('#dashboard').hidden = !startDate;
  if (!startDate) {
    const f = $('#onboardForm');
    f.startDate.max = toKey();
    if (!f.startDate.value) f.startDate.value = toKey();
    if (!f.startTime.value) f.startTime.value = nowTime();
    return;
  }
  const today = toKey();
  const goal = Number(state.settings.goal) || 90;
  const s = computeStats(state.checkins, startDate, today, { startTime: startTimeOf(state.settings) });

  // Hero: the calm orb
  state.anchorTs = s.anchorTs;
  state.days = s.noContactDays;
  updateClock();
  $('#daysCount').textContent = s.noContactDays;
  $('#daysUnit').textContent = s.noContactDays === 1 ? 'day' : 'days';
  $('#sinceLabel').textContent = `Since ${fmtMoment.format(new Date(s.anchorTs))}`;
  const reason = state.settings.reason?.trim();
  $('#reasonQuote').hidden = !reason;
  $('#reasonQuote').textContent = reason ? `“${reason}”` : '';

  const pct = Math.min(1, s.elapsedDays / goal);
  const ring = $('#ringFill');
  ring.style.strokeDasharray = String(RING_LEN);
  ring.style.strokeDashoffset = String(RING_LEN * (1 - pct));
  $('#goalPct').textContent = `${Math.round(pct * 100)}%`;
  $('#goalLabel').textContent = `of ${goal} days`;

  if (s.nextMilestone) {
    const span = s.nextMilestone - s.prevMilestone;
    const prog = Math.min(100, Math.max(0, ((s.elapsedDays - s.prevMilestone) / span) * 100));
    const left = Math.max(1, Math.ceil(s.nextMilestone - s.elapsedDays));
    $('#nextMilestone').textContent = `${s.nextMilestone} days · ${left} to go`;
    $('#milestoneFill').style.width = `${prog}%`;
    $('#milestoneBar').setAttribute('aria-valuenow', Math.round(prog));
  } else {
    $('#nextMilestone').textContent = 'Every milestone reached';
    $('#milestoneFill').style.width = '100%';
  }

  // Stats
  const inApp = openStreak(state.settings.openDays, today);
  $('#streakChipNum').textContent = inApp;
  $('#statLongest').textContent = s.longestRun;
  $('#statStreak').textContent = inApp;
  $('#statTotal').textContent = s.totalCheckins;
  $('#statTotalSub').textContent = `${s.heldCount} held · ${s.contactCount} contact`;
  $('#statMood').textContent = s.avgMood7 == null ? '—' : s.avgMood7.toFixed(1);
  $('#statMoodIco').textContent = s.avgMood7 == null ? '🙂' : MOOD_EMOJI[Math.round(s.avgMood7)];
  $('#statUrge').textContent = s.avgUrge7 == null ? 'avg urge —' : `avg urge ${s.avgUrge7.toFixed(1)}/10`;
  const u = urgeStats(state.urges);
  $('#statUrgesSurvived').textContent = u.survived;
  $('#statRelief').textContent = u.avgRelief == null ? '—' : `${u.avgRelief >= 0 ? '↓' : '↑'} ${Math.abs(u.avgRelief).toFixed(1)}`;
  $('#statReliefSub').textContent = u.avgRelief == null ? 'finish urgent help to see' : u.avgRelief >= 0 ? 'urge points dropped' : 'urge points higher';

  renderCheckin(today);
  renderToday(today);
  checkup.refresh();
  renderWeek(today, s);
  renderInsights();
  renderCalendar(today);
  renderMilestones(s);
  renderLog();
  const rem = $('#reminderTime');
  if (!rem.dataset.touched) rem.value = state.settings.reminderTime || '21:00';
  syncOrbit();
}

/** Live hours : minutes : seconds under the orb, plus the running total of seconds. */
function updateClock() {
  if (state.anchorTs == null || !state.settings.startDate) return;
  const parts = splitElapsed(Date.now() - state.anchorTs);
  if (parts.days !== state.days) { render(); return; } // crossed a 24-hour mark: refresh days, ring and milestones
  $('#clkH').textContent = parts.h;
  $('#clkM').textContent = parts.m;
  $('#clkS').textContent = parts.s;
  $('#totalSecs').textContent = parts.totalSeconds.toLocaleString('en-GB');
}

/** The bead circles once a minute; line it up with the real seconds (CSS keeps it gliding between syncs). */
function syncOrbit() {
  $('#orbit').style.animationDelay = `-${((Date.now() % 60000) / 1000).toFixed(2)}s`;
}

/** Home's "Today" card and the red dot on the Check-in tab. */
function renderToday(today) {
  const entry = state.checkins.find((c) => c.date === today);
  $('#checkinDot').hidden = !!entry;
  document.querySelector('.today-card').classList.toggle('done', !!entry);
  $('#todayIco').textContent = entry ? '✓' : '📝';
  $('#todayText').textContent = !entry
    ? 'You haven’t checked in yet. It takes about ten seconds.'
    : `${entry.status === 'held' ? 'You held No Contact today. Nice work.' : 'You logged contact today. Tomorrow is a fresh start.'}`;
  $('#todayBtn').textContent = entry ? 'See today’s check-in' : 'Check in now';
}

/** "This week": the last 7 days as tappable tiles, plus the streak. */
function renderWeek(today, s) {
  const icons = { held: '✓', contact: '✕', missed: '–', pending: '+', before: '' };
  $('#weekStrip').replaceChildren(...weekStrip(state.checkins, state.settings.startDate, today).map((d) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wk'; b.dataset.state = d.state; b.disabled = d.state === 'before';
    if (d.isToday) b.dataset.today = 'true';
    const word = { held: 'held No Contact', contact: 'had contact', missed: 'no entry', pending: 'not checked in yet', before: 'before you started' }[d.state];
    b.setAttribute('aria-label', `${WEEKDAYS[d.weekday]} ${fmtShort.format(fromKey(d.date))}: ${word}`);
    b.innerHTML = '<span class="wk-day"></span><span class="wk-num"></span><span class="wk-ico" aria-hidden="true"></span>';
    b.querySelector('.wk-day').textContent = d.isToday ? 'Today' : WEEKDAYS[d.weekday].slice(0, 3);
    b.querySelector('.wk-num').textContent = fromKey(d.date).getDate();
    b.querySelector('.wk-ico').textContent = icons[d.state];
    b.addEventListener('click', () => startEdit(d.date));
    return b;
  }));
  const inApp = openStreak(state.settings.openDays, today), bestInApp = longestOpenStreak(state.settings.openDays);
  $('#weekStreak').textContent = `🔥 ${inApp} ${inApp === 1 ? 'day' : 'days'} in the app${bestInApp > inApp ? ` · best ${bestInApp}` : ''}`;
}

/** The picked chips, text and note of an entry as HTML, shared by the "Done" card and the reading view. */
/** A trigger's label; "Something else" shows the words you wrote, if any. */
function triggerLabel(entry, t, short = true) {
  const label = labelOf(TAGS, t);
  return t === 'other' && entry.triggerOther && short ? `${label}: ${entry.triggerOther.length > 40 ? `${entry.triggerOther.slice(0, 40)}…` : entry.triggerOther}` : label;
}

function detailRows(entry, { note = true } = {}) {
  const rows = [];
  const chips = (list, items) => items.length ? `<div class="chip-line">${items.map((v) => `<span class="mini-chip">${esc(labelOf(list, v))}</span>`).join('')}</div>` : '';
  if (entry.triggers?.length) rows.push(`<p class="detail-label">Triggers</p>${chips(TAGS, entry.triggers)}`);
  if (entry.triggerOther && entry.triggers?.includes('other')) rows.push(`<p class="detail-label">What it was</p><p class="detail-text note-text">✨ ${esc(entry.triggerOther)}</p>`);
  if (entry.wins?.length) rows.push(`<p class="detail-label">Wins</p>${chips(WINS, entry.wins)}`);
  const body = [entry.sleep != null ? `😴 ${entry.sleep >= 9 ? '9h+' : entry.sleep <= 4 ? '≤4h' : `${entry.sleep}h`} sleep` : '', entry.energy != null ? `${ENERGY[entry.energy - 1][1]} ${ENERGY[entry.energy - 1][2]} energy` : ''].filter(Boolean);
  if (body.length) rows.push(`<p class="detail-label">Body</p><div class="chip-line">${body.map((t) => `<span class="mini-chip">${esc(t)}</span>`).join('')}</div>`);
  if (entry.good) rows.push(`<p class="detail-label">One good thing</p><p class="detail-text">🌟 ${esc(entry.good)}</p>`);
  if (entry.tomorrow) rows.push(`<p class="detail-label">Tomorrow I will…</p><p class="detail-text">➡️ ${esc(entry.tomorrow)}</p>`);
  if (note && entry.note) rows.push(`<p class="detail-label">Note</p><p class="detail-text note-text">${esc(entry.note)}</p>`);
  return rows;
}

/** What you picked and wrote today, shown under the "Done" banner. */
function renderDoneDetails(entry) {
  const box = $('#doneDetails');
  const rows = detailRows(entry);
  box.innerHTML = rows.join('');
  box.hidden = rows.length === 0;
}
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Patterns: tiles (hardest day, best mood day, top trigger, sleep, wins) and two small charts. */
function renderInsights() {
  const ins = insights(state.checkins, state.urges);
  const show = ins.n >= 3;
  $('#insHint').hidden = show;
  $('#insBody').hidden = !show;
  if (!show) { $('#insHint').textContent = `Check in on ${3 - ins.n} more ${3 - ins.n === 1 ? 'day' : 'days'} and your patterns will show up here.`; return; }

  const tile = (ico, label, value, sub) => `<div class="insight"><span class="insight-ico" aria-hidden="true">${ico}</span><span class="insight-label">${esc(label)}</span><strong class="insight-value">${esc(value)}</strong><span class="insight-sub">${esc(sub)}</span></div>`;
  const wd = (d) => WEEKDAYS[d.day];
  $('#insTiles').innerHTML = [
    ins.hardestDay ? tile('🌊', 'Hardest day', wd(ins.hardestDay), `avg urge ${ins.hardestDay.avg.toFixed(1)}/10`) : tile('🌊', 'Hardest day', '—', 'needs a few more days'),
    ins.bestMoodDay ? tile('☀️', 'Best mood day', wd(ins.bestMoodDay), `avg mood ${ins.bestMoodDay.avg.toFixed(1)}/5`) : tile('☀️', 'Best mood day', '—', 'needs a few more days'),
    ins.topTrigger ? tile('🌪️', 'Top trigger', labelOf(TAGS, ins.topTrigger.key).replace(/^\S+\s/, ''), `${ins.topTrigger.count} times`) : tile('🌪️', 'Top trigger', '—', 'tag triggers to see'),
  ].join('');

  const fmtD = (d) => fmtShort.format(fromKey(d)).replace(/^\w+,?\s/, '');
  const moodWord = (v) => MOOD_WORDS[Math.round(v)] ?? '';
  const when = (d) => fmtShort.format(fromKey(d));
  $('#chartMood').replaceChildren(lineChart({
    title: 'Mood', caption: `last ${ins.series.length} check-ins`, colorVar: '--chart-mood', min: 1, max: 5, ticks: [1, 3, 5], fmtDate: fmtD,
    points: ins.series.map((p) => ({ date: p.date, value: p.mood, label: `${when(p.date)} · mood ${p.mood} (${moodWord(p.mood)})` })),
  }));
  $('#chartUrge').replaceChildren(lineChart({
    title: 'Urge to reach out', caption: `last ${ins.series.length} check-ins`, colorVar: '--chart-urge', min: 0, max: 10, ticks: [0, 5, 10], fmtDate: fmtD,
    points: ins.series.map((p) => ({ date: p.date, value: p.urge, label: `${when(p.date)} · urge ${p.urge}/10` })),
  }));
  $('#insTable').innerHTML = `<thead><tr><th>Day</th><th>Mood</th><th>Urge</th></tr></thead><tbody>${ins.series.map((p) => `<tr><td>${esc(when(p.date))}</td><td>${p.mood ?? '—'}</td><td>${p.urge ?? '—'}</td></tr>`).join('')}</tbody>`;
}

function renderCheckin(today) {
  const todayEntry = state.checkins.find((c) => c.date === today);
  const editing = state.editing;
  $('#checkinBadge').hidden = !todayEntry;
  $('#checkinDone').hidden = !todayEntry;
  $('#checkinForm').hidden = editing ? false : !!todayEntry; // while editing, the form is in the pop-up
  $('#inlineEditingNote').hidden = !(editing && !todayEntry);
  $('#cancelEditBtn').hidden = !editing;
  $('#dateField').hidden = !!editing;                         // the date names the entry, so it can't change here
  $('#saveBtn').textContent = editing ? 'Save changes' : 'Save check-in';
  $('#checkinTitle').textContent = "Today's check-in";

  if (todayEntry) {
    const word = todayEntry.status === 'held'
      ? 'You held No Contact today.'
      : `You logged contact today${todayEntry.time ? ` at ${todayEntry.time}` : ''}. Tomorrow is a fresh start.`;
    $('#checkinSummary').textContent = `${word} Mood: ${MOOD_WORDS[todayEntry.mood]} · Urge ${todayEntry.urge}/10.`;
    renderDoneDetails(todayEntry);
  }
  const f = $('#checkinForm');
  f.date.max = today;
  f.date.min = state.settings.startDate;
  if (!editing && !f.dataset.dirty) fillForm({ date: today, status: 'held', mood: 3, urge: 0, note: '' });
  syncContactRow();
}

function fillForm(entry) {
  const f = $('#checkinForm');
  f.date.value = entry.date;
  f.querySelector(`input[name="status"][value="${entry.status}"]`).checked = true;
  f.querySelector(`input[name="mood"][value="${entry.mood ?? 3}"]`).checked = true;
  f.urge.value = entry.urge ?? 0;
  $('#urgeOut').textContent = f.urge.value;
  f.note.value = entry.note ?? '';
  f.time.value = entry.time ?? (entry.status === 'contact' ? '00:00' : ''); // old contact entries had no time: midnight
  const setGroup = (name, values) => f.querySelectorAll(`input[name="${name}"]`).forEach((i) => { i.checked = values.includes(i.value); });
  setGroup('trigger', entry.triggers ?? []);
  f.triggerOther.value = entry.triggerOther ?? '';
  $('#triggerOtherCount').textContent = f.triggerOther.value.length;
  syncTriggerOther();
  $('#noteCount').textContent = f.note.value.length;
  updateMoreCounts();
  syncContactRow();
  updateUrgeAlert();
  autosizeAll();
}

/** Let a text box grow with what you write (up to 60% of the screen), then scroll inside. */
function autosize(el) {
  if (!el || el.getClientRects().length === 0) return; // not visible (e.g. inside a closed section)
  el.style.height = 'auto';
  const chrome = el.offsetHeight - el.clientHeight;
  el.style.height = `${Math.min(el.scrollHeight + chrome, Math.round(innerHeight * 0.6))}px`;
}
function autosizeAll() { document.querySelectorAll('#checkinForm textarea.autosize').forEach(autosize); } // a function, so it is ready when startup wires the form

/** The "What was it?" box shows only while "Something else" is picked. */
function syncTriggerOther() {
  const on = !!$('#checkinForm input[name="trigger"][value="other"]')?.checked;
  $('#triggerOtherField').hidden = !on;
  if (on) requestAnimationFrame(() => autosize($('#checkinForm').triggerOther));
}

/** The little "2 selected" badges on the collapsible sections. */
function updateMoreCounts() {
  const f = $('#checkinForm');
  const n = (name) => f.querySelectorAll(`input[name="${name}"]:checked`).length;
  const set = (id, count, word) => { const el = $(id); el.textContent = count ? `${count} ${word}` : ''; el.hidden = !count; };
  set('#triggerCount', n('trigger'), 'selected');
}

/** Build the trigger chips from the shared list. */
function buildPicks() {
  const pick = (type, name, value, text) => {
    const label = document.createElement('label'); label.className = 'pick';
    const input = Object.assign(document.createElement('input'), { type, name, value });
    const span = document.createElement('span'); span.textContent = text;
    label.append(input, span); return label;
  };
  $('#triggerPicks').replaceChildren(...TAGS.map(([v, t]) => pick('checkbox', 'trigger', v, t)));
}

/** Show the "what time was the contact?" field only when logging contact. */
function syncContactRow() {
  const f = $('#checkinForm');
  const contact = f.elements.status.value === 'contact';
  $('#contactTimeRow').hidden = !contact;
  f.time.required = contact;
  $('#quickHeldBtn').hidden = contact || !!state.editing; // one-tap save only for a plain "held" day
}

function onStatusChange() {
  const f = $('#checkinForm');
  if (f.elements.status.value === 'contact' && !f.time.value) {
    f.time.value = f.date.value === toKey() ? nowTime() : '12:00';
  }
  syncContactRow();
}

function renderCalendar(today) {
  const days = buildCalendar(state.checkins, state.settings.startDate, today);
  const cal = $('#calendar');
  cal.replaceChildren(...days.map((d) => {
    const clickable = d.state !== 'future' && d.date >= state.settings.startDate;
    const el = document.createElement(clickable ? 'button' : 'span');
    el.className = 'cal-cell';
    el.dataset.state = d.state;
    if (d.date === today) el.dataset.today = 'true';
    const label = `${fmtShort.format(fromKey(d.date))}: ${
      { held: 'held No Contact', contact: 'had contact', missed: 'no entry', empty: 'before start', future: 'upcoming' }[d.state]}`;
    el.title = label;
    el.setAttribute('aria-label', label);
    if (clickable) { el.type = 'button'; el.addEventListener('click', () => startEdit(d.date)); }
    return el;
  }));
}

function renderMilestones(s) {
  $('#milestones').replaceChildren(...MILESTONES.map((m) => {
    const li = document.createElement('li');
    if (s.milestonesReached.includes(m)) li.className = 'reached';
    else if (m === s.nextMilestone) li.className = 'current';
    li.innerHTML = `<strong>${m}</strong>${m === 1 ? 'day' : 'days'}`;
    li.setAttribute('aria-label', `${m} days${li.className === 'reached' ? ', reached' : ''}`);
    return li;
  }));
}

const logMatches = (c) => state.logFilter === 'all' || (state.logFilter === 'notes' ? !!(c.note || c.good) : c.status === state.logFilter);
/** Entries for the current filter, newest first (what Recent entries lists and the reading view pages through). */
const currentLogList = () => [...state.checkins].reverse().filter(logMatches);

function renderLog() {
  const box = $('#logFilters');
  if (!box.children.length) {
    box.replaceChildren(...LOG_FILTERS.map(([key, label]) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip chip-sm', textContent: label });
      b.dataset.filter = key;
      b.addEventListener('click', () => { state.logFilter = key; state.logLimit = LOG_PAGE; renderLog(); });
      return b;
    }));
  }
  [...box.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.logFilter)));

  const all = currentLogList();
  const recent = all.slice(0, state.logLimit);
  $('#logEmpty').hidden = recent.length > 0;
  $('#logEmptyTitle').textContent = state.checkins.length ? 'Nothing matches that filter.' : 'No check-ins yet.';
  $('#logEmptyText').textContent = state.checkins.length ? 'Try another filter above.' : 'Your first one takes about ten seconds.';
  $('#logMore').hidden = all.length <= state.logLimit;
  $('#logMore').textContent = `Show ${Math.min(LOG_PAGE, all.length - state.logLimit)} more`;
  $('#log').replaceChildren(...recent.map((c) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="log-open" type="button">
        <span class="log-dot ${c.status}" aria-hidden="true"></span>
        <span class="log-main">
          <span class="log-title"></span>
          <span class="log-meta"></span>
          ${c.good ? '<span class="log-good"></span>' : ''}
          ${c.note ? '<span class="log-note"></span>' : ''}
        </span>
        <span class="log-chev" aria-hidden="true">›</span>
      </button>`;
    const status = c.status === 'held' ? 'Held No Contact' : `Had contact${c.time ? ` at ${c.time}` : ''}`;
    const title = `${fmtShort.format(fromKey(c.date))} · ${status}`;
    li.querySelector('.log-dot').textContent = c.status === 'held' ? '✓' : '✕';
    li.querySelector('.log-title').textContent = c.status === 'held' ? fmtShort.format(fromKey(c.date)) : title; // the green ✓ already says "held"
    const meta = [`${MOOD_EMOJI[c.mood] ?? ''} ${MOOD_WORDS[c.mood] ?? '—'}`, `Urge ${c.urge}/10`];
    if (c.triggers?.length) meta.push(c.triggers.map((t) => triggerLabel(c, t)).join(', '));
    li.querySelector('.log-meta').textContent = meta.join(' · ');
    if (c.good) li.querySelector('.log-good').textContent = `🌟 ${c.good}`;
    if (c.note) li.querySelector('.log-note').textContent = c.note;
    const open = li.querySelector('.log-open');
    open.setAttribute('aria-label', `Read the entry for ${title}${c.note ? ', with a note' : ''}`);
    open.addEventListener('click', () => openEntry(c.date));
    return li;
  }));
}

/* ---------------- Reading a past entry ---------------- */
let entryList = [];
let entryIdx = -1;

function openEntry(date) {
  entryList = currentLogList();
  entryIdx = entryList.findIndex((c) => c.date === date);
  if (entryIdx < 0) { entryList = [...state.checkins].reverse(); entryIdx = entryList.findIndex((c) => c.date === date); }
  if (entryIdx < 0) return;
  renderEntry();
  $('#entryDialog').showModal();
}

function renderEntry() {
  const c = entryList[entryIdx];
  const rows = detailRows(c, { note: false });
  $('#entryBody').innerHTML = `
    <h2 class="entry-date" id="entryTitle" tabindex="-1"></h2>
    <span class="entry-status ${c.status}"></span>
    <section class="entry-note-card" aria-label="Note">
      <p class="detail-label">Note</p>
      ${c.note ? `<p class="detail-text note-text">${esc(c.note)}</p>` : '<p class="entry-empty">No note for this day.</p>'}
    </section>
    <div class="entry-stats">
      <div class="entry-stat"><span>Mood</span><strong>${MOOD_EMOJI[c.mood] ?? ''} ${esc(MOOD_WORDS[c.mood] ?? '—')}</strong></div>
      <div class="entry-stat"><span>Urge to reach out</span><strong>${esc(c.urge)}/10</strong></div>
    </div>
    ${rows.length ? `<div class="done-details">${rows.join('')}</div>` : ''}`;
  $('#entryTitle').textContent = fmtDay.format(fromKey(c.date));
  $('#entryBody .entry-status').textContent = c.status === 'held' ? '✓ Held No Contact' : `✕ Had contact${c.time ? ` at ${c.time}` : ''}`;
  $('#entryPos').textContent = `${entryIdx + 1} of ${entryList.length}`;
  $('#entryNewer').disabled = entryIdx === 0;
  $('#entryOlder').disabled = entryIdx === entryList.length - 1;
  $('#entryBody').scrollTop = 0;
}

function stepEntry(delta) {
  const next = entryIdx + delta;
  if (next < 0 || next >= entryList.length) return;
  entryIdx = next;
  renderEntry();
  $('#entryTitle').focus({ preventScroll: true });
}

/** Show the "that's a peak" nudge when the urge slider is high. */
function updateUrgeAlert() {
  $('#urgeAlert').hidden = Number($('#urgeInput').value) < PEAK_URGE;
}

/**
 * Take the user to today's check-in with the urge raised to (at least) the given level so it gets logged.
 * If today's form is already open we keep whatever they've typed; we only reset it when today
 * was already saved and has to be reopened for editing.
 */
function openCheckinWithUrge(level = PEAK_URGE) {
  goTab('checkin');
  const today = toKey();
  const f = $('#checkinForm');
  if (f.hidden || f.date.value !== today) startEdit(today);
  else f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const urge = Math.max(Number(f.urge.value) || 0, level);
  f.urge.value = urge;
  $('#urgeOut').textContent = urge;
  f.dataset.dirty = '1';
  updateUrgeAlert();
}

/* ---------------- Actions ---------------- */
/** Edit (or add) the entry for a day in a pop-up window, using the same check-in form. */
function startEdit(date) {
  state.editing = date;
  const existing = state.checkins.find((c) => c.date === date);
  fillForm(existing ?? { date, status: 'held', mood: 3, urge: 0, note: '' });
  render();
  const dlg = $('#editDialog');
  $('#editBody').append($('#checkinForm'));                   // the very same form moves into the pop-up
  $('#checkinForm').hidden = false;
  $('#editTitle').textContent = date === toKey() && existing ? 'Edit today’s entry' : `${existing ? 'Edit' : 'Add'} ${fmtDay.format(fromKey(date))}`;
  if (!dlg.open) dlg.showModal();
  $('#editBody').scrollTop = 0;
  requestAnimationFrame(autosizeAll);                         // boxes are measurable once the pop-up is showing
}

/** Put the form back in the page. Safe to call more than once. */
function restoreForm() {
  const f = $('#checkinForm');
  if (f.parentElement !== $('#formSlot')) $('#formSlot').append(f);
}

/** Close the pop-up, asking first if there are unsaved changes. */
function requestCloseEdit() {
  const f = $('#checkinForm');
  if (f.dataset.dirty && !confirm('Discard your changes?')) return;
  $('#editDialog').close();
}

/** Runs whenever the pop-up closes (Save, Cancel, ✕ or Escape): tidy up and, if we came from the reading view, go back to it. */
function onEditClosed() {
  const f = $('#checkinForm');
  restoreForm();
  state.editing = null;
  delete f.dataset.dirty;
  render();
  const back = state.returnToEntry;
  state.returnToEntry = null;
  if (back && state.checkins.some((c) => c.date === back)) openEntry(back);
}

async function removeEntry(date) {
  if (!confirm(`Delete the entry for ${fmtShort.format(fromKey(date))}?`)) return false;
  const backup = state.checkins.find((c) => c.date === date);
  await db.deleteCheckin(date);
  await load(); render();
  toast('Entry deleted', 'Undo', async () => { await db.saveCheckin(backup); await load(); render(); });
  return true;
}

async function onCheckinSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const data = new FormData(f);
  const entry = {
    date: data.get('date'),
    status: data.get('status'),
    mood: Number(data.get('mood')),
    urge: Number(data.get('urge')),
    note: String(data.get('note') || '').trim(),
    time: data.get('status') === 'contact' ? String(data.get('time') || '') : '', // only contact moments need a time
    triggers: data.getAll('trigger'),
    triggerOther: data.getAll('trigger').includes('other') ? String(data.get('triggerOther') || '').trim() : '',
  };
  // wins, sleep, energy and the two reflection lines are no longer asked for, but never wipe them from an older entry
  const old = state.checkins.find((c) => c.date === entry.date);
  if (old) for (const k of ['wins', 'sleep', 'energy', 'good', 'tomorrow']) if (old[k] != null) entry[k] = old[k];
  if (entry.date > toKey()) return toast("You can't check in for a future date.");
  if (entry.date < state.settings.startDate) return toast('That date is before your start date.');
  if (entry.status === 'contact') {
    const ts = toTimestamp(entry.date, entry.time);
    if (ts > Date.now()) return toast("That time hasn't happened yet.");
    if (ts < toTimestamp(state.settings.startDate, startTimeOf(state.settings))) return toast('That moment is before your No Contact start.');
  }

  const before = computeStats(state.checkins, state.settings.startDate, toKey(), { startTime: startTimeOf(state.settings) });
  await db.saveCheckin(entry);
  delete f.dataset.dirty;
  await load();
  restoreForm();
  state.editing = null;
  if ($('#editDialog').open) $('#editDialog').close(); // onEditClosed() re-renders (and returns to the reading view if we came from it)
  render();
  const after = computeStats(state.checkins, state.settings.startDate, toKey(), { startTime: startTimeOf(state.settings) });

  if (entry.status === 'contact') toast('Logged. One moment doesn’t erase your progress — your longest run still counts.');
  else if (after.milestonesReached.length > before.milestonesReached.length) toast(`Milestone reached: ${after.milestonesReached.at(-1)} days. Be proud of that.`);
  else toast('Check-in saved');
  navigator.vibrate?.(15);
}

async function onOnboard(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const data = new FormData(f);
  const startDate = data.get('startDate');
  const startTime = data.get('startTime');
  if (toTimestamp(startDate, startTime) > Date.now()) return toast('That moment is in the future — pick now or earlier.');
  await db.setSetting('startDate', startDate);
  await db.setSetting('startTime', startTime);
  await db.setSetting('goal', Number(data.get('goal')));
  await db.setSetting('reason', String(data.get('reason') || '').trim());
  await load(); render();
  scrollPage({ top: 0 }); // start at the top, where the calm orb is
  toast('You’re all set. Check in once a day.');
}

function openSettings() {
  const f = $('#settingsForm');
  f.startDate.value = state.settings.startDate ?? toKey();
  f.startDate.max = toKey();
  f.startTime.value = startTimeOf(state.settings);
  f.startTime.setCustomValidity('');
  f.goal.value = state.settings.goal ?? 90;
  f.reason.value = state.settings.reason ?? '';
  f.friendName.value = state.settings.friendName ?? '';
  f.friendPhone.value = state.settings.friendPhone ?? '';
  $('#iosHint').hidden = !isIOS() || isStandalone();
  updateStorageInfo();
  $('#settingsDialog').showModal();
}

/** Block saving a start moment that hasn't happened yet, with a message shown inside the dialog. */
function onSettingsSubmit(e) {
  if (e.submitter?.value !== 'save') return;
  const f = e.currentTarget;
  f.startTime.setCustomValidity('');
  if (toTimestamp(f.startDate.value, f.startTime.value) > Date.now()) {
    f.startTime.setCustomValidity('That moment is in the future — pick now or earlier.');
    f.startTime.reportValidity();
    e.preventDefault();
  }
}

async function onSettingsClose() {
  const dlg = $('#settingsDialog');
  if (dlg.returnValue !== 'save') return;
  const f = $('#settingsForm');
  if (!f.startDate.value || !f.startTime.value || toTimestamp(f.startDate.value, f.startTime.value) > Date.now()) return toast('Start moment must be now or earlier.');
  await db.setSetting('startDate', f.startDate.value);
  await db.setSetting('startTime', f.startTime.value);
  await db.setSetting('goal', Math.max(1, Number(f.goal.value) || 90));
  await db.setSetting('reason', f.reason.value.trim());
  await db.setSetting('friendName', f.friendName.value.trim());
  await db.setSetting('friendPhone', f.friendPhone.value.trim());
  await load(); render();
  toast('Settings saved');
}

/** A repeating daily reminder as a calendar file: the most reliable nudge for an app with no server. */
async function downloadReminder() {
  const time = $('#reminderTime').value || '21:00';
  const [hh, mm] = time.split(':');
  const day = toKey().replaceAll('-', '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//No Contact Dude//Daily check-in//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:daily-checkin-${day}@no-contact-dude`, `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${hh}${mm}00`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    'SUMMARY:No Contact Dude check-in', 'DESCRIPTION:Take ten seconds to check in. Every second counts.',
    'BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', 'DESCRIPTION:No Contact Dude check-in', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'no-contact-dude-daily-checkin.ics' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  await db.setSetting('reminderTime', time);
  state.settings.reminderTime = time;
  toast(`Calendar file downloaded. Open it to add a daily ${time} reminder.`);
}

async function exportBackup() {
  const data = await db.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `no-contact-dude-backup-${toKey()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup downloaded');
}

async function importBackup(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!confirm('Importing replaces all current data on this device. Continue?')) return;
    const n = await db.importData(payload);
    await load(); render();
    $('#settingsDialog').close();
    toast(`Imported ${n} check-ins`);
  } catch (err) {
    toast(err.message || 'Could not read that file.');
  }
}

async function resetAll() {
  if (!confirm('Delete every check-in and setting on this device? This cannot be undone. Consider exporting a backup first.')) return;
  await db.clearAll();
  state.editing = null;
  state.anchorTs = null;
  await load();
  $('#settingsDialog').close();
  render();
  toast('All data deleted');
}

async function updateStorageInfo() {
  const el = $('#storageInfo');
  let text = 'Stored privately in this browser with IndexedDB. Nothing is sent to a server.';
  try {
    const persisted = await navigator.storage?.persisted?.();
    const est = await navigator.storage?.estimate?.();
    if (persisted) text += ' Persistent storage is on.';
    if (est?.usage != null) text += ` Using ${(est.usage / 1024).toFixed(0)} KB.`;
  } catch {}
  el.textContent = text;
}

/* ---------------- UI wiring ---------------- */
function bindUI() {
  $('#onboardForm').addEventListener('submit', onOnboard);
  const cf = $('#checkinForm');
  cf.addEventListener('submit', onCheckinSubmit);
  cf.addEventListener('input', () => { cf.dataset.dirty = '1'; });
  cf.addEventListener('change', (e) => {
    const { name } = e.target;
    if (name === 'status') onStatusChange();
    if (name === 'trigger') { syncTriggerOther(); if (!$('#triggerOtherField').hidden && e.target.value === 'other') cf.triggerOther.focus({ preventScroll: true }); }
    updateMoreCounts();
  });
  cf.note.addEventListener('input', () => { $('#noteCount').textContent = cf.note.value.length; autosize(cf.note); });
  cf.triggerOther.addEventListener('input', () => { $('#triggerOtherCount').textContent = cf.triggerOther.value.length; autosize(cf.triggerOther); });
  cf.addEventListener('toggle', autosizeAll, true);           // sections opening (toggle does not bubble)
  window.addEventListener('resize', autosizeAll);
  // reading a past entry
  $('#entryClose').addEventListener('click', () => $('#entryDialog').close());
  $('#entryNewer').addEventListener('click', () => stepEntry(-1));
  $('#entryOlder').addEventListener('click', () => stepEntry(1));
  $('#entryEdit').addEventListener('click', () => { const { date } = entryList[entryIdx]; state.returnToEntry = date; $('#entryDialog').close(); startEdit(date); }); // come back to the reading view afterwards
  $('#entryDelete').addEventListener('click', async () => { const { date } = entryList[entryIdx]; if (await removeEntry(date)) $('#entryDialog').close(); });
  $('#entryDialog').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepEntry(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepEntry(1); }
  });
  $('#quickHeldBtn').addEventListener('click', () => cf.requestSubmit());
  $('#logMore').addEventListener('click', () => { state.logLimit += LOG_PAGE; renderLog(); });
  $('#reminderBtn').addEventListener('click', downloadReminder);
  $('#reminderTime').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
  $('#urgeInput').addEventListener('input', (e) => { $('#urgeOut').textContent = e.target.value; updateUrgeAlert(); });
  $('#urgentBtn').addEventListener('click', () => rescue.open());
  $('#urgeAlertBtn').addEventListener('click', () => rescue.open());
  document.querySelectorAll('.tool[data-step]').forEach((b) => b.addEventListener('click', () => rescue.open(Number(b.dataset.step))));
  window.addEventListener('hashchange', () => { if (tabFromHash() !== currentTab) showTab(tabFromHash()); });
  $('#tabbar').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.tab === currentTab) { e.preventDefault(); scrollPage({ top: 0, behavior: 'smooth' }); }
  });
  $('#urgentClose').addEventListener('click', rescue.close);
  $('#editTodayBtn').addEventListener('click', () => startEdit(toKey()));
  $('#cancelEditBtn').addEventListener('click', requestCloseEdit);
  $('#editClose').addEventListener('click', requestCloseEdit);
  $('#editDialog').addEventListener('cancel', (e) => { if (cf.dataset.dirty && !confirm('Discard your changes?')) e.preventDefault(); }); // Escape key
  $('#editDialog').addEventListener('close', onEditClosed);
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsForm').addEventListener('submit', onSettingsSubmit);
  $('#settingsForm').addEventListener('input', (e) => { if (e.target.name === 'startDate' || e.target.name === 'startTime') e.currentTarget.startTime.setCustomValidity(''); });
  $('#settingsDialog').addEventListener('close', onSettingsClose);
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importFile').addEventListener('change', importBackup);
  $('#orbBtn').addEventListener('click', () => daysPlay.open());
  document.querySelectorAll('[data-check]').forEach((b) => b.addEventListener('click', () => checkup.open(b.dataset.check)));
  document.querySelectorAll('[data-game]').forEach((b) => b.addEventListener('click', () => games.open(b.dataset.game)));
  $('#urgentGame').addEventListener('click', () => games.open('menu'));
  $('#resetBtn').addEventListener('click', resetAll);
  $('#themeBtn').addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('cd-theme', next); } catch {}
}

let toastTimer;
function toast(msg, actionLabel, onAction) {
  const el = $('#toast'), btn = $('#toastAction');
  $('#toastMsg').textContent = msg;
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel || '';
  btn.onclick = actionLabel ? () => { el.hidden = true; onAction(); } : null;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, actionLabel ? 8000 : 3500);
}

/** On phones the page scrolls inside #scroller (so the browser's own scroll line has nothing to draw); on desktop it is the window. */
function scrollPage(opts) {
  const sc = $('#scroller');
  (sc && getComputedStyle(sc).position === 'fixed' ? sc : window).scrollTo(opts);
}

/* ---------------- PWA plumbing ---------------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    const promptUpdate = (worker) => toast('A new version is ready', 'Update', () => worker.postMessage({ type: 'SKIP_WAITING' }));
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(nw);
      });
    });
    // Check for updates whenever the app regains focus.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch((err) => console.warn('[sw] registration failed', err));

  let refreshing = false;
  const hadController = !!navigator.serviceWorker.controller; // on a first visit the new worker just takes over: no reload, so nobody loses what they're typing
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    const typing = ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName) && document.activeElement.value;
    if (document.querySelector('dialog[open]') || typing) return;   // don't pull the page away mid-sentence: the next open uses the new version
    refreshing = true;
    location.reload();
  });
}

let deferredPrompt = null;
function setupInstall() {
  const btn = $('#installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; toast('Installed — find No Contact Dude on your home screen.'); });
}

function setupNetwork() {
  const pill = $('#netPill');
  const update = () => {
    const on = navigator.onLine;
    pill.classList.toggle('offline', !on);
    pill.querySelector('.net-label').textContent = on ? 'Online' : 'Offline';
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', () => { update(); toast('You’re offline. Everything still works and saves locally.'); });
  update();
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
