import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The server (watches) scores with copies of the app's engine: they must be the same files.
test('the server\'s engine is the app\'s engine (npm run engine)', () => {
  for (const [app, server] of [['alpha/js/match.js', 'match.js'], ['alpha/js/sports.js', 'sports.js'], ['alpha/js/vendor/qrcode.js', 'qrcode.js']]) {
    const a = readFileSync(new URL(`../${app}`, import.meta.url), 'utf8');
    const b = readFileSync(new URL(`../functions/engine/${server}`, import.meta.url), 'utf8');
    assert.equal(b, a, `functions/engine/${server} differs from ${app}`);
  }
});
