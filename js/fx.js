/** fx.js — small celebration effects shared by the urgent-help flow and check-ins. */
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#58CC02', '#FFC800', '#FF9600', '#FF4B4B', '#CE82FF', '#89E219'];
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 40; k++) {
    const i = document.createElement('i');
    i.style.cssText = `left:${Math.random() * 100}%;background:${colors[k % colors.length]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.4).toFixed(2)}s;--drift:${Math.round(Math.random() * 120 - 60)}px`;
    box.append(i);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3600);
}
