// The match screen: flip-tile scores, the remote (camera remote, keyboard, mouse buttons, earbuds),
// score calls, intervals, screen sleep and keeping the screen on.
import * as M from './match.js';
import { GestureRecognizer } from './gesture.js';
import * as Audio from './audio.js';
import { BreakTimer, BETWEEN_GAMES_SECONDS, formatClock } from './breaks.js';
import { createMediaRemote, createRepeatFilter } from './media.js';
import { state, save, rulesFrom, displayNames } from './state.js';
import { $, toast } from './ui.js';
import { t, people } from './i18n.js';
import { screenHeight } from './layout.js';
import { sportOf } from './sports.js';
import * as Club from './club.js';
import { scoreCall as callFor, results as resultsFor, notice } from './calls.js';
import * as Shared from './clubmatch.js';

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
// On iOS only these count as a user action that may start sound; the first touch doesn't. Any
// tap anywhere in the app (Play, New match, a button) gets the sound ready for the match.
for (const type of ['touchend', 'click', 'keydown']) {
  document.addEventListener(type, () => { Audio.unlock(); startAudio(); }, { capture: true, passive: true });
}

function flash(team) {
  const el = document.querySelector(`.team[data-team="${team}"]`);
  el?.classList.add('flash');
  setTimeout(() => el?.classList.remove('flash'), 220);
}

const sport = () => sportOf(state.rules.sport);
const tennis = () => sport().scoring === 'tennis';
// What one game is called: a game, or in tennis and padel a set.
const unit = () => (tennis() ? 'set' : 'game');
const serverNow = (match = state.match) => M.server(M.currentGame(match), state.rules, match);

// The call after a point (see calls.js).
const scoreCall = () => callFor(state.match, state.rules, names());

const results = (match) => resultsFor(match, state.rules);

// ---------- actions ----------

// A changed score. A quick match changes here at once; a club match first goes to the server,
// which may refuse it (someone else was first, the score is frozen, no connection): then the
// score stays as it was, and you hear and feel why. Resolves with whether it counted.
async function commit(action, next, changes = {}) {
  if (!state.link) {
    state.match = next;
    save();
    return true;
  }
  try {
    await Shared.commit(action, next, changes);
    return true;
  } catch (e) {
    refusedFeedback(e);
    return false;
  }
}

// A press that didn't count: an orange card in the middle (NOT COUNTED and why, with the score
// that stands), a low double beep, a buzz and the spoken "Not counted".
let refusedTimer = null;
// The score as text: "14–11" (tiles without their leading zero), "40–AD" in tennis.
const scoreText = () => M.display(state.match, state.rules).tiles.map((x) => x.replace(/^0(\d)$/, '$1')).join('–');
function refusedFeedback(e) {
  if (e.code === 'skoor/busy') { beep(220); return; }
  if (e.code === 'skoor/gone') { toast(t('board.refusedGone')); return; }
  render(); // the score that stands (taken over from the server meanwhile)
  const score = scoreText();
  const text = {
    'skoor/stale': e.by ? t('board.refusedFirst', { name: e.by, score }) : t('board.refusedChanged', { score }),
    // Frozen by someone else's point a moment ago: say who was first.
    'skoor/frozen': e.by ? t('board.refusedJustBefore', { name: e.by, score }) : t('board.refusedFrozen', { s: Club.FREEZE_SECONDS }),
    'skoor/offline': t('board.refusedOffline'),
    'skoor/notlive': t('board.refusedNotLive'),
  }[e.code] ?? t('board.refusedOther', { error: e.code || e.message });
  beep(180, 2);
  navigator.vibrate?.([90, 70, 90]);
  say(t('call.notCounted'));
  $('refusedText').textContent = text;
  $('refused').hidden = false;
  $('refused').classList.remove('pop');
  void $('refused').offsetWidth;
  $('refused').classList.add('pop');
  clearTimeout(refusedTimer);
  refusedTimer = setTimeout(() => { $('refused').hidden = true; }, 2600);
}

// What a club match records with a new score: finished (and who won) after its last point.
function outcome(next) {
  const winner = M.isGameOver(next, state.rules) ? M.matchWinner(next, state.rules) : null;
  return winner !== null ? { status: 'finished', winner } : { status: 'live', winner: null };
}

