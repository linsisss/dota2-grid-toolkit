const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const { planOptimization, optimizeCategories, eliminationOrder } = require('../scripts/category-optimization.mjs');
const { planCategoryRows } = require('../scripts/export-rows.mjs');
const { clampZoom, sliderToZoom, zoomToSlider, wheelZoom } = require('../scripts/zoom.mjs');
const measure = (text) => ({ width: Array.from(text).length * 10 });
const add = (doc, props = {}) => {
  const item = C.entity(doc, { type: 'symbol', text: '.', x: 0, y: 0, w: 30, h: 30, ...props });
  doc.entities.push(item); return item;
};

test('continuous zoom supports arbitrary percentages, smooth wheel increments and invertible slider travel', () => {
  for (const z of [0.01, .157, .733, 1, 1.375, 3.41, 8]) {
    assert.ok(Math.abs(sliderToZoom(zoomToSlider(z)) - z) < 1e-10);
    assert.equal(clampZoom(z), z);
  }
  assert.equal(clampZoom(NaN), 1); assert.equal(clampZoom(40), 8); assert.equal(clampZoom(-1), .01);
  assert.ok(wheelZoom(1, -1) > 1 && wheelZoom(1, -1) < 1.01);
  assert.ok(Math.abs(wheelZoom(wheelZoom(1.375, -7.5), 7.5) - 1.375) < 1e-10);
  assert.equal(wheelZoom(1, 1, 1), wheelZoom(1, 16));
});

test('lossless planning keeps exact rows together, preserves every editable symbol and matches Dota export', () => {
  const doc = C.createDocument();
  for (let y = 0; y < 12; y++) for (let x = 0; x < 30; x++) add(doc, { x: x * 10, y: y * 12 });
  const before = C.clone(doc), plan = planOptimization(doc, measure), result = optimizeCategories(plan);
  assert.equal(plan.rawCount, 360); assert.equal(plan.losslessCount, 12);
  assert.equal(result.count, 12); assert.equal(result.removed, 0);
  assert.deepEqual(result.doc, before); assert.deepEqual(doc, before);
  const smaller = optimizeCategories(plan, 6);
  assert.equal(smaller.count, 6); assert.equal(smaller.doc.entities.length, 180);
  assert.equal(C.exportDota(smaller.doc, measure).configs[0].categories.length, 6);
  const rows = planCategoryRows(C.categoryEntries(doc), measure);
  assert.equal(rows.groups.flat().length, 360);
  assert.equal(new Set(rows.groups.flat()).size, 360);
});

test('adaptive reduction favours thin detached contours over dense fill and retains original geometry', () => {
  const doc = C.createDocument();
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) add(doc, { x: x * 3.17, y: y * 3.19 });
  const line = [];
  for (let i = 0; i < 80; i++) line.push(add(doc, { x: 150 + i * 3.17, y: 40 + Math.sin(i / 20) * 2 }));
  const before = C.clone(doc), plan = planOptimization(doc, measure), result = optimizeCategories(plan, 200);
  assert.ok(result.count <= 200);
  const kept = new Set(result.doc.entities.map((e) => e.id));
  const fraction = line.filter((e) => kept.has(e.id)).length / line.length;
  assert.ok(fraction > 200 / doc.entities.length + 0.15, `contour retention ${fraction}`);
  for (const e of result.doc.entities) assert.deepEqual(e, before.entities.find((item) => item.id === e.id));
  assert.deepEqual(doc, before); assert.deepEqual(optimizeCategories(plan, 200), result);
});

