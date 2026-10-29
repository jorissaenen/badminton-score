// New match: who serves first (tap a side's 00 tiles, or draw), the names, points and match length.
// The remote works here too: one click switches who serves, two clicks draw, a long press starts.
import * as Board from '../scoreboard.js';
import { secureCoinFlip } from '../random.js';
import { state } from '../state.js';
import { html, icon, sheet, toast } from '../ui.js';
import { backBar } from './common.js';

const zeros = (on) => html`<span class="mini-tiles">${[0, 0].map(() => html`<span class="tile${on ? ' on' : ''}"><span class="cap">0</span><span class="split"></span></span>`)}</span>`;

export function show(el, _params, { go }) {
  const s = state.settings;
  const setup = {
    names: [...s.names],
    namesKnown: s.namesKnown,
    server: s.firstServer,
    points: s.points,
    bestOf: s.bestOf,
  };
  let drawing = false;

  const shown = (t) => (setup.namesKnown ? setup.names[t] : ['Home', 'Away'][t]);

  function draw() {
    const side = (t) => html`<button type="button" class="serve-side" data-side="${t}" aria-pressed="${setup.server === t}">
        ${zeros(setup.server === t)}
        <span class="serve-name">${shown(t)}</span>
        <span class="serve-hint">${setup.server === t ? 'SERVES FIRST' : 'TAP TO SERVE'}</span></button>`;
    const chip = (key, value, label) => html`<button type="button" class="pick" data-${key}="${value}" aria-pressed="${setup[key] === value}">${label}</button>`;
    el.innerHTML = html`<div class="page">
      ${backBar('#/play', 'Play')}
      <h1 class="title">New match</h1>
      <div class="serve-pick">${side(0)}${side(1)}</div>
      <button type="button" class="btn" data-draw ${drawing ? 'disabled' : ''}>${icon('dice', 20)}Draw who serves</button>
      <div class="card">
        <button type="button" class="row" data-names>${icon('pencil', 20)}<span class="grow"><strong>${setup.namesKnown ? `${setup.names[0]} vs ${setup.names[1]}` : 'Names'}</strong>
          <small>${setup.namesKnown ? 'Shown on the scoreboard and in the score calls' : 'Add the players’ names, or keep Home and Away'}</small></span><span class="val">Change</span></button>
      </div>
      <section><h2 class="h3" style="justify-content:center">Points per game</h2>
        <div class="chips center">${chip('points', 21, '21')}${chip('points', 15, '15')}${chip('points', 11, '11')}</div></section>
      <section><h2 class="h3" style="justify-content:center">Match</h2>
        <div class="chips center">${chip('bestOf', 1, '1 game')}${chip('bestOf', 3, 'Best of 3')}${chip('bestOf', 5, 'Best of 5')}</div></section>
      <p class="note" style="text-align:center">Remote: 1 click switches who serves, 2 clicks draws, a long press starts the match.</p>
      <button type="button" class="btn primary block" data-start>Start match</button>
    </div>`.s;
    el.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { if (!drawing) { setup.server = Number(b.dataset.side); draw(); } }));
    el.querySelectorAll('[data-points]').forEach((b) => b.addEventListener('click', () => { setup.points = Number(b.dataset.points); draw(); }));
    el.querySelectorAll('[data-bestof]').forEach((b) => b.addEventListener('click', () => { setup.bestOf = Number(b.dataset.bestof); draw(); }));
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
      toast('This browser can’t draw fairly; pick who serves');
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
        Board.say(`${shown(winner)} to serve`);
      }
    };
    tick();
  }

  function editNames() {
    const field = (t, label) => html`<label class="field">${label}<input type="text" data-name="${t}" maxlength="40" autocomplete="off"
      value="${setup.namesKnown ? setup.names[t] : ''}" placeholder="${t ? 'e.g. Tom & Lies' : 'e.g. Joris & Ann'}"></label>`;
    let inputs = [];
    sheet(html`<h2 class="sheet-title">Names</h2>
      <p class="sheet-text">Leave them empty to show Home and Away.</p>
      <div class="names-edit">${field(0, 'Left')}${field(1, 'Right')}</div>
      <button type="button" class="btn primary block" data-done>Done</button>`.s, (sh, close) => {
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
        setup.names = typed.map((n, t) => n || ['Home', 'Away'][t]);
        draw();
      },
    });
  }

  function startNow() {
    if (drawing) return;
    Board.startMatch({
      names: setup.names, namesKnown: setup.namesKnown, firstServer: setup.server,
      swapped: state.settings.swapped, points: setup.points, bestOf: setup.bestOf,
    });
    go('#/match', { replace: true });
  }

  Board.setGestureHandler((gesture) => {
    if (document.querySelector('.sheet-host')) return;
    if (gesture === 'single' && !drawing) { setup.server = 1 - setup.server; draw(); }
    else if (gesture === 'double') drawServer();
    else if (gesture === 'long') startNow();
  });

  draw();
  return () => Board.setGestureHandler(null);
}
