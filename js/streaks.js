/**
 * streaks.js — pure functions (no DOM, no DB) so they're easy to unit-test.
 * All dates are local "YYYY-MM-DD" strings to avoid timezone drift.
 */
export const MILESTONES = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365];

export function toKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** Whole calendar days from a → b (DST-safe, uses UTC of local Y/M/D). */
export function diffDays(aKey, bKey) {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export const DAY_MS = 86400000;

/** Local timestamp (ms) for a "YYYY-MM-DD" key plus an optional "HH:MM" (defaults to midnight). */
export function toTimestamp(dateKey, time = '00:00') {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = (/^\d{1,2}:\d{2}$/.test(time || '') ? time : '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/**
 * Break an elapsed time (ms) into days / hours / minutes / seconds for the live counter.
 * It is exact elapsed time, so the counter is the real time since the moment contact ended.
 */
export function splitElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return {
    days: Math.floor(total / 86400),
    h: p(Math.floor((total % 86400) / 3600)),
    m: p(Math.floor((total % 3600) / 60)),
    s: p(total % 60),
    totalSeconds: total,
  };
}

/** "12 days 07:45:09" — a single-string version for the urgent screen and screen readers. */
export function formatElapsed(parts) {
  return `${parts.days} ${parts.days === 1 ? 'day' : 'days'} ${parts.h}:${parts.m}:${parts.s}`;
}

/**
 * computeStats(checkins, startDate, today, { startTime, now })
 *  - The count runs from an exact moment: the start date + start time, or the most recent
 *    "contact" check-in (its date + optional time; no time means midnight).
 *  - noContactDays: whole 24-hour days elapsed since that moment. elapsedMs is the exact figure.
 *  - longestRun: longest gap between start / contact moments (including the current run).
 *  - checkinStreak: consecutive days with any check-in, ending today (or yesterday, as a grace day).
 */
export function computeStats(checkins, startDate, today = toKey(), { startTime = '00:00', now = Date.now() } = {}) {
  const sorted = [...checkins].sort((a, b) => a.date.localeCompare(b.date));
  const startTs = startDate ? toTimestamp(startDate, startTime) : null;
  const contacts = startTs == null ? [] : sorted
    .filter((c) => c.status === 'contact')
    .map((c) => ({ date: c.date, ts: toTimestamp(c.date, c.time) }))
    .filter((c) => c.ts >= startTs);
  const anchors = startTs == null ? [] : [startTs, ...contacts.map((c) => c.ts)];

  const anchorTs = anchors.length ? anchors[anchors.length - 1] : null;
  const elapsedMs = anchorTs == null ? 0 : Math.max(0, now - anchorTs);
  const noContactDays = Math.floor(elapsedMs / DAY_MS);

  let longestRun = noContactDays;
  for (let i = 1; i < anchors.length; i++) {
    longestRun = Math.max(longestRun, Math.floor((anchors[i] - anchors[i - 1]) / DAY_MS));
  }

  const dates = new Set(sorted.map((c) => c.date));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let checkinStreak = 0;
  while (dates.has(cursor)) { checkinStreak++; cursor = addDays(cursor, -1); }

  const held = sorted.filter((c) => c.status === 'held');
  const moods = sorted.filter((c) => typeof c.mood === 'number');
  const recent = sorted.slice(-7);
  const avg = (arr, k) => (arr.length ? arr.reduce((s, c) => s + (Number(c[k]) || 0), 0) / arr.length : null);

  const nextMilestone = MILESTONES.find((m) => m > noContactDays) ?? null;
  const prevMilestone = [...MILESTONES].reverse().find((m) => m <= noContactDays) ?? 0;

  return {
    noContactDays,
    elapsedMs,
    elapsedDays: elapsedMs / DAY_MS,
    anchorTs,
    longestRun,
    checkinStreak,
    totalCheckins: sorted.length,
    heldCount: held.length,
    contactCount: contacts.length,
    lastContact: contacts.length ? contacts[contacts.length - 1].date : null,
    checkedInToday: dates.has(today),
    avgMood7: avg(recent, 'mood'),
    avgUrge7: avg(recent, 'urge'),
    avgMoodAll: avg(moods, 'mood'),
    nextMilestone,
    prevMilestone,
    milestonesReached: MILESTONES.filter((m) => m <= longestRun),
  };
}

/** Build a grid of the last `weeks` weeks (Mon-first) for a heatmap. */
/**
 * "Days in a row you opened the app": the run of consecutive local days that end today (or yesterday, when today has
 * not been recorded yet) in which the app was opened. Missing a day breaks it. Check-ins and what they say play no part.
 */
export function openStreak(openDays, today = toKey()) {
  const days = new Set(Array.isArray(openDays) ? openDays : []);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}

/** The longest run of consecutive days the app was opened. */
export function longestOpenStreak(openDays) {
  const days = [...new Set(Array.isArray(openDays) ? openDays : [])].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev && diffDays(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

export function buildCalendar(checkins, startDate, today = toKey(), weeks = 15) {
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  const t = fromKey(today);
  const dow = (t.getDay() + 6) % 7; // 0 = Monday
  const end = addDays(today, 6 - dow);
  const start = addDays(end, -(weeks * 7) + 1);
  const days = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    const entry = byDate.get(date);
    let state = 'empty';
    if (date > today) state = 'future';
    else if (entry) state = entry.status;
    else if (startDate && date >= startDate) state = 'missed';
    days.push({ date, state, entry });
  }
  return days;
}

/**
 * urgeStats(urges): how many urges were ridden out, and how much the urge dropped on average
 * between the first rating ("before") and the last ("after"). Only entries with both ratings count for relief.
 */
export function urgeStats(urges) {
  const rated = urges.filter((u) => Number.isFinite(u.before) && Number.isFinite(u.after));
  const relief = rated.length ? rated.reduce((n, u) => n + (u.before - u.after), 0) / rated.length : null;
  return { survived: urges.length, avgRelief: relief };
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayIndex = (key) => (fromKey(key).getDay() + 6) % 7; // 0 = Monday

/** The last `days` days ending today, for the "This week" strip: held / contact / missed / before-start. */
export function weekStrip(checkins, startDate, today = toKey(), days = 7) {
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    const entry = byDate.get(date);
    let state = 'before';
    if (entry) state = entry.status;
    else if (startDate && date >= startDate) state = date === today ? 'pending' : 'missed';
    return { date, state, isToday: date === today, weekday: weekdayIndex(date), entry };
  });
}

/** Today's daily goal: check in, log 3 wins, write one good thing. */
export const GOAL_STEPS = [
  ['checkin', 'Check in today'],
  ['wins', 'Log 3 wins'],
  ['good', 'Write one good thing'],
];
export function dailyGoal(entry) {
  const done = {
    checkin: !!entry,
    wins: (entry?.wins?.length ?? 0) >= 3,
    good: !!entry?.good?.trim(),
  };
  const steps = GOAL_STEPS.map(([key, label]) => ({ key, label, done: done[key] }));
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length, complete: steps.every((s) => s.done) };
}

/**
 * Patterns across check-ins (and the tags from urgent-help urges). Everything is null until there is enough
 * data to say something honest: at least 5 check-ins, and 2 on a weekday before that weekday is called out.
 */
export function insights(checkins, urges = []) {
  const n = checkins.length;
  const sorted = [...checkins].sort((a, b) => a.date.localeCompare(b.date));
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const num = (v) => (Number.isFinite(v) ? v : null);

  const byDay = Array.from({ length: 7 }, () => ({ urge: [], mood: [] }));
  for (const c of sorted) {
    const d = byDay[weekdayIndex(c.date)];
    if (num(c.urge) != null) d.urge.push(c.urge);
    if (num(c.mood) != null) d.mood.push(c.mood);
  }
  const pick = (field, better) => {
    if (n < 5) return null;
    let best = null;
    byDay.forEach((d, i) => {
      if (d[field].length < 2) return;
      const a = avg(d[field]);
      if (best == null || better(a, best.avg)) best = { day: i, avg: a, count: d[field].length };
    });
    return best;
  };

  const counts = new Map();
  for (const c of sorted) for (const t of c.triggers ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const u of urges) for (const t of u.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    n,
    hardestDay: pick('urge', (a, b) => a > b),
    bestMoodDay: pick('mood', (a, b) => a > b),
    topTrigger: top && top[1] >= 2 ? { key: top[0], count: top[1] } : null,
    sleepAvg: avg(sorted.map((c) => num(c.sleep)).filter((v) => v != null)),
    winsAvg: n >= 3 ? avg(sorted.map((c) => c.wins?.length ?? 0)) : null,
    series: sorted.slice(-14).map((c) => ({ date: c.date, mood: num(c.mood), urge: num(c.urge) })),
  };
}
