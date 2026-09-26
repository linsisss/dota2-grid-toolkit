const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const almost = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Shift resize keeps aspect and the opposite anchor for all four corners', () => {
  const before = { x: 40, y: 70, w: 340, h: 195 };
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    for (const delta of [
      { x: 120, y: 20 },
      { x: -90, y: -40 },
      { x: 0, y: 130 }
    ]) {
      const after = C.resizeBounds(before, delta, corner, true);
      almost(after.w / after.h, before.w / before.h);
      almost(
        corner.includes('w') ? after.x + after.w : after.x,
        corner.includes('w') ? before.x + before.w : before.x
      );
      almost(
        corner.includes('n') ? after.y + after.h : after.y,
        corner.includes('n') ? before.y + before.h : before.y
      );
    }
  }
});

test('free resize changes axes independently and does not jump at pointer down', () => {
  const before = { x: 40, y: 70, w: 340, h: 195 };
  assert.deepEqual(C.resizeBounds(before, { x: 0, y: 0 }, 'nw'), before);
  assert.deepEqual(C.resizeBounds(before, { x: 100, y: -25 }, 'se'), {
    x: 40,
    y: 70,
    w: 440,
    h: 170
  });
  const northWest = C.resizeBounds(before, { x: 100, y: -25 }, 'nw');
  for (const [key, value] of Object.entries({ x: 140, y: 45, w: 240, h: 220 }))
    almost(northWest[key], value);
});

test('dragging past the opposite corner clamps size without inversion or lost proportions', () => {
  const before = { x: 0, y: 0, w: 340, h: 195 };
  for (const proportional of [false, true]) {
    const result = C.resizeBounds(before, { x: -1000, y: -1000 }, 'se', proportional);
    assert.ok(result.w >= 10 && result.h >= 10);
    if (proportional) almost(result.w / result.h, before.w / before.h);
  }
});

test('Shift toggling recomputes from original geometry, with one undoable transaction', () => {
  const doc = C.createDocument();
  doc.entities.push(C.entity(doc, { type: 'heroes', x: 40, y: 70, w: 340, h: 195 }));
  const before = C.clone(doc),
    bounds = C.bounds(before.entities),
    delta = { x: 150, y: 20 };
  for (const shift of [false, true, false, true]) {
    Object.assign(
      doc.entities[0],
      C.transformBounds(before.entities[0], bounds, C.resizeBounds(bounds, delta, 'nw', shift))
    );
  }
  almost(doc.entities[0].w / doc.entities[0].h, 340 / 195);
  const history = new C.History(35);
  history.push(before);
  const restored = history.undo(doc);
  assert.deepEqual(restored, before);
  assert.deepEqual(history.redo(restored), doc);
});

test('multiple objects preserve relative placement when resized proportionally', () => {
  const items = [
    { x: 10, y: 20, w: 100, h: 50 },
    { x: 140, y: 30, w: 80, h: 120 }
  ];
  const before = C.bounds(items),
    after = C.resizeBounds(before, { x: 210, y: 0 }, 'se', true);
  const transformed = items.map((item) => C.transformBounds(item, before, after));
  almost(transformed[1].x - transformed[0].x, 260);
  almost(transformed[1].w / transformed[1].h, 80 / 120);
  assert.deepEqual(C.bounds(transformed), after);
});

test('handles hit at any zoom using canvas coordinates and screen-pixel tolerance', () => {
  const bounds = { x: 40, y: 70, w: 340, h: 195 };
  for (const zoom of [0.3, 0.75, 1.5, 2.5]) {
    assert.equal(C.resizeCorner(bounds, { x: 40 + 4 / zoom, y: 70 + 4 / zoom }, 10 / zoom), 'nw');
    assert.equal(C.resizeCorner(bounds, { x: 380, y: 265 }, 10 / zoom), 'se');
  }
  assert.equal(C.resizeCorner(bounds, { x: 200, y: 140 }, 10), null);
  const small = { x: 100, y: 100, w: 43.2, h: 52 };
  assert.equal(C.resizeCorner(small, { x: 116, y: 112 }, 20), null);
  assert.equal(C.resizeCorner(small, { x: 100, y: 100 }, 20), 'nw');
});

test('symbol counter includes artwork text and hidden layers, excludes spaces and hero names', () => {
  const doc = C.createDocument();
  doc.entities.push(
    C.entity(doc, { type: 'heroes', name: 'HERO GROUP', heroIds: [1, 2] }),
    C.entity(doc, { type: 'text', text: ' A 🦊\nБ\t ' }),
    C.entity(doc, { type: 'symbol', text: '✦', layer: 'background' })
  );
  doc.layers.find((l) => l.id === 'background').visible = false;
  assert.equal(C.countSymbols(doc), 4);
  const history = new C.History(5);
  history.push(doc);
  const edited = C.clone(doc);
  edited.entities.push(C.entity(edited, { type: 'text', text: 'XYZ' }));
  assert.equal(C.countSymbols(edited), 7);
  assert.equal(C.countSymbols(history.undo(edited)), 4);
});
