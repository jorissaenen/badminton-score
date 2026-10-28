// The Account section in settings. Signed out: "Continue with Google", or on request an e-mailed
// sign-in link (in the installed app also a box to paste that link). Signed in: who, whether the
// app is online, sign out.
import { EDITION } from './edition.js';
import { isInstalled } from './install.js';
import {
  checkServer, completeEmailLink, isEmailLink, isEmailLinkLanding, onUser, saveProfile, sendEmailLink,
  signInWithGoogle, signOut, storedEmail,
} from './cloud.js';

// Remembers that someone was signed in, so the next start reconnects without opening settings.
const SIGNED_IN_KEY = `${EDITION.storageKey}-signed-in`;
// When the last sign-in link was sent, so "Resend" waits a minute, also after switching to the
// mail app and back (which may reload the app).
const SENT_KEY = `${EDITION.storageKey}-signin-sent`;
const RESEND_AFTER_MS = 60_000;
// Seconds between connection attempts; after the last one it says "Working offline" and keeps
// trying every minute.
const RETRY_S = [5, 10, 20];
const OFFLINE_RETRY_S = 60;
const CHECK_TIMEOUT_MS = 10_000;

const AUTH_ERRORS = {
  'auth/popup-closed-by-user': 'Sign-in cancelled.',
  'auth/cancelled-popup-request': 'Sign-in cancelled.',
  'auth/network-request-failed': 'No internet connection. Scoring keeps working; try again later.',
  'auth/unauthorized-domain': 'This web address isn’t allowed yet in Firebase (Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'This sign-in method isn’t switched on in Firebase yet.',
  'auth/invalid-email': 'That e-mail address doesn’t look right.',
  'auth/invalid-action-code': 'This sign-in link was already used or has expired. Ask for a new one.',
  'auth/expired-action-code': 'This sign-in link has expired. Ask for a new one.',
};

function explain(e) {
  return AUTH_ERRORS[e?.code] ?? `Something went wrong (${e?.code || e?.message || e}).`;
}

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* only affects convenience on the next start */ }
}

function initials(name) {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase() || '?';
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)),
  ]);
}

