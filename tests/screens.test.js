import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newKey, cleanKey, KEY_CHARS } from '../alpha/js/club.js';
import { announcement, notice } from '../alpha/js/calls.js';
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

test('what the screen (and a phone following the score) tells the players: interval and change ends', () => {
  const R = rulesFor('badminton', { bestOf: 3 });
  const play = (s, seq) => seq.reduce((x, team) => M.addPoint(x, team, R), s);
  const g1 = M.newMatch();
  assert.equal(notice(play(g1, Array(10).fill(0)), play(g1, Array(11).fill(0)), R), 'interval', '11 in game 1');
  assert.equal(notice(play(g1, Array(11).fill(0)), play(g1, [...Array(11).fill(0), 1]), R), null, 'play goes on');
  assert.equal(notice(play(g1, Array(11).fill(0)), play(g1, Array(10).fill(0)), R), null, 'an undo says nothing');
  const over1 = play(g1, Array(21).fill(0));
  assert.equal(notice(play(g1, Array(20).fill(0)), over1, R), null, 'a game won: the game-over screen says it');
  const g2 = M.nextGame(over1, R);
  assert.equal(notice(over1, g2, R), 'ends', 'the next game: change ends');
  const g3 = M.nextGame(play(g2, Array(21).fill(1)), R);
  assert.equal(notice(play(g3, Array(10).fill(0)), play(g3, Array(11).fill(0)), R), 'intervalEnds', '11 in the decider');
});
