// "Install the app" sheet for visitors who opened the scoreboard in a browser tab.
//
// Chromium browsers (Chrome, Edge, Samsung Internet, Vivaldi on Android and desktop) fire
// `beforeinstallprompt`, which lets our Install button open the real install dialog: one tap.
// iOS/iPadOS never allows a site to install itself, so there (and in browsers without the
// event) we show the exact taps for the visitor's browser. Some browsers, like Vivaldi on
// iPhone, hide their name from websites, so the sheet also lets the visitor pick their browser.

const DISMISS_KEY = 'badminton-score-install-dismissed';

// ---------- detection (pure, so it can be unit-tested) ----------

export function isInstalled(win = globalThis) {
  return ['fullscreen', 'standalone', 'minimal-ui'].some((m) => win.matchMedia?.(`(display-mode: ${m})`).matches)
    || win.navigator?.standalone === true;
}

// Returns { os: 'ios'|'ipados'|'android'|'macos'|'windows'|'linux'|'chromeos'|'other',
//           browser: 'safari'|'chrome'|'edge'|'firefox'|'samsung'|'vivaldi'|'opera'|'other' }
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
  if (/Vivaldi|VivaiOS/.test(ua)) browser = 'vivaldi';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = 'edge';
  else if (/OPR\/|OPiOS|OPT\//.test(ua)) browser = 'opera';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { os, browser };
}

// ---------- step-by-step guides ----------
// Each step is { icon, text, note? }. **bold** marks the exact label to tap.
// icon is a sprite id from index.html, or 'vivaldi' for a "V" badge.

const keepWebApp = { icon: null, text: 'Keep **Open as Web App** switched on, then tap **Add**' };

const IOS = {
  safari: (os) => [
    {
      icon: 'i-share',
      text: os === 'ipados' ? 'Tap the **Share** button at the top right' : 'Tap the **Share** button at the bottom',
      note: 'Don’t see it? Tap **⋯** next to the address bar, then **Share**',
    },
    { icon: 'i-add', text: 'Scroll down and tap **Add to Home Screen**' },
    keepWebApp,
  ],
  chrome: () => [
    { icon: 'i-share', text: 'Tap the **Share** icon in the address bar', note: 'Don’t see it? Tap **⋯**, then **Share**' },
    { icon: 'i-add', text: 'Scroll down and tap **Add to Home Screen**' },
    keepWebApp,
  ],
  vivaldi: () => [
    { icon: 'vivaldi', text: 'Tap the **Vivaldi** button (the V logo)' },
    { icon: 'i-share', text: 'Tap **Share Page**' },
    { icon: 'i-add', text: 'Scroll down and tap **Add to Home Screen**' },
    keepWebApp,
  ],
  edge: () => [
    { icon: 'i-dots', text: 'Tap **⋯** at the bottom of the screen' },
    { icon: 'i-share', text: 'Tap **Share**' },
    { icon: 'i-add', text: 'Scroll down and tap **Add to Home Screen**' },
    keepWebApp,
  ],
  firefox: () => [
    { icon: 'i-share', text: 'Tap the **Share** icon in the address bar', note: 'Don’t see it? Tap the **☰** menu, then **Share**' },
    { icon: 'i-add', text: 'Tap **Add to Home Screen**' },
    { icon: null, text: 'Tap **Add**' },
  ],
  other: () => [
    { icon: 'i-share', text: 'Open the browser’s menu and tap **Share**' },
    { icon: 'i-add', text: 'Tap **Add to Home Screen**, then **Add**' },
    { icon: null, text: 'Not there? Open this page in **Safari** and follow the Safari steps' },
  ],
};

const ANDROID = {
  chrome: () => [
    { icon: 'i-menu', text: 'Tap **⋮** at the top right' },
    { icon: 'i-add', text: 'Tap **Add to Home screen**' },
    { icon: null, text: 'Tap **Install**' },
  ],
  samsung: () => [
    { icon: null, text: 'Tap **≡** at the bottom right' },
    { icon: 'i-add', text: 'Tap **Add page to**, then **Home screen**' },
    { icon: null, text: 'Tap **Add**' },
  ],
  vivaldi: () => [
    { icon: 'vivaldi', text: 'Tap the **Vivaldi** button (the V logo)' },
    { icon: 'i-add', text: 'Tap **Add to Home screen**' },
    { icon: null, text: 'Tap **Install**' },
  ],
  edge: () => [
    { icon: 'i-dots', text: 'Tap **⋯** at the bottom of the screen' },
    { icon: 'i-add', text: 'Tap **Add to phone**' },
    { icon: null, text: 'Tap **Install**' },
  ],
  firefox: () => [
    { icon: 'i-menu', text: 'Tap **⋮**' },
    { icon: 'i-add', text: 'Tap **Add app to Home screen**', note: 'Older versions: **Install**' },
  ],
  other: () => [
    { icon: 'i-menu', text: 'Open the browser menu' },
    { icon: 'i-add', text: 'Tap **Install app** or **Add to Home screen**' },
  ],
};

const DESKTOP = {
  chrome: () => [
    { icon: 'i-download', text: 'Click the **Install** icon at the right of the address bar' },
    { icon: null, text: 'Or: **⋮** → **Cast, save and share** → **Install page as app**' },
  ],
  edge: () => [
    { icon: 'i-download', text: 'Click the **Install** icon at the right of the address bar' },
    { icon: null, text: 'Or: **⋯** → **Apps** → **Install this site as an app**' },
  ],
  vivaldi: () => [
    { icon: null, text: 'Right-click the tab and choose **Install** (or use the install icon in the address bar)' },
  ],
  safari: () => [
    { icon: null, text: 'In the menu bar, choose **File** → **Add to Dock**' },
    { icon: null, text: 'Click **Add**' },
  ],
};

