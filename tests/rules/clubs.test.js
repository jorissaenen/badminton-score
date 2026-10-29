// Security rules for clubs, their members, invites, seasons and players. Runs against the Firestore emulator:
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
const C = 'club1';
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
    await setDoc(doc(db, 'clubs', C), { name: 'BC Smash', createdBy: 'owner', schemaVersion: 1 });
    for (const role of ['owner', 'admin', 'keeper', 'member']) {
      await setDoc(doc(db, 'clubs', C, 'members', role), { role, name: role });
    }
    await setDoc(doc(db, 'clubs', C, 'invites', TOKEN), {
      role: 'member', expiresAt: inDays(7), createdBy: 'admin', clubName: 'Autumn',
    });
    await setDoc(doc(db, 'clubs', C, 'invites', 'tok_expired_0123456789'), {
      role: 'member', expiresAt: inDays(-1), createdBy: 'admin', clubName: 'Autumn',
    });
    await setDoc(doc(db, 'clubs', C, 'players', 'guest1'), { name: 'Guest' });
    await setDoc(doc(db, 'clubs', C, 'players', 'p_member'), { name: 'Member', uid: 'member' });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('clubs', () => {
  test('members read their club; others and signed-out visitors cannot', async () => {
    await assertSucceeds(getDoc(doc(as('member'), 'clubs', C)));
    await assertFails(getDoc(doc(as('stranger'), 'clubs', C)));
    await assertFails(getDoc(doc(as(null), 'clubs', C)));
  });

  test('creating a club makes the creator its owner, in one write', async () => {
    const db = as('alice');
    const batch = writeBatch(db);
    batch.set(doc(db, 'clubs', 'new'), { name: 'Spring', createdBy: 'alice', schemaVersion: 1 });
    batch.set(doc(db, 'clubs', 'new', 'members', 'alice'), { role: 'owner', name: 'Alice' });
    await assertSucceeds(batch.commit());
  });

  test('nobody makes themselves owner of an existing club', async () => {
    await assertFails(setDoc(doc(as('stranger'), 'clubs', C, 'members', 'stranger'), { role: 'owner', name: 'X' }));
    await assertFails(setDoc(doc(as('owner2'), 'clubs', 'new2', 'members', 'owner2'), { role: 'owner', name: 'X' }));
  });

  test('a club cannot be created in someone else\'s name', async () => {
    await assertFails(setDoc(doc(as('alice'), 'clubs', 'x'), { name: 'X', createdBy: 'bob', schemaVersion: 1 }));
  });

  test('admins edit the club, members do not; only owners delete it', async () => {
    const edit = { name: 'Autumn 2026', createdBy: 'owner', schemaVersion: 1 };
    await assertSucceeds(setDoc(doc(as('admin'), 'clubs', C), edit));
    await assertFails(setDoc(doc(as('member'), 'clubs', C), edit));
    await assertFails(setDoc(doc(as('admin'), 'clubs', C), { ...edit, createdBy: 'admin' }));
    await assertFails(deleteDoc(doc(as('admin'), 'clubs', C)));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'clubs', C)));
  });

  test('after deleting the club, the owner clears out the members, their own entry last', async () => {
    await assertFails(deleteDoc(doc(as('owner'), 'clubs', C, 'members', 'owner')));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'clubs', C)));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'clubs', C, 'members', 'member')));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'clubs', C, 'players', 'guest1')));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'clubs', C, 'invites', TOKEN)));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'clubs', C, 'members', 'owner')));
  });
});

describe('joining with an invite', () => {
  test('anyone signed in reads one invite; only admins list them', async () => {
    await assertSucceeds(getDoc(doc(as('stranger'), 'clubs', C, 'invites', TOKEN)));
    await assertFails(getDoc(doc(as(null), 'clubs', C, 'invites', TOKEN)));
    await assertFails(getDocs(collection(as('member'), 'clubs', C, 'invites')));
    await assertSucceeds(getDocs(collection(as('admin'), 'clubs', C, 'invites')));
  });

  test('joins with the invite\'s role', async () => {
    await assertSucceeds(setDoc(doc(as('newbie'), 'clubs', C, 'members', 'newbie'),
      { role: 'member', name: 'Newbie', invite: TOKEN }));
  });

  test('cannot take a higher role than the invite gives', async () => {
    await assertFails(setDoc(doc(as('newbie'), 'clubs', C, 'members', 'newbie'),
      { role: 'admin', name: 'Newbie', invite: TOKEN }));
  });

  test('cannot join with an expired or made-up invite, or without one', async () => {
    const m = (invite) => ({ role: 'member', name: 'N', ...(invite && { invite }) });
    await assertFails(setDoc(doc(as('newbie'), 'clubs', C, 'members', 'newbie'), m('tok_expired_0123456789')));
    await assertFails(setDoc(doc(as('newbie'), 'clubs', C, 'members', 'newbie'), m('tok_madeup_0123456789')));
    await assertFails(setDoc(doc(as('newbie'), 'clubs', C, 'members', 'newbie'), m()));
  });

  test('cannot add someone else', async () => {
    await assertFails(setDoc(doc(as('newbie'), 'clubs', C, 'members', 'other'),
      { role: 'member', name: 'Other', invite: TOKEN }));
  });

  test('admins create invites (not for owner, at most 31 days); members cannot', async () => {
    const inv = (role, days, by = 'admin') => ({ role, expiresAt: inDays(days), createdBy: by, clubName: 'Autumn' });
    const ref = (db) => doc(db, 'clubs', C, 'invites', 'tok_new_0123456789abcd');
    await assertSucceeds(setDoc(ref(as('admin')), inv('keeper', 7)));
    await assertFails(setDoc(ref(as('admin')), inv('owner', 7)));
    await assertFails(setDoc(ref(as('admin')), inv('member', 60)));
    await assertFails(setDoc(ref(as('admin')), inv('member', 7, 'owner')));
    await assertFails(setDoc(ref(as('member')), inv('member', 7, 'member')));
    await assertFails(setDoc(doc(as('admin'), 'clubs', C, 'invites', 'short'), inv('member', 7)));
  });
});

