// What the app was opened for: an invite link (…/?join=<clubId>.<token>) or a tapped reminder
// (…/?event=<clubId>.<eventId>). Both are kept until they can be handled: an invite survives
// signing in, even by e-mail link; an event opens once signed in.
import { EDITION } from './edition.js';
import * as Club from './club.js';

const JOIN_KEY = `${EDITION.storageKey}-join`;
const CLUB_KEY = `${EDITION.storageKey}-club`;
// A tapped reminder (see notificationclick in sw.js): the service worker leaves the event's
// address in this small cache, and also sends it as a message when the app is running.
const PENDING = `${EDITION.cachePrefix}pending`;

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* only affects convenience */ }
}

// The club last opened, shown first.
export const lastClub = () => stored(CLUB_KEY);
export const setLastClub = (id) => store(CLUB_KEY, id);

export function pendingJoin() {
  try { return JSON.parse(stored(JOIN_KEY)); } catch { return null; }
}
export const setPendingJoin = (join) => store(JOIN_KEY, join ? JSON.stringify(join) : null);

export function parseEventLink(search) {
  const m = /[?&]event=([A-Za-z0-9]+)\.([A-Za-z0-9_-]+)/.exec(search);
  return m ? { clubId: m[1], eventId: m[2] } : null;
}

// Reads the address once at start and takes the codes out of it. Returns where to go first:
// '#/join', an event, or null.
export function takeFromAddress() {
  // A watch's QR code: …/?watch=<key>
  const watch = /[?&]watch=([A-Z0-9]{6})\b/.exec(location.search);
  if (watch) {
    history.replaceState(null, '', location.pathname);
    return `#/watch/${watch[1]}`;
  }
  // A screen's QR code: …/?display=<key>
  const screen = /[?&]display=([A-Z0-9]{6})\b/.exec(location.search);
  if (screen) {
    history.replaceState(null, '', location.pathname);
    return `#/screen/${screen[1]}`;
  }
  const join = Club.parseJoin(location.search);
  const event = parseEventLink(location.search);
  if (join || event) history.replaceState(null, '', location.pathname + location.hash);
  if (join) {
    setPendingJoin(join);
    return '#/join';
  }
  if (event) {
    caches?.open(PENDING).then((c) => c.delete('open')).catch(() => {});
    return `#/club/${event.clubId}/event/${event.eventId}`;
  }
  return null;
}

// Calls `open(hash)` when a reminder was tapped while the app was already running or in the
// background.
export function watchTappedReminders(open) {
  async function take() {
    try {
      const cache = await caches.open(PENDING);
      const hit = await cache.match('open');
      if (!hit) return;
      await cache.delete('open');
      const { url, at } = await hit.json();
      const target = Date.now() - at < 10 * 60_000 && parseEventLink(new URL(url, location.href).search);
      if (target) open(`#/club/${target.clubId}/event/${target.eventId}`);
    } catch { /* no cache storage: the address in the link still works */ }
  }
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open') take(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) take(); });
  window.addEventListener('focus', take);
  take();
}
