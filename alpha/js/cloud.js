// Firebase: sign-in and the database. Loaded only when needed (opening settings, a previous
// sign-in, or an e-mail sign-in link), so scoring never waits for it and keeps working offline.
// The SDK comes from Google's servers as plain ES modules; the service worker keeps a copy.
import { EDITION } from './edition.js';

export const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';

let loading = null;

// Resolves to { auth, db, A (auth functions), F (Firestore functions) }.
export function cloud() {
  loading ??= (async () => {
    if (!EDITION.firebase) throw new Error('No Firebase project for this edition');
    const [{ initializeApp }, A, F] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = initializeApp(EDITION.firebase);
    const auth = A.initializeAuth(app, {
      persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence],
      popupRedirectResolver: A.browserPopupRedirectResolver,
    });
    const db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
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

// Called on start when the page was opened from a sign-in link.
export async function completeEmailLink(askEmail) {
  const { auth, A } = await cloud();
  if (!A.isSignInWithEmailLink(auth, location.href)) return null;
  let email = null;
  try { email = localStorage.getItem(EMAIL_KEY); } catch { /* ask instead */ }
  // Opened on another device or browser than the one that asked for the link.
  email ||= askEmail();
  if (!email) return null;
  const result = await A.signInWithEmailLink(auth, email, location.href);
  try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname); // drop the one-time code from the address
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

// Keep a small profile per user (no e-mail address). Also proves the database connection works.
export async function saveProfile(user) {
  const { db, F } = await cloud();
  await F.setDoc(F.doc(db, 'users', user.uid), {
    name: user.displayName || user.email?.split('@')[0] || 'Player',
    photoURL: user.photoURL || null,
    lastSeen: F.serverTimestamp(),
    schemaVersion: 1,
  }, { merge: true });
}
