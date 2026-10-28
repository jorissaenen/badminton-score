// Render the Skoor SVGs to the PNG sizes a PWA needs, plus α and β edition variants.
// Usage: node brand/tools/render.js <brand_dir>
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = process.argv[2];
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const dataUrl = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

// [file, source svg, size, transparent background]
const targets = [
  ['icon-192.png', 'skoor-icon.svg', 192, true],
  ['icon-512.png', 'skoor-icon.svg', 512, true],
  ['icon-maskable-512.png', 'skoor-icon-maskable.svg', 512, false],
  ['apple-touch-180.png', 'skoor-icon-square.svg', 180, false],
  ['favicon-32.png', 'skoor-favicon.svg', 32, true],
  ['favicon-16.png', 'skoor-favicon.svg', 16, true],
];

// Edition badge: a white disc with α or β in the lower right corner, like the current icons.
// A maskable icon is cropped to a circle (the safe zone is the middle 80 %), so its badge sits further in.
function page(svg, size, badge, maskable) {
  const inset = size * (maskable ? 0.19 : 0.04);
  const b = badge
    ? `<div style="position:absolute;right:${inset}px;bottom:${inset}px;width:${size * 0.3}px;height:${size * 0.3}px;border-radius:50%;background:#fafafa;box-shadow:0 0 0 ${size * 0.025}px #000;display:flex;align-items:center;justify-content:center;font:700 ${size * 0.2}px/1 'DejaVu Sans',sans-serif;color:#000">${badge}</div>`
    : '';
  return `<html><body style="margin:0;background:transparent"><div style="position:relative;width:${size}px;height:${size}px"><img src="${dataUrl(svg)}" style="display:block;width:${size}px;height:${size}px">${b}</div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  for (const [edition, badge] of [['', null], ['alpha', 'α'], ['beta', 'β']]) {
    const out = path.join(dir, 'png', edition);
    fs.mkdirSync(out, { recursive: true });
    for (const [file, src, size, transparent] of targets) {
      // Favicons stay unbadged: a badge cannot be read at 16 or 32 px.
      if (badge && file.startsWith('favicon')) continue;
      const p = await browser.newPage({ viewport: { width: size, height: size } });
      await p.setContent(page(read(src), size, badge, file.includes('maskable')));
      await p.screenshot({ path: path.join(out, file), omitBackground: transparent });
      await p.close();
    }
  }
  await browser.close();
  console.log('rendered');
})();
