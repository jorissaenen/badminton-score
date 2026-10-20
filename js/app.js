import * as M from './match.js';
import { GestureRecognizer, DEFAULT_TIMING } from './gesture.js';

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

let audioCtx = null;
function beep(freq, count = 1) {
  if (!settings.beep) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < count; i++) {
      const t = audioCtx.currentTime + i * 0.14;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    }
  } catch { /* no audio available */ }
}

function say(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

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

// Badminton call: server's score first.
function scoreCall() {
  const g = M.currentGame(match);
  const s = M.gameScore(g);
  const srv = M.server(g);
  const a = s[srv];
  const b = s[1 - srv];
  return a === b ? `${a} all` : `${a} ${b}`;
}

// ---------- actions ----------

function point(team) {
  if (M.isGameOver(match, rules)) {
    toast('Game over: long press to continue');
    beep(220);
    return;
  }
  const before = Math.max(...M.gameScore(M.currentGame(match)));
  match = M.addPoint(match, team, rules);
  save();
  render();
  flash(team);

  if (M.isGameOver(match, rules)) {
    const s = M.gameScore(M.currentGame(match));
    const result = `${Math.max(...s)} ${Math.min(...s)}`;
    if (M.matchWinner(match, rules) !== null) say(`Game and match, ${settings.names[team]}. ${result}`);
    else say(`Game, ${settings.names[team]}. ${result}`);
    return;
  }

  const after = Math.max(...M.gameScore(M.currentGame(match)));
  const mid = Math.ceil(rules.points / 2);
  if (before < mid && after === mid && rules.points >= 15) {
    const changeEnds = M.isDecidingGame(match, rules);
    toast(changeEnds ? 'Interval – change ends' : 'Interval');
    say(`${scoreCall()}. Interval${changeEnds ? '. Change ends' : ''}`);
    return;
  }
  say(scoreCall());
}

function undoPoint() {
  const g = M.currentGame(match);
  if (g.rallies.length === 0 && match.games.length === 1) {
    toast('Nothing to undo');
    beep(220);
    return;
  }
  match = M.undo(match);
  save();
  render();
  toast('Last point removed');
  say(`Undo. ${scoreCall()}`);
}

function continueAfterGame() {
  if (!M.isGameOver(match, rules)) return;
  if (M.matchWinner(match, rules) !== null) {
    startNewMatch();
    return;
  }
  match = M.nextGame(match, rules);
  save();
  render();
  toast(`Game ${match.games.length}`);
  say(`Game ${match.games.length}. ${settings.names[M.server(M.currentGame(match))]} to serve. Love all`);
}

function startNewMatch() {
  rules = rulesFrom(settings);
  match = M.newMatch(settings.firstServer);
  save();
  render();
  toast('New match');
  say('New match. Love all');
}

// ---------- remote control ----------

const remote = new GestureRecognizer((gesture) => {
  const over = M.isGameOver(match, rules);
  if (gesture === 'single') { beep(880); point(0); }
  else if (gesture === 'double') { beep(660, 2); point(1); }
  else if (gesture === 'long') {
    beep(440);
    if (over) continueAfterGame();
    else undoPoint();
  }
}, { longPressMs: settings.longPressMs, doubleClickMs: settings.doubleClickMs });

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
// Losing focus mid-press would otherwise leave the button "held" forever.
window.addEventListener('blur', () => remote.reset());

// ---------- rendering ----------

function render() {
  wakeScreen();
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

  $('board').classList.toggle('swapped', settings.swapped);
  $('gameLabel').textContent = rules.bestOf > 1 ? `Game ${match.games.length}` : 'Game';
  $('hint').textContent = `1 click: ${settings.names[0]} · 2 clicks: ${settings.names[1]} · hold: undo`;

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
  section.addEventListener('click', () => point(Number(section.dataset.team)));
}
$('undoBtn').addEventListener('click', undoPoint);
$('nextBtn').addEventListener('click', continueAfterGame);
$('swapBtn').addEventListener('click', () => {
  settings.swapped = !settings.swapped;
  save();
  render();
});

// ---------- settings dialog ----------

const form = $('settingsForm');

$('settingsBtn').addEventListener('click', () => {
  remote.reset();
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
  $('keyTester').textContent = 'No key received yet';
  $('settings').showModal();
});

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
  };
  remote.setTiming({ longPressMs: settings.longPressMs, doubleClickMs: settings.doubleClickMs });
  // A match that hasn't started yet can pick up new rules and first server right away.
  if (match.games.length === 1 && match.games[0].rallies.length === 0) {
    rules = rulesFrom(settings);
    match = M.newMatch(settings.firstServer);
  }
  save();
  render();
}

$('settings').addEventListener('close', () => {
  readForm();
  remote.reset();
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
  if ($('settings').open) wakeScreen(); // never black out while editing settings
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
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
