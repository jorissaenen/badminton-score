import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/match.js';

const R = { points: 21, cap: 30, bestOf: 3 };
const play = (state, seq) => seq.reduce((s, t) => M.addPoint(s, t, R), state);
const times = (team, n) => Array(n).fill(team);

test('21 points wins a game, win by 2, cap at 30', () => {
  let s = play(M.newMatch(), times(0, 21));
  assert.equal(M.gameWinner(M.currentGame(s), R), 0);

  s = play(M.newMatch(), [...Array(20)].flatMap(() => [0, 1]).concat(0));
  assert.equal(M.isGameOver(s, R), false, '21-20 is not over');
  s = play(s, [0]);
  assert.equal(M.gameWinner(M.currentGame(s), R), 0, '22-20 wins');

  s = play(M.newMatch(), [...Array(29)].flatMap(() => [0, 1]).concat(1));
  assert.equal(M.gameWinner(M.currentGame(s), R), 1, '30-29 wins at the cap');
});

test('points are ignored after the game ends', () => {
  const s = play(M.newMatch(), times(0, 21));
  assert.deepEqual(M.gameScore(M.currentGame(play(s, [1, 1]))), [21, 0]);
});

test('server is rally winner; court follows score parity', () => {
  let s = M.newMatch(1);
  assert.equal(M.server(M.currentGame(s)), 1);
  assert.equal(M.serviceCourt(M.currentGame(s)), 'right');
  s = play(s, [0]);
  assert.equal(M.server(M.currentGame(s)), 0);
  assert.equal(M.serviceCourt(M.currentGame(s)), 'left');
});

test('undo removes last point, also across a game boundary', () => {
  let s = play(M.newMatch(), [0, 1, 1]);
  s = M.undo(s);
  assert.deepEqual(M.gameScore(M.currentGame(s)), [1, 1]);

  s = M.nextGame(play(M.newMatch(), times(0, 21)), R);
  assert.equal(s.games.length, 2);
  s = M.undo(s);
  assert.equal(s.games.length, 1);
  assert.deepEqual(M.gameScore(M.currentGame(s)), [20, 0]);

  assert.deepEqual(M.undo(M.newMatch()), M.newMatch(), 'undo on empty match is a no-op');
});

test('next game: winner serves first; match ends at 2 games', () => {
  let s = play(M.newMatch(), times(1, 21));
  assert.equal(M.nextGame(play(M.newMatch(), [0]), R).games.length, 1, 'no next game mid-game');
  s = M.nextGame(s, R);
  assert.equal(M.server(M.currentGame(s)), 1);
  s = M.nextGame(play(s, times(1, 21)), R);
  // match won 2-0 -> nextGame starts a fresh match
  assert.equal(s.games.length, 1);
  assert.deepEqual(M.gameScore(M.currentGame(s)), [0, 0]);

  s = play(M.newMatch(), times(1, 21));
  s = play(M.nextGame(s, R), times(1, 21));
  assert.equal(M.matchWinner(s, R), 1);
});
