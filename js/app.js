import * as M from './match.js';
import { GestureRecognizer, DEFAULT_TIMING } from './gesture.js';
import * as Audio from './audio.js';
import { isInstalled, setupInstallPrompt, installStatus } from './install.js';
import { BreakTimer, INTERVAL_SECONDS, BETWEEN_GAMES_SECONDS, formatClock } from './breaks.js';
import { watchLayout } from './layout.js';
import { createMediaRemote, createRepeatFilter, mediaControlsSupported } from './media.js';

watchLayout();

const STORAGE_KEY = 'badminton-score-v1';
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

const DEFAULT_SETTINGS = {
  names: ['Home', 'Away'],
  points: M.DEFAULT_RULES.points,
  bestOf: M.DEFAULT_RULES.bestOf,
  firstServer: 0,
  voice: true,
  beep: true,
  swapped: false,
  longPressMs: DEFAULT_TIMING.longPressMs,
  doubleClickMs: DEFAULT_TIMING.doubleClickMs,
  sleep: false,
  intervals: false, // official breaks: 60 s at 11, 120 s between games
  autoEnds: true, // swap the scores on screen when the teams change ends
  screenRemote: false, // the whole scoreboard acts as the remote button
  headphones: false, // earbud play/pause, next and previous track act as the remote
  voiceURI: '', // '' = best available English voice
  speechRate: 1,
};

const SLEEP_AFTER_MS = 30000;

const $ = (id) => document.getElementById(id);

// ---------- persistence ----------

function rulesFrom(settings) {
  return { points: settings.points, cap: M.capFor(settings.points), bestOf: settings.bestOf };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.match?.games?.length && saved.rules) {
      return { settings: { ...DEFAULT_SETTINGS, ...saved.settings }, rules: saved.rules, match: saved.match };
    }
  } catch { /* fall through to defaults */ }
  const settings = { ...DEFAULT_SETTINGS };
  return { settings, rules: rulesFrom(settings), match: M.newMatch(settings.firstServer) };
}

let { settings, rules, match } = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, rules, match }));
  } catch { /* storage full or disabled: keep playing */ }
}

// ---------- feedback: sound, speech, toast ----------

function beep(freq, count = 1) {
  if (settings.beep) Audio.beep(freq, count);
}

function say(text) {
  if (settings.voice) Audio.say(text, { voiceURI: settings.voiceURI, rate: settings.speechRate });
}

// Audio may only start after a user gesture; a remote press or tap counts.
function startAudio() {
  Audio.keepOutputAwake(settings.voice);
  mediaRemote.resume(); // headphone controls need a tap or key press before audio may start
}
window.addEventListener('keydown', startAudio);
document.addEventListener('pointerdown', startAudio);

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function flash(team) {
  const el = document.querySelector(`.team[data-team="${team}"]`);
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 180);
}

// Badminton call: server's score first, then "game point" / "match point" when it applies,
// then the receiver's score ("20 match point 0", "29 game point all").
function scoreCall() {
  const g = M.currentGame(match);
  const s = M.gameScore(g);
  const srv = M.server(g);
  const a = s[srv];
  const b = s[1 - srv];
  const point = M.pointCall(match, rules);
  // The commas make the voice pause: "20, match point, 0" instead of one rushed phrase.
  const middle = point ? `, ${point} point, ` : ' ';
  return `${a}${middle}${a === b ? 'all' : b}`;
}

// ---------- actions ----------

function point(team) {
  if (M.isGameOver(match, rules)) {
    toast('Game over: long press to continue');
    beep(220);
    return;
  }
  stopBreak(); // the next rally ends an interval early
  const before = Math.max(...M.gameScore(M.currentGame(match)));
  match = M.addPoint(match, team, rules);
  save();
  render();
  flash(team);

  if (M.isGameOver(match, rules)) {
    const s = M.gameScore(M.currentGame(match));
    const result = `${Math.max(...s)} ${Math.min(...s)}`;
    if (M.matchWinner(match, rules) !== null) {
      say(`Game and match, ${settings.names[team]}. ${result}`);
    } else {
      say(`Game, ${settings.names[team]}. ${result}`);
      if (settings.intervals) startBreak('game', BETWEEN_GAMES_SECONDS);
    }
    return;
  }

  const after = Math.max(...M.gameScore(M.currentGame(match)));
  const mid = Math.ceil(rules.points / 2);
  if (settings.intervals && before < mid && after === mid && rules.points >= 15) {
    const changeEnds = M.isDecidingGame(match, rules);
    $('intervalTitle').textContent = changeEnds ? 'Interval · Change ends' : 'Interval';
    say(`${scoreCall()}. Interval${changeEnds ? '. Change ends' : ''}`);
    startBreak('interval', INTERVAL_SECONDS);
    return;
  }
  if (settings.autoEnds && before < mid && after === mid && M.isDecidingGame(match, rules)) {
    say(`${scoreCall()}. Change ends`);
    return;
  }
  const call = M.pointCall(match, rules);
  if (call) toast(call === 'match' ? 'Match point' : 'Game point');
  say(scoreCall());
}

