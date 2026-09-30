// «Точечный рисунок»: dots along the lines of a picture, the way dot arts are drawn by hand —
// evenly spaced along every stroke, no stray bits, dots packed into rows afterwards
// (dot-packing.mjs). Lines come from a line drawing (dark strokes thinned to 1 px) or, for
// photos, from Canny edges. Thinning leaves short side branches that nobody would draw;
// they are pruned, and each traced path is smoothed so the dots follow a pen line instead
// of a pixel staircase.
import { gaussianBlur, sobel, nonMaxSuppression, hysteresis, thinning } from './edges.mjs';

export const TRACE_DEFAULTS = Object.freeze({ source: 'auto', fill: 85, detail: 60, spacing: 4.5, length: 16, pack: true });
// The dots a full canvas can take before the result stops looking drawn.
export const TRACE_MAX_DOTS = 8000;
const N8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Levels (1–99 percentile) and the side that is ink: the border of a picture is its background.
export function traceTone(luma, w, h) {
  const sorted = Float32Array.from(luma).sort();
  const lo = sorted[Math.floor((luma.length - 1) * 0.01)], hi = sorted[Math.floor((luma.length - 1) * 0.99)];
  const level = luma.map((v) => clamp01((v - lo) / (hi - lo || 1)));
  let border = 0;
  for (let x = 0; x < w; x++) border += level[x] + level[(h - 1) * w + x];
  for (let y = 0; y < h; y++) border += level[y * w] + level[y * w + w - 1];
  const ink = border / (2 * (w + h)) > 0.5 ? 'dark' : 'light';
  return { tone: ink === 'dark' ? level.map((v) => 1 - v) : level, level, ink };
}
// A line drawing is mostly background with a little ink and few mid-tones; a photo or a
// painted picture is not.
export function traceSource(tone) {
  let inked = 0, mid = 0;
  for (const v of tone) { if (v > 0.5) inked++; if (v > 0.15 && v < 0.85) mid++; }
  return inked / tone.length < 0.25 && mid / tone.length < 0.12 ? 'lines' : 'edges';
}

// Kuwahara filter (Kuwahara et al., 1976): every pixel takes the mean of the calmest of the
// four (r+1)² quadrants around it. Texture — fur, grass, noise — flattens while edges stay
// sharp, so the edges of a photo are its contours. Summed-area tables make it O(1) a pixel.
export function kuwahara(src, w, h, r) {
  if (!(r >= 1)) return Float32Array.from(src);
  const W1 = w + 1, sum = new Float64Array(W1 * (h + 1)), sq = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0, rowSq = 0;
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x];
      row += v; rowSq += v * v;
      sum[(y + 1) * W1 + x + 1] = sum[y * W1 + x + 1] + row;
      sq[(y + 1) * W1 + x + 1] = sq[y * W1 + x + 1] + rowSq;
    }
  }
  const out = new Float32Array(w * h);
  const box = (table, x0, y0, x1, y1) => table[y1 * W1 + x1] - table[y0 * W1 + x1] - table[y1 * W1 + x0] + table[y0 * W1 + x0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = Infinity, mean = src[y * w + x];
      for (const [x0, x1] of [[x - r, x + 1], [x, x + r + 1]])
        for (const [y0, y1] of [[y - r, y + 1], [y, y + r + 1]]) {
          const ax = Math.max(0, x0), bx = Math.min(w, x1), ay = Math.max(0, y0), by = Math.min(h, y1), n = (bx - ax) * (by - ay);
          const m = box(sum, ax, ay, bx, by) / n, variance = box(sq, ax, ay, bx, by) / n - m * m;
          if (variance < best) { best = variance; mean = m; }
        }
      out[y * w + x] = mean;
    }
  return out;
}

// 1-px skeleton of the lines. detail 0..1: more detail means fainter strokes and weaker
// edges still count. Photos are flattened by kuwahara first (radius ~1/120 of the picture).
// scale < 1: a draft's smaller picture, so the fixed radii shrink with it.
export function traceSkeleton(tone, level, w, h, source, detail = 0.6, flatten = true, scale = 1) {
  if (source === 'lines') {
    const soft = gaussianBlur(tone, w, h, 0.8 * scale), bin = new Uint8Array(w * h), limit = 0.75 - 0.5 * detail;
    for (let i = 0; i < bin.length; i++) bin[i] = soft[i] > limit ? 1 : 0;
    return thinning(bin, w, h);
  }
  const high = Math.max(0.03, 0.22 - 0.16 * detail), r = Math.max(1, Math.round(2 * scale));
  const flat = flatten ? kuwahara(kuwahara(level, w, h, Math.max(r, Math.round(Math.min(w, h) / 120))), w, h, r) : level;
  const { mag, ang } = sobel(gaussianBlur(flat, w, h, (flatten ? 1.2 : 2) * scale), w, h);
  return thinning(hysteresis(nonMaxSuppression(mag, ang, w, h), w, h, high, high * 0.42), w, h);
}

