// Clubs with their members, invites, seasons and players in Firestore. Who may do what is enforced by
// firestore.rules; the screens only offer what the rules allow.
import { cloud } from './cloud.js';

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
