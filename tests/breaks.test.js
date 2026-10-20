import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BreakTimer, formatClock } from '../js/breaks.js';

function fakeClock() {
  let now = 0;
  const intervals = new Map();
  let id = 0;
  return {
    now: () => now,
    setInterval(fn, ms) { intervals.set(++id, { fn, ms, next: now + ms }); return id; },
    clearInterval(i) { intervals.delete(i); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...intervals.values()].filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        now = due.next;
        due.next += due.ms;
        due.fn();
      }
      now = end;
    },
  };
}

test('counts down, warns at 20 s left, ends once', () => {
  const clock = fakeClock();
  const log = [];
  const t = new BreakTimer({
    onTick: (left) => log.push(left),
    onWarning: (kind) => log.push(`warn:${kind}`),
    onEnd: (kind) => log.push(`end:${kind}`),
  }, clock);
  t.start('interval', 60);
  assert.equal(log[0], 60);
  clock.advance(39_900);
  assert.ok(!log.includes('warn:interval'), 'no warning before 40 s');
  clock.advance(200);
  assert.ok(log.includes('warn:interval'), 'warning at 40 s');
  clock.advance(30_000);
  assert.equal(log.filter((x) => x === 'end:interval').length, 1);
  assert.equal(t.running, false);
  clock.advance(10_000);
  assert.equal(log.filter((x) => String(x).startsWith('end')).length, 1, 'no events after the end');
});

test('stop cancels without ending', () => {
  const clock = fakeClock();
  const log = [];
  const t = new BreakTimer({ onEnd: () => log.push('end') }, clock);
  t.start('game', 120);
  clock.advance(5000);
  t.stop();
  clock.advance(200_000);
  assert.deepEqual(log, []);
});

test('formats the clock', () => {
  assert.equal(formatClock(120), '2:00');
  assert.equal(formatClock(59), '0:59');
  assert.equal(formatClock(5), '0:05');
});

test('runs on the real clock (no fake timers)', async () => {
  const ticks = [];
  const t = new BreakTimer({ onTick: (left) => ticks.push(left) });
  t.start('interval', 60);
  await new Promise((r) => setTimeout(r, 1200));
  t.stop();
  assert.equal(ticks[0], 60);
  assert.ok(ticks.includes(59), `counted down: ${ticks.join(',')}`);
});
