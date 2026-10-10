import * as db from './db.js';
import { createRescue } from './rescue.js';
import { computeStats, buildCalendar, urgeStats, splitElapsed, formatElapsed, toTimestamp, toKey, fromKey, MILESTONES } from './streaks.js';

const $ = (sel) => document.querySelector(sel);
const fmtMoment = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const MOOD_WORDS = ['', 'Very low', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_EMOJI = ['🙂', '😞', '😕', '😐', '🙂', '😄'];
const RING_LEN = 2 * Math.PI * 112; // matches the r="112" progress ring around the orb

const PEAK_URGE = 8;                 // urge level (0–10) treated as a "peak"

// anchorTs = the exact moment the current No Contact run began (ms); days = whole days elapsed since then.
const state = { settings: {}, checkins: [], urges: [], editing: null, days: 0, anchorTs: null };

// The guided "urgent help" flow lives in rescue.js; it gets what it needs from here.
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

const pad2 = (n) => String(n).padStart(2, '0');
const nowTime = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const startTimeOf = (settings) => settings.startTime || '00:00'; // older data has no time: midnight, as before

/* ---------------- Boot ---------------- */
init().catch((err) => {
  console.error(err);
  $('#loading').hidden = true;
  toast(`Couldn't open local storage: ${err.message}`);
});

async function init() {
  fillMascots();
  bindUI();
  await db.openDB();
  await load();
  $('#loading').hidden = true;
  render();
  registerServiceWorker();
  setupInstall();
  setupNetwork();
  db.requestPersistence().then(updateStorageInfo);

  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'checkin') $('#checkinForm input[name="status"]')?.focus();

  // Live clock: tick once a second, aligned to the wall-clock second so it never drifts.
  // Also re-renders when the date changes, and catches up when the app returns to the foreground.
  let lastDay = toKey();
  const tick = () => {
    if (toKey() !== lastDay) { lastDay = toKey(); render(); }
    updateClock();
    rescue.tick();
  };
  const loop = () => { tick(); setTimeout(loop, 1000 - (Date.now() % 1000) + 5); };
  loop();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncOrbit(); tick(); } });
}

async function load() {
  const [settings, checkins, urges] = await Promise.all([db.getAllSettings(), db.getAllCheckins(), db.getAllUrges()]);
  state.settings = settings;
  state.checkins = checkins;
  state.urges = urges;
}

function fillMascots() {
  const tpl = $('#mascotTpl');
  document.querySelectorAll('.mascot-slot').forEach((el) => el.replaceChildren(tpl.content.cloneNode(true)));
}

