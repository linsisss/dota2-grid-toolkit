const test = require('node:test');
const assert = require('node:assert/strict');

// The HUD capture solver and compose (scripts/hud-capture/{classify,layers,compose}.mjs, 2026-10-17) on
// small synthetic frames: the matte math in linear light, moving samples, group opacity, the wash law,
// the chat's gradient, the narrow chat's wrap, and the classification of backdrops and the marker ring.
const load = () => Promise.all([import('../scripts/hud-capture/compose.mjs'), import('../scripts/hud-capture/layers.mjs'), import('../scripts/hud-capture/classify.mjs')]);
const W = 8, H = 6;
// A tiny "screen": RGB bytes of W × H.
const img = (fill) => ({ width: W, height: H, data: Uint8Array.from({ length: W * H * 3 }, (_, i) => (typeof fill === 'function' ? fill(i) : fill)) });
// A synthetic HUD layer in linear light: per sample b (added light) and a (transmission), b + a ≤ 1.
function layer(seed) {
  const b = new Float64Array(W * H * 3), a = new Float64Array(W * H * 3);
  for (let i = 0; i < b.length; i++) {
    const r = ((i * 7919 + seed * 104729) % 1000) / 1000, kind = i % 4;
    a[i] = kind === 0 ? 1 : kind === 1 ? 0 : r;
    b[i] = kind === 0 ? 0 : (1 - a[i]) * ((r * 37) % 1);
  }
  return { b, a };
}

test('HUD compose: k and w plates of a layer reproduce it over any backdrop in linear light', async () => {
  const [C, L] = await load();
  const { b, a } = layer(1);
  const over = (X) => img((i) => C.encodeExact(b[i] + a[i] * C.LIN[typeof X === 'number' ? X : X[i]]));
  const K = L.stackStats([over(0), over(0)], [0, 0, W, H]), Wt = L.stackStats([over(255), over(255)], [0, 0, W, H]);
  const ref = { K: over(0), W: over(255) }, pl = L.plateFromStacks(K, Wt, ref);
  assert.equal(pl.counts.moving, 0);
  const world = img((i) => (i * 37) % 256), plate = C.plate(0, 0, W, H, pl.k, pl.wt);
  const got = C.composeScreen(world.data, [{ kind: 'plain', plate }], { width: W, height: H, exact: true });
  const want = over(world.data).data;
  let max = 0;
  for (let i = 0; i < got.length; i++) max = Math.max(max, Math.abs(got[i] - want[i]));
  assert.ok(max <= 2, `within quantisation (max ${max})`);
  // The fast table encoder agrees with the exact one but at byte midpoints.
  const fast = C.composeScreen(world.data, [{ kind: 'plain', plate }], { width: W, height: H });
  for (let i = 0; i < got.length; i++) assert.ok(Math.abs(fast[i] - got[i]) <= 1);
  // A transparent plate leaves the world as it is.
  const clear = C.plate(0, 0, W, H, new Uint8Array(W * H * 3), new Uint8Array(W * H * 3).fill(255));
  assert.deepEqual([...C.composeScreen(world.data, [{ kind: 'plain', plate: clear }], { width: W, height: H, exact: true })], [...world.data]);
});

test('HUD stacks: the mode of equal frames wins; moving samples are opaque or added light', async () => {
  const [, L] = await load();
  const k1 = img(10), k2 = img(10), k3 = img(10), w1 = img(200), w2 = img(200), w3 = img(200);
  // Pixel 0: a guard frame of another state (one of three) — the mode still wins.
  k3.data[0] = 99;
  // Pixel 1: an opaque moving portrait: K and W take the same values at different moments.
  [k1, k2, k3].forEach((f, i) => { f.data.set([40 + i * 20, 40 + i * 20, 40 + i * 20], 3); });
  [w1, w2, w3].forEach((f, i) => { f.data.set([50 + i * 20, 50 + i * 20, 50 + i * 20], 3); });
  // Pixel 2: sparks over a transparent area: K glows, W stays white.
  [k1, k2, k3].forEach((f, i) => { f.data.set([i * 30, i * 30, i * 30], 6); });
  [w1, w2, w3].forEach((f) => { f.data.set([255, 255, 255], 6); });
  const rect = [0, 0, W, H], K = L.stackStats([k1, k2, k3], rect), Wt = L.stackStats([w1, w2, w3], rect);
  assert.equal(K.mode[0], 10); assert.equal(K.count[0], 2);
  const pl = L.plateFromStacks(K, Wt, { K: k2, W: w2 });
  assert.equal(pl.moving[0], 0); assert.equal(pl.k[0], 10);
  assert.equal(pl.moving[1], 1); assert.equal(pl.opaque[1], 1); assert.deepEqual([pl.k[3], pl.wt[3]], [60, 60], 'opaque: the reference bytes over both');
  assert.equal(pl.moving[2], 1); assert.equal(pl.opaque[2], 0); assert.equal(pl.k[6], 30); assert.equal(pl.wt[6], 255, 'added light over a clear area');
});

