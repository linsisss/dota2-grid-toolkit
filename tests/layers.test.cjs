const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const points = [
  { type: 'symbol', text: '/', x: 10, y: 20, w: 30, h: 30 },
  { type: 'symbol', text: '\\', x: 30, y: 40, w: 30, h: 30 }
];

test('two imported images retain independent identity, visibility, content and persistence', () => {
  const doc = C.createDocument();
  const a = C.addArtwork(doc, points, 'portrait'),
    b = C.addArtwork(doc, points, 'portrait');
  assert.notEqual(a.layer.id, b.layer.id);
  assert.equal(b.layer.name, 'portrait (2)');
  assert.deepEqual(
    a.items.map((e) => e.layer),
    [a.layer.id, a.layer.id]
  );
  a.layer.visible = false;
  b.items[0].x = 80;
  const restored = C.importProject(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(restored, doc);
  assert.equal(C.exportDota(restored).configs[0].categories.length, 2);
  assert.equal(a.items[0].x, 10);
  assert.equal(C.countSymbols(restored), 4);
});

test('undo and redo restore entire image layers, including deletion and locks', () => {
  let doc = C.createDocument();
  const history = new C.History(10);
  history.push(doc);
  const { layer } = C.addArtwork(doc, points, 'Image');
  const added = C.clone(doc);
  doc = history.undo(doc);
  assert.equal(doc.layers.length, 3);
  assert.equal(doc.entities.length, 0);
  doc = history.redo(doc);
  assert.deepEqual(doc, added);
  doc.layers.find((l) => l.id === layer.id).locked = true;
  assert.equal(C.deleteArtwork(doc, layer.id), false);
  doc.layers.find((l) => l.id === layer.id).locked = false;
  history.push(doc);
  assert.equal(C.deleteArtwork(doc, layer.id), true);
  assert.equal(doc.entities.length, 0);
  assert.deepEqual(history.undo(doc), added);
  assert.equal(C.deleteArtwork(doc, 'heroes'), false);
});

test('artwork layers survive switching Dota configurations and native-project round trips', () => {
  let doc = C.importDota({
    version: 3,
    configs: [
      { config_name: 'A', categories: [] },
      { config_name: 'B', categories: [] }
    ]
  });
  const a = C.addArtwork(doc, points, 'A');
  doc = C.switchConfig(doc, 1);
  C.addArtwork(doc, points, 'B');
  doc = C.importProject(JSON.parse(JSON.stringify(doc)));
  doc = C.switchConfig(doc, 0);
  assert.equal(doc.layers.find((l) => l.id === a.layer.id).name, 'A');
  assert.equal(C.exportDota(doc).configs[1].categories.length, 2);
});

test('invalid layer references and limits cannot silently lose artwork', () => {
  const doc = C.createDocument();
  C.addArtwork(doc, points);
  const malformed = C.clone(doc);
  malformed.entities[0].layer = 'art-9999';
  assert.throws(() => C.importProject(malformed));
  const missingBase = C.clone(doc);
  missingBase.layers = missingBase.layers.filter((l) => l.id !== 'heroes');
  assert.throws(() => C.importProject(missingBase));
  const duplicate = C.clone(doc);
  duplicate.layers.push(C.clone(duplicate.layers[1]));
  assert.throws(() => C.importProject(duplicate));
  const before = C.clone(doc);
  assert.throws(() => C.addArtwork(doc, new Array(C.MAX_ENTITIES).fill(points[0])));
  assert.deepEqual(doc, before);
  assert.deepEqual(C.importProject(C.createDocument()), C.createDocument());
});

test('portrait layout fits scaled cells inside the hero list, below its separate header', () => {
  for (const count of [1, 4, 6, 20, 127]) {
    const group = { w: 340, h: 195, heroIds: new Array(count).fill(1) };
    const layout = C.heroLayout(group);
    assert.ok(Math.abs(layout.cardW / layout.cardH - 43 / 75) < 1e-8);
    assert.ok(layout.pad * 2 + layout.cols * layout.stepX <= group.w + 1e-8);
    assert.ok(layout.pad * 2 + layout.rows * layout.stepY <= group.h + 1e-8);
  }
  assert.equal(C.heroLayout({ w: 340, h: 195, heroIds: [] }), null);
});
