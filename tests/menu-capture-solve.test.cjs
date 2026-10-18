const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// The main-menu capture solver, stage 1 (scripts/menu-capture/classify.mjs, scripts/menu-capture-solve.mjs)
// on synthetic 1920 × 1080 frames: the probe code and backdrop from pixels, labels against session.json,
// coverage, the toggle check, footprints with the probe squares left out, and V1's shift search.
const load = () => Promise.all([import('../scripts/menu-capture/plan.mjs'), import('../scripts/menu-capture/classify.mjs'), import('../scripts/hud-capture/ingest.mjs')]);
const SW = 1920, SH = 1080;
const fill = (img, [x0, y0, x1, y1], [r, g, b]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * SW + x) * 3; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; } };
// A frame of the plan: backdrop, the code of (pack, state, part), and each «on» part as a block of its own colour.
function frame(P, { pack = 'M1', state = 0, part = 0, bg = 'K', shift = {} } = {}) {
  const img = { width: SW, height: SH, data: new Uint8Array(SW * SH * 3) }, v = { K: 0, W: 255, G: 129 }[bg];
  img.data.fill(v);
  const pk = P.planSnapshot().packs.find((p) => p.id === pack), on = pk.states[state].on;
  const parts = pack === 'M1' ? on : [...(on.includes('bar') ? ['bar'] : []), ...(on.includes('buttons') ? ['heroes', 'watch'] : []), ...(on.includes('rest') ? ['rail', 'play'] : [])];
  for (const id of parts) {
    const g = P.group(id), r = id === 'bar' ? [0, 0, SW, 60] : id === 'rail' ? [g.rect[0] + 10, g.rect[1] + 10, g.rect[2] - 10, g.rect[3] - 10] : [g.rect[0] + 10, g.rect[1] + 6, g.rect[2] - 10, Math.min(g.rect[3], g.rect[1] + 50)];
    const s = shift[id] || 0;
    fill(img, [r[0] + s, r[1], r[2] + s, r[3]], [30 + 9 * P.GROUP_IDS.indexOf(id), 200 - 7 * P.GROUP_IDS.indexOf(id), 90]);
    if (id !== 'bar') fill(img, [r[0] + s + 3, r[1] + 3, r[0] + s + 9, r[1] + 9], [250, 250, 250]);   // a mark, so a shift is unique
  }
  const sq = P.codeSquares(state, part, P.PACK_CODES[pack]);
  P.PROBES.rows.forEach((row) => sq.forEach((val, i) => fill(img, [row.x + i * P.PROBES.pitch, row.y, row.x + i * P.PROBES.pitch + P.PROBES.size, row.y + P.PROBES.size], [val & 1 ? 255 : 0, val & 2 ? 255 : 0, val & 4 ? 255 : 0])));
  return img;
}

test('menu solve: backdrop and probe code from pixels; labels, session checks, coverage, toggles', async () => {
  const [P, C] = await load(), plan = P.planSnapshot();
  const specs = [], m1 = plan.packs[0];
  // M1: every state core over K and W, ALL and NONE also over G; one guard frame; one frame of Valve's menu.
  m1.states.forEach((s) => ['K', 'W', ...(['ALL', 'NONE'].includes(s.id) ? ['G'] : [])].forEach((bg) => specs.push({ pack: 'M1', state: s.index, part: 0, bg })));
  specs.push({ pack: 'M1', state: 3, part: 1, bg: 'W' });
  const imgs = specs.map((s) => frame(P, s));
  const valve = { width: SW, height: SH, data: new Uint8Array(SW * SH * 3).fill(40) };
  imgs.push(valve); specs.push({ pack: 'M1', valve: true });
  const frames = specs.map((s, i) => ({ name: `${s.pack}_${String(i + 1).padStart(4, '0')}.png`, pack: s.pack, seq: i + 1, index: i, t: i,
    probe: i === 5 ? { g: 'W', state: 99 } : null }));
  const features = imgs.map((img) => C.frameFeatures(img, plan));
  assert.equal(features[0].bg, 'K'); assert.deepEqual({ ...features[0].code, rows: 2 }, { state: 0, part: 0, pack: 1, rows: 2, agree: true });
  assert.equal(features.at(-1).bg, 'T'); assert.equal(features.at(-1).code, null);
  const { labels, checks, uncoded } = C.labelFrames(frames, features, plan);
  assert.equal(uncoded.length, 1);
  assert.ok(checks.some((c) => c.field === 'state' && c.session === 99), 'session.json disagreement kept, pixels win');
  assert.equal(labels[0].state, 'ALL'); assert.equal(labels.at(-2).part, 'g1');
  const cov = C.coverage(labels, plan);
  assert.equal(cov.M1.complete, true, cov.M1.missing.join(' '));
  assert.equal(cov.V1.complete, false); assert.equal(cov.V1.frames, 0);
  assert.equal(C.toggleVerdict(labels, 'M1'), 'ok');
  // Parts that never hide: ALL and NONE look alike at the toggle points → fail.
  const stuck = labels.map((l) => (l.state === 'NONE' && l.toggles ? { ...l, toggles: { bar: false, rail: false } } : l));
  assert.equal(C.toggleVerdict(stuck, 'M1'), 'fail');
});

