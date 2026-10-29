// The match menu (the ⋯ button on the match) and the settings sheets it shares with You: sound,
// remote and timing, with a tester.
import * as M from '../match.js';
import * as Audio from '../audio.js';
import * as Board from '../scoreboard.js';
import { mediaControlsSupported } from '../media.js';
import { DEFAULT_TIMING } from '../gesture.js';
import { state, save, hasStarted } from '../state.js';
import { html, icon, sheet, choose } from '../ui.js';

const s = () => state.settings;

export function setSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  if (key === 'voice') Audio.keepOutputAwake(value);
  if (key === 'headphones') Board.media.enable(value); // starting audio is only allowed during a tap
  if (key === 'longPressMs' || key === 'doubleClickMs') Board.applyTiming();
  save();
  Board.render();
  Board.wakeScreen();
}

export const toggle = (key, title, sub = '') => html`<label class="switch"><span>${title}${sub ? html`<small>${sub}</small>` : ''}</span>
  <input type="checkbox" data-set="${key}" ${s()[key] ? 'checked' : ''}></label>`;

// Wires the switches made with toggle() inside an element.
export function wireToggles(el) {
  el.querySelectorAll('input[data-set]').forEach((input) => {
    input.addEventListener('change', () => setSetting(input.dataset.set, input.checked));
  });
}

export const seconds = (ms) => `${(ms / 1000).toFixed(ms % 100 ? 2 : 1).replace(/\.?0+$/, '')} s`;

// ---------- the match menu ----------

const pad2 = (n) => String(n).padStart(2, '0');
const miniTiles = (n, on) => html`<span class="mini-tiles">${[...pad2(n)].map((d) => html`<span class="tile${on ? ' on' : ''}" style="--tile-h:46px"><span class="cap">${d}</span><span class="split"></span></span>`)}</span>`;

export function openMatchMenu({ go }) {
  const { match, rules } = state;
  const g = M.currentGame(match);
  const score = M.gameScore(g);
  const srv = M.server(g);
  const over = M.isGameOver(match, rules);
  const points = `${rules.points} points · ${rules.bestOf === 1 ? '1 game' : `best of ${rules.bestOf}`}`;
  sheet(html`
    <div style="display:flex;align-items:center;gap:14px;padding:0 4px">
      <span style="display:flex;gap:10px">${miniTiles(score[0], !over && srv === 0)}${miniTiles(score[1], !over && srv === 1)}</span>
      <span><strong style="display:block;font-size:17px">${rules.bestOf > 1 ? `Game ${match.games.length}` : 'Game'}</strong><small class="muted">${points}</small></span>
    </div>
    <div class="quick">
      <button type="button" data-quick="voice" aria-pressed="${s().voice}">${icon('sound')}Score calls</button>
      <button type="button" data-quick="beep" aria-pressed="${s().beep}">${icon('music')}Beeps</button>
      <button type="button" data-quick="sleep" aria-pressed="${s().sleep}">${icon('moon')}Screen sleep</button>
    </div>
    <div class="card">
      ${toggle('intervals', 'Intervals and breaks', '60 s at 11, 2 min between games')}
      ${toggle('autoEnds', 'Change ends automatically', 'After each game, and at 11 in the decider')}
      <button type="button" class="row" data-remote>${icon('remote')}<span class="grow"><strong>Remote and earbuds</strong><small>Test a button, timing</small></span>${icon('chevron', 18)}</button>
    </div>
    <div class="btns">
      <button type="button" class="btn danger" data-end>End match</button>
      <button type="button" class="btn primary" data-resume>Resume</button>
    </div>`.s, (el, close) => {
    wireToggles(el);
    el.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.quick;
      setSetting(key, !s()[key]);
      b.setAttribute('aria-pressed', String(s()[key]));
    }));
    el.querySelector('[data-remote]').addEventListener('click', () => { close(); remoteSheet(); });
    el.querySelector('[data-resume]').addEventListener('click', close);
    el.querySelector('[data-end]').addEventListener('click', async () => {
      close();
      const answer = await choose('End match?', hasStarted() ? 'Quick matches aren’t saved. Keep it to continue later from Play, or clear the score.' : '', [
        { label: 'Keep it for later', value: 'keep', style: 'primary' },
        { label: 'Clear the score', value: 'clear', style: 'danger' },
      ]);
      if (!answer) return;
      if (answer === 'clear') {
        state.match = M.newMatch(s().firstServer);
        save();
      }
      go('#/play');
    });
  });
}