test('HUD compose: backdrop opacity is the blend of the off and on states; wash multiplies the backdrop\'s colour', async () => {
  const [C] = await load();
  // One pixel: content (b_c, a_c) over a backdrop panel (colour col, alpha al), as Panorama draws it.
  const bc = 0.05, ac = 0.6, col = 0.3, al = 0.42, X = 0.5;
  const draw = (o, m) => bc + ac * (o * al * col * m + (1 - o * al) * X);
  const enc = C.encodeExact, plateOf = (bOn) => {
    const b = bc + ac * (bOn ? al * col : 0), a = ac * (bOn ? 1 - al : 1);
    return C.plate(0, 0, 1, 1, Uint8Array.of(enc(b), enc(b), enc(b)), Uint8Array.of(enc(b + a), enc(b + a), enc(b + a)));
  };
  const Cp = plateOf(false), Fp = plateOf(true), world = Uint8Array.of(enc(X), enc(X), enc(X));
  for (const o of [0, 0.35, 0.55, 0.7, 1]) {
    const got = C.composeScreen(world, [{ kind: 'lower', C: Cp, F: Fp, opacity: o }], { width: 1, height: 1, exact: true });
    assert.ok(Math.abs(got[0] - enc(draw(o, 1))) <= 1, `opacity ${o}`);
  }
  // wash #2fa8ff at 30 %: factors 1 − s + s·lin(c), s = 77/255.
  const m = C.washFactors('#2fa8ff', 30), s = 77 / 255;
  assert.deepEqual(m.map((v) => +v.toFixed(6)), [0x2f, 0xa8, 0xff].map((c) => +(1 - s + s * C.LIN[c]).toFixed(6)));
  assert.deepEqual(C.washFactors('#2fa8ff', 0), [1, 1, 1]);
  const got = C.composeScreen(world, [{ kind: 'lower', C: Cp, F: Fp, opacity: 0.55, wash: m }], { width: 1, height: 1, exact: true });
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(got[c] - enc(draw(0.55, m[c]))) <= 1);
});

test('HUD lower sets: decorations and the backdrop are patches over the base, masks respected', async () => {
  const [C] = await load();
  const solid = (v, w = 4, h = 2, x = 0, y = 0, mask = null) => C.plate(x, y, w, h, new Uint8Array(w * h * 3).fill(v), new Uint8Array(w * h * 3).fill(v), mask);
  const set = { base: solid(1), cbg: solid(2, 2, 1, 1, 0), decor: { flares: { C: solid(3, 1, 1, 0, 1), F: solid(4, 1, 1, 0, 1) }, insets: { C: solid(5, 2, 1, 2, 1, Uint8Array.of(0, 1)), F: solid(6, 2, 1, 2, 1, Uint8Array.of(0, 1)) } } };
  const all = C.buildLower(set, { flares: true, shadows: true }), none = C.buildLower(set, { flares: false, shadows: false });
  assert.deepEqual([...all.C.k].filter((_, i) => i % 3 === 0), [1, 1, 1, 1, 3, 1, 1, 5]);
  assert.deepEqual([...all.F.k].filter((_, i) => i % 3 === 0), [1, 2, 2, 1, 4, 1, 1, 6]);
  assert.deepEqual([...none.F.k].filter((_, i) => i % 3 === 0), [1, 2, 2, 1, 1, 1, 1, 1]);
  assert.equal(set.base.k[0], 1, 'the base plate is not changed');
});

