import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapsCounter } from '../alpha/js/burst.js';
import { SPORTS } from '../alpha/js/sports.js';
import { LANGUAGES } from '../alpha/js/i18n.js';

test('the easter egg needs five quick taps in a row', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  let fired = 0;
  const tap = tapsCounter(5, () => { fired += 1; });
  for (let i = 0; i < 4; i++) { tap(); now += 200; }
  assert.equal(fired, 0);
  now += 1000; // too slow: starts counting again
  for (let i = 0; i < 4; i++) { tap(); now += 200; }
  assert.equal(fired, 0);
  tap();
  assert.equal(fired, 1);
});

test('every sport has an icon and a name in every language', () => {
  assert.ok(SPORTS.length >= 1);
  for (const s of SPORTS) {
    assert.match(s.icon, /<(path|g|circle)/);
    for (const [code, { strings }] of Object.entries(LANGUAGES)) assert.ok(strings[`sport.${s.id}`], `${code}: no name for ${s.id}`);
  }
});
