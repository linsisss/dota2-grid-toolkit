const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { join } = require('node:path');
GlobalFonts.registerFromPath(join(__dirname, '../assets/fonts/radiance-semibold.otf'), 'StudioRadiance');
const C = require('../scripts/core.mjs').default;
const trace = import('../scripts/dot-trace.mjs');
const packing = import('../scripts/dot-packing.mjs');
const rendering = import('../scripts/dota-rendering.mjs');

// Luminance of a canvas drawing: black strokes on white.
function drawing(w, h, paint) {
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  paint(ctx);
  const data = ctx.getImageData(0, 0, w, h).data, luma = new Float32Array(w * h);
  for (let i = 0; i < luma.length; i++) luma[i] = data[i * 4] / 255;
  return luma;
}
const circle = (ctx) => { ctx.beginPath(); ctx.arc(100, 60, 40, 0, Math.PI * 2); ctx.stroke(); };

test('a line drawing is recognised and traced as evenly spaced dots on its strokes', async () => {
  const { traceDots } = await trace;
  const luma = drawing(200, 120, circle), { dots, source, ink } = traceDots(luma, 200, 120, { spacing: 5, length: 10 });
  assert.equal(source, 'lines'); assert.equal(ink, 'dark');
  const expected = (2 * Math.PI * 40) / 5;
  assert.ok(Math.abs(dots.length - expected) <= 4, `${dots.length} dots, about ${expected.toFixed(0)} expected`);
  for (const [x, y] of dots) assert.ok(Math.abs(Math.hypot(x - 100, y - 60) - 40) < 2, `dot ${x},${y} lies on the circle`);
  const gaps = dots.map(([x, y]) => Math.min(...dots.filter((d) => d[0] !== x || d[1] !== y).map((d) => Math.hypot(d[0] - x, d[1] - y))));
  assert.ok(Math.min(...gaps) > 3.5 && Math.max(...gaps) < 6.5, `neighbour distance ${Math.min(...gaps).toFixed(1)}–${Math.max(...gaps).toFixed(1)} for a 5 px step`);
});

test('short strokes are dropped, and a photo-like gradient is traced by its edges', async () => {
  const { traceDots, traceSource, traceTone } = await trace;
  const luma = drawing(200, 120, (ctx) => {
    circle(ctx);
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(16, 10); ctx.stroke();
  });
  const kept = traceDots(luma, 200, 120, { length: 20 }).dots;
  assert.ok(kept.every(([x, y]) => !(x < 25 && y < 20)), 'the 6 px dash is not drawn');
  assert.ok(traceDots(luma, 200, 120, { length: 0 }).dots.some(([x, y]) => x < 25 && y < 20), 'with no minimum it is');
  const photo = new Float32Array(200 * 120).map((_, i) => ((i % 200) / 200) * 0.8 + (Math.floor(i / 200) > 60 ? 0.2 : 0));
  assert.equal(traceSource(traceTone(photo, 200, 120).tone), 'edges');
});

test('side branches left by thinning are pruned, the main stroke stays', async () => {
  const { pruneSpurs } = await trace;
  const w = 40, h = 20, sk = new Uint8Array(w * h);
  for (let x = 2; x < 38; x++) sk[10 * w + x] = 1;
  for (let y = 5; y < 10; y++) sk[y * w + 20] = 1;
  pruneSpurs(sk, w, h, 8);
  for (let y = 5; y < 10; y++) assert.equal(sk[y * w + 20], 0, 'the 5 px twig is removed');
  assert.equal(sk.reduce((a, b) => a + b, 0), 36, 'the stroke keeps every pixel');
});

test('packing joins dots of one height into rows, every dot within 1.5 px of where it was', async () => {
  const { packGlyphs } = await packing, { measureCategoryText } = await rendering;
  const ctx = createCanvas(8, 8).getContext('2d'), measure = (text) => measureCategoryText(ctx, text), advances = (text) => measure(text).advances;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const points = Array.from({ length: 600 }, () => ({ ch: '.', x: 40 + random() * 900, y: 30 + Math.floor(random() * 40) * 4.5 + random() * 1.5 }));
  const rows = packGlyphs(points, measure);
  assert.equal(rows.reduce((n, row) => n + row.members.length, 0), points.length, 'every dot is in exactly one row');
  assert.ok(rows.length < points.length / 2, `${points.length} dots → ${rows.length} categories`);
  for (const row of rows) {
    const a = advances(row.text);
    let pen = 0, member = 0;
    Array.from(row.text).forEach((ch, i) => {
      if (ch !== ' ') {
        const point = points[row.members[member++]];
        assert.ok(Math.abs(row.x + pen - point.x) <= 1.5 + 1e-9, `x off by ${(row.x + pen - point.x).toFixed(2)}`);
        assert.ok(Math.abs(row.y - point.y) <= 1 + 1e-9, `y off by ${(row.y - point.y).toFixed(2)}`);
      }
      pen += a[i];
    });
    assert.equal(member, row.members.length);
    assert.ok(Math.abs(row.width - a.reduce((sum, v) => sum + v, 0)) < 1e-9, 'the row width is its measured advance');
    if (row.members.length === 1) assert.deepEqual([row.x, row.y], [points[row.members[0]].x, points[row.members[0]].y], 'a lone dot does not move');
  }
});

