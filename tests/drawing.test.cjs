const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const D = require('../scripts/drawing.mjs');
const E = require('../scripts/edit-operations.mjs');
const brush = (overrides = {}) => ({ ...D.BRUSH_DEFAULTS, ...overrides });
function documentOf(points) {
  const doc = C.createDocument();
  doc.entities = points.map((p) =>
    C.entity(doc, { type: 'symbol', text: 'A', name: 'A', x: 0, y: 0, w: 30, h: 30, ...p })
  );
  return doc;
}
const cats = (doc) => C.exportDota(doc).configs[0].categories;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('Shift redraws along the dominant axis in both directions without leaving freehand points', () => {
  for (const [x, y, axis] of [
    [200, 30, 'y'],
    [30, 200, 'x'],
    [-200, 30, 'y'],
    [30, -200, 'x']
  ]) {
    const path = [
      { x: 200, y: 200 },
      { x: 210, y: 215 },
      { x: 200 + x, y: 200 + y }
    ];
    const points = D.drawingPoints('pencil', path, brush(), 7, true);
    assert.ok(points.length > 5);
    assert.ok(points.every((p) => p[axis] === 200));
  }
});
test('brush sampling and random replay are independent of pointer event frequency', () => {
  const coarse = [
      { x: 0, y: 0 },
      { x: 180, y: 240 }
    ],
    fine = Array.from({ length: 31 }, (_, i) => ({ x: i * 6, y: i * 8 }));
  for (const order of ['single', 'sequence', 'random']) {
    const a = D.strokePoints(coarse, brush({ chars: 'ABC', order }), 17),
      b = D.strokePoints(fine, brush({ chars: 'ABC', order }), 17);
    assert.equal(a.length, b.length);
    a.forEach((p, i) => {
      near(p.x, b[i].x);
      near(p.y, b[i].y);
      assert.equal(p.ch, b[i].ch);
    });
  }
  const points = D.strokePoints(coarse, brush({ chars: 'ABC', order: 'sequence' }));
  assert.equal(points.map((p) => p.ch).join(''), 'ABCABCABCABCABCABCA');
  const random = D.strokePoints(coarse, brush({ chars: 'ABC', order: 'random' }), 8).map(
    (p) => p.ch
  );
  assert.equal(new Set(random).size, 3);
  assert.notDeepEqual(
    random,
    points.map((p) => p.ch)
  );
});
test('dynamic brushes monotonically change spacing and apply to filled shapes', () => {
  const path = [
    { x: 10, y: 10 },
    { x: 700, y: 10 }
  ];
  for (const dynamics of ['denser', 'sparser']) {
    const settings = brush({ dynamics, endStep: dynamics === 'denser' ? 4 : 60, length: 400 });
    const points = D.strokePoints(path, settings),
      gaps = points.slice(1).map((p, i) => p.x - points[i].x);
    gaps
      .slice(1)
      .forEach((gap, i) =>
        assert.ok(dynamics === 'denser' ? gap <= gaps[i] + 1e-6 : gap >= gaps[i] - 1e-6)
      );
    const filled = D.drawingPoints(
      'fill',
      [
        { x: 10, y: 10 },
        { x: 700, y: 40 }
      ],
      settings
    );
    assert.ok(filled.length > 10);
    assert.notEqual(filled[1].x - filled[0].x, filled[4].x - filled[3].x);
  }
});
test('smart brush uses upright directional characters in all eight directions', () => {
  const directions = [
    [1, 0, '-'],
    [-1, 0, '-'],
    [0, 1, '|'],
    [0, -1, '|'],
    [1, 1, '\\'],
    [-1, -1, '\\'],
    [1, -1, '/'],
    [-1, 1, '/']
  ];
  for (const [x, y, ch] of directions) {
    const points = D.drawingPoints(
      'smart',
      [
        { x: 100, y: 100 },
        { x: 100 + x * 100, y: 100 + y * 100 }
      ],
      brush({ chars: 'ABC', order: 'random' })
    );
    assert.ok(points.every((p) => p.ch === ch));
  }
});
test('every drawing shape supports sequential symbols and finite mirrored coordinates', () => {
  for (const [tool] of D.DRAWING_TOOLS.filter(
    ([t]) => !['smart', 'eyedropper', 'lasso', 'eraser'].includes(t)
  )) {
    const points = D.drawingPoints(
      tool,
      [
        { x: 90, y: 90 },
        { x: 250, y: 220 }
      ],
      brush({ chars: 'AB', order: 'sequence', mirrorH: true, mirrorV: true }),
      1,
      false
    );
    assert.ok(points.length > 1, tool);
    assert.ok(
      points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && 'AB'.includes(p.ch)),
      tool
    );
  }
});
test('lasso respects concave polygons rather than their rectangular bounds', () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 80 },
    { x: 80, y: 80 },
    { x: 80, y: 200 },
    { x: 0, y: 200 }
  ];
  assert.equal(
    D.lassoContains({ type: 'symbol', text: 'A', x: 20, y: 130, w: 30, h: 30 }, polygon),
    true
  );
  assert.equal(
    D.lassoContains({ type: 'symbol', text: 'A', x: 130, y: 130, w: 30, h: 30 }, polygon),
    false
  );
  assert.equal(
    D.lassoContains({ type: 'text', text: 'AB', x: 0, y: 0, w: 50, h: 30 }, polygon.slice(0, 2)),
    false
  );
});
test('automatic rows preserve irregular spacing, category metadata and exact Dota geometry', () => {
  const doc = documentOf([
    { x: 80.25, y: 100, text: 'A', extra: { custom: 1 } },
    { x: 111.7, y: 100, text: 'B' },
    { x: 190, y: 100, text: 'C' },
    { x: 100, y: 140, text: 'D' }
  ]);
  const before = cats(doc),
    ids = E.mergeRows(doc);
  assert.equal(doc.entities.length, 2);
  assert.equal(ids.size, 3);
  assert.equal(doc.entities[0].text, 'ABC');
  assert.deepEqual(cats(doc), before);
  assert.equal(C.countSymbols(doc), 4);
  assert.deepEqual(cats(C.importProject(C.clone(doc))), before);
});
test('compatible rows export as a single string only when measured advances reproduce every position', () => {
  const measure = (text) => ({ text, advances: Array.from(text, () => 10) });
  const doc = documentOf([
    { x: 10, y: 20, text: 'A' },
    { x: 30, y: 20, text: 'B' }
  ]);
  E.mergeRows(doc, measure);
  assert.equal(doc.entities[0].rowText, 'A B');
  assert.equal(cats(doc).length, 1);
  assert.equal(cats(doc)[0].category_name, 'A B');
  doc.entities[0].rotation = 90;
  assert.equal(cats(doc).length, 2);
  assert.ok(C.textGlyphs(doc.entities[0]).every((g) => g.rotation === 0));
});
test('row grouping never crosses layers, locked objects, rotations or distinct baselines', () => {
  const doc = documentOf([
    { x: 10, y: 20 },
    { x: 30, y: 20 },
    { x: 50, y: 21 },
    { x: 70, y: 20, rotation: 30 },
    { x: 90, y: 20, layer: 'background' }
  ]);
  doc.layers[0].locked = true;
  E.mergeRows(doc);
  assert.equal(doc.entities.length, 4);
});
test('row resize and rotation preserve all symbol positions without rotating glyphs', () => {
  const doc = documentOf([
    { x: 100, y: 100 },
    { x: 150, y: 100, text: 'B' },
    { x: 220, y: 100, text: 'C' }
  ]);
  E.mergeRows(doc);
  const row = doc.entities[0],
    rotated = { ...row, ...C.rotateItems([row], C.selectionFrame([row]), 37)[0] };
  const original = { ...rotated, ...C.rotateItems([rotated], C.selectionFrame([rotated]), -37)[0] };
  C.textGlyphs(original).forEach((g, i) => {
    near(g.x, [100, 150, 220][i]);
    near(g.y, 100);
    assert.equal(g.rotation, 0);
  });
  const resized = C.resizeInFrame(
    [row],
    C.selectionFrame([row]),
    { x: 150, y: 30 },
    'se',
    true,
    10
  )[0];
  near(resized.rowGlyphs[1].x, 100);
  near(resized.rowGlyphs[2].x, 240);
});
test('crop removes partially outside glyphs and preserves hidden and locked content', () => {
  const doc = documentOf([
    { x: 1130, y: 100 },
    { x: 1160, y: 100 },
    { x: 1175, y: 100 },
    { x: -5, y: 120, layer: 'background' },
    { x: 10, y: 590, layer: 'heroes' }
  ]);
  doc.layers[0].locked = true;
  doc.layers[1].visible = false;
  E.mergeRows(doc);
  assert.deepEqual(E.overflow(doc), { count: 2, editable: 1 });
  const before = C.clone(doc);
  E.cropSymbols(doc);
  assert.equal(C.countSymbols(doc), 4);
  assert.deepEqual(E.overflow(doc), { count: 1, editable: 0 });
  const history = new C.History();
  history.push(before);
  assert.deepEqual(history.undo(doc), before);
});
test('crop and eraser split text into surviving glyphs rather than losing the whole row', () => {
  const doc = documentOf([
    {
      type: 'text',
      text: 'ABC',
      x: 1140,
      y: 20,
      w: 60,
      h: 30,
      textMetrics: { text: 'ABC', advances: [15, 15, 15] }
    }
  ]);
  E.cropSymbols(doc);
  assert.deepEqual(
    doc.entities.map((e) => e.text),
    ['A', 'B']
  );
  E.mergeRows(doc);
  E.eraseSymbols(doc, { x: 1140, y: 20 }, 5);
  assert.deepEqual(
    doc.entities.map((e) => e.text),
    ['B']
  );
});
test('alignment moves the entire selection to canvas edges without changing its internal layout', () => {
  for (const side of ['left', 'center', 'right']) {
    const doc = documentOf([
      { x: 100, y: 10, w: 30 },
      { x: 200, y: 80, w: 60 },
      { type: 'text', text: 'ABC', x: 400, y: 120, w: 100, rotation: 40 }
    ]);
    const before = C.clone(doc.entities);
    E.alignItems(doc.entities, side);
    const bounds = C.bounds(doc.entities, true);
    const edge = (b) => (side === 'left' ? b.x : side === 'right' ? b.x + b.w : b.x + b.w / 2);
    near(edge(bounds), side === 'left' ? 0 : side === 'right' ? C.WIDTH : C.WIDTH / 2);
    doc.entities.forEach((e, i) => {
      near(e.x - doc.entities[0].x, before[i].x - before[0].x);
      near(e.y, before[i].y);
      near(e.rotation || 0, before[i].rotation || 0);
    });
  }
  const doc = documentOf([{ x: 10, y: 20 }]);
  E.alignItems(doc.entities, 'right');
  near(doc.entities[0].x, 1163);
});

