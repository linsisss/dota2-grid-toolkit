const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;

function input() {
  return {
    version: 3,
    application_metadata: 'preserve me',
    configs: [
      {
        config_name: 'Original',
        custom_field: 7,
        categories: [
          {
            category_name: 'Carry',
            x_position: 14.375,
            y_position: 29.75,
            width: 340,
            height: 190,
            hero_ids: [1, 138, 999],
            extension: 'keep'
          },
          {
            category_name: '✦',
            x_position: 420,
            y_position: 120,
            width: 30,
            height: 30,
            hero_ids: []
          }
        ]
      },
      {
        config_name: 'Do not touch',
        categories: [
          {
            category_name: 'Other',
            x_position: 80,
            y_position: 60,
            width: 200,
            height: 100,
            hero_ids: [5]
          }
        ]
      }
    ]
  };
}
test('Dota v3 round-trip preserves coordinates, Unicode, unknown hero IDs and metadata', () => {
  const original = input();
  const doc = C.importDota(original);
  assert.deepEqual(C.exportDota(doc), original);
  doc.entities[0].heroIds.push(10);
  assert.deepEqual(original.configs[0].categories[0].hero_ids, [1, 138, 999]);
});
test('editing one grid preserves all other grids', () => {
  const original = input(),
    doc = C.importDota(original, 1);
  doc.name = 'Edited';
  doc.entities[0].x = 192.25;
  const output = C.exportDota(doc);
  assert.deepEqual(output.configs[0], original.configs[0]);
  assert.equal(output.configs[1].categories[0].x_position, 192.25);
  assert.equal(output.configs[1].config_name, 'Edited');
});
test('switching configurations retains hidden objects, locks and edits independently', () => {
  let doc = C.importDota(input());
  doc.name = 'Grid A';
  doc.layers.find((l) => l.id === 'decor').visible = false;
  doc.layers.find((l) => l.id === 'heroes').locked = true;
  doc = C.switchConfig(doc, 1);
  doc.name = 'Grid B';
  doc.entities[0].x = 111;
  doc = C.switchConfig(doc, 0);
  assert.equal(doc.name, 'Grid A');
  assert.equal(doc.entities.length, 2);
  assert.equal(doc.layers.find((l) => l.id === 'decor').visible, false);
  assert.equal(doc.layers.find((l) => l.id === 'heroes').locked, true);
  const saved = C.importProject(JSON.parse(JSON.stringify(doc)));
  const output = C.exportDota(saved);
  assert.equal(output.configs[0].categories.length, 1);
  assert.equal(output.configs[1].config_name, 'Grid B');
  assert.equal(output.configs[1].categories[0].x_position, 111);
  saved.layers.find((l) => l.id === 'decor').visible = true;
  assert.equal(C.exportDota(saved).configs[0].categories.length, 2);
});
test('native project round-trip preserves layers, IDs and text', () => {
  const doc = C.demoDocument();
  doc.layers[0].locked = true;
  doc.entities.push(C.entity(doc, { type: 'symbol', name: '☯', text: '☯', w: 30, h: 30 }));
  assert.deepEqual(C.importProject(JSON.parse(JSON.stringify(doc))), doc);
});
test('malformed Dota files are rejected before replacing a document', () => {
  for (const malformed of [null, [], {}, { version: 2, configs: [] }, { version: 3, configs: [] }])
    assert.throws(() => C.importDota(malformed));
  const mutations = [
    (c) => (c.width = 0),
    (c) => (c.x_position = NaN),
    (c) => (c.y_position = Infinity),
    (c) => (c.hero_ids = [1, '2']),
    (c) => (c.hero_ids = [-3]),
    (c) => (c.category_name = {}),
    (c) => (c.height = 1e9)
  ];
  for (const mutation of mutations) {
    const data = input();
    mutation(data.configs[0].categories[0]);
    assert.throws(() => C.importDota(data));
  }
  assert.throws(() => C.importDota(input(), 99));
  const longName = input();
  longName.configs[0].config_name = 'x'.repeat(201);
  assert.throws(() => C.importDota(longName));
});
test('project validation includes hidden entities and cached configurations', () => {
  const doc = C.demoDocument();
  doc.layers[1].visible = false;
  doc.entities[0].w = 1e12;
  assert.throws(() => C.importProject(doc));
  const duplicate = C.demoDocument();
  duplicate.entities[1].id = duplicate.entities[0].id;
  assert.throws(() => C.importProject(duplicate));
  const drafts = C.switchConfig(C.importDota(input()), 1);
  drafts.configDrafts[0].entities[0].text = null;
  assert.throws(() => C.importProject(drafts));
});
test('undo/redo restores a mixed hero and symbol transaction and clears abandoned redo', () => {
  const history = new C.History(3);
  let doc = C.demoDocument();
  const initial = C.clone(doc);
  history.push(doc);
  doc.entities[0].heroIds.push(99);
  doc.entities.push(C.entity(doc, { text: '✦', name: '✦', type: 'symbol' }));
  const changed = C.clone(doc);
  doc = history.undo(doc);
  assert.deepEqual(doc, initial);
  doc = history.redo(doc);
  assert.deepEqual(doc, changed);
  doc = history.undo(doc);
  history.push(doc);
  doc.name = 'New branch';
  assert.equal(history.future.length, 0);
});
test('entity duplication always assigns a fresh unique ID', () => {
  const doc = C.demoDocument();
  const first = doc.entities[0];
  const next = doc.nextId;
  const copy = C.entity(doc, C.clone(first));
  assert.equal(copy.id, next);
  assert.notEqual(copy.id, first.id);
  assert.equal(doc.nextId, next + 1);
});
test('export warnings identify bounds, incompatible symbols and excluded layers', () => {
  const doc = C.createDocument();
  doc.entities.push(C.entity(doc, { x: 1190, y: 590, w: 30, h: 30, text: '═' }));
  assert.equal(C.warnings(doc).length, 2);
  doc.layers[2].visible = false;
  assert.equal(C.exportDota(doc).configs[0].categories.length, 0);
  assert.match(C.warnings(doc)[0], /Скрытые/);
});
test('geometry remains finite for clicks, reverse drags and all drawing tools', () => {
  for (const tool of [
    'line',
    'hline',
    'vline',
    'rect',
    'rectfill',
    'ellipse',
    'diamond',
    'triangle',
    'star',
    'spiral',
    'wave',
    'fill'
  ]) {
    for (const [a, b] of [
      [
        { x: 20, y: 30 },
        { x: 20, y: 30 }
      ],
      [
        { x: 250, y: 190 },
        { x: 30, y: 40 }
      ]
    ]) {
      const points = C.shapePoints(tool, a, b, 10);
      assert.ok(points.length > 0);
      assert.ok(points.length <= C.MAX_ENTITIES);
      assert.ok(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    }
  }
});
test('starter templates export valid Dota v3 grids inside the working area', () => {
  for (const kind of ['roles', 'minimal', 'blank']) {
    const doc = C.demoDocument(kind);
    assert.doesNotThrow(() => C.importDota(C.exportDota(doc)));
    assert.deepEqual(C.warnings(doc), []);
  }
});
