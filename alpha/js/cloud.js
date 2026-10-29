// Firebase: sign-in and the database. Loaded only when needed (opening settings, a previous
// sign-in, or an e-mail sign-in link), so scoring never waits for it and keeps working offline.
// The SDK comes from Google's servers as plain ES modules; the service worker keeps a copy.
import { EDITION } from './edition.js';

export const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';

let loading = null;

// Automated tests: on localhost, `?emulator` connects to the local Firebase emulators instead of
// the real project (npm run emulators), and offers a fake sign-in.
const EMULATOR = (() => {
  if (typeof location === 'undefined' || location.hostname !== 'localhost') return false;
  try {
    if (new URLSearchParams(location.search).has('emulator')) sessionStorage.setItem('emulator', '1');
    return sessionStorage.getItem('emulator') === '1';
  } catch { return false; }
})();

// Resolves to { auth, db, A (auth functions), F (Firestore functions) }.
export function cloud() {
  loading ??= (async () => {
    if (!EDITION.firebase) throw new Error('No Firebase project for this edition');
    const [{ initializeApp }, A, F] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = initializeApp(EMULATOR ? { ...EDITION.firebase, projectId: 'demo-badminton' } : EDITION.firebase);
    const auth = A.initializeAuth(app, {
      persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence],
      popupRedirectResolver: A.browserPopupRedirectResolver,
    });
    const db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
    if (EMULATOR) {
      A.connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      F.connectFirestoreEmulator(db, 'localhost', 8085);
      globalThis.testSignIn = (uid, name) => A.signInWithCredential(auth, A.GoogleAuthProvider.credential(
        JSON.stringify({ sub: uid, name, email: `${uid}@example.com`, email_verified: true }),
      ));
    }
    return { auth, db, A, F };
  })();
  loading.catch(() => { loading = null; }); // allow a retry, e.g. once back online
  return loading;
}

const EMAIL_KEY = `${EDITION.storageKey}-signin-email`;

// Google: a pop-up window; if the browser blocks pop-ups, a full-page redirect instead.
export async function signInWithGoogle() {
  const { auth, A } = await cloud();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await A.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      return A.signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

// E-mail link: Firebase mails a one-time link that opens the app and signs in.
export async function sendEmailLink(email) {
  const { auth, A } = await cloud();
  const url = location.origin + location.pathname;
  await A.sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* the link still asks for it */ }
}

export function isEmailLinkLanding() {
  return /[?&](mode=signIn|oobCode=)/.test(location.search);
}

// The address this browser or app asked a link for, if any. On iPhone the installed app and
// Safari don't share storage, so a link opened in Safari finds nothing here.
export function storedEmail() {
  try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
}

export async function isEmailLink(link) {
  const { auth, A } = await cloud();
  return A.isSignInWithEmailLink(auth, link);
}

// Sign in with a link from the e-mail: the page's own address when the link opened the app, or a
// link pasted into the app (iOS opens links in Safari, never in the installed app).
export async function completeEmailLink(link, email) {
  const { auth, A } = await cloud();
  const result = await A.signInWithEmailLink(auth, email, link);
  try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
  return result;
}

export async function signOut() {
  const { auth, A } = await cloud();
  return A.signOut(auth);
}

export async function onUser(callback) {
  const { auth, A } = await cloud();
  return A.onAuthStateChanged(auth, callback);
}

// Keep a small profile per user (no e-mail address). Offline, the write waits in the local cache
// and the returned promise only settles once the server has it.
export async function saveProfile(user) {
  const { db, F } = await cloud();
  await F.setDoc(F.doc(db, 'users', user.uid), {
    name: user.displayName || user.email?.split('@')[0] || 'Player',
    photoURL: user.photoURL || null,
    lastSeen: F.serverTimestamp(),
    schemaVersion: 1,
  }, { merge: true });
}

// Your own photo, chosen in the app: it replaces the one from Google (null: none chosen). Asks
// the server: the local copy may not have it yet (just signed in on this device).
export async function ownPhoto(user) {
  const { db, F } = await cloud();
  const d = await F.getDocFromServer(F.doc(db, 'users', user.uid));
  return d.exists() ? d.data().photo ?? null : null;
}

export async function setOwnPhoto(user, photo) {
  const { db, F } = await cloud();
  await F.setDoc(F.doc(db, 'users', user.uid), { photo: photo ?? F.deleteField() }, { merge: true });
}

// Asks the server itself (not the local copy) for the user's profile: fails when offline, or with
// 'permission-denied' when the security rules don't allow it.
export async function checkServer(user) {
  const { db, F } = await cloud();
  await F.getDocFromServer(F.doc(db, 'users', user.uid));
}

// ---------- reminders (web push through Firebase Cloud Messaging) ----------

const DEVICE_KEY = `${EDITION.storageKey}-device`;

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 'not-configured' | 'unsupported' | 'install-first' (iPhone/iPad: only the installed app gets
// notifications) | 'blocked' | 'off' | 'on'
export function remindersState(installed) {
  if (!EDITION.vapidKey) return 'not-configured';
  if (isIOS() && !installed) return 'install-first';
  if (!('Notification' in globalThis) || !('serviceWorker' in navigator) || !('PushManager' in globalThis)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  try { return localStorage.getItem(`${DEVICE_KEY}-on`) === '1' ? 'on' : 'off'; } catch { return 'off'; }
}

// Asks permission, gets this device's push token and stores it, so the reminder function can
// reach this device. Called from a tap (browsers only ask for permission after a tap).
export async function enableReminders(user) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Object.assign(new Error('not allowed'), { code: 'reminders/blocked' });
  const { db, F } = await cloud();
  const { getMessaging, getToken } = await import(`${SDK}/firebase-messaging.js`);
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(), { vapidKey: EDITION.vapidKey, serviceWorkerRegistration: registration });
  await F.setDoc(F.doc(db, 'users', user.uid, 'devices', deviceId()), {
    token,
    app: location.origin + location.pathname, // which edition a reminder should open
    edition: EDITION.name,
    installed: matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true,
    updatedAt: F.serverTimestamp(),
  });
  try { localStorage.setItem(`${DEVICE_KEY}-on`, '1'); } catch { /* shows "off" next time */ }
}

export async function disableReminders(user) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'users', user.uid, 'devices', deviceId()));
  try { localStorage.removeItem(`${DEVICE_KEY}-on`); } catch { /* ignore */ }
}