test('optimization protects hero groups, text, hidden and locked layers, other grids and native metadata', () => {
  let doc = C.createDocument('Other'); add(doc, { text: '⣿' });
  doc = C.addConfig(doc, 'Current');
  for (let i = 0; i < 200; i++) add(doc, { x: i * 3.17, y: 22 });
  const protectedItems = [add(doc, { type: 'text', text: 'A title' }), add(doc, { type: 'heroes', heroIds: [127, 1], w: 340, h: 195 }), add(doc, { layer: 'background', text: 'ア' })];
  doc.layers.find((l) => l.id === 'background').locked = true;
  doc.reference = { src: 'data:image/png;base64,test', x: 0, y: 0, w: 100, h: 100, opacity: .1 };
  const before = C.clone(doc), plan = planOptimization(doc, measure), result = optimizeCategories(plan, 30);
  for (const e of protectedItems) assert.deepEqual(result.doc.entities.find((item) => item.id === e.id), e);
  assert.deepEqual(result.doc.configDrafts, before.configDrafts);
  assert.deepEqual(result.doc.source, before.source); assert.deepEqual(result.doc.reference, before.reference);
  const history = new C.History(); history.push(doc); assert.deepEqual(history.undo(result.doc), before);
  assert.throws(() => optimizeCategories(plan, NaN), /число/);
  assert.equal(optimizeCategories(plan, -100).budget, plan.minimum);
});

test('a full 10000-symbol canvas can be planned and reduced, including coincident points', () => {
  const doc = C.createDocument();
  for (let i = 0; i < 10000; i++) add(doc, { x: (i % 100) * 3.17, y: Math.floor(i / 100) * 3.19 });
  const plan = planOptimization(doc, measure), result = optimizeCategories(plan, 1000);
  assert.ok(plan.losslessCount < 2000, `${plan.losslessCount} after joining rows`);
  assert.ok(result.count <= 1000 && result.count > 900, `${result.count}`);
  assert.equal(result.doc.entities.length, 10000 - result.removed);
  assert.equal(optimizeCategories(plan).removed, 0, 'the full budget removes nothing');
  assert.equal(optimizeCategories(plan, plan.losslessCount - 1).count, plan.losslessCount - 1, 'one less is exactly one less');
  for (const e of doc.entities) { e.x = 40; e.y = 20; }
  const overlap = optimizeCategories(planOptimization(doc, measure), 300);
  assert.equal(overlap.count, 300);
});

test('elimination removes glyphs lying on others first, then thins a line evenly, never leaving a hole', () => {
  const units = Array.from({ length: 40 }, (_, i) => ({ layer: 'decor', dots: [{ x: i * 4, y: 0 }] }));
  units.push({ layer: 'decor', dots: [{ x: 8, y: 0 }] });
  const order = eliminationOrder(units);
  assert.equal(order.at(-1), 40, 'the copy goes first');
  assert.deepEqual([...order].sort((a, b) => a - b), [...units.keys()], 'every unit is ordered once');
  for (const keep of [20, 10]) {
    const xs = order.slice(0, keep).map((k) => units[k].dots[0].x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]), step = 156 / (keep - 1);
    assert.ok(Math.max(...gaps) <= step * 1.75 && Math.min(...gaps) >= step * 0.5, `${keep}: gaps ${gaps.join(',')}`);
  }
  const layered = eliminationOrder([{ layer: 'a', dots: [{ x: 0, y: 0 }] }, { layer: 'b', dots: [{ x: 0, y: 0 }] }]);
  assert.deepEqual(layered, [0, 1], 'each layer keeps one unit even when they overlap');
});

test('small separate shapes (a mouth, an eye) outlast long lines', () => {
  const units = [];
  for (let i = 0; i < 120; i++) units.push({ layer: 'decor', dots: [{ x: 20 + i * 4, y: 100 + Math.sin(i / 9) * 6 }] });
  const ring = [];
  for (let i = 0; i < 16; i++) { ring.push(units.length); units.push({ layer: 'decor', dots: [{ x: 300 + Math.cos(i / 16 * Math.PI * 2) * 10, y: 40 + Math.sin(i / 16 * Math.PI * 2) * 10 }] }); }
  const kept = new Set(eliminationOrder(units).slice(0, 50));
  const ringKept = ring.filter((k) => kept.has(k)).length / ring.length, lineKept = (50 - ring.filter((k) => kept.has(k)).length) / 120;
  assert.ok(ringKept > lineKept * 1.5, `ring ${ringKept.toFixed(2)} vs line ${lineKept.toFixed(2)}`);
});
