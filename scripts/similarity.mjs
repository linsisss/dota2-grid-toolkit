// Near copies for the moderators (asked for on 2026-10-02): a grid or a menu background that looks like
// one already in the workshop is shown to them as «похожа» with the original beside it. Exact copies
// are refused earlier by their hash (server/catalog-store.mjs duplicate, catalog-backgrounds.mjs).
//
// Grids: each category is one token — its name, its box (10 px steps) and its heroes — and two grids
// are as similar as the share of tokens they have in common (Jaccard), estimated from MinHash signatures
// of GRID_HASHES numbers. A signature is made twice: with the boxes as they are, and moved so the grid
// starts at its top left corner (a copy moved as a whole); the closer of the two pairs counts (one stray
// category in a corner moves the second kind, so the first is kept). Measured on the staging copy of
// the workshop (89 versions, 2026-10-02): different grids, ASCII arts too, stay under 0.21; versions of
// one grid and a re-upload under another name reach 0.42–0.89.
// Backgrounds (remade on 2026-10-03: the first version, 9 × 8 difference hashes compared any frame to
// any frame, called 62 of 69 pairs of the workshop's 189 backgrounds «похожи» that were not): a frame a
// second (≤ BACKGROUND_FRAMES), 64 × 36 grey. Frames are compared by the correlation of 24 × 14 maps of
// their light AND of their detail (the map minus its blur — two skies over two fields share the light,
// not the detail), for the frame as it is, mirrored, cropped (centre, corners, a closer centre) or —
// near a crop — at a crop found by small steps; colourful frames must also share their hues (a dark or
// grey frame's colour is not compared, a grey copy of a colourful frame needs more detail). Two
// backgrounds are as similar as the share of the shorter one's frames that match in the best alignment
// in time with ONE transform. Measured on the workshop's 189 backgrounds (2026-10-03): its 9 near
// copies (re-uploads, a darker one, a zoomed one) score 1, every other pair ≤ 0.3; copies made with a
// darker veil and blur, a trimmed start, a 15–30 % zoom, a shifted crop, a mirror, no colour or a low
// bitrate score 0.8–1.
export const GRID_HASHES = 128;
export const GRID_SIMILAR = 0.35;
export const BACKGROUND_SIMILAR = 0.5;
export const BACKGROUND_FRAMES = 30;
export const FRAME_W = 64, FRAME_H = 36;

const normal = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const step = (value) => Math.round((Number(value) || 0) / 10);
// The tokens of a hero_grid_config grid (its first config), a repeated one counted as many times;
// `moved`: the boxes from the grid's top left corner.
export function gridTokens(grid, moved = false) {
  const categories = grid?.configs?.[0]?.categories || [];
  let left = 0, top = 0;
  if (moved && categories.length) {
    left = Infinity; top = Infinity;
    for (const category of categories) { left = Math.min(left, Number(category.x_position) || 0); top = Math.min(top, Number(category.y_position) || 0); }
  }
  const counts = new Map(), tokens = [];
  for (const category of categories) {
    const box = [category.x_position - left, category.y_position - top, category.width, category.height].map(step).join(',');
    const heroes = [...(category.hero_ids || [])].sort((a, b) => a - b).join('.');
    const token = `${normal(category.category_name)}|${box}|${heroes}`, n = counts.get(token) || 0;
    counts.set(token, n + 1);
    tokens.push(`${token}#${n}`);
  }
  return tokens;
}
// 32-bit FNV-1a of a string, then MurmurHash3's finaliser per seed: GRID_HASHES independent hashes.
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const SEEDS = Array.from({ length: GRID_HASHES }, (_, i) => mix(0x9e3779b9 * (i + 1)));
function minhash(tokens) {
  const mins = new Uint32Array(GRID_HASHES).fill(0xffffffff);
  for (const token of tokens) {
    const base = fnv(token);
    for (let i = 0; i < GRID_HASHES; i++) { const h = mix(base ^ SEEDS[i]); if (h < mins[i]) mins[i] = h; }
  }
  return Array.from(mins, (n) => n.toString(16).padStart(8, '0')).join('');
}
// The grid's signature: the MinHash of its boxes as they are, then of the moved ones, as hex
// (8 characters a number, GRID_HASHES numbers each); '' for an empty grid.
export function gridSignature(grid) {
  const tokens = gridTokens(grid);
  return tokens.length ? minhash(tokens) + minhash(gridTokens(grid, true)) : '';
}
const share = (a, b) => {
  let same = 0;
  for (let i = 0; i < a.length; i += 8) if (a.slice(i, i + 8) === b.slice(i, i + 8)) same++;
  return same / (a.length / 8);
};
// The estimated Jaccard similarity of two grids' signatures, 0…1: as they are, or both moved.
export function gridSimilarity(a, b) {
  const half = GRID_HASHES * 8;
  if (!a || !b || a.length !== half * 2 || b.length !== half * 2) return 0;
  return Math.max(share(a.slice(0, half), b.slice(0, half)), share(a.slice(half), b.slice(half)));
}

