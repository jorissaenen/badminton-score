import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../alpha/js/timed.js';

const R = T.timedRules('basketball', 4, 10);
const MIN = 60_000;
// Applies actions [action, at(ms), n?] in order; every one must be accepted.
function run(actions, state = T.newTimed()) {
  for (const [a, at, n] of actions) {
    const r = T.timedPress(state, R, a, at, n);
    assert.ok(r.state, `${a} at ${at} refused: ${r.refused}`);
    state = r.state;
  }
  return state;
}

test('rules: one of the sport\'s lengths, else its first', () => {
  assert.deepEqual(T.timedRules('basketball', 2, 20), { sport: 'basketball', periods: 2, minutes: 20 });
  assert.deepEqual(T.timedRules('basketball', 3, 7), { sport: 'basketball', periods: 4, minutes: 10 });
  assert.deepEqual(T.timedRules('football'), { sport: 'football', periods: 2, minutes: 45 });
  assert.equal(T.isTimed('basketball'), true);
  assert.equal(T.isTimed('badminton'), false);
});

test('the clock runs, pauses and runs on; points count while it is paused', () => {
  const s = run([['start', 0], ['point0', 10_000, 3], ['pause', MIN], ['point1', 70_000, 1], ['start', 2 * MIN]]);
  const v = T.timedView(s, R, 2 * MIN + 30_000);
  assert.equal(v.elapsedMs, 90_000);
  assert.equal(v.leftMs, 10 * MIN - 90_000);
  assert.equal(v.running, true);
  assert.deepEqual(v.score, [3, 1]);
});

test('a point is the sport\'s usual value unless one of its values is given', () => {
  const s = run([['point0', 0], ['point1', 1, 7], ['point1', 2, 1]]);
  assert.deepEqual(T.timedView(s, R, 3).score, [2, 3]);
  const f = T.timedPress(T.newTimed(), T.timedRules('football'), 'point0', 0, 3).state;
  assert.deepEqual(T.timedView(f, T.timedRules('football'), 0).score, [1, 0]);
});

test('the period ends when its time is up; the next period starts on a stopped clock', () => {
  let s = run([['start', 0], ['point0', 5000, 2]]);
  const v = T.timedView(s, R, 11 * MIN);
  assert.equal(v.periodOver, true);
  assert.equal(v.running, false);
  assert.equal(v.leftMs, 0);
  assert.equal(T.timedPress(s, R, 'start', 11 * MIN).refused, 'periodover');
  s = run([['next', 12 * MIN]], s);
  const w = T.timedView(s, R, 13 * MIN);
  assert.equal(w.period, 2);
  assert.equal(w.elapsedMs, 0);
  assert.deepEqual(w.byPeriod, [[2, 0], [0, 0]]);
  s = run([['start', 13 * MIN]], s);
  assert.equal(T.timedView(s, R, 14 * MIN).elapsedMs, MIN);
});

test('next: not while the clock runs, nor before the period started; after the last, the end', () => {
  let s = run([['start', 0]]);
  assert.equal(T.timedPress(s, R, 'next', MIN).refused, 'running');
  assert.equal(T.timedPress(T.newTimed(), R, 'next', 0).refused, 'notstarted');
  const two = T.timedRules('basketball', 2, 20);
  s = T.newTimed();
  for (const [a, at] of [['start', 0], ['next', 21 * MIN], ['start', 22 * MIN], ['point1', 23 * MIN], ['next', 43 * MIN]]) s = T.timedPress(s, two, a, at).state;
  const v = T.timedView(s, two, 50 * MIN);
  assert.equal(v.finished, true);
  assert.equal(v.winner, 1);
  assert.equal(T.timedPress(s, two, 'point0', 50 * MIN).refused, 'over');
});

test('undo takes away the last point of this period, and opens an ended game again', () => {
  let s = run([['start', 0], ['point0', 1000, 2], ['pause', 2000], ['point1', 3000, 3]]);
  s = T.timedPress(s, R, 'undo', 4000).state;
  assert.deepEqual(T.timedView(s, R, 4000).score, [2, 0]);
  assert.equal(T.timedView(s, R, 4000).running, false, 'the clock events stay');
  s = run([['next', 5000]], s);
  assert.equal(T.timedPress(s, R, 'undo', 6000).refused, 'nothing');
  const two = T.timedRules('football', 2, 20);
  let f = T.newTimed();
  for (const [a, at] of [['start', 0], ['point0', 1], ['pause', 2], ['next', 3], ['start', 4], ['pause', 5], ['next', 6]]) f = T.timedPress(f, two, a, at).state;
  assert.equal(T.timedView(f, two, 7).finished, true);
  const back = T.timedPress(f, two, 'undo', 8);
  assert.equal(back.refused, 'nothing', 'no point in the last period');
  let g = T.newTimed();
  for (const [a, at] of [['start', 0], ['next', 21 * MIN], ['start', 22 * MIN], ['point1', 23 * MIN], ['pause', 24 * MIN], ['next', 25 * MIN]]) g = T.timedPress(g, two, a, at).state;
  g = T.timedPress(g, two, 'undo', 26 * MIN).state;
  const v = T.timedView(g, two, 26 * MIN);
  assert.equal(v.finished, false);
  assert.deepEqual(v.score, [0, 0]);
});
