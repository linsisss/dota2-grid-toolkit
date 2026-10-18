// HUD capture solver — from frames of one state to the plates the preview composes (2026-10-17).
// Images are full screens of RGB bytes ({ width, height, data }); rectangles [x0, y0, x1, y1), x1/y1 exclusive.
// - stackStats: per pixel, the most frequent value over frames of one state and backdrop, and its count.
//   A paused HUD repeats itself exactly; where frames disagree something moves (the portrait, the
//   level-up particles, the first ability's pulse, a timer, DayGlow) or a child panel's clock was off.
// - plateFromStacks: the plates k (over black) and w (over white). Stable samples are the measured bytes.
//   Moving samples take one reference moment: opaque ones (the K and W ranges overlap: nothing shows
//   through) keep the reference bytes over both backdrops; the others are taken as light added to the
//   still layer under them (its bytes the minimum over time), as Dota's particles are.
// - degradient: the chat's lines without the Active chat's gradient behind them (Valve's #000a band on
//   #ChatLinesPanel while the input is open), from the gradient's own share measured per column.
import { LIN, encodeExact } from './compose.mjs';

export const rectW = (r) => r[2] - r[0];
export const rectH = (r) => r[3] - r[1];

// Per pixel of rect over n frames: mode (RGB bytes), count of the mode, min and max per channel.
export function stackStats(images, rect) {
  const w = rectW(rect), h = rectH(rect), n = images.length, size = w * h;
  const mode = new Uint8Array(size * 3), count = new Uint8Array(size), min = new Uint8Array(size * 3).fill(255), max = new Uint8Array(size * 3);
  const keys = new Int32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    for (let f = 0; f < n; f++) {
      const img = images[f], i = ((rect[1] + y) * img.width + rect[0] + x) * 3, d = img.data;
      keys[f] = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      for (let c = 0; c < 3; c++) { const v = d[i + c]; if (v < min[p * 3 + c]) min[p * 3 + c] = v; if (v > max[p * 3 + c]) max[p * 3 + c] = v; }
    }
    let best = keys[0], bestN = 0;
    for (let f = 0; f < n; f++) {
      let m = 0;
      for (let g = 0; g < n; g++) if (keys[g] === keys[f]) m++;
      if (m > bestN) { bestN = m; best = keys[f]; }
    }
    mode[p * 3] = best >> 16; mode[p * 3 + 1] = (best >> 8) & 255; mode[p * 3 + 2] = best & 255; count[p] = bestN;
  }
  return { rect, w, h, n, mode, count, min, max };
}
// Stable where at least `need` frames agree (default: more than half, and all when there are two).
export const isStable = (st, p, need = st.n <= 2 ? st.n : Math.floor(st.n / 2) + 1) => st.count[p] >= need;

// Plates of one state from its K and W stacks (same rect). ref: { K, W } full images of one moment, for
// the moving samples. Returns { k, wt, moving (0/1 per pixel), opaque (0/1 for moving), counts }.
export function plateFromStacks(K, W, ref, { overlapTol = 2 } = {}) {
  if (K.w !== W.w || K.h !== W.h) throw new Error('stacks of different sizes');
  const size = K.w * K.h, k = new Uint8Array(size * 3), wt = new Uint8Array(size * 3), moving = new Uint8Array(size), opaque = new Uint8Array(size);
  const counts = { stable: 0, moving: 0, opaque: 0, added: 0, clamped: 0 };
  for (let p = 0; p < size; p++) {
    const x = p % K.w, y = (p / K.w) | 0;
    if (isStable(K, p) && isStable(W, p)) {
      counts.stable++;
      for (let c = 0; c < 3; c++) {
        const kv = K.mode[p * 3 + c], wv = W.mode[p * 3 + c];
        k[p * 3 + c] = kv; wt[p * 3 + c] = wv >= kv ? wv : kv;
        if (wv < kv) counts.clamped++;
      }
      continue;
    }
    moving[p] = 1; counts.moving++;
    const i = ((K.rect[1] + y) * ref.K.width + K.rect[0] + x) * 3;
    let overlap = true;
    for (let c = 0; c < 3; c++) if (K.max[p * 3 + c] < W.min[p * 3 + c] - overlapTol) overlap = false;
    if (overlap) {
      opaque[p] = 1; counts.opaque++;
      for (let c = 0; c < 3; c++) k[p * 3 + c] = wt[p * 3 + c] = ref.K.data[i + c];
    } else {
      counts.added++;
      for (let c = 0; c < 3; c++) {
        const b = LIN[ref.K.data[i + c]], a = Math.max(0, LIN[W.min[p * 3 + c]] - LIN[K.min[p * 3 + c]]);
        k[p * 3 + c] = ref.K.data[i + c]; wt[p * 3 + c] = encodeExact(b + a);
      }
    }
  }
  return { k, wt, moving, opaque, counts };
}

