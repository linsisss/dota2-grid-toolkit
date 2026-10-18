// Main-menu capture solver, first steps (plan of 2026-10-17, scripts/menu-capture/plan.mjs): ingest the
// watcher's zip, read every frame's backdrop and probe code from its own pixels, compare with session.json,
// count coverage per state and backdrop, and measure each part's footprint and motion. The plates and the
// compose follow once the capture is in (the HUD's scripts/hud-capture/{layers,compose}.mjs are the model).
// Images are { width, height, data } with RGB bytes, as in scripts/hud-capture/ingest.mjs.
import { basename, join, relative, sep } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { openZip, pixel, rectClip } from '../hud-capture/ingest.mjs';
import { decodeSquares } from './plan.mjs';

// ---- Ingest ----
const FRAME_RE = /(?:^|\/)(M1|V1)_(\d+)\.(png|jpe?g)$/i;
export function frameName(name) {
  const m = FRAME_RE.exec(name.replace(/\\/g, '/'));
  return m ? { pack: m[1].toUpperCase(), seq: Number(m[2]), ext: m[3].toLowerCase() } : null;
}
function walk(dir) {
  return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
}
// The capture from Desktop\gs-menu-capture.zip or its folder: frames (M1 first, then V1, by number) with
// read(), the watcher's record of each (t, probe), session.json and what was refused.
export function openMenuCapture(input) {
  if (!existsSync(input)) throw new Error(`${input}: not found`);
  let files, close = () => {};
  if (statSync(input).isDirectory()) files = walk(input).map((path) => ({ name: relative(input, path).split(sep).join('/'), size: statSync(path).size, read: () => readFileSync(path) }));
  else { const zip = openZip(input); files = zip.entries.map((e) => ({ name: e.name, size: e.size, read: () => zip.read(e) })); close = zip.close; }
  const text = files.find((f) => basename(f.name).toLowerCase() === 'session.json')?.read().toString('utf8') ?? null;
  const session = text ? JSON.parse(text.replace(/^﻿/, '')) : null;
  const frames = [], rejected = [];
  for (const f of files) {
    if (/session\.json$/i.test(f.name)) continue;
    const id = frameName(f.name);
    if (!id) { if (/\.(png|jpe?g)$/i.test(f.name)) rejected.push({ name: f.name, reason: 'не из съёмки меню (имя не M1_…/V1_…)' }); continue; }
    if (id.ext !== 'png') { rejected.push({ name: f.name, reason: 'не PNG' }); continue; }
    frames.push({ name: f.name, pack: id.pack, seq: id.seq, size: f.size, read: f.read });
  }
  frames.sort((a, b) => a.pack.localeCompare(b.pack) || a.seq - b.seq);
  const rec = new Map((session?.frames || []).filter((s) => s?.file).map((s) => [s.file.toLowerCase(), s]));
  frames.forEach((f, i) => { f.index = i; const r = rec.get(basename(f.name).toLowerCase()); if (r) { f.t = r.t ?? null; f.rel = r.rel ?? null; f.probe = r.probe || null; f.late = !!r.late; } });
  return { input, session, frames, rejected, close };
}

// ---- One frame ----
// Exact backdrops: K 0, W 255, G 128 or 129 (Panorama decodes #808080 with gamma 2.2, the screen is sRGB).
const exact = ([r, g, b]) => (r === 0 && g === 0 && b === 0 ? 'K' : r === 255 && g === 255 && b === 255 ? 'W' : r === g && g === b && (r === 128 || r === 129) ? 'G' : 'T');
export function backdropOf(img, points) {
  const seen = points.map((p) => exact(pixel(img, p[0], p[1])));
  return seen.every((v) => v === seen[0]) ? seen[0] : 'T';
}
export const backdropValue = (bg) => (bg === 'K' ? 0 : bg === 'W' ? 255 : null);
// The probe code: every row read; { state, part, pack, rows, agree } or null.
export function readCode(img, probes) {
  let first = null, rows = 0, agree = true;
  for (const row of probes.rows) {
    const rgbs = Array.from({ length: probes.squares }, (_, i) => pixel(img, row.x + i * probes.pitch + (probes.size >> 1), row.y + (probes.size >> 1)));
    const c = decodeSquares(rgbs);
    if (!c) continue;
    rows++;
    if (!first) first = c; else if (c.state !== first.state || c.part !== first.part || c.pack !== first.pack) agree = false;
  }
  return first ? { ...first, rows, agree } : null;
}
export function frameFeatures(img, plan) {
  const bg = backdropOf(img, plan.probes.free), code = readCode(img, plan.probes), f = { bg, code };
  if (bg !== 'T') {
    const at = (p) => exact(pixel(img, p[0], p[1])) === bg;
    f.toggles = { bar: at(plan.probes.toggles.bar), rail: at(plan.probes.toggles.rail) };
  }
  return f;
}

