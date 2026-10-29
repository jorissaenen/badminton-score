// The match screen: flip-tile scores, the remote (camera remote, keyboard, mouse buttons, earbuds),
// score calls, intervals, screen sleep and keeping the screen on.
import * as M from './match.js';
import { GestureRecognizer } from './gesture.js';
import * as Audio from './audio.js';
import { BreakTimer, INTERVAL_SECONDS, BETWEEN_GAMES_SECONDS, formatClock } from './breaks.js';
import { createMediaRemote, createRepeatFilter } from './media.js';
import { state, save, rulesFrom, displayNames } from './state.js';
import { $, toast } from './ui.js';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);
const SLEEP_AFTER_MS = 30000;

let shown = false;
let gestureHandler = null; // the New match screen takes over the remote while it's open
let onMatchEnd = () => {};
let onMenu = () => {};

const settings = () => state.settings;
const names = () => displayNames();

// ---------- feedback ----------

function beep(freq, count = 1) {
  mediaRemote.quiet(); // a beep can interrupt the audio session on iOS
  if (settings().beep) Audio.beep(freq, count);
}

export function say(text) {
  mediaRemote.quiet();
  if (settings().voice) Audio.say(text, { voiceURI: settings().voiceURI, rate: settings().speechRate });
}

// Audio may only start after a user gesture; a remote press or tap counts.
function startAudio() {
  Audio.keepOutputAwake(settings().voice);
  mediaRemote.quiet();
  mediaRemote.resume();
}
window.addEventListener('keydown', startAudio);
document.addEventListener('pointerdown', startAudio);

function flash(team) {
  const el = document.querySelector(`.team[data-team="${team}"]`);
  el?.classList.add('flash');
  setTimeout(() => el?.classList.remove('flash'), 220);
}

// Badminton call: server's score first, then "game point" / "match point" when it applies, then
// the receiver's score ("20, match point, 0", "29, game point, all").
function scoreCall() {
  const g = M.currentGame(state.match);
  const sc = M.gameScore(g);
  const srv = M.server(g);
  const a = sc[srv];
  const b = sc[1 - srv];
  const call = M.pointCall(state.match, state.rules);
  const middle = call ? `, ${call} point, ` : ' ';
  return `${a}${middle}${a === b ? 'all' : b}`;
}

// ---------- actions ----------

export function point(team) {
  const { match, rules } = state;
  if (M.isGameOver(match, rules)) {
    toast('Game over: long press to continue');
    beep(220);
    return;
  }
  stopBreak();
  const before = Math.max(...M.gameScore(M.currentGame(match)));
  state.match = M.addPoint(match, team, rules);
  save();
  render();
  flash(team);

  if (M.isGameOver(state.match, rules)) {
    const sc = M.gameScore(M.currentGame(state.match));
    const result = `${Math.max(...sc)} ${Math.min(...sc)}`;
    if (M.matchWinner(state.match, rules) !== null) {
      say(`Game and match, ${names()[team]}. ${result}`);
    } else {
      say(`Game, ${names()[team]}. ${result}`);
      if (settings().intervals) startBreak('game', BETWEEN_GAMES_SECONDS);
    }
    return;
  }

  const after = Math.max(...M.gameScore(M.currentGame(state.match)));
  const mid = Math.ceil(rules.points / 2);
  if (settings().intervals && before < mid && after === mid && rules.points >= 15) {
    const changeEnds = M.isDecidingGame(state.match, rules);
    $('intervalTitle').textContent = changeEnds ? 'Interval · change ends' : 'Interval';
    say(`${scoreCall()}. Interval${changeEnds ? '. Change ends' : ''}`);
    startBreak('interval', INTERVAL_SECONDS);
    return;
  }
  if (settings().autoEnds && before < mid && after === mid && M.isDecidingGame(state.match, rules)) {
    say(`${scoreCall()}. Change ends`);
    return;
  }
  const call = M.pointCall(state.match, rules);
  if (call) toast(call === 'match' ? 'Match point' : 'Game point');
  say(scoreCall());
}

export function undoPoint() {
  const g = M.currentGame(state.match);
  if (g.rallies.length === 0 && state.match.games.length === 1) {
    toast('Nothing to undo');
    beep(220);
    return;
  }
  stopBreak();
  state.match = M.undo(state.match);
  save();
  render();
  toast('Last point removed');
  say(`Undo. ${scoreCall()}`);
}

