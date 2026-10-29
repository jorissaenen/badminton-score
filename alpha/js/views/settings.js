// The match menu (the ⋯ button on the match) and the settings sheets it shares with You: language,
// sound, remote and timing, with a tester.
import * as M from '../match.js';
import * as Audio from '../audio.js';
import * as Board from '../scoreboard.js';
import { mediaControlsSupported } from '../media.js';
import { DEFAULT_TIMING } from '../gesture.js';
import { state, save, hasStarted } from '../state.js';
import { html, icon, sheet, choose } from '../ui.js';
import { t, LANGUAGES, language, setLanguage } from '../i18n.js';
import { sportOf } from '../sports.js';
import { unlink } from '../clubmatch.js';
import { sportName, rulesSummary } from './rules.js';

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

const miniTiles = (text, on) => html`<span class="mini-tiles">${[...text].map((d) => html`<span class="tile${on ? ' on' : ''}" style="--tile-h:46px"><span class="cap">${d}</span><span class="split"></span></span>`)}</span>`;

export function openMatchMenu({ go }) {
  const { match, rules } = state;
  const tiles = M.display(match, rules).tiles;
  const srv = M.server(M.currentGame(match), rules, match);
  const over = M.isGameOver(match, rules);
  const tennis = sportOf(rules.sport).scoring === 'tennis';
  const points = `${sportName(rules.sport)} · ${rulesSummary(rules)}`;
  sheet(html`
    <div style="display:flex;align-items:center;gap:14px;padding:0 4px">
      <span style="display:flex;gap:10px">${miniTiles(tiles[0], !over && srv === 0)}${miniTiles(tiles[1], !over && srv === 1)}</span>
      <span><strong style="display:block;font-size:17px">${t(tennis ? 'board.setN' : 'board.gameN', { n: match.games.length })}</strong><small class="muted">${points}</small></span>
    </div>
    <div class="quick">
      <button type="button" data-quick="voice" aria-pressed="${s().voice}">${icon('sound')}${t('settings.voice')}</button>
      <button type="button" data-quick="beep" aria-pressed="${s().beep}">${icon('music')}${t('settings.beeps')}</button>
      <button type="button" data-quick="sleep" aria-pressed="${s().sleep}">${icon('moon')}${t('settings.sleep')}</button>
    </div>
    <div class="card">
      ${toggle('intervals', t('settings.intervals'), t('settings.intervalsSub'))}
      ${toggle('autoEnds', t('settings.autoEnds'), t('settings.autoEndsSub'))}
      <button type="button" class="row" data-remote>${icon('remote')}<span class="grow"><strong>${t('menu.remote')}</strong><small>${t('menu.remoteSub')}</small></span>${icon('chevron', 18)}</button>
    </div>
    <div class="btns">
      <button type="button" class="btn danger" data-end>${t('menu.end')}</button>
      <button type="button" class="btn primary" data-resume>${t('menu.resume')}</button>
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
      const link = state.link;
      const answer = await choose(t('menu.endQ'), link ? t('menu.endClubText') : hasStarted() ? t('menu.endText') : '', [
        { label: t('menu.keep'), value: 'keep', style: 'primary' },
        { label: link ? t('menu.stop') : t('menu.clear'), value: 'clear', style: 'danger' },
      ]);
      if (!answer) return;
      if (link) {
        if (answer === 'clear') {
          await unlink('stopped');
          state.match = M.newMatch(s().firstServer);
          save();
        }
        go(`#/club/${link.clubId}/event/${link.eventId}`);
        return;
      }
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
  const options = [html`<option value="">${best ? t('voice.automaticName', { name: best.name }) : t('voice.automatic')}</option>`,
    ...list.map((v) => html`<option value="${v.voiceURI}" ${v.voiceURI === s().voiceURI ? 'selected' : ''}>${v.name} – ${v.lang}${v.localService ? '' : ` ${t('voice.online')}`}</option>`)];
  sheet(html`<h2 class="sheet-title">${t('settings.voiceName')}</h2>
    <label class="field">${t('settings.voiceName')}<select data-voice>${options}</select></label>
    <label class="field">${t('voice.speed')}
      <select data-rate>${[0.8, 0.9, 1, 1.1, 1.2, 1.3].map((r) => html`<option value="${r}" ${r === s().speechRate ? 'selected' : ''}>${r === 1 ? t('voice.normal') : `${r}×`}</option>`)}</select></label>
    <div class="btns"><button type="button" class="btn" data-test>${icon('sound', 20)}${t('voice.listen')}</button><button type="button" class="btn primary" data-done>${t('common.done')}</button></div>`.s,
  (el, close) => {
    const voice = el.querySelector('[data-voice]');
    const rate = el.querySelector('[data-rate]');
    voice.addEventListener('change', () => setSetting('voiceURI', voice.value));
    rate.addEventListener('change', () => setSetting('speechRate', Number(rate.value) || 1));
    el.querySelector('[data-test]').addEventListener('click', () => {
      Audio.keepOutputAwake(true);
      Audio.say(t('voice.sample'), { voiceURI: voice.value, rate: Number(rate.value) || 1 });
    });
    el.querySelector('[data-done]').addEventListener('click', close);
  }, { onClose: onDone });
}

