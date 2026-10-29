import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// html`` escapes plain strings, so an attribute written as a string ('aria-disabled="true"')
// ends up as broken text and the attribute is lost. It has to be raw('…') or html`…`.
test('no attributes written as plain strings inside the screens\' templates', () => {
  const dir = new URL('../alpha/js/views/', import.meta.url).pathname;
  const bad = [];
  for (const f of readdirSync(dir)) {
    readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/[?:]\s*'[^']*\w="[^"]*"[^']*'/.test(line) && !/raw\('/.test(line.match(/[?:]\s*(raw\(')?'?[^']*\w="/)?.[0] ?? '')) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