export async function point(team) {
  const { match, rules } = state;
  if (M.isGameOver(match, rules)) {
    toast(t('board.gameOverToast'));
    beep(220);
    return;
  }
  const endsBefore = M.endsChanged(match, rules);
  const gamesBefore = tennis() ? M.display(match, rules).games : null;
  const before = Math.max(...M.gameScore(M.currentGame(match), rules));
  const next = M.addPoint(match, team, rules);
  flash(team);
  if (!(await commit(`point${team}`, next, outcome(next)))) return;
  stopBreak();
  render();
  const endsNow = settings().autoEnds && M.endsChanged(state.match, rules) !== endsBefore;

  if (M.isGameOver(state.match, rules)) {
    const result = tennis() ? results(state.match) : `${Math.max(...M.gameScore(M.currentGame(state.match), rules))} ${Math.min(...M.gameScore(M.currentGame(state.match), rules))}`;
    const name = names()[team];
    if (M.matchWinner(state.match, rules) !== null) {
      say(t(tennis() ? 'call.setAndMatch' : 'call.gameAndMatch', { name, result }));
    } else {
      say(t(tennis() ? 'call.set' : 'call.game', { name, result: tennis() ? M.gameScore(M.currentGame(state.match), rules).join(' ') : result }));
      if (settings().intervals) startBreak('game', sport().breaks?.between ?? BETWEEN_GAMES_SECONDS);
    }
    return;
  }

  // Tennis: a game won within the set.
  if (tennis()) {
    const games = M.display(state.match, rules).games;
    if (games[team] !== gamesBefore[team]) {
      const text = t('call.tennisGame', { name: names()[team], a: games[team], b: games[1 - team] });
      say(endsNow ? `${text}. ${t('call.changeEndsShort')}` : text);
      return;
    }
  }

  // Badminton's interval when the leader reaches 11.
  const after = Math.max(...M.gameScore(M.currentGame(state.match), rules));
  const mid = M.midpoint(state.match, rules);
  if (settings().intervals && sport().breaks?.interval && mid && before < mid && after === mid && (M.currentGame(state.match).points ?? rules.points) >= 15) {
    const changeEnds = M.isDecidingGame(state.match, rules);
    $('intervalTitle').textContent = changeEnds ? t('board.intervalChangeEnds') : t('board.interval');
    say(t(changeEnds ? 'call.intervalChangeEnds' : 'call.interval', { score: scoreCall() }));
    startBreak('interval', sport().breaks.interval);
    return;
  }
  if (endsNow) {
    say(t('call.changeEnds', { score: scoreCall() }));
    return;
  }
  const call = M.pointCall(state.match, rules);
  if (call) toast(t(`board.${call}Point`));
  say(scoreCall());
}

export async function undoPoint() {
  const g = M.currentGame(state.match);
  if (g.rallies.length === 0 && state.match.games.length === 1) {
    toast(t('board.nothingToUndo'));
    beep(220);
    return;
  }
  const next = M.undo(state.match);
  if (!(await commit('undo', next, outcome(next)))) return;
  stopBreak();
  render();
  toast(t('board.undone'));
  say(t('call.undo', { score: scoreCall() }));
}

async function continueAfterGame() {
  const { match, rules } = state;
  if (!M.isGameOver(match, rules)) return;
  if (M.matchWinner(match, rules) !== null) {
    stopBreak();
    onMatchEnd();
    return;
  }
  const next = M.nextGame(match, rules);
  if (!(await commit('next', next, outcome(next)))) return;
  stopBreak();
  render();
  const n = state.match.games.length;
  toast(t(`board.${unit()}N`, { n }));
  const server = names()[serverNow()];
  const ends = settings().autoEnds && M.endsChanged(state.match, rules) !== M.endsChanged(match, rules);
  say(t(`call.next${tennis() ? 'Set' : 'Game'}${ends ? 'Ends' : ''}`, { n, name: server, count: people(server) }));
}

// Starts a new match with the sport, names, sides, first server and rules chosen on New match.
// A club match passes its `rules` and `link` (where it's saved); a quick match its sport and options.
export function startMatch({ names: n, namesKnown, firstServer, swapped, sport: sportId, options, rules, link = null }) {
  stopBreak();
  const s = state.settings;
  state.settings = { ...s, names: n, namesKnown, firstServer, swapped };
  if (!rules) state.settings = { ...state.settings, sport: sportId, sportRules: { ...s.sportRules, [sportId]: options } };
  state.rules = rules ?? rulesFrom(state.settings);
  state.link = link ? { ...link, version: 0 } : null;
  state.match = M.newMatch(firstServer);
  save();
  Shared.follow();
  lastEnds = null; // a new match is no change of ends
  $('changeEnds').hidden = true;
  render();
  say(t('call.newMatch', { name: displayNames()[firstServer], count: people(displayNames()[firstServer]) }));
}

