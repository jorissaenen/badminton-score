import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../js/gesture.js';

// Minimal fake clock.
function clock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(i) { timers.delete(i); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
}

function setup() {
  const c = clock();
  const out = [];
  const g = new GestureRecognizer((x) => out.push(x), {}, c);
  const click = () => { g.press(); c.advance(60); g.release(); };
  return { c, out, g, click };
}

test('single click', () => {
  const { c, out, click } = setup();
  click();
  c.advance(300);
  assert.deepEqual(out, []);
  c.advance(300);
  assert.deepEqual(out, ['single']);
});

test('double click', () => {
  const { c, out, click } = setup();
  click(); c.advance(200); click(); c.advance(1000);
  assert.deepEqual(out, ['double']);
});

test('two slow clicks are two singles', () => {
  const { c, out, click } = setup();
  click(); c.advance(800); click(); c.advance(1000);
  assert.deepEqual(out, ['single', 'single']);
});

test('long press fires while held, no click on release', () => {
  const { c, out, g } = setup();
  g.press(); c.advance(850);
  assert.deepEqual(out, ['long']);
  g.release(); c.advance(1000);
  assert.deepEqual(out, ['long']);
});

test('long press with auto-repeating keydown/keyup pairs', () => {
  const { c, out, g } = setup();
  for (let t = 0; t < 1000; t += 40) { g.press(); c.advance(20); g.release(); c.advance(20); }
  c.advance(1000);
  assert.deepEqual(out, ['long']);
});

test('keyboard auto-repeat keydowns are ignored', () => {
  const { c, out, g } = setup();
  g.press(); c.advance(30); g.press(); c.advance(30); g.press(); g.release(); c.advance(1000);
  assert.deepEqual(out, ['single']);
});
