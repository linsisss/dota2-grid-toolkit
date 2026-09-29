// Captures the editor picture the landing puts the most liked grid into (server/editor-showcase.mjs).
// Dev tool, run after editor UI changes:  npm i --no-save playwright-core && node scripts/capture-editor-template.cjs [site]
// Needs Chrome (CHROME=/path). Writes assets/landing/editor-template.png, editor-rows.png and editor-template.json.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const site = process.argv[2] || 'https://dev.gridstudio.me', out = join(__dirname, '../assets/landing');
// The landing stage screen is 1280:675. A 1440-px window keeps the interface readable at the
// stage's size; density 2 keeps it sharp. Measures are in CSS pixels.
const W = 1440, H = 760, DPR = 2;

async function openEditor(browser, file) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })).newPage();
  await page.goto(`${site}/editor?new=1`, { waitUntil: 'networkidle' }); await page.waitForSelector('#stage'); await page.waitForTimeout(1500);
  if (file) {
    await page.setInputFiles('#fileInput', file); await page.waitForTimeout(800);
    await page.click('#modal label:has-text("Открыть вместо текущих")'); await page.click('#confirmGridImport'); await page.waitForTimeout(2000);
  }
  await page.click('button:has-text("Настройки")'); await page.waitForTimeout(600);
  await page.mouse.click(5, 500); await page.waitForTimeout(4000); // toasts fade out
  await page.evaluate(() => { for (const node of document.querySelectorAll('#emptyCanvas, .toast, [role=status].toast')) node.remove(); });
  // The landing shows the grid more than the tools: the floating tool dock is folded to its icons.
  if (await page.locator('.dock-label-toggle[aria-pressed="false"]').count()) { await page.click('.dock-label-toggle'); await page.mouse.move(W - 5, H - 5); await page.waitForTimeout(600); }
  await page.waitForTimeout(300);
  return page;
}
const measure = (page) => page.evaluate(() => {
  const box = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const font = (node) => { const s = getComputedStyle(node); return { size: parseFloat(s.fontSize), weight: s.fontWeight, color: s.color, spacing: s.letterSpacing, transform: s.textTransform, family: s.fontFamily }; };
  const text = (node) => node && { box: box(node), font: font(node) };
  const heads = [...document.querySelectorAll('.layer-head')].map((head) => ({ name: head.querySelector('.layer-name span')?.textContent, box: box(head),
    count: text(head.querySelector('.item-count')), label: text(head.querySelector('.layer-name span')) }));
  const items = [...document.querySelectorAll('.layer-item')].filter((n) => n.offsetParent).map((item) => ({ name: item.querySelector('.item-name')?.textContent, box: box(item),
    icon: box(item.querySelector('svg')), label: text(item.querySelector('.item-name')), count: text(item.querySelector('.item-count')) }));
  const counter = document.querySelector('.category-counter');
  return { stage: box(document.querySelector('#stage')), caption: text(document.querySelector('#canvasName')),
    gridName: (() => { const n = [...document.querySelectorAll('span')].find((node) => node.offsetParent && node.textContent === document.querySelector('#canvasName').textContent && node.id !== 'canvasName');
      const field = n?.parentElement; return n && { ...text(n), field: box(field), arrow: box(field.querySelector('svg, [data-icon]')) }; })(),
    categories: text(counter?.querySelector('strong') || counter?.nextElementSibling), objectCount: text(document.querySelector('#objectCount')),
    layersTitle: box([...document.querySelectorAll('*')].find((n) => n.children.length === 0 && /^Слои и объекты$/i.test(n.textContent.trim()))),
    panel: box(document.querySelector('.inspector-panel')), heads, items, empty: text(document.querySelector('.layer-empty')),
    counterLabel: text(counter), optimize: box(document.querySelector('.optimize-trigger')),
    addGroup: box([...document.querySelectorAll('button')].find((n) => n.offsetParent && /Добавить группу героев/.test(n.textContent))) };
});

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const blank = await openEditor(browser), template = await measure(blank);
  await blank.screenshot({ path: join(out, 'editor-template.png') });
  // Row samples: a grid with texts, symbols and hero groups (tests/fixtures/editor-rows.json).
  const rich = await openEditor(browser, join(__dirname, '../tests/fixtures/editor-rows.json')), rows = await measure(rich);
  await rich.screenshot({ path: join(out, 'editor-rows.png') });
  // PNG → lossless WebP happens outside (cwebp -lossless), see docs/catalog.md.
  writeFileSync(join(out, 'editor-template.json'), JSON.stringify({ size: [W, H], dpr: DPR, site, captured: new Date().toISOString().slice(0, 10), template, rows }, null, 2));
  await browser.close();
  console.log('ok', JSON.stringify({ stage: template.stage, heads: template.heads.map((h) => h.name), rowHeads: rows.heads.map((h) => h.name), rowItems: rows.items.map((i) => i.name) }));
})();
