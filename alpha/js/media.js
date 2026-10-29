// Headphone controls: earbud taps (play/pause, next track, previous track) as the remote.
//
// Phones keep the volume keys to themselves (iOS never passes them to a web page), but they do
// pass media commands from Bluetooth earbuds to whatever is "Now Playing". So, when enabled, the
// app plays an inaudible audio loop to become the Now Playing item, and listens through the
// Media Session API. The Now Playing panel (and lock screen) then also shows the score.

// Long on purpose: iOS can report a play/pause each time a loop starts over (a 2-second loop
// produced one every ~1.9 s, each scoring a point), so restarts should be rare.
export const LOOP_SECONDS = 180;

function silentLoopUrl(seconds = LOOP_SECONDS, rate = 8000) {
  // 16-bit mono WAV whose samples are ±1 out of ±32767 (about -90 dB): inaudible, but not
  // "digital silence", which some systems skip when choosing what's Now Playing. It must stay
  // 16-bit: in 8-bit the same ±1 is only -42 dB, and alternating it is an audible 4 kHz whine.
  // 3 minutes is about 2.9 MB.
  const samples = seconds * rate;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const text = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, samples * 2, true);
  const data = new Int16Array(buf, 44);
  for (let i = 0; i < samples; i++) data[i] = i % 2 ? 1 : -1;
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// While the voice is speaking, iOS pauses the silent loop; restarting the loop then cuts the
// speech off. So the loop waits until the voice is done.
function speaking() {
  const s = globalThis.speechSynthesis;
  return Boolean(s && (s.speaking || s.pending));
}

// Decide whether a play/pause command is a real press. Returns null for a real press, or the
// reason to ignore it. The app keeps the loop playing at all times, so a real press on earbuds
// or a watch always arrives as 'pause'; a 'play' means the system restarted the sound itself.
export function playPauseIgnoreReason({ raw, position, duration, now, quietUntil, speaking = false }) {
  if (raw === 'play') return 'system play';
  if (speaking || now < quietUntil) return 'own sound';
  if (position < 1 || (Number.isFinite(duration) && duration - position < 1)) return 'loop restart';
  return null;
}

export function mediaControlsSupported() {
  return 'mediaSession' in navigator;
}

// Some controllers deliver one press as a stream of identical commands (seen with a Garmin
// watch's music controls). No one scores twice for the same team within a second or so, so
// the same command arriving again less than REPEAT_GAP_MS after the previous copy is a repeat.
// The gap is measured from the latest copy, so a long burst still counts as one press.
export const REPEAT_GAP_MS = 1500;

export function createRepeatFilter(gapMs = REPEAT_GAP_MS, now = () => performance.now()) {
  let last = null;
  let lastAt = -Infinity;
  return (action) => {
    const t = now();
    const repeat = action === last && t - lastAt < gapMs;
    last = action;
    lastAt = t;
    return repeat;
  };
}

// onAction receives 'playpause', 'next' or 'previous', plus { raw, ignored }: the browser's own
// action name and, for commands that are not real presses, why they were ignored.
export function createMediaRemote(onAction) {
  const session = navigator.mediaSession;
  let audio = null;
  let enabled = false;
  // Until this time, media commands are ignored: the app itself just started speech or a beep,
  // or the screen was tapped, and iOS may pause the silent loop because of that. Such a pause is
  // not an earbud press, so it must not score a point.
  let quietUntil = 0;

  let resumeTimer = null;

  function keepPlaying() {
    clearTimeout(resumeTimer);
    if (!enabled || document.visibilityState === 'hidden') return; // never play in the background
    if (speaking()) {
      resumeTimer = setTimeout(keepPlaying, 300); // don't cut off the score call
      return;
    }
    audio?.play().catch(() => {});
    session.playbackState = 'playing';
  }

  // In the background the app isn't in use: no command may score, beep or restart audio.
  const background = () => document.visibilityState === 'hidden';

  function command(raw) {
    const ignored = background() ? 'background' : playPauseIgnoreReason({
      raw,
      position: audio?.currentTime ?? 0,
      duration: audio?.duration ?? NaN,
      now: Date.now(),
      quietUntil,
      speaking: speaking(),
    });
    // Restart the loop only if the system really stopped it; calling play() on every command
    // could itself make the system report more play/pause commands.
    if (audio?.paused) keepPlaying();
    else session.playbackState = 'playing';
    onAction('playpause', { raw, ignored });
  }

  // iOS ignores handlers registered before the audio became Now Playing, so (re)register them
  // every time playback starts. Seek handlers are cleared so earbuds send next/previous track.
  function registerHandlers() {
    if (!enabled) return;
    const handlers = {
      play: () => command('play'),
      pause: () => command('pause'),
      nexttrack: () => onAction('next', { raw: 'nexttrack', ignored: background() ? 'background' : null }),
      previoustrack: () => onAction('previous', { raw: 'previoustrack', ignored: background() ? 'background' : null }),
      seekforward: null,
      seekbackward: null,
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try { session.setActionHandler(action, fn); } catch { /* action not supported here */ }
    }
    session.playbackState = 'playing';
  }

  function clearHandlers() {
    for (const action of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekforward', 'seekbackward']) {
      try { session.setActionHandler(action, null); } catch { /* ignore */ }
    }
  }

  return {
    // Turning on needs a user gesture (a tap or key press) before audio may start;
    // call resume() from such a gesture if the first attempt was blocked.
    enable(on) {
      if (!mediaControlsSupported()) return;
      enabled = on;
      if (on) {
        if (!audio) {
          audio = new Audio(silentLoopUrl());
          audio.loop = true; // never "ends", so iOS keeps the audio session open
          audio.setAttribute('playsinline', '');
          audio.addEventListener('playing', registerHandlers);
        }
        keepPlaying();
      } else {
        clearTimeout(resumeTimer);
        audio?.pause();
        clearHandlers();
        session.metadata = null;
        session.playbackState = 'none';
      }
    },
    resume() {
      if (enabled && audio?.paused) keepPlaying();
    },
    // In the background: stop the silent loop and leave Now Playing, so music apps and other apps'
    // microphones aren't blocked. The handlers stay; resume() restarts on the next tap or press.
    suspend() {
      clearTimeout(resumeTimer);
      audio?.pause();
      session.playbackState = 'none';
      session.metadata = null;
    },
    // Ignore media commands for a short while, e.g. around a beep, speech or screen tap.
    quiet(ms = 1500) {
      quietUntil = Math.max(quietUntil, Date.now() + ms);
    },
    show(title, artist) {
      if (!enabled || typeof MediaMetadata === 'undefined') return;
      session.metadata = new MediaMetadata({
        title,
        artist,
        album: 'Skoor α',
        artwork: [{ src: 'icons/skoor-512.png', sizes: '512x512', type: 'image/png' }],
      });
    },
  };
}
