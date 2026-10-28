// Security rules for seasons, members, invites and players. Runs against the Firestore emulator:
// npm run test:rules
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, deleteDoc, setLogLevel, doc, getDoc, getDocs, collection, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';

setLogLevel('silent'); // denied writes are expected here; the assertions report them

let env;
const S = 'season1';
const TOKEN = 'tok_0123456789abcdefghij';
const inDays = (d) => Timestamp.fromMillis(Date.now() + d * 86400_000);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-badminton',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

// A season with an owner, an admin, a keeper and a member, and a valid member invite.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'seasons', S), { name: 'Autumn', createdBy: 'owner', schemaVersion: 1 });
    for (const role of ['owner', 'admin', 'keeper', 'member']) {
      await setDoc(doc(db, 'seasons', S, 'members', role), { role, name: role });
    }
    await setDoc(doc(db, 'seasons', S, 'invites', TOKEN), {
      role: 'member', expiresAt: inDays(7), createdBy: 'admin', seasonName: 'Autumn',
    });
    await setDoc(doc(db, 'seasons', S, 'invites', 'tok_expired_0123456789'), {
      role: 'member', expiresAt: inDays(-1), createdBy: 'admin', seasonName: 'Autumn',
    });
    await setDoc(doc(db, 'seasons', S, 'players', 'guest1'), { name: 'Guest' });
    await setDoc(doc(db, 'seasons', S, 'players', 'p_member'), { name: 'Member', uid: 'member' });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('seasons', () => {
  test('members read their season; others and signed-out visitors cannot', async () => {
    await assertSucceeds(getDoc(doc(as('member'), 'seasons', S)));
    await assertFails(getDoc(doc(as('stranger'), 'seasons', S)));
    await assertFails(getDoc(doc(as(null), 'seasons', S)));
  });

  test('creating a season makes the creator its owner, in one write', async () => {
    const db = as('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'seasons', 'new'), { name: 'Spring', createdBy: 'alice', schemaVersion: 1 });
    batch.set(doc(db, 'seasons', 'new', 'members', 'alice'), { role: 'owner', name: 'Alice' });
    await assertSucceeds(batch.commit());
  });

  test('nobody makes themselves owner of an existing season', async () => {
    await assertFails(setDoc(doc(as('stranger'), 'seasons', S, 'members', 'stranger'), { role: 'owner', name: 'X' }));
    await assertFails(setDoc(doc(as('owner2'), 'seasons', 'new2', 'members', 'owner2'), { role: 'owner', name: 'X' }));
  });

  test('a season cannot be created in someone else\'s name', async () => {
    await assertFails(setDoc(doc(as('alice'), 'seasons', 'x'), { name: 'X', createdBy: 'bob', schemaVersion: 1 }));
  });

  test('admins edit the season, members do not; only owners delete it', async () => {
    const edit = { name: 'Autumn 2026', createdBy: 'owner', schemaVersion: 1 };
    await assertSucceeds(setDoc(doc(as('admin'), 'seasons', S), edit));
    await assertFails(setDoc(doc(as('member'), 'seasons', S), edit));
    await assertFails(setDoc(doc(as('admin'), 'seasons', S), { ...edit, createdBy: 'admin' }));
    await assertFails(deleteDoc(doc(as('admin'), 'seasons', S)));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'seasons', S)));
  });

  test('after deleting the season, the owner clears out the members, their own entry last', async () => {
    await assertFails(deleteDoc(doc(as('owner'), 'seasons', S, 'members', 'owner')));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'seasons', S)));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'seasons', S, 'members', 'member')));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'seasons', S, 'players', 'guest1')));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'seasons', S, 'invites', TOKEN)));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'seasons', S, 'members', 'owner')));
  });
});

describe('joining with an invite', () => {
  test('anyone signed in reads one invite; only admins list them', async () => {
    await assertSucceeds(getDoc(doc(as('stranger'), 'seasons', S, 'invites', TOKEN)));
    await assertFails(getDoc(doc(as(null), 'seasons', S, 'invites', TOKEN)));
    await assertFails(getDocs(collection(as('member'), 'seasons', S, 'invites')));
    await assertSucceeds(getDocs(collection(as('admin'), 'seasons', S, 'invites')));
  });

  test('joins with the invite\'s role', async () => {
    await assertSucceeds(setDoc(doc(as('newbie'), 'seasons', S, 'members', 'newbie'),
      { role: 'member', name: 'Newbie', invite: TOKEN }));
  });

  test('cannot take a higher role than the invite gives', async () => {
    await assertFails(setDoc(doc(as('newbie'), 'seasons', S, 'members', 'newbie'),
      { role: 'admin', name: 'Newbie', invite: TOKEN }));
  });

  test('cannot join with an expired or made-up invite, or without one', async () => {
    const m = (invite) => ({ role: 'member', name: 'N', ...(invite && { invite }) });
    await assertFails(setDoc(doc(as('newbie'), 'seasons', S, 'members', 'newbie'), m('tok_expired_0123456789')));
    await assertFails(setDoc(doc(as('newbie'), 'seasons', S, 'members', 'newbie'), m('tok_madeup_0123456789')));
    await assertFails(setDoc(doc(as('newbie'), 'seasons', S, 'members', 'newbie'), m()));
  });

  test('cannot add someone else', async () => {
    await assertFails(setDoc(doc(as('newbie'), 'seasons', S, 'members', 'other'),
      { role: 'member', name: 'Other', invite: TOKEN }));
  });

  test('admins create invites (not for owner, at most 31 days); members cannot', async () => {
    const inv = (role, days, by = 'admin') => ({ role, expiresAt: inDays(days), createdBy: by, seasonName: 'Autumn' });
    const ref = (db) => doc(db, 'seasons', S, 'invites', 'tok_new_0123456789abcd');
    await assertSucceeds(setDoc(ref(as('admin')), inv('keeper', 7)));
    await assertFails(setDoc(ref(as('admin')), inv('owner', 7)));
    await assertFails(setDoc(ref(as('admin')), inv('member', 60)));
    await assertFails(setDoc(ref(as('admin')), inv('member', 7, 'owner')));
    await assertFails(setDoc(ref(as('member')), inv('member', 7, 'member')));
    await assertFails(setDoc(doc(as('admin'), 'seasons', S, 'invites', 'short'), inv('member', 7)));
  });
});

