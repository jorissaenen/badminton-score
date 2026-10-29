// Clubs with their members, invites, seasons, players and events in Firestore. Who may do what is enforced by
// firestore.rules; the screens only offer what the rules allow.
import { cloud } from './cloud.js';
import { remindAt, smartReminder } from './reminder.js';

export const ROLES = ['owner', 'admin', 'keeper', 'member'];
const RANK = { owner: 4, admin: 3, keeper: 2, member: 1 };

export const isAdmin = (role) => (RANK[role] ?? 0) >= RANK.admin;
export const isKeeper = (role) => (RANK[role] ?? 0) >= RANK.keeper;

// The roles `myRole` may give to someone who now has `theirRole` (empty: can't change them).
// Mirrors the rules: nobody changes their own role; admins manage non-owners up to admin.
export function assignableRoles(myRole, theirRole, isSelf) {
  if (isSelf) return [];
  if (myRole === 'owner') return ROLES;
  if (myRole === 'admin' && theirRole !== 'owner') return ['admin', 'keeper', 'member'];
  return [];
}

// Invite links: …/?join=<clubId>.<token>. The token is 24 random bytes, so it can't be guessed.
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function inviteLink(clubId, token, base = location.origin + location.pathname) {
  return `${base}?join=${clubId}.${token}`;
}

export function parseJoin(search) {
  const m = /[?&]join=([A-Za-z0-9]+)\.([A-Za-z0-9_-]{20,})/.exec(search);
  return m ? { clubId: m[1], token: m[2] } : null;
}

// The photo others see of you: the one you chose in the app, else the one from Google.
let myPhoto = null;
export const useMyPhoto = (photo) => { myPhoto = photo; };

const profile = (user) => ({
  name: (user.displayName || user.email?.split('@')[0] || 'Player').slice(0, 60),
  photoURL: myPhoto || user.photoURL || null,
});

// Shows your (new) photo in every club you're in.
export async function updateMyPhoto(user, photoURL) {
  const clubs = await myClubs(user);
  await Promise.all(clubs.map((c) => updateMyPhotoIn(c.id, user, photoURL).catch(() => {})));
}

export async function updateMyPhotoIn(clubId, user, photoURL) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'members', user.uid), { photoURL: photoURL ?? null });
}

export async function myClubs(user) {
  const { db, F } = await cloud();
  const snap = await F.getDocs(F.collection(db, 'users', user.uid, 'clubs'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.joinedAt?.toMillis?.() ?? 0) - (a.joinedAt?.toMillis?.() ?? 0));
}

// A club plays one sport; `defaults` are the rules of its club matches (see rulesFor in sports.js).
export async function createClub(user, name, sport, defaults) {
  const { db, F } = await cloud();
  const ref = F.doc(F.collection(db, 'clubs'));
  const batch = F.writeBatch(db);
  batch.set(ref, {
    name, sport, defaults, createdBy: user.uid, createdAt: F.serverTimestamp(), schemaVersion: 1,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, // for reminders' "today"/"tomorrow"
  });
  batch.set(F.doc(db, 'clubs', ref.id, 'members', user.uid), {
    role: 'owner', ...profile(user), joinedAt: F.serverTimestamp(),
  });
  batch.set(F.doc(db, 'users', user.uid, 'clubs', ref.id), { name, sport, joinedAt: F.serverTimestamp() });
  await batch.commit();
  return ref.id;
}

export async function renameClub(user, clubId, name) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId), { name });
  await F.setDoc(F.doc(db, 'users', user.uid, 'clubs', clubId), { name }, { merge: true });
}

// Other club details admins change: the usual place, its address and notes (suggested for new
// events), and the defaults
// for club matches.
export async function updateClub(clubId, changes) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId), changes);
}

