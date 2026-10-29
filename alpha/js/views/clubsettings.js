// Club settings: name, usual place, club match rules, seasons, and leaving or deleting the club.
import * as Club from '../club.js';
import { session } from '../session.js';
import { setLastClub } from '../links.js';
import { html, icon, sheet, confirmSheet, attempt, toast, dayText, raw } from '../ui.js';
import { clubScreen } from './clubview.js';
import { t } from '../i18n.js';
import { rulesFor, sportIcon } from '../sports.js';
import { rulesFields, wireRules, sportName } from './rules.js';

const fullDate = (iso) => dayText(iso, { day: 'numeric', month: 'short', year: 'numeric' });

export function show(el, [clubId], { go }) {
  const typed = {}; // fields being typed, kept across redraws

  function draw(v) {
    const { club, admin, myRole, seasons } = v;
    if (document.activeElement?.matches?.('.view input, .view textarea')) return; // don't redraw under typing
    const now = Club.currentSeason(seasons);
    const d = club.defaults ?? {};
    const sport = club.sport ?? 'badminton';
    const field = (key, label, value, placeholder, max = 60) => html`<label class="field">${label}
      <input type="text" data-field="${key}" maxlength="${max}" value="${typed[key] ?? value ?? ''}" placeholder="${placeholder}" ${admin ? '' : 'disabled'}></label>`;
    el.innerHTML = html`<div class="page">
      <div class="top"><a class="back" href="#/club/${clubId}">${icon('back', 22)}${club.name}</a></div>
      <h1 class="title">${t('clubSettings.title')}</h1>
      <section><h2 class="h3">${t('club.club')}</h2><div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        ${field('name', t('clubSettings.name'), club.name, t('create.name'))}
        ${field('place', t('clubSettings.place'), club.place, t('eventEdit.whereExample'), 80)}
        ${field('placeAddress', t('eventEdit.address'), club.placeAddress, t('eventEdit.addressExample'), 160)}
        <label class="field">${t('eventEdit.note')}<textarea data-field="placeNote" maxlength="280" rows="3" placeholder="${t('eventEdit.noteExample')}" ${admin ? '' : 'disabled'}>${typed.placeNote ?? club.placeNote ?? ''}</textarea></label>
        <p class="note" style="margin:-4px 0 0">${t('clubSettings.placeNote')}</p>
        ${admin ? html`<button type="button" class="btn primary" data-save-club>${t('common.save')}</button>` : html`<p class="note" style="margin:0">${t('clubSettings.adminsChange')}</p>`}
      </div></section>
      <section><h2 class="h3">${t('clubSettings.matches')}</h2><div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        <div class="row" style="padding:0;min-height:0">${raw(sportIcon(sport, 22))}<span class="grow"><strong>${sportName(sport)}</strong><small>${t('clubSettings.oneSport')}</small></span></div>
        ${rulesFields(sport, d, { disabled: !admin })}
      </div></section>
      <section><h2 class="h3">${t('season.seasons')}${admin ? html`<button type="button" data-add-season>${t('season.add')}</button>` : ''}</h2><div class="card">
        ${seasons.length ? seasons.map((s) => html`<button type="button" class="row" data-season="${s.id}" ${admin ? '' : raw('disabled style="cursor:default"')}>
            <span class="grow"><strong>${s.name}${s.id === now?.id ? html` <span class="chip light" style="margin-left:6px;padding:2px 8px">${t('season.current')}</span>` : ''}</strong>
            <small>${fullDate(s.start)} – ${fullDate(s.end)}</small></span>${admin ? icon('chevron', 18) : ''}</button>`)
          : html`<p class="empty">${t('season.none')}</p>`}
      </div><p class="note">${t('season.explain')}</p></section>
      <section><h2 class="h3">${t('clubSettings.leaveOrDelete')}</h2><div class="card">
        <button type="button" class="row danger" data-leave ${myRole === 'owner' ? raw('disabled style="opacity:.42;cursor:default"') : ''}>${t('clubSettings.leave', { club: club.name })}</button>
        <button type="button" class="row danger" data-delete ${myRole === 'owner' ? '' : raw('disabled style="opacity:.42;cursor:default"')}>${t('clubSettings.delete')}</button>
      </div><p class="note">${myRole === 'owner' ? t('clubSettings.ownerLeave') : t('clubSettings.ownerDeletes')}</p></section>
    </div>`.s;

    el.querySelectorAll('[data-field]').forEach((i) => {
      i.addEventListener('input', () => { typed[i.dataset.field] = i.value; });
      i.addEventListener('blur', () => setTimeout(() => screen.redraw(), 0));
    });
    el.querySelector('[data-save-club]')?.addEventListener('click', () => saveClub(v));
    wireRules(el, (key, value) => {
      const { sport: _sport, ...defaults } = rulesFor(sport, { ...d, [key]: value });
      attempt(Club.updateClub(clubId, { defaults }), t('common.saveFailed'));
    });
    el.querySelector('[data-add-season]')?.addEventListener('click', () => editSeason(v, null));
    el.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => editSeason(v, seasons.find((s) => s.id === b.dataset.season))));
    el.querySelector('[data-leave]').addEventListener('click', () => leave(v));
    el.querySelector('[data-delete]').addEventListener('click', () => remove(v));
  }

  async function saveClub(v) {
    const name = (typed.name ?? v.club.name).trim();
    const place = Object.fromEntries(['place', 'placeAddress', 'placeNote'].map((k) => [k, (typed[k] ?? v.club[k] ?? '').trim()]));
    const placeChanged = Object.keys(place).some((k) => place[k] !== (v.club[k] ?? ''));
    if (!name) { toast(t('clubSettings.needName')); return; }
    let ok = true;
    if (name !== v.club.name) ok = await attempt(Club.renameClub(session.user, clubId, name), t('clubSettings.renameFailed'));
    if (ok && placeChanged) ok = await attempt(Club.updateClub(clubId, place), t('clubSettings.placeFailed'));
    if (ok) {
      delete typed.name;
      delete typed.place;
      delete typed.placeAddress;
      delete typed.placeNote;
      toast(t('common.saved'));
      screen.redraw();
    }
  }

  function editSeason(v, season) {
    const values = season ?? Club.nextSeasonSuggestion(v.seasons);
    sheet(html`<h2 class="sheet-title">${season ? t('season.season') : t('season.add')}</h2>
      <label class="field">${t('clubSettings.name')}<input type="text" data-s="name" maxlength="40" value="${values.name}"></label>
      <div class="form-row"><label class="field">${t('season.starts')}<input type="date" data-s="start" value="${values.start}"></label>
        <label class="field">${t('season.ends')}<input type="date" data-s="end" value="${values.end}"></label></div>
      <button type="button" class="btn primary block" data-save>${season ? t('common.save') : t('season.addButton')}</button>
      ${season ? html`<button type="button" class="btn danger block" data-delete>${t('season.delete')}</button>` : ''}`.s, (sh, close) => {
      const val = (k) => sh.querySelector(`[data-s="${k}"]`).value.trim();
      sh.querySelector('[data-save]').addEventListener('click', async () => {
        const [name, start, end] = [val('name'), val('start'), val('end')];
        if (!name || !start || !end) { toast(t('season.needFields')); return; }
        if (end < start) { toast(t('season.endAfterStart')); return; }
        close();
        await attempt(season ? Club.updateSeason(clubId, season.id, { name, start, end }) : Club.addSeason(clubId, name, start, end), t('season.saveFailed'));
      });
      sh.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmSheet(t('season.deleteQ', { name: season.name }), t('season.deleteText'), t('common.delete'), true)) attempt(Club.deleteSeason(clubId, season.id), t('season.deleteFailed'));
      });
    });
  }

  async function leave(v) {
    if (v.myRole === 'owner') return;
    if (!(await confirmSheet(t('clubSettings.leaveQ', { club: v.club.name }), t('clubSettings.leaveText'), t('clubSettings.leaveButton'), true))) return;
    if (await attempt(Club.leave(session.user, clubId), t('clubSettings.leaveFailed'))) {
      setLastClub(null);
      go('#/clubs', { replace: true });
    }
  }

  function remove(v) {
    if (v.myRole !== 'owner') return;
    const name = v.club.name;
    sheet(html`<h2 class="sheet-title">${t('clubSettings.deleteQ', { club: name })}</h2>
      <p class="sheet-text">${t('clubSettings.deleteText')}</p>
      <input type="text" data-confirm autocomplete="off" placeholder="${name}">
      <button type="button" class="btn danger block" data-go disabled>${t('clubSettings.deleteButton')}</button>`.s, (sh, close) => {
      const input = sh.querySelector('[data-confirm]');
      const btn = sh.querySelector('[data-go]');
      input.addEventListener('input', () => { btn.disabled = input.value.trim() !== name; });
      btn.addEventListener('click', async () => {
        close();
        screen.cleanup();
        if (await attempt(Club.deleteClub(session.user, clubId), t('clubSettings.deleteFailed'))) {
          setLastClub(null);
          toast(t('clubSettings.deleted', { club: name }));
        }
        go('#/clubs', { replace: true });
      });
    });
  }

  const screen = clubScreen(el, clubId, draw, { back: [`#/club/${clubId}`, t('club.club')] });
  return screen.cleanup;
}
