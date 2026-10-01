const test = require('node:test');
const assert = require('node:assert/strict');

// Fake raw glyph widths (grid units, before the game's snapping): a dot 4, a space 3, a zero-width
// space 0, any other glyph 9.
const widths = (line) => Array.from(line).map((char) => char === '·' || char === '.' ? 4 : char === ' ' ? 3 : char === ' ' ? 0 : 9);
const category = (name, x = 100, y = 50, extra = {}) => ({ category_name: name, x_position: x, y_position: y, width: 30, height: 30, hero_ids: [], ...extra });
const view = (list) => list.map((c) => [c.category_name, c.x_position, c.y_position]);
// Where the «Герои» page (or another size) draws every visible glyph of a category.
async function glyphsAt(c, scale) {
  const { advanceAt } = await import('../scripts/dota-rendering.mjs');
  const chars = Array.from(c.category_name), steps = widths(c.category_name.toUpperCase()), out = [];
  let pen = c.x_position;
  chars.forEach((char, k) => { if (!/\s/u.test(char)) out.push(pen); pen += advanceAt(steps[k], scale); });
  return out;
}

test('a download for every screen: lines split, art glyphs rejoin with spaces', async () => {
  const { default: C } = await import('../scripts/core.mjs');
  const { advanceAt } = await import('../scripts/dota-rendering.mjs');
  const safe = (list, options) => view(C.pickSafeCategories(list, widths, options));
  assert.deepEqual(safe([category('ПРОСТИ МЕНЯ\nЯ НИ НА КОГО\n\nКОНЕЦ')]), [['ПРОСТИ МЕНЯ', 100, 50], ['Я НИ НА КОГО', 100, 70], ['КОНЕЦ', 100, 110]], 'a line every 20, blank lines skipped');
  assert.deepEqual(safe([category('領\n域\n展')]), [['領', 100, 50], ['域', 100, 70], ['展', 100, 90]], 'vertical text keeps every glyph');
  assert.deepEqual(safe([category('RYŌIKI TENKAI')]), [['RYŌIKI TENKAI', 100, 50]], 'plain text stays whole');

  const dots = category('· ·  ·');
  const rows = C.pickSafeCategories([dots], widths);
  // Gaps are Radiance's own spaces: U+2006 (1.6.0–1.6.2) is drawn by a system font where one has it,
  // and spread the rows on those systems. A space snaps like a glyph, so a row ends where its drift
  // would pass 2.5 units on some screen (here the third dot, after two spaces, at 720p).
  assert.ok(rows.some((row) => row.category_name.includes(' ')) && rows.every((row) => !row.category_name.includes(' ')), 'gaps are spaces');
  const before = await glyphsAt(dots), after = (await Promise.all(rows.map((row) => glyphsAt(row)))).flat().sort((a, b) => a - b);
  assert.equal(after.length, 3);
  after.forEach((x, i) => assert.ok(Math.abs(x - before[i]) <= 1, `dot ${i}: ${x} vs ${before[i]}`));

  assert.deepEqual(safe([dots], { rows: false }), before.map((x) => ['·', +x.toFixed(6), 50]), 'without rows, a glyph per category');
  const extra = C.pickSafeCategories([category('· ·', 0, 0, { custom: 7 })], widths);
  assert.deepEqual(view(extra), [['· ·', 0, 0]], 'categories with other fields stay as they are');
});

test('hero categories go last and no row lies on a hero card', async () => {
  const { default: C } = await import('../scripts/core.mjs');
  const heroes = category('КЕРРИ', 200, 0, { hero_ids: [1], width: 60, height: 110 });
  const left = category('·', 150, 40), right = category('·', 300, 40);
  const out = C.pickSafeCategories([heroes, left, right], widths);
  assert.equal(out.at(-1), heroes, 'drawn on top, untouched');
  assert.deepEqual(view(out.slice(0, -1)), [['·', 150, 40], ['·', 300, 40]], 'a row across the card would take its clicks');
  // With no card between, two dots a whole number of spaces apart are one row (spaces of no width
  // here, so that the gap holds on every screen whatever its size).
  const flat = (line) => widths(line).map((w, i) => (Array.from(line)[i] === ' ' ? 0 : w));
  const open = C.pickSafeCategories([left, right], flat);
  assert.equal(open.length, 1, 'with no card between, the two dots are one row');
});

test('a row ends before any glyph would drift more than 2.5 units on some screen', async () => {
  const { packPickRows, PICK_ROWS } = await import('../scripts/export-rows.mjs');
  const { DOTA, advanceAt } = await import('../scripts/dota-rendering.mjs');
  const dot = 4.1511, points = [];
  for (let i = 0, x = 10; i < 80; i++, x += advanceAt(dot)) points.push({ ch: '.', x, y: 5 });
  const rows = packPickRows(points, () => dot);
  assert.ok(rows.length > 1 && rows.length < 40, `${rows.length} rows`);
  assert.deepEqual(rows.flatMap((row) => row.members).sort((a, b) => a - b), points.map((_, i) => i));
  for (const scale of [768, 1050, 1080, 1440, 2160].flatMap((h) => [1, 0.8695].map((pick) => DOTA.screenScale * h / 1080 * pick)))
    for (const row of rows) {
      let pen = row.x, k = 0;
      for (const char of row.text) {
        if (char === '.') {
          const x = points[row.members[k++]].x;
          assert.ok(Math.abs(pen - x) <= PICK_ROWS.drift + 1e-9, `scale ${scale}: ${pen} vs ${x}`);
          if (scale === DOTA.screenScale) assert.ok(Math.abs(pen - x) <= PICK_ROWS.tol + 1e-9);
        }
        pen += advanceAt(char === '.' ? dot : 0, scale);
      }
    }
});

test('downloads use it when given widths; publishing and previews keep the page rows', async () => {
  const { default: C } = await import('../scripts/core.mjs');
  const grid = { version: 3, configs: [{ config_name: 'Тест', categories: [category('· · ·', 10, 10), category('A\nB', 200, 10), { ...category('Керри', 300, 300), hero_ids: [1], width: 100, height: 100 }] }] };
  const doc = C.importDota(grid);
  const measure = (text) => ({ width: widths(text.toUpperCase()).reduce((a, b) => a + b + 2, 0) });
  const names = (m, options) => C.exportDota(doc, m, options).configs[0].categories.map((c) => c.category_name.replaceAll(' ', '_'));
  assert.deepEqual(names(null, { compactRows: false, widths }), ['·', '·', '·', 'A', 'B', 'Керри']);
  const [row, ...rest] = names(null, { widths });
  assert.match(row, /^·_+·_+·$/);
  assert.deepEqual(rest, ['A', 'B', 'Керри']);
  assert.deepEqual(names(measure, { compactRows: true }), ['·_·_·', 'A\nB', 'Керри'], 'without widths nothing changes');
});
