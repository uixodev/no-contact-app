/**
 * press.js — makes button presses visible on touch screens.
 * A phone tap lasts about 50 to 100 ms, and the browser's :active state ends the moment the finger lifts, so the
 * pressed look (and its little animation) was gone before you could see it unless you held the button. This adds a
 * `pressing` class on touch-down and keeps it for at least MIN_MS, so even a quick tap shows the full press.
 * The CSS treats `.pressing` exactly like `:active`.
 */
const PRESSABLE = '.btn, .icon-btn, .game-nav, .pad-btn, .chip, .tool, .game-pick, .tab, .wk, .flip, .sense-btn, .echo-orb, .balloon, .choice, .mood-row label, .pick, .log-open, .orb-hit, .pending-btn';
const MIN_MS = 170;

export function setupPressFeedback() {
  const down = new Map();                                  // element -> when it was pressed
  document.addEventListener('pointerdown', (e) => {
    const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    down.set(el, performance.now());
    el.classList.add('pressing');
  }, { passive: true });
  const release = () => {
    for (const [el, t0] of down) {
      setTimeout(() => el.classList.remove('pressing'), Math.max(0, MIN_MS - (performance.now() - t0)));
    }
    down.clear();
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
}