test('HUD chat: the Active gradient comes off the lines; a narrow chat wraps the bottom line', async () => {
  const [C, L] = await load();
  // 12 × 4 lines box: a gradient letting t(x) through, text samples in column 5 (opaque) and 7 (half).
  const w = 12, h = 4, t = (x) => (x < 6 ? 1 / 3 : 1 / 3 + ((x - 6) / 6) * (2 / 3));
  const k = new Uint8Array(w * h * 3), wt = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const i = (y * w + x) * 3 + c, text = y === 1 && (x === 5 || x === 7);
    const bText = text ? 0.2 : 0, aText = !text ? 1 : x === 5 ? 0 : 0.5;
    k[i] = C.encodeExact(bText); wt[i] = C.encodeExact(bText + aText * t(x));
  }
  const pl = { k, wt }, rows = L.gradientRows(pl, w, h, 11);
  assert.deepEqual(rows, [0, 4]);
  const { transmission } = L.gradientColumns(pl, w, h, rows);
  for (let x = 0; x < 11; x++) assert.ok(Math.abs(transmission[x] - t(x)) < 0.01, `column ${x}`);
  const passive = L.degradient(pl, w, h, transmission);
  assert.equal(passive.wt[(0 * w + 3) * 3], 255, 'the gradient alone becomes clear');
  assert.equal(passive.k[(1 * w + 5) * 3], k[(1 * w + 5) * 3], 'what text adds stays');
  assert.ok(Math.abs(passive.wt[(1 * w + 7) * 3] - C.encodeExact(0.2 + 0.5)) <= 1, 'text transmission without the gradient');
  // Wrap: a 3-row plate parked at x 40; the bottom row's word gaps at 50–53 and 70–73.
  const plate = C.plate(45, 100, 40, 3, new Uint8Array(40 * 3 * 3).fill(9), new Uint8Array(40 * 3 * 3).fill(9));
  const chat = { plate, anchor: { x: 40, bottom: 200 }, wrap: { rows: [102, 103], gaps: [[50, 53], [70, 73]], start: 45, pitch: 1, padding: 14 } };
  const wide = C.chatPlates(chat, { align: 'left', y: 100, width: 800 });
  assert.equal(wide.length, 1); assert.deepEqual([wide[0].x, wide[0].y], [45 - 40 + 24, 100 + 980 - 200]);
  const narrow = C.chatPlates({ ...chat, anchor: { x: 40, bottom: 200 } }, { align: 'left', y: 100, width: 50 });
  assert.equal(narrow.length, 3);
  assert.deepEqual(narrow.map((p) => [p.x, p.y, p.w, p.h]), [[29, 879, 40, 2], [29, 881, 25, 1], [29, 882, 12, 1]], 'rows above up one pitch, the line split at the last gap that fits');
  assert.deepEqual(C.hudChatBox({ align: 'center', y: 220, width: 800 }), { x: 560, bottom: 860, width: 800 });
});

test('HUD classification: backdrops, the marker ring, its fill and grey 129', async () => {
  const [, , K] = await load();
  const plan = { geometry: { free: [[1, 1], [6, 1]], ring: { x: 3, y: [0, 60], spread: 6 }, lowerBackdrop: [[2, 40], [5, 45]] },
    lower: { marks: [{ colour: '#ff3c00ff', block: 'AOFF', part: 'core' }, { colour: '#ff6478ff', block: 'RDEF', part: 'g1' }] } };
  const w = 8, h = 60, frame = (global, ring, local, fill = false) => {
    const d = new Uint8Array(w * h * 3).fill(global === 'K' ? 0 : 255);
    const put = (x, y, rgb) => d.set(rgb, (y * w + x) * 3);
    if (ring) for (let y = 20; y < (fill ? h : 26); y++) for (let x = 0; x < w; x++) put(x, y, ring);
    if (local && !fill) for (let y = 26; y < h; y++) for (let x = 0; x < w; x++) put(x, y, local);
    return { width: w, height: h, data: d };
  };
  const a = K.frameFeatures(frame('K', [255, 61, 1], [129, 129, 129]), plan);
  assert.equal(a.global, 'K'); assert.equal(a.local, 'G', 'grey #808080 reaches the screen as 129');
  assert.deepEqual([a.ring.block, a.ring.part, a.ring.row, a.ring.fill], ['AOFF', 'core', 20, false]);
  const b = K.frameFeatures(frame('W', [255, 101, 121], null, true), plan);
  assert.equal(b.global, 'W'); assert.equal(b.local, 'O', 'the ring colour fills the box'); assert.equal(b.ring.block, 'RDEF');
  const c = K.frameFeatures(frame('W', null, null), plan);
  assert.equal(c.ring, null);
  assert.equal(K.packScale('S-85-110', {}).lower, 85);
  assert.equal(K.rectHash(frame('W', null, null), [0, 0, 4, 4]), K.rectHash(frame('W', null, null), [0, 0, 4, 4]));
  assert.notEqual(K.rectHash(frame('W', null, null), [0, 0, 8, 30]), K.rectHash(frame('W', [255, 101, 121], null, true), [0, 0, 8, 30]));
});
