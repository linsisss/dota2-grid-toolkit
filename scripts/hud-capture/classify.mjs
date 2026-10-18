// HUD capture solver — classification (plan r2, 2026-10-17). Every frame is classified from its own pixels;
// session.json's map is only compared with it (the pixels win where they disagree):
//   global  #HUDElements' backdrop K / W exact at the free points, else T (the world);
//   ring    the marker ring on #lower_hud (R 255, G = 20·mark, B 0 / 120 / 240 for core / g1 / g2): its first
//           row gives the scale, its colour the block and part; no ring = the lower HUD hidden;
//   local   the lower HUD's own backdrop K / W / G at two probes; 'O' when the box is filled with the ring
//           colour (Panorama paints an outer box-shadow under the panel too: the R blocks, whose backdrop is
//           transparent, show the HUD over that solid colour, not over the world); T otherwise;
//   hashes  of fixed rectangles (top bar, chat, rest, clone …): equal hashes over one backdrop = one state.
// Learned in the first session (2026-10-17): the chat's own panels (chat.xml) never take custom_ui.css rules
// (the chat box cycle, fonts, heights and the Expired override did nothing), the portrait, the level-up
// particles and the first ability's pulse move while paused, and colour-blind mode is set in C1 phase 1 only.
import { pixel, rectClip } from './ingest.mjs';

const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const hexRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// ---- Backdrops ----
// Grey #808080 reaches the screen as 129 (Panorama decodes CSS colours with gamma 2.2, the screen is sRGB).
const exact = ([r, g, b]) => (r === 0 && g === 0 && b === 0 ? 'K' : r === 255 && g === 255 && b === 255 ? 'W' : r === g && g === b && (r === 128 || r === 129) ? 'G' : 'T');
// All points the same exact colour, or 'T'. allowG: grey counts (the lower HUD's local backdrop).
export function backdropAt(img, points, { allowG = false } = {}) {
  const seen = points.map((p) => { const v = exact(pixel(img, p[0], p[1])); return v === 'G' && !allowG ? 'T' : v; });
  return seen.every((v) => v === seen[0]) ? seen[0] : 'T';
}

// ---- The marker ring ----
// Ring colours of the plan's marks (snapshot lower.marks): [{ colour, block, part }].
const near = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
// The first run of one mark colour on the ring column (top down): { row, len, block, part, mark, fill }.
// fill = the run goes on far below the ring (the box filled with the shadow colour: an R block).
export function findRing(img, { x, y: [ya, yb], spread = 6 }, marks, tol = 3) {
  const known = marks.map((m) => ({ ...m, rgb: hexRGB(m.colour) }));
  for (let y = Math.max(0, ya); y < Math.min(img.height, yb); y++) {
    const m = known.find((k) => near(pixel(img, x, y), k.rgb, tol));
    if (!m) continue;
    let end = y;
    while (end + 1 < img.height && near(pixel(img, x, end + 1), m.rgb, tol)) end++;
    const len = end - y + 1;
    if (len < spread - 2) continue;
    return { row: y, len, block: m.block, part: m.part, colour: m.colour, fill: len > spread + 4 };
  }
  return null;
}
// The plan's lower box top (first row under the ring) at a scale, and the ring row the game draws (its
// layout rounds the box to whole pixels).
export const lowerBoxTop = (scale, lowerHeight = 506, height = 1080) => height - (lowerHeight * scale) / 100;