// Follows a club while its screen is open. `on` gets { club, members, seasons, players, invites } as
// they change; `onError` gets the error when the user isn't (or no longer) a member.
export async function watchClub(clubId, withInvites, on, onError) {
  const { db, F } = await cloud();
  const state = { club: null, members: [], seasons: [], players: [], invites: [] };
  const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const subs = [
    F.onSnapshot(F.doc(db, 'clubs', clubId), (d) => {
      state.club = d.exists() ? { id: d.id, ...d.data() } : null;
      on(state);
    }, onError),
    F.onSnapshot(F.collection(db, 'clubs', clubId, 'members'), (s) => { state.members = list(s); on(state); }, onError),
    F.onSnapshot(F.collection(db, 'clubs', clubId, 'players'), (s) => { state.players = list(s); on(state); }, onError),
    F.onSnapshot(F.collection(db, 'clubs', clubId, 'seasons'), (s) => {
      state.seasons = list(s).sort((a, b) => b.start.localeCompare(a.start));
      on(state);
    }, onError),
  ];
  if (withInvites) {
    subs.push(F.onSnapshot(F.collection(db, 'clubs', clubId, 'invites'), (s) => {
      state.invites = list(s).filter((i) => i.expiresAt?.toMillis() > Date.now());
      on(state);
    }, () => {}));
  }
  return () => subs.forEach((unsubscribe) => unsubscribe());
}

export async function createInvite(user, clubId, clubName, role, days, clubSport = 'badminton') {
  const { db, F } = await cloud();
  const token = newToken();
  await F.setDoc(F.doc(db, 'clubs', clubId, 'invites', token), {
    role, clubName, clubSport, createdBy: user.uid, createdAt: F.serverTimestamp(),
    expiresAt: F.Timestamp.fromMillis(Date.now() + days * 86400_000),
  });
  return token;
}

export async function deleteInvite(clubId, token) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'clubs', clubId, 'invites', token));
}

export async function readInvite(clubId, token) {
  const { db, F } = await cloud();
  const d = await F.getDoc(F.doc(db, 'clubs', clubId, 'invites', token));
  if (!d.exists()) return null;
  const invite = d.data();
  return { ...invite, expired: invite.expiresAt.toMillis() <= Date.now() };
}

// Returns the user's role in the club, or null when not a member (or not allowed to look).
export async function myRoleIn(user, clubId) {
  const { db, F } = await cloud();
  try {
    const d = await F.getDoc(F.doc(db, 'clubs', clubId, 'members', user.uid));
    return d.exists() ? d.data().role : null;
  } catch {
    return null;
  }
}

export async function join(user, clubId, token, invite) {
  const { db, F } = await cloud();
  const batch = F.writeBatch(db);
  batch.set(F.doc(db, 'clubs', clubId, 'members', user.uid), {
    role: invite.role, ...profile(user), invite: token, joinedAt: F.serverTimestamp(),
  });
  batch.set(F.doc(db, 'users', user.uid, 'clubs', clubId), {
    name: invite.clubName, sport: invite.clubSport ?? 'badminton', joinedAt: F.serverTimestamp(),
  });
  await batch.commit();
}

// Already a member (e.g. opened the invite twice): make sure the club is in the user's list.
export async function rememberClub(user, clubId, name, sport = null) {
  const { db, F } = await cloud();
  await F.setDoc(F.doc(db, 'users', user.uid, 'clubs', clubId), { name, ...(sport && { sport }), joinedAt: F.serverTimestamp() }, { merge: true });
}

export async function forgetClub(user, clubId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'users', user.uid, 'clubs', clubId));
}

export async function setRole(clubId, uid, role) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'members', uid), { role });
}

export async function removeMember(clubId, uid) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'clubs', clubId, 'members', uid));
}

export async function leave(user, clubId) {
  await removeMember(clubId, user.uid);
  await forgetClub(user, clubId);
}

// The club first (so nobody can open it any more), then everything in it, the owner's own
// member entry last (the rules allow that only once the club is gone).
export async function deleteClub(user, clubId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'clubs', clubId));
  for (const sub of ['invites', 'seasons', 'players', 'members']) {
    const snap = await F.getDocs(F.collection(db, 'clubs', clubId, sub));
    for (const d of snap.docs) if (!(sub === 'members' && d.id === user.uid)) await F.deleteDoc(d.ref);
  }
  await F.deleteDoc(F.doc(db, 'clubs', clubId, 'members', user.uid));
  await forgetClub(user, clubId);
}

export async function addPlayer(clubId, name, uid = null) {
  const { db, F } = await cloud();
  await F.addDoc(F.collection(db, 'clubs', clubId, 'players'), {
    name, ...(uid && { uid }), createdAt: F.serverTimestamp(), schemaVersion: 1,
  });
}

