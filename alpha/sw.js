// Network-first service worker: always serve the latest version when online, and fall back
// to the cached copy offline (or when the sports-hall network is too slow to answer).
// Bump VERSION whenever any app file changes.
// Alpha edition (served from /alpha/): its own cache names, so it never removes another edition's cache.
// The prefix must match EDITION.cachePrefix in js/edition.js.
const VERSION = 'v30-alpha.1';
const CACHE_PREFIX = 'badminton-score-alpha-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;
const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/match.js',
  'js/gesture.js',
  'js/audio.js',
  'js/install.js',
  'js/breaks.js',
  'js/layout.js',
  'js/media.js',
  'js/random.js',
  'js/setup.js',
  'js/edition.js',
  'manifest.webmanifest',
  'icons/shuttle-192.png',
  'icons/shuttle-512.png',
  'icons/shuttle-maskable-512.png',
  'icons/shuttle-apple-180.png',
  'icons/shuttlecock.svg',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the browser's HTTP cache, so a new version never stores stale files.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Only clean up older alpha caches; other editions' caches are not ours to delete.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request, { cache: 'no-cache' }).then((response) => {
      clearTimeout(timer);
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      resolve(response);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fromNetwork(event.request).catch(() =>
      caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request))),
  );
});
