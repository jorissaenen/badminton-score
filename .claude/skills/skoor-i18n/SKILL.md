---
name: skoor-i18n
description: Add or change texts in the Skoor app in English and Dutch together - keys, placeholders, plural forms, the house style for wording. Use whenever a change adds or edits text the user sees in alpha/.
---

# Texts in English and Dutch

All visible text comes from `alpha/js/lang/en.js` and `alpha/js/lang/nl.js` via
`t('area.key', { values })` (JS) or `data-t="area.key"` / `data-t-label` (HTML). Never hard-code
visible text in code or HTML (except the English fallback inside a `data-t` element).

## Adding a key

1. Add it to **both** files, in the same place (keys are grouped by area: `board.`, `event.`,
   `screen.`, `menu.`, `watch.`, …). Use an existing area's prefix.
2. Placeholders `{name}`, `{n}`, `{end}` must be identical in both languages.
3. Number forms: `{ one: '…', other: '…' }` in both files, with `count` passed to `t()`. For
   "Joris wins / Joris & Ann win" pass `count: people(name)`.
4. Removing a key: remove it from both files and check nothing uses it any more
   (`grep -rn "'area.key'" alpha`).
5. Run `npm test`: the i18n tests check keys, placeholders and number forms match.

## House style

- English is UK English: colour, centre, cancelled, organise, programme (a TV programme).
- Plain words a club player uses; no technical terms ("No connection", not "Network error 503";
  "Link a screen", not "Pair device"). Short: screens are read in a sports hall.
- Positive and concrete; say what to do next ("Start one on your phone, then choose it here").
- A disabled button gets a text saying why ("The event ended at 21:30: …").
- Titles on the board/TV are often shown in capitals by CSS: write them in normal case.
- Dutch: natural Flemish/Dutch as a club member speaks it ("je", not "u"); sports terms as used in
  Belgian clubs ("wedstrijd", "veld", "pauze", "van kant wisselen", "scoreteller").
- The brand is written **Skoor** in text (the logo spells SK00R).
