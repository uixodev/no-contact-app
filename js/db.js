/**
 * db.js — tiny promise wrapper around IndexedDB. No dependencies.
 *
 * Database: "clear-days" (version 1)
 *   checkins  keyPath "date" (YYYY-MM-DD, local time) → one entry per day
 *             { date, status: 'held' | 'contact', mood: 1-5, urge: 0-10, note, createdAt, updatedAt }
 *             index "byStatus"
 *   settings  keyPath "key" → { key, value }
 */
const DB_NAME = 'clear-days';
const DB_VERSION = 1;
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
  };
}

export async function importData(payload, { replace = true } = {}) {
  if (!payload || payload.app !== 'clear-days' || !Array.isArray(payload.checkins)) {
    throw new Error('This file is not a Clear Days backup.');
  }
  const valid = payload.checkins.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c?.date) && ['held', 'contact'].includes(c.status));
  await tx(['checkins', 'settings'], 'readwrite', (checkins, settings) => {
    if (replace) { checkins.clear(); settings.clear(); }
    valid.forEach((c) => checkins.put(c));
    Object.entries(payload.settings || {}).forEach(([key, value]) => settings.put({ key, value }));
  });
  return valid.length;
}

export const clearAll = () => tx(['checkins', 'settings'], 'readwrite', (c, s) => { c.clear(); s.clear(); });

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  if (navigator.storage?.persist) {
    const already = await navigator.storage.persisted();
    return already || navigator.storage.persist();
  }
  return false;
}