/* ---------------- Render ---------------- */
function render() {
  const { startDate } = state.settings;
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
  $('#streakChipNum').textContent = s.checkinStreak;
  $('#statLongest').textContent = s.longestRun;
  $('#statStreak').textContent = s.checkinStreak;
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
  renderCalendar(today);
  renderMilestones(s);
  renderLog();
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

function renderCheckin(today) {
  const todayEntry = state.checkins.find((c) => c.date === today);
  const editing = state.editing;
  const showForm = !todayEntry || editing;
  $('#checkinBadge').hidden = !todayEntry;
  $('#checkinDone').hidden = showForm;
  $('#checkinForm').hidden = !showForm;
  $('#cancelEditBtn').hidden = !editing;
  $('#checkinTitle').textContent = editing && editing !== today
    ? `Editing ${fmtShort.format(fromKey(editing))}` : "Today's check-in";

  if (todayEntry && !editing) {
    const word = todayEntry.status === 'held'
      ? 'You held No Contact today.'
      : `You logged contact today${todayEntry.time ? ` at ${todayEntry.time}` : ''}. Tomorrow is a fresh start.`;
    $('#checkinSummary').textContent = `${word} Mood: ${MOOD_WORDS[todayEntry.mood]} · Urge ${todayEntry.urge}/10.`;
  }
  const f = $('#checkinForm');
  f.date.max = today;
  f.date.min = state.settings.startDate;
  if (!editing && !f.dataset.dirty) fillForm({ date: today, status: 'held', mood: 3, urge: 0, note: '' });
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
  syncContactRow();
  updateUrgeAlert();
}

/** Show the "what time was the contact?" field only when logging contact. */
function syncContactRow() {
  const f = $('#checkinForm');
  const contact = f.elements.status.value === 'contact';
  $('#contactTimeRow').hidden = !contact;
  f.time.required = contact;
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

function renderLog() {
  const recent = [...state.checkins].reverse().slice(0, 14);
  $('#logEmpty').hidden = recent.length > 0;
  $('#log').replaceChildren(...recent.map((c) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="log-dot ${c.status}" aria-hidden="true"></span>
      <div class="log-main">
        <div class="log-title"></div>
        <div class="log-meta"></div>
        ${c.note ? '<div class="log-note"></div>' : ''}
      </div>
      <div class="log-actions">
        <button class="icon-btn" data-act="edit" aria-label="Edit entry"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L19 9l-4-4L4 16v4Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg></button>
        <button class="icon-btn" data-act="delete" aria-label="Delete entry"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg></button>
      </div>`;
    li.querySelector('.log-dot').textContent = c.status === 'held' ? '✓' : '✕';
    li.querySelector('.log-title').textContent = `${fmtShort.format(fromKey(c.date))} · ${c.status === 'held' ? 'Held No Contact' : `Had contact${c.time ? ` at ${c.time}` : ''}`}`;
    li.querySelector('.log-meta').textContent = `${MOOD_EMOJI[c.mood] ?? ''} ${MOOD_WORDS[c.mood] ?? '—'} · Urge ${c.urge}/10`;
    if (c.note) li.querySelector('.log-note').textContent = c.note;
    li.querySelector('[data-act="edit"]').addEventListener('click', () => startEdit(c.date));
    li.querySelector('[data-act="delete"]').addEventListener('click', () => removeEntry(c.date));
    return li;
  }));
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
function startEdit(date) {
  state.editing = date;
  const existing = state.checkins.find((c) => c.date === date);
  fillForm(existing ?? { date, status: 'held', mood: 3, urge: 0, note: '' });
  render();
  $('#checkinForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function removeEntry(date) {
  if (!confirm(`Delete the entry for ${fmtShort.format(fromKey(date))}?`)) return;
  const backup = state.checkins.find((c) => c.date === date);
  await db.deleteCheckin(date);
  await load(); render();
  toast('Entry deleted', 'Undo', async () => { await db.saveCheckin(backup); await load(); render(); });
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
  };
  if (entry.date > toKey()) return toast("You can't check in for a future date.");
  if (entry.date < state.settings.startDate) return toast('That date is before your start date.');
  if (entry.status === 'contact') {
    const ts = toTimestamp(entry.date, entry.time);
    if (ts > Date.now()) return toast("That time hasn't happened yet.");
    if (ts < toTimestamp(state.settings.startDate, startTimeOf(state.settings))) return toast('That moment is before your No Contact start.');
  }

  const before = computeStats(state.checkins, state.settings.startDate, toKey(), { startTime: startTimeOf(state.settings) });
  await db.saveCheckin(entry);
  state.editing = null;
  delete f.dataset.dirty;
  await load(); render();
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
  window.scrollTo({ top: 0 }); // start at the top, where the calm orb is
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

async function exportBackup() {
  const data = await db.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `clear-days-backup-${toKey()}.json` });
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
  cf.addEventListener('change', (e) => { if (e.target.name === 'status') onStatusChange(); });
  $('#urgeInput').addEventListener('input', (e) => { $('#urgeOut').textContent = e.target.value; updateUrgeAlert(); });
  $('#urgentBtn').addEventListener('click', rescue.open);
  $('#urgeAlertBtn').addEventListener('click', rescue.open);
  $('#urgentClose').addEventListener('click', rescue.close);
  $('#editTodayBtn').addEventListener('click', () => startEdit(toKey()));
  $('#cancelEditBtn').addEventListener('click', () => { state.editing = null; delete cf.dataset.dirty; render(); });
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsForm').addEventListener('submit', onSettingsSubmit);
  $('#settingsForm').addEventListener('input', (e) => { if (e.target.name === 'startDate' || e.target.name === 'startTime') e.currentTarget.startTime.setCustomValidity(''); });
  $('#settingsDialog').addEventListener('close', onSettingsClose);
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importFile').addEventListener('change', importBackup);
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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
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
  window.addEventListener('appinstalled', () => { btn.hidden = true; toast('Installed — find Clear Days on your home screen.'); });
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