// ——— Backgrounds.
const MW = 24, MH = 14, NCC = 0.8, DETAIL = 0.45, GREY_NCC = 0.1, GREY_DETAIL = 0.3, HUES = 0.45, COLOURFUL = 0.25, LIT = 40;
// A still picture found in a video: a closer match is asked for (one frame is all the evidence there is).
const STRONG_NCC = 0.08, STRONG_DETAIL = 0.15;
// The transforms of a frame compared with the other's whole frame: [left, top, size, mirrored] in parts
// of the frame; 0 is the frame as it is.
const TRANSFORMS = [[0, 0, 1, 0], [0, 0, 1, 1], [0.1, 0.1, 0.8, 0], [0, 0, 0.8, 0], [0.2, 0, 0.8, 0], [0, 0.2, 0.8, 0], [0.2, 0.2, 0.8, 0], [0.18, 0.18, 0.64, 0]];

// One frame (`rgb`: FRAME_W × FRAME_H × 3 bytes) → what is stored: its grey pixels stretched to 0…255
// (the comparison does not care about brightness and contrast, and a very dark frame keeps its detail
// through the rounding), the share of colourful light, the hue histogram (12 bins), the mean light,
// whether it has anything to compare.
export function backgroundFrame(rgb) {
  const n = FRAME_W * FRAME_H, light = new Float64Array(n), gray = new Uint8Array(n), hist = new Float64Array(13);
  let sum = 0, dark = 0, low = 255, high = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b; light[i] = y; sum += y; if (y < 20) dark++;
    if (y < low) low = y; if (y > high) high = y;
    const max = Math.max(r, g, b), c = max - Math.min(r, g, b), weight = Math.max(max, 1);
    if (c < 0.15 * max + 6) { hist[12] += weight; continue; }
    let h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
    if (h < 0) h += 6;
    hist[Math.floor(h * 2) % 12] += weight;
  }
  const mean = sum / n, stretch = 255 / Math.max(high - low, 1);
  let variance = 0; for (let i = 0; i < n; i++) { variance += (light[i] - mean) ** 2; gray[i] = Math.round((light[i] - low) * stretch); }
  let total = 0, colour = 0; for (let i = 0; i < 13; i++) { total += hist[i]; if (i < 12) colour += hist[i]; }
  return { gray, chroma: Math.round((colour / (total || 1)) * 1000) / 1000, hue: Array.from(hist.subarray(0, 12), (v) => Math.round((v / (colour || 1)) * 1000) / 1000),
    mean: Math.round(mean), informative: Math.sqrt(variance / n) >= 6 && dark / n < 0.97 };
}
// The frames of a video → a fingerprint: the distinct frames (a still picture is one) and the order in
// which they come.
export function backgroundFingerprint(frames) {
  const distinct = [], order = [];
  for (const frame of frames) {
    let same = distinct.findIndex((other) => {
      if (Math.abs(other.mean - frame.mean) > 2 || other.informative !== frame.informative) return false;
      let d = 0; for (let i = 0; i < other.gray.length; i++) d += Math.abs(other.gray[i] - frame.gray[i]);
      return d / other.gray.length <= 1.5;
    });
    if (same < 0) { same = distinct.length; distinct.push(frame); }
    order.push(same);
  }
  return { frames: distinct, order };
}