// Pixels where two plates (same size) differ by more than tol in k or w (moving pixels excluded).
export function diffMask(A, B, size, tol = 1, skip = null) {
  const m = new Uint8Array(size);
  let n = 0;
  for (let p = 0; p < size; p++) {
    if (skip && skip[p]) continue;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      if (Math.abs(A.k[i] - B.k[i]) > tol || Math.abs(A.wt[i] - B.wt[i]) > tol) { m[p] = 1; n++; break; }
    }
  }
  return { mask: m, n };
}
// Bounding box [x0, y0, x1, y1) of a mask of width w, or null.
export function maskBox(mask, w) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0; p < mask.length; p++) if (mask[p]) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}
// Grow a mask by r pixels (square).
export function dilate(mask, w, h, r) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
    }
  }
  return out;
}
// A sub-plate (rect inside the plate's own coordinates), with an optional mask of the same sub-rect.
export function cut(pl, w, r, mask = null) {
  const cw = rectW(r), ch = rectH(r), k = new Uint8Array(cw * ch * 3), wt = new Uint8Array(cw * ch * 3), m = mask ? new Uint8Array(cw * ch) : null;
  for (let y = 0; y < ch; y++) {
    const from = ((r[1] + y) * w + r[0]) * 3;
    k.set(pl.k.subarray(from, from + cw * 3), y * cw * 3); wt.set(pl.wt.subarray(from, from + cw * 3), y * cw * 3);
    if (m) for (let x = 0; x < cw; x++) m[y * cw + x] = mask[(r[1] + y) * w + r[0] + x];
  }
  return { k, wt, mask: m, w: cw, h: ch };
}
// Samples that carry HUD (not fully transparent).
export function hudBox(pl, w, h) {
  const m = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) if (pl.k[p * 3 + c] !== 0 || pl.wt[p * 3 + c] !== 255) { m[p] = 1; break; }
  return { mask: m, box: maskBox(m, w) };
}

// ---- The chat's gradient ----
// K, W: plates (bytes) of the Active chat's lines box (w × h). The gradient is black, so it adds nothing
// (k = 0 where it is alone) and lets lin(w) through; text and its black shadow only darken w further. Per
// column the gradient's transmission is the most frequent lin(w) among samples with k = 0 and lin(w) at
// least `floor` (Valve's #000a lets 1/3 through; black icon borders let nothing). Passive lines: b stays,
// a = a_active / transmission (≤ 1). Measured on the capture: the gradient is the same on every row of the
// lines box (the opacity mask is flat there).
export function gradientColumns(pl, w, h, rows = [0, h], { minShare = 0.5, floor = 0.3 } = {}) {
  const out = new Float64Array(w).fill(1), share = new Float64Array(w), good = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    const hist = new Map();
    let total = 0;
    for (let y = rows[0]; y < rows[1]; y++) {
      const i = (y * w + x) * 3;
      total++;
      if (pl.k[i] || pl.k[i + 1] || pl.k[i + 2] || LIN[pl.wt[i]] < floor) continue;
      const key = (pl.wt[i] << 16) | (pl.wt[i + 1] << 8) | pl.wt[i + 2];
      hist.set(key, (hist.get(key) || 0) + 1);
    }
    if (!hist.size) continue;
    const [key, n] = [...hist].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    share[x] = n / total;
    out[x] = (LIN[key >> 16] + LIN[(key >> 8) & 255] + LIN[key & 255]) / 3;
    good[x] = share[x] >= minShare ? 1 : 0;
  }
  // Columns crowded with text (icons, letters) take the straight line between their reliable neighbours:
  // the gradient is piecewise linear in x (Valve's stops at 0, 1, 50 and 100 %).
  for (let x = 0; x < w; x++) {
    if (good[x]) continue;
    let a = x - 1, b = x + 1;
    while (a >= 0 && !good[a]) a--;
    while (b < w && !good[b]) b++;
    if (a < 0 && b >= w) continue;
    out[x] = a < 0 ? out[b] : b >= w ? out[a] : out[a] + ((out[b] - out[a]) * (x - a)) / (b - a);
  }
  return { transmission: out, share, good };
}
// The rows of the lines box: where a column right of the text (probe) is darker than white over the
// white backdrop and adds nothing (the gradient alone).
export function gradientRows(pl, w, h, probe) {
  let y0 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const i = (y * w + probe) * 3;
    if (!pl.k[i] && !pl.k[i + 1] && !pl.k[i + 2] && pl.wt[i] < 255) { if (y0 < 0) y0 = y; y1 = y + 1; }
  }
  return y0 < 0 ? null : [y0, y1];
}
export function degradient(pl, w, h, transmission) {
  const k = new Uint8Array(pl.k), wt = new Uint8Array(pl.wt);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = transmission[x];
    if (t >= 1) continue;
    for (let c = 0; c < 3; c++) {
      const i = (y * w + x) * 3 + c, b = LIN[pl.k[i]], a = LIN[pl.wt[i]] - b;
      wt[i] = encodeExact(b + Math.min(1, Math.max(0, a / t)));
    }
  }
  return { k, wt };
}

// ---- Error measures ----
// Predicted against measured bytes over a mask (or all): max |d|, mean |d|, PSNR (dB), share within 1.
export function errorStats(pred, actual, mask = null) {
  let n = 0, sum = 0, sq = 0, max = 0, within1 = 0;
  for (let p = 0; p < pred.length / 3; p++) {
    if (mask && !mask[p]) continue;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(pred[p * 3 + c] - actual[p * 3 + c]);
      n++; sum += d; sq += d * d; if (d > max) max = d; if (d <= 1) within1++;
    }
  }
  const mse = n ? sq / n : 0;
  return { samples: n, max, mae: n ? +(sum / n).toFixed(4) : 0, psnr: mse ? +(10 * Math.log10((255 * 255) / mse)).toFixed(2) : Infinity, within1: n ? +(within1 / n).toFixed(6) : 1 };
}