test('menu solve: footprints leave the probe squares out; V1 shifts are found; motion counts', async () => {
  const [P, C] = await load();
  const none = frame(P, { state: 1, bg: 'K' }), watch = frame(P, { state: P.M1_ORDER.indexOf('watch'), bg: 'K' });
  const rects = C.probeRects(P.PROBES);
  assert.ok(C.diffBox(watch, none).count > C.diffBox(watch, none, { exclude: rects }).count, 'the code squares differ between states');
  const d = C.diffBox(watch, none, { exclude: rects }), g = P.group('watch');
  assert.ok(C.boxOverlap(d.box, g.rect) > 0.99, JSON.stringify(d.box));
  // V1: watch drawn 164 px to the left (collection hidden) is found there.
  const v1 = frame(P, { pack: 'V1', state: 1, bg: 'K', shift: { watch: -164 } });
  const s = C.bestShift(watch, v1, d.box, { axis: 'x', range: 300 });
  assert.equal(s.shift, -164); assert.equal(s.error, 0); assert.equal(s.exact, 1);
  assert.ok(C.inkLevel(watch, d.box, 0) > 1 && C.inkLevel(none, d.box, 0) === 0);
  // Moving pixels: one changed pixel between two frames of one state.
  const watch2 = frame(P, { state: P.M1_ORDER.indexOf('watch'), bg: 'K' }); watch2.data[(700 * SW + 1200) * 3] = 7;
  assert.equal(C.diffBox(watch, watch2, { exclude: rects }).count, 1);
});

test('menu solve: the CLI reads a capture folder end to end', async () => {
  const [P, , I] = await load(), dir = mkdtempSync(join(tmpdir(), 'gs-menu-solve-'));
  const list = [{ state: 0, bg: 'K' }, { state: 0, bg: 'W' }, { state: 1, bg: 'K' }, { state: 1, bg: 'W' }, { state: 2, bg: 'K' }, { state: 2, bg: 'W' }, { pack: 'V1', state: 1, bg: 'K' }, { pack: 'V1', state: 0, bg: 'K' }];
  list.forEach((s, i) => writeFileSync(join(dir, `${s.pack || 'M1'}_${String(i + 1).padStart(4, '0')}.png`), I.encodePNG(frame(P, s), { level: 1 })));
  writeFileSync(join(dir, 'session.json'), JSON.stringify({ format: 'gs-menu-capture-session/1', status: 'done', manifest: { plan: P.PLAN_ID }, frames: [] }));
  const report = join(dir, 'report');
  mkdirSync(report);
  const r = spawnSync(process.execPath, [join(__dirname, '..', 'scripts/menu-capture-solve.mjs'), dir, '--report', report], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /кадров 8 \(M1 6, V1 2\)/);
  const rep = JSON.parse(require('node:fs').readFileSync(join(report, 'report.json'), 'utf8'));
  assert.equal(rep.coverage.M1.frames, 6); assert.ok(rep.coverage.M1.missing.length > 0);
  assert.deepEqual(rep.footprints.bar.box, [0, 0, SW, 60]);
});
