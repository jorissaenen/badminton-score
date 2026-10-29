// Screens at the venue, from the phone of a score keeper, admin or owner: the screens linked to an
// event, linking one with its key (or QR code), choosing what it shows (one court or table, or the
// overview), its sound and notices, which side each team is on, and unlinking it.
import * as Club from '../club.js';
import { session } from '../session.js';
import { sportOf } from '../sports.js';
import { html, icon, sheet, toast, attempt, raw } from '../ui.js';
import { t } from '../i18n.js';

export const canLinkScreens = (role) => ['owner', 'admin', 'keeper'].includes(role);

const courtWord = (sport, n) => t(sportOf(sport).id === 'tabletennis' ? 'screen.tableN' : 'screen.courtN', { n });
export const screenLabel = (s, sport) => (s.mode === 'overview' ? t('screen.overview') : courtWord(sport, s.court));

function seen(s) {
  const at = s.lastSeen?.toMillis?.() ?? s.linkedAt?.toMillis?.();
  if (!at) return t('screen.justLinked');
  const min = Math.round((Date.now() - at) / 60_000);
  return min < 7 ? t('screen.on') : t('screen.seenMinutesAgo', { n: min });
}

export const screensSection = (screens, sport) => html`<section><h2 class="h3">${t('screen.screens')}</h2><div class="card">
    ${screens.map((s) => html`<button type="button" class="row" data-screen="${s.id}">${icon('screen', 20)}<span class="grow"><strong>${screenLabel(s, sport)}</strong>
      <small>${s.announce ? t('screen.callsOn') : t('screen.callsOff')} · ${seen(s)}</small></span>${icon('chevron', 18)}</button>`)}
    <button type="button" class="row" data-link-screen>${icon('plus', 20)}<span class="grow"><strong>${t('screen.link')}</strong><small>${t('screen.linkSub')}</small></span></button>
  </div></section>`;

// What a court screen does besides the score: score calls, a beep at every point, the interval and
// change of ends, and left and right swapped (for a screen on the other side of the court). Also
// in the match menu, for the screens on the court being scored. Only for one court, not the overview.
export const SCREEN_SETTINGS = ['announce', 'beep', 'notices', 'flip'];
export const screenSwitches = (values, off = false) => html`${SCREEN_SETTINGS.map((key) => html`<label class="switch"><span>${t(`screen.set.${key}`)}<small>${off ? t('screen.set.courtOnly') : t(`screen.set.${key}Sub`)}</small></span>
    <input type="checkbox" data-screen-set="${key}" ${values[key] ? 'checked' : ''} ${off ? raw('disabled') : ''}></label>`)}`;

export function wireScreens(el, screens, ctx) {
  el.querySelector('[data-link-screen]')?.addEventListener('click', () => screenSheet({ ...ctx }));
  el.querySelectorAll('[data-screen]').forEach((b) => b.addEventListener('click', () => screenSheet({ ...ctx, screen: screens.find((s) => s.id === b.dataset.screen) })));
}

// Link a screen (with its key), or change a linked one. ctx: { clubId, eventId, courts, sport,
// key?, screen?, done? }.
export function screenSheet(ctx) {
  const s = ctx.screen;
  const pick = { mode: s?.mode ?? 'court', court: s?.court ?? 1, announce: s?.announce ?? false, beep: s?.beep ?? false, notices: s?.notices ?? true, flip: s?.flip ?? false };
  const courts = Math.max(1, ctx.courts ?? 1);
  const draw = () => html`<h2 class="sheet-title">${s ? screenLabel(s, ctx.sport) : t('screen.link')}</h2>
    ${s || ctx.key ? '' : html`<label class="field">${t('screen.keyLabel')}<input type="text" data-key maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false"
      placeholder="ABC 234" style="font-family:var(--display);font-size:28px;letter-spacing:.2em;text-transform:uppercase"></label>
      <p class="note" style="margin:0">${t('screen.keyHelp')}</p>`}
    <section><div class="h3">${t('screen.shows')}</div><div class="chips">
      <button type="button" class="pick" data-mode="court" aria-pressed="${pick.mode === 'court'}">${t(sportOf(ctx.sport).id === 'tabletennis' ? 'screen.oneTable' : 'screen.oneCourt')}</button>
      <button type="button" class="pick" data-mode="overview" aria-pressed="${pick.mode === 'overview'}">${t('screen.overview')}</button></div></section>
    ${pick.mode === 'court' ? html`<section><div class="chips">${Array.from({ length: courts }, (_, i) => i + 1).map((n) => html`<button type="button" class="pick" data-court="${n}" aria-pressed="${pick.court === n}">${courtWord(ctx.sport, n)}</button>`)}</div></section>` : ''}
    <div class="card">${screenSwitches(pick, pick.mode !== 'court')}</div>
    <button type="button" class="btn primary block" data-save>${s ? t('common.save') : t('screen.linkButton')}</button>
    ${s ? html`<button type="button" class="btn danger block" data-unlink>${t('screen.unlink')}</button>` : ''}`.s;

  sheet(draw(), (el, close) => {
    let typed = '';
    const wire = () => {
      const input = el.querySelector('[data-key]');
      if (input) {
        input.value = typed;
        input.addEventListener('input', () => { typed = Club.cleanKey(input.value); });
      }
      el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { pick.mode = b.dataset.mode; redraw(); }));
      el.querySelectorAll('[data-court]').forEach((b) => b.addEventListener('click', () => { pick.court = Number(b.dataset.court); redraw(); }));
      el.querySelectorAll('[data-screen-set]').forEach((input) => input.addEventListener('change', () => { pick[input.dataset.screenSet] = input.checked; }));
      el.querySelector('[data-save]').addEventListener('click', save);
      el.querySelector('[data-unlink]')?.addEventListener('click', async () => {
        close();
        if (await attempt(Club.unlinkScreen(s.id), t('common.saveFailed'))) toast(t('screen.unlinked'));
      });
    };
    const redraw = () => {
      el.innerHTML = `<span class="grip" aria-hidden="true"></span>${draw()}`;
      wire();
    };
    async function save() {
      const court = pick.mode === 'court';
      const link = { clubId: ctx.clubId, eventId: ctx.eventId, mode: pick.mode, court: pick.court, announce: court && pick.announce, beep: court && pick.beep, notices: pick.notices, flip: pick.flip };
      try {
        if (s) {
          await Club.changeScreen(session.user, s.id, { mode: link.mode, court: court ? link.court : null, announce: link.announce, beep: link.beep, notices: link.notices, flip: link.flip });
          toast(t('common.saved'));
        } else {
          const key = ctx.key ?? typed;
          if (key.length !== 6) { toast(t('screen.typeKey')); return; }
          const screenId = await Club.screenForKey(key);
          if (!screenId) { toast(t('screen.badKey')); return; }
          await Club.linkScreen(session.user, screenId, key, link);
          toast(t('screen.linked'));
        }
        close();
        ctx.done?.();
      } catch (e) {
        toast(t('screen.linkFailed', { error: e.code || e.message }));
      }
    }
    wire();
    setTimeout(() => el.querySelector('[data-key]')?.focus(), 250);
  });
}
