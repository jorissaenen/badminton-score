import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, manualSteps, browserChoices } from '../js/install.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
};

test('detects OS and browser', () => {
  assert.deepEqual(detectPlatform({ userAgent: UA.iphoneSafari }), { os: 'ios', browser: 'safari' });
  assert.deepEqual(detectPlatform({ userAgent: UA.iphoneChrome }), { os: 'ios', browser: 'chrome' });
  assert.deepEqual(detectPlatform({ userAgent: UA.ipad, maxTouchPoints: 5 }), { os: 'ipados', browser: 'safari' });
  assert.deepEqual(detectPlatform({ userAgent: UA.ipad, maxTouchPoints: 0 }), { os: 'macos', browser: 'safari' });
  assert.deepEqual(detectPlatform({ userAgent: UA.androidChrome }), { os: 'android', browser: 'chrome' });
  assert.deepEqual(detectPlatform({ userAgent: UA.androidSamsung }), { os: 'android', browser: 'samsung' });
  assert.deepEqual(detectPlatform({ userAgent: UA.androidFirefox }), { os: 'android', browser: 'firefox' });
  assert.deepEqual(detectPlatform({ userAgent: UA.winEdge }), { os: 'windows', browser: 'edge' });
});

const text = (steps) => steps.map((s) => s.text + (s.note ?? '')).join(' | ');

test('gives step-by-step guides per OS and browser', () => {
  assert.match(text(manualSteps({ os: 'ios', browser: 'safari' })), /Share.*bottom.*Add to Home Screen.*Open as Web App/);
  assert.match(text(manualSteps({ os: 'ipados', browser: 'safari' })), /top right/);
  assert.match(text(manualSteps({ os: 'ios', browser: 'vivaldi' })), /Vivaldi.*Share Page.*Add to Home Screen/);
  assert.match(text(manualSteps({ os: 'ios', browser: 'other' })), /Safari/);
  assert.match(text(manualSteps({ os: 'android', browser: 'samsung' })), /Add page to.*Home screen/);
  assert.match(text(manualSteps({ os: 'macos', browser: 'safari' })), /Add to Dock/);
  assert.equal(manualSteps(detectPlatform({ userAgent: UA.winFirefox })), null);
});

test('detects Vivaldi when it identifies itself, and offers a browser picker on phones', () => {
  const vivaios = UA.iphoneChrome + ' VivaiOS/VivaldiVersion/7.9';
  assert.deepEqual(detectPlatform({ userAgent: vivaios }), { os: 'ios', browser: 'vivaldi' });
  assert.ok(browserChoices('ios').includes('vivaldi'));
  assert.ok(browserChoices('android').includes('samsung'));
  assert.deepEqual(browserChoices('windows'), []);
});
