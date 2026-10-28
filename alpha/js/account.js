// The Account section in settings: sign in with Google or an e-mail link, see who's signed in and
// whether the database is reachable, sign out.
import { EDITION } from './edition.js';
import {
  completeEmailLink, isEmailLink, isEmailLinkLanding, onUser, saveProfile, sendEmailLink, signInWithGoogle,
  signOut, storedEmail,
} from './cloud.js';

// Remembers that someone was signed in, so the next start reconnects without opening settings.
const SIGNED_IN_KEY = `${EDITION.storageKey}-signed-in`;

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

function remember(on) {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch { /* only affects reconnecting on the next start */ }
}

function rememberedSignIn() {
  try { return localStorage.getItem(SIGNED_IN_KEY) === '1'; } catch { return false; }
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
  };

  // A link that opened this page but was asked for elsewhere (see the landing section below).
  let landingLink = null;

  async function showUser(user) {
    if (user) landingLink = null;
    $('accountLanding').hidden = Boolean(user) || !landingLink;
    $('accountOut').hidden = Boolean(user) || Boolean(landingLink);
    $('accountIn').hidden = !user;
    // Offer pasting a link once one was asked for here.
    $('accountPaste').hidden = !storedEmail();
    remember(Boolean(user));
    if (!user) return;
    $('accountName').textContent = user.displayName || user.email || 'Signed in';
    $('accountPhoto').hidden = !user.photoURL;
    if (user.photoURL) $('accountPhoto').src = user.photoURL;
    $('accountDb').textContent = 'Database: connecting…';
    try {
      await saveProfile(user);
      $('accountDb').textContent = 'Database: connected ✓';
    } catch (e) {
      $('accountDb').textContent = e.code === 'permission-denied'
        ? 'Database: the security rules aren’t published yet (see docs/firebase-setup.md).'
        : `Database: not reachable (${e.code || e.message}).`;
    }
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

  // Buttons stay usable during Google sign-in: Google's page hides from the app whether its window
  // was closed, so a cancelled sign-in may never be reported, and that must not lock the buttons.
  $('signInGoogle').addEventListener('click', async () => {
    status('Opening Google\u2026');
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
      if ($('accountStatus').textContent === 'Opening Google\u2026') status('');
    }, 1500);
  });

  async function sendLink() {
    const email = $('signInEmail').value.trim();
    if (!email) {
      status('Type your e-mail address first.');
      return;
    }
    busy(true);
    try {
      await start();
      await sendEmailLink(email);
      $('accountPaste').hidden = false;
      status(`Sign-in link sent to ${email}. It may take a minute (check spam too).`);
    } catch (e) {
      status(explain(e));
    } finally {
      busy(false);
    }
  }
  $('signInEmailBtn').addEventListener('click', sendLink);
  $('signInEmail').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter would otherwise close the settings
    sendLink();
  });

  async function signInWithLink(link, email) {
    busy(true);
    try {
      await start();
      if (!(await isEmailLink(link))) {
        status('That isn\u2019t a sign-in link. Copy the link from the e-mail (press and hold it \u2192 Copy).');
        return false;
      }
      await completeEmailLink(link, email);
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

  $('copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(landingLink);
      status('Link copied. Now open the app, \u2699 \u2192 Account, and paste it.');
    } catch {
      status(`Copy this link by hand: ${landingLink}`);
    }
  });

  $('signInHereBtn').addEventListener('click', () => {
    const email = prompt('The e-mail address the link was sent to:');
    if (email?.trim()) signInWithLink(landingLink, email.trim());
  });

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
  } else if (rememberedSignIn()) {
    start(); // reconnect in the background after the scoreboard is up
  }

  return { start };
}
