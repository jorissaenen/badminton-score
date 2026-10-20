// Spoken score calls and confirmation beeps.
//
// Speech fixes for clipped or poor-sounding calls:
// - choose a good English voice instead of the device default (which may be a compact voice,
//   or a voice for another language reading English text);
// - start speech only after the beep has finished, so the two don't overlap;
// - only cancel speech when something is actually playing, and pause briefly after cancelling
//   (Chrome can drop the start of an utterance spoken right after cancel());
// - keep a reference to the utterance (Chrome can garbage-collect it mid-sentence, cutting
//   off the end);
// - keep the audio output awake with an inaudible signal, so phone speakers and Bluetooth
//   speakers don't need to power up (and swallow the first syllable) at every call.

const QUALITY_HINTS = [/natural/i, /neural/i, /premium/i, /enhanced/i, /siri/i, /wavenet/i];
const PREFERRED_NAMES = [/samantha/i, /daniel/i, /karen/i, /serena/i, /google uk english/i, /google us english/i];

let ctx = null;
let keepAlive = null;
let beepEndsAt = 0;
let current = null; // keeps the playing utterance referenced
let pending = null;

function audioContext() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function speechSupported() {
  return 'speechSynthesis' in window;
}

export function voices() {
  return speechSupported() ? speechSynthesis.getVoices() : [];
}

export function onVoicesChanged(fn) {
  if (speechSupported()) speechSynthesis.addEventListener?.('voiceschanged', fn);
}

function rank(v) {
  let score = 0;
  if (/^en[-_]/i.test(v.lang) || v.lang === 'en') score += 100;
  if (/^en[-_](GB|US|AU|IE)/i.test(v.lang)) score += 10;
  if (QUALITY_HINTS.some((r) => r.test(v.name))) score += 40;
  if (PREFERRED_NAMES.some((r) => r.test(v.name))) score += 20;
  if (v.localService) score += 15; // works offline in the sports hall
  if (/compact|eloquence|espeak/i.test(v.name)) score -= 30;
  return score;
}

export function bestVoice(list = voices()) {
  return [...list].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

// English voices first (best first), then the rest.
export function sortedVoices(list = voices()) {
  return [...list].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
}

function resolveVoice(voiceURI) {
  const list = voices();
  return (voiceURI && list.find((v) => v.voiceURI === voiceURI)) || bestVoice(list);
}

// An inaudible, constant signal keeps the output device from going idle.
export function keepOutputAwake(on) {
  try {
    if (on) audioContext(); // also resumes a context the OS suspended
    if (on && !keepAlive) {
      const c = audioContext();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.frequency.value = 30; // below what phone speakers reproduce
      gain.gain.value = 0.0005; // and far too quiet to hear anyway
      osc.connect(gain).connect(c.destination);
      osc.start();
      keepAlive = osc;
    } else if (!on && keepAlive) {
      keepAlive.stop();
      keepAlive = null;
    }
  } catch { /* no Web Audio */ }
}

export function beep(freq, count = 1) {
  try {
    const c = audioContext();
    for (let i = 0; i < count; i++) {
      const t = c.currentTime + 0.01 + i * 0.14;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Short attack and release avoid clicks.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    }
    beepEndsAt = performance.now() + 30 + count * 140;
  } catch { /* no audio available */ }
}

export function say(text, { voiceURI = '', rate = 1 } = {}) {
  if (!speechSupported()) return;
  clearTimeout(pending);
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy) speechSynthesis.cancel();
  // Wait for the beep to finish, and give the engine a moment after a cancel.
  const delay = Math.max(beepEndsAt - performance.now(), busy ? 120 : 0, 0);
  pending = setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = resolveVoice(voiceURI);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'en-GB';
    }
    u.rate = rate;
    u.pitch = 1;
    u.volume = 1;
    u.onend = u.onerror = () => { if (current === u) current = null; };
    current = u;
    speechSynthesis.speak(u);
  }, delay);
}
