const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const { reflectItems, mergeRows } = require('../scripts/edit-operations.mjs');
const { gamePreviewLayout } = require('../scripts/game-preview.mjs');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('reflection preserves Braille, measured text spacing, upright glyphs and Dota export', () => {
  for (const axis of ['horizontal', 'vertical']) {
    const doc = C.createDocument();
    doc.entities.push(
      C.entity(doc, {
        type: 'text',
        text: '⠿ A\n⣷',
        x: 110,
        y: 100,
        w: 70,
        h: 60,
        textMetrics: { text: '⠿ A\n⣷', advances: [11, 7, 16, 0, 14] },
        rotation: 37
      })
    );
    const before = C.textGlyphs(doc.entities[0], true),
      history = new C.History();
    history.push(doc);
    const flipped = reflectItems(doc, new Set(doc.entities.map((e) => e.id)), axis);
    assert.equal(flipped.length, 3);
    assert.deepEqual(
      flipped.map((g) => g.text),
      ['⠿', 'A', '⣷']
    );
    assert.ok(flipped.every((g) => g.rotation === 0));
    const a = C.bounds(before, true),
      b = C.bounds(flipped, true);
    for (const key of ['x', 'y', 'w', 'h']) near(a[key], b[key]);
    const restored = reflectItems(doc, new Set(flipped.map((e) => e.id)), axis);
    restored.forEach((g, i) => {
      near(g.x, before[i].x);
      near(g.y, before[i].y);
    });
    const output = C.exportDota(doc).configs[0].categories;
    assert.deepEqual(
      output.map((g) => g.category_name),
      ['⠿', 'A', '⣷']
    );
    assert.ok(output.every((g) => g.width === 30 && g.height === 30));
    assert.equal(history.undo(doc).entities[0].text, '⠿ A\n⣷');
  }
});

test('horizontal row reflection changes character positions, can merge and reflect back', () => {
  const doc = C.createDocument();
  doc.entities.push(
    C.entity(doc, {
      type: 'text',
      text: 'ABC',
      x: 20,
      y: 30,
      w: 80,
      h: 30,
      textMetrics: { text: 'ABC', advances: [10, 20, 14] }
    })
  );
  let flipped = reflectItems(doc, new Set(doc.entities.map((e) => e.id)), 'horizontal');
  assert.deepEqual(
    flipped.map((g) => g.x),
    [50, 40, 20]
  );
  mergeRows(doc);
  assert.equal(doc.entities.length, 1);
  assert.equal(doc.entities[0].text, 'CBA');
  flipped = reflectItems(doc, new Set(doc.entities.map((e) => e.id)), 'horizontal');
  assert.deepEqual(
    flipped.sort((a, b) => a.x - b.x).map((g) => [g.text, g.x]),
    [
      ['A', 20],
      ['B', 30],
      ['C', 50]
    ]
  );
});

test('mixed selection mirrors hero group positions with headers while locked objects stay untouched', () => {
  const doc = C.createDocument();
  doc.layers.push({ id: 'locked', name: 'Locked', visible: true, locked: true });
  doc.entities.push(
    C.entity(doc, { type: 'heroes', name: 'Heroes', x: 50, y: 40, w: 80, h: 100, heroIds: [1, 2] }),
    C.entity(doc, { type: 'symbol', text: '@', x: 200, y: 230, w: 30, h: 30 }),
    C.entity(doc, { type: 'symbol', text: 'X', layer: 'locked', x: 500, y: 400 })
  );
  const untouched = C.clone(doc.entities[2]);
  const flipped = reflectItems(doc, new Set(doc.entities.map((e) => e.id)), 'vertical');
  assert.equal(flipped[0].y, 140);
  assert.equal(flipped[1].y, 40);
  assert.deepEqual(flipped[0].heroIds, [1, 2]);
  assert.deepEqual(doc.entities[2], untouched);
  assert.equal(new Set(doc.entities.map((e) => e.id)).size, doc.entities.length);
});

test('game preview uses a fixed 1193×593 viewport within the picking screen at every aspect ratio', () => {
  for (const [w, h] of [
    [1920, 1080],
    [1440, 900],
    [2560, 1080],
    [390, 844]
  ]) {
    const frame = gamePreviewLayout(w, h);
    near(frame.w / frame.h, 1193 / 593);
    assert.ok(frame.x >= 0 && frame.y >= 0 && frame.x + frame.w <= w && frame.y + frame.h <= h);
  }
  near(gamePreviewLayout(1920, 1080).scale, 1.5);
});