describe('roles', () => {
  const role = (who, uid, r) => updateDoc(doc(as(who), 'seasons', S, 'members', uid), { role: r });

  test('admins promote members up to admin', async () => {
    await assertSucceeds(role('admin', 'member', 'keeper'));
    await assertSucceeds(role('admin', 'keeper', 'admin'));
  });

  test('admins cannot make owners or touch owners', async () => {
    await assertFails(role('admin', 'member', 'owner'));
    await assertFails(role('admin', 'owner', 'member'));
    await assertFails(deleteDoc(doc(as('admin'), 'seasons', S, 'members', 'owner')));
  });

  test('nobody changes their own role', async () => {
    await assertFails(role('member', 'member', 'admin'));
    await assertFails(role('admin', 'admin', 'owner'));
    await assertFails(role('owner', 'owner', 'member'));
  });

  test('owners make another owner, who can then step the first one down', async () => {
    await assertSucceeds(role('owner', 'admin', 'owner'));
    await assertSucceeds(role('admin', 'owner', 'admin'));
  });

  test('members and keepers cannot change roles', async () => {
    await assertFails(role('keeper', 'member', 'keeper'));
    await assertFails(role('member', 'keeper', 'member'));
  });

  test('everyone updates their own name, nothing else', async () => {
    await assertSucceeds(updateDoc(doc(as('member'), 'seasons', S, 'members', 'member'), { name: 'Joris' }));
    await assertFails(updateDoc(doc(as('member'), 'seasons', S, 'members', 'keeper'), { name: 'Hacked' }));
  });

  test('leaving and removing', async () => {
    await assertSucceeds(deleteDoc(doc(as('member'), 'seasons', S, 'members', 'member')));
    await assertFails(deleteDoc(doc(as('owner'), 'seasons', S, 'members', 'owner')));
    await assertFails(deleteDoc(doc(as('keeper'), 'seasons', S, 'members', 'admin')));
    await assertSucceeds(deleteDoc(doc(as('admin'), 'seasons', S, 'members', 'keeper')));
  });
});

describe('players', () => {
  const ref = (who, id) => doc(as(who), 'seasons', S, 'players', id);

  test('members read players; strangers cannot', async () => {
    await assertSucceeds(getDocs(collection(as('member'), 'seasons', S, 'players')));
    await assertFails(getDocs(collection(as('stranger'), 'seasons', S, 'players')));
  });

  test('admins add guests; members only add themselves', async () => {
    await assertSucceeds(setDoc(ref('admin', 'g2'), { name: 'Guest 2' }));
    await assertFails(setDoc(ref('member', 'g3'), { name: 'Guest 3' }));
    await assertSucceeds(setDoc(ref('keeper', 'p_keeper'), { name: 'Keeper', uid: 'keeper' }));
    await assertFails(setDoc(ref('keeper', 'p_x'), { name: 'X', uid: 'member' }));
  });

  test('a member claims a guest player, but not someone else\'s', async () => {
    await assertSucceeds(updateDoc(ref('keeper', 'guest1'), { uid: 'keeper', claimedAt: Timestamp.now() }));
    await assertFails(updateDoc(ref('keeper', 'p_member'), { uid: 'keeper' }));
  });

  test('a member renames their own player but cannot give it away', async () => {
    await assertSucceeds(updateDoc(ref('member', 'p_member'), { name: 'Joris' }));
    await assertFails(updateDoc(ref('member', 'p_member'), { uid: 'keeper' }));
  });

  test('only admins delete players', async () => {
    await assertFails(deleteDoc(ref('member', 'p_member')));
    await assertSucceeds(deleteDoc(ref('admin', 'guest1')));
  });
});

describe('users', () => {
  test('own profile and season list only', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users', 'alice'), { name: 'Alice' }));
    await assertSucceeds(setDoc(doc(as('alice'), 'users', 'alice', 'seasons', S), { name: 'Autumn' }));
    await assertFails(getDoc(doc(as('bob'), 'users', 'alice')));
    await assertFails(setDoc(doc(as('bob'), 'users', 'alice', 'seasons', S), { name: 'Autumn' }));
  });

  test('everything else is locked', async () => {
    await assertFails(setDoc(doc(as('alice'), 'other', 'x'), { a: 1 }));
  });
});