function undoPoint() {
  const g = M.currentGame(match);
  if (g.rallies.length === 0 && match.games.length === 1) {
    toast('Nothing to undo');
    beep(220);
    return;
  }
  stopBreak();
  match = M.undo(match);
  save();
  render();
  toast('Last point removed');
  say(`Undo. ${scoreCall()}`);
}

function continueAfterGame() {
  if (!M.isGameOver(match, rules)) return;
  stopBreak();
  if (M.matchWinner(match, rules) !== null) {
    startNewMatch();
    return;
  }
  match = M.nextGame(match, rules);
  save();
  render();
  toast(`Game ${match.games.length}`);
  const ends = settings.autoEnds ? 'Change ends. ' : '';
  say(`Game ${match.games.length}. ${ends}${settings.names[M.server(M.currentGame(match))]} to serve`);
}

function startNewMatch() {
  stopBreak();
  rules = rulesFrom(settings);
  match = M.newMatch(settings.firstServer);
  save();
  render();
  toast('New match');
  say('New match');
}

// ---------- intervals and breaks (optional, official timings) ----------

const breaks = new BreakTimer({
  onTick(left, kind) {
    $(kind === 'interval' ? 'intervalClock' : 'breakClock').textContent = formatClock(left);
  },
  onWarning() {
    // Umpires call "20 seconds" twice, 20 seconds before the end of a break.
    wakeScreen();
    Audio.beep(660);
    say('20 seconds. … 20 seconds');
  },
  onEnd(kind) {
    wakeScreen();
    Audio.beep(880, 3); // always, even with click beeps off: this beep is the point of the timer
    if (kind === 'interval') {
      $('interval').hidden = true;
      say(`${scoreCall()}. Play`);
    } else {
      $('breakClock').textContent = 'Time';
      say(`Time. Start game ${match.games.length + 1}`);
    }
  },
});

function startBreak(kind, seconds) {
  if (kind === 'interval') $('interval').hidden = false;
  else $('breakTimer').hidden = false;
  breaks.start(kind, seconds);
}

function endInterval() {
  stopBreak();
  say(`${scoreCall()}. Play`);
}

function stopBreak() {
  breaks.stop();
  $('interval').hidden = true;
  $('breakTimer').hidden = true;
}

// ---------- remote control ----------

// Earbud media commands map onto the remote gestures: play/pause = 1 click, next track = 2 clicks,
// previous track = long press. The earbuds already tell taps apart, so each command acts at once.
// Repeats of one press are dropped (see createRepeatFilter). The last few commands are kept so
// the tester can show what a watch or earbuds actually sent, even after the settings were closed.
const MEDIA_GESTURES = { playpause: 'single', next: 'double', previous: 'long' };
const MEDIA_NAMES = { playpause: 'play/pause', next: 'next track', previous: 'previous track' };
const isMediaRepeat = createRepeatFilter();
const mediaLog = [];

function mediaLogText() {
  return 'headphones / watch: ' + mediaLog.map((m, i) => {
    const gap = i ? ` +${((m.at - mediaLog[i - 1].at) / 1000).toFixed(1)}s` : '';
    return `${MEDIA_NAMES[m.action]}${gap}${m.repeat ? ' (repeat, ignored)' : ''}`;
  }).join(' · ');
}

const mediaRemote = createMediaRemote((action) => {
  const repeat = isMediaRepeat(action);
  mediaLog.push({ action, repeat, at: performance.now() });
  if (mediaLog.length > 6) mediaLog.shift();
  if ($('settings').open) {
    $('keyTester').textContent = mediaLogText();
    return;
  }
  if (repeat) return;
  wakeScreen();
  onGesture(MEDIA_GESTURES[action]);
});

function onGesture(gesture) {
  const over = M.isGameOver(match, rules);
  if (gesture === 'single') { beep(880); point(0); }
  else if (gesture === 'double') { beep(660, 2); point(1); }
  else if (gesture === 'long') {
    beep(440);
    if (over) continueAfterGame();
    else if (breaks.running) endInterval();
    else undoPoint();
  }
}

