// Sport wishes (functions/sportwish.js) against the Firestore emulator: counted per sport, once per
// device, a limit per connection per day, and nobody reads or writes them from the app.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');
const PROJECT = 'demo-badminton-wish';
process.env.GCLOUD_PROJECT = PROJECT;
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { wish, PER_DAY } = await import('../../functions/sportwish.js');

let env;
let db;
before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
  db = getFirestore(initializeApp({ projectId: PROJECT }, 'wish-test'));
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const send = (sport, extra = {}, ip = '1.2.3.4') => wish(db, { sport, device: extra.device ?? `d-${Math.random()}`, tz: 'Europe/Brussels', source: 'web', ...extra }, ip);

describe('sport wishes', () => {
  test('soccer and football count for one sport, with where they came from', async () => {
    const a = (await send('soccer')).json;
    const b = (await send('Voetbal', { tz: 'Europe/Amsterdam' })).json;
    assert.deepEqual([a.counted, a.key, a.label.en, b.key, b.label.nl], [true, 'football', 'Football', 'football', 'Voetbal']);
    const total = (await db.doc('sportWishTotals/football').get()).data();
    assert.equal(total.count, 2);
    const wishes = (await db.collection('sportWishes').get()).docs.map((d) => d.data()).sort((x, y) => x.country.localeCompare(y.country));
    assert.deepEqual(wishes.map((w) => [w.country, w.typed]), [['BE', 'soccer'], ['NL', 'Voetbal']]);
    assert.equal('ip' in wishes[0], false, 'no address kept');
  });

  test('a new sport, and its typo, end up together', async () => {
    await send('Shinty');
    const r = (await send('Shintty')).json;
    assert.equal(r.key, 'x-shinty');
    assert.equal((await db.doc('sportWishTotals/x-shinty').get()).data().count, 2);
  });

  test('once per sport per device; a limit per connection per day', async () => {
    await send('korfball', { device: 'phone1' });
    const again = (await send('Korfbal', { device: 'phone1' })).json;
    assert.deepEqual([again.counted, again.reason], [false, 'again']);
    for (let i = 1; i < PER_DAY; i += 1) await send(`hockey ${i % 2 ? '' : 'please'}`, { device: `p${i}` });
    const r = await send('rugby', { device: 'last' });
    assert.deepEqual([r.status, r.json.reason], [429, 'limit']);
    assert.equal((await send('rugby', { device: 'other' }, '5.6.7.8')).json.counted, true, 'another connection');
  });

  test('links, code and robots are not counted', async () => {
    assert.equal((await send('www.cheap-pills.com')).json.reason, 'invalid');
    const robot = (await send('cricket', { website: 'http://x' })).json;
    assert.equal(robot.counted, true, 'the robot sees nothing special');
    assert.equal((await db.doc('sportWishTotals/cricket').get()).exists, false);
  });

  test('nobody reads or writes wishes from the app', async () => {
    await send('padel');
    const me = env.authenticatedContext('joris').firestore();
    await assertFails(getDoc(doc(me, 'sportWishTotals/padel')));
    await assertFails(setDoc(doc(me, 'sportWishTotals/padel'), { count: 9999 }));
    await assertFails(setDoc(doc(me, 'sportWishes/x'), { key: 'padel' }));
  });
});