export const BROWSER_NAMES = {
  safari: 'Safari', chrome: 'Chrome', vivaldi: 'Vivaldi', edge: 'Edge', firefox: 'Firefox',
  samsung: 'Samsung Internet', other: 'Another browser',
};

// Browsers the visitor can choose from on this OS, the detected one first.
export function browserChoices(os, detected = null) {
  let list;
  if (os === 'ios' || os === 'ipados') list = ['safari', 'chrome', 'vivaldi', 'edge', 'firefox', 'other'];
  else if (os === 'android') list = ['chrome', 'samsung', 'vivaldi', 'edge', 'firefox', 'other'];
  else if (os === 'macos') list = ['safari', 'chrome', 'edge', 'vivaldi'];
  else list = ['chrome', 'edge', 'vivaldi'];
  if (detected && list.includes(detected) && detected !== 'other') {
    list = [detected, ...list.filter((b) => b !== detected)];
  }
  return list;
}

// Steps for this OS and browser, or null when the browser can't install apps at all.
export function manualSteps({ os, browser }) {
  if (os === 'ios' || os === 'ipados') return (IOS[browser] ?? IOS.other)(os);
  if (os === 'android') return (ANDROID[browser] ?? ANDROID.other)(os);
  if (os === 'macos' && browser === 'safari') return DESKTOP.safari();
  return DESKTOP[browser]?.() ?? null; // e.g. Firefox on desktop: no app install support
}

// ---------- UI ----------

function formatted(text) {
  // Our own fixed strings: turn **label** into <strong>label</strong> without using innerHTML.
  return text.split('**').map((part, i) => {
    if (i % 2 === 0) return document.createTextNode(part);
    const b = document.createElement('strong');
    b.textContent = part;
    return b;
  });
}

// Small picture of the button the visitor has to tap.
function keyPicture(icon) {
  if (!icon) return null;
  const key = document.createElement('span');
  key.className = 'key';
  key.setAttribute('aria-hidden', 'true');
  if (icon === 'vivaldi') {
    key.classList.add('vivaldi');
    key.textContent = 'V';
    return key;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${icon}`);
  svg.append(use);
  key.append(svg);
  return key;
}

export function setupInstallPrompt(root, settingsBtn) {
  if (isInstalled()) return;
  const el = (id) => root.querySelector(`#${id}`);
  const platform = detectPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const canInstallHere = Boolean(manualSteps(platform)); // false e.g. for Firefox on desktop
  let deferred = null;

  function dismissedThisVisit() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  }

  function showView(view) {
    el('installPick').hidden = view !== 'pick';
    el('installGuide').hidden = view !== 'guide';
    el('installOneTap').hidden = view !== 'onetap';
    el('installBtn').hidden = view !== 'onetap';
    el('installLater').textContent = view === 'guide' ? 'Close' : 'Not now';
    el('installCard').scrollTop = 0;
  }

  function showPicker() {
    el('installChoices').replaceChildren(...browserChoices(platform.os, platform.browser).map((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.className = 'browser-choice';
      btn.append(BROWSER_NAMES[b]);
      if (i === 0 && b === platform.browser) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'Detected';
        btn.append(tag);
      }
      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.textContent = '›';
      btn.append(chevron);
      btn.addEventListener('click', () => showGuide(b));
      return btn;
    }));
    showView('pick');
  }

  function showGuide(browser) {
    const steps = manualSteps({ os: platform.os, browser }) ?? [];
    el('installGuideTitle').textContent = browser === 'other' ? 'Install from your browser' : `Install with ${BROWSER_NAMES[browser]}`;
    el('installSteps').replaceChildren(...steps.map((step) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.className = 'step-text';
      text.append(...formatted(step.text));
      if (step.note) {
        const note = document.createElement('small');
        note.append(...formatted(step.note));
        text.append(note);
      }
      const key = keyPicture(step.icon);
      li.append(text, ...(key ? [key] : []));
      return li;
    }));
    showView('guide');
  }

  function show() {
    if (deferred) showView('onetap');
    else if (canInstallHere) showPicker();
    else return;
    root.hidden = false;
  }

  function hide(dismiss) {
    root.hidden = true;
    if (dismiss) {
      try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own prompt
    deferred = e;
    settingsBtn.hidden = false;
    // Upgrade to one-tap install, unless the visitor is already reading instructions.
    if (root.hidden ? !dismissedThisVisit() : el('installGuide').hidden) show();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    settingsBtn.hidden = true;
    hide(false);
  });

  el('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    const e = deferred;
    deferred = null;
    e.prompt();
    const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
    hide(outcome !== 'accepted');
  });
  el('installBack').addEventListener('click', showPicker);
  el('installLater').addEventListener('click', () => hide(true));
  el('installClose').addEventListener('click', () => hide(true));
  root.addEventListener('click', (e) => { if (e.target === root) hide(true); }); // tap outside the card
  settingsBtn.addEventListener('click', show);

  // Show straight away when the site is opened in a browser.
  settingsBtn.hidden = !canInstallHere;
  if (!dismissedThisVisit()) show();
}