const timing = () => ({ longPressMs: settings.longPressMs, doubleClickMs: settings.doubleClickMs });
const remote = new GestureRecognizer(onGesture, timing());
// A mouse never auto-repeats, so it needs no release grace; a fast double click must stay a double click.
const mouseRemote = new GestureRecognizer(onGesture, { ...timing(), releaseGraceMs: 0 });

function resetRemotes() {
  remote.reset();
  mouseRemote.reset();
}

function describeKey(e) {
  return `${e.type}: key="${e.key}" code="${e.code}"${e.repeat ? ' (repeat)' : ''}`;
}

function onKey(e) {
  if (MODIFIER_KEYS.has(e.key)) return;
  const dialog = $('settings');
  if (dialog.open) {
    $('keyTester').textContent = describeKey(e);
    return; // let the form work normally
  }
  // Stop Enter/Space from activating buttons and keys from scrolling the page.
  e.preventDefault();
  wakeScreen();
  if (e.type === 'keydown') remote.press();
  else remote.release();
}

window.addEventListener('keydown', onKey);
window.addEventListener('keyup', onKey);

// A mouse can stand in for the remote: the wheel button and the thumb (back/forward) buttons
// act like the remote's single button. The left button keeps working as a normal tap.
const MOUSE_REMOTE_BUTTONS = { 1: 'middle (wheel)', 3: 'back (thumb)', 4: 'forward (thumb)' };

function onMouseButton(e) {
  if (!(e.button in MOUSE_REMOTE_BUTTONS)) return;
  e.preventDefault(); // no autoscroll, no browser back/forward
  if (e.type !== 'pointerdown' && e.type !== 'pointerup') return;
  if ($('settings').open) {
    $('keyTester').textContent = `${e.type === 'pointerdown' ? 'down' : 'up'}: mouse button ${MOUSE_REMOTE_BUTTONS[e.button]}`;
    return;
  }
  wakeScreen();
  startAudio();
  if (e.type === 'pointerdown') mouseRemote.press();
  else mouseRemote.release();
}
for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick']) {
  window.addEventListener(type, onMouseButton, { capture: true });
}
// Losing focus mid-press would otherwise leave the button "held" forever.
window.addEventListener('blur', resetRemotes);

// ---------- rendering ----------

let sidesShown = null;
let endsTimer = null;

// Put each team's score on the side of the screen where the team stands. When the teams change
// ends, the panels slide across (where the browser supports view transitions) and a banner says so.
function showSides(swapped, endsChangedNow) {
  const board = $('board');
  const changed = sidesShown !== null && swapped !== sidesShown;
  sidesShown = swapped;
  if (!changed) {
    board.classList.toggle('swapped', swapped);
    return;
  }
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !calm) document.startViewTransition(() => board.classList.toggle('swapped', swapped));
  else board.classList.toggle('swapped', swapped);
  if (settings.autoEnds && endsChangedNow) {
    $('changeEnds').hidden = false;
    clearTimeout(endsTimer);
    endsTimer = setTimeout(() => { $('changeEnds').hidden = true; }, 3500);
  }
}

// Only a real change of ends gets the banner, not the manual swap button or a settings change.
let lastEnds = null;

function render() {
  wakeScreen();
  const ends = M.endsChanged(match, rules);
  const endsChangedNow = lastEnds !== null && ends !== lastEnds;
  lastEnds = ends;
  const g = M.currentGame(match);
  const score = M.gameScore(g);
  const won = M.gamesWon(match, rules);
  const srv = M.server(g);
  const over = M.isGameOver(match, rules);

  for (const t of [0, 1]) {
    $(`name${t}`).textContent = settings.names[t];
    $(`score${t}`).textContent = score[t];
    $(`games${t}`).innerHTML = '<i></i>'.repeat(won[t]);
    const section = document.querySelector(`.team[data-team="${t}"]`);
    section.classList.toggle('serving', !over && srv === t);
  }

  showSides(settings.swapped !== (settings.autoEnds && ends), endsChangedNow);
  $('gameoverEnds').hidden = !over || !settings.autoEnds || M.matchWinner(match, rules) !== null;
  $('gameLabel').textContent = rules.bestOf > 1 ? `Game ${match.games.length}` : 'Game';
  $('hint').textContent = `1 click: ${settings.names[0]} · 2 clicks: ${settings.names[1]} · hold: undo`;
  // Shown in the phone's Now Playing panel and lock screen while headphone controls are on.
  mediaRemote.show(`${settings.names[0]} ${score[0]} – ${score[1]} ${settings.names[1]}`, rules.bestOf > 1 ? `Game ${match.games.length}` : 'Badminton');

  const overlay = $('gameover');
  overlay.hidden = !over;
  if (over) {
    const winner = M.gameWinner(g, rules);
    const matchWinner = M.matchWinner(match, rules);
    const name = settings.names[winner];
    $('gameoverTitle').textContent = matchWinner !== null ? `${name} wins the match!` : `${name} wins game ${match.games.length}`;
    $('gameoverSub').textContent = match.games
      .map((x) => M.gameScore(x).join('–'))
      .join('   ');
    const action = matchWinner !== null ? 'start a new match' : `start game ${match.games.length + 1}`;
    $('gameoverAction').textContent = action;
    $('nextBtn').textContent = action[0].toUpperCase() + action.slice(1);
  }
}

