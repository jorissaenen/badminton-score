// Which edition this copy of the app is. Alpha, beta and production live side by side on the same
// web address (alpha in /alpha/, beta in /beta/, production in the site root), so everything an
// edition stores gets its own name: it must never read over or overwrite another edition's
// scores, settings or offline cache.
//
// Alpha is where new features are built. It uses the Firebase project with mock data
// (badminton-dev); beta and production use the real data (badminton-prod).
export const EDITION = {
  name: 'alpha',
  label: 'α v30',
  storageKey: 'badminton-score-alpha-v1',
  // Read once, never written: on first start the alpha copies production's settings.
  productionStorageKey: 'badminton-score-v1',
  installDismissKey: 'badminton-score-alpha-install-dismissed',
  cachePrefix: 'badminton-score-alpha-', // keep in sync with sw.js
  // Firebase web config of the mock-data project. These values aren't secret: every Firebase web
  // app ships them; Firestore's security rules decide who may read or write.
  firebase: {
    apiKey: 'AIzaSyCF1_OhOL0fA6ZJMuISzdPSp2SgsKtBpRA',
    authDomain: 'badminton-dev-bc258.firebaseapp.com',
    projectId: 'badminton-dev-bc258',
    storageBucket: 'badminton-dev-bc258.firebasestorage.app',
    messagingSenderId: '1053789964444',
    appId: '1:1053789964444:web:4df95d8ed203f31a084559',
  },
};
