// Plan an event, or edit one. A weekly event is planned as a series of dates, each of which can be
// changed or cancelled on its own later; editing a date of a series asks: this date, or all
// upcoming dates?
import * as Club from '../club.js';
import { session } from '../session.js';
import { choiceFor, describeReminder, remindAt, reminderChoices } from '../reminder.js';
import { html, icon, choose, toast, dayText } from '../ui.js';
import { clubScreen } from './clubview.js';
import { t } from '../i18n.js';
import { eventName } from './common.js';

export function show(el, [clubId, eventId], { go }) {
  const editing = Boolean(eventId);
  let original; // the event being edited (undefined: loading)
  let f = null; // the form's values
  let busy = false;
  let view = null;
  let closed = false;

  function fresh(v) {
    const season = Club.currentSeason(v.seasons);
    const until = season?.end && season.end > Club.isoDate(new Date()) ? season.end : Club.isoDate(new Date(Date.now() + 90 * 86400_000));
    return {
      type: 'training', date: Club.isoDate(new Date()), start: '20:00', end: '21:30', courts: 2,
      location: v.club.place ?? '', weekly: false, until, untilIsSeason: until === season?.end,
      choice: 'smart', otherDays: 0, otherTime: '09:00',
    };
  }

  function fromEvent(e) {
    const choice = choiceFor(e.reminder, e.date, e.start);
    return {
      type: e.type, date: e.date, start: e.start, end: e.end, courts: e.courts ?? 2, location: e.location ?? '',
      weekly: false, choice, otherDays: e.reminder?.daysBefore ?? 0, otherTime: e.reminder?.time ?? '09:00',
    };
  }

  const reminder = () => {
    if (f.choice === 'none') return null;
    if (f.choice === 'other') return { daysBefore: f.otherDays, time: f.otherTime || '09:00' };
    return reminderChoices(f.date, f.start)[f.choice].reminder;
  };

  function draw(v) {
    view = v;
    if (!v.admin) {
      el.innerHTML = html`<div class="page">${top()}<div class="card"><p class="empty">${t('club.adminsPlan')}</p></div></div>`.s;
      return;
    }
    if (editing && original === undefined) { load(); el.innerHTML = html`<div class="page">${top()}</div>`.s; return; }
    if (editing && original === null) {
      el.innerHTML = html`<div class="page">${top()}<div class="card"><p class="empty">${t('event.gone')}</p></div></div>`.s;
      return;
    }
    if (!f) f = editing ? fromEvent(original) : fresh(v);
    if (document.activeElement?.closest?.('.view input, .view select')) return; // don't redraw under typing
    render();
  }

  const top = () => html`<div class="top"><a class="back" href="${editing ? `#/club/${clubId}/event/${eventId}` : `#/club/${clubId}`}">${icon('back', 22)}${t('common.cancel')}</a></div>`;

  function render() {
    const choices = reminderChoices(f.date, f.start);
    const dates = f.weekly && f.until >= f.date ? Club.weeklyDates(f.date, f.until).length : 0;
    const weekday = dayText(f.date, { weekday: 'long' });
    el.innerHTML = html`<div class="page">
      ${top()}
      <h1 class="title">${editing ? t('eventEdit.edit') : t('eventEdit.plan')}</h1>
      <section><h2 class="h3">${t('eventEdit.what')}</h2><div class="chips">${Club.EVENT_TYPES.map((k) => html`<button type="button" class="pick" data-type="${k}" aria-pressed="${f.type === k}">${eventName({ type: k })}</button>`)}</div></section>
      <section><h2 class="h3">${t('eventEdit.when')}</h2><div class="card pad" style="display:flex;flex-direction:column;gap:12px">
        <label class="field">${t('eventEdit.date')}<input type="date" data-f="date" value="${f.date}"></label>
        <div class="form-row"><label class="field">${t('eventEdit.from')}<input type="time" data-f="start" value="${f.start}"></label><label class="field">${t('eventEdit.until')}<input type="time" data-f="end" value="${f.end}"></label></div>
      </div>
      ${editing ? '' : html`<div class="card" style="margin-top:10px">
        <label class="switch"><span>${t('eventEdit.everyWeek')}<small>${f.weekly ? t('eventEdit.nDates', { n: dates, weekday }) : t('eventEdit.repeatEvery', { weekday })}</small></span><input type="checkbox" data-weekly ${f.weekly ? 'checked' : ''}></label>
        ${f.weekly ? html`<div class="pad" style="padding:0 16px 14px"><label class="field">${f.untilIsSeason ? t('eventEdit.untilSeasonEnd') : t('eventEdit.until')}<input type="date" data-f="until" value="${f.until}"></label></div>` : ''}
      </div>`}</section>
      <section><h2 class="h3">${t('eventEdit.where')}</h2>
        <input type="text" data-f="location" value="${f.location}" maxlength="80" placeholder="${t('eventEdit.whereExample')}" style="margin-top:0"></section>
      <section><h2 class="h3">${t('eventEdit.courts')}</h2><div class="card row"><span class="grow">${t('eventEdit.courts')}</span>
        <span class="stepper"><button type="button" class="round" data-courts="-1" aria-label="${t('eventEdit.courtLess')}" ${f.courts <= 1 ? 'disabled' : ''}>−</button>
        <span class="display" style="font-size:26px;min-width:24px;text-align:center">${f.courts}</span>
        <button type="button" class="round" data-courts="1" aria-label="${t('eventEdit.courtMore')}" ${f.courts >= 20 ? 'disabled' : ''}>+</button></span></div></section>
      <section><h2 class="h3">${t('eventEdit.reminder')}</h2><div class="card" role="radiogroup">
        ${Object.entries(choices).map(([k, c]) => html`<button type="button" class="radio-row" role="radio" data-choice="${k}" aria-checked="${f.choice === k}"><span class="radio"></span>
          <span><strong>${c.label}</strong>${k === 'smart' ? html`<small>${f.start >= '12:00' ? t('reminder.smartMorning') : t('reminder.smartEvening')}</small>` : ''}</span></button>`)}
        ${f.choice === 'other' ? html`<div class="form-row" style="padding:0 16px 14px">
          <label class="field">${t('eventEdit.day')}<select data-f="otherDays">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => html`<option value="${n}" ${f.otherDays === n ? 'selected' : ''}>${n === 0 ? t('reminder.sameDay') : n === 1 ? t('reminder.dayBefore') : t('reminder.nDaysBefore', { n })}</option>`)}</select></label>
          <label class="field">${t('eventEdit.time')}<input type="time" data-f="otherTime" value="${f.otherTime}"></label></div>` : ''}
      </div><p class="note">${f.date ? describeReminder(f.date, reminder()) : ''}</p></section>
      <button type="button" class="btn primary block" data-save ${busy ? 'disabled' : ''}>${busy ? t('common.saving') : editing ? t('common.save') : dates > 1 ? t('eventEdit.planNDates', { n: dates }) : t('eventEdit.planButton')}</button>
    </div>`.s;

    el.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { f.type = b.dataset.type; render(); }));
    el.querySelectorAll('[data-f]').forEach((input) => {
      const key = input.dataset.f;
      input.addEventListener('input', () => { f[key] = key === 'otherDays' ? Number(input.value) : input.value; if (key === 'until') f.untilIsSeason = false; });
      // Dates and times change the texts around them: redraw once the field is done.
      if (key !== 'location') input.addEventListener('change', () => { input.blur(); render(); });
    });
    el.querySelector('[data-weekly]')?.addEventListener('change', (e) => { f.weekly = e.target.checked; render(); });
    el.querySelectorAll('[data-courts]').forEach((b) => b.addEventListener('click', () => { f.courts = Math.min(20, Math.max(1, f.courts + Number(b.dataset.courts))); render(); }));
    el.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => { f.choice = b.dataset.choice; render(); }));
    el.querySelector('[data-save]').addEventListener('click', save);
  }

  async function save() {
    if (busy) return;
    const e = {
      type: f.type, date: f.date, start: f.start, end: f.end, courts: f.courts,
      location: f.location.trim(), reminder: reminder(),
    };
    const until = !editing && f.weekly ? f.until : null;
    if (!e.date || !e.start || !e.end) { toast(t('eventEdit.needTimes')); return; }
    if (e.end <= e.start) { toast(t('eventEdit.endAfterStart')); return; }
    if (!editing && f.weekly && (!until || until < e.date)) { toast(t('eventEdit.needUntil')); return; }
    const at = remindAt(e.date, e.reminder);
    if (at && at >= Club.startsAt(e.date, e.start)) { toast(t('eventEdit.reminderBefore')); return; }
    if (editing && !Club.changedFields(original, e).length) { go(`#/club/${clubId}/event/${eventId}`, { replace: true }); return; }
    const scope = editing && original.seriesId ? await choose(t('eventEdit.scopeQ'), t('eventEdit.scopeText'), [
      { label: t('eventEdit.scopeOne'), value: 'one', style: 'primary' },
      { label: t('eventEdit.scopeAll'), value: 'all' },
    ]) : 'one';
    if (!scope) return;
    busy = true;
    render();
    try {
      if (!editing) {
        const n = await Club.addEvents(session.user, clubId, e, until);
        toast(t('eventEdit.planned', { n }));
        go(`#/club/${clubId}`, { replace: true });
      } else {
        if (scope === 'all') {
          const n = await Club.updateSeries(clubId, original, e);
          toast(t('eventEdit.datesChanged', { n }));
        } else {
          await Club.updateEvent(clubId, original, e);
          toast(t('eventEdit.changed'));
        }
        go(`#/club/${clubId}/event/${eventId}`, { replace: true });
      }
    } catch (err) {
      busy = false;
      render();
      toast(t('common.saveFailedError', { error: err.code || err.message }));
    }
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      original = await Club.getEvent(clubId, eventId);
    } catch {
      original = null;
    }
    if (!closed && view) draw(view);
  }

  const screen = clubScreen(el, clubId, draw);
  return () => { closed = true; screen.cleanup(); };
}
