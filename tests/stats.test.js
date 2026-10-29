import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventStats, lastPlayed } from '../alpha/js/stats.js';
import { eventPhase } from '../alpha/js/club.js';
import { rulesFor } from '../alpha/js/sports.js';

const R = rulesFor('badminton', { bestOf: 1 });
const won = (side, other = 15) => ({ games: [{ firstServer: 0, rallies: [...Array(21).fill(side), ...Array(other).fill(1 - side)] }] });
const at = (ms) => ({ toMillis: () => ms });
const ann = { id: 'ann', name: 'Ann' };
const tom = { id: 'tom', name: 'Tom' };
const lies = { id: 'lies', name: 'Lies' };
const guest = { name: 'Koen' };

test('statistics: played, won, lost and points per player; only finished matches count', () => {
  const matches = [
    { status: 'finished', rules: R, home: [ann], away: [tom], state: won(0, 15), finishedAt: at(1) },
    { status: 'finished', rules: R, home: [ann, guest], away: [tom, lies], state: won(1, 19), finishedAt: at(2) },
    { status: 'live', rules: R, home: [lies], away: [ann], state: { games: [{ firstServer: 0, rallies: [0, 0] }] } },
    { status: 'stopped', rules: R, home: [lies], away: [tom], state: won(0) },
  ];
  const rows = eventStats(matches);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.deepEqual([by.Tom.played, by.Tom.won, by.Tom.lost, by.Tom.for, by.Tom.against], [2, 1, 1, 36, 40]);
  assert.deepEqual([by.Ann.played, by.Ann.won, by.Ann.for, by.Ann.against], [2, 1, 40, 36]);
  assert.equal(by.Koen.id, null, 'a guest counts by name');
  assert.deepEqual(rows.map((r) => r.name).slice(0, 3), ['Lies', 'Ann', 'Tom'], 'most wins, then win %, then points difference');
});

test('who waits longest: playing now comes last, never played first', () => {
  const last = lastPlayed([
    { status: 'finished', home: [ann], away: [tom], finishedAt: at(100) },
    { status: 'live', home: [lies], away: [guest] },
  ]);
  assert.equal(last.ann, 100);
  assert.equal(last.lies, Infinity);
  assert.equal(last.nobody, undefined);
});

test('an event is upcoming, live or ended', () => {
  const e = { date: '2026-11-03', start: '20:00', end: '21:30', status: 'planned' };
  const ms = (time) => new Date(`2026-11-03T${time}:00`).getTime();
  assert.equal(eventPhase(e, ms('19:59')), 'upcoming');
  assert.equal(eventPhase(e, ms('20:00')), 'live');
  assert.equal(eventPhase(e, ms('21:29')), 'live');
  assert.equal(eventPhase(e, ms('21:30')), 'ended');
  assert.equal(eventPhase({ ...e, status: 'cancelled' }, ms('20:30')), 'cancelled');
});

test('after its end time, an event goes on while its last matches are played', () => {
  const e = { date: '2026-11-03', start: '20:00', end: '21:30', status: 'planned' };
  const ms = (time) => new Date(`2026-11-03T${time}:00`).getTime();
  const live = { status: 'live', startedAt: at(ms('21:20')), updatedAt: at(ms('21:40')) };
  assert.equal(eventPhase(e, ms('21:45'), [live]), 'finishing', 'a match is still being played: it can be finished');
  assert.equal(eventPhase(e, ms('22:30'), [live]), 'ended', 'nobody scored that match for half an hour');
  const done = { status: 'finished', startedAt: at(ms('21:20')), finishedAt: at(ms('21:50')) };
  assert.equal(eventPhase(e, ms('22:04'), [done]), 'finishing', 'less than 15 minutes after the last match');
  assert.equal(eventPhase(e, ms('22:05'), [done]), 'ended');
  assert.equal(eventPhase(e, ms('21:30'), []), 'ended', 'no matches: ends at its end time');
  assert.equal(eventPhase(e, ms('21:30')), 'ended', 'matches not known: ends at its end time');
  assert.equal(eventPhase(e, ms('21:45'), [{ status: 'live' }]), 'ended', 'a match without times (never reached the server) keeps nothing going');
});
