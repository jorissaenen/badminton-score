// Keeping the score of a club match, also with several people at once (phones now, watches later).
// This device follows the match live and asks the server every CHECK_MS whether it still has the
// latest score. Only then ("live") may the score be changed here: a change made on an old score
// would always be wrong. Every change goes through Club.changeMatch: the first change on a version
// counts, a later one on the same version is refused, and after a point the score is frozen for a
// few seconds (undo always works). state.link says which match: { clubId, eventId, matchId, version }.
import * as Club from './club.js';
import { session } from './session.js';
import { state, save } from './state.js';

const CHECK_MS = 15_000;
const sync = { live: false, frozenUntil: 0, busy: false, lastBy: '' };
export const syncState = () => sync;

let following = null; // the matchId followed
let stopWatch = null;
let checkTimer = null;
let onRemote = () => {};
let onStatus = () => {};

const refused = (code) => Object.assign(new Error(code), { code });

// A newer score from the server (someone else scored, or this device was behind): take it over.
function receive(m, live) {
  const link = state.link;
  if (!link || following !== link.matchId) return;
  if (m === null) { // removed from the event
    leave();
    onRemote('gone');
    return;
  }
  if (m === undefined) { sync.live = false; onStatus(); return; }
  sync.live = live && navigator.onLine;
  const version = m.version ?? 0;
  if (version > (link.version ?? 0)) {
    link.version = version;
    state.match = m.state;
    save();
    sync.lastBy = m.lastByName ?? '';
    if (m.lastAction?.startsWith('point')) sync.frozenUntil = Date.now() + Club.FREEZE_SECONDS * 1000;
    else if (m.lastAction === 'undo') sync.frozenUntil = 0;
    onRemote(m);
  }
  onStatus();
}

async function check() {
  const link = state.link;
  if (!link || following !== link.matchId) return;
  try {
    receive(await Club.fetchMatch(link.clubId, link.matchId), true);
  } catch {
    sync.live = false;
    onStatus();
  }
}

function stopFollowing() {
  stopWatch?.();
  stopWatch = null;
  clearInterval(checkTimer);
  following = null;
  sync.live = false;
  sync.frozenUntil = 0;
}

// Follows the match in state.link (again) when it changed; nothing for a quick match.
export function follow() {
  const link = state.link;
  if (link?.matchId === following) return;
  stopFollowing();
  if (!link) { onStatus(); return; }
  following = link.matchId;
  onStatus();
  Club.watchMatch(link.clubId, link.matchId, (m, { live }) => receive(m, live)).then((stop) => {
    if (following === link.matchId) stopWatch = stop;
    else stop();
  }).catch(() => {});
  checkTimer = setInterval(check, CHECK_MS);
}

export function followClubMatch({ remote, status }) {
  onRemote = remote;
  onStatus = status;
  window.addEventListener('online', check);
  window.addEventListener('offline', () => { sync.live = false; onStatus(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  follow();
}

// Sends one change of the score ('point0', 'point1', 'undo', 'next', 'stop') with the new state.
// Resolves once the server has it; rejects with the reason it doesn't count (see Club.changeMatch,
// plus 'skoor/notlive': this device isn't sure it has the latest score, and 'skoor/busy').
export async function commit(action, next, changes = {}) {
  const link = state.link;
  if (sync.busy) throw refused('skoor/busy');
  if (!sync.live) { check(); throw refused(navigator.onLine ? 'skoor/notlive' : 'skoor/offline'); }
  sync.busy = true;
  try {
    const version = await Club.changeMatch(session.user, link.clubId, link.matchId, link.version ?? 0, action, { state: next, ...changes });
    link.version = version;
    state.match = next;
    save();
    sync.lastBy = ''; // the last change is this device's own
    if (action.startsWith('point')) sync.frozenUntil = Date.now() + Club.FREEZE_SECONDS * 1000;
    else if (action === 'undo') sync.frozenUntil = 0;
  } catch (e) {
    if (e.code === 'skoor/stale') check(); // catch up with the score that won
    if (e.code === 'skoor/offline') sync.live = false;
    throw e;
  } finally {
    sync.busy = false;
    onStatus();
  }
}

// This device stops keeping this match's score. With a status ('stopped'), the match stops for
// everyone; without, the others simply carry on.
export async function unlink(status = null) {
  const link = state.link;
  if (!link) return;
  if (status) await commit('stop', state.match, { status }).catch(() => {});
  leave();
}

function leave() {
  stopFollowing();
  state.link = null;
  save();
  onStatus();
}
