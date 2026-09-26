const test = require('node:test');
const assert = require('node:assert/strict');
const { artLines, layoutAsciiArt, placeAsciiArt } = require('../scripts/ascii-library.mjs');
const { arts } = require('../data/ascii-arts.json');
const C = require('../scripts/core.mjs').default;

test('art layout retains original Braille, internal blank lines and spacing', () => {
  const source = '\u2800\r\n\u2800\u2800⣿⠀⠁\r\n\u2800\u2800\r\n\u2800\u2800⠀⣀\r\n';
  assert.deepEqual(artLines(source), ['⣿⠀⠁', '', '⠀⣀']);
  const layout = layoutAsciiArt(source, (line) => [...line].length * 12);
  assert.deepEqual(layout.rows.map((row) => [row.text,row.y]), [['⣿⠀⠁',0],['⠀⣀',40]]);
  assert.equal(layout.height, 70);
  assert.ok(!layout.rows.some((row) => row.text.includes('.')));
  assert.deepEqual(artLines('\u2800 \n\t'), []);
});

test('catalog art survives native and Dota exports as original Unicode on separate layers', () => {
  const doc = C.createDocument();
  assert.equal(arts.length, 43);
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
  const layout = layoutAsciiArt('⣿⠀⡇\n⠀⣀⣿');
  const rows = placeAsciiArt(layout, {w:1193,h:593});
  assert.equal(rows[0].x, (1193-layout.width)/2);
  assert.equal(rows[0].y, (593-layout.height)/2);
  const oversized = layoutAsciiArt(Array.from({length:70},()=> '⣿'.repeat(200)).join('\n'));
  assert.equal(placeAsciiArt(oversized,{w:1193,h:593})[0].x,0);
  assert.equal(placeAsciiArt(oversized,{w:1193,h:593})[0].y,0);
  const doc=C.createDocument(), before=C.clone(doc), history=new C.History();
  history.push(before);C.addArtwork(doc,rows,'Оригинал');const after=C.clone(doc);
  assert.deepEqual(history.undo(doc), before);
  assert.deepEqual(history.redo(before), after);
});
