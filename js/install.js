// "Install the app" prompt for visitors who opened the scoreboard in a browser tab.
//
// Chromium browsers (Chrome, Edge, Samsung Internet on Android and desktop) fire
// `beforeinstallprompt`, which lets us show the real install dialog from our own button.
// Safari (iOS, iPadOS, macOS) and Firefox don't, so there we explain the manual steps
// for that platform instead.

const DISMISS_KEY = 'badminton-score-install-dismissed';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// ---------- detection (pure, so it can be unit-tested) ----------

export function isInstalled(win = globalThis) {
  return ['fullscreen', 'standalone', 'minimal-ui'].some((m) => win.matchMedia?.(`(display-mode: ${m})`).matches)
    || win.navigator?.standalone === true;
}

// Returns { os: 'ios'|'ipados'|'android'|'macos'|'windows'|'linux'|'chromeos'|'other',
//           browser: 'safari'|'chrome'|'edge'|'firefox'|'samsung'|'opera'|'other' }
export function detectPlatform({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ua = userAgent;
  let os = 'other';
  if (/iPhone|iPod/.test(ua)) os = 'ios';
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) os = 'ipados'; // iPadOS reports as a Mac
  else if (/Android/.test(ua)) os = 'android';
  else if (/CrOS/.test(ua)) os = 'chromeos';
  else if (/Macintosh|Mac OS X/.test(ua) || /^Mac/.test(platform)) os = 'macos';
  else if (/Windows/.test(ua)) os = 'windows';
  else if (/Linux/.test(ua)) os = 'linux';

  let browser = 'other';
  if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = 'edge';
  else if (/OPR\/|OPiOS/.test(ua)) browser = 'opera';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { os, browser };
}

// Manual install steps when the browser has no install prompt we can trigger.
// Each step is [icon id or null, text]. Returns null when the browser can't install apps.
export function manualSteps({ os, browser }) {
  const share = 'i-share';
  const menu = 'i-menu';
  if (os === 'ios' || os === 'ipados') {
    const where = os === 'ios' ? 'at the bottom of the screen' : 'at the top right';
    if (browser === 'safari') {
      return [[share, `Tap the Share button ${where}`], [null, 'Choose “Add to Home Screen”'], [null, 'Tap “Add”']];
    }
    return [[share, 'Tap the Share button in the address bar or menu'], [null, 'Choose “Add to Home Screen”'],
      [null, 'Not there? Open this page in Safari and try again']];
  }
  if (os === 'android') {
    if (browser === 'firefox') return [[menu, 'Tap the ⋮ menu'], [null, 'Choose “Install” or “Add to Home screen”']];
    if (browser === 'samsung') return [[null, 'Tap the ≡ menu'], [null, 'Choose “Add page to” → “Home screen”']];
    return [[menu, 'Tap the ⋮ menu'], [null, 'Choose “Install app” or “Add to Home screen”']];
  }
  if (os === 'macos' && browser === 'safari') return [[null, 'In the menu bar, choose File → “Add to Dock”']];
  if (browser === 'chrome' || browser === 'edge') {
    return [[null, 'Click the install icon at the right of the address bar'], [null, 'Or open the browser menu and choose “Install”']];
  }
  return null; // e.g. Firefox on desktop: no app install support
}

// ---------- UI ----------

export function setupInstallPrompt({ sheet, steps, installBtn, laterBtn, closeBtn, settingsBtn }) {
  if (isInstalled()) return;
  const platform = detectPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  let deferred = null;

  function snoozed() {
    try {
      return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < SNOOZE_MS;
    } catch { return false; }
  }

  function render() {
    const manual = deferred ? null : manualSteps(platform);
    installBtn.hidden = !deferred;
    steps.replaceChildren(...(manual ?? []).map(([icon, text]) => {
      const li = document.createElement('li');
      if (icon) li.innerHTML = `<svg aria-hidden="true"><use href="#${icon}"/></svg>`;
      li.append(text);
      return li;
    }));
    steps.hidden = !manual;
    return Boolean(deferred || manual);
  }

  function show() {
    if (render()) sheet.hidden = false;
  }

  function hide(snooze) {
    sheet.hidden = true;
    if (snooze) {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own prompt
    deferred = e;
    settingsBtn.hidden = false;
    if (!snoozed()) show();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    settingsBtn.hidden = true;
    hide(false);
  });

  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    const e = deferred;
    deferred = null;
    e.prompt();
    const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
    hide(outcome !== 'accepted');
  });
  laterBtn.addEventListener('click', () => hide(true));
  closeBtn.addEventListener('click', () => hide(true));
  settingsBtn.addEventListener('click', show);

  // Platforms without an install event: show instructions after a short delay.
  settingsBtn.hidden = !manualSteps(platform);
  // Chromium browsers usually fire the install event within a few seconds; give them time.
  const chromium = ['chrome', 'edge', 'samsung', 'opera'].includes(platform.browser);
  setTimeout(() => {
    if (!deferred && !snoozed() && manualSteps(platform)) show();
  }, chromium ? 4000 : 1500);
}
