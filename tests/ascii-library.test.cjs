const test = require('node:test');
const assert = require('node:assert/strict');
const { artLines, layoutAsciiArt, placeAsciiArt } = require('../scripts/ascii-library.mjs');
const { arts } = require('../data/ascii-arts.json');
const C = require('../scripts/core.mjs').default;

test('art layout keeps the drawing, internal blank lines and spacing, trimming only blank edges and the shared indent', () => {
  const source = '\r\n  @@ :.\r\n  \r\n    ##\r\n';
  assert.deepEqual(artLines(source), ['@@ :.', '', '  ##']);
  const layout = layoutAsciiArt(source, (line) => [...line].length * 12);
  assert.deepEqual(layout.rows.map((row) => [row.text,row.y]), [['@@ :.',0],['  ##',40]]);
  assert.equal(layout.height, 70);
  assert.deepEqual(artLines(' \n\t'), []);
});

test('catalog art survives native and Dota exports as original Unicode on separate layers', () => {
  const doc = C.createDocument();
  // Dota's fonts have no Braille: the Braille drawings of arts.txt are not in the library.
  assert.ok(arts.length >= 1);
  assert.ok(arts.every((art) => !/[\u2800-\u28ff]/u.test(art.text)));
  assert.equal(new Set(arts.map((art) => art.id)).size, arts.length);
  for (const art of arts) {
    const layout = layoutAsciiArt(art.text);
    assert.ok(layout.rows.length > 0, art.name);
    C.addArtwork(doc, placeAsciiArt(layout, C.canvasSize(doc)), art.name);
  }
  const restored = C.importProject(C.clone(doc));
  assert.equal(restored.layers.filter((layer) => layer.kind === 'artwork').length, arts.length);
  const expected = arts.flatMap((art) => layoutAsciiArt(art.text).rows.map((row) => row.text));
  const categories = C.exportDota(restored).configs[0].categories;
  assert.deepEqual(categories.map((category) => category.category_name), expected);
  assert.ok(categories.every((category) => category.width === 30 && category.height === 30));
  assert.equal(C.categoryCount(restored), expected.length);
});

test('art placement centers small drawings, preserves big drawings and supports undo/redo', () => {
  const layout = layoutAsciiArt('@ :\n .@');
  const rows = placeAsciiArt(layout, {w:1193,h:593});
  assert.equal(rows[0].x, (1193-layout.width)/2);
  assert.equal(rows[0].y, (593-layout.height)/2);
  const oversized = layoutAsciiArt(Array.from({length:70},()=> '@'.repeat(200)).join('\n'));
  assert.equal(placeAsciiArt(oversized,{w:1193,h:593})[0].x,0);
  assert.equal(placeAsciiArt(oversized,{w:1193,h:593})[0].y,0);
  const doc=C.createDocument(), before=C.clone(doc), history=new C.History();
  history.push(before);C.addArtwork(doc,rows,'Оригинал');const after=C.clone(doc);
  assert.deepEqual(history.undo(doc), before);
  assert.deepEqual(history.redo(before), after);
});

test('an art from the editor: the chosen objects as the download keeps them, without heroes and hidden layers', () => {
  const doc = C.createDocument();
  // Three glyphs (not «#»: it never leads a row) of one line at exact advances join into a row; a text keeps its line; heroes are left out.
  const measure = (text) => ({ width: [...text].length * 10 });
  const art = C.addArtwork(doc, [{ type: 'symbol', text: '@', name: '@', x: 300, y: 200, w: 30, h: 30 }, { type: 'symbol', text: '@', name: '@', x: 310, y: 200, w: 30, h: 30 },
    { type: 'symbol', text: '@', name: '@', x: 320, y: 200, w: 30, h: 30 }, { type: 'text', text: 'ПРИВЕТ', name: 'ПРИВЕТ', x: 290, y: 240, w: 80, h: 30 }], 'Рисунок');
  const ids = art.items.map((item) => item.id);
  doc.entities.push({ id: doc.nextId++, type: 'heroes', name: 'Керри', text: '', heroIds: [1], x: 0, y: 0, w: 100, h: 100, layer: 'heroes' });
  const rows = C.artRows(doc, [...ids, doc.nextId - 1], measure);
  assert.deepEqual(rows, [{ text: '@@@', x: 10, y: 0 }, { text: 'ПРИВЕТ', x: 0, y: 40 }]);
  assert.throws(() => C.artRows(doc, [doc.nextId - 1], measure), /героев/);
  doc.layers.find((layer) => layer.id === art.layer.id).visible = false;
  assert.throws(() => C.artRows(doc, ids, measure), /героев/, 'a hidden layer sends nothing');
});