export async function claimPlayer(user, clubId, playerId) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'players', playerId), {
    uid: user.uid, claimedAt: F.serverTimestamp(),
  });
}

export async function renamePlayer(clubId, playerId, name) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'players', playerId), { name });
}

export async function deletePlayer(clubId, playerId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'clubs', clubId, 'players', playerId));
}

// Seasons: a name and a period (dates as YYYY-MM-DD). Matches count for the season they fall in.
export async function addSeason(clubId, name, start, end) {
  const { db, F } = await cloud();
  await F.addDoc(F.collection(db, 'clubs', clubId, 'seasons'), {
    name, start, end, createdAt: F.serverTimestamp(), schemaVersion: 1,
  });
}

export async function updateSeason(clubId, seasonId, changes) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'seasons', seasonId), changes);
}

export async function deleteSeason(clubId, seasonId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'clubs', clubId, 'seasons', seasonId));
}

// The season today falls in, or else the most recent one.
export function currentSeason(seasons, today = new Date().toISOString().slice(0, 10)) {
  return seasons.find((s) => s.start <= today && today <= s.end)
    ?? [...seasons].sort((a, b) => b.start.localeCompare(a.start))[0] ?? null;
}

// A suggestion for a new season: September to June, after the latest one.
export function nextSeasonSuggestion(seasons, today = new Date()) {
  const latest = [...seasons].sort((a, b) => b.end.localeCompare(a.end))[0];
  let year = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  if (latest) year = Math.max(year, Number(latest.end.slice(0, 4)));
  return { name: `${year}–${String((year + 1) % 100).padStart(2, '0')}`, start: `${year}-09-01`, end: `${year + 1}-06-30` };
}

// ---------- events ----------

// The kinds of events; their names are in the language files (eventType.<kind>).
export const EVENT_TYPES = ['training', 'random', 'weighted', 'knockout'];

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The moment an event starts, in this device's time zone (the club's, in practice).
export function startsAt(date, time) {
  return new Date(`${date}T${time}:00`);
}

// Every date from `from` to `until` (YYYY-MM-DD, both included) on the same weekday as `from`.
export function weeklyDates(from, until) {
  const dates = [];
  for (let d = new Date(`${from}T12:00:00`); isoDate(d) <= until; d.setDate(d.getDate() + 7)) {
    dates.push(isoDate(d));
  }
  return dates;
}

// The fields an admin edits; series edits copy these to every date.
export const EVENT_FIELDS = ['type', 'date', 'start', 'end', 'location', 'address', 'note', 'courts', 'reminder'];

// The derived times: when it starts and when to remind (null: no reminder).
function times(F, e) {
  const reminder = e.reminder === undefined ? smartReminder(e.start) : e.reminder;
  const at = remindAt(e.date, reminder);
  return {
    startsAt: F.Timestamp.fromDate(startsAt(e.date, e.start)),
    reminder,
    remindAt: at ? F.Timestamp.fromDate(at) : null,
    reminded: false, // a new or changed moment: (re)send at that moment
  };
}

// For an edited event: new times, but "reminder sent" only resets when the reminder moment moved.
function retimes(F, old, next) {
  const t = times(F, next);
  if ((old.remindAt?.toMillis?.() ?? null) === (t.remindAt?.toMillis() ?? null)) delete t.reminded;
  return t;
}

function eventDoc(F, e) {
  return {
    type: e.type ?? 'training', date: e.date, start: e.start, end: e.end,
    location: e.location ?? '', address: e.address ?? '', courts: e.courts ?? 2, note: e.note ?? '',
    status: e.status ?? 'planned', ...(e.seriesId && { seriesId: e.seriesId }),
    ...times(F, e),
    schemaVersion: 1,
  };
}

