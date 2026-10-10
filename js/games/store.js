/** store.js — tiny best-score memory shared by the games (localStorage, quietly skipped if it is blocked). */
const KEY = 'nc-game-best';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
export const getBest = (k, fallback = 0) => read()[k] ?? fallback;
export const setBest = (k, v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [k]: v })); } catch { /* private mode */ } };
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
