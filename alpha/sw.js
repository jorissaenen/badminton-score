// Network-first service worker: always serve the latest version when online, and fall back
// to the cached copy offline (or when the sports-hall network is too slow to answer).
// Bump VERSION whenever any app file changes.
// Alpha edition (served from /alpha/): its own cache names, so it never removes another edition's cache.
// The prefix must match EDITION.cachePrefix in js/edition.js.
const VERSION = 'v30-alpha.23';
const CACHE_PREFIX = 'badminton-score-alpha-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;
// A tapped reminder's address, left for the app to pick up (see notificationclick). Kept across
// updates, unlike the versioned cache.
const PENDING = `${CACHE_PREFIX}pending`;
const NETWORK_TIMEOUT_MS = 3000;
const ASSETS = [
  './',
  'index.html',
  'css/skoor.css',
  'fonts/barlow-condensed-800-latin.woff2',
  'js/app.js',
  'js/sports.js',
  'js/burst.js',
  'js/i18n.js',
  'js/lang/en.js',
  'js/lang/nl.js',
  'js/ui.js',
  'js/state.js',
  'js/session.js',
  'js/scoreboard.js',
  'js/links.js',
  'js/match.js',
  'js/gesture.js',
  'js/audio.js',
  'js/install.js',
  'js/breaks.js',
  'js/layout.js',
  'js/media.js',
  'js/random.js',
  'js/edition.js',
  'js/cloud.js',
  'js/club.js',
  'js/reminder.js',
  'js/vendor/qrcode.js',
  'js/views/common.js',
  'js/views/settings.js',
  'js/views/rules.js',
  'js/views/play.js',
  'js/views/newmatch.js',
  'js/views/you.js',
  'js/views/signin.js',
  'js/views/clubs.js',
  'js/views/clubview.js',
  'js/views/club.js',
  'js/views/people.js',
  'js/views/invite.js',
  'js/views/clubsettings.js',
  'js/views/event.js',
  'js/views/eventedit.js',
  'js/views/join.js',
  'manifest.webmanifest',
  'icons/skoor-192.png',
  'icons/skoor-512.png',
  'icons/skoor-maskable-512.png',
  'icons/skoor-apple-180.png',
  'icons/skoor-favicon.svg',
  'icons/skoor-favicon-32.png',
  'icons/skoor-logo.svg',
];

// Reminders: Firebase Cloud Messaging delivers them as web push with a data payload
// { title, body, url, tag }. Every push must show a notification (iOS requires it).
self.addEventListener('push', (event) => {
  let msg = {};
  try {
    const json = event.data?.json() ?? {};
    msg = json.data ?? json;
  } catch { /* show a plain notification */ }
  event.waitUntil(self.registration.showNotification(msg.title || 'Skoor', {
    body: msg.body || '',
    tag: msg.tag || undefined,
    icon: 'icons/skoor-192.png',
    badge: 'icons/skoor-192.png',
    data: { url: msg.url || self.registration.scope },
  }));
});

// Tapping a reminder opens the event. On iPhone the app is started (on its start screen) before
// this runs, so a message to it can arrive before it listens. The address is therefore also left
// in a small cache that the app reads whenever it starts or comes to the front; the message only
// makes an app that's already running react at once. A closed app is opened on the address.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const pending = await caches.open(PENDING);
    await pending.put('open', new Response(JSON.stringify({ url, at: Date.now() })));
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find((w) => w.url.startsWith(self.registration.scope));
    if (!app) return self.clients.openWindow(url);
    await app.focus().catch(() => {});
    app.postMessage({ type: 'open', url });
  })());
});

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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE && k !== PENDING).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The Firebase SDK files are versioned and never change: keep a copy and use it first.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/';

function fromCacheFirst(request) {
  return caches.match(request).then((hit) => hit || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return response;
  }));
}

// Google profile photos: show the saved copy (also offline) and refresh it in the background.
const PROFILE_PHOTO = /^https:\/\/lh\d\.googleusercontent\.com\//;

function fromCacheThenRefresh(event) {
  const refresh = fetch(event.request).then((response) => {
    if (response.ok || response.type === 'opaque') {
      const copy = response.clone();
      caches.open(CACHE).then((c) => c.put(event.request, copy));
    }
    return response;
  });
  event.waitUntil(refresh.catch(() => {}));
  return caches.match(event.request).then((hit) => hit || refresh);
}

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
  const url = event.request.url;
  if (url.startsWith(FIREBASE_SDK)) {
    event.respondWith(fromCacheFirst(event.request));
    return;
  }
  if (PROFILE_PHOTO.test(url)) {
    event.respondWith(fromCacheThenRefresh(event));
    return;
  }
  // Leave everything else that isn't the app's own (sign-in, the database's long-running live
  // connections) to the browser: the 3-second network timeout below would cut those off.
  if (new URL(url).origin !== self.location.origin) return;
  event.respondWith(
    fromNetwork(event.request).catch(() =>
      caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request))),
  );
});
