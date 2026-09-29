const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const E = require('../scripts/edit-operations.mjs');
const G = require('../scripts/smart-guides.mjs');

const symbol = (doc, x, y, extra = {}) => C.entity(doc, { type: 'symbol', text: '●', name: '●', x, y, w: 30, h: 30, ...extra });
function scene() {
  const doc = C.createDocument();
  const art = C.addArtwork(doc, [{ type: 'symbol', text: '●', name: '●', x: 100, y: 100, w: 30, h: 30 },
    { type: 'symbol', text: '●', name: '●', x: 160, y: 140, w: 30, h: 30 }], 'Сердце');
  const a = symbol(doc, 400, 50, { layer: 'decor' }), b = symbol(doc, 700, 300, { layer: 'decor' });
  doc.entities.push(a, b);
  return { doc, art, a, b };
}
const box = (items) => C.bounds(items, true);

test('a whole ASCII layer is one object; glyphs picked out of it are separate objects', () => {
  const { doc, art, a } = scene();
  assert.deepEqual(E.selectionUnits(doc, [...art.items, a]).map((unit) => unit.length), [2, 1]);
  assert.deepEqual(E.selectionUnits(doc, [art.items[0], a]).map((unit) => unit.length), [1, 1]);
});

test('several objects align to each other and keep their internal layout; one object aligns to the canvas', () => {
  for (const side of ['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']) {
    const { doc, art, a, b } = scene();
    const inner = art.items[1].x - art.items[0].x;
    const frame = box([...art.items, a, b]);
    const units = E.selectionUnits(doc, [...art.items, a, b]);
    E.alignUnits(units, side, C.canvasSize(doc));
    const edge = (u) => ({ left: box(u).x, hcenter: box(u).x + box(u).w / 2, right: box(u).x + box(u).w,
      top: box(u).y, vmiddle: box(u).y + box(u).h / 2, bottom: box(u).y + box(u).h })[side];
    assert.ok(units.every((unit) => Math.abs(edge(unit) - edge(units[0])) < 1e-6), side);
    assert.equal(art.items[1].x - art.items[0].x, inner);
    if (side === 'left') assert.equal(box([a]).x, frame.x);
  }
  const { doc, a } = scene();
  E.alignUnits(E.selectionUnits(doc, [a]), 'hcenter', { w: 1193, h: 593 });
  assert.ok(Math.abs(box([a]).x + box([a]).w / 2 - 1193 / 2) < 1e-6);
});

test('distribution leaves the outer objects and makes the gaps equal', () => {
  const doc = C.createDocument();
  const items = [0, 90, 500, 1000].map((x) => symbol(doc, x, 10, { layer: 'decor' }));
  doc.entities.push(...items);
  const outer = [box([items[0]]).x, box([items[3]]).x];
  E.distributeUnits(E.selectionUnits(doc, items), 'x');
  const boxes = items.map((item) => box([item]));
  assert.deepEqual([boxes[0].x, boxes[3].x], outer);
  const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i].x + boxes[i].w));
  assert.ok(gaps.every((gap) => Math.abs(gap - gaps[0]) < 1e-6));
});

test('grouping moves objects into one layer, reuses a whole ASCII layer, survives a reload and can be undone by ungrouping', () => {
  const { doc, art, a, b } = scene();
  const layer = C.groupEntities(doc, [...art.items, a].map((e) => e.id));
  assert.equal(layer.group, true);
  assert.ok([...art.items, a].every((e) => e.layer === layer.id));
  assert.equal(doc.layers.some((l) => l.id === art.layer.id), false, 'emptied ASCII layer is removed');
  // Drawn where its topmost member was: above the decor layer that held `a`.
  assert.ok(doc.layers.findIndex((l) => l.id === layer.id) > doc.layers.findIndex((l) => l.id === 'decor'));
  assert.equal(b.layer, 'decor');
  const reloaded = C.importProject(JSON.parse(JSON.stringify(doc)));
  assert.equal(reloaded.layers.find((l) => l.id === layer.id).group, true);
  assert.equal(C.exportDota(reloaded).configs[0].categories.length, C.exportDota(doc).configs[0].categories.length);
  assert.equal(C.ungroupLayers(doc, [layer.id]), 1);
  assert.equal(doc.layers.some((l) => l.id === layer.id), false);
  assert.ok([...art.items, a].every((e) => e.layer === 'decor'));

  const other = scene();
  const same = C.groupEntities(other.doc, other.art.items.map((e) => e.id));
  assert.equal(same.id, other.art.layer.id);
  assert.equal(same.group, true);
  assert.throws(() => C.groupEntities(other.doc, [other.a.id]), /два объекта/);
});

test('smart guides snap a dragged box to other objects and the canvas centre only within the threshold', () => {
  const lines = G.guideLines([{ x: 300, y: 100, w: 60, h: 40 }], { w: 1193, h: 593 });
  const near = G.snapMove({ x: 303, y: 400, w: 30, h: 30 }, lines, 6);
  assert.equal(near.dx, -3);
  assert.deepEqual(near.guides.find((g) => g.axis === 'x'), { axis: 'x', v: 300, from: 100, to: 430 });
  const centre = G.snapMove({ x: 1193 / 2 - 15 + 4, y: 593 / 2 - 15 - 2, w: 30, h: 30 }, lines, 6);
  assert.deepEqual([centre.dx, centre.dy], [-4, 2]);
  const far = G.snapMove({ x: 520, y: 450, w: 30, h: 30 }, lines, 6);
  assert.deepEqual([far.dx, far.dy, far.guides], [0, 0, []]);
});

test('the visible frame of text and symbols is their glyph ink, not the 30px category box', () => {
  const { inkFrame } = require('../scripts/canvas-input.mjs');
  const doc = C.createDocument();
  // A glyph whose ink starts 4px in and 3px down, 10 × 11; a text row twice as wide.
  const measure = (text) => ({ x: 4, y: 3, w: 10 * Array.from(text).length, h: 11 });
  const star = symbol(doc, 100, 50, { layer: 'decor', text: '★', name: '★' });
  assert.deepEqual(inkFrame([star], measure), { x: 104, y: 53, w: 10, h: 11, rotation: 0 });
  const row = C.entity(doc, { type: 'text', text: 'AB', name: 'AB', x: 200, y: 50, w: 60, h: 30, layer: 'decor' });
  assert.deepEqual(inkFrame([star, row], measure), { x: 104, y: 53, w: 120, h: 11, rotation: 0 });
  // Hero groups keep their title and list.
  const group = C.entity(doc, { type: 'heroes', name: 'Г', x: 10, y: 20, w: 100, h: 80, heroIds: [1], layer: 'heroes' });
  assert.deepEqual(inkFrame([group], measure), { x: 10, y: 20, w: 100, h: 100, rotation: 0 });
  // Alignment by what is drawn: the glyph's ink edge lands on the other one's.
  const other = symbol(doc, 300, 90, { layer: 'decor' });
  E.alignUnits([[star], [other]], 'top', undefined, (items) => inkFrame(items, measure));
  assert.equal(inkFrame([star], measure).y, inkFrame([other], measure).y);
});
