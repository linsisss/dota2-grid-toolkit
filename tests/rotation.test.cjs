const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/core.mjs').default;
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const text = (overrides = {}) => ({ type: 'text', x: 200, y: 180, w: 160, h: 30, ...overrides });
const transformed = (items, delta) => {
  const changes = C.rotateItems(items, C.selectionFrame(items), delta);
  return items.map((item, index) => ({ ...item, ...changes[index] }));
};

test('arbitrary text rotation preserves dimensions and the pivot, and can be reversed', () => {
  const original = text();
  for (const angle of [37.25, -87.1, 180, 359.9, 720.5]) {
    const [rotated] = transformed([original], angle);
    near(rotated.x, original.x);
    near(rotated.y, original.y);
    near(rotated.rotation, C.normalizeAngle(angle));
    assert.equal(rotated.w, original.w);
    assert.equal(rotated.h, original.h);
    const [restored] = transformed([rotated], -angle);
    near(restored.rotation, 0);
    near(restored.x, original.x);
    near(restored.y, original.y);
  }
});

test('rotating an ASCII selection moves positions rigidly while its glyph boxes stay upright', () => {
  const originals = [text({ w: 30 }), text({ x: 340, y: 240, w: 30 })];
  const before = C.selectionFrame(originals),
    rotated = transformed(originals, 53.7);
  const after = C.selectionFrame(rotated);
  near(after.w, before.w);
  near(after.h, before.h);
  for (const item of rotated) {
    const [glyph] = C.textGlyphs(item);
    assert.equal(glyph.rotation, 0);
    assert.deepEqual(C.bounds([item], true), { x: item.x, y: item.y, w: item.w, h: item.h });
  }
  near(C.frameCenter(before).x, C.frameCenter(after).x);
  near(C.frameCenter(before).y, C.frameCenter(after).y);
  near(
    Math.hypot(rotated[0].x - rotated[1].x, rotated[0].y - rotated[1].y),
    Math.hypot(originals[0].x - originals[1].x, originals[0].y - originals[1].y)
  );
  const restored = transformed(rotated, -53.7);
  restored.forEach((item, i) => {
    near(item.x, originals[i].x);
    near(item.y, originals[i].y);
  });
});

test('pointer angles cross the 180 degree boundary continuously in either direction', () => {
  const center = { x: 100, y: 100 };
  const p = (angle) => C.rotatePoint({ x: 150, y: 100 }, center, angle);
  near(C.rotationDelta(center, p(179), p(-179)), 2);
  near(C.rotationDelta(center, p(-179), p(179)), -2);
  let total = 0;
  for (let angle = 0; angle < 720; angle += 10)
    total += C.rotationDelta(center, p(angle), p(angle + 10));
  near(total, 720);
  assert.equal(C.rotationDelta(center, p(0), center), 0);
});

test('reversing a rotated selection of unequal text runs does not drift its pivot', () => {
  const original = [text({ text: 'ABC', w: 150 }), text({ text: 'LONGER TEXT', w: 150, y: 220 })];
  const rotated = transformed(original, 37),
    restored = transformed(rotated, -37);
  restored.forEach((item, index) => {
    near(item.x, original[index].x);
    near(item.y, original[index].y);
    near(item.rotation, 0);
  });
});

test('rotated hit testing and outer-corner handles distinguish movement, resize and rotation at every zoom', () => {
  const item = text({ rotation: 37 }),
    frame = C.selectionFrame([item]);
  const center = C.frameCenter(frame);
  assert.equal(C.containsPoint(item, center), true);
  assert.equal(C.containsPoint(item, { x: item.x, y: item.y }), true);
  assert.equal(C.containsPoint(item, { x: item.x - 1, y: item.y }), false);
  for (const zoom of [0.15, 0.5, 1, 2.5]) {
    for (const corner of C.frameCorners(frame)) {
      assert.deepEqual(C.transformHandle(frame, corner, zoom, true), {
        type: 'resize',
        corner: corner.corner
      });
      const local = {
        x: corner.corner.includes('w') ? frame.x - 18 / zoom : frame.x + frame.w + 18 / zoom,
        y: corner.corner.includes('n') ? frame.y - 18 / zoom : frame.y + frame.h + 18 / zoom
      };
      const outer = C.rotatePoint(local, center, frame.rotation);
      assert.deepEqual(C.transformHandle(frame, outer, zoom, true), {
        type: 'rotate',
        corner: corner.corner
      });
      assert.equal(C.transformHandle(frame, outer, zoom, false), null);
    }
    assert.equal(C.transformHandle(frame, center, zoom, true), null);
  }
});

