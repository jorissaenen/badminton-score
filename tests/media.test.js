import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepeatFilter } from '../alpha/js/media.js';

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

test('only a pause away from a loop restart counts as a real play/pause press', async () => {
  const { playPauseIgnoreReason } = await import('../alpha/js/media.js');
  const base = { position: 120, duration: 180, now: 10_000, quietUntil: 0 };
  assert.equal(playPauseIgnoreReason({ ...base, raw: 'pause' }), null, 'earbud press while playing');
  assert.equal(playPauseIgnoreReason({ ...base, raw: 'play' }), 'system play');
  assert.equal(playPauseIgnoreReason({ ...base, raw: 'pause', position: 0.4 }), 'loop restart');
  assert.equal(playPauseIgnoreReason({ ...base, raw: 'pause', position: 179.5 }), 'loop restart');
  assert.equal(playPauseIgnoreReason({ ...base, raw: 'pause', quietUntil: 11_000 }), 'own sound');
  assert.equal(playPauseIgnoreReason({ ...base, raw: 'pause', duration: NaN }), null, 'unknown duration');
  assert.equal(playPauseIgnoreReason({ ...base, raw: 'pause', speaking: true }), 'own sound', 'voice is speaking');
});
