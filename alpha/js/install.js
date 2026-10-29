// "Install the app" sheet for visitors who opened the scoreboard in a browser tab.
//
// Chromium browsers (Chrome, Edge, Samsung Internet, Vivaldi on Android and desktop) fire
// `beforeinstallprompt`, which lets our Install button open the real install dialog: one tap.
// iOS/iPadOS never allows a site to install itself, so there (and in browsers without the
// event) we show the exact taps for the visitor's browser. Some browsers, like Vivaldi on
// iPhone, hide their name from websites, so the sheet also lets the visitor pick their browser.

import { EDITION } from './edition.js';
import { t } from './i18n.js';

const DISMISS_KEY = EDITION.installDismissKey;

// What the install offer decided, shown in settings to help diagnose "the pop-up doesn't appear".
const status = { platform: null, installed: false, oneTap: false, dismissed: false, shown: false };

export function installStatus() {
  return { ...status };
}

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

const keepWebApp = () => ({ icon: null, text: t('install.step.keepWebApp') });

const IOS = {
  safari: (os) => [
    {
      icon: 'i-share',
      text: os === 'ipados' ? t('install.step.shareTopRight') : t('install.step.shareBottom'),
      note: t('install.step.noShareSafari'),
    },
    { icon: 'i-add', text: t('install.step.scrollAddHome') },
    keepWebApp(),
  ],
  chrome: () => [
    { icon: 'i-share', text: t('install.step.shareInAddressBar'), note: t('install.step.noShareDots') },
    { icon: 'i-add', text: t('install.step.scrollAddHome') },
    keepWebApp(),
  ],
  vivaldi: () => [
    { icon: 'vivaldi', text: t('install.step.vivaldiButton') },
    { icon: 'i-share', text: t('install.step.sharePage') },
    { icon: 'i-add', text: t('install.step.scrollAddHome') },
    keepWebApp(),
  ],
  edge: () => [
    { icon: 'i-dots', text: t('install.step.dotsBottom') },
    { icon: 'i-share', text: t('install.step.share') },
    { icon: 'i-add', text: t('install.step.scrollAddHome') },
    keepWebApp(),
  ],
  firefox: () => [
    { icon: 'i-share', text: t('install.step.shareInAddressBar'), note: t('install.step.noShareMenu') },
    { icon: 'i-add', text: t('install.step.addHomeScreen') },
    { icon: null, text: t('install.step.add') },
  ],
  other: () => [
    { icon: 'i-share', text: t('install.step.menuShare') },
    { icon: 'i-add', text: t('install.step.addHomeThenAdd') },
    { icon: null, text: t('install.step.useSafari') },
  ],
};

const ANDROID = {
  chrome: () => [
    { icon: 'i-menu', text: t('install.step.dotsTopRight') },
    { icon: 'i-add', text: t('install.step.addHomeAndroid') },
    { icon: null, text: t('install.step.install') },
  ],
  samsung: () => [
    { icon: null, text: t('install.step.samsungMenu') },
    { icon: 'i-add', text: t('install.step.samsungAddPage') },
    { icon: null, text: t('install.step.add') },
  ],
  vivaldi: () => [
    { icon: 'vivaldi', text: t('install.step.vivaldiButton') },
    { icon: 'i-add', text: t('install.step.addHomeAndroid') },
    { icon: null, text: t('install.step.install') },
  ],
  edge: () => [
    { icon: 'i-dots', text: t('install.step.dotsBottom') },
    { icon: 'i-add', text: t('install.step.addToPhone') },
    { icon: null, text: t('install.step.install') },
  ],
  firefox: () => [
    { icon: 'i-menu', text: t('install.step.dotsVertical') },
    { icon: 'i-add', text: t('install.step.addAppHome'), note: t('install.step.olderInstall') },
  ],
  other: () => [
    { icon: 'i-menu', text: t('install.step.openMenu') },
    { icon: 'i-add', text: t('install.step.installOrAdd') },
  ],
};

const DESKTOP = {
  chrome: () => [
    { icon: 'i-download', text: t('install.step.installIcon') },
    { icon: null, text: t('install.step.chromeMenu') },
  ],
  edge: () => [
    { icon: 'i-download', text: t('install.step.installIcon') },
    { icon: null, text: t('install.step.edgeMenu') },
  ],
  vivaldi: () => [
    { icon: null, text: t('install.step.vivaldiDesktop') },
  ],
  safari: () => [
    { icon: null, text: t('install.step.addToDock') },
    { icon: null, text: t('install.step.clickAdd') },
  ],
  // Firefox on a computer can't install web apps: point to a browser that can.
  firefox: (os) => [
    { icon: null, text: t('install.step.firefoxDesktop') },
    { icon: null, text: os === 'macos' ? t('install.step.openInSafariChromeEdge') : t('install.step.openInChromeEdge') },
    { icon: null, text: t('install.step.followThere') },
  ],
};