// Keeps the score of a club match that's already being played (someone else started it): its
// players, rules and score come from the club.
export function joinMatch(m, link) {
  stopBreak();
  const side = (players) => players.map((p) => p.name).join(' & ');
  state.settings = { ...state.settings, names: [side(m.home), side(m.away)], namesKnown: true, firstServer: m.state.games[0].firstServer, swapped: false };
  state.rules = m.rules;
  state.link = { ...link, version: m.version ?? 0 };
  state.match = m.state;
  save();
  lastEnds = null;
  $('changeEnds').hidden = true;
  Shared.follow();
  render();
}

// Someone else changed the score (or this device caught up): show it, with a flash on the side
// that scored. Only the device that scored calls the score out.
// Someone else changed the score (another phone, a watch): show it, with the interval, the break
// between games and the change of ends as for a point scored here (as far as the settings say).
function remoteChange(m, before) {
  if (m === 'gone') { toast(t('board.refusedGone')); render(); return; }
  stopBreak();
  render();
  const { match, rules } = state;
  const n = before ? notice(before, match, rules) : null;
  const gameJustOver = before && M.isGameOver(match, rules) && !M.isGameOver(before, rules);
  if (gameJustOver && settings().intervals && M.matchWinner(match, rules) === null) {
    startBreak('game', sport().breaks?.between ?? BETWEEN_GAMES_SECONDS);
  } else if ((n === 'interval' || n === 'intervalEnds') && settings().intervals) {
    $('intervalTitle').textContent = t(n === 'intervalEnds' ? 'board.intervalChangeEnds' : 'board.interval');
    say(t(n === 'intervalEnds' ? 'call.intervalChangeEnds' : 'call.interval', { score: scoreCall() }));
    startBreak('interval', sport().breaks.interval);
  } else if (n && n !== 'interval' && settings().autoEnds) {
    say(t('call.changeEnds', { score: scoreCall() })); // the banner comes with render()
  }
  // The orange card shows the score that stands: keep it up to date.
  if (!$('refused').hidden && m.lastByName) {
    $('refusedText').textContent = t('board.refusedFirst', { name: m.lastByName, score: scoreText() });
  }
  if (m.lastAction === 'point0' || m.lastAction === 'point1') flash(Number(m.lastAction.slice(-1)));
}

function setPaused(on) {
  $('paused').hidden = !on;
  $('board').classList.toggle('is-paused', on);
}

// Whether this device has the latest score (club matches): Live or Offline at the top, and while
// the score is frozen after a point, a bar running down.
export function renderSync() {
  const el = $('syncState');
  if (!el) return;
  const sync = Shared.syncState();
  el.hidden = !state.link;
  el.className = `sync ${sync.live ? 'live' : 'offline'}`;
  el.textContent = sync.live ? t('board.syncLive') : t('board.syncOffline');
  el.title = sync.live ? t('board.syncLiveTitle') : t('board.syncOfflineTitle');
  // Not live for more than a moment: a grey card, the score dimmed behind it.
  const paused = Boolean(state.link) && !sync.live;
  clearTimeout(renderSync.pausedTimer);
  if (!paused) setPaused(false);
  else renderSync.pausedTimer = setTimeout(() => setPaused(!Shared.syncState().live && Boolean(state.link)), 1500);
  const bar = $('freezeBar');
  const left = sync.frozenUntil - Date.now();
  if (state.link && left > 0 && bar.dataset.until !== String(sync.frozenUntil)) {
    bar.dataset.until = String(sync.frozenUntil);
    bar.hidden = false;
    bar.style.animation = 'none';
    void bar.offsetWidth; // restart the animation
    bar.style.animation = `freeze ${left}ms linear forwards`;
    clearTimeout(renderSync.timer);
    renderSync.timer = setTimeout(() => { bar.hidden = true; }, left);
  } else if (!(left > 0)) {
    bar.hidden = true;
    delete bar.dataset.until;
  }
}

// ---------- intervals and breaks ----------

