// Clubs with their members, invites, seasons, players and events in Firestore. Who may do what is enforced by
// firestore.rules; the screens only offer what the rules allow.
import { cloud } from './cloud.js';
import { remindAt, smartReminder } from './reminder.js';

export const ROLES = ['owner', 'admin', 'keeper', 'member'];
export const ROLE_NAMES = { owner: 'Owner', admin: 'Admin', keeper: 'Score keeper', member: 'Member' };
const RANK = { owner: 4, admin: 3, keeper: 2, member: 1 };

export const isAdmin = (role) => (RANK[role] ?? 0) >= RANK.admin;

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

const profile = (user) => ({
  name: (user.displayName || user.email?.split('@')[0] || 'Player').slice(0, 60),
  photoURL: user.photoURL || null,
});

export async function myClubs(user) {
  const { db, F } = await cloud();
  const snap = await F.getDocs(F.collection(db, 'users', user.uid, 'clubs'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.joinedAt?.toMillis?.() ?? 0) - (a.joinedAt?.toMillis?.() ?? 0));
}

export async function createClub(user, name, defaults) {
  const { db, F } = await cloud();
  const ref = F.doc(F.collection(db, 'clubs'));
  const batch = F.writeBatch(db);
  batch.set(ref, {
    name, defaults, createdBy: user.uid, createdAt: F.serverTimestamp(), schemaVersion: 1,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, // for reminders' "today"/"tomorrow"
  });
  batch.set(F.doc(db, 'clubs', ref.id, 'members', user.uid), {
    role: 'owner', ...profile(user), joinedAt: F.serverTimestamp(),
  });
  batch.set(F.doc(db, 'users', user.uid, 'clubs', ref.id), { name, joinedAt: F.serverTimestamp() });
  await batch.commit();
  return ref.id;
}

export async function renameClub(user, clubId, name) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'clubs', clubId), { name });
  await F.setDoc(F.doc(db, 'users', user.uid, 'clubs', clubId), { name }, { merge: true });
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

export async function createInvite(user, clubId, clubName, role, days) {
  const { db, F } = await cloud();
  const token = newToken();
  await F.setDoc(F.doc(db, 'clubs', clubId, 'invites', token), {
    role, clubName, createdBy: user.uid, createdAt: F.serverTimestamp(),
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
    name: invite.clubName, joinedAt: F.serverTimestamp(),
  });
  await batch.commit();
}

// Already a member (e.g. opened the invite twice): make sure the club is in the user's list.
export async function rememberClub(user, clubId, name) {
  const { db, F } = await cloud();
  await F.setDoc(F.doc(db, 'users', user.uid, 'clubs', clubId), { name, joinedAt: F.serverTimestamp() }, { merge: true });
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

export const EVENT_TYPES = {
  training: 'Training',
  random: 'Random tournament',
  weighted: 'Weighted tournament',
  knockout: 'Knockout tournament',
};

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
export const EVENT_FIELDS = ['type', 'date', 'start', 'end', 'location', 'courts', 'reminder'];

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
    location: e.location ?? '', courts: e.courts ?? 2, note: e.note ?? '',
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
    type: e.type, start: e.start, end: e.end, location: e.location ?? '', courts: e.courts ?? 2,
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

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

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