test('movement stops the whole selection at the origin and permits right/bottom overflow', () => {
  const doc = documentOf([
    { x: 100, y: 50 },
    { x: 170, y: 100, rotation: 35, text: 'AB' }
  ]);
  const before = C.clone(doc.entities);
  E.moveItems(doc.entities, -500, -500);
  near(C.bounds(doc.entities, true).x, 0);
  near(C.bounds(doc.entities, true).y, 0);
  near(doc.entities[1].x - doc.entities[0].x, before[1].x - before[0].x);
  near(doc.entities[1].y - doc.entities[0].y, before[1].y - before[0].y);
  E.moveItems(doc.entities, 1600, 900);
  near(C.bounds(doc.entities, true).x, 1600);
  near(C.bounds(doc.entities, true).y, 900);
});

test('reference drag, free stretch and Shift scaling retain their anchors at the origin', () => {
  const r = {
    x: 50,
    y: 40,
    w: 200,
    h: 100,
    visible: true,
    opacity: 0.1,
    src: 'data:image/png;base64,AA=='
  };
  const moved = E.transformReference(r, { x: -100, y: -100 }, 'move');
  near(moved.x, 0);
  near(moved.y, 0);
  const outside = E.transformReference(r, { x: 1400, y: 800 }, 'move');
  near(outside.x, 1450);
  near(outside.y, 840);
  const free = E.transformReference(r, { x: 100, y: 100 }, 'se');
  near(free.w, 300);
  near(free.h, 200);
  const edge = E.transformReference(r, { x: 100, y: 100 }, 'e');
  near(edge.w, 300);
  near(edge.h, 100);
  const proportional = E.transformReference(r, { x: -200, y: -200 }, 'nw', true);
  near(proportional.w / proportional.h, 2);
  near(proportional.x + proportional.w, 250);
  near(proportional.y + proportional.h, 140);
  near(proportional.x, 0);
  assert.ok(proportional.y >= 0);
  assert.equal(free.src, r.src);
  for (const handle of E.referenceHandles(r))
    assert.equal(E.referenceHit(r, handle, 3), handle.key);
  assert.equal(E.referenceHit(r, { x: 100, y: 80 }, 3), 'move');
  assert.equal(E.referenceHit({ ...r, visible: false }, { x: 100, y: 80 }, 3), null);
});

