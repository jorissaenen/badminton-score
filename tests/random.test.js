import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secureCoinFlip } from '../beta/js/random.js';

test('uses the secure generator and returns only 0 or 1', () => {
  let calls = 0;
  const fake = { getRandomValues: (a) => { calls++; a[0] = 0b10110011; return a; } };
  assert.equal(secureCoinFlip(fake), 1);
  assert.equal(calls, 1);
  assert.equal(secureCoinFlip({ getRandomValues: (a) => { a[0] = 0b10110010; return a; } }), 0);
});

test('every possible random byte maps to heads or tails exactly half of the time', () => {
  const counts = [0, 0];
  for (let v = 0; v < 256; v++) counts[secureCoinFlip({ getRandomValues: (a) => { a[0] = v; return a; } })]++;
  assert.deepEqual(counts, [128, 128]);
});

test('refuses to fall back to an insecure generator', () => {
  assert.throws(() => secureCoinFlip({}), /secure random/);
});

test('real draws are roughly balanced', () => {
  const counts = [0, 0];
  for (let i = 0; i < 20000; i++) counts[secureCoinFlip()]++;
  // 20 000 fair flips: a split outside 48–52 % has a probability far below one in a million.
  assert.ok(counts[0] > 9600 && counts[0] < 10400, `heads ${counts[0]} of 20000`);
});
