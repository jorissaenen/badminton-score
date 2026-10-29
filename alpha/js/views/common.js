// Pieces several screens share: the top bar with a back link, event texts, the answer buttons
// (Going / Not going) and the card that asks to sign in.
import * as Club from '../club.js';
import { session } from '../session.js';
import { html, icon, initials, dayText, longDay, toast } from '../ui.js';

export const backBar = (href, label, right = '') => html`<div class="top"><a class="back" href="${href}">${icon('back', 22)}${label}</a>${right}</div>`;

export const isToday = (iso) => iso === Club.isoDate(new Date());
export const isTomorrow = (iso) => iso === Club.isoDate(new Date(Date.now() + 86400_000));
export const dayName = (iso, long = false) => (isToday(iso) ? 'Today' : isTomorrow(iso) ? 'Tomorrow' : long ? longDay(iso) : dayText(iso));
export const eventName = (e) => Club.EVENT_TYPES[e?.type] ?? 'Event';
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function counts(regs = {}) {
  const all = Object.values(regs);
  return { going: all.filter((r) => r.status === 'going').length, notGoing: all.filter((r) => r.status === 'not going').length };
}

// The monogram of a club: its initials, white for the first club.
export const mono = (name, light = false) => html`<span class="mono${light ? ' light' : ''}" aria-hidden="true">${initials(name)}</span>`;

// Going / Not going. Tapping your answer again clears it. Disabled with the reason when you
// can't answer yet.
export function answerButtons(status, disabledReason = '') {
  return html`<div class="answer">
      <button type="button" class="going" data-answer="going" aria-pressed="${status === 'going'}" ${disabledReason ? 'disabled' : ''}>Going</button>
      <button type="button" class="notgoing" data-answer="not going" aria-pressed="${status === 'not going'}" ${disabledReason ? 'disabled' : ''}>Not going</button>
    </div>${disabledReason ? html`<p class="note">${disabledReason}</p>` : ''}`;
}

export function wireAnswers(el, { clubId, eventId, playerId, current, note = () => '' }) {
  el.querySelectorAll('[data-answer]').forEach((b) => b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const next = current() === b.dataset.answer ? null : b.dataset.answer;
    try {
      await Club.register(session.user, clubId, eventId, playerId, next, next === 'not going' ? note() : '');
    } catch (e) {
      toast(`Couldn’t save your answer (${e.code || e.message})`);
    }
  }));
}

export const NO_PLAYER = 'To answer, link yourself to a player first: open the club → People → That’s me.';

// The next event of all your clubs, with your answer. Null when there is none.
export async function nextOfAllClubs(user) {
  const clubs = await Club.myClubs(user);
  const found = await Promise.all(clubs.map(async (c) => {
    const event = await Club.nextEvent(c.id).catch(() => null);
    return event ? { club: c, event } : null;
  }));
  const next = found.filter(Boolean).sort((a, b) => a.event.startsAt.toMillis() - b.event.startsAt.toMillis())[0];
  if (!next) return null;
  const player = await Club.myPlayer(user, next.club.id).catch(() => null);
  return { ...next, player };
}

export const signInCard = (text) => html`<div class="card pad" style="display:flex;flex-direction:column;gap:14px">
    <p class="sheet-text" style="margin:0">${text}</p>
    <a class="btn primary" href="#/signin">Sign in</a></div>`;

export const spinner = () => html`<div class="spinner" role="status" aria-label="Loading"></div>`;

// Not available in this edition (no Firebase set up).
export const noCloud = () => !session.enabled;
