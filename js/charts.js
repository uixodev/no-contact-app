/**
 * charts.js — one tiny line-chart builder (plain SVG, no library).
 * Built to the dataviz rules: one series per chart, one y-axis, a 2px line, markers wider than 8px with a surface
 * ring, a recessive grid, text in text colours (never the series colour), the latest value labelled directly,
 * a hover/focus tooltip on every point (with big hit targets), and a role="img" summary for screen readers.
 * The series colour comes from the CSS variable you pass, so light and dark themes both work.
 */
const NS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  kids.forEach((c) => n.append(c));
  return n;
};

/**
 * @param {object} o
 * @param {string} o.title     e.g. "Mood"
 * @param {string} o.caption   e.g. "last 14 check-ins"
 * @param {{date:string,value:number|null,label:string}[]} o.points  oldest → newest; label is the tooltip text
 * @param {number} o.min @param {number} o.max @param {number[]} o.ticks  y-axis range and gridlines
 * @param {string} o.colorVar  CSS variable holding the series colour, e.g. "--chart-mood"
 * @param {(date:string)=>string} o.fmtDate  short date for the x-axis ends
 */
export function lineChart({ title, caption, points, min, max, ticks, colorVar, fmtDate }) {
  const W = 320, H = 136, L = 30, R = 16, T = 18, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const x = (i) => L + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => T + ih - ((v - min) / (max - min)) * ih;
  const real = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null);

  const fig = document.createElement('figure');
  fig.className = 'chart';
  fig.style.setProperty('--series', `var(${colorVar})`);
  const cap = document.createElement('figcaption');
  cap.className = 'chart-title';
  cap.innerHTML = '<strong></strong> <span></span>';
  cap.querySelector('strong').textContent = title;
  cap.querySelector('span').textContent = caption;

  const lo = real.length ? Math.min(...real.map((p) => p.value)) : null;
  const hi = real.length ? Math.max(...real.map((p) => p.value)) : null;
  const summary = real.length
    ? `${title}, ${caption}. Latest ${real[real.length - 1].value}; lowest ${lo}; highest ${hi}.`
    : `${title}: no data yet.`;
  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': summary });

  // recessive grid + y labels
  for (const t of ticks) {
    svg.append(node('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), class: t === min ? 'axis' : 'grid' }));
    const lab = node('text', { x: L - 6, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' });
    lab.textContent = t;
    svg.append(lab);
  }
  // x labels: first and last date only
  if (points.length) {
    const a = node('text', { x: x(0), y: H - 6, class: 'tick', 'text-anchor': points.length === 1 ? 'middle' : 'start' }); a.textContent = fmtDate(points[0].date);
    svg.append(a);
    if (points.length > 1) { const z = node('text', { x: x(points.length - 1), y: H - 6, class: 'tick', 'text-anchor': 'end' }); z.textContent = fmtDate(points[points.length - 1].date); svg.append(z); }
  }
  // the line, broken where a day has no value
  let d = '', pen = false;
  points.forEach((p, i) => { if (p.value == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`; pen = true; });
  if (real.length > 1) svg.append(node('path', { d, class: 'line', fill: 'none' }));

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'status');
  const show = (p) => {
    tip.textContent = p.label;
    tip.style.left = `${(x(p.i) / W) * 100}%`;
    tip.style.top = `${(y(p.value) / H) * 100}%`;
    const pct = (x(p.i) / W) * 100;
    tip.style.transform = `translate(${pct < 24 ? '-12%' : pct > 76 ? '-88%' : '-50%'}, calc(-100% - 12px))`; // keep it inside the card
    tip.hidden = false;
  };
  for (const p of real) {
    const g = node('g', { class: 'pt', tabindex: 0, role: 'img', 'aria-label': p.label });
    g.append(node('circle', { cx: x(p.i), cy: y(p.value), r: 16, class: 'hit' }), node('circle', { cx: x(p.i), cy: y(p.value), r: 5, class: 'dot' }));
    g.addEventListener('pointerenter', () => show(p));
    g.addEventListener('focus', () => show(p));
    g.addEventListener('pointerleave', () => { tip.hidden = true; });
    g.addEventListener('blur', () => { tip.hidden = true; });
    svg.append(g);
  }
  // direct label on the latest value
  if (real.length) {
    const last = real[real.length - 1];
    const t = node('text', { x: x(last.i), y: y(last.value) - 10, class: 'last', 'text-anchor': last.i === 0 ? 'start' : 'middle' });
    t.textContent = last.value;
    svg.append(t);
  }
  fig.append(cap, svg, tip);
  return fig;
}
