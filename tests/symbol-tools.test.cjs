const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const B = require('../scripts/drawing.mjs');
const S = require('../scripts/symbol-tools.mjs');
const E = require('../scripts/edit-operations.mjs');
const { convertWithStats } = require('../scripts/converter.mjs');
const measure = (text) => ({ text: text.toUpperCase(), advances: Array.from(text, () => 10) });

test('category selection adds and removes exactly the chosen category, including partial/Unicode selections', () => {
  let value = 'XX☆';
  assert.deepEqual(S.categorySelection(value, '★☆😀'), { all: false, partial: true });
  value = S.toggleCategory(value, '★☆😀', true);
  assert.equal(value, 'XX☆★😀');
  assert.equal(S.toggleCategory(value, '★☆😀', true), value);
  assert.deepEqual(S.categorySelection(value, '★☆😀'), { all: true, partial: false });
  assert.equal(S.toggleCategory(value, '★☆😀', false), 'XX');
  assert.equal(S.toggleSymbol(value, '😀'), 'XX☆★');
});

test('gradient symbols progress by distance, finish at @ and ignore mouse event frequency', () => {
  const settings = {
    ...B.BRUSH_DEFAULTS,
    order: 'gradient',
    chars: B.GRADIENT_CHARS,
    step: 10,
    gradientLength: 300
  };
  const coarse = B.drawingPoints(
    'gradient',
    [
      { x: 0, y: 0 },
      { x: 400, y: 0 }
    ],
    settings
  );
  const fine = B.drawingPoints(
    'gradient',
    Array.from({ length: 81 }, (_, i) => ({ x: i * 5, y: 0 })),
    settings
  );
  assert.equal(coarse.length, fine.length);
  coarse.forEach((p, i) => {
    assert.equal(p.ch, fine[i].ch);
    assert.ok(Math.abs(p.x - fine[i].x) < 1e-7);
    assert.ok(Math.abs(p.y - fine[i].y) < 1e-7);
  });
  assert.equal(coarse[0].ch, '.');
  assert.equal(coarse.at(-1).ch, '@');
  assert.deepEqual([...new Set(coarse.map((p) => p.ch))], Array.from(B.GRADIENT_CHARS));
  assert.ok(coarse.slice(30).every((p) => p.ch === '@'));
  const backward = B.drawingPoints(
    'gradient',
    [
      { x: 400, y: 0 },
      { x: 0, y: 0 }
    ],
    settings
  );
  assert.deepEqual(
    backward.map((p) => p.ch),
    coarse.map((p) => p.ch)
  );
});

test('eyedropper targets individual upright glyphs in normal, merged and rotated rows; skips hidden layers', () => {
  const doc = C.createDocument();
  const row = C.entity(doc, {
    type: 'text',
    text: 'A B',
    x: 100,
    y: 100,
    w: 100,
    h: 30,
    textMetrics: measure('A B')
  });
  doc.entities.push(row);
  assert.equal(S.pickSymbol(doc, { x: 108, y: 107 }, measure), 'A');
  assert.equal(S.pickSymbol(doc, { x: 130, y: 107 }, measure), 'B');
  assert.equal(S.pickSymbol(doc, { x: 500, y: 500 }, measure), null);
  row.rotation = 50;
  const b = C.textGlyphs(row, true)[1];
  assert.equal(S.pickSymbol(doc, { x: b.x + 9, y: b.y + 7 }, measure), 'B');
  row.rotation = 0;
  row.rowGlyphs = [
    { text: 'A', x: 0, w: 30, h: 30 },
    { text: 'B', x: 20, w: 30, h: 30 }
  ];
  row.text = 'AB';
  assert.equal(S.pickSymbol(doc, { x: 128, y: 107 }, measure), 'B');
  doc.layers.find((l) => l.id === 'decor').visible = false;
  assert.equal(S.pickSymbol(doc, { x: 128, y: 107 }, measure), null);
});

test('recent symbols remain unique, newest first, limited to eight Unicode characters', () => {
  const recent = S.rememberSymbols([], 'ABCDEFGHI😀');
  assert.equal(recent.length, 8);
  assert.equal(recent[0], '😀');
  assert.deepEqual(S.rememberSymbols(recent, ' G G '), ['G', '😀', 'I', 'H', 'F', 'E', 'D', 'C']);
});