// openSettings shows the settings dialog (with the Account section on top).
export function setupAccount($, notify = () => {}, openSettings = () => {}) {
  if (!EDITION.firebase) {
    $('accountGroup').hidden = true;
    return { start() {} };
  }
  let started = false;
  const status = (text) => { $('accountStatus').textContent = text; };
  const busy = (on) => {
    for (const id of ['signInGoogle', 'signInEmailBtn', 'signInLinkBtn', 'signInHereBtn', 'signOutBtn']) {
      $(id).disabled = on;
    }
    if (!on) showResend();
  };

  // ---------- signed out: Google first, e-mail on request ----------

  const sentAt = () => Number(stored(SENT_KEY)) || 0;
  const linkPending = () => Boolean(storedEmail()) && Date.now() - sentAt() < 3600_000;

  function showEmailStep(on) {
    $('emailStep').hidden = !on;
    $('useEmailBtn').hidden = on;
    // Pasting is only needed in the installed app: in a browser tab the link opens the page itself.
    $('accountPaste').hidden = !(isInstalled() && linkPending());
    if (on && !$('signInEmail').value) $('signInEmail').value = storedEmail();
    $('emailSent').hidden = !linkPending();
    if (linkPending()) {
      $('emailSent').textContent = `\u2713 Sign-in link sent to ${storedEmail()}. It may take a minute; check spam too.`;
    }
  }

  $('useEmailBtn').addEventListener('click', () => {
    showEmailStep(true);
    $('signInEmail').focus();
  });

  // The Send link button: "Sending…" with a spinner, then "Resend in 59 s" counting down, then
  // "Resend link".
  let sending = false;
  let resendTimer = null;
  function showResend() {
    const btn = $('signInEmailBtn');
    clearTimeout(resendTimer);
    btn.classList.toggle('sending', sending);
    if (sending) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
      return;
    }
    const left = Math.ceil((sentAt() + RESEND_AFTER_MS - Date.now()) / 1000);
    if (left > 0 && left <= RESEND_AFTER_MS / 1000) {
      btn.disabled = true;
      btn.textContent = `Resend in ${left} s`;
      resendTimer = setTimeout(showResend, 1000);
    } else {
      btn.disabled = false;
      btn.textContent = linkPending() ? 'Resend link' : 'Send link';
    }
  }

  async function sendLink() {
    const email = $('signInEmail').value.trim();
    if (!email) {
      status('Type your e-mail address first.');
      return;
    }
    sending = true;
    $('emailSent').hidden = true;
    busy(true);
    showResend();
    try {
      await start();
      await sendEmailLink(email);
      store(SENT_KEY, String(Date.now()));
      showEmailStep(true);
      status('');
    } catch (e) {
      status(explain(e));
    } finally {
      sending = false;
      busy(false);
    }
  }
  $('signInEmailBtn').addEventListener('click', sendLink);
  $('signInEmail').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter would otherwise close the settings
    if (!$('signInEmailBtn').disabled) sendLink();
  });

  // Buttons stay usable during Google sign-in: Google's page hides from the app whether its window
  // was closed, so a cancelled sign-in may never be reported, and that must not lock the buttons.
  $('signInGoogle').addEventListener('click', async () => {
    status('Opening Google…');
    try {
      await start();
      await signInWithGoogle();
      status('');
    } catch (e) {
      status(explain(e));
    }
  });

  // Back from Google's window without signing in: don't leave "Opening Google…" standing.
  window.addEventListener('focus', () => {
    setTimeout(() => {
      if ($('accountStatus').textContent === 'Opening Google…') status('');
    }, 1500);
  });

  async function signInWithLink(link, email) {
    busy(true);
    try {
      await start();
      if (!(await isEmailLink(link))) {
        status('That isn’t a sign-in link. Copy the link from the e-mail (press and hold it → Copy).');
        return false;
      }
      await completeEmailLink(link, email);
      store(SENT_KEY, null);
      $('signInLink').value = '';
      status('');
      notify('Signed in');
      return true;
    } catch (e) {
      status(explain(e));
      return false;
    } finally {
      busy(false);
    }
  }

  // A link pasted into the app. It belongs to the address this app asked a link for.
  function pastedLink() {
    const link = $('signInLink').value.trim();
    if (!link) return;
    const email = storedEmail() || $('signInEmail').value.trim();
    if (!email) {
      status('Type the e-mail address the link was sent to above, then paste the link again.');
      return;
    }
    signInWithLink(link, email);
  }
  $('signInLinkBtn').addEventListener('click', pastedLink);
  $('signInLink').addEventListener('input', () => {
    if (/oobCode=/.test($('signInLink').value)) pastedLink(); // signs in as soon as a link is pasted
  });
  $('signInLink').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter would otherwise close the settings
    pastedLink();
  });

  // A link that opened this page but was asked for elsewhere (see the landing section below).
  let landingLink = null;

  $('copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(landingLink);
      status('Link copied. Now open the app, ⚙ → Account, and paste it.');
    } catch {
      status(`Copy this link by hand: ${landingLink}`);
    }
  });

  $('signInHereBtn').addEventListener('click', () => {
    const email = prompt('The e-mail address the link was sent to:');
    if (email?.trim()) signInWithLink(landingLink, email.trim());
  });

  // ---------- signed in: who, and whether the app is online ----------

  let currentUser = null;
  let failures = 0;
  let connTimer = null;
  let retryAt = 0;
  let checkId = 0; // only the latest check's outcome counts

  function showConn(state, text) {
    $('accountConn').className = `account-conn ${state}`;
    $('accountConnText').textContent = text;
  }

  function showRetryCountdown() {
    clearTimeout(connTimer);
    const left = Math.ceil((retryAt - Date.now()) / 1000);
    if (left <= 0) {
      checkConnection();
      return;
    }
    if (failures < RETRY_S.length) showConn('trying', `No connection · retrying in ${left} s`);
    connTimer = setTimeout(showRetryCountdown, Math.min(1000, retryAt - Date.now()));
  }

  async function checkConnection() {
    clearTimeout(connTimer);
    const user = currentUser;
    if (!user) return;
    const id = ++checkId;
    if (failures < RETRY_S.length) showConn('trying', 'Connecting…');
    try {
      await withTimeout(checkServer(user), CHECK_TIMEOUT_MS);
      if (id !== checkId) return;
      failures = 0;
      showConn('online', 'Online');
    } catch (e) {
      if (id !== checkId) return;
      if (e.code === 'permission-denied') {
        showConn('offline', 'Online, but the club database isn’t set up yet');
        return;
      }
      failures += 1;
      if (failures >= RETRY_S.length) showConn('offline', 'Working offline');
      retryAt = Date.now() + (RETRY_S[failures - 1] ?? OFFLINE_RETRY_S) * 1000;
      showRetryCountdown();
    }
  }

  // Back online, or back in the app: check right away instead of waiting for the next retry.
  window.addEventListener('online', () => { failures = 0; checkConnection(); });
  window.addEventListener('offline', () => { if (currentUser) checkConnection(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser && !$('accountConn').classList.contains('online')) checkConnection();
  });

  // The photo is cached by the service worker; without it (or offline before the first visit)
  // the person's initials show instead.
  $('accountPhoto').addEventListener('error', () => {
    $('accountPhoto').hidden = true;
    $('accountInitials').hidden = false;
  });
  $('accountPhoto').addEventListener('load', () => {
    $('accountInitials').hidden = true;
  });

  function showUser(user) {
    currentUser = user;
    failures = 0;
    checkId += 1;
    clearTimeout(connTimer);
    if (user) landingLink = null;
    $('accountLanding').hidden = Boolean(user) || !landingLink;
    $('accountOut').hidden = Boolean(user) || Boolean(landingLink);
    $('accountIn').hidden = !user;
    store(SIGNED_IN_KEY, user ? '1' : null);
    if (!user) {
      showEmailStep(linkPending());
      return;
    }
    const name = user.displayName || user.email?.split('@')[0] || 'Signed in';
    $('accountName').textContent = name;
    $('accountInitials').textContent = initials(name);
    $('accountInitials').hidden = false;
    $('accountPhoto').hidden = !user.photoURL;
    if (user.photoURL) $('accountPhoto').src = user.photoURL;
    else $('accountPhoto').removeAttribute('src');
    saveProfile(user).catch(() => { /* the connection check reports problems */ });
    checkConnection();
  }

  // Load Firebase and follow the signed-in user. Safe to call more than once.
  async function start() {
    if (started) return;
    started = true;
    status('');
    try {
      await onUser((user) => { showUser(user); });
    } catch {
      started = false; // retry next time, e.g. once back online
      status('Can’t reach the sign-in service right now (offline?). Scoring keeps working.');
    }
  }

  $('signOutBtn').addEventListener('click', async () => {
    busy(true);
    try {
      await signOut();
      status('Signed out.');
    } catch (e) {
      status(explain(e));
    } finally {
      busy(false);
    }
  });

  showEmailStep(linkPending());
  showResend();

  // Opened from a sign-in e-mail. Asked for in this same browser or app: finish signing in.
  // Asked for elsewhere (on iPhone: the installed app, whose links open in Safari): don't use up
  // the one-time link here, but offer to copy it for the app, or to sign in here after all.
  if (isEmailLinkLanding()) {
    const link = location.href;
    history.replaceState(null, '', location.pathname); // drop the one-time code from the address
    const email = storedEmail();
    if (email) {
      signInWithLink(link, email).then((ok) => { if (!ok) openSettings(); });
    } else {
      landingLink = link;
      start().then(() => {
        showUser(null);
        openSettings();
      });
    }
  } else if (stored(SIGNED_IN_KEY) === '1') {
    start(); // reconnect in the background after the scoreboard is up
  }

  return { start };
}