test('multiple brush symbols alternate by default, and strokes cannot place glyphs above or left', () => {
  const points = D.drawingPoints(
    'line',
    [
      { x: 0, y: 0 },
      { x: 80, y: 0 }
    ],
    brush({ chars: 'ABC' })
  );
  assert.equal(points.map((p) => p.ch).join(''), 'ABCABC');
  const clipped = D.drawingPoints(
    'line',
    [
      { x: -32, y: -32 },
      { x: 1280, y: 700 }
    ],
    brush({ mirrorH: true, mirrorV: true })
  );
  assert.ok(clipped.every((p) => p.x >= 0 && p.y >= 0));
  assert.ok(clipped.some((p) => p.x > C.WIDTH && p.y > C.HEIGHT));
});
test('reference image stays in its grid draft and native project, never in Dota JSON', () => {
  const doc = C.createDocument('First');
  doc.reference = {
    src: 'data:image/png;base64,AA==',
    name: 'Guide',
    x: 0,
    y: 0,
    w: 1193,
    h: 593,
    opacity: 0.1,
    visible: true
  };
  const second = C.addConfig(doc, 'Second');
  assert.equal(second.reference, undefined);
  const restored = C.switchConfig(C.importProject(second), 0);
  assert.deepEqual(restored.reference, doc.reference);
  assert.ok(!JSON.stringify(C.exportDota(restored)).includes('data:image'));
  for (const patch of [
    { opacity: 2 },
    { src: 'https://example.com/file.png' },
    { w: 0 },
    { x: Infinity }
  ])
    assert.throws(() => C.importProject({ ...doc, reference: { ...doc.reference, ...patch } }));
});
test('malformed row glyphs and stale row strings cannot be loaded', () => {
  const doc = documentOf([
    { x: 20, y: 20 },
    { x: 80, y: 20 }
  ]);
  E.mergeRows(doc);
  for (const mutate of [
    (e) => (e.rowGlyphs[0].x = Infinity),
    (e) => (e.rowGlyphs[0].text = 'ABC'),
    (e) => (e.rowText = 'WRONG')
  ]) {
    const bad = C.clone(doc);
    mutate(bad.entities[0]);
    assert.throws(() => C.importProject(bad));
  }
});