// Removes side branches shorter than `max` px that end in a junction.
export function pruneSpurs(sk, w, h, max = 10, rounds = 2) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x];
  const neighbours = (x, y) => N8.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => on(a, b));
  for (let round = 0; round < rounds; round++) {
    const cut = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!on(x, y) || neighbours(x, y).length !== 1) continue;
      const branch = [], seen = new Set();
      let cx = x, cy = y, junction = false;
      for (;;) {
        branch.push([cx, cy]); seen.add(cy * w + cx);
        if (branch.length > max) break;
        const next = neighbours(cx, cy).filter(([a, b]) => !seen.has(b * w + a));
        if (next.length === 1) { [cx, cy] = next[0]; continue; }
        if (next.length > 1) {
          junction = true;
          // A last pixel that only touches the stroke goes with the branch; a fork between
          // strands that do not touch each other stays.
          const touching = next.every(([a, b]) => next.some(([c, d]) => (a !== c || b !== d) && Math.abs(a - c) <= 1 && Math.abs(b - d) <= 1));
          if (!touching) branch.pop();
        }
        break;
      }
      if (junction && branch.length <= max) cut.push(...branch);
    }
    if (!cut.length) break;
    for (const [x, y] of cut) sk[y * w + x] = 0;
  }
  return sk;
}

// Skeleton → polylines: open strokes from their ends first, closed loops afterwards.
export function tracePaths(sk, w, h) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x];
  const degree = (x, y) => N8.reduce((n, [dx, dy]) => n + (on(x + dx, y + dy) ? 1 : 0), 0);
  const seen = new Uint8Array(w * h), paths = [];
  const walk = (x, y) => {
    const path = [[x, y]];
    seen[y * w + x] = 1;
    for (;;) {
      let next = null;
      for (const [dx, dy] of N8) {
        const nx = x + dx, ny = y + dy;
        if (on(nx, ny) && !seen[ny * w + nx]) { next = [nx, ny]; break; }
      }
      if (!next) return path;
      [x, y] = next;
      seen[y * w + x] = 1;
      path.push(next);
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && !seen[y * w + x] && degree(x, y) === 1) paths.push(walk(x, y));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y) && !seen[y * w + x]) paths.push(walk(x, y));
  return paths;
}

// Moving average along a path.
export function smoothPaths(paths, radius = 2) {
  return paths.map((path) => path.map((_, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(path.length - 1, i + radius); j++) { sx += path[j][0]; sy += path[j][1]; n++; }
    return [sx / n, sy / n];
  }));
}

// Evenly spaced dots along every path at least `length` px long, centred so both ends keep
// half a step; a dot closer than `gap` to an earlier one (crossings, parallel strokes) is skipped.
export function dotsAlong(paths, { spacing = 4.5, length = 16, gap = spacing * 0.65, limit = TRACE_MAX_DOTS } = {}) {
  const dots = [], cells = new Map(), key = (cx, cy) => `${cx},${cy}`;
  const near = (x, y) => {
    const cx = Math.floor(x / gap), cy = Math.floor(y / gap);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const [dx, dy] of cells.get(key(cx + i, cy + j)) || []) if (Math.hypot(dx - x, dy - y) < gap) return true;
    return false;
  };
  const measured = paths.map((path) => {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    return { path, total };
  }).filter(({ total }) => total >= length);
  // Long strokes first: they are the drawing, and a short one crossing them yields.
  measured.sort((a, b) => b.total - a.total);
  for (const { path, total } of measured) {
    const step = total / Math.max(1, Math.round(total / spacing));
    let walked = 0, want = step / 2;
    for (let i = 1; i < path.length && dots.length < limit; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i], segment = Math.hypot(bx - ax, by - ay);
      while (segment && want <= walked + segment && dots.length < limit) {
        const t = (want - walked) / segment, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        if (!near(x, y)) {
          dots.push([x, y]);
          const k = key(Math.floor(x / gap), Math.floor(y / gap));
          (cells.get(k) || cells.set(k, []).get(k)).push([x, y]);
        }
        want += step;
      }
      walked += segment;
    }
  }
  return dots;
}

// luma: Float32Array w×h, 0..1. Returns dot centres in picture pixels.
// settings.scale < 1: a draft while a slider moves — the picture comes at that fraction of
// its size (a few times faster), pixel lengths shrink with it, dots are in the draft's pixels.
export function traceDots(luma, w, h, settings = {}) {
  const s = { ...TRACE_DEFAULTS, ...settings }, detail = clamp01(s.detail / 100), scale = Number(s.scale) || 1;
  const { tone, level, ink } = traceTone(luma, w, h);
  const source = s.source === 'lines' || s.source === 'edges' ? s.source : traceSource(tone);
  const skeleton = pruneSpurs(traceSkeleton(tone, level, w, h, source, detail, s.flatten !== false, scale), w, h, Math.round(10 * scale));
  const spacing = Math.max(2, Number(s.spacing) || TRACE_DEFAULTS.spacing) * scale;
  const paths = smoothPaths(tracePaths(skeleton, w, h), Math.max(1, Math.round(2 * scale)));
  const dots = dotsAlong(paths, { spacing, length: Math.max(0, Number(s.length) || 0) * scale });
  return { dots, source, ink, limited: dots.length >= TRACE_MAX_DOTS };
}
