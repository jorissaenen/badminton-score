import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseLayout } from '../js/layout.js';

test('clear portrait and landscape sizes', () => {
  assert.equal(chooseLayout(390, 844, 'landscape'), 'portrait');
  assert.equal(chooseLayout(844, 390, 'portrait'), 'landscape');
});

test('near-square in-between sizes during a rotation keep the current layout', () => {
  assert.equal(chooseLayout(600, 620, 'landscape'), 'landscape');
  assert.equal(chooseLayout(620, 600, 'portrait'), 'portrait');
  assert.equal(chooseLayout(600, 600, undefined), 'portrait');
});
