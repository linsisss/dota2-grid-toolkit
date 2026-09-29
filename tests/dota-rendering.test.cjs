const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const { DOTA, portraitSourceRect } = require('../scripts/dota-rendering.mjs');
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('target portrait excludes the screenshot nameplate without stretching or changing other heroes', () => {
  const hero = require('../scripts/data.mjs').default.heroes.find(hero => hero.id === 127);
  const [x, y, w, h] = portraitSourceRect({ width: 292, height: 400 }, 58, 100, hero.portraitCrop);
  assert.ok(x >= 2 && y >= 6 && x + w <= 288 && y + h <= 350);
  near(w / h, 58 / 100);
  portraitSourceRect({ width: 256, height: 144 }, 60, 100).forEach((value, i) => near(value, [84.8, 0, 86.4, 144][i]));
});

test('custom grid labels use the normal Dota category style, not NewPlayerPool', () => {
  // HeroCategoryName in the supplied hero_grid_new.vcss_c declares 16px; on screen the
  // labels measure 15.15 grid units (see the calibration test below).
  assert.equal(DOTA.fontSize, 15.15);
  assert.equal(DOTA.fontWeight, 600);
  assert.equal(DOTA.letterSpacing, 2);
  assert.equal(DOTA.listPadding, 4);
  assert.equal(DOTA.labelColor, '#808fa6');
});

test('height-limited hero groups pack all fitting columns, including the seventh Strength column', () => {
  const layout = C.heroLayout({ w: 250, h: 340, heroIds: Array(36).fill(1) });
  assert.equal(layout.cols, 7);
  assert.equal(layout.rows, 6);
  near(layout.scale, 2 / 3);
  assert.ok(layout.cols * layout.stepX <= 242);
  assert.ok((layout.cols + 1) * layout.stepX > 242);
});

test('reference group reproduces the game screenshot card size and pitch', () => {
  const group = {
    type: 'heroes',
    x: 321.739136,
    y: 43.47826,
    w: 488.695648,
    h: 132.17392,
    heroIds: [25, 76, 90, 106, 128]
  };
  const layout = C.heroLayout(group);
  assert.equal(layout.cols, 5);
  assert.equal(layout.rows, 1);
  // Measured game screenshot at 115%: 74 × 129 portraits, 88 px pitch.
  near(layout.cardW * 1.15, 74, 0.2);
  near(layout.cardH * 1.15, 129, 0.1);
  near(layout.stepX * 1.15, 88, 0.3);
  near(layout.left, 9.984285301204819);
  assert.equal(C.visualHeight(group), group.h + 20);
});

test('compact groups scale image margins along with the portraits', () => {
  const large = C.heroLayout({ w: 500, h: 146.08696, heroIds: [128, 71, 111, 131] });
  const compact = C.heroLayout({ w: 172.17392, h: 76.521767, heroIds: [61, 92, 136, 73, 38] });
  assert.equal(large.cols, 4);
  assert.equal(compact.cols, 5);
  near(large.cardW * 1.15, 82, 0.3);
  near(compact.cardW * 1.15, 32, 0.3);
  assert.ok(compact.gap < large.gap);
  const wide = C.heroLayout({ w: 10000, h: 100, heroIds: Array(50).fill(1) });
  assert.equal(wide.rows, 1);
});

test('visible bounds, Shift resizing and export agree about the separate game header', () => {
  const doc = C.createDocument();
  const group = C.entity(doc, { type: 'heroes', x: 80, y: 90, w: 200, h: 100, heroIds: [25] });
  doc.entities.push(group);
  const before = C.bounds([group], true);
  assert.deepEqual(before, { x: 80, y: 90, w: 200, h: 120 });
  const after = C.resizeBounds(before, { x: 100, y: 0 }, 'se', true, 30);
  Object.assign(group, C.transformBounds(group, before, after, true));
  assert.deepEqual(C.bounds([group], true), after);
  near(group.w / C.visualHeight(group), before.w / before.h);
  const output = C.exportDota(doc);
  assert.equal(output.configs[0].categories[0].height, 160);
  assert.deepEqual(C.bounds(C.importDota(output).entities, true), after);
  group.y = C.HEIGHT - group.h - DOTA.header + 1;
  assert.equal(C.outside(group), true);
});

test('label widths reproduce the in-game calibration rows (1920 × 1080 screenshot)', () => {
  const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
  GlobalFonts.registerFromPath(require('node:path').join(__dirname, '../assets/fonts/radiance-semibold.otf'), 'StudioRadiance');
  const { measureCategoryWidth, measureCategoryText, TEXT_MODEL } = require('../scripts/dota-rendering.mjs');
  const ctx = createCanvas(8, 8).getContext('2d');
  // Each row was a label ending in |, with a one-glyph | category placed under it; the gap
  // between the two bars on screen gives the game's width of the row in grid units.
  const rows = [['WWWWWWWWWWWWWWWWWWWW', 335], ['IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII', 240.6], ['.........................................', 259.1],
    ['Ж Ш Щ Ж Ш Щ Ж Ш Щ Ж Ш Щ', 260.8], ['@  @  @  @  @  @  @  @', 197], ['·                                        ', 224.4],
    ['AVAVAVAVAVAVAVAVAV TATATATA', 282.8], ['/\\/\\/\\/\\/\\/\\/\\/\\/\\ ()()()', 177.9], ["LT.LT.LT.LT.'Y'Y'Y'Y P.P.P.", 235.3],
    ['%@$·•‹›0123456789 ;:-=+*^~!?', 260.8], ['.:-=+*%@ ЁЁЁ ЙЙЙ ЫЫЫ ЮЮЮ ЯЯЯ ...:::', 354.6]];
  for (const [text, game] of rows) near(measureCategoryWidth(ctx, text).width, game, 1.5);
  const metrics = measureCategoryText(ctx, 'AV');
  assert.equal(metrics.model, TEXT_MODEL);
  assert.equal(metrics.advances.length, 2);
});


test('glyphs the game does not show (symbol test in Dota) are named on input and on export', () => {
  const { invisibleGlyphs, invisibleWarning } = require('../scripts/dota-rendering.mjs');
  const D = require('../scripts/data.mjs').default;
  // Everything the symbol library offers was seen in the game.
  assert.deepEqual(invisibleGlyphs(Object.values(D.symbols).flat().join('')), []);
  assert.equal(invisibleWarning('ABC \u2605 \u2665 \u262f \u{1f600} \u4e2d'), '');
  assert.equal(invisibleWarning('A\u28ff \u2500\u2551 \u2588\u2591 \u{1f525} \u2b50'), 'Dota не показывает: брайль, символы рамок, блоки ▀█░, \u{1f525}, \u2b50 — в игре этого не будет видно.');
  const doc = C.createDocument();
  doc.entities.push(C.entity(doc, { type: 'text', text: 'РАМКА \u2554\u2550\u2557', name: 'РАМКА', x: 10, y: 10, w: 90, h: 30, layer: 'decor' }));
  assert.ok(C.warnings(doc).includes('Dota не показывает: символы рамок — в игре этого не будет видно.'));
});