// ---- All frames ----
const PART_NAMES = ['core', 'g1', 'g2'];
// Labels: { file, index, pack, seq, t, bg, state (id), stateIndex, part, on } plus checks of session.json
// against the pixels (the pixels win) and the frames whose code is unreadable or of the other pack.
export function labelFrames(frames, features, plan) {
  const packs = new Map(plan.packs.map((p) => [p.id, p])), checks = [], uncoded = [];
  const labels = frames.map((frame, i) => {
    const f = features[i], pk = packs.get(frame.pack), l = { file: frame.name, index: frame.index, pack: frame.pack, seq: frame.seq, t: frame.t ?? null, bg: f.bg, toggles: f.toggles || null };
    if (f.code && f.code.pack === pk?.code && f.code.state < pk.states.length) {
      const s = pk.states[f.code.state];
      Object.assign(l, { stateIndex: f.code.state, state: s.id, part: PART_NAMES[f.code.part], on: s.on, rowsAgree: f.code.agree });
    } else uncoded.push({ file: frame.name, why: f.code ? `код пакета ${f.code.pack}` : 'метка не читается' });
    const p = frame.probe;
    if (p) {
      const theirs = typeof p.g === 'string' ? p.g.replace(/^n/, '') : null;
      if (theirs && theirs !== f.bg && !(p.g.startsWith('n') && f.bg === 'T')) checks.push({ file: frame.name, field: 'backdrop', session: p.g, pixels: f.bg });
      if (typeof p.state === 'number' && p.state !== (l.stateIndex ?? -1)) checks.push({ file: frame.name, field: 'state', session: p.state, pixels: l.stateIndex ?? -1 });
    }
    return l;
  });
  return { labels, checks, uncoded };
}
// Coverage per pack and state: frames per backdrop, core and guards; missing = core K/W (and G for the
// watcher's gRequired states) with no frame.
export function coverage(labels, plan) {
  const out = {};
  for (const pk of plan.packs) {
    const w = pk.id === 'M1' ? plan.watcher.m1 : plan.watcher.v1, states = {};
    for (const s of pk.states) states[s.id] = { K: { core: 0, guard: 0 }, W: { core: 0, guard: 0 }, G: { core: 0, guard: 0 } };
    let frames = 0, coded = 0;
    for (const l of labels.filter((x) => x.pack === pk.id)) {
      frames++;
      if (!l.state) continue;
      coded++;
      if (states[l.state][l.bg]) states[l.state][l.bg][l.part === 'core' ? 'core' : 'guard']++;
    }
    const missing = [];
    for (const s of pk.states) for (const bg of ['K', 'W', ...(w.gRequired.includes(s.id) ? ['G'] : [])]) if (!states[s.id][bg].core) missing.push(`${s.id}.${bg}`);
    out[pk.id] = { frames, coded, states, missing, complete: missing.length === 0 };
  }
  return out;
}
// The toggle check (over white, core frames): NONE shows the backdrop at the bar's and the rail's points,
// ALL does not. 'ok', 'partial' (one point clears: something of the base stays there), 'fail' (nothing
// hides), 'unseen'.
export function toggleVerdict(labels, pack) {
  const of = (id) => labels.filter((l) => l.pack === pack && l.state === id && l.part === 'core' && l.bg === 'W' && l.toggles);
  const none = of('NONE'), all = of('ALL');
  if (!none.length || !all.length) return 'unseen';
  if (!all.some((l) => !l.toggles.bar && !l.toggles.rail)) return 'fail';
  return none.some((l) => l.toggles.bar && l.toggles.rail) ? 'ok' : none.some((l) => l.toggles.bar || l.toggles.rail) ? 'partial' : 'fail';
}

