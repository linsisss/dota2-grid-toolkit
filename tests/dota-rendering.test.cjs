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

test('the text model at another size: the pick-screen sheet (1680 × 1050, «Герои» and hero pick)', () => {
  const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
  GlobalFonts.registerFromPath(require('node:path').join(__dirname, '../assets/fonts/radiance-semibold.otf'), 'StudioRadiance');
  const { glyphWidths, advanceAt, ZERO_WIDTH_SPACE } = require('../scripts/dota-rendering.mjs');
  const ctx = createCanvas(8, 8).getContext('2d');
  // Screen pixels per grid unit, from the sheet's single-dot markers; then the measured step of
  // every row «.» + spacers, in screen pixels (29.09.2026).
  const screens = { page: 1.11821, pick: 0.97232 };
  const rows = [['.', { page: 7.237 }], ['.  ', { page: 19.7, pick: 15.824 }], ['.\u2006\u2006\u2006', { page: 13.939, pick: 11.776 }],
    ['.\u2004\u2004', { page: 11.702, pick: 9.83 }], ['.\u2002', { page: 9.474, pick: 7.885 }], ['.\u2003', { page: 9.476, pick: 7.88 }],
    ['.\u2003\u2003', { page: 11.709, pick: 9.835 }]];
  for (const [unit, measured] of rows)
    for (const [screen, px] of Object.entries(measured)) {
      const scale = screens[screen], step = glyphWidths(ctx, unit).reduce((sum, width) => sum + advanceAt(width, scale), 0) * scale;
      near(step, px, 0.02);
    }
  assert.equal(glyphWidths(ctx, ZERO_WIDTH_SPACE)[0], 0);
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

test('characters missing from Radiance are counted, and named once they are a noticeable part', () => {
  const { inDotaFont, foreignGlyphs, foreignNoticeable, foreignSample, gridForeignGlyphs } = require('../scripts/dota-rendering.mjs');
  // Radiance: Latin, Cyrillic (lower case by its capitals), Greek, a few typographic signs.
  for (const char of ['A', 'z', 'Ж', 'ё', 'Ω', '—', '…', '•', '№', '€', '.', '*']) assert.equal(inDotaFont(char), true, char);
  // Not in Radiance: the backtick, the macron, symbols, kana, emoji.
  for (const char of ['`', '¯', '★', '♥', '⁘', '⁜', 'あ', '\u{1f600}']) assert.equal(inDotaFont(char), false, char);
  // Whitespace and what the game does not show at all (invisibleWarning) are not counted.
  const some = foreignGlyphs(['⁘⁘ . . .', '⁜', '⠀█', 'AB']);
  assert.deepEqual(some, { total: 8, count: 3, chars: [['⁘', 2], ['⁜', 1]] });
  assert.equal(foreignNoticeable(some), false, 'fewer than 20');
  const many = foreignGlyphs([...Array(25).fill('⁕'), ...Array(400).fill('.')]);
  assert.equal(foreignNoticeable(many), true, '25 of 425 is over 5 %');
  assert.equal(foreignNoticeable(foreignGlyphs([...Array(25).fill('⁕'), ...Array(600).fill('.')])), false, '25 of 625 is under 5 %');
  assert.equal(foreignSample(foreignGlyphs(['⁘⁕⁜⁎※‵⁔'])), '⁘ ⁕ ⁜ ⁎ ※ ‵ …');
  // A workshop grid: hero categories do not count.
  const grid = { configs: [{ categories: [{ category_name: '★', hero_ids: [] }, { category_name: 'КЕРРИ ★', hero_ids: [1] }] }] };
  assert.equal(gridForeignGlyphs(grid).count, 1);
  // On export, the warning names them.
  const doc = C.createDocument();
  for (let i = 0; i < 30; i++) doc.entities.push(C.entity(doc, { type: 'symbol', text: '⁜', x: 10 + i, y: 10, w: 30, h: 30, layer: 'decor' }));
  assert.ok(C.warnings(doc).some((line) => line.startsWith('30 символов нет в шрифте Dota (⁜)')), C.warnings(doc).join(' | '));
});

test('advances do not depend on a browser that rounds small text to whole pixels', () => {
  // A user's Chrome measured Radiance's space (0.2289 em) at 15.15 px as 3 px, not 3.47: it snapped
  // to 3 screen pixels instead of 4, and their dot art spread apart for everyone else (01.10.2026).
  // Widths are measured at 64× and scaled back, so such rounding no longer reaches the model.
  // Rare characters stand for the space and the dot — a pair of them for each browser, since widths
  // are cached by characters for the whole page.
  const { glyphWidths, advanceAt } = require('../scripts/dota-rendering.mjs');
  const EM = { '\u2E3A': 0.2289, '\u2E3B': 0.2738, '\u2E3C': 0.2289, '\u2E3D': 0.2738 };
  const context = (round) => ({
    font: '', letterSpacing: '0px', save() {}, restore() {},
    measureText(text) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)[1]);
      return { width: Array.from(text).reduce((sum, char) => sum + (round ? Math.round(EM[char] * size) : EM[char] * size), 0) };
    }
  });
  const exact = glyphWidths(context(false), '\u2E3A\u2E3B\u2E3A\u2E3A\u2E3B');
  const rounded = glyphWidths(context(true), '\u2E3C\u2E3D\u2E3C\u2E3C\u2E3D');
  near(exact[0], 0.2289 * 15.15, 1e-9);
  rounded.forEach((width, i) => near(width, exact[i], 0.01));
  // Rounded at the label size, the space would have been 3 px and snapped a pixel short.
  assert.notEqual(advanceAt(Math.round(0.2289 * 15.15)), advanceAt(exact[0]));
  assert.deepEqual(rounded.map((width) => advanceAt(width)), exact.map((width) => advanceAt(width)));
});