test('packing a document keeps locked, rotated, lone and multi-glyph objects, and optimization drops packed rows whole', async () => {
  const { packSymbols } = await packing, { measureCategoryText, measureCategoryWidth } = await rendering;
  const { planOptimization, optimizeCategories } = require('../scripts/category-optimization.mjs');
  const ctx = createCanvas(8, 8).getContext('2d'), measure = (text) => measureCategoryText(ctx, text), advances = (text) => measure(text).advances;
  const doc = C.createDocument(), dot = advances('.')[0], space = advances(' ')[0];
  const add = (props) => { const item = C.entity(doc, { type: 'symbol', text: '.', name: '.', w: 30, h: 30, layer: 'decor', ...props }); doc.entities.push(item); return item; };
  for (let row = 0; row < 20; row++) for (let i = 0; i < 6; i++) add({ x: 100 + i * (dot + space * 2) + (i % 2) * 0.8, y: 50 + row * 12 + (i % 3) * 0.5 });
  const rotated = add({ x: 100, y: 400, rotation: 30 }), text = add({ type: 'text', text: 'AB', name: 'AB', x: 200, y: 400 });
  const star = add({ text: '★', name: '★', x: 100, y: 330 }), foreign = add({ x: 300, y: 50, extra: { category_name: '.', color: 'red' } });
  doc.layers.push({ id: 'locked', name: 'Locked', visible: true, locked: true });
  const locked = add({ x: 100 + dot + space * 2, y: 400, layer: 'locked' });
  const before = C.clone(doc), result = packSymbols(doc, measure);
  assert.deepEqual(doc, before, 'the source document is untouched');
  assert.equal(result.rows.size, 20); assert.equal(result.packed, 120);
  assert.equal(result.doc.entities.length, 25);
  for (const item of [rotated, text, locked, star, foreign]) assert.deepEqual(result.doc.entities.find((e) => e.id === item.id), item);
  for (const row of result.doc.entities.filter((e) => result.rows.has(e.id))) {
    assert.equal(row.type, 'text'); assert.equal(row.text.replace(/ /g, ''), '......');
  }
  const width = (value) => measureCategoryWidth(ctx, value), plan = planOptimization(doc, width, { pack: true });
  assert.equal(plan.losslessCount, 25);
  assert.deepEqual(optimizeCategories(plan).doc, packSymbols(doc, width).doc, 'without a budget it is packing alone');
  const reduced = optimizeCategories(plan, 13);
  assert.ok(reduced.count <= 13, `${reduced.count} categories`);
  const rows = reduced.doc.entities.filter((e) => e.type === 'text' && e.text !== 'AB');
  assert.ok(rows.length >= 6 && rows.every((row) => row.text.replace(/ /g, '') === '......'), 'rows are removed whole');
  for (const item of [text, locked]) assert.ok(reduced.doc.entities.some((e) => e.id === item.id), 'text and locked layers stay');
  assert.deepEqual(doc, before);
});

test('the Kuwahara filter flattens texture but keeps an edge sharp', async () => {
  const { kuwahara } = await trace;
  const w = 60, h = 40;
  let seed = 3;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.3;
  const src = new Float32Array(w * h).map((_, i) => (i % w < 30 ? 0.2 : 0.8) + noise());
  const out = kuwahara(src, w, h, 3);
  const spread = (a, x0, x1) => { const v = []; for (let y = 5; y < h - 5; y++) for (let x = x0; x < x1; x++) v.push(a[y * w + x]); const m = v.reduce((s, q) => s + q, 0) / v.length; return Math.sqrt(v.reduce((s, q) => s + (q - m) ** 2, 0) / v.length); };
  assert.ok(spread(out, 5, 24) < spread(src, 5, 24) / 2, 'the noise on each side is flattened');
  for (let y = 5; y < h - 5; y++) {
    assert.ok(out[y * w + 28] < 0.4 && out[y * w + 31] > 0.6, `row ${y}: the edge stays a step, not a ramp`);
  }
});

test('a slider draft traces a half-size picture: its dots, scaled back, lie on the same circle at the same step', async () => {
  const { traceDots } = await trace;
  const full = traceDots(drawing(200, 120, circle), 200, 120, { spacing: 5, length: 10 });
  const half = drawing(100, 60, (ctx) => { ctx.scale(0.5, 0.5); circle(ctx); });
  const draft = traceDots(half, 100, 60, { spacing: 5, length: 10, scale: 0.5 });
  assert.equal(draft.source, 'lines');
  const dots = draft.dots.map(([x, y]) => [x / 0.5, y / 0.5]);
  assert.ok(Math.abs(dots.length - full.dots.length) <= 4, `${dots.length} draft dots, ${full.dots.length} full`);
  for (const [x, y] of dots) assert.ok(Math.abs(Math.hypot(x - 100, y - 60) - 40) < 2.5, `dot ${x},${y} lies on the circle`);
  const gaps = dots.map(([x, y]) => Math.min(...dots.filter((d) => d[0] !== x || d[1] !== y).map((d) => Math.hypot(d[0] - x, d[1] - y))));
  assert.ok(Math.min(...gaps) > 3.5 && Math.max(...gaps) < 6.5, `neighbour distance ${Math.min(...gaps).toFixed(1)}–${Math.max(...gaps).toFixed(1)} for a 5 px step`);
  assert.deepEqual(traceDots(drawing(200, 120, circle), 200, 120, { spacing: 5, length: 10, scale: 1 }), full, 'scale 1 is the full result');
});
