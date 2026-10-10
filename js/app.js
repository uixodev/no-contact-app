import * as db from './db.js';
import { computeStats, buildCalendar, toKey, fromKey, MILESTONES } from './streaks.js';

const $ = (sel) => document.querySelector(sel);
const fmtLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const MOOD_WORDS = ['', 'Very low', 'Low', 'Okay', 'Good', 'Great'];
const RING_LEN = 2 * Math.PI * 52;

const state = { settings: {}, checkins: [], editing: null };

/* ---------------- Boot ---------------- */
init().catch((err) => {
  console.error(err);
  $('#loading').hidden = true;
  toast(`Couldn't open local storage: ${err.message}`);
});

async function init() {
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

  // Re-render when the day changes or the app is brought back to the foreground.
  let lastDay = toKey();
  const tick = () => { if (toKey() !== lastDay) { lastDay = toKey(); render(); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  setInterval(tick, 60_000);
}

async function load() {
  const [settings, checkins] = await Promise.all([db.getAllSettings(), db.getAllCheckins()]);
  state.settings = settings;
  state.checkins = checkins;
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
    return;
  }
  const today = toKey();
  const goal = Number(state.settings.goal) || 90;
  const s = computeStats(state.checkins, startDate, today);

  // Hero
  $('#daysCount').textContent = s.noContactDays;
  $('#daysUnit').textContent = s.noContactDays === 1 ? 'day' : 'days';
  const anchor = s.lastContact && s.lastContact >= startDate ? s.lastContact : startDate;
  $('#sinceLabel').textContent = s.lastContact
    ? `Since your last contact on ${fmtLong.format(fromKey(anchor))}`
    : `Since ${fmtLong.format(fromKey(startDate))}`;
  const reason = state.settings.reason?.trim();
  $('#reasonQuote').hidden = !reason;
  $('#reasonQuote').textContent = reason ? `“${reason}”` : '';

  const pct = Math.min(1, s.noContactDays / goal);
  $('#ringFill').style.strokeDashoffset = String(RING_LEN * (1 - pct));
  $('#goalPct').textContent = `${Math.round(pct * 100)}%`;
  $('#goalLabel').textContent = `of ${goal} days`;

  if (s.nextMilestone) {
    const span = s.nextMilestone - s.prevMilestone;
    const prog = ((s.noContactDays - s.prevMilestone) / span) * 100;
    const left = s.nextMilestone - s.noContactDays;
    $('#nextMilestone').textContent = `${s.nextMilestone} days · ${left} to go`;
    $('#milestoneFill').style.width = `${prog}%`;
    $('#milestoneBar').setAttribute('aria-valuenow', Math.round(prog));
  } else {
    $('#nextMilestone').textContent = 'Every milestone reached';
    $('#milestoneFill').style.width = '100%';
  }

  // Stats
  $('#statLongest').textContent = s.longestRun;
  $('#statStreak').textContent = s.checkinStreak;
  $('#statTotal').textContent = s.totalCheckins;
  $('#statTotalSub').textContent = `${s.heldCount} held · ${s.contactCount} contact`;
  $('#statMood').textContent = s.avgMood7 == null ? '—' : s.avgMood7.toFixed(1);
  $('#statUrge').textContent = s.avgUrge7 == null ? 'avg urge —' : `avg urge ${s.avgUrge7.toFixed(1)}/10`;

  renderCheckin(today);
  renderCalendar(today);
  renderMilestones(s);
  renderLog();
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
    const word = todayEntry.status === 'held' ? 'You held No Contact today.' : 'You logged contact today. Tomorrow is a fresh start.';
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
        <button class="icon-btn" data-act="edit" aria-label="Edit entry"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 20h4L19 9l-4-4L4 16v4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
        <button class="icon-btn" data-act="delete" aria-label="Delete entry"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
      </div>`;
    li.querySelector('.log-title').textContent = `${fmtShort.format(fromKey(c.date))} · ${c.status === 'held' ? 'Held No Contact' : 'Had contact'}`;
    li.querySelector('.log-meta').textContent = `Mood ${MOOD_WORDS[c.mood] ?? '—'} · Urge ${c.urge}/10`;
    if (c.note) li.querySelector('.log-note').textContent = c.note;
    li.querySelector('[data-act="edit"]').addEventListener('click', () => startEdit(c.date));
    li.querySelector('[data-act="delete"]').addEventListener('click', () => removeEntry(c.date));
    return li;
  }));
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
  };
  if (entry.date > toKey()) return toast("You can't check in for a future date.");
  if (entry.date < state.settings.startDate) return toast('That date is before your start date.');

  const before = computeStats(state.checkins, state.settings.startDate);
  await db.saveCheckin(entry);
  state.editing = null;
  delete f.dataset.dirty;
  await load(); render();
  const after = computeStats(state.checkins, state.settings.startDate);

  if (entry.status === 'contact') toast('Logged. One moment doesn’t erase your progress — your longest run still counts.');
  else if (after.milestonesReached.length > before.milestonesReached.length) toast(`Milestone reached: ${after.milestonesReached.at(-1)} days. Be proud of that.`);
  else toast('Check-in saved');
  navigator.vibrate?.(15);
}

async function onOnboard(e) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  const startDate = data.get('startDate');
  if (startDate > toKey()) return toast('Pick today or a date in the past.');
  await db.setSetting('startDate', startDate);
  await db.setSetting('goal', Number(data.get('goal')));
  await db.setSetting('reason', String(data.get('reason') || '').trim());
  await load(); render();
  toast('You’re all set. Check in once a day.');
}

function openSettings() {
  const f = $('#settingsForm');
  f.startDate.value = state.settings.startDate ?? toKey();
  f.startDate.max = toKey();
  f.goal.value = state.settings.goal ?? 90;
  f.reason.value = state.settings.reason ?? '';
  $('#iosHint').hidden = !isIOS() || isStandalone();
  updateStorageInfo();
  $('#settingsDialog').showModal();
}

async function onSettingsClose() {
  const dlg = $('#settingsDialog');
  if (dlg.returnValue !== 'save') return;
  const f = $('#settingsForm');
  if (!f.startDate.value || f.startDate.value > toKey()) return toast('Start date must be today or earlier.');
  await db.setSetting('startDate', f.startDate.value);
  await db.setSetting('goal', Math.max(1, Number(f.goal.value) || 90));
  await db.setSetting('reason', f.reason.value.trim());
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
  $('#urgeInput').addEventListener('input', (e) => { $('#urgeOut').textContent = e.target.value; });
  $('#editTodayBtn').addEventListener('click', () => startEdit(toKey()));
  $('#cancelEditBtn').addEventListener('click', () => { state.editing = null; delete cf.dataset.dirty; render(); });
  $('#settingsBtn').addEventListener('click', openSettings);
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
