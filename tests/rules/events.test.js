// Security rules for events, recurring series and registrations. Runs against the Firestore
// emulator: npm run test:rules
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';

setLogLevel('silent'); // denied writes are expected here; the assertions report them

let env;
const C = 'club1';
const event = {
  type: 'training', date: '2026-11-03', start: '20:00', end: '21:30',
  startsAt: Timestamp.fromDate(new Date('2026-11-03T20:00:00+01:00')), status: 'planned',
  location: 'Sporthal', courts: 2,
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-badminton-events',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'clubs', C), { name: 'BC Smash', createdBy: 'owner', schemaVersion: 1 });
    for (const role of ['owner', 'admin', 'keeper', 'member']) {
      await setDoc(doc(db, 'clubs', C, 'members', role), { role, name: role });
    }
    await setDoc(doc(db, 'clubs', C, 'players', 'p_member'), { name: 'Member', uid: 'member' });
    await setDoc(doc(db, 'clubs', C, 'players', 'p_keeper'), { name: 'Keeper', uid: 'keeper' });
    await setDoc(doc(db, 'clubs', C, 'players', 'guest'), { name: 'Guest' });
    await setDoc(doc(db, 'clubs', C, 'events', 'e1'), event);
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const ev = (who, id = 'e2') => doc(as(who), 'clubs', C, 'events', id);
const reg = (who, player, e = 'e1') => doc(as(who), 'clubs', C, 'events', e, 'registrations', player);

describe('events', () => {
  test('admins create, change and delete events', async () => {
    await assertSucceeds(setDoc(ev('admin'), event));
    await assertSucceeds(updateDoc(ev('admin'), { status: 'cancelled' }));
    await assertSucceeds(deleteDoc(ev('admin')));
  });

  test('members see events but do not create them', async () => {
    await assertSucceeds(getDoc(ev('member', 'e1')));
    await assertFails(getDoc(ev('stranger', 'e1')));
    await assertFails(setDoc(ev('keeper'), event));
  });

  test('only known types and statuses', async () => {
    await assertFails(setDoc(ev('admin'), { ...event, type: 'party' }));
    await assertFails(setDoc(ev('admin'), { ...event, status: 'maybe' }));
    await assertFails(setDoc(ev('admin'), { ...event, startsAt: '20:00' }));
  });

  test('series: members read, admins write', async () => {
    const ref = (who) => doc(as(who), 'clubs', C, 'series', 's1');
    await assertSucceeds(setDoc(ref('admin'), { weekday: 2, start: '20:00' }));
    await assertSucceeds(getDoc(ref('member')));
    await assertFails(setDoc(ref('member'), { weekday: 3 }));
  });
});

describe('registrations', () => {
  test('a member answers for their own player, with a note', async () => {
    await assertSucceeds(setDoc(reg('member', 'p_member'), { status: 'going', by: 'member' }));
    await assertSucceeds(setDoc(reg('member', 'p_member'), { status: 'not going', note: 'Sick, sorry', by: 'member' }));
    await assertSucceeds(deleteDoc(reg('member', 'p_member')));
  });

  test('not for someone else, nor for a player without an account', async () => {
    await assertFails(setDoc(reg('member', 'p_keeper'), { status: 'going', by: 'member' }));
    await assertFails(setDoc(reg('member', 'guest'), { status: 'going', by: 'member' }));
  });

  test('admins answer for anyone', async () => {
    await assertSucceeds(setDoc(reg('admin', 'guest'), { status: 'going', by: 'admin' }));
    await assertSucceeds(setDoc(reg('admin', 'p_member'), { status: 'not going', by: 'admin' }));
  });

  test('score keepers mark who is here, for anyone', async () => {
    await assertSucceeds(setDoc(reg('keeper', 'guest'), { status: 'going', by: 'keeper' }));
    await assertSucceeds(setDoc(reg('keeper', 'p_member'), { status: 'not going', by: 'keeper' }));
    await assertSucceeds(deleteDoc(reg('keeper', 'p_member')));
  });

  test('the answer is signed by whoever gave it, and stays short', async () => {
    await assertFails(setDoc(reg('member', 'p_member'), { status: 'going', by: 'admin' }));
    await assertFails(setDoc(reg('member', 'p_member'), { status: 'maybe', by: 'member' }));
    await assertFails(setDoc(reg('member', 'p_member'), { status: 'going', by: 'member', note: 'x'.repeat(141) }));
  });

  test('everyone in the club sees who is coming; outsiders do not', async () => {
    await assertSucceeds(getDoc(reg('keeper', 'p_member')));
    await assertFails(getDoc(reg('stranger', 'p_member')));
  });
});

describe('devices', () => {
  test('own devices only', async () => {
    await assertSucceeds(setDoc(doc(as('member'), 'users', 'member', 'devices', 'd1'), { token: 't' }));
    await assertFails(getDoc(doc(as('admin'), 'users', 'member', 'devices', 'd1')));
  });
});
