// The HUD capture solver (plan r2, first run 2026-10-17): the owner's capture → the builder's HUD preview.
//   node scripts/hud-capture-solve.mjs <capture folder or gs-hud-capture.zip> [--out assets/dota-hud-capture]
//        [--report <dir>]   (validation numbers, comparison PNGs, diagnostics)
// Steps (docs/hud-capture/README.md): ingest → classify every frame from its pixels (scripts/hud-capture/
// classify.mjs) → blend-space test → per pack and state, stacks of equal frames → plates (layers.mjs) →
// lower HUD sets (backdrops off / on, decorations as patches), top bar, rest, chat (the Active gradient
// removed), world → validation by compose() (compose.mjs, the same code the page runs) against frames the
// solver did not build the layers from → WebP atlases and hud.json.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCapture, decodeFrame } from './hud-capture/ingest.mjs';
import { frameFeatures, labelFrames, hashGroups } from './hud-capture/classify.mjs';
import { planSnapshot } from './hud-capture/plan.mjs';
import { phiTest } from './hud-capture/matte.mjs';
import { stackStats, plateFromStacks, diffMask, maskBox, dilate, cut, hudBox, gradientColumns, gradientRows, degradient, errorStats, rectW, rectH } from './hud-capture/layers.mjs';
import { LIN, encodeExact, composeScreen, buildLower, washFactors, hudLayers, hudChatBox, plate as makePlate } from './hud-capture/compose.mjs';
import { components } from './hud-capture/matte.mjs';
import { hudSettings } from './hud-style.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const input = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!input) { console.error('usage: node scripts/hud-capture-solve.mjs <capture> [--out dir] [--report dir]'); process.exit(1); }
const OUT = resolve(opt('--out', join(REPO, 'assets/dota-hud-capture')));
const REPORT = opt('--report', null) && resolve(opt('--report'));
const log = (...a) => console.log(...a);
const SW = 1920, SH = 1080;