// One event, or a weekly series: the series and all its dates are written at once, so every date
// can be answered, changed or cancelled on its own.
export async function addEvents(user, clubId, e, repeatUntil = null) {
  const { db, F } = await cloud();
  const events = F.collection(db, 'clubs', clubId, 'events');
  if (!repeatUntil) {
    await F.addDoc(events, { ...eventDoc(F, e), createdBy: user.uid, createdAt: F.serverTimestamp() });
    return 1;
  }
  const series = F.doc(F.collection(db, 'clubs', clubId, 'series'));
  const dates = weeklyDates(e.date, repeatUntil);
  const batch = F.writeBatch(db);
  batch.set(series, {
    type: e.type, start: e.start, end: e.end, location: e.location ?? '', address: e.address ?? '', note: e.note ?? '', courts: e.courts ?? 2,
    reminder: e.reminder === undefined ? null : e.reminder,
    from: e.date, until: repeatUntil, createdBy: user.uid, createdAt: F.serverTimestamp(), schemaVersion: 1,
  });
  for (const date of dates) {
    batch.set(F.doc(events, `${series.id}_${date}`), {
      ...eventDoc(F, { ...e, date, seriesId: series.id }), createdBy: user.uid, createdAt: F.serverTimestamp(),
    });
  }
  await batch.commit();
  return dates.length;
}

// An empty text is the same as none (older events have no address or note).
const blank = (v) => (v === '' || v === undefined ? null : v);
const sameValue = (a, b) => JSON.stringify(blank(a)) === JSON.stringify(blank(b));

// The fields that differ between an event and the edited values.
export function changedFields(event, edited) {
  return EVENT_FIELDS.filter((k) => k in edited && !sameValue(event[k], edited[k]));
}

function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// Changes one date. Its changed fields are remembered as exceptions (`overrides`), so a later
// change to the whole series leaves them as they are.
export async function updateEvent(clubId, event, edited) {
  const { db, F } = await cloud();
  const changed = changedFields(event, edited);
  if (!changed.length) return;
  const next = { ...event, ...edited };
  const update = Object.fromEntries(changed.map((k) => [k, edited[k]]));
  if (event.seriesId) update.overrides = [...new Set([...(event.overrides ?? []), ...changed])];
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'events', event.id), { ...update, ...retimes(F, event, next) });
}

// Changes all upcoming dates of the series (from today on) the same way as this one was edited.
// Dates where a field was changed on its own keep that field. A new date moves every date by the
// same number of days.
export async function updateSeries(clubId, event, edited) {
  const { db, F } = await cloud();
  const changed = changedFields(event, edited);
  if (!changed.length) return 0;
  const shift = changed.includes('date')
    ? Math.round((new Date(`${edited.date}T12:00:00`) - new Date(`${event.date}T12:00:00`)) / 86400_000) : 0;
  const snap = await F.getDocs(F.query(F.collection(db, 'clubs', clubId, 'events'), F.where('seriesId', '==', event.seriesId)));
  const today = isoDate(new Date());
  const batch = F.writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    const e = { id: d.id, ...d.data() };
    if (e.date < today && e.id !== event.id) continue;
    const keep = e.id === event.id ? [] : (e.overrides ?? []);
    const update = {};
    for (const k of changed) {
      if (keep.includes(k)) continue;
      update[k] = k === 'date' ? shiftDate(e.date, shift) : edited[k];
    }
    if (!Object.keys(update).length) continue;
    batch.update(d.ref, { ...update, ...retimes(F, e, { ...e, ...update }) });
    n += 1;
  }
  const seriesUpdate = Object.fromEntries(changed.filter((k) => k !== 'date').map((k) => [k, edited[k]]));
  if (Object.keys(seriesUpdate).length) batch.update(F.doc(db, 'clubs', clubId, 'series', event.seriesId), seriesUpdate);
  await batch.commit();
  return n;
}

export async function setEventStatus(clubId, eventId, status) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'events', eventId), { status });
}

export async function deleteEvent(clubId, eventId) {
  const { db, F } = await cloud();
  const regs = await F.getDocs(F.collection(db, 'clubs', clubId, 'events', eventId, 'registrations'));
  for (const r of regs.docs) await F.deleteDoc(r.ref);
  await F.deleteDoc(F.doc(db, 'clubs', clubId, 'events', eventId));
}

