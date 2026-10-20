import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, manualSteps } from '../js/install.js';

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

test('gives platform-specific steps, none where install is unsupported', () => {
  assert.match(manualSteps({ os: 'ios', browser: 'safari' })[0][1], /bottom/);
  assert.match(manualSteps({ os: 'ipados', browser: 'safari' })[0][1], /top right/);
  assert.match(manualSteps({ os: 'ios', browser: 'chrome' }).at(-1)[1], /Safari/);
  assert.match(manualSteps({ os: 'android', browser: 'samsung' })[1][1], /Home screen/);
  assert.match(manualSteps({ os: 'macos', browser: 'safari' })[0][1], /Add to Dock/);
  assert.equal(manualSteps(detectPlatform({ userAgent: UA.winFirefox })), null);
});
