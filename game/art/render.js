// Renders the SVG art in ./svg with headless Chromium (Playwright).
//   node render.js board OUT.png   -> style board for review
//   node render.js export          -> PNGs into ../assets (2x the in-game size, for sharp hi-DPI display)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SVG_DIR = path.join(__dirname, 'svg');
const ASSETS = path.join(__dirname, '..', 'assets');
const svg = (name) => fs.readFileSync(path.join(SVG_DIR, `${name}.svg`), 'utf8');
const uri = (name) => 'data:image/svg+xml;base64,' + Buffer.from(svg(name)).toString('base64');
const SKY = 'linear-gradient(#5fb4ec, #a9dcf7 70%, #d3effc)';

function boardHtml() {
  const tilesRow = (n, name, y) => Array.from({ length: n }, (_, i) =>
    `<img src="${uri(name)}" style="position:absolute;left:${i * 32}px;top:${y}px;width:32px;height:32px">`).join('');
  const step = [0, 1, 2].map((i) =>
    `<img src="${uri('grass')}" style="position:absolute;left:${320 + i * 32}px;top:172px;width:32px;height:32px">` +
    `<img src="${uri('dirt')}" style="position:absolute;left:${320 + i * 32}px;top:204px;width:32px;height:32px">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#161c2b;color:#eef1f8;font-family:"DejaVu Sans",sans-serif;width:1200px;height:740px;position:relative}
    h1{position:absolute;left:40px;top:22px;margin:0;font-size:30px}
    .sub{position:absolute;left:40px;top:66px;color:#a7b0c7;font-size:16px}
    .lab{position:absolute;color:#a7b0c7;font-size:14px;font-weight:bold;letter-spacing:.04em}
    .card{position:absolute;border-radius:12px;overflow:hidden}
    .note{position:absolute;left:40px;width:620px;font-size:15px;line-height:1.45}
  </style></head><body>
    <h1>Coin Hopper · glossy 3D style target</h1>
    <div class="sub">Smooth vector art · soft gradients and one glossy highlight per object · light from the top-left · navy outline on characters</div>

    <div class="lab" style="left:40px;top:118px">HERO (enlarged)</div>
    <div class="card" style="left:40px;top:142px;width:260px;height:340px;background:${SKY}">
      <img src="${uri('player')}" style="position:absolute;left:18px;top:22px;width:224px;height:256px">
      <div style="position:absolute;left:60px;top:282px;width:140px;height:18px;border-radius:50%;background:radial-gradient(#0003,#0000 70%)"></div>
    </div>

    <div class="lab" style="left:330px;top:118px">GRASS TILE</div>
    <img src="${uri('grass')}" style="position:absolute;left:330px;top:142px;width:160px;height:160px;border-radius:8px">
    <div class="lab" style="left:510px;top:118px">DIRT TILE</div>
    <img src="${uri('dirt')}" style="position:absolute;left:510px;top:142px;width:160px;height:160px;border-radius:8px">
    <div class="lab" style="left:330px;top:322px">TILES REPEATED</div>
    <div class="card" style="left:330px;top:346px;width:340px;height:136px">
      ${[0,1,2,3].map(c => `<img src="${uri('grass')}" style="position:absolute;left:${c*85}px;top:0;width:85px;height:85px">`).join('')}
      ${[0,1,2,3].map(c => `<img src="${uri('dirt')}" style="position:absolute;left:${c*85}px;top:85px;width:85px;height:85px">`).join('')}
    </div>

    <div class="lab" style="left:700px;top:118px">IN GAME (actual size)</div>
    <div class="card" style="left:700px;top:142px;width:460px;height:268px;background:${SKY}">
      ${tilesRow(15, 'grass', 204)}${tilesRow(15, 'dirt', 236)}${step}
      <img src="${uri('player')}" style="position:absolute;left:120px;top:172px;width:28px;height:32px">
    </div>
    <div class="lab" style="left:700px;top:424px">IN GAME, ZOOMED 2×</div>
    <div class="card" style="left:700px;top:448px;width:460px;height:200px;background:${SKY}">
      <div style="position:absolute;left:0;top:0;width:230px;height:100px;transform:scale(2);transform-origin:0 0">
        ${tilesRow(8, 'grass', 68)}
        <img src="${uri('player')}" style="position:absolute;left:60px;top:36px;width:28px;height:32px">
        <img src="${uri('player')}" style="position:absolute;left:150px;top:22px;width:28px;height:32px;transform:scaleX(-1) rotate(-8deg)">
      </div>
    </div>

    <div class="note" style="top:510px;color:#eef1f8">Do: rounded, chunky shapes · one soft highlight top-left · darker tone toward the bottom-right · light rim on the shadow side</div>
    <div class="note" style="top:562px;color:#eef1f8">Do: characters get a navy outline so they pop off the background; tiles stay outline-free</div>
    <div class="note" style="top:614px;color:#a7b0c7">Don't: photo textures, hard black outlines, more than one highlight per shape, detail too fine to read at 32 px</div>
  </body></html>`;
}

(async () => {
  const [mode, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  if (mode === 'board') {
    const page = await browser.newPage({ viewport: { width: 1200, height: 680 }, deviceScaleFactor: 2 });
    await page.setContent(boardHtml());
    await page.waitForTimeout(300);
    await page.screenshot({ path: out });
    console.log('wrote', out);
  } else if (mode === 'export') {
    fs.mkdirSync(ASSETS, { recursive: true });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const file of fs.readdirSync(SVG_DIR).filter((f) => f.endsWith('.svg'))) {
      const name = file.replace(/\.svg$/, '');
      const m = svg(name).match(/width="(\d+)" height="(\d+)"/);
      const [w, h] = [Number(m[1]), Number(m[2])];
      await page.setViewportSize({ width: w, height: h });
      await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${uri(name)}" width="${w}" height="${h}" style="display:block"></body></html>`);
      await page.waitForTimeout(50);
      await page.screenshot({ path: path.join(ASSETS, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
      console.log('wrote', `${name}.png`, `${w}x${h}`);
    }
  }
  await browser.close();
})();