test('all non-hero categories export 30x30 across untouched configs, rows and rotated text', () => {
  let doc = C.createDocument();
  doc.source.configs.push({
    config_name: 'Untouched',
    categories: [
      {
        category_name: 'LONG',
        x_position: 1500,
        y_position: 800,
        width: 500,
        height: 50,
        hero_ids: [],
        extension: 7
      }
    ]
  });
  doc.entities.push(
    C.entity(doc, { text: 'LONG', w: 400, h: 60 }),
    C.entity(doc, { text: 'AB', rotation: 45, w: 100, h: 50 }),
    C.entity(doc, { type: 'heroes', name: 'Heroes', heroIds: [1, 2], w: 400, h: 150 })
  );
  const original = C.clone(doc),
    output = C.exportDota(doc);
  for (const config of output.configs)
    for (const category of config.categories)
      if (!category.hero_ids.length) {
        assert.equal(category.width, 30);
        assert.equal(category.height, 30);
      }
  const hero = output.configs[0].categories.find((c) => c.hero_ids.length);
  assert.equal(hero.width, 400);
  assert.equal(hero.height, 150);
  assert.equal(output.configs[1].categories[0].x_position, 1500);
  assert.equal(output.configs[1].categories[0].extension, 7);
  assert.deepEqual(doc, original);
});

test('category count matches export expansion, compact rows, hidden layers, and the 2000 threshold', () => {
  const doc = C.createDocument();
  const row = C.entity(doc, { text: '@'.repeat(2000), rotation: 90, w: 20000, h: 30 });
  doc.entities.push(row);
  assert.equal(C.categoryCount(doc), 2000);
  assert.ok(!C.warnings(doc).some((s) => s.includes('вылет')));
  row.text += '@';
  assert.equal(C.categoryCount(doc), C.exportDota(doc).configs[0].categories.length);
  assert.ok(C.warnings(doc).some((s) => s.includes('вылет')));
  doc.layers.find((l) => l.id === 'decor').visible = false;
  assert.equal(C.categoryCount(doc), 0);
  doc.layers.find((l) => l.id === 'decor').visible = true;
  row.rotation = 0;
  row.text = 'AB';
  row.rowGlyphs = [
    { text: 'A', x: 0, w: 30, h: 30 },
    { text: 'B', x: 20, w: 30, h: 30 }
  ];
  assert.equal(C.categoryCount(doc), 2);
  row.rowText = 'A B';
  assert.equal(C.categoryCount(doc), 1);
});

test('canvas dimensions survive native save, per-grid switching and history without scaling content', () => {
  let doc = C.createDocument('First');
  doc.entities.push(C.entity(doc, { text: 'A', x: 50, y: 60 }));
  const history = new C.History(),
    before = C.clone(doc);
  history.push(before);
  doc.canvas = C.validateCanvas({ w: 1600, h: 900 });
  const grown = C.clone(doc);
  assert.deepEqual(history.undo(doc), before);
  assert.deepEqual(history.redo(before), grown);
  doc = C.addConfig(grown, 'Second');
  assert.deepEqual(C.canvasSize(doc), { w: 1193, h: 593 });
  doc.canvas = { w: 800, h: 500 };
  const restored = C.switchConfig(C.importProject(doc), 0);
  assert.deepEqual(restored.canvas, { w: 1600, h: 900 });
  assert.equal(restored.entities[0].x, 50);
  assert.equal(restored.entities[0].y, 60);
  assert.deepEqual(C.switchConfig(restored, 1).canvas, { w: 800, h: 500 });
  assert.equal(C.exportDota(restored).configs[0].canvas, undefined);
  for (const canvas of [
    { w: 0, h: 900 },
    { w: 6001, h: 900 },
    { w: NaN, h: 900 },
    { w: 100.1, h: 900 }
  ])
    assert.throws(() => C.importProject({ ...restored, canvas }));
  const legacy = C.clone(before);
  delete legacy.canvas;
  assert.deepEqual(C.canvasSize(C.importProject(legacy)), { w: 1193, h: 593 });
});

test('alignment, overflow, cropping, mirrors and image conversion follow custom canvas dimensions', () => {
  const doc = C.createDocument();
  doc.canvas = { w: 1600, h: 900 };
  const item = C.entity(doc, { text: '@', x: 1400, y: 800, w: 30, h: 30 });
  doc.entities.push(item);
  assert.equal(E.overflow(doc).count, 0);
  E.alignItems([item], 'right', doc.canvas);
  assert.equal(item.x, 1570);
  item.x = 1590;
  assert.equal(E.overflow(doc).count, 1);
  E.cropSymbols(doc);
  assert.equal(doc.entities.length, 0);
  const points = B.drawingPoints(
    'pencil',
    [{ x: 10, y: 20 }],
    { ...B.BRUSH_DEFAULTS, mirrorH: true, mirrorV: true },
    1,
    false,
    null,
    doc.canvas
  );
  assert.ok(points.some((p) => p.x === 1560 && p.y === 850));
  const w = 32,
    h = 32,
    data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 8; y < 24; y++)
    for (let x = 8; x < 24; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  const converted = convertWithStats(
    { width: w, height: h, data },
    { fill: 100, thr: 0.01 },
    doc.canvas
  ).points;
  assert.ok(converted.length > 0);
  assert.ok(converted.every((p) => p.x >= 0 && p.y >= 0 && p.x + 30 <= 1600 && p.y + 30 <= 900));
  assert.ok(converted.some((p) => p.y > 593));
});