// ---- Pixels ----
// Where two frames differ (any channel by more than tol): { count, box [x0, y0, x1, y1] or null }.
// exclude: rectangles left out (the probe squares, which change with every state).
export function diffBox(a, b, { tol = 0, rect = null, exclude = [] } = {}) {
  const [x0, y0, x1, y1] = rectClip(rect || [0, 0, a.width, a.height], a.width, a.height);
  const skip = exclude.filter((r) => r[0] < x1 && r[2] > x0 && r[1] < y1 && r[3] > y0);
  let count = 0, bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = y0; y < y1; y++) for (let x = x0, i = (y * a.width + x0) * 3; x < x1; x++, i += 3) {
    if (skip.length && skip.some((r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])) continue;
    if (Math.abs(a.data[i] - b.data[i]) > tol || Math.abs(a.data[i + 1] - b.data[i + 1]) > tol || Math.abs(a.data[i + 2] - b.data[i + 2]) > tol) {
      count++; if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y;
    }
  }
  return { count, box: count ? [bx0, by0, bx1 + 1, by1 + 1] : null };
}
// Pixels of a frame not equal to an exact backdrop (K/W) inside a rectangle: the part's ink.
export function inkBox(img, bg, rect = null) {
  const v = backdropValue(bg);
  if (v === null) throw new Error('inkBox: K or W backdrop');
  const [x0, y0, x1, y1] = rectClip(rect || [0, 0, img.width, img.height], img.width, img.height);
  let count = 0, bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = y0; y < y1; y++) for (let x = x0, i = (y * img.width + x0) * 3; x < x1; x++, i += 3) {
    if (img.data[i] !== v || img.data[i + 1] !== v || img.data[i + 2] !== v) { count++; if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
  }
  return { count, box: count ? [bx0, by0, bx1 + 1, by1 + 1] : null };
}
// The probe squares' rectangles (grown by 2 px), for diffBox's exclude.
export const probeRects = (probes) => probes.rows.flatMap((row) => Array.from({ length: probes.squares }, (_, i) => [row.x + i * probes.pitch - 2, row.y - 2, row.x + i * probes.pitch + probes.size + 2, row.y + probes.size + 2]));
// Mean absolute difference (per channel) of a rectangle from one flat value: how much ink a crop holds.
export function inkLevel(img, rect, value) {
  const [x0, y0, x1, y1] = rectClip(rect, img.width, img.height);
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0, i = (y * img.width + x0) * 3; x < x1; x++, i += 3) { sum += Math.abs(img.data[i] - value) + Math.abs(img.data[i + 1] - value) + Math.abs(img.data[i + 2] - value); n += 3; }
  return n ? sum / n : 0;
}
export const boxOverlap = (a, b) => {
  if (!a || !b) return 0;
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? (w * h) / ((a[2] - a[0]) * (a[3] - a[1])) : 0;
};
// The horizontal (or vertical) shift that puts a part's crop from one frame onto another best: the crop
// of `from` in `rect`, searched in `to` over shifts −range…range; { shift, error (mean abs per channel),
// exact (pixels equal) }. Used for V1: how far production's hidden buttons move the others.
export function bestShift(from, to, rect, { axis = 'x', range = 300, step = 1 } = {}) {
  const [x0, y0, x1, y1] = rectClip(rect, from.width, from.height);
  const total = Math.max(1, (x1 - x0) * (y1 - y0) * 3);
  let best = { shift: null, error: Infinity, exact: 0 };
  for (let s = -range; s <= range; s += step) {
    const dx = axis === 'x' ? s : 0, dy = axis === 'y' ? s : 0;
    if (x0 + dx < 0 || x1 + dx > to.width || y0 + dy < 0 || y1 + dy > to.height) continue;
    let err = 0, n = 0, same = 0;
    for (let y = y0; y < y1 && err <= best.error * total; y++) for (let x = x0; x < x1; x++) {
      const i = (y * from.width + x) * 3, j = ((y + dy) * to.width + x + dx) * 3;
      const d = Math.abs(from.data[i] - to.data[j]) + Math.abs(from.data[i + 1] - to.data[j + 1]) + Math.abs(from.data[i + 2] - to.data[j + 2]);
      err += d; n += 3; if (!d) same++;
    }
    const e = n === total ? err / total : Infinity;
    if (e < best.error) best = { shift: s, error: e, exact: same / Math.max(1, n / 3) };
  }
  return best;
}
