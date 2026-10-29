import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newKey, cleanKey, KEY_CHARS } from '../alpha/js/club.js';
import { announcement } from '../alpha/js/calls.js';
import { rulesFor } from '../alpha/js/sports.js';
import * as M from '../alpha/js/match.js';

test('screen keys: 6 characters that can\'t be mixed up', () => {
  const key = newKey();
  assert.match(key, /^[A-Z2-9]{6}$/);
  for (const c of 'O0I1L') assert.ok(!KEY_CHARS.includes(c), `${c} is not used`);
  assert.equal(cleanKey('abc 23x'), 'ABC23X');
  assert.equal(cleanKey('ab-c2-3x9'), 'ABC23X');
});

test('what a screen says when the score of its court changes', () => {
  const R = rulesFor('badminton', { points: 21, bestOf: 3 });
  const names = ['Joris & Ann', 'Tom'];
  const play = (s, seq) => seq.reduce((x, team) => M.addPoint(x, team, R), s);
  const s0 = M.newMatch(0);
  assert.equal(announcement(s0, s0, R, names), null, 'nothing changed');
  assert.equal(announcement(s0, play(s0, [0]), R, names), '1 0');
  assert.equal(announcement(play(s0, [0]), play(s0, [0, 1]), R, names), '1 all');
  const g1 = play(s0, Array(20).fill(0));
  assert.equal(announcement(g1, play(g1, [0]), R, names), 'Game, Joris & Ann. 21 0');
  assert.equal(announcement(play(s0, [0, 0]), play(s0, [0]), R, names), 'Undo. 1 0');
  const next = M.nextGame(play(g1, [0]), R);
  assert.equal(announcement(play(g1, [0]), next, R, names), null, 'a new game without points: nothing to say yet');
});