test('resizing tilted text anchors the opposite world corner and Shift preserves proportions', () => {
  const item = text({ rotation: 41.2 }),
    frame = C.selectionFrame([item]);
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    for (const proportional of [false, true]) {
      const opposite = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }[corner];
      const oldAnchor = C.frameCorners(frame).find((p) => p.corner === opposite);
      const delta = C.rotatePoint(
        { x: corner.includes('w') ? -70 : 70, y: corner.includes('n') ? -10 : 10 },
        { x: 0, y: 0 },
        frame.rotation
      );
      const [change] = C.resizeInFrame([item], frame, delta, corner, proportional);
      const next = { ...item, ...change },
        anchor = C.frameCorners(C.selectionFrame([next])).find((p) => p.corner === opposite);
      near(anchor.x, oldAnchor.x);
      near(anchor.y, oldAnchor.y);
      if (proportional) near(next.w / next.h, item.w / item.h);
      near(next.rotation, item.rotation);
    }
  }
});

test('rotation survives history, duplication, grid switching and project import without adding unsupported Dota fields', () => {
  const doc = C.createDocument();
  doc.entities.push(C.entity(doc, { ...text(), text: 'ROTATE' }));
  const before = C.clone(doc),
    history = new C.History();
  history.push(before);
  Object.assign(
    doc.entities[0],
    C.rotateItems(doc.entities, C.selectionFrame(doc.entities), 27.5)[0]
  );
  assert.deepEqual(history.undo(doc), before);
  assert.deepEqual(history.redo(before), doc);
  const copy = C.entity(doc, C.clone(doc.entities[0]));
  near(copy.rotation, 27.5);
  assert.notEqual(copy.id, doc.entities[0].id);
  const second = C.addConfig(doc, 'Second');
  assert.ok(!C.warnings(second).some((warning) => warning.includes('наклон')));
  const restored = C.switchConfig(C.importProject(JSON.parse(JSON.stringify(second))), 0);
  assert.deepEqual(restored.entities, doc.entities);
  const categories = C.exportDota(restored).configs[0].categories;
  const rendered = C.textGlyphs(restored.entities[0]);
  assert.equal(categories.length, 6);
  assert.equal(categories.map((category) => category.category_name).join(''), 'ROTATE');
  categories.forEach((category, index) => {
    assert.equal(category.rotation, undefined);
    assert.ok(Math.abs(category.x_position - rendered[index].x) < 0.000001);
    assert.ok(Math.abs(category.y_position - rendered[index].y) < 0.000001);
    assert.equal(category.width, 30);
    assert.equal(category.height, 30);
  });
  assert.deepEqual(C.exportDota(C.importDota(C.exportDota(restored))), C.exportDota(restored));
  doc.layers.find((l) => l.id === 'decor').visible = false;
  assert.ok(!C.warnings(doc).some((warning) => warning.includes('наклон')));
});

test('invalid native rotation is rejected and overflow follows upright glyph positions', () => {
  for (const angle of ['30', null, Infinity, 360001]) {
    const doc = C.createDocument();
    doc.entities.push(C.entity(doc, { ...text(), rotation: angle }));
    assert.throws(() => C.importProject(doc), /объект/);
  }
  assert.equal(C.outside(text({ y: 5, rotation: 0 })), false);
  assert.equal(C.outside(text({ y: 5, rotation: 90 })), false);
  assert.equal(C.outside(text({ text: 'LONG TEXT', y: 5, rotation: 90 })), true);
});

test('a rotated text run uses measured letter spacing, spaces and line breaks without rotating glyphs', () => {
  const item = text({
    text: 'A B\n日',
    w: 90,
    h: 50,
    rotation: 90,
    textMetrics: { text: 'A B\n日', advances: [11, 7, 13, 0, 18] }
  });
  const glyphs = C.textGlyphs(item);
  assert.deepEqual(
    glyphs.map((glyph) => glyph.text),
    ['A', 'B', '日']
  );
  assert.ok(glyphs.every((glyph) => glyph.rotation === 0 && glyph.w === 30 && glyph.h === 30));
  near(glyphs[0].x, glyphs[1].x);
  near(glyphs[1].y - glyphs[0].y, 18);
  near(glyphs[0].x - glyphs[2].x, 20);
  near(glyphs[0].y, glyphs[2].y);
  for (const glyph of glyphs)
    assert.equal(C.containsPoint(item, { x: glyph.x + 15, y: glyph.y + 15 }), true);
  assert.deepEqual(C.textGlyphs({ ...item, rotation: 0 }), [{ ...item, rotation: 0 }]);
});

test('expanded text respects the Dota category limit before allocating output and validates stored metrics', () => {
  const doc = C.createDocument();
  for (let i = 0; i < 3; i++)
    doc.entities.push(C.entity(doc, { text: 'A'.repeat(4000), rotation: 20 }));
  assert.throws(() => C.assertCategoryLimit(doc), /10 000/);
  assert.throws(() => C.exportDota(doc), /10 000/);
  doc.layers.find((layer) => layer.id === 'decor').visible = false;
  assert.equal(C.exportDota(doc).configs[0].categories.length, 0);
  const invalid = C.createDocument();
  invalid.entities.push(
    C.entity(invalid, { text: 'AB', textMetrics: { text: 'AB', advances: [12] } })
  );
  assert.throws(() => C.importProject(invalid), /объект/);
});
