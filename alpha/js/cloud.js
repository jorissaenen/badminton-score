// Firebase: sign-in and the database. Loaded only when needed (opening settings, a previous
// sign-in, or an e-mail sign-in link), so scoring never waits for it and keeps working offline.
// The SDK comes from Google's servers as plain ES modules; the service worker keeps a copy.
import { EDITION } from './edition.js';

export const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';

let loading = null;

// Automated tests: on localhost, `?emulator` connects to the local Firebase emulators instead of
// the real project (npm run emulators), and offers a fake sign-in.
const EMULATOR = (() => {
  if (location.hostname !== 'localhost') return false;
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

// Asks the server itself (not the local copy) for the user's profile: fails when offline, or with
// 'permission-denied' when the security rules don't allow it.
export async function checkServer(user) {
  const { db, F } = await cloud();
  await F.getDocFromServer(F.doc(db, 'users', user.uid));
}
