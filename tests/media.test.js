import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepeatFilter } from '../js/media.js';

function setup(gapMs = 1500) {
  let now = 0;
  const isRepeat = createRepeatFilter(gapMs, () => now);
  return { isRepeat, wait: (ms) => { now += ms; } };
}

test('a single command is never a repeat', () => {
  const { isRepeat } = setup();
  assert.equal(isRepeat('playpause'), false);
});

test('a burst of the same command counts once, however long it lasts', () => {
  const { isRepeat, wait } = setup();
  const seen = [isRepeat('playpause')];
  for (let i = 0; i < 10; i++) { wait(1000); seen.push(isRepeat('playpause')); }
  assert.deepEqual(seen, [false, ...Array(10).fill(true)]);
});

test('the same command after a quiet gap is a new press', () => {
  const { isRepeat, wait } = setup();
  isRepeat('next');
  wait(1500);
  assert.equal(isRepeat('next'), false);
});

test('a different command is always a new press', () => {
  const { isRepeat, wait } = setup();
  isRepeat('playpause');
  wait(100);
  assert.equal(isRepeat('previous'), false);
  wait(100);
  assert.equal(isRepeat('playpause'), false);
});