// ---------- on-screen controls ----------

for (const section of document.querySelectorAll('.team')) {
  section.addEventListener('click', () => {
    if (!settings.screenRemote) point(Number(section.dataset.team));
  });
}

// "Use the screen as remote": a tap anywhere on the scoreboard is a press of the remote button
// (1 tap home, 2 taps away, hold to undo). Handy to try the remote gestures with a finger or a
// mouse: on iPhone a mouse only ever arrives as a plain tap.
let screenPressed = false;
$('board').addEventListener('pointerdown', (e) => {
  if (!settings.screenRemote || e.button !== 0 || !e.target.closest('.team')) return;
  screenPressed = true;
  mouseRemote.press();
});
for (const type of ['pointerup', 'pointercancel']) {
  window.addEventListener(type, () => {
    if (!screenPressed) return;
    screenPressed = false;
    mouseRemote.release();
  });
}

// The tester also shows taps and clicks on it, to see what a mouse really sends on this device.
$('keyTester').addEventListener('pointerdown', (e) => {
  const kind = e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch';
  $('keyTester').textContent = `pointerdown: ${kind}, button ${e.button}`;
});
$('undoBtn').addEventListener('click', undoPoint);
$('nextBtn').addEventListener('click', continueAfterGame);
$('resumeBtn').addEventListener('click', endInterval);
$('swapBtn').addEventListener('click', () => {
  settings.swapped = !settings.swapped;
  save();
  render();
});
// Fullscreen only helps in a browser tab: the installed app already runs fullscreen,
// and iPhone Safari doesn't support it for pages at all.
$('fsBtn').hidden = !document.fullscreenEnabled || isInstalled();
$('fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  $('fsBtn').querySelector('use').setAttribute('href', document.fullscreenElement ? '#i-minimize' : '#i-maximize');
});

// ---------- settings dialog ----------

const form = $('settingsForm');

$('settingsBtn').addEventListener('click', () => {
  resetRemotes();
  form.name0.value = settings.names[0];
  form.name1.value = settings.names[1];
  form.points.value = settings.points;
  form.bestOf.value = settings.bestOf;
  form.firstServer.value = settings.firstServer;
  form.voice.checked = settings.voice;
  form.beep.checked = settings.beep;
  form.longPressMs.value = settings.longPressMs;
  form.doubleClickMs.value = settings.doubleClickMs;
  form.sleep.checked = settings.sleep;
  form.intervals.checked = settings.intervals;
  form.autoEnds.checked = settings.autoEnds;
  form.screenRemote.checked = settings.screenRemote;
  form.headphones.checked = settings.headphones;
  $('headphonesRow').hidden = !mediaControlsSupported();
  fillVoices();
  form.speechRate.value = settings.speechRate;
  $('keyTester').textContent = mediaLog.length ? mediaLogText() : 'No key received yet';
  showAbout();
  $('settings').showModal();
});

// Version and detection details, to help when something doesn't show up on a device.
async function showAbout() {
  const s = installStatus();
  let version = '?';
  try {
    version = (await caches.keys()).find((k) => k.startsWith('badminton-score-'))?.replace('badminton-score-', '') ?? 'not cached';
  } catch { /* caches unavailable */ }
  const where = s.installed ? 'installed app' : 'browser tab';
  const offer = s.installed ? '' : ` · install offer: ${s.oneTap ? 'one-tap' : 'steps'}${s.shown ? ', shown' : ''}${s.dismissed ? ', dismissed this visit' : ''}`;
  $('aboutLine').textContent = `Version ${version} · ${s.platform?.os ?? '?'} / ${s.platform?.browser ?? '?'} · ${where}${offer}`;
}

