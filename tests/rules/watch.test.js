// Watches: linking a watch to an account and scoring with it (functions/watch.js), against the
// Firestore emulator; and the rules for confirming a link. npm run test:rules
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setLogLevel, updateDoc, deleteDoc } from 'firebase/firestore';

setLogLevel('silent');
const PROJECT = 'demo-badminton-watch';
process.env.GCLOUD_PROJECT = PROJECT;
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { handle } = await import('../../functions/watch.js');

let env;
let db;
const C = 'club1';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
  db = getFirestore(initializeApp({ projectId: PROJECT }, 'watch-test'));
});
after(() => env.cleanup());

const match = (changes = {}) => ({
  eventId: 'e1', sport: 'badminton', rules: { sport: 'badminton', points: 21, cap: 30, bestOf: 3 },
  home: [{ name: 'Ann' }, { name: 'Koen' }], away: [{ name: 'Lies' }, { name: 'Tom' }],
  state: { games: [{ firstServer: 0, rallies: [] }] }, status: 'live', keeper: 'joris', version: 0, lastPointAt: null,
  court: 1, schemaVersion: 1, ...changes,
});

beforeEach(async () => {
  await env.clearFirestore();
  await db.doc('users/joris').set({ name: 'Joris' });
  await db.doc(`users/joris/clubs/${C}`).set({ name: 'BC Partymakers' });
  await db.doc(`clubs/${C}`).set({ name: 'BC Partymakers', createdBy: 'joris', schemaVersion: 1 });
  await db.doc(`clubs/${C}/members/joris`).set({ role: 'owner', name: 'Joris' });
  await db.doc(`clubs/${C}/matches/m1`).set(match());
});

const call = (method, path, { body, query, token, now } = {}) => handle(db, {
  method, path, body, query, headers: token ? { authorization: `Bearer ${token}` } : {},
}, now);
const as = (uid) => env.authenticatedContext(uid).firestore();

// Links a watch to Joris: the watch asks for a key, Joris confirms it in the app, the watch asks again.
async function linkWatch() {
  const start = await call('POST', '/watch/link/start', { body: { model: 'Forerunner 265' } });
  const { key, secret } = start.json;
  await assertSucceeds(updateDoc(doc(as('joris'), 'watchLinks', key), { uid: 'joris', userName: 'Joris', confirmedAt: serverTimestamp() }));
  const linked = await call('POST', '/watch/link/poll', { body: { key, secret } });
  return linked.json.token;
}