// A MW × MH map of a part of a grey frame (bilinear, 2 × 2 samples a cell), zero mean, unit length.
function lightMap(gray, [left, top, size, mirrored]) {
  const out = new Float32Array(MW * MH), x0 = left * FRAME_W, y0 = top * FRAME_H, w = size * FRAME_W, h = size * FRAME_H;
  const at = (x, y) => {
    x = Math.min(FRAME_W - 1.001, Math.max(0, x)); y = Math.min(FRAME_H - 1.001, Math.max(0, y));
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, row = yi * FRAME_W;
    return (gray[row + xi] * (1 - fx) + gray[row + xi + 1] * fx) * (1 - fy) + (gray[row + FRAME_W + xi] * (1 - fx) + gray[row + FRAME_W + xi + 1] * fx) * fy;
  };
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) {
    let s = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const u = (cx + (sx + 0.5) / 2) / MW, v = (cy + (sy + 0.5) / 2) / MH;
      s += at(x0 + (mirrored ? 1 - u : u) * w - 0.5, y0 + v * h - 0.5);
    }
    out[cy * MW + cx] = s / 4;
  }
  return unit(out, true);
}
function unit(map, centre) {
  if (centre) { let m = 0; for (const v of map) m += v; m /= map.length; for (let i = 0; i < map.length; i++) map[i] -= m; }
  let n = 0; for (const v of map) n += v * v;
  n = Math.sqrt(n) || 1; for (let i = 0; i < map.length; i++) map[i] /= n;
  return map;
}
// The map's detail: the map minus its 3 × 3 blur.
function detailMap(map) {
  const out = new Float32Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let s = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < MW && yy < MH) { s += map[yy * MW + xx]; k++; }
    }
    out[y * MW + x] = map[y * MW + x] - s / k;
  }
  return unit(out, false);
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
// A fingerprint ready to compare: each distinct frame with its maps for every transform.
export function prepareBackground(fingerprint) {
  if (!fingerprint?.frames?.length) return null;
  return { order: fingerprint.order, frames: fingerprint.frames.map((frame) => {
    const maps = TRANSFORMS.map((t) => lightMap(frame.gray, t));
    return { ...frame, maps, details: maps.map(detailMap), lit: frame.mean >= LIT };
  }) };
}
// The transforms under which frame a matches frame b (indexes; +100: a's crop against b's whole frame,
// 200/300: a crop found by steps), or null.
function frameMatch(a, b, strong = false) {
  if (!a.informative || !b.informative) return null;
  const known = a.lit && b.lit, colourA = a.chroma >= COLOURFUL, colourB = b.chroma >= COLOURFUL;
  let light = NCC + (strong ? STRONG_NCC : 0), detail = DETAIL + (strong ? STRONG_DETAIL : 0);
  if (known && colourA && colourB) {
    let shared = 0; for (let i = 0; i < 12; i++) shared += Math.min(a.hue[i], b.hue[i]);
    if (shared < HUES) return null;
  } else if (known && colourA !== colourB) { light += GREY_NCC; detail += GREY_DETAIL; }
  const found = [];
  for (let t = 0; t < TRANSFORMS.length; t++) {
    if (dot(a.maps[0], b.maps[t]) >= light && dot(a.details[0], b.details[t]) >= detail) found.push(t);
    else if (t >= 2 && dot(a.maps[t], b.maps[0]) >= light && dot(a.details[t], b.details[0]) >= detail) found.push(t + 100);
  }
  if (!found.length) {
    // A crop between the listed ones: from the closest listed crop, small steps of position and size.
    for (const [from, to, mark] of [[a, b, 200], [b, a, 300]]) {
      let best = -1, start = 0;
      for (let t = 2; t < TRANSFORMS.length; t++) { const v = dot(from.maps[t], to.maps[0]); if (v > best) { best = v; start = t; } }
      if (best < light - 0.12) continue;
      let [x, y, size] = TRANSFORMS[start], current = best;
      for (let step = 0.04; step >= 0.01; step /= 2) {
        for (let moved = true; moved;) {
          moved = false;
          for (const [dx, dy, ds] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step], [0, 0, -step]]) {
            const nx = x + dx, ny = y + dy, ns = size + ds;
            if (ns < 0.6 || ns > 1 || nx < 0 || ny < 0 || nx + ns > 1.001 || ny + ns > 1.001) continue;
            const v = dot(lightMap(from.gray, [nx, ny, ns, 0]), to.maps[0]);
            if (v > current + 1e-4) { current = v; x = nx; y = ny; size = ns; moved = true; }
          }
        }
      }
      if (current >= light && dot(detailMap(lightMap(from.gray, [x, y, size, 0])), to.details[0]) >= detail) { found.push(mark); break; }
    }
  }
  return found.length ? found : null;
}
// Two prepared backgrounds → 0…1: the share of the shorter one's informative frames that match a frame
// of the other at the same moment (± a second) after the best shift in time, with one transform; each
// frame of the other counts once (a still video would otherwise match one frame three times), and the
// closer of the two directions counts — or, for a still picture, whether it is found in the other.
export function backgroundSimilarity(A, B) {
  if (!A || !B) return 0;
  const informative = (p) => p.order.filter((k) => p.frames[k].informative).length;
  const ia = informative(A), ib = informative(B);
  if (!ia || !ib) return 0;
  const matches = A.frames.map((a) => B.frames.map((b) => frameMatch(a, b)));
  const run = (rows, cols, at) => {
    let best = 0;
    for (let shift = -(rows.length - 1); shift < cols.length; shift++) {
      const counts = new Map(), used = new Map();
      for (let i = 0; i < rows.length; i++) {
        for (const j of [i + shift, i + shift - 1, i + shift + 1]) {
          if (j < 0 || j >= cols.length) continue;
          for (const way of at(i, j) || []) {
            const taken = used.get(way) || new Set(), done = used.get(`${way}:${i}`);
            if (done || taken.has(j)) continue;
            taken.add(j); used.set(way, taken); used.set(`${way}:${i}`, true);
            counts.set(way, (counts.get(way) || 0) + 1);
          }
        }
      }
      for (const count of counts.values()) if (count > best) best = count;
    }
    return best;
  };
  // Mirror indexes for the other direction: a's crop of b is b's crop of a (100 ↔ +0, 200 ↔ 300).
  const flip = (way) => (way >= 300 ? 200 : way >= 200 ? 300 : way >= 100 ? way - 100 : way >= 2 ? way + 100 : way);
  const forward = run(A.order, B.order, (i, j) => matches[A.order[i]][B.order[j]]);
  const backward = run(B.order, A.order, (i, j) => (matches[A.order[j]][B.order[i]] || []).map(flip));
  return Math.min(1, Math.max(forward / Math.min(ia, ib), backward / Math.min(ia, ib), still(A, B), still(B, A)));
}
// A still picture (one or two distinct frames with something to compare) that is a frame of the other
// background — the same picture, or a video that fades into it: the share of its frames found there.
function still(P, Q) {
  const own = P.frames.filter((f) => f.informative);
  if (!own.length || own.length > 2) return 0;
  return own.filter((f) => Q.frames.some((g) => frameMatch(f, g, true))).length / own.length;
}