// Deletes the series' dates from `fromDate` on (earlier ones stay, with their history), with their
// answers, in one go.
export async function deleteSeries(clubId, seriesId, fromDate) {
  const { db, F } = await cloud();
  const snap = await F.getDocs(F.query(F.collection(db, 'clubs', clubId, 'events'), F.where('seriesId', '==', seriesId)));
  const doomed = snap.docs.filter((d) => d.data().date >= fromDate);
  const regs = await Promise.all(doomed.map((d) => F.getDocs(F.collection(d.ref, 'registrations'))));
  const refs = [...regs.flatMap((r) => r.docs.map((d) => d.ref)), ...doomed.map((d) => d.ref)];
  if (doomed.length === snap.docs.length) refs.push(F.doc(db, 'clubs', clubId, 'series', seriesId));
  for (let i = 0; i < refs.length; i += 400) {
    const batch = F.writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

// Upcoming events (from today), soonest first.
export async function watchUpcoming(clubId, on, limit = 12) {
  const { db, F } = await cloud();
  const q = F.query(F.collection(db, 'clubs', clubId, 'events'),
    F.where('date', '>=', isoDate(new Date())), F.orderBy('date'), F.limit(limit));
  return F.onSnapshot(q, (s) => on(s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))), () => on([]));
}

export async function nextEvent(clubId) {
  const { db, F } = await cloud();
  const q = F.query(F.collection(db, 'clubs', clubId, 'events'),
    F.where('date', '>=', isoDate(new Date())), F.orderBy('date'), F.limit(5));
  const snap = await F.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.status !== 'cancelled' && e.startsAt.toMillis() > Date.now() - 3 * 3600_000)
    .sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis())[0] ?? null;
}

