/**
 * db.js — tiny promise wrapper around IndexedDB. No dependencies.
 *
 * Database: "clear-days" (version 2)
 *   (The app is now called No Contact Dude, but the internal ids below keep their old names on purpose so
 *   existing databases and backup files keep working.)
 *   checkins  keyPath "date" (YYYY-MM-DD, local time) → one entry per day
 *             { date, status: 'held' | 'contact', mood: 1-5, urge: 0-10, note, time?, createdAt, updatedAt }
 *             `time` ("HH:MM") is only set for 'contact' entries: the moment the count restarts.
 *             index "byStatus"
 *   settings  keyPath "key" → { key, value }  (startDate, startTime "HH:MM", goal, reason, friendName, friendPhone)
 *   urges     keyPath "at" (ISO time) → one entry per urge the user rode out with the urgent-help flow
 *             { at, before: 0-10, after: 0-10 | null, tags: string[], activity: string | null, waitedMin: number }
 *             No schema change was needed for startTime / time: records are free-form objects.
 */
const DB_NAME = 'clear-days';
const DB_VERSION = 2;
let dbPromise;

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('IndexedDB is not supported in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      // Migrations: add `if (event.oldVersion < N)` blocks as the schema grows.
      if (event.oldVersion < 1) {
        const checkins = db.createObjectStore('checkins', { keyPath: 'date' });
        checkins.createIndex('byStatus', 'status', { unique: false });
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (event.oldVersion < 2) {
        db.createObjectStore('urges', { keyPath: 'at' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('[db] upgrade blocked — close other tabs of this app.');
  });
  return dbPromise;
}

async function tx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames) ? storeNames.map((n) => t.objectStore(n)) : [t.objectStore(storeNames)];
    let result;
    Promise.resolve(fn(...stores)).then((r) => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
}

/* ---------- Check-ins ---------- */
export async function saveCheckin(entry) {
  const now = new Date().toISOString();
  const existing = await getCheckin(entry.date);
  const record = {
    status: 'held', mood: 3, urge: 0, note: '',
    ...existing,
    ...entry,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await tx('checkins', 'readwrite', (s) => promisify(s.put(record)));
  return record;
}

export const getCheckin = (date) => tx('checkins', 'readonly', (s) => promisify(s.get(date)));

export async function getAllCheckins() {
  const all = await tx('checkins', 'readonly', (s) => promisify(s.getAll()));
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export const deleteCheckin = (date) => tx('checkins', 'readwrite', (s) => promisify(s.delete(date)));

/* ---------- Urges ridden out ---------- */
export const saveUrge = (urge) => tx('urges', 'readwrite', (s) => promisify(s.put(urge)));
export const deleteUrge = (at) => tx('urges', 'readwrite', (s) => promisify(s.delete(at)));
export async function getAllUrges() {
  const all = await tx('urges', 'readonly', (s) => promisify(s.getAll()));
  return all.sort((a, b) => a.at.localeCompare(b.at));
}

/* ---------- Settings ---------- */
export async function getSetting(key, fallback = null) {
  const row = await tx('settings', 'readonly', (s) => promisify(s.get(key)));
  return row ? row.value : fallback;
}
export const setSetting = (key, value) => tx('settings', 'readwrite', (s) => promisify(s.put({ key, value })));

export async function getAllSettings() {
  const rows = await tx('settings', 'readonly', (s) => promisify(s.getAll()));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/* ---------- Backup / restore ---------- */
export async function exportData() {
  return {
    app: 'clear-days',
    schema: DB_VERSION,
    exportedAt: new Date().toISOString(),
    settings: await getAllSettings(),
    checkins: await getAllCheckins(),
    urges: await getAllUrges(),
  };
}

export async function importData(payload, { replace = true } = {}) {
  if (!payload || payload.app !== 'clear-days' || !Array.isArray(payload.checkins)) {
    throw new Error('This file is not a No Contact Dude backup.');
  }
  const valid = payload.checkins.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c?.date) && ['held', 'contact'].includes(c.status));
  const urges = (Array.isArray(payload.urges) ? payload.urges : []).filter((u) => typeof u?.at === 'string' && !Number.isNaN(Date.parse(u.at)));
  await tx(['checkins', 'settings', 'urges'], 'readwrite', (checkins, settings, urgeStore) => {
    if (replace) { checkins.clear(); settings.clear(); urgeStore.clear(); }
    valid.forEach((c) => checkins.put(c));
    urges.forEach((u) => urgeStore.put(u));
    Object.entries(payload.settings || {}).forEach(([key, value]) => settings.put({ key, value }));
  });
  return valid.length;
}

export const clearAll = () => tx(['checkins', 'settings', 'urges'], 'readwrite', (c, s, u) => { c.clear(); s.clear(); u.clear(); });

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  if (navigator.storage?.persist) {
    const already = await navigator.storage.persisted();
    return already || navigator.storage.persist();
  }
  return false;
}
