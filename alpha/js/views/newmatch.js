// New match: first the sport, then who serves first (tap a side's 00 tiles, or draw), the names and
// the sport's rules. The remote works here too: on the sport grid one click moves to the next sport
// and a long press picks it; then one click switches who serves, two clicks draw, a long press starts.
import * as Board from '../scoreboard.js';
import { secureCoinFlip } from '../random.js';
import { state, isFinished } from '../state.js';
import { unlink } from '../clubmatch.js';
import { html, raw, icon, sheet, toast } from '../ui.js';
import { t, people } from '../i18n.js';
import { defaultNames } from '../state.js';
import { backBar } from './common.js';
import { sportGrid, sportName, rulesFields, wireRules } from './rules.js';
import { SPORTS, sportIcon } from '../sports.js';

const zeros = (on) => html`<span class="mini-tiles">${[0, 0].map(() => html`<span class="tile${on ? ' on' : ''}"><span class="cap">0</span><span class="split"></span></span>`)}</span>`;

export function show(el, _params, { go }) {
  const s = state.settings;
  const setup = {
    names: [...s.names],
    namesKnown: s.namesKnown,
    server: s.firstServer,
    sport: null, // picked first, every time
    options: {},
  };
  let drawing = false;
  let highlight = SPORTS.findIndex((x) => x.id === s.sport); // for the remote on the sport grid

  function pickSport(id) {
    setup.sport = id;
    setup.options = { ...state.settings.sportRules?.[id] };
    draw();
  }

  function drawSports() {
    el.innerHTML = html`<div class="page">
      ${backBar('#/play', t('play.title'))}
      <h1 class="title">${t('newMatch.whichSport')}</h1>
      ${sportGrid(SPORTS[Math.max(0, highlight)].id)}
      <p class="note" style="text-align:center">${t('newMatch.sportRemoteHint')}</p>
    </div>`.s;
    el.querySelectorAll('[data-sport]').forEach((b) => b.addEventListener('click', () => pickSport(b.dataset.sport)));
  }

  const shown = (side) => (setup.namesKnown ? setup.names[side] : defaultNames()[side]);

  function draw() {
    if (!setup.sport) { drawSports(); return; }
    const side = (n) => html`<button type="button" class="serve-side" data-side="${n}" aria-pressed="${setup.server === n}">
        ${zeros(setup.server === n)}
        <span class="serve-name">${shown(n)}</span>
        <span class="serve-hint">${setup.server === n ? t('newMatch.servesFirst') : t('newMatch.tapToServe')}</span></button>`;
    el.innerHTML = html`<div class="page">
      ${backBar('#/play', t('play.title'))}
      <h1 class="title">${t('newMatch.title')}</h1>
      <div class="card"><button type="button" class="row" data-change-sport>${raw(sportIcon(setup.sport, 24))}<span class="grow"><strong>${sportName(setup.sport)}</strong></span><span class="val">${t('common.change')}</span></button></div>
      <div class="serve-pick">${side(0)}${side(1)}</div>
      <button type="button" class="btn" data-draw ${drawing ? 'disabled' : ''}>${icon('dice', 20)}${t('newMatch.draw')}</button>
      <div class="card">
        <button type="button" class="row" data-names>${icon('pencil', 20)}<span class="grow"><strong>${setup.namesKnown ? t('newMatch.versus', { a: setup.names[0], b: setup.names[1] }) : t('newMatch.names')}</strong>
          <small>${setup.namesKnown ? t('newMatch.namesShown') : t('newMatch.namesAdd')}</small></span><span class="val">${t('common.change')}</span></button>
      </div>
      ${rulesFields(setup.sport, setup.options, { center: true })}
      <p class="note" style="text-align:center">${t('newMatch.remoteHint')}</p>
      <button type="button" class="btn primary block" data-start>${t('newMatch.start')}</button>
    </div>`.s;
    el.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { if (!drawing) { setup.server = Number(b.dataset.side); draw(); } }));
    wireRules(el, (key, value) => { setup.options = { ...setup.options, [key]: value }; draw(); });
    el.querySelector('[data-change-sport]').addEventListener('click', () => { highlight = SPORTS.findIndex((x) => x.id === setup.sport); setup.sport = null; draw(); });
    el.querySelector('[data-draw]').addEventListener('click', drawServer);
    el.querySelector('[data-names]').addEventListener('click', editNames);
    el.querySelector('[data-start]').addEventListener('click', startNow);
  }

  // The tiles flick from side to side, slowing down, and stop on the drawn side.
  function drawServer() {
    if (drawing) return;
    let winner;
    try {
      winner = secureCoinFlip();
    } catch {
      toast(t('newMatch.noDraw'));
      return;
    }
    drawing = true;
    const steps = 7 + ((winner + 7 + setup.server) % 2); // ends on the winner
    let i = 0;
    const tick = () => {
      setup.server = 1 - setup.server;
      i += 1;
      draw();
      if (i < steps) setTimeout(tick, 70 + i * 22);
      else {
        drawing = false;
        setup.server = winner;
        draw();
        Board.say(t('call.toServe', { name: shown(winner), count: people(shown(winner)) }));
      }
    };
    tick();
  }

  function editNames() {
    const field = (n, label) => html`<label class="field">${label}<input type="text" data-name="${n}" maxlength="40" autocomplete="off"
      value="${setup.namesKnown ? setup.names[n] : ''}" placeholder="${n ? t('newMatch.examplePair2') : t('newMatch.examplePair1')}"></label>`;
    let inputs = [];
    sheet(html`<h2 class="sheet-title">${t('newMatch.names')}</h2>
      <p class="sheet-text">${t('newMatch.namesEmpty')}</p>
      <div class="names-edit">${field(0, t('newMatch.left'))}${field(1, t('newMatch.right'))}</div>
      <button type="button" class="btn primary block" data-done>${t('common.done')}</button>`.s, (sh, close) => {
      inputs = [...sh.querySelectorAll('[data-name]')];
      inputs.forEach((i) => i.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (i === inputs[0]) inputs[1].focus();
        else close();
      }));
      sh.querySelector('[data-done]').addEventListener('click', close);
      setTimeout(() => inputs[0].focus(), 250);
    }, {
      onClose: () => {
        const typed = inputs.map((i) => i.value.trim());
        setup.namesKnown = typed.some(Boolean);
        setup.names = typed.map((n, side) => n || defaultNames()[side]);
        draw();
      },
    });
  }

  async function startNow() {
    if (drawing || !setup.sport) return;
    // A club match still being scored here is stopped: a quick match takes its place.
    if (state.link && !isFinished()) await unlink('stopped');
    Board.startMatch({
      names: setup.names, namesKnown: setup.namesKnown, firstServer: setup.server,
      swapped: state.settings.swapped, sport: setup.sport, options: setup.options,
    });
    go('#/match', { replace: true });
  }

  Board.setGestureHandler((gesture) => {
    if (document.querySelector('.sheet-host')) return;
    if (!setup.sport) {
      if (gesture === 'single') { highlight = (highlight + 1) % SPORTS.length; draw(); }
      else if (gesture === 'long') pickSport(SPORTS[Math.max(0, highlight)].id);
      return;
    }
    if (gesture === 'single' && !drawing) { setup.server = 1 - setup.server; draw(); }
    else if (gesture === 'double') drawServer();
    else if (gesture === 'long') startNow();
  });

  draw();
  return () => Board.setGestureHandler(null);
}
