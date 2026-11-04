// "Your sport isn't here?" (the last tile of the sport picker): type the sport you'd like Skoor to
// count. The server cleans the name up and puts names of the same sport together (soccer =
// football = voetbal), so the owner sees which sports are wished most (functions/sportwish.js).
// Works without an account. Sent along: a random id this device keeps (one wish per sport), the
// time zone (the region, never a precise place) and the language.
import { html, icon } from '../ui.js';
import { t, language } from '../i18n.js';
import { backBar } from './common.js';

const URL_WISH = 'https://europe-west1-badminton-dev-bc258.cloudfunctions.net/sportWish';
const DEVICE_KEY = 'skoor.wishDevice';

// A random id for this device, kept on it (never linked to a person).
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

export function show(el) {
  let name = '';
  let busy = false;
  let answer = null; // the server's answer, once sent
  let problem = '';

  const ready = () => name.trim().length >= 2;

  function draw() {
    const label = answer?.label?.[language()] ?? answer?.label?.en ?? '';
    const body = answer ? html`<div class="card pad wish-done">
        ${icon('check', 34)}
        <strong>${answer.counted ? t('wish.thanks') : t('wish.again')}</strong>
        <p class="sheet-text">${answer.supported ? t('wish.already', { sport: label }) : t('wish.countedAs', { sport: label })}</p>
      </div>
      ${answer.supported ? html`<a class="btn primary block" href="#/match/new">${t('wish.startGame')}</a>` : ''}
      <button type="button" class="btn block" data-another>${t('wish.another')}</button>`
      : html`<p class="sub">${t('wish.sub')}</p>
      <label class="field">${t('wish.label')}<input type="text" data-name maxlength="40" autocomplete="off" autocapitalize="words" placeholder="${t('wish.placeholder')}" value="${name}"></label>
      <button type="button" class="btn primary block" data-send ${!ready() || busy ? 'disabled' : ''}>${busy ? t('wish.sending') : t('wish.send')}</button>
      <p class="note" data-why>${problem || (ready() ? t('wish.private') : t('wish.typeFirst'))}</p>`;
    el.innerHTML = html`<div class="page">
      ${backBar('#/match/new', t('newMatch.title'))}
      <h1 class="title">${t('wish.title')}</h1>
      ${body}
    </div>`.s;
    const input = el.querySelector('[data-name]');
    input?.addEventListener('input', () => {
      name = input.value;
      problem = '';
      // Only the button and the line under it change: keep typing in the same field.
      const button = el.querySelector('[data-send]');
      if (button) button.disabled = !ready() || busy;
      const why = el.querySelector('[data-why]');
      if (why) why.textContent = ready() ? t('wish.private') : t('wish.typeFirst');
    });
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    el.querySelector('[data-send]')?.addEventListener('click', send);
    el.querySelector('[data-another]')?.addEventListener('click', () => { answer = null; name = ''; draw(); el.querySelector('[data-name]')?.focus(); });
  }

  async function send() {
    if (!ready() || busy) return;
    busy = true;
    draw();
    try {
      const r = await fetch(URL_WISH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport: name.trim(), device: deviceId(), source: 'app', lang: language(),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.label) answer = j;
      else problem = j.reason === 'busy' ? t('wish.busy') : j.reason === 'limit' ? t('wish.limit') : j.reason === 'invalid' ? t('wish.invalid') : t('wish.failed');
    } catch {
      problem = navigator.onLine === false ? t('wish.offline') : t('wish.failed');
    }
    busy = false;
    draw();
  }

  draw();
  el.querySelector('[data-name]')?.focus();
}
