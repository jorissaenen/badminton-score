// Fair, unpredictable random choices for deciding who serves first.
//
// Uses the Web Crypto API (crypto.getRandomValues), the browser's cryptographically secure random
// generator. It draws from the operating system's secure random source, the same one used for
// encryption keys, so the outcome can't be predicted or influenced. It's a web standard, built into
// every current browser; the implementations in WebKit (Safari, all iOS browsers) and Chromium are
// open source. Math.random() is deliberately not used: it is not designed to be unpredictable.

// 0 or 1, each with probability exactly 1/2: one random byte, lowest bit. 256 is even, so no value
// is favoured.
export function secureCoinFlip(source = globalThis.crypto) {
  if (!source?.getRandomValues) throw new Error('No secure random generator available');
  const byte = new Uint8Array(1);
  source.getRandomValues(byte);
  return byte[0] & 1;
}