// ---- Frames ----
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* the plain-JS PNG decoder then */ }
const cap = openCapture(resolve(input)), plan = planSnapshot();
if (cap.rejected.length) log('rejected:', cap.rejected);
const cache = new Map();
async function frame(f) {
  if (cache.has(f.index)) return cache.get(f.index);
  let img;
  if (sharp) {
    const { data, info } = await sharp(f.read()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== SW || info.height !== SH) throw new Error(`${f.name}: ${info.width}×${info.height}`);
    img = { width: SW, height: SH, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
  } else img = decodeFrame(f.read(), { width: SW, height: SH });
  cache.set(f.index, img);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return img;
}
const features = [];
for (const f of cap.frames) features.push(frameFeatures(await frame(f), plan));
const { labels, rows: ringRows, checks } = labelFrames(cap.frames, features, plan);
const byFile = new Map(labels.map((l) => [l.file, l]));
const frameOf = (l) => cap.frames[l.index];
const images = (list) => Promise.all(list.map((l) => frame(frameOf(l))));
log(`frames ${cap.frames.length}, ring rows`, ringRows, `session/pixel disagreements ${checks.length}`);
const report = { generated: new Date().toISOString(), input: resolve(input), frames: cap.frames.length, ringRows, sessionChecks: checks, packs: {} };

// Colour-blind mode was on in C1 phase 1 only (the owner's own setting; Valve's default is off): C1
// frames of phase 1 are left out of every layer.
const usable = (l) => !(l.pack === 'C1' && l.phase === 1);
const PACKS = [...new Set(labels.map((l) => l.pack))];
const lowerScaleOf = (pack) => (pack === 'C1' ? 100 : /^S-(\d+)-(\d+)$/.test(pack) ? +RegExp.$1 : null);
const topScaleOf = (pack) => (pack === 'C1' ? 100 : /^S-(\d+)-(\d+)$/.test(pack) ? +RegExp.$2 : null);

// ---- Blend space ----
{
  const triples = [];
  for (const pack of PACKS.filter((p) => lowerScaleOf(p))) {
    const hon = labels.filter((l) => usable(l) && l.pack === pack && l.lower.block === 'HON');
    const pick = (bg) => hon.filter((l) => l.local === bg);
    const [K, W, G] = [pick('K'), pick('W'), pick('G')];
    if (!K.length || !W.length || !G.length) continue;
    const rect = [0, ringRows[pack] + 6, SW, SH];
    const [sk, sw, sg] = [stackStats(await images(K), rect), stackStats(await images(W), rect), stackStats(await images(G), rect)];
    const mask = new Uint8Array(sk.w * sk.h);
    for (let p = 0; p < mask.length; p++) mask[p] = sk.count[p] === sk.n && sw.count[p] === sw.n && sg.count[p] === sg.n ? 1 : 0;
    triples.push({ K: sk.mode, W: sw.mode, G: sg.mode, mask });
  }
  const res = phiTest(triples, { grey: 129 });
  report.blendSpace = { verdict: res.verdict, reason: res.reason, grey: 129, srgb: { frac: res.srgb.frac, hist: res.srgb.hist }, linear: { frac: res.linear.frac, hist: res.linear.hist } };
  log('blend space:', res.verdict, 'linear within ±1', res.linear.frac.toFixed(5), 'sRGB', res.srgb.frac.toFixed(5));
  if (res.verdict !== 'linear') throw new Error('the HUD is not blended in linear light any more: compose.mjs needs another model');
}

// ---- Stacks ----
// Frames of one state over one backdrop, its stack and plates (rect in screen coordinates).
async function statePlates(list, rect, refTime = null, key = 'local') {
  const K = list.filter((l) => l[key] === 'K'), W = list.filter((l) => l[key] === 'W');
  return statePlatesKW(K, W, rect, refTime);
}
async function statePlatesKW(K, W, rect, refTime = null) {
  if (!K.length || !W.length) throw new Error(`no ${K.length ? 'W' : 'K'} frames for ${rect}`);
  const sk = stackStats(await images(K), rect), sw = stackStats(await images(W), rect);
  // The reference moment: the K frame nearest refTime (or the middle one) and the W frame nearest it.
  const t = refTime ?? K[K.length >> 1].t;
  const near = (arr) => arr.reduce((a, b) => (Math.abs((b.t ?? 0) - t) < Math.abs((a.t ?? 0) - t) ? b : a));
  const rK = near(K), rW = near(W);
  const pl = plateFromStacks(sk, sw, { K: await frame(frameOf(rK)), W: await frame(frameOf(rW)) });
  return { ...pl, rect, w: sk.w, h: sk.h, K: K.map((l) => l.file), W: W.map((l) => l.file), ref: [rK.file, rW.file] };
}

// ---- Lower HUD ----
// One static scale per pack. States: HON (backdrops on, decorations on), AON (off, on), AOFF (off, off),
// HOFF (on, off). Base = AOFF; the backdrops' patch = HOFF where it differs; decorations = AON − AOFF
// (flares at the sides, inset shadows by the abilities), patched with AON (off) and HON (on) values.
const lowerSets = {}, lowerDiag = {};
for (const pack of PACKS.filter((p) => lowerScaleOf(p))) {
  const scale = lowerScaleOf(pack), top = ringRows[pack] + 6, rect = [0, top, SW, SH];
  const inPack = labels.filter((l) => usable(l) && l.pack === pack && !l.lower.hidden && !l.lower.bad);
  const state = {};
  for (const block of ['HON', 'AON', 'AOFF', 'HOFF']) {
    const list = inPack.filter((l) => l.lower.block === block && (l.local === 'K' || l.local === 'W'));
    state[block] = await statePlates(list, rect, inPack.find((l) => l.lower.block === 'AOFF' && l.local === 'K')?.t);
  }
  const size = state.AOFF.w * state.AOFF.h, w = state.AOFF.w, h = state.AOFF.h;
  const moving = new Uint8Array(size);
  for (const s of Object.values(state)) for (let p = 0; p < size; p++) if (s.moving[p]) moving[p] = 1;
  const cbg = diffMask(state.AOFF, state.HOFF, size, 1, moving), cbgOn = diffMask(state.AON, state.HON, size, 1, moving);
  const dec = diffMask(state.AON, state.AOFF, size, 1, moving), decH = diffMask(state.HON, state.HOFF, size, 1, moving);
  // Decoration components (8-connected, grown by 2 px so a flare's soft edge stays one piece).
  const grown = dilate(dec.mask, w, h, 2), comps = components(grown, w, h).filter((c) => c.cells.length > 20);
  // The backdrop's box: the big components of where it shows (single stray samples left out).
  const both = new Uint8Array(size);
  for (let p = 0; p < size; p++) both[p] = cbg.mask[p] || cbgOn.mask[p];
  const cbgComps = components(dilate(both, w, h, 2), w, h), biggest = Math.max(0, ...cbgComps.map((c) => c.cells.length));
  const big = cbgComps.filter((c) => c.cells.length >= 0.01 * biggest);
  const centreBox = big.length ? [Math.min(...big.map((c) => c.x0)), Math.min(...big.map((c) => c.y0)), Math.max(...big.map((c) => c.x1)) + 1, Math.max(...big.map((c) => c.y1)) + 1] : null;
  // Flares sit outside the ability panel's backdrop (#center_bg), the inset shadows inside it.
  const decor = { flares: [], insets: [] };
  for (const c of comps) {
    const inside = centreBox && c.x1 >= centreBox[0] - 6 && c.x0 <= centreBox[2] + 6;
    decor[inside ? 'insets' : 'flares'].push(c);
  }
  const patch = (list, from) => {
    if (!list.length) return null;
    const box = [Math.min(...list.map((c) => c.x0)), Math.min(...list.map((c) => c.y0)), Math.max(...list.map((c) => c.x1)) + 1, Math.max(...list.map((c) => c.y1)) + 1];
    const mask = new Uint8Array(size);
    for (const c of list) for (const cell of c.cells) if (dec.mask[cell] || decH.mask[cell]) mask[cell] = 1;
    const part = cut(from, w, box, mask);
    return makePlate(box[0], box[1] + top, part.w, part.h, part.k, part.wt, part.mask);
  };
  const baseCut = cut(state.AOFF, w, [0, 0, w, h]);
  // The backdrop patch: every pixel of its box where HOFF differs from AOFF (moving ones too: the
  // reference moment of HOFF there).
  const cbgMask = new Uint8Array(size);
  if (centreBox) for (let y = centreBox[1]; y < centreBox[3]; y++) for (let x = centreBox[0]; x < centreBox[2]; x++) { const p = y * w + x; if (cbg.mask[p] || cbgOn.mask[p] || moving[p]) cbgMask[p] = 1; }
  const cbgPart = centreBox ? cut(state.HOFF, w, centreBox, cbgMask) : null;
  lowerSets[scale] = {
    base: makePlate(0, top, w, h, baseCut.k, baseCut.wt),
    cbg: cbgPart ? makePlate(centreBox[0], centreBox[1] + top, cbgPart.w, cbgPart.h, cbgPart.k, cbgPart.wt, cbgPart.mask) : makePlate(0, top, 0, 0, new Uint8Array(0), new Uint8Array(0)),
    decor: Object.fromEntries(['flares', 'insets'].map((k) => [k, decor[k].length ? { C: patch(decor[k], state.AON), F: patch(decor[k], state.HON) } : null]).filter(([, v]) => v)),
    moving
  };
  lowerDiag[scale] = { pack, top, ringRow: ringRows[pack], centreBox, cbgSamples: cbg.n, cbgOnSamples: cbgOn.n, decorSamples: dec.n, decorOnSamples: decH.n,
    decor: Object.fromEntries(Object.entries(decor).map(([k, list]) => [k, list.map((c) => [c.x0, c.y0 + top, c.x1 + 1, c.y1 + 1 + top, c.cells.length])])),
    states: Object.fromEntries(Object.entries(state).map(([k, s]) => [k, { K: s.K, W: s.W, ref: s.ref, counts: s.counts }])) };
  log(`lower ${scale}% (${pack}): box top ${top}, backdrop box ${centreBox}, decorations`, lowerDiag[scale].decor, 'moving', Object.values(state).map((s) => s.counts.moving));
}
report.lower = lowerDiag;

// ---- Top bar ----
// Over the global backdrop; one static scale per pack (C1: 100 %, phase 2). The bar is where some frame
// shows HUD; #DayGlow pulses on its own (Valve's DayNightPulse kept running), so it is a moving part.
const TOP_DOMAIN = [440, 0, 1480, 182];
const topPlates = {}, topDiag = {}, topMoving = {}, TOP_DOMAIN_W = TOP_DOMAIN[2] - TOP_DOMAIN[0];
for (const pack of PACKS.filter((p) => topScaleOf(p))) {
  const scale = topScaleOf(pack), list = labels.filter((l) => usable(l) && l.pack === pack && (l.global === 'K' || l.global === 'W') && l.ink?.top > 0);
  const st = await statePlates(list, TOP_DOMAIN, null, 'global');
  const { box } = hudBox(st, st.w, st.h);
  const part = cut(st, st.w, box);
  topPlates[scale] = makePlate(TOP_DOMAIN[0] + box[0], TOP_DOMAIN[1] + box[1], part.w, part.h, part.k, part.wt);
  topMoving[scale] = st.moving;
  topDiag[scale] = { pack, rect: [TOP_DOMAIN[0] + box[0], box[1], TOP_DOMAIN[0] + box[2], box[3]], K: st.K, W: st.W, counts: st.counts };
  log(`top ${scale}% (${pack}):`, topDiag[scale].rect, st.counts);
}
report.top = topDiag;

// ---- Rest (menu buttons, quick stats, the side panels' tab) ----
// C1 phase 2 frames with the lower HUD hidden and the rest shown; everything outside the other regions.
const CHAT_DOMAIN = [30, 380, 850, 580], CLONE = [1176, 196, 1673, 349];
const CURSORS = [[1765, 255, 1835, 330], [1765, 525, 1835, 600]];
const restPlates = [], restDiag = [];
{
  const restShown = (l) => l.ink?.rest > 0;
  const list = labels.filter((l) => l.pack === 'C1' && l.phase === 2 && l.lower.hidden && (l.global === 'K' || l.global === 'W') && restShown(l));
  const st = await statePlates(list, [0, 0, SW, SH], null, 'global');
  const skip = (x, y) => [TOP_DOMAIN, CHAT_DOMAIN, CLONE, ...CURSORS].some((r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3]);
  const { mask } = hudBox(st, SW, SH);
  for (let p = 0; p < mask.length; p++) if (mask[p] && (skip(p % SW, (p / SW) | 0) || st.moving[p])) mask[p] = 0;
  for (const c of components(dilate(mask, SW, SH, 3), SW, SH).filter((c) => c.cells.length > 30)) {
    const r = [c.x0, c.y0, c.x1 + 1, c.y1 + 1], part = cut(st, SW, r, mask);
    restPlates.push(makePlate(r[0], r[1], part.w, part.h, part.k, part.wt, part.mask));
    restDiag.push(r);
  }
  report.rest = { K: st.K, W: st.W, rects: restDiag, counts: st.counts };
  log('rest:', restDiag);
}

// ---- Chat ----
// The chat's own panels never took custom_ui.css (no box cycle, no fonts, no heights, lines expire by
// code), so the owner kept the input open: the lines are Active. Lines of an S pack (four: the three typed
// lines and the pause notice, the same in S-80-80, S-85-110 and S-95-120), parked at left 40, bottom 643.
const CHAT_PARK = { x: 40, bottom: SH - 437 };
let chatAsset = null;
{
  const pack = 'S-85-110', LINES = [36, 380, 844, 541];
  const inPack = labels.filter((l) => l.pack === pack && (l.global === 'K' || l.global === 'W'));
  // The Active chat with its lines: the commonest chat hash over each backdrop.
  const commonest = (bg) => { const g = hashGroups(inPack, 'chat', (l) => l.global === bg)[0]; return g.list; };
  const st = await statePlatesKW(commonest('K'), commonest('W'), LINES);
  const w = st.w, h = st.h;
  // The lines box rows (a probe column right of every line), then the gradient per column over them.
  const rows = gradientRows(st, w, h, 700 - LINES[0]);
  const { transmission, share, good } = gradientColumns(st, w, h, rows);
  const passive = degradient(st, w, h, transmission);
  const { mask, box } = hudBox(passive, w, h);
  const part = cut(passive, w, box);
  chatAsset = { plate: makePlate(LINES[0] + box[0], LINES[1] + box[1], part.w, part.h, part.k, part.wt), anchor: CHAT_PARK };
  // The bottom line (the pause notice, the widest): its rows and word gaps, for narrow chats (compose.mjs
  // chatPlates). Rows: from the first row under the third typed line's text box; text from 524.
  {
    const pl = chatAsset.plate, inkAt = (x, y) => { const i = ((y - pl.y) * pl.w + (x - pl.x)) * 3; return pl.k[i] || pl.k[i + 1] || pl.k[i + 2] || pl.wt[i] < 255 || pl.wt[i + 1] < 255 || pl.wt[i + 2] < 255; };
    const r1 = pl.y + pl.h, textTop = 524, gaps = [];
    let run = -1;
    for (let x = pl.x; x <= pl.x + pl.w; x++) {
      let ink = x === pl.x + pl.w;
      for (let y = textTop; y < r1 && !ink; y++) ink = inkAt(x, y);
      if (!ink && run < 0) run = x;
      if (ink && run >= 0) { if (x - run >= 3 && run > pl.x) gaps.push([run, x]); run = -1; }
    }
    chatAsset.wrap = { rows: [519, r1], gaps, start: pl.x, pitch: 22, padding: 14 };
  }
  report.chat = { pack, K: st.K, W: st.W, rect: [LINES[0] + box[0], LINES[1] + box[1], LINES[0] + box[2], LINES[1] + box[3]], counts: st.counts,
    gradient: { rows: rows.map((r) => r + LINES[1]), min: +Math.min(...transmission).toFixed(4), at: transmission.indexOf(Math.min(...transmission)) + LINES[0], interpolated: good.reduce((n, g) => n + (1 - g), 0) } };
  report.chat.transmission = [...transmission].map((v) => +v.toFixed(4));
  chatAsset.active = makePlate(LINES[0], LINES[1], w, h, st.k, st.wt);
  // Check: the S packs' first frames caught the lines passive (before the owner opened the input), while
  // they faded out one by one. Where a K frame and the next W frame both still show a line, the measured
  // passive layer must equal ours.
  const checksOut = [];
  for (const p of ['S-95-120', 'S-90-90']) {
    const first = labels.filter((l) => l.pack === p && (l.global === 'K' || l.global === 'W')).slice(0, 5);
    for (let i = 0; i + 1 < first.length; i++) {
      const [a, b] = [first[i], first[i + 1]];
      if (a.global === b.global || !a.ink?.chat || !b.ink?.chat) continue;
      const [K, W] = a.global === 'K' ? [a, b] : [b, a];
      const [ik, iw] = [await frame(frameOf(K)), await frame(frameOf(W))];
      // Rows both frames show: below the later frame's first ink row (+2: a line fading at the top).
      const firstInk = (img, bg) => { for (let y = LINES[1]; y < LINES[3]; y++) for (let x = LINES[0]; x < LINES[2]; x++) { const q = (y * SW + x) * 3; if (img.data[q] !== bg || img.data[q + 1] !== bg || img.data[q + 2] !== bg) return y; } return LINES[3]; };
      const y0 = Math.max(firstInk(ik, 0), firstInk(iw, 255));
      // The top line of each frame may be mid-fade: start at the next line (24 px pitch).
      const from = y0 + 24, n = (LINES[3] - from) * w;
      if (from >= LINES[3]) continue;
      const pk = new Uint8Array(n * 3), pw = new Uint8Array(n * 3), mk = new Uint8Array(n * 3), mw = new Uint8Array(n * 3);
      for (let y = from; y < LINES[3]; y++) for (let x = 0; x < w; x++) {
        const d = ((y - from) * w + x) * 3, sIdx = ((y - LINES[1]) * w + x) * 3, f = (y * SW + LINES[0] + x) * 3;
        for (let c = 0; c < 3; c++) { pk[d + c] = passive.k[sIdx + c]; pw[d + c] = passive.wt[sIdx + c]; mk[d + c] = ik.data[f + c]; mw[d + c] = iw.data[f + c]; }
      }
      checksOut.push({ K: K.file, W: W.file, rows: [from, LINES[3]], overK: errorStats(pk, mk), overW: errorStats(pw, mw) });
    }
  }
  report.chat.passiveCheck = checksOut;
  log('chat:', report.chat.rect, report.chat.gradient, JSON.stringify(checksOut));
}

// ---- World ----
// C2's hide-all windows: every HUD region at opacity 0 over the transparent global backdrop. (Steam's
// screenshots carry no cursor: points A and B never show one.)
const c2 = labels.filter((l) => l.pack === 'C2');
const c2Hidden = (l) => (l.global === 'K' || l.global === 'W') && l.ink?.top === 0 && l.ink?.rest === 0;
const worldFrames = c2.filter((l, i) => l.global === 'T' && c2Hidden(c2[i - 1] || {}) && c2Hidden(c2[i + 1] || c2[i - 1]));
if (!worldFrames.length) throw new Error('no C2 world frame');
const world = (await frame(frameOf(worldFrames[0]))).data;
report.world = { frames: worldFrames.map((l) => l.file), used: worldFrames[0].file };
log('world:', report.world);

// ---- Assets in memory, as the page has them ----
const assets = { lower: lowerSets, top: topPlates, rest: restPlates, chat: chatAsset };
const settingsOf = (s) => hudSettings(s);

// ---- Wash law (C1's copy of #center_bg, #arcana_container: the clone) ----
// Frames grouped by the clone's hash over K and W; each group's state from its time on the 54-s wash clock,
// anchored on the pure red state. Every washed state is predicted from the unwashed one by compose.mjs's
// law (colour × (1 − s + s·lin(rgb)), alpha × opacity).
{
  const tests = plan.wash.tests, period = plan.wash.period, hold = plan.wash.hold, redIndex = tests.findIndex(([w, o]) => w === '#ff0000ff' && o === 1);
  const c1 = labels.filter((l) => l.pack === 'C1' && (l.global === 'K' || l.global === 'W'));
  const groups = new Map();
  for (const l of c1) { const key = `${l.global}:${l.hash.clone}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(l); }
  const plateOf = async (l) => { const img = (await frame(frameOf(l))).data, q = (272 * SW + 1424) * 3; return [img[q], img[q + 1], img[q + 2]]; };
  // The red group: over K, red only.
  let red = null;
  for (const [key, list] of groups) if (key.startsWith('K:')) { const [r, g, b] = await plateOf(list[0]); if (r > 0 && g === 0 && b === 0) red = list; }
  const circ = (t) => ((t % period) + period) % period;
  const redT = red ? Math.atan2(...['sin', 'cos'].map((f) => red.reduce((a, l) => a + Math[f]((2 * Math.PI * circ(l.t)) / period), 0))) * period / (2 * Math.PI) : 0;
  const stateOf = (t) => (redIndex + Math.round(circ(t - redT) / hold) + tests.length) % tests.length;
  const byState = Array.from({ length: tests.length }, () => ({ K: new Map(), W: new Map() }));
  for (const [key, list] of groups) for (const l of list) { const i = stateOf(l.t), m = byState[i][l.global]; m.set(key, (m.get(key) || 0) + 1); }
  const pick = async (i, bg) => { const best = [...byState[i][bg]].sort((a, b) => b[1] - a[1])[0]; return best ? plateOf(groups.get(best[0])[0]) : null; };
  const base = { K: await pick(tests.findIndex(([w, o]) => w === '#ffffff00' && o === 1), 'K'), W: await pick(tests.findIndex(([w, o]) => w === '#ffffff00' && o === 1), 'W') };
  const rows = [];
  if (red && base.K && base.W) for (let i = 0; i < tests.length; i++) {
    const [wc, op] = tests[i], K = await pick(i, 'K'), W = await pick(i, 'W');
    if (!K || !W) continue;
    const m = washFactors(wc.slice(0, 7), Math.round((parseInt(wc.slice(7), 16) / 255) * 100));
    const pred = [0, 1, 2].map((c) => { const b0 = LIN[base.K[c]], al = 1 - (LIN[base.W[c]] - b0), b = op * m[c] * b0, a = 1 - op * al; return [encodeExact(b), encodeExact(b + a)]; });
    rows.push({ wash: wc, opacity: op, measured: { K, W }, predicted: { K: pred.map((p) => p[0]), W: pred.map((p) => p[1]) }, maxError: Math.max(...[0, 1, 2].flatMap((c) => [Math.abs(pred[c][0] - K[c]), Math.abs(pred[c][1] - W[c])])) });
  }
  report.wash = { note: 'the clone is a flat #1620346c (its picture did not load), so the law is tested on one colour here and on the real #center_bg in C2', states: rows };
  log('wash law: max error per state', rows.map((r) => `${r.wash}@${r.opacity}:${r.maxError}`).join(' '));
}

// ---- Report images ----
async function savePNG(path, data, w = SW, h = SH) { if (!REPORT || !sharp) return; mkdirSync(REPORT, { recursive: true }); await sharp(Buffer.from(data.buffer, data.byteOffset, data.length), { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 6 }).toFile(join(REPORT, path)); }
// |difference| × 16, in a mask (outside: dark grey).
const diffImage = (a, b, mask = null) => { const d = new Uint8Array(SW * SH * 3); for (let p = 0; p < SW * SH; p++) for (let c = 0; c < 3; c++) d[p * 3 + c] = mask && !mask[p] ? 40 : Math.min(255, Math.abs(a[p * 3 + c] - b[p * 3 + c]) * 16); return d; };
// Ours (left) and Dota (right), each scaled to 960 × 540, with a 1:1 crop of the lower HUD under them.
async function sideBySide(path, ours, dota, crop = [480, 860, 1440, 1080]) {
  if (!REPORT || !sharp) return;
  const raw = (d) => sharp(Buffer.from(d.buffer, d.byteOffset, d.length), { raw: { width: SW, height: SH, channels: 3 } });
  const half = async (d) => raw(d).resize(960, 540).png().toBuffer(), part = async (d) => raw(d).extract({ left: crop[0], top: crop[1], width: crop[2] - crop[0], height: crop[3] - crop[1] }).png().toBuffer();
  const ch = crop[3] - crop[1], cw = crop[2] - crop[0];
  await sharp({ create: { width: Math.max(1928, cw * 2 + 8), height: 548 + ch, channels: 3, background: '#202020' } })
    .composite([{ input: await half(ours), left: 0, top: 0 }, { input: await half(dota), left: 968, top: 0 }, { input: await part(ours), left: 0, top: 548 }, { input: await part(dota), left: cw + 8, top: 548 }])
    .png().toFile(join(REPORT, path));
}

// ---- Validation ----
const V = report.validation = {};
const regionMask = (rects, invert = false) => { const m = new Uint8Array(SW * SH).fill(invert ? 1 : 0); for (const r of rects) for (let y = Math.max(0, r[1]); y < Math.min(SH, r[3]); y++) for (let x = Math.max(0, r[0]); x < Math.min(SW, r[2]); x++) m[y * SW + x] = invert ? 0 : 1; return m; };
const movingScreen = (scale, topScale) => {
  const m = new Uint8Array(SW * SH), set = lowerSets[scale];
  for (let p = 0; p < set.moving.length; p++) if (set.moving[p]) m[(set.base.y + ((p / set.base.w) | 0)) * SW + (p % set.base.w)] = 1;
  const t = topDiag[topScale];
  if (t) { const st = topMoving[topScale]; for (let p = 0; p < st.length; p++) if (st[p]) m[((p / TOP_DOMAIN_W) | 0) * SW + TOP_DOMAIN[0] + (p % TOP_DOMAIN_W)] = 1; }
  return m;
};
// 1. Grey: the lower HUD (backdrops and decorations on) over #808080 against its grey frames.
V.grey = {};
for (const [scale, set] of Object.entries(lowerSets)) {
  const pack = lowerDiag[scale].pack, G = labels.filter((l) => usable(l) && l.pack === pack && l.lower.block === 'HON' && l.local === 'G');
  if (!G.length) continue;
  const { C, F } = buildLower(set, {}), pred = composeScreen(129, [{ kind: 'lower', C, F, opacity: 1 }], { exact: true });
  const mask = regionMask([[0, set.base.y, SW, SH]]), mv = movingScreen(+scale, null);
  for (let p = 0; p < mask.length; p++) if (mv[p]) mask[p] = 0;
  V.grey[scale] = { frames: G.map((l) => l.file), ...errorStats(pred, (await frame(frameOf(G[0]))).data, mask) };
}
log('grey gate:', JSON.stringify(V.grey));


// 2. The C1 R blocks: the lower HUD over the ring colour Panorama fills the box with (a solid backdrop
//    neither K nor W), at the opacities and decorations of the default, «clear» and «compact» looks.
const R_SETTINGS = { RDEF: { opacity: 100 }, RCLR: { opacity: 35, hide: ['flares', 'shadows'] }, RCMP: { opacity: 70, hide: ['flares'] } };
V.rBlocks = {};
{
  const set = lowerSets[100], rect = [0, set.base.y, SW, SH], mask = regionMask([rect]), mv = movingScreen(100, null);
  for (let p = 0; p < mask.length; p++) if (mv[p]) mask[p] = 0;
  for (const [block, part] of Object.entries(R_SETTINGS)) {
    const list = labels.filter((l) => usable(l) && l.pack === 'C1' && l.lower.block === block && l.lower.part === 'core');
    const rows = [];
    for (const l of list) {
      const img = await frame(frameOf(l)), q = (800 * SW + 1500) * 3, fill = [img.data[q], img.data[q + 1], img.data[q + 2]];
      const st = settingsOf({ ...part }), layers = hudLayers(st, { lower: lowerSets }).filter((x) => x.kind === 'lower');
      const pred = composeScreen({ rgb: fill }, layers, { exact: true });
      rows.push({ file: l.file, global: l.global, fill, ...errorStats(pred, img.data, mask) });
    }
    V.rBlocks[block] = { settings: part, frames: rows };
  }
  log('R blocks:', JSON.stringify(Object.fromEntries(Object.entries(V.rBlocks).map(([k, v]) => [k, v.frames.map((f) => [f.file, f.psnr, f.max, f.within1])]))));
}

// 3. C2 (production hudRules() of one setting, another Dota launch): the whole HUD over K and W, and over
//    its own world (two hide-all windows).
const c2Setting = settingsOf(plan.c2.normalized);
const c2Box = hudChatBox(c2Setting.chat), C2_CHAT = [c2Box.x - 6, c2Box.bottom - 230, c2Box.x + c2Box.width + 6, c2Box.bottom - 60];
V.c2 = { setting: c2Setting, chatExcluded: C2_CHAT, K: [], W: [], T: [] };
{
  const layers = hudLayers(c2Setting, assets, { chat: false });
  const mask = regionMask([C2_CHAT], true), mv = movingScreen(c2Setting.lower, c2Setting.top);
  for (let p = 0; p < mask.length; p++) if (mv[p]) mask[p] = 0;
  const predK = composeScreen(0, layers, { exact: true }), predW = composeScreen(255, layers, { exact: true }), predT = composeScreen(world, layers, { exact: true });
  // Opaque HUD samples (where the world cannot matter).
  const opaque = new Uint8Array(SW * SH);
  for (let p = 0; p < opaque.length; p++) opaque[p] = mask[p] && Math.abs(predK[p * 3] - predW[p * 3]) + Math.abs(predK[p * 3 + 1] - predW[p * 3 + 1]) + Math.abs(predK[p * 3 + 2] - predW[p * 3 + 2]) === 0 && (predK[p * 3] | predK[p * 3 + 1] | predK[p * 3 + 2]) > 0 ? 1 : 0;
  for (const l of c2.filter((l) => !c2Hidden(l))) {
    const img = (await frame(frameOf(l))).data;
    if (l.global === 'K') V.c2.K.push({ file: l.file, ...errorStats(predK, img, mask) });
    else if (l.global === 'W') V.c2.W.push({ file: l.file, ...errorStats(predW, img, mask) });
    else if (!worldFrames.includes(l)) V.c2.T.push({ file: l.file, all: errorStats(predT, img, mask), opaqueHud: errorStats(predT, img, opaque) });
  }
  V.c2.opaqueSamples = opaque.reduce((a, b) => a + b, 0);
  const k0 = c2.find((l) => l.global === 'K' && !c2Hidden(l));
  const k0img = (await frame(frameOf(k0))).data;
  await savePNG('c2-K-diff.png', diffImage(predK, k0img, mask));
  // Where C2 and the S-85-110 layers disagree by more than 2 levels: what (the game's own state differs
  // between two Dota launches: the clock, units on the minimap, timers).
  const bad = new Uint8Array(SW * SH);
  for (let p = 0; p < bad.length; p++) if (mask[p]) for (let c = 0; c < 3; c++) if (Math.abs(predK[p * 3 + c] - k0img[p * 3 + c]) > 2) bad[p] = 1;
  V.c2.mismatch = components(dilate(bad, SW, SH, 2), SW, SH).map((c) => ({ rect: [c.x0, c.y0, c.x1 + 1, c.y1 + 1], samples: c.cells.length })).sort((a, b) => b.samples - a.samples).slice(0, 20);
  log('C2 mismatch areas:', JSON.stringify(V.c2.mismatch));
  // The same comparison without those areas (grown by 3 px).
  const away = dilate(bad, SW, SH, 3), mask2 = new Uint8Array(mask);
  for (let p = 0; p < mask2.length; p++) if (away[p]) mask2[p] = 0;
  V.c2.excludedGameState = SW * SH - mask2.reduce((a, b) => a + b, 0) - (SW * SH - mask.reduce((a, b) => a + b, 0));
  V.c2.Kstatic = [], V.c2.Wstatic = [];
  for (const l of c2.filter((l) => !c2Hidden(l) && (l.global === 'K' || l.global === 'W'))) {
    const img = (await frame(frameOf(l))).data;
    V.c2[l.global === 'K' ? 'Kstatic' : 'Wstatic'].push({ file: l.file, ...errorStats(l.global === 'K' ? predK : predW, img, mask2) });
  }
  log('C2 without game state:', JSON.stringify([...V.c2.Kstatic, ...V.c2.Wstatic].map((r) => [r.file, r.psnr, r.max, r.within1])));
  log('C2 K:', JSON.stringify(V.c2.K.map((r) => [r.file, r.psnr, r.max, r.within1])));
  log('C2 W:', JSON.stringify(V.c2.W.map((r) => [r.file, r.psnr, r.max, r.within1])));
  log('C2 T:', JSON.stringify(V.c2.T.map((r) => [r.file, r.all.psnr, r.opaqueHud.psnr, r.opaqueHud.max])));
}

// 4. The defaults (100 / 100, no tint): C1 frames of the RDEF block, phase 2 — over K / W with the lower
//    box on its ring colour, pixel for pixel outside the chat (Active there), the wash panel and moving parts.
V.defaults = [];
{
  // The rest's side tab lies under the lower HUD's box (filled with the ring colour here): left out.
  const set = lowerSets[100], def = settingsOf({}), boxTop = lowerDiag[100].ringRow;
  // The rest is hidden 6 s a minute and the top bar 6 s of every 18 in C1 (their own clocks): each is drawn
  // only when the frame shows it.
    const layersFor = (l) => hudLayers(def, { ...assets, top: l.global === 'T' || l.ink?.top > 0 ? topPlates : {}, rest: l.global === 'T' || l.ink?.rest > 0 ? restPlates.filter((p) => p.y + p.h <= boxTop) : [] }, { chat: false });
  const mask = regionMask([CHAT_DOMAIN, CLONE], true), mv = movingScreen(100, 100);
  for (let p = 0; p < mask.length; p++) if (mv[p]) mask[p] = 0;
  for (const l of labels.filter((l) => usable(l) && l.pack === 'C1' && l.lower.block === 'RDEF' && l.lower.part === 'core')) {
    const img = (await frame(frameOf(l))).data, q = (800 * SW + 1500) * 3, fill = [img[q], img[q + 1], img[q + 2]];
    const back = new Uint8Array(SW * SH * 3);
    const g = l.global === 'K' ? 0 : l.global === 'W' ? 255 : null;
    for (let p = 0; p < SW * SH; p++) for (let c = 0; c < 3; c++) back[p * 3 + c] = p >= boxTop * SW ? fill[c] : g ?? img[p * 3 + c];
    const pred = composeScreen(back, layersFor(l), { exact: true });
    if (g !== null) V.defaults.push({ file: l.file, global: l.global, ...errorStats(pred, img, mask) });
    else {
      // T: outside the lower box the world is unknown under translucent HUD: only the lower box (over its
      // known ring colour) is compared.
      const m2 = regionMask([[0, boxTop, SW, SH]]);
      for (let p = 0; p < m2.length; p++) if (!mask[p]) m2[p] = 0;
      V.defaults.push({ file: l.file, global: 'T (lower box)', ...errorStats(pred, img, m2) });
    }
  }
  {
    const l = labels.find((x) => x.file === V.defaults[0].file), img = (await frame(frameOf(l))).data;
    const q = (800 * SW + 1500) * 3, back = new Uint8Array(SW * SH * 3), g = l.global === 'K' ? 0 : 255;
    for (let p = 0; p < SW * SH; p++) for (let c = 0; c < 3; c++) back[p * 3 + c] = p >= boxTop * SW ? img[q + c] : g;
    await savePNG('defaults-diff.png', diffImage(composeScreen(back, layersFor(l), { exact: true }), img, mask));
  }
  log('defaults:', JSON.stringify(V.defaults.map((r) => [r.file, r.global, r.psnr, r.max, r.within1])));
}


// ---- Side-by-side comparisons (report): ours on the left, Dota's frame on the right ----
if (REPORT) {
  const nearestWorld = (l, pool) => pool.reduce((a, b) => (Math.abs(b.t - l.t) < Math.abs(a.t - l.t) ? b : a));
  // 1. C2: production rules of one setting over C2's world (our chat passive where Dota's is Active).
  const t2 = c2.filter((l) => l.global === 'T' && !worldFrames.includes(l)).reduce((a, b) => (Math.abs(b.t - worldFrames[0].t) < Math.abs(a.t - worldFrames[0].t) ? b : a));
  const ours2 = composeScreen(world, hudLayers(c2Setting, assets, { chat: true }), { exact: true });
  await sideBySide('compare-c2.png', ours2, (await frame(frameOf(t2))).data);
  report.compare = { 'compare-c2.png': { ours: 'C2 setting over ' + worldFrames[0].file, dota: t2.file } };
  // 2–3. C1 real views (default; «compact» opacity 70 with flares hidden): the lower box over its ring
  // colour as in the frame, the world elsewhere from the nearest C1 frame with the lower HUD hidden.
  const hides = labels.filter((l) => usable(l) && l.pack === 'C1' && l.global === 'T' && l.lower.hidden);
  const boxTop = lowerDiag[100].ringRow;
  for (const [name, block, part] of [['compare-default.png', 'RDEF', {}], ['compare-rcmp.png', 'RCMP', { opacity: 70, hide: ['flares'] }]]) {
    const l = labels.find((x) => usable(x) && x.pack === 'C1' && x.lower.block === block && x.lower.part === 'core' && x.global === 'T');
    const img = (await frame(frameOf(l))).data, wl = nearestWorld(l, hides), wimg = (await frame(frameOf(wl))).data, q = (800 * SW + 1500) * 3;
    const back = new Uint8Array(SW * SH * 3);
    for (let p = 0; p < SW * SH; p++) for (let c = 0; c < 3; c++) back[p * 3 + c] = p >= boxTop * SW ? img[q + c] : wimg[p * 3 + c];
    const st = settingsOf(part), layers = hudLayers(st, { ...assets, rest: restPlates.filter((p) => p.y + p.h <= boxTop) }, { chat: false });
    await sideBySide(name, composeScreen(back, layers, { exact: true }), img);
    report.compare[name] = { ours: `${block} settings ${JSON.stringify(part)}, world from ${wl.file}, lower box on the frame's ring colour (the chat is Dota's own, in the world frame)`, dota: l.file };
  }
}

// ---- Export ----
// Atlases: lossless WebP RGBA (alpha 255, or 0 outside a patch's own pixels), one per lower scale, one per
// top scale and one for the chat and the rest; hud.json says where each plate is and where it goes.
async function atlas(name, plates) {
  // Shelf packing in rows of one width.
  const W = Math.max(...plates.map((p) => p.w)), placed = [];
  let x = 0, y = 0, rowH = 0;
  for (const p of plates) {
    if (x + p.w > W) { x = 0; y += rowH; rowH = 0; }
    placed.push({ ...p, sx: x, sy: y }); x += p.w; rowH = Math.max(rowH, p.h);
  }
  const H = y + rowH, rgba = new Uint8Array(W * H * 4);
  for (const p of placed) for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) {
    const s = (yy * p.w + xx) * 3, d = ((p.sy + yy) * W + p.sx + xx) * 4, on = !p.mask || p.mask[yy * p.w + xx];
    rgba[d] = on ? p.data[s] : 0; rgba[d + 1] = on ? p.data[s + 1] : 0; rgba[d + 2] = on ? p.data[s + 2] : 0; rgba[d + 3] = on ? 255 : 0;
  }
  await sharp(Buffer.from(rgba.buffer), { raw: { width: W, height: H, channels: 4 } }).webp({ lossless: true, effort: 6 }).toFile(join(OUT, name));
  // The page checks the decoded bytes against this (FNV-1a over the RGBA it should get back).
  let hsh = 0x811c9dc5;
  for (let i = 0; i < rgba.length; i++) hsh = Math.imul(hsh ^ rgba[i], 16777619);
  (manifest.checksums ||= {})[name] = (hsh >>> 0).toString(16).padStart(8, '0');
  return Object.fromEntries(placed.map((p) => [p.id, [p.sx, p.sy]]));
}
// A plate as two atlas entries (k and w); its record for hud.json.
const entries = (id, p) => [{ id: `${id}.k`, w: p.w, h: p.h, data: p.k, mask: p.mask }, { id: `${id}.w`, w: p.w, h: p.h, data: p.wt, mask: p.mask }];
const record = (id, p, at) => ({ rect: [p.x, p.y, p.w, p.h], k: at[`${id}.k`], w: at[`${id}.w`], ...(p.mask ? { mask: true } : {}) });
if (!sharp) throw new Error('export needs sharp');
mkdirSync(OUT, { recursive: true });
const manifest = { format: 'gridstudio-hud-capture/1', generated: report.generated, blend: 'linear', screen: [SW, SH],
  source: { session: cap.session?.started || null, plan: plan.plan, frames: cap.frames.length },
  scales: { lower: Object.keys(lowerSets).map(Number).sort((a, b) => a - b), top: Object.keys(topPlates).map(Number).sort((a, b) => a - b) },
  world: 'world.webp', lower: {}, top: {}, common: 'common.webp', rest: [], chat: null };
for (const [scale, set] of Object.entries(lowerSets)) {
  const parts = [['base', set.base], ['cbg', set.cbg], ...Object.entries(set.decor).flatMap(([k, d]) => [[`${k}.C`, d.C], [`${k}.F`, d.F]])];
  const file = `lower-${scale}.webp`, at = await atlas(file, parts.flatMap(([id, p]) => entries(id, p)));
  manifest.lower[scale] = { atlas: file, base: record('base', set.base, at), cbg: record('cbg', set.cbg, at),
    decor: Object.fromEntries(Object.entries(set.decor).map(([k, d]) => [k, { C: record(`${k}.C`, d.C, at), F: record(`${k}.F`, d.F, at) }])) };
}
for (const [scale, p] of Object.entries(topPlates)) {
  const file = `top-${scale}.webp`, at = await atlas(file, entries('top', p));
  manifest.top[scale] = { atlas: file, plate: record('top', p, at) };
}
{
  const parts = [['chat', chatAsset.plate], ...restPlates.map((p, i) => [`rest${i}`, p])];
  const at = await atlas('common.webp', parts.flatMap(([id, p]) => entries(id, p)));
  manifest.chat = { plate: record('chat', chatAsset.plate, at), anchor: chatAsset.anchor, wrap: chatAsset.wrap };
  manifest.rest = restPlates.map((p, i) => record(`rest${i}`, p, at));
}
await sharp(Buffer.from(world.buffer, world.byteOffset, world.length), { raw: { width: SW, height: SH, channels: 3 } }).webp({ quality: 90, effort: 6 }).toFile(join(OUT, 'world.webp'));
manifest.validation = {
  blendSpace: report.blendSpace.verdict, greyWithin1: Object.fromEntries(Object.entries(V.grey).map(([k, v]) => [k, v.within1])),
  c2: { psnrMin: Math.min(...[...V.c2.Kstatic, ...V.c2.Wstatic].map((r) => r.psnr)), within1Min: Math.min(...[...V.c2.Kstatic, ...V.c2.Wstatic].map((r) => r.within1)) },
  defaults: { psnrMin: Math.min(...V.defaults.map((r) => r.psnr)), within1Min: Math.min(...V.defaults.map((r) => r.within1)) }
};
// Round trip: every atlas decodes to the bytes it was made of.
for (const [name, want] of Object.entries(manifest.checksums)) {
  const { data } = await sharp(join(OUT, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) if (!data[i + 3]) data[i] = data[i + 1] = data[i + 2] = 0;
  let hsh = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) hsh = Math.imul(hsh ^ data[i], 16777619);
  if ((hsh >>> 0).toString(16).padStart(8, '0') !== want) throw new Error(`${name}: the WebP does not decode to its plates`);
}
writeFileSync(join(OUT, 'hud.json'), JSON.stringify(manifest, null, 1) + '\n');
{
  const { readdirSync, statSync } = await import('node:fs');
  report.export = Object.fromEntries(readdirSync(OUT).map((f) => [f, statSync(join(OUT, f)).size]));
  log('export:', report.export, 'total', Object.values(report.export).reduce((a, b) => a + b, 0));
}

if (REPORT) { mkdirSync(REPORT, { recursive: true }); writeFileSync(join(REPORT, 'report.json'), JSON.stringify(report, null, 1)); }
export { topPlates, restPlates, chatAsset, labels, lowerSets, frame, frameOf, images, statePlates, statePlatesKW, report, byFile, hashGroups, usable };
