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

/**
 * Local time of day as zero-padded parts. Together with `noContactDays` (whole calendar
 * days since the start/contact day, which begins at local midnight) this is the live
 * hours:minutes:seconds part of the counter. Using calendar days keeps it DST-safe.
 */
export function clockParts(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return { h: p(now.getHours()), m: p(now.getMinutes()), s: p(now.getSeconds()) };
}

/** "12 days 07:45:09" — a single-string version for the urgent screen and screen readers. */
export function formatElapsed(days, parts) {
  return `${days} ${days === 1 ? 'day' : 'days'} ${parts.h}:${parts.m}:${parts.s}`;
}

/**
 * computeStats(checkins, startDate, today)
 *  - noContactDays: full days since the start date or the most recent "contact" check-in.
 *  - longestRun: longest gap between start / contact events (including the current run).
 *  - checkinStreak: consecutive days with any check-in, ending today (or yesterday, as a grace day).
 */
export function computeStats(checkins, startDate, today = toKey()) {
  const sorted = [...checkins].sort((a, b) => a.date.localeCompare(b.date));
  const contacts = sorted.filter((c) => c.status === 'contact' && c.date >= (startDate || '0000')).map((c) => c.date);
  const anchors = [startDate, ...contacts].filter(Boolean);

  const lastAnchor = anchors.length ? anchors[anchors.length - 1] : null;
  const noContactDays = lastAnchor ? Math.max(0, diffDays(lastAnchor, today)) : 0;

  let longestRun = noContactDays;
  for (let i = 1; i < anchors.length; i++) {
    longestRun = Math.max(longestRun, diffDays(anchors[i - 1], anchors[i]));
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
    longestRun,
    checkinStreak,
    totalCheckins: sorted.length,
    heldCount: held.length,
    contactCount: contacts.length,
    lastContact: contacts[contacts.length - 1] ?? null,
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