const BROWSERS = {
  safari: 'Safari', chrome: 'Chrome', vivaldi: 'Vivaldi', edge: 'Edge', firefox: 'Firefox', samsung: 'Samsung Internet',
};
export const browserName = (b) => BROWSERS[b] ?? t('install.anotherBrowser');

// Which browsers this could be. Vivaldi (and others) on iPhone and Android present themselves
// to websites exactly like Chrome, so "Chrome" really means "Chrome or Vivaldi" there.
export function likelyBrowsers({ os, browser }) {
  if (browser === 'other') return [];
  if (browser === 'chrome' && ['ios', 'ipados', 'android'].includes(os)) return ['chrome', 'vivaldi'];
  return [browser];
}

// Browsers the visitor can choose from on this OS, the likely ones first.
export function browserChoices(os, likely = []) {
  let list;
  if (os === 'ios' || os === 'ipados') list = ['safari', 'chrome', 'vivaldi', 'edge', 'firefox', 'other'];
  else if (os === 'android') list = ['chrome', 'samsung', 'vivaldi', 'edge', 'firefox', 'other'];
  else if (os === 'macos') list = ['safari', 'chrome', 'edge', 'vivaldi', 'firefox'];
  else list = ['chrome', 'edge', 'vivaldi', 'firefox'];
  const first = likely.filter((b) => list.includes(b));
  return [...first, ...list.filter((b) => !first.includes(b))];
}

// Steps for this OS and browser, or null when the browser can't install apps at all.
export function manualSteps({ os, browser }) {
  if (os === 'ios' || os === 'ipados') return (IOS[browser] ?? IOS.other)(os);
  if (os === 'android') return (ANDROID[browser] ?? ANDROID.other)(os);
  if (os === 'macos' && browser === 'safari') return DESKTOP.safari();
  if (browser === 'safari') return null; // Safari outside Apple devices doesn't exist
  return DESKTOP[browser]?.(os) ?? null;
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

export function setupInstallPrompt(root, settingsBtn, { autoShow = true } = {}) {
  const platform = detectPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  status.platform = platform;
  status.installed = isInstalled();
  if (status.installed) return;
  const el = (id) => root.querySelector(`#${id}`);
  const canInstallHere = Boolean(manualSteps(platform));
  let deferred = null;

  function dismissedThisVisit() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  }

  function showView(view) {
    el('installPick').hidden = view !== 'pick';
    el('installGuide').hidden = view !== 'guide';
    el('installOneTap').hidden = view !== 'onetap';
    el('installBtn').hidden = view !== 'onetap';
    el('installLater').textContent = view === 'guide' ? t('common.close') : t('common.notNow');
    el('installCard').scrollTop = 0;
  }

  function showPicker() {
    const likely = likelyBrowsers(platform).filter((b) => browserChoices(platform.os).includes(b));
    // One match: tag it. Several (Chrome or Vivaldi): say so, since websites can't tell them apart.
    el('installHint').hidden = likely.length < 2;
    el('installHint').textContent = t('install.looksLike', { browsers: likely.map(browserName).join(t('install.or')) });
    el('installChoices').replaceChildren(...browserChoices(platform.os, likely).map((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.className = 'browser-choice';
      btn.append(browserName(b));
      if (likely.length === 1 && b === likely[0]) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t('install.detected');
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
    el('installGuideTitle').textContent = browser === 'other' ? t('install.fromBrowser') : t('install.withBrowser', { browser: browserName(browser) });
    if (browser === 'firefox' && !['ios', 'ipados', 'android'].includes(platform.os)) el('installGuideTitle').textContent = t('install.useAnother');
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
    status.shown = true;
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
    status.oneTap = true;
    settingsBtn.hidden = false;
    // Upgrade to one-tap install, unless the visitor is already reading instructions.
    if (root.hidden ? autoShow && !dismissedThisVisit() : el('installGuide').hidden) show();
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

  // Show straight away when the site is opened in a browser (not on a quick visit, autoShow false).
  settingsBtn.hidden = !canInstallHere;
  status.dismissed = dismissedThisVisit() || !autoShow;
  if (!status.dismissed) show();
}
