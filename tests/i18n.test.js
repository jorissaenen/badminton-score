import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES, chooseLanguage, people, setLanguage, t } from '../alpha/js/i18n.js';

const en = LANGUAGES.en.strings;
const ROOT = new URL('../alpha/', import.meta.url).pathname;

// Every key the app uses, read from the code: t('key') and data-t="key" in the page; keys built
// at run time (t(`role.${role}`)) are checked by their prefix.
function usedKeys() {
  const files = [join(ROOT, 'index.html')];
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory() && !['lang', 'vendor'].includes(d.name)) walk(p);
    else if (d.name.endsWith('.js') && d.name !== 'i18n.js') files.push(p);
  });
  walk(join(ROOT, 'js'));
  const namespaces = new Set(Object.keys(en).map((k) => k.split('.')[0]));
  const fixed = new Set();
  const prefixes = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.-]+)'/g)) fixed.add(m[1]);
    // Keys chosen in a condition: t(on ? 'a.b' : 'a.c').
    for (const m of src.matchAll(/'([a-zA-Z]+\.[\w.-]+)'/g)) if (namespaces.has(m[1].split('.')[0])) fixed.add(m[1]);
    for (const m of src.matchAll(/data-t(?:-label|-placeholder)?="([\w.-]+)"/g)) fixed.add(m[1]);
    for (const m of src.matchAll(/\bt\(`([\w.-]+)\$\{/g)) prefixes.add(m[1]);
  }
  return { fixed, prefixes };
}

const placeholders = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort();

test('every text the app uses exists in English', () => {
  const { fixed, prefixes } = usedKeys();
  const missing = [...fixed].filter((k) => !(k in en));
  assert.deepEqual(missing, []);
  for (const p of prefixes) assert.ok(Object.keys(en).some((k) => k.startsWith(p)), `no keys start with ${p}`);
});

test('every language has the same keys, placeholders and number forms as English', () => {
  for (const [code, { strings }] of Object.entries(LANGUAGES)) {
    assert.deepEqual(Object.keys(strings).filter((k) => !(k in en)), [], `${code} has keys English doesn't`);
    assert.deepEqual(Object.keys(en).filter((k) => !(k in strings)), [], `${code} misses keys`);
    for (const [k, v] of Object.entries(strings)) {
      assert.deepEqual(placeholders(v), placeholders(en[k]), `${code} ${k}: placeholders differ`);
      if (typeof v === 'object') assert.ok(v.other, `${code} ${k}: no "other" form`);
    }
  }
});

test('language: picked, else the device, else the time zone, else English', () => {
  assert.equal(chooseLanguage({ picked: 'nl', languages: ['en-US'] }), 'nl');
  assert.equal(chooseLanguage({ languages: ['nl-BE', 'en'] }), 'nl');
  assert.equal(chooseLanguage({ languages: ['fr-BE', 'en-GB'] }), 'en');
  assert.equal(chooseLanguage({ languages: ['fr-FR'], timeZone: 'Europe/Amsterdam' }), 'nl');
  assert.equal(chooseLanguage({ languages: [], timeZone: 'Asia/Tokyo' }), 'en');
  assert.equal(chooseLanguage({ picked: 'xx', languages: ['de'] }), 'en');
});

test('placeholders, number forms, and the verb that follows a pair of names', () => {
  setLanguage('en');
  assert.equal(t('club.nPlayers', { n: 1 }), '1 player');
  assert.equal(t('club.nPlayers', { n: 14 }), '14 players');
  assert.equal(t('board.winsMatch', { name: 'Joris', count: people('Joris') }), 'Joris wins the match');
  assert.equal(t('board.winsMatch', { name: 'Joris & Ann', count: people('Joris & Ann') }), 'Joris & Ann win the match');
  assert.equal(t('board.winsGame', { name: 'Tom and Lies', n: 2, count: people('Tom and Lies') }), 'Tom and Lies win game 2');
  assert.equal(t('board.winsGame', { name: 'Home', n: 1, count: people('Home') }), 'Home wins game 1');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('nl');
  assert.equal(t('board.winsMatch', { name: 'Joris & Ann', count: 2 }), 'Joris & Ann winnen de wedstrijd');
  assert.equal(t('call.all', { a: 11 }), '11 gelijk');
  setLanguage('en');
});
