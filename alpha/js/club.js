// Seasons, members, invites and players in Firestore. Who may do what is enforced by
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

// Invite links: …/?join=<seasonId>.<token>. The token is 24 random bytes, so it can't be guessed.
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function inviteLink(seasonId, token, base = location.origin + location.pathname) {
  return `${base}?join=${seasonId}.${token}`;
}

export function parseJoin(search) {
  const m = /[?&]join=([A-Za-z0-9]+)\.([A-Za-z0-9_-]{20,})/.exec(search);
  return m ? { seasonId: m[1], token: m[2] } : null;
}

const profile = (user) => ({
  name: (user.displayName || user.email?.split('@')[0] || 'Player').slice(0, 60),
  photoURL: user.photoURL || null,
});

export async function mySeasons(user) {
  const { db, F } = await cloud();
  const snap = await F.getDocs(F.collection(db, 'users', user.uid, 'seasons'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.joinedAt?.toMillis?.() ?? 0) - (a.joinedAt?.toMillis?.() ?? 0));
}

export async function createSeason(user, name, defaults) {
  const { db, F } = await cloud();
  const ref = F.doc(F.collection(db, 'seasons'));
  const batch = F.writeBatch(db);
  batch.set(ref, {
    name, defaults, createdBy: user.uid, createdAt: F.serverTimestamp(), schemaVersion: 1,
  });
  batch.set(F.doc(db, 'seasons', ref.id, 'members', user.uid), {
    role: 'owner', ...profile(user), joinedAt: F.serverTimestamp(),
  });
  batch.set(F.doc(db, 'users', user.uid, 'seasons', ref.id), { name, joinedAt: F.serverTimestamp() });
  await batch.commit();
  return ref.id;
}

export async function renameSeason(user, seasonId, name) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'seasons', seasonId), { name });
  await F.setDoc(F.doc(db, 'users', user.uid, 'seasons', seasonId), { name }, { merge: true });
}

// Follows a season while its screen is open. `on` gets { season, members, players, invites } as
// they change; `onError` gets the error when the user isn't (or no longer) a member.
export async function watchSeason(seasonId, withInvites, on, onError) {
  const { db, F } = await cloud();
  const state = { season: null, members: [], players: [], invites: [] };
  const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const subs = [
    F.onSnapshot(F.doc(db, 'seasons', seasonId), (d) => {
      state.season = d.exists() ? { id: d.id, ...d.data() } : null;
      on(state);
    }, onError),
    F.onSnapshot(F.collection(db, 'seasons', seasonId, 'members'), (s) => { state.members = list(s); on(state); }, onError),
    F.onSnapshot(F.collection(db, 'seasons', seasonId, 'players'), (s) => { state.players = list(s); on(state); }, onError),
  ];
  if (withInvites) {
    subs.push(F.onSnapshot(F.collection(db, 'seasons', seasonId, 'invites'), (s) => {
      state.invites = list(s).filter((i) => i.expiresAt?.toMillis() > Date.now());
      on(state);
    }, () => {}));
  }
  return () => subs.forEach((unsubscribe) => unsubscribe());
}

export async function createInvite(user, seasonId, seasonName, role, days) {
  const { db, F } = await cloud();
  const token = newToken();
  await F.setDoc(F.doc(db, 'seasons', seasonId, 'invites', token), {
    role, seasonName, createdBy: user.uid, createdAt: F.serverTimestamp(),
    expiresAt: F.Timestamp.fromMillis(Date.now() + days * 86400_000),
  });
  return token;
}

export async function deleteInvite(seasonId, token) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'seasons', seasonId, 'invites', token));
}

export async function readInvite(seasonId, token) {
  const { db, F } = await cloud();
  const d = await F.getDoc(F.doc(db, 'seasons', seasonId, 'invites', token));
  if (!d.exists()) return null;
  const invite = d.data();
  return { ...invite, expired: invite.expiresAt.toMillis() <= Date.now() };
}

// Returns the user's role in the season, or null when not a member (or not allowed to look).
export async function myRoleIn(user, seasonId) {
  const { db, F } = await cloud();
  try {
    const d = await F.getDoc(F.doc(db, 'seasons', seasonId, 'members', user.uid));
    return d.exists() ? d.data().role : null;
  } catch {
    return null;
  }
}

export async function join(user, seasonId, token, invite) {
  const { db, F } = await cloud();
  const batch = F.writeBatch(db);
  batch.set(F.doc(db, 'seasons', seasonId, 'members', user.uid), {
    role: invite.role, ...profile(user), invite: token, joinedAt: F.serverTimestamp(),
  });
  batch.set(F.doc(db, 'users', user.uid, 'seasons', seasonId), {
    name: invite.seasonName, joinedAt: F.serverTimestamp(),
  });
  await batch.commit();
}

// Already a member (e.g. opened the invite twice): make sure the season is in the user's list.
export async function rememberSeason(user, seasonId, name) {
  const { db, F } = await cloud();
  await F.setDoc(F.doc(db, 'users', user.uid, 'seasons', seasonId), { name, joinedAt: F.serverTimestamp() }, { merge: true });
}

export async function forgetSeason(user, seasonId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'users', user.uid, 'seasons', seasonId));
}

export async function setRole(seasonId, uid, role) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'seasons', seasonId, 'members', uid), { role });
}

export async function removeMember(seasonId, uid) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'seasons', seasonId, 'members', uid));
}

export async function leave(user, seasonId) {
  await removeMember(seasonId, user.uid);
  await forgetSeason(user, seasonId);
}

// The season first (so nobody can open it any more), then everything in it, the owner's own
// member entry last (the rules allow that only once the season is gone).
export async function deleteSeason(user, seasonId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'seasons', seasonId));
  for (const sub of ['invites', 'players', 'members']) {
    const snap = await F.getDocs(F.collection(db, 'seasons', seasonId, sub));
    for (const d of snap.docs) if (!(sub === 'members' && d.id === user.uid)) await F.deleteDoc(d.ref);
  }
  await F.deleteDoc(F.doc(db, 'seasons', seasonId, 'members', user.uid));
  await forgetSeason(user, seasonId);
}

export async function addPlayer(seasonId, name, uid = null) {
  const { db, F } = await cloud();
  await F.addDoc(F.collection(db, 'seasons', seasonId, 'players'), {
    name, ...(uid && { uid }), createdAt: F.serverTimestamp(), schemaVersion: 1,
  });
}

export async function claimPlayer(user, seasonId, playerId) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'seasons', seasonId, 'players', playerId), {
    uid: user.uid, claimedAt: F.serverTimestamp(),
  });
}

export async function renamePlayer(seasonId, playerId, name) {
  const { db, F } = await cloud();
  await F.updateDoc(F.doc(db, 'seasons', seasonId, 'players', playerId), { name });
}

export async function deletePlayer(seasonId, playerId) {
  const { db, F } = await cloud();
  await F.deleteDoc(F.doc(db, 'seasons', seasonId, 'players', playerId));
}
