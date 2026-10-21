// Chooses the portrait or landscape layout in JavaScript instead of a CSS orientation query.
//
// While a phone rotates, browsers (iOS especially) report a few in-between viewport sizes that are
// nearly square. A CSS query flips the whole board between "side by side" and "stacked" on each of
// them, which shows up as flickering. Here the layout only changes once the size has settled, and
// near-square sizes keep the current layout.

const SETTLE_MS = 150;
const HYSTERESIS = 0.1; // within 10% of square, keep whatever layout is showing

// Pure: decide the layout for a viewport, given the current one.
export function chooseLayout(width, height, current) {
  if (width > height * (1 + HYSTERESIS)) return 'landscape';
  if (height > width * (1 + HYSTERESIS)) return 'portrait';
  return current ?? (width > height ? 'landscape' : 'portrait');
}

export function watchLayout(root = document.documentElement) {
  let current = root.classList.contains('landscape') ? 'landscape' : 'portrait';
  let timer = null;

  function apply() {
    timer = null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const next = chooseLayout(w, h, current);
    const short = next === 'landscape' && h <= 500;
    if (next !== current) {
      current = next;
      root.classList.toggle('landscape', next === 'landscape');
    }
    root.classList.toggle('short', short);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => requestAnimationFrame(apply), SETTLE_MS);
  }

  window.addEventListener('resize', schedule);
  screen.orientation?.addEventListener?.('change', schedule);
  apply();
}