export async function getEvent(clubId, eventId) {
  const { db, F } = await cloud();
  const d = await F.getDoc(F.doc(db, 'clubs', clubId, 'events', eventId));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export async function watchEvent(clubId, eventId, on) {
  const { db, F } = await cloud();
  const state = { event: null, registrations: {} };
  const subs = [
    F.onSnapshot(F.doc(db, 'clubs', clubId, 'events', eventId), (d) => {
      state.event = d.exists() ? { id: d.id, ...d.data() } : null;
      on(state);
    }, () => on(state)),
    F.onSnapshot(F.collection(db, 'clubs', clubId, 'events', eventId, 'registrations'), (s) => {
      state.registrations = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      on(state);
    }, () => {}),
  ];
  return () => subs.forEach((u) => u());
}

// Registrations of several events at once, for the "8 going" counts in lists.
export async function watchRegistrations(clubId, eventIds, on) {
  const { db, F } = await cloud();
  const all = {};
  const subs = eventIds.map((id) => F.onSnapshot(
    F.collection(db, 'clubs', clubId, 'events', id, 'registrations'),
    (s) => {
      all[id] = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
      on(all);
    },
    () => {},
  ));
  return () => subs.forEach((u) => u());
}

export async function register(user, clubId, eventId, playerId, status, note = '') {
  const { db, F } = await cloud();
  const ref = F.doc(db, 'clubs', clubId, 'events', eventId, 'registrations', playerId);
  if (!status) {
    await F.deleteDoc(ref);
    return;
  }
  await F.setDoc(ref, { status, note: note.slice(0, 140), by: user.uid, at: F.serverTimestamp() });
}

export async function myRegistration(clubId, eventId, playerId) {
  const { db, F } = await cloud();
  const d = await F.getDoc(F.doc(db, 'clubs', clubId, 'events', eventId, 'registrations', playerId));
  return d.exists() ? d.data() : null;
}

export async function myPlayer(user, clubId) {
  const { db, F } = await cloud();
  const snap = await F.getDocs(F.query(F.collection(db, 'clubs', clubId, 'players'), F.where('uid', '==', user.uid)));
  return snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
}

export async function listPlayers(clubId) {
  const { db, F } = await cloud();
  const snap = await F.getDocs(F.collection(db, 'clubs', clubId, 'players'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- matches during an event ----------
// clubs/{clubId}/matches/{matchId}: { eventId, sport, rules, home: [{ id?, name }], away, state
// (the match as in match.js), status: live | finished | stopped, winner, keeper (uid) }. Players
// without an id are guests, by name only.

// Returns the new match's id right away; the write goes out when there's a connection.
export async function addMatch(user, clubId, m) {
  const { db, F } = await cloud();
  const ref = F.doc(F.collection(db, 'clubs', clubId, 'matches'));
  F.setDoc(ref, {
    eventId: m.eventId, sport: m.sport, rules: m.rules, home: m.home, away: m.away, state: m.state,
    court: m.court ?? null, status: 'live', winner: null, keeper: user.uid, version: 0, lastPointAt: null,
    startedAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), schemaVersion: 1,
  }).catch(() => { /* reported by the connection status; retried by Firestore */ });
  return ref.id;
}

// Several people can keep the score of one match (phones, watches). Every change says which
// version of the score it was based on, and only the first change on a version counts: a press
// on an older version is refused, never retried. After a point the score is frozen for
// FREEZE_SECONDS (the database rules check the time); undo always works and ends the freeze.
export const FREEZE_SECONDS = 5;
const refused = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

// `action`: 'point0', 'point1', 'undo', 'next' (next game) or 'stop'. Resolves with the new
// version; rejects with code 'skoor/stale' (someone else was first: by = their name),
// 'skoor/frozen' (too soon after a point), 'skoor/offline' or 'skoor/gone'.
export async function changeMatch(user, clubId, matchId, basedOn, action, changes) {
  const { db, F } = await cloud();
  const ref = F.doc(db, 'clubs', clubId, 'matches', matchId);
  const point = action.startsWith('point');
  let seen = null; // the match as read: who changed it last
  try {
    return await F.runTransaction(db, async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists()) throw refused('skoor/gone');
      const m = d.data();
      seen = m;
      const version = m.version ?? 0;
      if (version !== basedOn) throw refused('skoor/stale', { by: m.lastByName ?? '', version });
      tx.update(ref, {
        ...changes, version: version + 1, lastAction: action,
        lastBy: user.uid, lastByName: (user.displayName || user.email?.split('@')[0] || '').slice(0, 60),
        lastPointAt: point ? F.serverTimestamp() : null, updatedAt: F.serverTimestamp(),
        ...(changes.status === 'finished' && { finishedAt: F.serverTimestamp() }),
      });
      return version + 1;
    }, { maxAttempts: 1 });
  } catch (e) {
    if (e.code?.startsWith?.('skoor/')) throw e;
    // The rules refuse a point during the freeze (the version was right, so that's the reason).
    if (e.code === 'permission-denied') throw refused(point ? 'skoor/frozen' : 'skoor/denied', { by: seen?.lastBy !== user.uid ? seen?.lastByName ?? '' : '' });
    if (['unavailable', 'deadline-exceeded'].includes(e.code) || !navigator.onLine) throw refused('skoor/offline');
    // Changed by someone else between reading and writing (only one attempt: never retried).
    if (['aborted', 'failed-precondition'].includes(e.code)) throw refused('skoor/stale', { by: '' });
    throw e;
  }
}

// Follows one match: `on(match, { live })` with live = the copy comes from the server right now
// (not from the local cache, so the score shown is the latest).
export async function watchMatch(clubId, matchId, on) {
  const { db, F } = await cloud();
  return F.onSnapshot(F.doc(db, 'clubs', clubId, 'matches', matchId), { includeMetadataChanges: true },
    (d) => on(d.exists() ? { id: d.id, ...d.data() } : null, { live: !d.metadata.fromCache }),
    () => on(undefined, { live: false }));
}

// Asks the server for one match (the regular check that the score is still the latest).
export async function fetchMatch(clubId, matchId) {
  const { db, F } = await cloud();
  const d = await F.getDocFromServer(F.doc(db, 'clubs', clubId, 'matches', matchId));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export async function deleteMatch(clubId, matchId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'clubs', clubId, 'matches', matchId));
}

// The matches of one event, oldest first, as they change.
export async function watchEventMatches(clubId, eventId, on) {
  const { db, F } = await cloud();
  const q = F.query(F.collection(db, 'clubs', clubId, 'matches'), F.where('eventId', '==', eventId));
  return F.onSnapshot(q, (s) => on(s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.startedAt?.toMillis?.() ?? Date.now()) - (b.startedAt?.toMillis?.() ?? Date.now()))), () => on([]));
}

// Before, during or after an event (in this device's time zone): 'upcoming', 'live', 'ended',
// or 'cancelled'. With its matches, an event runs past its end time while a match is still
// being played, or one started or finished less than WIND_DOWN ago; a match nobody scored for
// STALE doesn't keep it going.
export const WIND_DOWN = 15 * 60_000;
const STALE = 30 * 60_000;
const ms = (ts) => ts?.toMillis?.() ?? (typeof ts === 'number' ? ts : 0);