export const voiceName = () => {
  if (!Audio.speechSupported()) return t('voice.notAvailable');
  return Audio.voiceFor(s().voiceURI)?.name ?? t('voice.automatic');
};

// ---------- remote: timing and tester ----------

export function remoteSheet(onDone = () => {}) {
  const ms = (key, label, lo, hi, step) => html`<label class="field">${label}
    <select data-ms="${key}">${range(lo, hi, step, key).map((v) => html`<option value="${v}" ${v === s()[key] ? 'selected' : ''}>${seconds(v)}${v === DEFAULT_TIMING[key] ? ` ${t('remote.default')}` : ''}</option>`)}</select></label>`;
  let stopTest = () => {};
  sheet(html`<h2 class="sheet-title">${t('remote.title')}</h2>
    <p class="sheet-text">${t('remote.text')}</p>
    <div class="card">
      ${mediaControlsSupported() ? toggle('headphones', t('settings.headphones'), t('settings.headphonesSub')) : ''}
      ${toggle('screenRemote', t('settings.screenRemote'), t('settings.screenRemoteSub'))}
    </div>
    <div class="form-row">${ms('longPressMs', t('remote.longPress'), 300, 2000, 100)}${ms('doubleClickMs', t('remote.doubleClick'), 150, 800, 50)}</div>
    <div>
      <div class="h3">${t('remote.tester')}</div>
      <div class="card pad"><p class="note" style="margin:0 0 4px">${t('remote.testerText')}</p>
      <output class="tester" data-log>${Board.lastPresses().join('\n') || t('remote.nothing')}</output></div>
    </div>
    <button type="button" class="btn primary block" data-done>${t('common.done')}</button>`.s, (el, close) => {
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

// ---------- sound check ----------

// Shows what the sound does on this device, with a beep and a score call to try.
export function soundCheck() {
  let timer = null;
  const info = () => {
    const list = Audio.voices();
    const voice = Audio.voiceFor(s().voiceURI);
    const onOff = (on) => (on ? t('soundCheck.on') : t('soundCheck.off'));
    return [
      t('soundCheck.settings', { voice: onOff(s().voice), beep: onOff(s().beep) }),
      t('soundCheck.audio', { state: Audio.audioState() }),
      Audio.speechSupported() ? t('soundCheck.speech', { n: list.length, voice: voice ? `${voice.name} (${voice.lang})` : t('soundCheck.noVoice') }) : t('soundCheck.noSpeech'),
      '',
      ...(Audio.soundLog().length ? Audio.soundLog() : [t('soundCheck.nothing')]),
    ].join('\n');
  };
  sheet(html`<h2 class="sheet-title">${t('soundCheck.title')}</h2>
    <p class="sheet-text">${t('soundCheck.text')}</p>
    <div class="btns"><button type="button" class="btn" data-beep>${icon('music', 20)}${t('soundCheck.beep')}</button>
      <button type="button" class="btn" data-say>${icon('sound', 20)}${t('soundCheck.say')}</button></div>
    <output class="tester" data-info style="white-space:pre-line;font-size:12px">${info()}</output>
    <p class="note" style="margin:0">${t('soundCheck.silentSwitch')}</p>
    <button type="button" class="btn primary block" data-done>${t('common.done')}</button>`.s, (el, close) => {
    const out = el.querySelector('[data-info]');
    el.querySelector('[data-beep]').addEventListener('click', () => Audio.beep(880));
    el.querySelector('[data-say]').addEventListener('click', () => Audio.say(t('call.score', { a: 11, b: 9 }), { voiceURI: s().voiceURI, rate: s().speechRate }));
    el.querySelector('[data-done]').addEventListener('click', close);
    timer = setInterval(() => { out.textContent = info(); }, 400);
  }, { onClose: () => clearInterval(timer) });
}

// ---------- language ----------

// Automatic follows the device; a picked language is kept on this device.
export function languageSheet(onDone = () => {}) {
  const picked = s().language ?? '';
  const row = (code, label, sub = '') => html`<button type="button" class="radio-row" role="radio" data-lang="${code}" aria-checked="${picked === code}">
    <span class="radio"></span><span><strong>${label}</strong>${sub ? html`<small>${sub}</small>` : ''}</span></button>`;
  sheet(html`<h2 class="sheet-title">${t('you.language')}</h2>
    <div class="card" role="radiogroup">
      ${row('', t('language.automatic'), t('language.automaticSub', { name: LANGUAGES[language()].name }))}
      ${Object.entries(LANGUAGES).map(([code, l]) => row(code, l.name))}
    </div>`.s, (el, close) => {
    el.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
      setSetting('language', b.dataset.lang);
      setLanguage(b.dataset.lang);
      close();
    }));
  }, { onClose: onDone });
}
