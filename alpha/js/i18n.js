// Languages. Every text the app shows or speaks lives in one place per language, under a key:
// lang/en.js is the master list (every key), lang/nl.js and others translate it. Screens only
// use keys: t('play.quick') → "Quick match" or "Snelle wedstrijd".
//
// A text can have placeholders, {name}, filled in from the values passed to t(), and forms by
// number: { one: '{n} player', other: '{n} players' }, chosen with the value count, else n.
//
// Which language: the one picked in You, else the device's (the browser's language list), else
// a guess from the time zone, else English.
//
// Adding a language: copy lang/en.js to lang/<code>.js, translate the texts (keep the keys and
// the {placeholders}), add it to LANGUAGES below and to the files in sw.js. tests/i18n.test.js
// checks that every key and placeholder is there.
import en from './lang/en.js';
import nl from './lang/nl.js';

export const LANGUAGES = {
  en: { name: 'English', locale: 'en-GB', strings: en },
  nl: { name: 'Nederlands', locale: 'nl-BE', strings: nl },
};
const FALLBACK = 'en';

// Time zones where nearly everyone reads one of our languages, for devices that don't say.
const TIME_ZONES = { 'Europe/Amsterdam': 'nl', 'Europe/Brussels': 'nl' };

// Pure, so it can be tested: the language to use.
export function chooseLanguage({ picked = '', languages = [], timeZone = '' } = {}) {
  if (LANGUAGES[picked]) return picked;
  for (const tag of languages) {
    const code = String(tag).toLowerCase().split(/[-_]/)[0];
    if (LANGUAGES[code]) return code;
  }
  return TIME_ZONES[timeZone] ?? FALLBACK;
}

let current = FALLBACK;
const listeners = new Set();

export const language = () => current;
export const locale = () => LANGUAGES[current].locale;
export const onLanguage = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };

// picked: a code from LANGUAGES, or '' for the device's language.
export function setLanguage(picked = '') {
  const next = chooseLanguage({
    picked,
    languages: globalThis.navigator?.languages ?? [globalThis.navigator?.language].filter(Boolean),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const changed = next !== current;
  current = next;
  if (globalThis.document) document.documentElement.lang = next;
  if (changed) listeners.forEach((cb) => cb(next));
}

const rules = {};
function form(value, n, code) {
  if (typeof value !== 'object' || value === null) return value;
  rules[code] ??= new Intl.PluralRules(LANGUAGES[code].locale);
  return value[rules[code].select(Number(n))] ?? value.other;
}

// The text for a key in the current language (English when it isn't translated yet; the key
// itself when it doesn't exist, so a missing text is visible instead of blank).
export function t(key, values = {}) {
  let code = current;
  let value = LANGUAGES[code].strings[key];
  if (value === undefined) {
    code = FALLBACK;
    value = LANGUAGES[FALLBACK].strings[key];
  }
  if (value === undefined) return key;
  const text = form(value, values.count ?? values.n ?? 1, code); // count wins when both are given
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

// A name that stands for more than one person ("Joris & Ann", "Tom and Lies") takes the plural
// verb: "Joris & Ann win", "Joris wins". Pass the result as count.
export const people = (name) => (/\s(&|\+|and|en|et|und)\s|\s*[&+,/]\s*/i.test(String(name)) ? 2 : 1);

// Fills in the static texts of the page: data-t="key" sets the text, data-t-label the
// aria-label, data-t-placeholder the placeholder.
export function translatePage(root = document) {
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll('[data-t-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.tLabel)));
  root.querySelectorAll('[data-t-placeholder]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.tPlaceholder)));
}