describe('roles', () => {
  const role = (who, uid, r) => updateDoc(doc(as(who), 'clubs', C, 'members', uid), { role: r });

  test('admins promote members up to admin', async () => {
    await assertSucceeds(role('admin', 'member', 'keeper'));
    await assertSucceeds(role('admin', 'keeper', 'admin'));
  });

  test('admins cannot make owners or touch owners', async () => {
    await assertFails(role('admin', 'member', 'owner'));
    await assertFails(role('admin', 'owner', 'member'));
    await assertFails(deleteDoc(doc(as('admin'), 'clubs', C, 'members', 'owner')));
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
    await assertSucceeds(updateDoc(doc(as('member'), 'clubs', C, 'members', 'member'), { name: 'Joris' }));
    await assertFails(updateDoc(doc(as('member'), 'clubs', C, 'members', 'keeper'), { name: 'Hacked' }));
  });

  test('leaving and removing', async () => {
    await assertSucceeds(deleteDoc(doc(as('member'), 'clubs', C, 'members', 'member')));
    await assertFails(deleteDoc(doc(as('owner'), 'clubs', C, 'members', 'owner')));
    await assertFails(deleteDoc(doc(as('keeper'), 'clubs', C, 'members', 'admin')));
    await assertSucceeds(deleteDoc(doc(as('admin'), 'clubs', C, 'members', 'keeper')));
  });
});

describe('seasons', () => {
  const season = { name: '2026–27', start: '2026-09-01', end: '2027-06-30' };
  const ref = (who, id = 's2') => doc(as(who), 'clubs', C, 'seasons', id);

  test('admins add, change and delete seasons', async () => {
    await assertSucceeds(setDoc(ref('admin'), season));
    await assertSucceeds(updateDoc(ref('admin'), { name: '2026/27' }));
    await assertSucceeds(deleteDoc(ref('owner')));
  });

  test('members and keepers read seasons but do not change them', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'clubs', C, 'seasons', 's1'), season));
    await assertSucceeds(getDoc(ref('member', 's1')));
    await assertFails(getDoc(ref('stranger', 's1')));
    await assertFails(setDoc(ref('keeper'), season));
    await assertFails(deleteDoc(ref('member', 's1')));
  });

  test('a season ends after it starts', async () => {
    await assertFails(setDoc(ref('admin'), { ...season, end: '2026-08-01' }));
    await assertFails(setDoc(ref('admin'), { name: 'X', start: '2026-09-01' }));
  });
});

describe('players', () => {
  const ref = (who, id) => doc(as(who), 'clubs', C, 'players', id);

  test('members read players; strangers cannot', async () => {
    await assertSucceeds(getDocs(collection(as('member'), 'clubs', C, 'players')));
    await assertFails(getDocs(collection(as('stranger'), 'clubs', C, 'players')));
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
  test('own profile and club list only', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users', 'alice'), { name: 'Alice' }));
    await assertSucceeds(setDoc(doc(as('alice'), 'users', 'alice', 'clubs', C), { name: 'Autumn' }));
    await assertFails(getDoc(doc(as('bob'), 'users', 'alice')));
    await assertFails(setDoc(doc(as('bob'), 'users', 'alice', 'clubs', C), { name: 'Autumn' }));
  });

  test('everything else is locked', async () => {
    await assertFails(setDoc(doc(as('alice'), 'other', 'x'), { a: 1 }));
  });
});

describe('photos', () => {
  const jpeg = `data:image/jpeg;base64,${'A'.repeat(40_000)}`;

  test('members set their own photo: from Google, chosen in the app, or none', async () => {
    const me = doc(as('member'), 'clubs', C, 'members', 'member');
    await assertSucceeds(updateDoc(me, { photoURL: 'https://lh3.googleusercontent.com/a/x' }));
    await assertSucceeds(updateDoc(me, { photoURL: jpeg }));
    await assertSucceeds(updateDoc(me, { photoURL: null }));
    await assertFails(updateDoc(doc(as('member'), 'clubs', C, 'members', 'keeper'), { photoURL: jpeg }));
  });

  test('no other kinds of links, and no huge photos', async () => {
    const me = doc(as('member'), 'clubs', C, 'members', 'member');
    await assertFails(updateDoc(me, { photoURL: 'javascript:alert(1)' }));
    await assertFails(updateDoc(me, { photoURL: 'http://example.com/a.jpg' }));
    await assertFails(updateDoc(me, { photoURL: `data:image/jpeg;base64,${'A'.repeat(120_000)}` }));
  });

  test('your own photo in your profile; nobody else\'s', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users', 'alice'), { photo: jpeg }, { merge: true }));
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice'), { photo: 'data:text/html;base64,AAAA' }, { merge: true }));
    await assertFails(setDoc(doc(as('bob'), 'users', 'alice'), { photo: jpeg }, { merge: true }));
  });
});
