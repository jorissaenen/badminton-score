// The sport picker and the rules a sport offers (points per game and match length; for tennis
// and padel: sets, deuce and the final set), shared by New match and the club screens.
import { SPORTS, sportOf, sportIcon, rulesFor } from '../sports.js';
import { html, raw } from '../ui.js';
import { t } from '../i18n.js';

export const sportName = (id) => t(`sport.${sportOf(id).id}`);

// A grid of the sports; `picked` is marked. Each tile has data-sport.
export const sportGrid = (picked) => html`<div class="sport-grid">${SPORTS.map((s) => html`
  <button type="button" class="sport-tile" data-sport="${s.id}" aria-pressed="${s.id === picked}">${raw(sportIcon(s.id, 30))}<span>${sportName(s.id)}</span></button>`)}</div>`;

// The rule chips for a sport, filled in from `options` (see rulesFor). `center` centres them.
export function rulesFields(sportId, options, { center = false, disabled = false } = {}) {
  const sp = sportOf(sportId);
  const r = rulesFor(sp.id, options);
  const chip = (key, value, label) => html`<button type="button" class="pick" data-rule="${key}" data-value="${String(value)}" aria-pressed="${r[key] === value}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  const section = (title, chips) => html`<section><h2 class="h3" ${center ? raw('style="justify-content:center"') : ''}>${title}</h2><div class="chips${center ? ' center' : ''}">${chips}</div></section>`;
  if (sp.scoring === 'tennis') {
    return html`${section(t('rules.match'), sp.bestOf.map((n) => chip('bestOf', n, n === 1 ? t('rules.oneSet') : t('rules.bestOfSets', { n }))))}
      ${section(t('rules.deuce'), [chip('golden', false, t('rules.advantage')), chip('golden', true, t('rules.golden'))])}
      ${r.bestOf > 1 ? section(t('rules.finalSet'), [chip('matchTiebreak', false, t('rules.fullSet')), chip('matchTiebreak', true, t('rules.matchTiebreak'))]) : ''}`;
  }
  return html`${section(t('rules.pointsPerGame'), sp.points.map((n) => chip('points', n, String(n))))}
    ${section(t('rules.match'), sp.bestOf.map((n) => chip('bestOf', n, n === 1 ? t('rules.oneGame') : t('rules.bestOf', { n }))))}`;
}

// Wires the chips: `change(key, value)` gets the new value (number or boolean).
export function wireRules(el, change) {
  el.querySelectorAll('[data-rule]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.value;
    change(b.dataset.rule, v === 'true' ? true : v === 'false' ? false : Number(v));
  }));
}

// One line about the rules: "21 points · best of 3", "Best of 3 sets · golden point".
export function rulesSummary(rules) {
  const sp = sportOf(rules.sport);
  if (sp.scoring === 'tennis') {
    return [rules.bestOf === 1 ? t('rules.oneSet') : t('rules.bestOfSets', { n: rules.bestOf }),
      rules.golden ? t('rules.golden') : null, rules.matchTiebreak && rules.bestOf > 1 ? t('rules.matchTiebreak') : null].filter(Boolean).join(' · ');
  }
  return `${t('rules.nPoints', { n: rules.points })} · ${rules.bestOf === 1 ? t('rules.oneGame') : t('rules.bestOf', { n: rules.bestOf })}`;
}