// ---- Hashes ----
// FNV-1a over the RGB bytes of a rectangle (clipped), optionally skipping masked-out pixels.
export function rectHash(img, rect, skip = null) {
  const [x0, y0, x1, y1] = rectClip(rect, img.width, img.height);
  let h = 0x811c9dc5;
  for (let y = y0; y < y1; y++) {
    let i = (y * img.width + x0) * 3;
    for (let x = x0; x < x1; x++, i += 3) {
      if (skip && skip(x, y)) continue;
      h = Math.imul(h ^ img.data[i], 16777619); h = Math.imul(h ^ img.data[i + 1], 16777619); h = Math.imul(h ^ img.data[i + 2], 16777619);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
// Pixels of a rectangle that are not the backdrop colour.
export function inkCount(img, rect, bg) {
  const v = bg === 'K' ? 0 : bg === 'W' ? 255 : 128, [x0, y0, x1, y1] = rectClip(rect, img.width, img.height);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0, i = (y * img.width + x0) * 3; x < x1; x++, i += 3) if (img.data[i] !== v || img.data[i + 1] !== v || img.data[i + 2] !== v) n++;
  return n;
}

// The rectangles hashed for every frame (1920 × 1080, fixed: they hold a region at all its scales).
export const HASH_RECTS = freeze({
  top: [490, 0, 1430, 60],           // the top bar at 70–120 % (DayGlow inside)
  dayGlow: [920, 0, 1000, 48],
  chat: [36, 380, 844, 538],         // C1 / S chat lines (the parked chat, over its own lines box)
  chatControls: [36, 538, 844, 567],
  rest: [0, 0, 190, 110],            // menu buttons and quick stats
  clone: [1180, 200, 1669, 345],     // the wash test panel (C1)
  cursorA: [1772, 262, 1830, 324],
  cursorB: [1772, 532, 1830, 567]
});

// One frame's features. geometry = the plan snapshot's geometry; marks = its lower.marks.
export function frameFeatures(img, plan) {
  const g = plan.geometry, f = { global: backdropAt(img, g.free) };
  const ring = findRing(img, g.ring, plan.lower.marks);
  f.ring = ring;
  f.local = ring ? (ring.fill ? 'O' : backdropAt(img, g.lowerBackdrop, { allowG: true })) : backdropAt(img, g.lowerBackdrop, { allowG: true });
  f.hash = Object.fromEntries(Object.entries(HASH_RECTS).map(([k, r]) => [k, rectHash(img, r)]));
  if (f.global === 'K' || f.global === 'W') {
    f.ink = { top: inkCount(img, HASH_RECTS.top, f.global), chat: inkCount(img, HASH_RECTS.chat, f.global), rest: inkCount(img, HASH_RECTS.rest, f.global),
      cursorA: inkCount(img, HASH_RECTS.cursorA, f.global), cursorB: inkCount(img, HASH_RECTS.cursorB, f.global) };
  }
  return f;
}

// ---- Labels (pass 2) ----
// The scale of a pack: C1 and C2's own setting are known, an S pack's id says it.
export function packScale(pack, plan) {
  if (pack === 'C1' || pack === 'F-bg') return { lower: 100, top: 100 };
  if (pack === 'C2') return { lower: plan.c2.normalized.lower, top: plan.c2.normalized.top };
  const m = /^S-(\d+)-(\d+)$/.exec(pack);
  return m ? { lower: +m[1], top: +m[2] } : null;
}
// Labels: per frame { file, pack, phase, global, lower: { block, part, scale, local, ringRow } | { hidden } }
// plus `checks` (session.json against pixels) and the ring row of every pack (the game's rounding).
export function labelFrames(frames, features, plan) {
  const blocks = new Map(plan.lower.blocks.map((b) => [b.id, b])), checks = [], ringRows = {};
  const labels = frames.map((frame, i) => {
    const f = features[i], scale = packScale(frame.pack, plan);
    const l = { file: frame.name, index: frame.index, pack: frame.pack, phase: frame.phase ?? null, t: frame.t ?? null, global: f.global, local: f.local, hash: f.hash, ink: f.ink || null };
    if (f.ring) {
      l.lower = { block: f.ring.block, part: f.ring.part, kids: blocks.get(f.ring.block)?.kids || null, scale: scale?.lower ?? null, ringRow: f.ring.row, fill: f.ring.fill };
      (ringRows[frame.pack] ||= new Map()).set(f.ring.row, ((ringRows[frame.pack].get(f.ring.row)) || 0) + 1);
    } else l.lower = { hidden: true };
    // The watcher's map, kept beside ours.
    const p = frame.probe;
    if (p) {
      const theirs = p.g === 'nK' ? 'K' : p.g === 'nW' ? 'W' : p.g;
      if (theirs && theirs !== f.global) checks.push({ file: frame.name, field: 'global', session: p.g, pixels: f.global });
      const mark = f.ring ? blocks.get(f.ring.block)?.mark : 0;
      if (typeof p.mark === 'number' && p.mark !== mark) checks.push({ file: frame.name, field: 'mark', session: p.mark, pixels: mark });
    }
    return l;
  });
  // One ring row per pack (a static scale): frames whose ring is elsewhere are flagged.
  const rows = Object.fromEntries(Object.entries(ringRows).map(([pack, m]) => [pack, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  for (const l of labels) if (l.lower.ringRow != null && l.lower.ringRow !== rows[l.pack]) { l.lower.bad = `ring at ${l.lower.ringRow}, the pack's is ${rows[l.pack]}`; checks.push({ file: l.file, field: 'ringRow', pixels: l.lower.ringRow, pack: rows[l.pack] }); }
  return { labels, rows, checks };
}

// Groups of frames whose rectangle hash is equal, over one backdrop: [{ hash, files: [...] }] by size.
export function hashGroups(labels, key, filter = () => true) {
  const m = new Map();
  for (const l of labels.filter(filter)) { const h = l.hash[key]; if (!m.has(h)) m.set(h, []); m.get(h).push(l); }
  return [...m].map(([hash, list]) => ({ hash, list })).sort((a, b) => b.list.length - a.list.length);
}
