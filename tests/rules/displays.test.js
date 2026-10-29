// Security rules for screens (displays) linked to an event. Runs against the Firestore emulator:
// npm run test:rules
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';

setLogLevel('silent');

let env;
const C = 'club1';
const soon = () => Timestamp.fromMillis(Date.now() + 60_000);
const link = (who, changes = {}) => ({
  clubId: C, eventId: 'e1', mode: 'court', court: 1, announce: false, linkedBy: who, code: 'ABCDEF', ...changes,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-badminton-displays',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'clubs', C), { name: 'BC Smash', createdBy: 'owner', schemaVersion: 1 });
    await setDoc(doc(db, 'clubs', 'club2'), { name: 'Other', createdBy: 'x', schemaVersion: 1 });
    for (const role of ['owner', 'admin', 'keeper', 'member']) {
      await setDoc(doc(db, 'clubs', C, 'members', role), { role, name: role });
    }
    await setDoc(doc(db, 'clubs', C, 'events', 'e1'), { type: 'training', date: '2026-11-03', start: '20:00', end: '21:30', startsAt: Timestamp.now(), status: 'planned' });
    await setDoc(doc(db, 'clubs', C, 'matches', 'm1'), { eventId: 'e1' });
    await setDoc(doc(db, 'clubs', C, 'players', 'p1'), { name: 'Ann' });
    await setDoc(doc(db, 'clubs', 'club2', 'events', 'e9'), { type: 'training' });
    await setDoc(doc(db, 'displayCodes', 'ABCDEF'), { display: 'screen1', expiresAt: soon() });
    await setDoc(doc(db, 'displayCodes', 'OLDOLD'), { display: 'screen1', expiresAt: Timestamp.fromMillis(Date.now() - 5 * 60_000) });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const screen = (who, id = 'screen1') => doc(as(who), 'displays', id);

describe('screens', () => {
  test('a screen publishes its own keys for at most 2 minutes, and removes them', async () => {
    await assertSucceeds(setDoc(doc(as('screen1'), 'displayCodes', 'XYZ234'), { display: 'screen1', expiresAt: soon() }));
    await assertFails(setDoc(doc(as('screen1'), 'displayCodes', 'XYZ235'), { display: 'screen2', expiresAt: soon() }));
    await assertFails(setDoc(doc(as('screen1'), 'displayCodes', 'XYZ236'), { display: 'screen1', expiresAt: Timestamp.fromMillis(Date.now() + 3600_000) }));
    await assertFails(setDoc(doc(as(null), 'displayCodes', 'XYZ237'), { display: 'screen1', expiresAt: soon() }));
    await assertSucceeds(deleteDoc(doc(as('screen1'), 'displayCodes', 'XYZ234')));
    await assertFails(deleteDoc(doc(as('keeper'), 'displayCodes', 'ABCDEF')));
  });

  test('anyone signed in looks up one key; nobody lists them', async () => {
    await assertSucceeds(getDoc(doc(as('member'), 'displayCodes', 'ABCDEF')));
    await assertFails(getDoc(doc(as(null), 'displayCodes', 'ABCDEF')));
  });

  test('score keepers, admins and owners link a screen with a valid key; members do not', async () => {
    await assertFails(setDoc(screen('member'), link('member')));
    await assertSucceeds(setDoc(screen('keeper'), link('keeper')));
  });

  test('not with an old key, a key of another screen, or in someone else\'s name', async () => {
    await assertFails(setDoc(screen('keeper'), link('keeper', { code: 'OLDOLD' })));
    await assertFails(setDoc(screen('keeper', 'screen2'), link('keeper')));
    await assertFails(setDoc(screen('keeper'), link('admin')));
    await assertFails(setDoc(screen('keeper'), link('keeper', { clubId: 'club2', eventId: 'e9' })));
  });

  test('once linked: the club changes what it shows and the calls without a key, and unlinks it', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'displays', 'screen1'), link('keeper', { code: 'OLDOLD' })));
    await assertSucceeds(updateDoc(screen('admin'), { mode: 'overview', announce: true, linkedBy: 'admin' }));
    await assertFails(updateDoc(screen('member'), { announce: false, linkedBy: 'member' }));
    await assertSucceeds(deleteDoc(screen('owner')));
  });

  test('a linked screen reads its club, events and matches; not players, not other clubs', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'displays', 'screen1'), link('keeper')));
    const s = as('screen1');
    await assertSucceeds(getDoc(doc(s, 'clubs', C)));
    await assertSucceeds(getDoc(doc(s, 'clubs', C, 'events', 'e1')));
    await assertSucceeds(getDoc(doc(s, 'clubs', C, 'matches', 'm1')));
    await assertFails(getDoc(doc(s, 'clubs', C, 'players', 'p1')));
    await assertFails(getDoc(doc(s, 'clubs', 'club2', 'events', 'e9')));
    await assertFails(getDoc(doc(as('screen2'), 'clubs', C, 'events', 'e1')));
  });

  test('a screen reads its own entry and only says when it was last seen', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'displays', 'screen1'), link('keeper')));
    await assertSucceeds(getDoc(screen('screen1')));
    await assertSucceeds(updateDoc(screen('screen1'), { lastSeen: Timestamp.now() }));
    await assertFails(updateDoc(screen('screen1'), { clubId: 'club2' }));
    await assertFails(getDoc(screen('stranger')));
  });
});
