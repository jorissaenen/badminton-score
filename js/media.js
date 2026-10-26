// Headphone controls: earbud taps (play/pause, next track, previous track) as the remote.
//
// Phones keep the volume keys to themselves (iOS never passes them to a web page), but they do
// pass media commands from Bluetooth earbuds to whatever is "Now Playing". So, when enabled, the
// app plays an inaudible audio loop to become the Now Playing item, and listens through the
// Media Session API. The Now Playing panel (and lock screen) then also shows the score.

function silentLoopUrl(seconds = 2, rate = 8000) {
  // A tiny 16-bit mono WAV whose samples are ±1: far below hearing, but not "digital silence",
  // which some systems skip when choosing what's Now Playing.
  const samples = seconds * rate;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const text = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function mediaControlsSupported() {
  return 'mediaSession' in navigator;
}

// onAction receives 'playpause', 'next' or 'previous'.
export function createMediaRemote(onAction) {
  const session = navigator.mediaSession;
  let audio = null;
  let enabled = false;

  function keepPlaying() {
    audio?.play().catch(() => {});
    session.playbackState = 'playing';
  }

  // iOS ignores handlers registered before the audio became Now Playing, so (re)register them
  // every time playback starts. Seek handlers are cleared so earbuds send next/previous track.
  function registerHandlers() {
    if (!enabled) return;
    const handlers = {
      play: () => { keepPlaying(); onAction('playpause'); },
      pause: () => { keepPlaying(); onAction('playpause'); },
      nexttrack: () => onAction('next'),
      previoustrack: () => onAction('previous'),
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
        audio?.pause();
        clearHandlers();
        session.metadata = null;
        session.playbackState = 'none';
      }
    },
    resume() {
      if (enabled && audio?.paused) keepPlaying();
    },
    show(title, artist) {
      if (!enabled || typeof MediaMetadata === 'undefined') return;
      session.metadata = new MediaMetadata({
        title,
        artist,
        album: 'Badminton Score',
        artwork: [{ src: 'icons/shuttle-512.png', sizes: '512x512', type: 'image/png' }],
      });
    },
  };
}
