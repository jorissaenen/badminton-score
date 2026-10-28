# Skoor logo

The name is **Skoor**, always written that way in text. The logo writes it as **SK00R**: the two
o's are two green flip tiles showing 0–0, the score every match starts with. Decision: D1 in
[docs/decisions.md](../docs/decisions.md).

All files are pure shapes: they need no font and look the same everywhere.

## Files

| File | Use |
|---|---|
| `skoor-logo-on-dark.svg` | Main logo on black or dark backgrounds: white letters, green tiles |
| `skoor-logo-on-light.svg` | Main logo on white or light backgrounds: black letters, green tiles |
| `skoor-logo-black.svg` | One colour, black (print, stamps, documents); the 0s and lines are cut out |
| `skoor-logo-white.svg` | One colour, white, for photos and coloured backgrounds |
| `skoor-icon.svg` | App icon with rounded corners (desktop install, store mock-ups) |
| `skoor-icon-square.svg` | App icon without corners (platforms that round it themselves) |
| `skoor-icon-maskable.svg` | Android adaptive icon: the tiles inside the 80 % safe zone |
| `skoor-favicon.svg` | Browser tab: two plain green blocks, as digits don't survive 16 px |
| `png/` | PWA sizes: `icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-180`, `favicon-32`, `favicon-16` |
| `png/alpha/`, `png/beta/` | The same app icons with an α or β badge for the test editions |

## Specification

- **Letters:** Barlow Condensed ExtraBold (800), letter spacing 12 % of the font size.
- **Tiles:** width 0.74 × font size, height 1.12 × font size, corner radius 0.12 × font size,
  6 % gap between the two tiles. Tiles are centred on the capital height, so the split line runs
  through the middle of the letters.
- **0 and split line:** black, line thickness 0.036 × font size.
- **Colours:** green `#22c55e`, black `#000000`, white `#fafafa`.
- **App icon:** the same two tiles on black; each tile is 41 % of the icon wide and 60 % high.
- **Smallest sizes:** wordmark at least 72 px wide on screen; below 24 px use the favicon (blocks
  without digits).
- **Don't:** change the colours of the tiles, add effects or shadows, stretch the logo, or write
  the 00 in running text.

## Regenerating

The files are generated from the font outlines, so a change to the spec is one edit away:

```
python3 -I brand/tools/gen.py BarlowCondensed-ExtraBold.ttf brand
node brand/tools/render.js brand
```

`gen.py` needs `fonttools`; `render.js` needs Playwright with Chromium. The font is not in the
repository: download Barlow Condensed ExtraBold from Google Fonts. Barlow is licensed under the
SIL Open Font License 1.1 (Copyright 2017 The Barlow Project Authors), which allows using its
outlines in a logo.
