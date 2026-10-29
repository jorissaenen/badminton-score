// Security rules for matches scored during an event. Runs against the Firestore emulator:
// npm run test:rules
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';

setLogLevel('silent'); // denied writes are expected here; the assertions report them

let env;
const C = 'club1';
const match = (keeper, changes = {}) => ({
  eventId: 'e1', sport: 'badminton', rules: { sport: 'badminton', points: 21, cap: 30, bestOf: 3 },
  home: [{ id: 'p_member', name: 'Member' }], away: [{ name: 'Guest' }],
  state: { games: [{ firstServer: 0, rallies: [] }] }, status: 'live', keeper, schemaVersion: 1, ...changes,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-badminton-matches',
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
    await setDoc(doc(db, 'clubs', C, 'events', 'e1'), {
      type: 'training', date: '2026-11-03', start: '20:00', end: '21:30',
      startsAt: Timestamp.fromDate(new Date('2026-11-03T20:00:00+01:00')), status: 'planned',
    });
    await setDoc(doc(db, 'clubs', C, 'matches', 'm1'), match('keeper'));
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const m = (who, id = 'm2') => doc(as(who), 'clubs', C, 'matches', id);

describe('matches', () => {
  test('members see the matches; outsiders do not', async () => {
    await assertSucceeds(getDoc(m('member', 'm1')));
    await assertFails(getDoc(m('stranger', 'm1')));
    await assertFails(getDoc(m(null, 'm1')));
  });

  test('a member starts a match and keeps its score; not in someone else\'s name', async () => {
    await assertSucceeds(setDoc(m('member'), match('member')));
    await assertFails(setDoc(m('member', 'm3'), match('keeper')));
    await assertFails(setDoc(m('stranger', 'm4'), match('stranger')));
  });

  test('a match belongs to an existing event, with one or two players a side, and starts live', async () => {
    await assertFails(setDoc(m('member'), match('member', { eventId: 'nope' })));
    await assertFails(setDoc(m('member'), match('member', { home: [] })));
    await assertFails(setDoc(m('member'), match('member', { away: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] })));
    await assertFails(setDoc(m('member'), match('member', { status: 'finished' })));
  });

  test('the keeper and admins update the score; other members do not', async () => {
    const score = { state: { games: [{ firstServer: 0, rallies: [0, 1, 0] }] } };
    await assertSucceeds(updateDoc(m('keeper', 'm1'), score));
    await assertSucceeds(updateDoc(m('admin', 'm1'), { status: 'finished' }));
    await assertFails(updateDoc(m('member', 'm1'), score));
  });

  test('the players, event, sport and keeper stay', async () => {
    await assertFails(updateDoc(m('keeper', 'm1'), { home: [{ name: 'Someone else' }] }));
    await assertFails(updateDoc(m('keeper', 'm1'), { sport: 'tennis' }));
    await assertFails(updateDoc(m('keeper', 'm1'), { keeper: 'member' }));
    await assertFails(updateDoc(m('keeper', 'm1'), { status: 'won' }));
  });

  test('the keeper removes their live match; a finished one only an admin removes', async () => {
    await assertFails(deleteDoc(m('member', 'm1')));
    await assertSucceeds(deleteDoc(m('keeper', 'm1')));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'clubs', C, 'matches', 'm1'), match('keeper', { status: 'finished' })));
    await assertFails(deleteDoc(m('keeper', 'm1')));
    await assertSucceeds(deleteDoc(m('admin', 'm1')));
  });
});