const breaks = new BreakTimer({
  onTick(left, kind) {
    $(kind === 'interval' ? 'intervalClock' : 'breakClock').textContent = formatClock(left);
  },
  onWarning() {
    wakeScreen();
    Audio.beep(660);
    say(t('call.twentySeconds'));
  },
  onEnd(kind) {
    wakeScreen();
    Audio.beep(880, 3);
    if (kind === 'interval') {
      $('interval').hidden = true;
      say(t('call.play', { score: scoreCall() }));
    } else {
      $('breakClock').textContent = t('board.time');
      say(t(tennis() ? 'call.timeSet' : 'call.time', { n: state.match.games.length + 1 }));
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
  say(t('call.play', { score: scoreCall() }));
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
  // Only mid-game (at 11 in the decider): after a game the game-over card already said so.
  const midGame = M.currentGame(state.match).rallies.length > 0;
  if (settings().autoEnds && endsChangedNow && midGame) {
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
  const view = M.display(match, rules);
  const won = M.gamesWon(match, rules);
  const srv = serverNow();
  const over = M.isGameOver(match, rules);
  const need = Math.ceil(rules.bestOf / 2);

  for (const side of [0, 1]) {
    $(`name${side}`).textContent = names()[side];
    const serving = !over && srv === side;
    $(`tiles${side}`).innerHTML = [...view.tiles[side]].map((d) => tile(d, serving)).join('');
    // Dots: games (sets) won. Tennis also shows the games in the current set.
    const dots = rules.bestOf > 1 ? Array.from({ length: need }, (_, i) => `<i${i < won[side] ? ' class="won"' : ''}></i>`).join('') : '';
    $(`games${side}`).innerHTML = dots + (view.games ? `<b class="set-games">${t('board.gamesInSet', { n: view.games[side] })}</b>` : '');
    const section = document.querySelector(`.team[data-team="${side}"]`);
    section.classList.toggle('serving', serving);
    section.setAttribute('aria-label', t(serving ? 'board.sideServing' : 'board.side', { name: names()[side], score: view.tiles[side], n: won[side] }));
  }

  showSides(settings().swapped !== (settings().autoEnds && ends), endsChangedNow);
  const gameNo = match.games.length;
  const title = view.tiebreak ? t('board.tiebreak') : rules.bestOf > 1 ? t(`board.${unit()}N`, { n: gameNo }) : t(`board.${unit()}`);
  $('boardTitle').textContent = title.toUpperCase();
  $('boardSub').textContent = M.gameScores(match, rules).slice(0, -1).map((x, i) => t(`board.${unit()}Score`, { n: i + 1, score: x.join('–') })).join(' · ');
  $('gameoverEnds').hidden = !over || !settings().autoEnds || M.matchWinner(match, rules) !== null || M.endsChanged(M.nextGame(match, rules), rules) === ends;
  mediaRemote.show(`${names()[0]} ${view.tiles[0]} – ${view.tiles[1]} ${names()[1]}`, title);

  $('gameover').hidden = !over;
  if (over) {
    const winner = M.currentWinner(match, rules);
    const matchWinner = M.matchWinner(match, rules);
    const w = winner ?? matchWinner ?? 0;
    const name = names()[w];
    // "GAME 1" (or "MATCH WON") over "Joris & Ann win": the verb follows the name.
    $('gameoverLabel').textContent = matchWinner !== null ? t('board.matchWon') : title;
    $('gameoverTitle').textContent = t('board.wins', { name, count: people(name) });
    gamesTable($('gameoverGames'), M.gameScores(match, rules), w);
    const next = t(`board.${unit()}N`, { n: gameNo + 1 });
    $('gameoverHint').textContent = matchWinner !== null ? t('board.longPressFinish') : t('board.longPressNext', { next });
    $('nextBtn').textContent = matchWinner !== null ? t('board.finishMatch') : t('board.startNext', { next });
  }
  renderSync();
  fitTiles();
}

// The games so far as columns, a row per side (as on the watch): each game's winner in white, the
// side that won this game or the match in bold.
function gamesTable(table, scores, winner) {
  table.replaceChildren(...[0, 1].map((side) => {
    const tr = document.createElement('tr');
    if (side === winner) tr.className = 'won';
    const name = document.createElement('th');
    name.textContent = names()[side];
    tr.append(name, ...scores.map((g) => {
      const td = document.createElement('td');
      td.textContent = g[side];
      if (g[side] > g[1 - side]) td.className = 'won';
      return td;
    }));
    return tr;
  }));
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
  const h = screenHeight();
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
  Shared.followClubMatch({ remote: remoteChange, status: renderSync });
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
