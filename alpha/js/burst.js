// The easter egg: the icons of every supported sport burst out of a point on the screen, fly
// up and out, tumble and fall, then fade. With "reduce motion" on, they gently fade in place.
import { SPORTS } from './sports.js';

const COLOURS = ['#22c55e', '#fafafa', '#22c55e', '#8a8a8a'];
const GRAVITY = 900; // px/s²
const LIFE_MS = 2800;

export function burst(x, y, count = 42) {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden';
  document.body.append(layer);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bits = Array.from({ length: count }, (_, i) => {
    const sport = SPORTS[i % SPORTS.length];
    const size = 18 + Math.random() * 30;
    const el = document.createElement('span');
    el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${sport.icon}</svg>`;
    el.style.cssText = `position:absolute;left:0;top:0;color:${COLOURS[i % COLOURS.length]};will-change:transform,opacity`;
    layer.append(el);
    // Each icon rises to a height between a third of the way and nearly the top of the screen,
    // whatever the screen size and wherever the tap was, and drifts sideways within the screen.
    const rise = y * (0.35 + Math.random() * 0.6);
    return {
      el, size,
      x: x - size / 2, y: y - size / 2,
      vx: (Math.random() - 0.5) * innerWidth * 0.9, vy: -Math.sqrt(2 * GRAVITY * rise),
      rot: Math.random() * 360, spin: (Math.random() - 0.5) * 900,
      delay: Math.random() * 120,
    };
  });

  const start = performance.now();
  let last = start;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const age = now - start;
    for (const b of bits) {
      if (age < b.delay) { b.el.style.opacity = '0'; continue; }
      if (!calm) {
        b.vy += GRAVITY * dt;
        b.vx *= 0.995;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.spin * dt;
      }
      const t = (age - b.delay) / (LIFE_MS - 200);
      const scale = Math.min(1, (age - b.delay) / 120);
      b.el.style.opacity = String(Math.max(0, 1 - t * t));
      b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.rot}deg) scale(${scale})`;
    }
    if (age < LIFE_MS) requestAnimationFrame(frame);
    else layer.remove();
  }
  requestAnimationFrame(frame);
  navigator.vibrate?.(30);
}

// Calls `then` after `times` taps, each within `gapMs` of the one before; then again at every
// further quick tap, and after a pause, again after `times` taps. As often as you like.
export function tapsCounter(times, then, gapMs = 450) {
  let taps = 0;
  let lastAt = -Infinity;
  return (e) => {
    const now = performance.now();
    taps = now - lastAt <= gapMs ? taps + 1 : 1;
    lastAt = now;
    if (taps >= times) then(e);
  };
}