// ---------- sound ----------

export function voiceSheet(onDone = () => {}) {
  const list = Audio.sortedVoices();
  const best = Audio.bestVoice(list);
  const options = [html`<option value="">${best ? `Automatic (${best.name})` : 'Automatic'}</option>`,
    ...list.map((v) => html`<option value="${v.voiceURI}" ${v.voiceURI === s().voiceURI ? 'selected' : ''}>${v.name} – ${v.lang}${v.localService ? '' : ' (online)'}</option>`)];
  sheet(html`<h2 class="sheet-title">Voice</h2>
    <label class="field">Voice<select data-voice>${options}</select></label>
    <label class="field">Speed
      <select data-rate>${[0.8, 0.9, 1, 1.1, 1.2, 1.3].map((r) => html`<option value="${r}" ${r === s().speechRate ? 'selected' : ''}>${r === 1 ? 'Normal' : `${r}×`}</option>`)}</select></label>
    <div class="btns"><button type="button" class="btn" data-test>${icon('sound', 20)}Listen</button><button type="button" class="btn primary" data-done>Done</button></div>`.s,
  (el, close) => {
    const voice = el.querySelector('[data-voice]');
    const rate = el.querySelector('[data-rate]');
    voice.addEventListener('change', () => setSetting('voiceURI', voice.value));
    rate.addEventListener('change', () => setSetting('speechRate', Number(rate.value) || 1));
    el.querySelector('[data-test]').addEventListener('click', () => {
      Audio.keepOutputAwake(true);
      Audio.say('11 9. Interval', { voiceURI: voice.value, rate: Number(rate.value) || 1 });
    });
    el.querySelector('[data-done]').addEventListener('click', close);
  }, { onClose: onDone });
}

export const voiceName = () => {
  if (!Audio.speechSupported()) return 'Not available';
  const v = Audio.voices().find((x) => x.voiceURI === s().voiceURI) ?? Audio.bestVoice();
  return v?.name ?? 'Automatic';
};

// ---------- remote: timing and tester ----------

export function remoteSheet(onDone = () => {}) {
  const ms = (key, label, lo, hi, step) => html`<label class="field">${label}
    <select data-ms="${key}">${range(lo, hi, step, key).map((v) => html`<option value="${v}" ${v === s()[key] ? 'selected' : ''}>${seconds(v)}${v === DEFAULT_TIMING[key] ? ' (default)' : ''}</option>`)}</select></label>`;
  let stopTest = () => {};
  sheet(html`<h2 class="sheet-title">Remote</h2>
    <p class="sheet-text">One click scores for the left team, two clicks for the right team, a long press undoes. A camera remote, a keyboard, a mouse’s wheel or thumb button, or earbuds all work.</p>
    <div class="card">
      ${mediaControlsSupported() ? toggle('headphones', 'Headphone controls', 'Earbuds or a watch as the remote') : ''}
      ${toggle('screenRemote', 'Use the screen as remote', 'A tap anywhere on the score is a click')}
    </div>
    <div class="form-row">${ms('longPressMs', 'Long press', 300, 2000, 100)}${ms('doubleClickMs', 'Double click within', 150, 800, 50)}</div>
    <div>
      <div class="h3">Tester</div>
      <div class="card pad"><p class="note" style="margin:0 0 4px">Press a button: what arrives shows here, and nothing is scored while this is open.</p>
      <output class="tester" data-log>${Board.lastPresses().join('\n') || 'Nothing received yet'}</output></div>
    </div>
    <button type="button" class="btn primary block" data-done>Done</button>`.s, (el, close) => {
    wireToggles(el);
    el.querySelectorAll('[data-ms]').forEach((sel) => sel.addEventListener('change', () => setSetting(sel.dataset.ms, Number(sel.value))));
    const log = el.querySelector('[data-log]');
    log.style.whiteSpace = 'pre-line';
    Board.setTesting(true);
    stopTest = Board.onTest((_, all) => { log.textContent = all.join('\n'); });
    el.querySelector('[data-done]').addEventListener('click', close);
  }, { onClose: () => { Board.setTesting(false); stopTest(); onDone(); } });
}

// The choices, plus the current value when an older version stored one in between.
function range(lo, hi, step, key) {
  const list = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const now = s()[key];
  return list.includes(now) ? list : [...list, now].sort((a, b) => a - b);
}
