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

// The height the app may fill. Normally the window's height. But an app on the iPhone home screen
// (with the status bar drawn over the page) gets a window that is shorter than the screen by the
// status bar's height, while the page starts at the very top: fixed bars then end above the
// bottom of the screen, and the page can shift up under the status bar. There, the app takes the
// whole screen. (iPhone apps always fill the screen; iPads can share it, so they keep the window.)
export function appHeight({ innerWidth: w, innerHeight: h, screenWidth, screenHeight, iphoneApp }) {
  if (!iphoneApp) return h;
  const full = w > h ? Math.min(screenWidth, screenHeight) : Math.max(screenWidth, screenHeight);
  return Math.max(h, full);
}

let height = globalThis.innerHeight ?? 0;
export const screenHeight = () => height;

function fitScreen(root) {
  height = appHeight({
    innerWidth, innerHeight, screenWidth: screen.width, screenHeight: screen.height,
    iphoneApp: /iPhone|iPod/.test(navigator.userAgent) && navigator.standalone === true,
  });
  root.style.setProperty('--app-h', `${height}px`);
  // After the keyboard closes iOS can leave the page scrolled up; the page itself never scrolls.
  if (scrollY) scrollTo(0, 0);
}

export function watchLayout(root = document.documentElement) {
  let current = root.classList.contains('landscape') ? 'landscape' : 'portrait';
  let timer = null;

  function apply() {
    timer = null;
    fitScreen(root);
    const w = window.innerWidth;
    const h = height;
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
  window.visualViewport?.addEventListener('resize', schedule);
  document.addEventListener('focusout', () => setTimeout(() => fitScreen(root), 100)); // keyboard closed
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fitScreen(root); });
  apply();
}
