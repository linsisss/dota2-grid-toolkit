const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const E = require('../scripts/edit-operations.mjs');
const measure = (text) => ({ text: text.toUpperCase(), advances: Array.from(text, () => 10) });
const add = (doc, text, x, y = 50, extra = {}) => {
  const item = C.entity(doc, { type: 'symbol', text, name: text, x, y, w: 30, h: 30, ...extra });
  doc.entities.push(item); return item;
};

test('download compacts exact rows without mutating editable symbols, IDs or selection geometry', () => {
  const doc = C.createDocument();
  const first = add(doc, 'A', 20), second = add(doc, 'B', 40);
  const before = C.clone(doc), bounds = C.bounds([second]);
  const output = C.exportDota(doc, measure);
  assert.deepEqual(output.configs[0].categories, [{
    category_name: 'A B', x_position: 20, y_position: 50,
    width: 30, height: 30, hero_ids: []
  }]);
  assert.deepEqual(doc, before);
  assert.equal(first.id, 1); assert.equal(second.id, 2);
  assert.deepEqual(C.bounds([doc.entities[1]]), bounds);
  assert.equal(C.importProject(C.clone(doc)).entities.length, 2);
});

test('irregular positions, layers, metadata and distinct baselines are not flattened', () => {
  const doc = C.createDocument();
  add(doc, 'A', 20); add(doc, 'B', 37); add(doc, 'C', 60, 51);
  add(doc, 'D', 50, 50, { layer: 'background' });
  add(doc, 'E', 60, 50, { extra: { custom: 'keep' } });
  assert.equal(C.exportDota(doc, measure).configs[0].categories.length, 5);
  assert.equal(C.exportDota(doc, measure).configs[0].categories.at(-1).custom, 'keep');
});

test('glyphs within half a screen pixel of the measured row join it, farther ones do not', () => {
  const doc = C.createDocument();
  add(doc, 'A', 20); add(doc, 'B', 40.4, 50.3); add(doc, 'C', 60.6); add(doc, 'D', 80.2, 49.6);
  const [row, ...rest] = C.exportDota(doc, measure).configs[0].categories;
  assert.equal(row.category_name, 'A B   D', 'B is 0.4 and D 0.2 off the measured row');
  assert.equal(row.y_position, 49.95);
  assert.deepEqual(rest.map((c) => c.category_name), ['C'], 'C would be 0.6 off');
});

test('fallback-font glyphs only end a row, and # never starts one', () => {
  const doc = C.createDocument();
  add(doc, 'A', 20); add(doc, '★', 40); add(doc, 'B', 60);
  add(doc, '★', 20, 100); add(doc, 'C', 40, 100);
  add(doc, '#', 20, 150); add(doc, '@', 30, 150);
  add(doc, '@', 20, 200); add(doc, '#', 30, 200);
  assert.deepEqual(C.exportDota(doc, measure).configs[0].categories.map((c) => c.category_name), ['A ★', 'B', '★', 'C', '#', '@', '@#']);
});

test('export does not join independently placed RTL letters or combining marks', () => {
  const doc = C.createDocument();
  add(doc, 'ا', 20); add(doc, 'ب', 30); add(doc, 'א', 40); add(doc, '\u0301', 50);
  assert.equal(C.exportDota(doc, measure).configs[0].categories.length, 4);
});

test('export compacts visible locked layers, saved drafts and untouched imported grids', () => {
  let doc = C.createDocument('First');
  add(doc, 'A', 20); add(doc, 'B', 30);
  doc.layers.find((l) => l.id === 'decor').locked = true;
  doc = C.addConfig(doc, 'Second');
  add(doc, '%', 0); add(doc, '@', 10);
  const output = C.exportDota(doc, measure);
  assert.equal(output.configs[0].categories[0].category_name, 'AB');
  assert.equal(output.configs[1].categories[0].category_name, '%@');
  const imported = C.importDota(C.exportDota(doc));
  assert.equal(C.exportDota(imported, measure).configs[1].categories.length, 1);
});

test('old automatic rows reopen as individually editable symbols without moving their glyphs', () => {
  let doc = C.createDocument();
  add(doc, 'A', 20); add(doc, 'B', 37); add(doc, 'C', 90);
  E.mergeRows(doc);
  doc.entities[0].rotation = 33;
  const oldGlyphs = C.textGlyphs(doc.entities[0]);
  const restored = C.importProject(C.clone(doc));
  assert.equal(doc.entities.length, 1);
  assert.equal(restored.entities.length, 3);
  assert.equal(new Set(restored.entities.map((e) => e.id)).size, 3);
  restored.entities.forEach((e, i) => {
    assert.equal(e.x, oldGlyphs[i].x); assert.equal(e.y, oldGlyphs[i].y);
    assert.equal(e.text, oldGlyphs[i].text); assert.equal(e.rowGlyphs, undefined);
  });
  assert.deepEqual(C.importProject(C.clone(restored)), restored);
});
