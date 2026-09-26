const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const { DOTA } = require('../scripts/dota-rendering.mjs');
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('height-limited hero groups pack all fitting columns, including the seventh Strength column', () => {
  const layout = C.heroLayout({ w: 250, h: 340, heroIds: Array(36).fill(1) });
  assert.equal(layout.cols, 7);
  assert.equal(layout.rows, 6);
  near(layout.scale, 2 / 3);
  assert.ok(layout.cols * layout.stepX <= 242);
  assert.ok((layout.cols + 1) * layout.stepX > 242);
});

test('reference group reproduces the game screenshot card size and pitch', () => {
  const group = {
    type: 'heroes',
    x: 321.739136,
    y: 43.47826,
    w: 488.695648,
    h: 132.17392,
    heroIds: [25, 76, 90, 106, 128]
  };
  const layout = C.heroLayout(group);
  assert.equal(layout.cols, 5);
  assert.equal(layout.rows, 1);
  // Measured game screenshot at 115%: 74 × 129 portraits, 88 px pitch.
  near(layout.cardW * 1.15, 74, 0.2);
  near(layout.cardH * 1.15, 129, 0.1);
  near(layout.stepX * 1.15, 88, 0.3);
  near(layout.left, 9.984285301204819);
  assert.equal(C.visualHeight(group), group.h + 20);
});

test('compact groups scale image margins along with the portraits', () => {
  const large = C.heroLayout({ w: 500, h: 146.08696, heroIds: [128, 71, 111, 131] });
  const compact = C.heroLayout({ w: 172.17392, h: 76.521767, heroIds: [61, 92, 136, 73, 38] });
  assert.equal(large.cols, 4);
  assert.equal(compact.cols, 5);
  near(large.cardW * 1.15, 82, 0.3);
  near(compact.cardW * 1.15, 32, 0.3);
  assert.ok(compact.gap < large.gap);
  const wide = C.heroLayout({ w: 10000, h: 100, heroIds: Array(50).fill(1) });
  assert.equal(wide.rows, 1);
});

test('visible bounds, Shift resizing and export agree about the separate game header', () => {
  const doc = C.createDocument();
  const group = C.entity(doc, { type: 'heroes', x: 80, y: 90, w: 200, h: 100, heroIds: [25] });
  doc.entities.push(group);
  const before = C.bounds([group], true);
  assert.deepEqual(before, { x: 80, y: 90, w: 200, h: 120 });
  const after = C.resizeBounds(before, { x: 100, y: 0 }, 'se', true, 30);
  Object.assign(group, C.transformBounds(group, before, after, true));
  assert.deepEqual(C.bounds([group], true), after);
  near(group.w / C.visualHeight(group), before.w / before.h);
  const output = C.exportDota(doc);
  assert.equal(output.configs[0].categories[0].height, 160);
  assert.deepEqual(C.bounds(C.importDota(output).entities, true), after);
  group.y = C.HEIGHT - group.h - DOTA.header + 1;
  assert.equal(C.outside(group), true);
});
