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
    ([t]) => !['smart', 'eyedropper', 'lasso', 'eraser', 'scatter'].includes(t)
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
  // The eraser aims at the drawn glyph: A's visible centre, not its category corner.
  E.eraseSymbols(doc, { x: 1149, y: 28 }, 5);
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

test('the reference moves and stretches past every edge; a resize keeps its opposite anchor', () => {
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
  near(moved.x, -50); // left and up past the canvas, as right and down
  near(moved.y, -60);
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
  assert.ok(proportional.x < 0 && proportional.y < 0, 'past the origin too');
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

test('eraser size follows wheel and bracket steps proportionally within bounds and is remembered', async () => {
  const Z = await import('../scripts/eraser-size.mjs');
  assert.equal(Z.readEraserSize({ getItem: () => null }), 44);
  const bigger = Z.wheelEraserSize(44, -100), smaller = Z.wheelEraserSize(44, 100);
  assert.ok(bigger > 50 && bigger < 53 && smaller < 38 && smaller > 36);
  // Line-mode wheels (Firefox) move as far as a pixel-mode notch.
  assert.ok(Math.abs(Z.wheelEraserSize(44, -3, 1) - Z.wheelEraserSize(44, -48)) < 1e-9);
  assert.equal(Z.wheelEraserSize(390, -10000), 400);
  assert.equal(Z.wheelEraserSize(8, 10000), 6);
  assert.equal(Z.stepEraserSize(6, 1), 8);
  assert.ok(Z.stepEraserSize(200, 1) > 229 && Z.stepEraserSize(200, -1) < 174);
  const saved = new Map();
  const storage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  Z.storeEraserSize(123.6, storage);
  assert.equal(Z.readEraserSize(storage), 124);
  assert.equal(Z.readEraserSize({ getItem: () => { throw new Error('blocked'); } }), 44);
  assert.equal(Z.readEraserSize({ getItem: () => 'nonsense' }), 44);
});

test('a larger eraser removes every glyph inside its ring and keeps those outside', () => {
  const doc = documentOf([
    { x: 100, y: 100 },
    { x: 130, y: 100 },
    { x: 200, y: 100 }
  ]);
  E.eraseSymbols(doc, { x: 109, y: 108 }, 5);
  assert.equal(doc.entities.length, 2);
  E.eraseSymbols(doc, { x: 139, y: 108 }, 80);
  assert.equal(doc.entities.length, 0);
});

test('replacing a symbol in a selection keeps positions, spaces, heroes and other characters', () => {
  const doc = documentOf([
    { x: 100, y: 100, text: '•' },
    { x: 130, y: 100, text: '•' },
    { x: 160, y: 100, text: '*' },
    { type: 'text', text: '• • *', x: 100, y: 200, w: 120, textMetrics: { text: '• • *', advances: [8, 4, 8, 4, 8] } }
  ]);
  doc.entities.push({ id: 99, type: 'heroes', name: 'Group', heroIds: [1], x: 0, y: 0, w: 60, h: 90, layer: 'decor' });
  const positions = doc.entities.map((e) => [e.x, e.y]);
  assert.deepEqual(E.glyphCounts(doc.entities), [['•', 4], ['*', 2]]);
  assert.equal(E.replaceGlyphs(doc.entities, '•', '♥'), 4);
  assert.deepEqual(doc.entities.map((e) => e.text), ['♥', '♥', '*', '♥ ♥ *', undefined]);
  assert.equal(doc.entities[3].name, '♥ ♥ *');
  assert.equal(doc.entities[3].textMetrics, undefined);
  assert.deepEqual(doc.entities.map((e) => [e.x, e.y]), positions);
  // Empty "from" replaces every visible character; a multi-character target uses its first.
  assert.equal(E.replaceGlyphs(doc.entities, '', '★☆'), 6);
  assert.deepEqual(doc.entities.slice(0, 4).map((e) => e.text), ['★', '★', '★', '★ ★ ★']);
  assert.equal(E.replaceGlyphs(doc.entities, '', '★'), 0);
  assert.throws(() => E.replaceGlyphs(doc.entities, '', ' '), /Укажи/);
});

test('«Изогнутая линия»: the bent line keeps its ends and passes through the dragged middle', async () => {
  const { bentLine } = await import('../scripts/drawing.mjs');
  const a = { x: 100, y: 300 }, b = { x: 500, y: 300 }, through = { x: 300, y: 180 };
  const curve = bentLine(a, b, through, 64);
  assert.deepEqual(curve[0], a); assert.deepEqual(curve.at(-1), b);
  assert.ok(Math.hypot(curve[32].x - through.x, curve[32].y - through.y) < 1e-9, 'halfway it is at the handle');
  assert.ok(curve.every((p) => p.y <= 300 + 1e-9), 'one smooth bow, no overshoot below the ends');
  const straight = bentLine(a, b, { x: 300, y: 300 }, 8);
  assert.ok(straight.every((p) => Math.abs(p.y - 300) < 1e-9), 'the middle left in place is the straight line');
});

test('«Распыление»: glyphs under the brush fly along the stroke, the rest stay, each glyph once', async () => {
  const C = require('../scripts/core.mjs').default;
  const { scatterSymbols } = await import('../scripts/edit-operations.mjs');
  const doc = C.createDocument();
  const art = C.addArtwork(doc, [{ type: 'text', text: '. . . . . . . . . .', name: 'row', x: 100, y: 200, w: 300, h: 30,
    textMetrics: { text: '. . . . . . . . . .', advances: Array(19).fill(10), model: 2 } }], 'art');
  const locked = C.entity(doc, { type: 'symbol', text: '.', x: 150, y: 200, w: 30, h: 30, layer: 'decor' });
  doc.entities.push(locked); doc.layers.find((l) => l.id === 'decor').locked = true;
  const thrown = new Set(), before = C.clone(doc);
  // The brush over the first three dots (x 100, 120, 140 + the glyph centre), moving right.
  assert.equal(scatterSymbols(doc, { x: 129, y: 208 }, 25, { x: 1, y: 0 }, { distance: 3, spread: 30, seed: 7, thrown }), true);
  const dots = doc.entities.filter((e) => e.layer === art.layer.id);
  assert.equal(dots.length, 10, 'the row became single dots, none lost');
  const moved = dots.filter((e) => thrown.has(e.id)), still = dots.filter((e) => !thrown.has(e.id));
  assert.equal(moved.length, 3);
  assert.ok(moved.every((e) => e.x > 100 && Math.abs(e.y - 200) <= Math.tan(Math.PI / 6) * (e.x - 100) + 1), 'thrown to the right, within the spread');
  assert.deepEqual(still.map((e) => e.x).sort((x, y) => x - y), [160, 180, 200, 220, 240, 260, 280], 'the others stay where they were');
  assert.deepEqual(doc.entities.find((e) => e.id === locked.id), locked, 'locked layers are not touched');
  const again = C.clone(doc);
  scatterSymbols(doc, { x: 129, y: 208 }, 25, { x: 1, y: 0 }, { distance: 3, spread: 30, seed: 7, thrown });
  assert.deepEqual(doc.entities.filter((e) => thrown.has(e.id)).map((e) => [e.x, e.y]).sort(), again.entities.filter((e) => thrown.has(e.id)).map((e) => [e.x, e.y]).sort(), 'a thrown dot does not fly twice in one stroke');
  const replay = C.clone(before);
  scatterSymbols(replay, { x: 129, y: 208 }, 25, { x: 1, y: 0 }, { distance: 3, spread: 30, seed: 7 });
  assert.deepEqual(replay.entities.map((e) => [e.x, e.y]).sort(), again.entities.map((e) => [e.x, e.y]).sort(), 'the same stroke gives the same result');
});
