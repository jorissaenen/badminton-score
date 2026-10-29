// Club settings: name, usual place, club match rules, seasons, and leaving or deleting the club.
import * as Club from '../club.js';
import { session } from '../session.js';
import { setLastClub } from '../links.js';
import { html, icon, sheet, confirmSheet, attempt, toast, dayText } from '../ui.js';
import { clubScreen } from './clubview.js';

const fullDate = (iso) => dayText(iso, { day: 'numeric', month: 'short', year: 'numeric' });

export function show(el, [clubId], { go }) {
  const typed = {}; // fields being typed, kept across redraws

  function draw(v) {
    const { club, admin, myRole, seasons } = v;
    if (document.activeElement?.matches?.('.view input')) return; // don't redraw under typing
    const now = Club.currentSeason(seasons);
    const d = club.defaults ?? {};
    const field = (key, label, value, placeholder) => html`<label class="field">${label}
      <input type="text" data-field="${key}" maxlength="60" value="${typed[key] ?? value ?? ''}" placeholder="${placeholder}" ${admin ? '' : 'disabled'}></label>`;
    const chip = (key, value, label) => html`<button type="button" class="pick" data-default="${key}" data-value="${value}" aria-pressed="${(d[key] ?? (key === 'points' ? 21 : 3)) === value}" ${admin ? '' : 'disabled'}>${label}</button>`;
    el.innerHTML = html`<div class="page">
      <div class="top"><a class="back" href="#/club/${clubId}">${icon('back', 22)}${club.name}</a></div>
      <h1 class="title">Club settings</h1>
      <section><h2 class="h3">Club</h2><div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        ${field('name', 'Name', club.name, 'Club name')}
        ${field('place', 'Usual place', club.place, 'e.g. Sporthal De Brug')}
        ${admin ? html`<button type="button" class="btn primary" data-save-club>Save</button>` : html`<p class="note" style="margin:0">Admins and owners change these.</p>`}
      </div></section>
      <section><h2 class="h3">Club matches</h2><div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        <div class="chips">${chip('points', 21, '21 points')}${chip('points', 15, '15')}${chip('points', 11, '11')}</div>
        <div class="chips">${chip('bestOf', 1, '1 game')}${chip('bestOf', 3, 'Best of 3')}${chip('bestOf', 5, 'Best of 5')}</div>
      </div></section>
      <section><h2 class="h3">Seasons${admin ? html`<button type="button" data-add-season>Add a season</button>` : ''}</h2><div class="card">
        ${seasons.length ? seasons.map((s) => html`<button type="button" class="row" data-season="${s.id}" ${admin ? '' : 'disabled style="cursor:default"'}>
            <span class="grow"><strong>${s.name}${s.id === now?.id ? html` <span class="chip light" style="margin-left:6px;padding:2px 8px">current</span>` : ''}</strong>
            <small>${fullDate(s.start)} – ${fullDate(s.end)}</small></span>${admin ? icon('chevron', 18) : ''}</button>`)
          : html`<p class="empty">No seasons yet.</p>`}
      </div><p class="note">A match counts for the season its date falls in. Players and results carry over to the next season.</p></section>
      <section><h2 class="h3">Leave or delete</h2><div class="card">
        <button type="button" class="row danger" data-leave ${myRole === 'owner' ? 'disabled style="opacity:.42;cursor:default"' : ''}>Leave ${club.name}</button>
        <button type="button" class="row danger" data-delete ${myRole === 'owner' ? '' : 'disabled style="opacity:.42;cursor:default"'}>Delete the club for everyone</button>
      </div><p class="note">${myRole === 'owner' ? 'As the owner you can only leave after making someone else owner (People).' : 'Only the owner can delete the club.'}</p></section>
    </div>`.s;

    el.querySelectorAll('[data-field]').forEach((i) => {
      i.addEventListener('input', () => { typed[i.dataset.field] = i.value; });
      i.addEventListener('blur', () => setTimeout(() => screen.redraw(), 0));
    });
    el.querySelector('[data-save-club]')?.addEventListener('click', () => saveClub(v));
    el.querySelectorAll('[data-default]').forEach((b) => b.addEventListener('click', () => {
      attempt(Club.updateClub(clubId, { defaults: { points: 21, bestOf: 3, ...d, [b.dataset.default]: Number(b.dataset.value) } }), 'Couldn’t save');
    }));
    el.querySelector('[data-add-season]')?.addEventListener('click', () => editSeason(v, null));
    el.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => editSeason(v, seasons.find((s) => s.id === b.dataset.season))));
    el.querySelector('[data-leave]').addEventListener('click', () => leave(v));
    el.querySelector('[data-delete]').addEventListener('click', () => remove(v));
  }

  async function saveClub(v) {
    const name = (typed.name ?? v.club.name).trim();
    const place = (typed.place ?? v.club.place ?? '').trim();
    if (!name) { toast('The club needs a name'); return; }
    let ok = true;
    if (name !== v.club.name) ok = await attempt(Club.renameClub(session.user, clubId, name), 'Couldn’t rename');
    if (ok && place !== (v.club.place ?? '')) ok = await attempt(Club.updateClub(clubId, { place }), 'Couldn’t save the place');
    if (ok) {
      delete typed.name;
      delete typed.place;
      toast('Saved');
      screen.redraw();
    }
  }

  function editSeason(v, season) {
    const values = season ?? Club.nextSeasonSuggestion(v.seasons);
    sheet(html`<h2 class="sheet-title">${season ? 'Season' : 'Add a season'}</h2>
      <label class="field">Name<input type="text" data-s="name" maxlength="40" value="${values.name}"></label>
      <div class="form-row"><label class="field">Starts<input type="date" data-s="start" value="${values.start}"></label>
        <label class="field">Ends<input type="date" data-s="end" value="${values.end}"></label></div>
      <button type="button" class="btn primary block" data-save>${season ? 'Save' : 'Add season'}</button>
      ${season ? html`<button type="button" class="btn danger block" data-delete>Delete season</button>` : ''}`.s, (sh, close) => {
      const val = (k) => sh.querySelector(`[data-s="${k}"]`).value.trim();
      sh.querySelector('[data-save]').addEventListener('click', async () => {
        const [name, start, end] = [val('name'), val('start'), val('end')];
        if (!name || !start || !end) { toast('Give the season a name, a start and an end date'); return; }
        if (end < start) { toast('The season has to end after it starts'); return; }
        close();
        await attempt(season ? Club.updateSeason(clubId, season.id, { name, start, end }) : Club.addSeason(clubId, name, start, end), 'Couldn’t save the season');
      });
      sh.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmSheet(`Delete season ${season.name}?`, 'Events and players stay.', 'Delete', true)) attempt(Club.deleteSeason(clubId, season.id), 'Couldn’t delete the season');
      });
    });
  }

  async function leave(v) {
    if (v.myRole === 'owner') return;
    if (!(await confirmSheet(`Leave ${v.club.name}?`, 'You need a new invite to come back.', 'Leave', true))) return;
    if (await attempt(Club.leave(session.user, clubId), 'Couldn’t leave')) {
      setLastClub(null);
      go('#/clubs', { replace: true });
    }
  }

  function remove(v) {
    if (v.myRole !== 'owner') return;
    const name = v.club.name;
    sheet(html`<h2 class="sheet-title">Delete ${name}?</h2>
      <p class="sheet-text">This deletes the club for everyone: members, seasons, players and invites. It can’t be undone. Type the club’s name to confirm.</p>
      <input type="text" data-confirm autocomplete="off" placeholder="${name}">
      <button type="button" class="btn danger block" data-go disabled>Delete for everyone</button>`.s, (sh, close) => {
      const input = sh.querySelector('[data-confirm]');
      const btn = sh.querySelector('[data-go]');
      input.addEventListener('input', () => { btn.disabled = input.value.trim() !== name; });
      btn.addEventListener('click', async () => {
        close();
        screen.cleanup();
        if (await attempt(Club.deleteClub(session.user, clubId), 'Couldn’t delete the club')) {
          setLastClub(null);
          toast(`${name} deleted`);
        }
        go('#/clubs', { replace: true });
      });
    });
  }

  const screen = clubScreen(el, clubId, draw, { back: [`#/club/${clubId}`, 'Club'] });
  return screen.cleanup;
}