describe('linking a watch', () => {
  test('the watch gets a key and a QR code; it waits until someone confirms', async () => {
    const r = await call('POST', '/watch/link/start', { body: { model: 'Forerunner 265' } });
    assert.equal(r.status, 200);
    assert.match(r.json.key, /^[A-Z2-9]{6}$/);
    assert.ok(r.json.qr.length > 20 && /^[01]+$/.test(r.json.qr[0]), 'rows of the QR code');
    assert.ok(r.json.url.endsWith(`?watch=${r.json.key}`));
    const poll = await call('POST', '/watch/link/poll', { body: { key: r.json.key, secret: r.json.secret } });
    assert.equal(poll.json.status, 'waiting');
    const wrong = await call('POST', '/watch/link/poll', { body: { key: r.json.key, secret: 'guess' } });
    assert.equal(wrong.status, 403);
  });

  test('confirmed in the app: the watch gets its own key for that account, once', async () => {
    const token = await linkWatch();
    assert.ok(token.length > 30);
    const me = await call('GET', '/watch/me', { token });
    assert.deepEqual(me.json, { name: 'Joris' });
    const watches = await db.collection('users/joris/watches').get();
    assert.equal(watches.size, 1);
    assert.equal(watches.docs[0].data().model, 'Forerunner 265');
  });

  test('only someone with an account confirms, for themselves, before the key expires', async () => {
    const r = await call('POST', '/watch/link/start', { body: {} });
    const key = r.json.key;
    await assertFails(updateDoc(doc(env.authenticatedContext('anon', { firebase: { sign_in_provider: 'anonymous' } }).firestore(), 'watchLinks', key), { uid: 'anon', userName: 'X', confirmedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('joris'), 'watchLinks', key), { uid: 'someone', userName: 'X', confirmedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(as('joris'), 'watchLinks', key)));
    await db.doc(`watchLinks/${key}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await assertFails(updateDoc(doc(as('joris'), 'watchLinks', key), { uid: 'joris', userName: 'Joris', confirmedAt: serverTimestamp() }));
  });

  test('unlinked in the app (You → Watches): the watch\'s key stops working', async () => {
    const token = await linkWatch();
    const watches = await db.collection('users/joris/watches').get();
    await assertSucceeds(deleteDoc(doc(as('joris'), 'users', 'joris', 'watches', watches.docs[0].id)));
    assert.equal((await call('GET', '/watch/me', { token })).status, 401);
    assert.equal((await call('GET', '/watch/me', { token: 'made-up' })).status, 401);
  });
});

describe('scoring with a watch', () => {
  test('the matches being played in your clubs, with the score', async () => {
    const token = await linkWatch();
    const r = await call('GET', '/watch/matches', { token });
    assert.equal(r.json.matches.length, 1);
    const m = r.json.matches[0];
    assert.deepEqual([m.home, m.away, m.court, m.tiles, m.server, m.version], ['Ann & Koen', 'Lies & Tom', 1, ['00', '00'], 0, 0]);
    assert.deepEqual([m.mine, m.ends, m.interval], [null, false, false]);
    assert.equal(r.json.pollIn, 20, 'a match being played: ask again in 20 s');
  });

  test('how long a point takes, for the watch to ask when the next one is likely', async () => {
    const token = await linkWatch();
    const r = await call('GET', '/watch/match', { token, query: { club: C, match: 'm1', pace: '1' } });
    assert.equal(r.json.pointMs, 18000, 'nothing to go on yet: what is usual in badminton');
  });

  test('the side you play on (for "My team on UP"), the interval and the change of ends', async () => {
    const token = await linkWatch();
    const rules = { sport: 'badminton', points: 21, cap: 30, bestOf: 3 };
    await db.doc(`clubs/${C}/matches/m1`).set(match({ rules, away: [{ id: 'joris', name: 'Joris' }], state: { games: [{ firstServer: 0, rallies: Array(21).fill(0) }, { firstServer: 0, rallies: Array(21).fill(1) }, { firstServer: 0, rallies: Array(10).fill(0) }] } }));
    const before = (await call('GET', '/watch/match', { token, query: { club: C, match: 'm1' } })).json;
    assert.deepEqual([before.mine, before.ends, before.interval], [1, false, false]);
    const r = await call('POST', '/watch/press', { token, body: { club: C, match: 'm1', basedOn: 0, action: 'point0' } });
    assert.deepEqual([r.json.counted, r.json.ends, r.json.interval], [true, true, true], '11 in the decider: interval, change ends');
  });

  test('a press counts on the latest score; the same press on an older score doesn\'t', async () => {
    const token = await linkWatch();
    const t0 = Date.now();
    const a = await call('POST', '/watch/press', { token, now: t0, body: { club: C, match: 'm1', basedOn: 0, action: 'point0' } });
    assert.equal(a.json.counted, true);
    assert.deepEqual(a.json.tiles, ['01', '00']);
    assert.equal(a.json.version, 1);
    const b = await call('POST', '/watch/press', { token, now: t0 + 6000, body: { club: C, match: 'm1', basedOn: 0, action: 'point1' } });
    assert.equal(b.json.counted, false);
    assert.equal(b.json.reason, 'stale');
    assert.deepEqual(b.json.tiles, ['01', '00'], 'with the score that stands');
  });

  test('frozen for 5 seconds after a point; undo works and ends it', async () => {
    const token = await linkWatch();
    const t0 = Date.now();
    await call('POST', '/watch/press', { token, now: t0, body: { club: C, match: 'm1', basedOn: 0, action: 'point0' } });
    const frozen = await call('POST', '/watch/press', { token, now: t0 + 2000, body: { club: C, match: 'm1', basedOn: 1, action: 'point1' } });
    assert.equal(frozen.json.reason, 'frozen');
    assert.ok(frozen.json.frozenMs > 2000 && frozen.json.frozenMs <= 3000);
    const undo = await call('POST', '/watch/press', { token, now: t0 + 2500, body: { club: C, match: 'm1', basedOn: 1, action: 'undo' } });
    assert.equal(undo.json.counted, true);
    assert.deepEqual(undo.json.tiles, ['00', '00']);
    const again = await call('POST', '/watch/press', { token, now: t0 + 2600, body: { club: C, match: 'm1', basedOn: 2, action: 'point1' } });
    assert.equal(again.json.counted, true);
  });

  test('the last point finishes the match; then it no longer takes points', async () => {
    const token = await linkWatch();
    const won = (side) => [...Array(20).fill(side)];
    await db.doc(`clubs/${C}/matches/m1`).set(match({ rules: { sport: 'badminton', points: 21, cap: 30, bestOf: 1 }, state: { games: [{ firstServer: 0, rallies: won(0) }] } }));
    const r = await call('POST', '/watch/press', { token, body: { club: C, match: 'm1', basedOn: 0, action: 'point0' } });
    assert.equal(r.json.matchWinner, 0);
    const m = (await db.doc(`clubs/${C}/matches/m1`).get()).data();
    assert.equal(m.status, 'finished');
    assert.equal(m.lastByName, 'Joris');
    const late = await call('POST', '/watch/press', { token, body: { club: C, match: 'm1', basedOn: 1, action: 'point1' } });
    assert.equal(late.json.reason, 'over');
    // Undoing the last point (BACK on the match-won screen) reopens it.
    const undo = await call('POST', '/watch/press', { token, body: { club: C, match: 'm1', basedOn: 1, action: 'undo' } });
    assert.equal(undo.json.counted, true);
    assert.equal(undo.json.matchWinner, null);
    assert.equal(undo.json.tiles[0], '20');
    const reopened = (await db.doc(`clubs/${C}/matches/m1`).get()).data();
    assert.deepEqual([reopened.status, reopened.winner], ['live', null]);
  });

  test('not in someone else\'s club', async () => {
    const token = await linkWatch();
    await db.doc('clubs/other/matches/x').set(match());
    const r = await call('POST', '/watch/press', { token, body: { club: 'other', match: 'x', basedOn: 0, action: 'point0' } });
    assert.equal(r.status, 404);
  });
});

describe('a game started on a watch', () => {
  test('the sports, with their ways to play; the people: you, then who you played with', async () => {
    const token = await linkWatch();
    const sports = (await call('GET', '/watch/sports', { token })).json.sports;
    assert.deepEqual(sports.slice(0, 4).map((s) => s.id), ['badminton', 'padel', 'basketball', 'football']);
    const bb = sports.find((s) => s.id === 'basketball');
    assert.deepEqual([bb.timed, bb.values, bb.options[0].label], [true, [1, 2, 3], '4 × 10 min']);
    await db.doc(`clubs/${C}/members/ann`).set({ role: 'member', name: 'Ann' });
    await db.doc(`clubs/${C}/members/zoe`).set({ role: 'member', name: 'Zoë' });
    await db.doc(`clubs/${C}/matches/m2`).set(match({ home: [{ id: 'joris', name: 'Joris' }], away: [{ id: 'zoe', name: 'Zoë' }], updatedAt: Timestamp.now() }));
    const people = (await call('GET', '/watch/people', { token })).json.people;
    assert.deepEqual(people.map((p) => p.id), ['joris', 'zoe', 'ann']);
    assert.equal(people[0].me, true);
  });

  test('a point game: your own, scored at once (no freeze), in the list of matches', async () => {
    const token = await linkWatch();
    await db.doc(`clubs/${C}/members/ann`).set({ role: 'member', name: 'Ann' });
    const g = (await call('POST', '/watch/game/start', { token, body: { sport: 'badminton', option: 1, home: ['joris', 'stranger'], away: ['ann'], guests: [1, 0] } })).json;
    assert.deepEqual([g.club, g.home, g.away, g.mine, g.tiles], ['', 'Joris & Guest', 'Ann', 0, ['00', '00']]);
    const saved = (await db.doc(`users/joris/games/${g.match}`).get()).data();
    assert.equal(saved.rules.points, 15);
    const t0 = Date.now();
    const a = await call('POST', '/watch/press', { token, now: t0, body: { club: '', match: g.match, basedOn: 0, action: 'point0' } });
    const b = await call('POST', '/watch/press', { token, now: t0 + 500, body: { club: '', match: g.match, basedOn: 1, action: 'point1' } });
    assert.deepEqual([a.json.counted, b.json.counted, b.json.tiles], [true, true, ['01', '01']]);
    const list = (await call('GET', '/watch/matches', { token })).json.matches;
    assert.equal(list[0].match, g.match, 'your own game first');
    assert.equal((await call('GET', '/watch/match', { token, query: { match: g.match } })).json.version, 2);
  });

  test('a timed game: the clock starts and pauses, points of 1, 2 or 3, the next period', async () => {
    const token = await linkWatch();
    const g = (await call('POST', '/watch/game/start', { token, body: { sport: 'basketball', option: 1 } })).json;
    assert.deepEqual([g.kind, g.home, g.away, g.periods, g.lengthMs, g.running], ['timed', 'Home', 'Away', 2, 20 * 60_000, false]);
    const t0 = Date.now();
    const at = (dt, action, basedOn, n) => call('POST', '/watch/press', { token, now: t0 + dt, body: { club: '', match: g.match, basedOn, action, n } });
    assert.equal((await at(0, 'start', 0)).json.running, true);
    assert.deepEqual((await at(1000, 'point0', 1, 3)).json.score, [3, 0]);
    const paused = (await at(60_000, 'pause', 2)).json;
    assert.deepEqual([paused.running, paused.elapsedMs], [false, 60_000]);
    assert.deepEqual((await at(61_000, 'point1', 3)).json.score, [3, 2], 'the usual 2 while paused');
    const ended = (await at(62_000, 'next', 4)).json;
    assert.deepEqual([ended.period, ended.past, ended.elapsedMs], [2, [[3, 2]], 0]);
    assert.equal((await at(63_000, 'pause', 5)).json.reason, 'nothing');
    const end = (await at(64_000, 'next', 5)).json;
    assert.equal(end.reason, 'notstarted');
    await at(65_000, 'start', 5);
    await at(66_000, 'pause', 6);
    const fin = (await at(67_000, 'next', 7)).json;
    assert.deepEqual([fin.finished, fin.winner, fin.status], [true, 0, 'finished']);
  });

  test('your games: only you read them, nobody writes them', async () => {
    await db.doc('users/joris/games/g1').set({ sport: 'football' });
    await assertSucceeds(getDoc(doc(as('joris'), 'users/joris/games/g1')));
    await assertFails(getDoc(doc(as('ann'), 'users/joris/games/g1')));
    await assertFails(updateDoc(doc(as('joris'), 'users/joris/games/g1'), { sport: 'basketball' }));
  });
});