function continueAfterGame() {
  const { match, rules } = state;
  if (!M.isGameOver(match, rules)) return;
  stopBreak();
  if (M.matchWinner(match, rules) !== null) {
    onMatchEnd();
    return;
  }
  state.match = M.nextGame(match, rules);
  save();
  render();
  toast(`Game ${state.match.games.length}`);
  const ends = settings().autoEnds ? 'Change ends. ' : '';
  say(`Game ${state.match.games.length}. ${ends}${names()[M.server(M.currentGame(state.match))]} to serve`);
}

// Starts a new match with the names, sides and first server chosen on the New match screen.
export function startMatch({ names: n, namesKnown, firstServer, swapped, points, bestOf }) {
  stopBreak();
  state.settings = { ...state.settings, names: n, namesKnown, firstServer, swapped, points, bestOf };
  state.rules = rulesFrom(state.settings);
  state.match = M.newMatch(firstServer);
  save();
  render();
  say(`New match. ${displayNames()[firstServer]} to serve`);
}

// ---------- intervals and breaks ----------

const breaks = new BreakTimer({
  onTick(left, kind) {
    $(kind === 'interval' ? 'intervalClock' : 'breakClock').textContent = formatClock(left);
  },
  onWarning() {
    wakeScreen();
    Audio.beep(660);
    say('20 seconds. … 20 seconds');
  },
  onEnd(kind) {
    wakeScreen();
    Audio.beep(880, 3);
    if (kind === 'interval') {
      $('interval').hidden = true;
      say(`${scoreCall()}. Play`);
    } else {
      $('breakClock').textContent = 'Time';
      say(`Time. Start game ${state.match.games.length + 1}`);
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

// ---------- the remote ----------

const MEDIA_GESTURES = { playpause: 'single', next: 'double', previous: 'long' };
const MEDIA_NAMES = { playpause: 'play/pause', next: 'next track', previous: 'previous track' };
const isMediaRepeat = createRepeatFilter();
const pressLog = []; // what the remote, keyboard or earbuds sent, for the tester in You
const testers = new Set();
export const onTest = (cb) => { testers.add(cb); return () => testers.delete(cb); };
let testing = false; // the tester is open: show presses, don't score
export const setTesting = (on) => { testing = on; };

function logPress(text) {
  pressLog.push(text);
  if (pressLog.length > 6) pressLog.shift();
  testers.forEach((cb) => cb(text, pressLog));
}

const mediaRemote = createMediaRemote((action, { raw, ignored } = {}) => {
  const why = ignored ?? (isMediaRepeat(action) ? 'repeat' : null);
  const name = raw === 'play' || raw === 'pause' ? raw : MEDIA_NAMES[action];
  logPress(`headphones: ${name}${why ? ` (${why}, ignored)` : ''}`);
  if (why || testing) return;
  wakeScreen();
  onGesture(MEDIA_GESTURES[action]);
});
export const media = mediaRemote;

function onGesture(gesture) {
  if (gestureHandler) {
    beep(gesture === 'double' ? 660 : gesture === 'long' ? 440 : 880, gesture === 'double' ? 2 : 1);
    gestureHandler(gesture);
    return;
  }
  if (!shown) return;
  const over = M.isGameOver(state.match, state.rules);
  if (gesture === 'single') { beep(880); point(0); }
  else if (gesture === 'double') { beep(660, 2); point(1); }
  else if (gesture === 'long') {
    beep(440);
    if (over) continueAfterGame();
    else if (breaks.running) endInterval();
    else undoPoint();
  }
}

const timing = () => ({ longPressMs: settings().longPressMs, doubleClickMs: settings().doubleClickMs });
const remote = new GestureRecognizer(onGesture, timing());
const mouseRemote = new GestureRecognizer(onGesture, { ...timing(), releaseGraceMs: 0 });

export function applyTiming() {
  remote.setTiming(timing());
  mouseRemote.setTiming(timing());
}

export function resetRemotes() {
  remote.reset();
  mouseRemote.reset();
}

// Keys only act as the remote on the match and New match screens, and never while typing.
const remoteActive = () => (shown || gestureHandler) && !document.querySelector('.sheet-host');

function onKey(e) {
  if (MODIFIER_KEYS.has(e.key)) return;
  if (testing) {
    logPress(`${e.type}: key="${e.key}"${e.repeat ? ' (repeat)' : ''}`);
    return;
  }
  if (!remoteActive() || e.target.closest?.('input, select, textarea')) return;
  e.preventDefault(); // no button presses or scrolling
  wakeScreen();
  if (e.type === 'keydown') remote.press();
  else remote.release();
}
window.addEventListener('keydown', onKey);
window.addEventListener('keyup', onKey);

// The wheel button and the thumb buttons of a mouse act like the remote's button.
const MOUSE_REMOTE_BUTTONS = { 1: 'middle (wheel)', 3: 'back (thumb)', 4: 'forward (thumb)' };
function onMouseButton(e) {
  if (!(e.button in MOUSE_REMOTE_BUTTONS)) return;
  e.preventDefault();
  if (e.type !== 'pointerdown' && e.type !== 'pointerup') return;
  if (testing) {
    logPress(`${e.type === 'pointerdown' ? 'down' : 'up'}: mouse button ${MOUSE_REMOTE_BUTTONS[e.button]}`);
    return;
  }
  if (!remoteActive()) return;
  wakeScreen();
  startAudio();
  if (e.type === 'pointerdown') mouseRemote.press();
  else mouseRemote.release();
}
for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick']) {
  window.addEventListener(type, onMouseButton, { capture: true });
}
window.addEventListener('blur', resetRemotes);

// ---------- drawing ----------

const pad2 = (n) => String(n).padStart(2, '0');
const tile = (digit, on) => `<span class="tile${on ? ' on' : ''}"><span class="cap">${digit}</span><span class="split"></span></span>`;

let sidesShown = null;
let endsTimer = null;
let lastEnds = null;

// Each team's score sits on the side of the screen where the team stands. When the teams change
// ends, the sides swap (sliding where the browser supports view transitions) and a banner says so.
function showSides(swapped, endsChangedNow) {
  const board = $('board');
  const changed = sidesShown !== null && swapped !== sidesShown;
  sidesShown = swapped;
  if (!changed) { board.classList.toggle('swapped', swapped); return; }
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !calm && shown) document.startViewTransition(() => board.classList.toggle('swapped', swapped));
  else board.classList.toggle('swapped', swapped);
  if (settings().autoEnds && endsChangedNow) {
    $('changeEnds').hidden = false;
    clearTimeout(endsTimer);
    endsTimer = setTimeout(() => { $('changeEnds').hidden = true; }, 3500);
  }
}

export function render() {
  const { match, rules } = state;
  const ends = M.endsChanged(match, rules);
  const endsChangedNow = lastEnds !== null && ends !== lastEnds;
  lastEnds = ends;
  const g = M.currentGame(match);
  const score = M.gameScore(g);
  const won = M.gamesWon(match, rules);
  const srv = M.server(g);
  const over = M.isGameOver(match, rules);
  const need = Math.ceil(rules.bestOf / 2);

  for (const t of [0, 1]) {
    $(`name${t}`).textContent = names()[t];
    const serving = !over && srv === t;
    $(`tiles${t}`).innerHTML = [...pad2(score[t])].map((d) => tile(d, serving)).join('');
    $(`games${t}`).innerHTML = rules.bestOf > 1 ? Array.from({ length: need }, (_, i) => `<i${i < won[t] ? ' class="won"' : ''}></i>`).join('') : '';
    const section = document.querySelector(`.team[data-team="${t}"]`);
    section.classList.toggle('serving', serving);
    section.setAttribute('aria-label', `${names()[t]}: ${score[t]}${serving ? ', serving' : ''}, ${won[t]} game${won[t] === 1 ? '' : 's'} won`);
  }

  showSides(settings().swapped !== (settings().autoEnds && ends), endsChangedNow);
  const gameNo = match.games.length;
  $('boardTitle').textContent = rules.bestOf > 1 ? `GAME ${gameNo}` : 'GAME';
  $('boardSub').textContent = match.games.slice(0, -1).map((x, i) => `Game ${i + 1}: ${M.gameScore(x).join('–')}`).join(' · ');
  $('gameoverEnds').hidden = !over || !settings().autoEnds || M.matchWinner(match, rules) !== null;
  mediaRemote.show(`${names()[0]} ${score[0]} – ${score[1]} ${names()[1]}`, rules.bestOf > 1 ? `Game ${gameNo}` : 'Skoor');

  $('gameover').hidden = !over;
  if (over) {
    const winner = M.gameWinner(g, rules);
    const matchWinner = M.matchWinner(match, rules);
    $('gameoverTitle').textContent = matchWinner !== null ? `${names()[winner]} wins the match` : `${names()[winner]} wins game ${gameNo}`;
    $('gameoverSub').textContent = match.games.map((x) => M.gameScore(x).join('–')).join('   ');
    const action = matchWinner !== null ? 'finish the match' : `start game ${gameNo + 1}`;
    $('gameoverAction').textContent = action;
    $('nextBtn').textContent = action[0].toUpperCase() + action.slice(1);
  }
  fitTiles();
}

// The tiles take the space they have, with room around them, on any screen from a phone to a TV.
// Names, dots and SERVES scale with the tiles (see skoor.css), so one side is about 1.5 tiles tall
// and 1.46 tiles wide. --u scales the top bar and buttons with the screen.
const ROOM = 0.8; // share of a side the score may fill; the rest is breathing space

// The height of one side's content for tiles of height h (mirrors the sizes in skoor.css).
const sideHeight = (h) => h + Math.max(20, 0.15 * h) + Math.max(8, 0.045 * h) + Math.max(16, 0.1 * h) + 3 * Math.max(10, 0.075 * h);

function fitTiles() {
  const board = $('board');
  if (board.hidden) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const u = Math.min(2.6, Math.max(1, Math.min(w, h) / 430));
  const landscape = document.documentElement.classList.contains('landscape');
  const top = (44 + 12) * u; // the bar with the buttons
  const sideW = landscape ? (w - 48 * u) / 2 : w;
  const sideH = landscape ? h - top : (h - top) / 2;
  let lo = 40;
  let hi = 2000;
  while (hi - lo > 1) { // the largest tiles that fit, with room around them
    const mid = (lo + hi) / 2;
    if (sideHeight(mid) <= sideH * ROOM && 1.46 * mid <= sideW * ROOM) lo = mid;
    else hi = mid;
  }
  board.style.setProperty('--tile-h', `${Math.floor(lo)}px`);
  board.style.setProperty('--u', u.toFixed(3));
}
// Once more after the layout has settled: js/layout.js switches portrait/landscape a moment later.
window.addEventListener('resize', () => {
  requestAnimationFrame(fitTiles);
  setTimeout(fitTiles, 300);
});
new MutationObserver(fitTiles).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

// ---------- on-screen controls ----------

function wire() {
  for (const section of document.querySelectorAll('.team')) {
    section.addEventListener('click', () => {
      if (!settings().screenRemote) point(Number(section.dataset.team));
    });
  }
  // "Use the screen as remote": a tap on the scores is a press of the remote button.
  let screenPressed = false;
  $('board').addEventListener('pointerdown', (e) => {
    if (!settings().screenRemote || e.button !== 0 || !e.target.closest('.team')) return;
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
  $('undoBtn').addEventListener('click', undoPoint);
  $('nextBtn').addEventListener('click', continueAfterGame);
  $('resumeBtn').addEventListener('click', endInterval);
  $('swapBtn').addEventListener('click', () => {
    state.settings.swapped = !state.settings.swapped;
    save();
    render();
  });
  $('menuBtn').addEventListener('click', () => { resetRemotes(); onMenu(); });
}

// ---------- screen sleep and keeping the screen on ----------
// Browsers can't switch the display off, and a locked phone stops passing remote presses to the
// page. So the screen stays on and "sleep" is a black cover: on OLED screens black pixels are off.

let sleepTimer = null;
let swallowClick = false;

export function wakeScreen() {
  $('sleep').hidden = true;
  clearTimeout(sleepTimer);
  if (settings().sleep && shown) sleepTimer = setTimeout(sleepScreen, SLEEP_AFTER_MS);
}

function sleepScreen() {
  if (!shown || breaks.running || document.querySelector('.sheet-host')) wakeScreen();
  else $('sleep').hidden = false;
}

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

// Leaving the app releases all audio, so other apps aren't blocked by the app's silent sounds.
function releaseAudio() {
  mediaRemote.suspend();
  Audio.release();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') releaseAudio();
  else { wakeScreen(); render(); }
});
window.addEventListener('pagehide', releaseAudio);

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* not allowed right now; retried on the next interaction */ }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerdown', keepAwake);
window.addEventListener('keydown', keepAwake);

// ---------- showing and hiding ----------

export function init({ onEnd, onMenuOpen }) {
  onMatchEnd = onEnd;
  onMenu = onMenuOpen;
  wire();
  mediaRemote.enable(settings().headphones);
  keepAwake();
  render();
}

export function show() {
  shown = true;
  $('board').hidden = false;
  resetRemotes();
  render();
  wakeScreen();
}

export function hide() {
  shown = false;
  $('board').hidden = true;
  $('sleep').hidden = true;
  stopBreak();
  resetRemotes();
}

export const isShown = () => shown;
export const setGestureHandler = (fn) => { gestureHandler = fn; resetRemotes(); };
export const lastPresses = () => pressLog.slice();
export const pressLabel = { MEDIA_NAMES };
