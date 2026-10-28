import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestVoice, sortedVoices } from '../alpha/js/audio.js';

const v = (name, lang, localService = true) => ({ name, lang, localService, voiceURI: name });

test('prefers a good local English voice over the device default language', () => {
  const list = [v('Xander', 'nl-NL'), v('Fred', 'en-US'), v('Samantha (Enhanced)', 'en-US'), v('Google UK English Female', 'en-GB', false)];
  assert.equal(bestVoice(list).name, 'Samantha (Enhanced)');
});

test('avoids compact voices and falls back to any voice', () => {
  assert.equal(bestVoice([v('Daniel (Compact)', 'en-GB'), v('Google UK English Male', 'en-GB')]).name, 'Google UK English Male');
  assert.equal(bestVoice([v('Xander', 'nl-NL')]).name, 'Xander');
  assert.equal(bestVoice([]), null);
});

test('lists English voices before others', () => {
  const names = sortedVoices([v('Xander', 'nl-NL'), v('Fred', 'en-US')]).map((x) => x.name);
  assert.deepEqual(names, ['Fred', 'Xander']);
});