export function eventPhase(e, now = Date.now(), matches = null) {
  if (e.status === 'cancelled') return 'cancelled';
  if (now < startsAt(e.date, e.start).getTime()) return 'upcoming';
  if (now < startsAt(e.date, e.end).getTime()) return 'live';
  return matches && now < lastActivity(matches, now) + WIND_DOWN ? 'live' : 'ended';
}

// When the last thing happened in these matches: a match still being scored counts as now.
export function lastActivity(matches, now = Date.now()) {
  let last = 0;
  for (const m of matches) {
    const updated = ms(m.updatedAt) || ms(m.startedAt) || now; // just started here: not on the server yet
    if (m.status === 'live' && now - updated < STALE) return now;
    last = Math.max(last, ms(m.finishedAt), ms(m.startedAt));
  }
  return last;
}

// The matches of one event, once (for the cards on Play and the club home).
export async function eventMatches(clubId, eventId) {
  const { db, F } = await cloud();
  const snap = await F.getDocs(F.query(F.collection(db, 'clubs', clubId, 'matches'), F.where('eventId', '==', eventId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Whether an event's end time has passed, so its matches decide if it's still going on.
export const pastEnd = (e, now = Date.now()) => e.status !== 'cancelled' && now >= startsAt(e.date, e.end).getTime();

// ---------- screens (displays) ----------
// A screen on /link signs in anonymously and shows a key that changes every minute
// (displayCodes/{key} → its uid). A score keeper, admin or owner links it to an event with that
// key: displays/{uid} = { clubId, eventId, mode: 'court' | 'overview', court, announce }.

// Letters and digits that can't be mixed up (no 0/O, 1/I/L).
export const KEY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newKey(random = crypto.getRandomValues(new Uint8Array(6))) {
  return [...random].map((b) => KEY_CHARS[b % KEY_CHARS.length]).join('');
}
export const cleanKey = (typed) => String(typed).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// The screen's uid for a key, or null when the key is unknown or too old.
export async function screenForKey(key) {
  const { db, F } = await cloud();
  const d = await F.getDoc(F.doc(db, 'displayCodes', key));
  if (!d.exists()) return null;
  const { display, expiresAt } = d.data();
  return expiresAt.toMillis() + 120_000 > Date.now() ? display : null;
}

export async function linkScreen(user, displayId, key, link) {
  const { db, F } = await cloud();
  await F.setDoc(F.doc(db, 'displays', displayId), {
    clubId: link.clubId, eventId: link.eventId, mode: link.mode, court: link.mode === 'court' ? link.court : null,
    announce: Boolean(link.announce), linkedBy: user.uid, code: key, linkedAt: F.serverTimestamp(),
  });
}

export async function changeScreen(user, displayId, changes) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'displays', displayId), { ...changes, linkedBy: user.uid });
}

export async function unlinkScreen(displayId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'displays', displayId));
}

export async function watchEventScreens(clubId, eventId, on) {
  const { db, F } = await cloud();
  const q = F.query(F.collection(db, 'displays'), F.where('clubId', '==', clubId), F.where('eventId', '==', eventId));
  return F.onSnapshot(q, (s) => on(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => on([]));
}

// Events today and later in the clubs where the user may link screens (keeper, admin, owner).
export async function eventsToLinkTo(user) {
  const clubs = await myClubs(user);
  const out = [];
  await Promise.all(clubs.map(async (c) => {
    const role = await myRoleIn(user, c.id);
    if (!['owner', 'admin', 'keeper'].includes(role)) return;
    const { db, F } = await cloud();
    const snap = await F.getDocs(F.query(F.collection(db, 'clubs', c.id, 'events'), F.where('date', '==', isoDate(new Date()))));
    snap.docs.forEach((d) => out.push({ club: c, event: { id: d.id, ...d.data() } }));
  }));
  return out.filter((x) => x.event.status !== 'cancelled').sort((a, b) => (a.event.start).localeCompare(b.event.start));
}

// A message admins pin on the event's screens (the overview), e.g. "Bar open until 23:00".
export async function setPinned(clubId, eventId, text) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId, 'events', eventId), { pinned: text.slice(0, 280) });
}
