// Who is signed in, and whether the app reaches the database. No screens here: the You and Sign in
// screens show this state and call these functions.
import { EDITION } from './edition.js';
import { isInstalled } from './install.js';
import {
  checkServer, completeEmailLink, isEmailLink, isEmailLinkLanding, onUser, saveProfile, sendEmailLink,
  signInWithGoogle, signOut as cloudSignOut, storedEmail,
} from './cloud.js';

const SIGNED_IN_KEY = `${EDITION.storageKey}-signed-in`;
// When the last sign-in link was sent, so "Resend" waits a minute, also after switching to the
// mail app and back (which may reload the app).
const SENT_KEY = `${EDITION.storageKey}-signin-sent`;
export const RESEND_AFTER_MS = 60_000;
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
export const explain = (e) => AUTH_ERRORS[e?.code] ?? `Something went wrong (${e?.code || e?.message || e}).`;

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* only affects convenience on the next start */ }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)),
  ]);
}

const listeners = new Set();
const s = {
  enabled: Boolean(EDITION.firebase),
  started: false,
  ready: false, // the first answer about who is signed in has come in
  user: null,
  conn: { state: 'trying', text: 'Connecting…' }, // online | trying | offline
  landingLink: null, // a sign-in link opened here but asked for elsewhere (installed app)
  message: '',
};
export const session = s;
export const onSession = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const emit = () => listeners.forEach((cb) => cb(s));
export const user = () => s.user;
const say = (text) => { s.message = text; emit(); };

export const sentAt = () => Number(stored(SENT_KEY)) || 0;
export const linkPending = () => Boolean(storedEmail()) && Date.now() - sentAt() < 3600_000;
export const pendingEmail = () => storedEmail();
// Pasting the link is only needed in the installed app: in a browser tab the link opens the page.
export const needsPaste = () => isInstalled() && linkPending();

// ---------- connection check ----------

let failures = 0;
let connTimer = null;
let retryAt = 0;
let checkId = 0;

function setConn(state, text) {
  s.conn = { state, text };
  emit();
}

function countdown() {
  clearTimeout(connTimer);
  const left = Math.ceil((retryAt - Date.now()) / 1000);
  if (left <= 0) { check(); return; }
  if (failures < RETRY_S.length) setConn('trying', `No connection · retrying in ${left} s`);
  connTimer = setTimeout(countdown, Math.min(1000, retryAt - Date.now()));
}

async function check() {
  clearTimeout(connTimer);
  const u = s.user;
  if (!u) return;
  const id = ++checkId;
  if (failures < RETRY_S.length) setConn('trying', 'Connecting…');
  try {
    await withTimeout(checkServer(u), CHECK_TIMEOUT_MS);
    if (id !== checkId) return;
    failures = 0;
    setConn('online', 'Online');
  } catch (e) {
    if (id !== checkId) return;
    if (e.code === 'permission-denied') { setConn('offline', 'Online, but the database isn’t set up yet'); return; }
    failures += 1;
    if (failures >= RETRY_S.length) setConn('offline', 'Working offline');
    retryAt = Date.now() + (RETRY_S[failures - 1] ?? OFFLINE_RETRY_S) * 1000;
    countdown();
  }
}

window.addEventListener('online', () => { failures = 0; check(); });
window.addEventListener('offline', () => { if (s.user) check(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && s.user && s.conn.state !== 'online') check();
});

function showUser(u) {
  s.user = u;
  s.ready = true;
  failures = 0;
  checkId += 1;
  clearTimeout(connTimer);
  if (u) s.landingLink = null;
  store(SIGNED_IN_KEY, u ? '1' : null);
  emit();
  if (u) {
    saveProfile(u).catch(() => { /* the connection check reports problems */ });
    check();
  }
}

// Loads Firebase and follows the signed-in user. Safe to call more than once.
export async function start() {
  if (!s.enabled || s.started) return;
  s.started = true;
  try {
    await onUser(showUser);
  } catch {
    s.started = false; // retry next time, e.g. once back online
    say('Can’t reach the sign-in service right now (offline?). Scoring keeps working.');
  }
}

// ---------- signing in and out ----------

export async function google() {
  say('Opening Google…');
  try {
    await start();
    await signInWithGoogle();
    say('');
  } catch (e) {
    say(explain(e));
  }
}
// Back from Google's window without signing in: don't leave "Opening Google…" standing.
window.addEventListener('focus', () => setTimeout(() => { if (s.message === 'Opening Google…') say(''); }, 1500));

export async function sendLink(email) {
  if (!email) { say('Type your e-mail address first.'); return false; }
  try {
    await start();
    await sendEmailLink(email);
    store(SENT_KEY, String(Date.now()));
    say('');
    return true;
  } catch (e) {
    say(explain(e));
    return false;
  }
}

export async function signInWithLink(link, email) {
  try {
    await start();
    if (!(await isEmailLink(link))) {
      say('That isn’t a sign-in link. Copy the link from the e-mail (press and hold it → Copy).');
      return false;
    }
    await completeEmailLink(link, email);
    store(SENT_KEY, null);
    say('');
    return true;
  } catch (e) {
    say(explain(e));
    return false;
  }
}

export function pasteLink(link, typedEmail = '') {
  const email = storedEmail() || typedEmail;
  if (!email) { say('Type the e-mail address the link was sent to, then paste the link again.'); return Promise.resolve(false); }
  return signInWithLink(link, email);
}

export async function signOut() {
  try {
    await cloudSignOut();
    say('Signed out.');
  } catch (e) {
    say(explain(e));
  }
}

export const clearMessage = () => { if (s.message) say(''); };

// Opened from a sign-in e-mail. Asked for in this same browser or app: finish signing in. Asked for
// elsewhere (on iPhone: the installed app, whose links open in Safari): don't use up the one-time
// link here; the Sign in screen offers to copy it for the app, or to sign in here after all.
// Returns true when the Sign in screen should open.
export function boot() {
  if (!s.enabled) return false;
  if (isEmailLinkLanding()) {
    const link = location.href;
    history.replaceState(null, '', location.pathname); // drop the one-time code from the address
    const email = storedEmail();
    if (email) {
      signInWithLink(link, email);
      return false;
    }
    s.landingLink = link;
    start();
    return true;
  }
  if (stored(SIGNED_IN_KEY) === '1') start(); // reconnect in the background
  return false;
}
