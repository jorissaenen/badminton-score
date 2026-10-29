// The scoreboard's settings and the match in progress, kept in this device's storage.
import * as M from './match.js';
import { EDITION } from './edition.js';
import { DEFAULT_TIMING } from './gesture.js';
import { t } from './i18n.js';

const STORAGE_KEY = EDITION.storageKey;

export const DEFAULT_SETTINGS = {
  names: ['Home', 'Away'],
  namesKnown: false, // true once players' names were typed or picked; otherwise HOME / AWAY
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
  language: '', // '' = the device's language
};

export function rulesFrom(settings) {
  return { points: settings.points, cap: M.capFor(settings.points), bestOf: settings.bestOf };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.match?.games?.length && saved.rules) {
      const settings = { ...DEFAULT_SETTINGS, ...saved.settings };
      // Older saves had no namesKnown: names other than the defaults were typed in.
      if (saved.settings && !('namesKnown' in saved.settings)) {
        settings.namesKnown = settings.names[0] !== 'Home' || settings.names[1] !== 'Away';
      }
      return { settings, rules: saved.rules, match: saved.match };
    }
  } catch { /* fall through to defaults */ }
  // First start of this edition: take over production's settings (voice, remote timing), but start
  // with a fresh match. Production's data is only read, never written.
  let fromProduction = {};
  try {
    fromProduction = JSON.parse(localStorage.getItem(EDITION.productionStorageKey))?.settings ?? {};
  } catch { /* nothing to copy */ }
  const settings = { ...DEFAULT_SETTINGS, ...fromProduction, names: DEFAULT_SETTINGS.names, namesKnown: false };
  return { settings, rules: rulesFrom(settings), match: M.newMatch(settings.firstServer) };
}

export const state = load();

const listeners = new Set();
export const onChange = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full or disabled: keep playing */ }
  listeners.forEach((cb) => cb(state));
}

export function setSettings(changes) {
  state.settings = { ...state.settings, ...changes };
  // A match that hasn't started yet picks up new rules right away.
  if (!hasStarted()) {
    state.rules = rulesFrom(state.settings);
    state.match = M.newMatch(state.settings.firstServer);
  }
  save();
}

export const hasStarted = () => state.match.games.length > 1 || state.match.games[0].rallies.length > 0;

export function isFinished() {
  return M.isGameOver(state.match, state.rules) && M.matchWinner(state.match, state.rules) !== null;
}

// The names to show: the players when known, otherwise Home and Away (in the app's language).
export const defaultNames = () => [t('board.home'), t('board.away')];
export const displayNames = (s = state.settings) => (s.namesKnown ? s.names : defaultNames());