function readForm() {
  const num = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
  };
  settings = {
    ...settings,
    names: [form.name0.value.trim() || 'Home', form.name1.value.trim() || 'Away'],
    points: Number(form.points.value),
    bestOf: Number(form.bestOf.value),
    firstServer: Number(form.firstServer.value),
    voice: form.voice.checked,
    beep: form.beep.checked,
    longPressMs: num(form.longPressMs.value, 300, 3000, DEFAULT_TIMING.longPressMs),
    doubleClickMs: num(form.doubleClickMs.value, 150, 1000, DEFAULT_TIMING.doubleClickMs),
    sleep: form.sleep.checked,
    intervals: form.intervals.checked,
    autoEnds: form.autoEnds.checked,
    screenRemote: form.screenRemote.checked,
    headphones: form.headphones.checked,
    voiceURI: form.voiceURI.value,
    speechRate: Number(form.speechRate.value) || 1,
  };
  Audio.keepOutputAwake(settings.voice);
  remote.setTiming(timing());
  mouseRemote.setTiming(timing());
  // A match that hasn't started yet can pick up new rules and first server right away.
  if (match.games.length === 1 && match.games[0].rallies.length === 0) {
    rules = rulesFrom(settings);
    match = M.newMatch(settings.firstServer);
  }
  mediaRemote.enable(settings.headphones);
  save();
  render();
}

function fillVoices() {
  const select = form.voiceURI;
  const list = Audio.sortedVoices();
  const best = Audio.bestVoice(list);
  select.replaceChildren(new Option(best ? `Automatic (${best.name})` : 'Automatic', ''));
  for (const v of list) select.add(new Option(`${v.name} – ${v.lang}${v.localService ? '' : ' (online)'}`, v.voiceURI));
  select.value = list.some((v) => v.voiceURI === settings.voiceURI) ? settings.voiceURI : '';
  updateVoiceOptions();
}
Audio.onVoicesChanged(() => { if ($('settings').open) fillVoices(); });

// Voice choice only matters while announcements are on.
function updateVoiceOptions() {
  $('voiceRow').hidden = !Audio.speechSupported() || !form.voice.checked;
}
form.voice.addEventListener('change', updateVoiceOptions);
// Start or stop right on the switch: starting audio is only allowed during a tap.
form.headphones.addEventListener('change', () => mediaRemote.enable(form.headphones.checked));

$('testVoice').addEventListener('click', () => {
  Audio.keepOutputAwake(true);
  Audio.say('11 9. Interval', { voiceURI: form.voiceURI.value, rate: Number(form.speechRate.value) || 1 });
});

$('settings').addEventListener('close', () => {
  readForm();
  resetRemotes();
});

$('resetBtn').addEventListener('click', () => {
  if (!confirm('Start a new match? The current score will be lost.')) return;
  readForm();
  startNewMatch();
  $('settings').close();
});

// ---------- screen sleep ----------
// Browsers can't switch the display off and back on, and a locked phone stops passing remote
// key presses to the page. So the screen stays on (wake lock below) and "sleep" is a black
// cover instead: on OLED screens black pixels are off, which looks and saves like real sleep.

let sleepTimer = null;
let swallowClick = false;

function wakeScreen() {
  $('sleep').hidden = true;
  clearTimeout(sleepTimer);
  if (settings.sleep) sleepTimer = setTimeout(sleepScreen, SLEEP_AFTER_MS);
}

function sleepScreen() {
  // Never black out while editing settings or while a break is counting down.
  if ($('settings').open || breaks.running) wakeScreen();
  else $('sleep').hidden = false;
}

// A tap only wakes the screen; it must not also score or press a button underneath.
document.addEventListener('pointerdown', (e) => {
  swallowClick = !$('sleep').hidden;
  if (swallowClick) e.preventDefault();
  wakeScreen();
}, true);
document.addEventListener('click', (e) => {
  if (!swallowClick) return;
  swallowClick = false;
  e.stopPropagation();
}, true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeScreen(); });

// ---------- keep the screen on ----------

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* not allowed right now; retried on next interaction */ }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerdown', keepAwake);
window.addEventListener('keydown', keepAwake);
keepAwake();

// ---------- offline support ----------

if ('serviceWorker' in navigator) {
  // When a newer version takes over from an older one, reload once so the new version shows
  // right away instead of on the next visit. The match is saved, so nothing is lost.
  const updating = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Headphone controls come back after a reload; audio starts on the first tap or key press.
mediaRemote.enable(settings.headphones);

// ---------- install prompt (browser tabs only) ----------

setupInstallPrompt($('installSheet'), $('installFromSettings'));
// The settings entry opens the install sheet, so close settings first.
$('installFromSettings').addEventListener('click', () => $('settings').close(), true);

render();
