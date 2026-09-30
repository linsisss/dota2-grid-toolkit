// «Строки символов»: a picture typeset as whole text rows in the game font.
//
// Every row is one Dota category, so a 40-row art costs 40 categories instead of the
// thousands a glyph-per-category conversion needs. Radiance is proportional: for each row
// a dynamic program chooses the glyph sequence, with the real advances and kerning, whose
// rendering best matches the picture (the proportional-font AA formulation of Xu et al.,
// 2015). Glyphs are compared as blurred coverage maps, which tolerates the small
// misalignments any character grid has. Line mode uses XDoG (Winnemöller et al., 2012).
// Pure functions: the glyph atlas is rendered by the caller (canvas) and passed in.
import { DOTA, measureCategoryText } from './dota-rendering.mjs';

// Radiance covers ASCII and Cyrillic, and its metrics are the game's own, so a row keeps
// its shape in Dota. < > & could be read as markup; a label starting with # is a
// localization token, which typesetRows rules out.
export const ROW_GLYPH_SETS = Object.freeze({
  all: " .,:;'\"`-=+*^~/\\|()[]{}!?#%@$·•‹›0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ",
  signs: " .,:;'\"`-=+*^~/\\|()[]{}!?#%@$·•‹›",
  letters: ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
  // Dot art (stippling): dots and spaces only, in rows 4px apart, so a dot can stand almost
  // anywhere — about 120 categories for a full canvas.
  dots: ' .'
});
// How a glyph set is typeset. Dots: rows 4px apart whose band is the dot's own height
// (label rows ~10–13); the wanted ink is scaled to what dots can reach (level); the tone a row
// misses passes to the next one (diffuse, as in Floyd–Steinberg); and a fixed dot-sized noise
// (jitter) keeps flat areas from turning into a regular grid. Outlines skip the noise.
export const rowBandTop = (settings = {}) => (settings.glyphs === 'dots' ? 10 : ROW_BAND_TOP);
// scale < 1: a draft typeset at that fraction of the size (rowDraftScale, rowDraftAtlas):
// row step and blur shrink with it.
export function rowTypesetOptions(settings = {}, scale = 1) {
  const options = settings.glyphs !== 'dots'
    ? { pitch: Number(settings.pitch) || ROW_DEFAULTS.pitch }
    : settings.mode === 'lines'
      ? { pitch: 4, sigma: 1.2, mark: 0.02, diffuse: 0.5, level: 0.45 }
      : { pitch: 4, sigma: 1, mark: 0.02, diffuse: 0.85, level: 0.35, jitter: 0.6 };
  if (scale === 1) return options;
  return { ...options, pitch: Math.round(options.pitch * scale), sigma: (options.sigma ?? ROW_TYPESET.sigma) * scale, scale };
}
// A draft while a slider moves: the whole typesetting at about `want` of the size, which
// costs roughly want³ of the time (a full canvas: up to ~1 s → a few dozen ms). The scale is
// snapped so the row step stays whole pixels: rows keep their count and positions.
export function rowDraftScale(settings, want) {
  const pitch = rowTypesetOptions(settings).pitch;
  return Math.min(1, Math.max(1, Math.round(pitch * want)) / pitch);
}
// The atlas at a draft's scale. Each glyph is blurred at full size, then area-averaged with
// its pen on a whole pixel; its fixed cost stays the full-size glyph's (× scale²). Averaging
// alone lowers a thin stroke's self-energy, and the draft then filled the picture with
// busier glyphs than the final result.
export function rowDraftAtlas(glyphs, pairs, settings, scale) {
  const options = { ...ROW_TYPESET, ...rowTypesetOptions(settings) }, kern = atlasKern(glyphs, pairs);
  return {
    glyphs: glyphs.map((g) => {
      const soft = blur(g.ink, g.bw, g.bh, options.sigma);
      const ox = Math.round(g.ox * scale), bw = Math.ceil((g.bw - g.ox) * scale) + ox + 1, bh = Math.ceil(g.bh * scale), ink = new Float32Array(bw * bh);
      for (let j = 0; j < g.bh; j++) {
        const y0 = j * scale, y1 = y0 + scale, ty = Math.floor(y0), ys = Math.min(y1, ty + 1);
        for (let i = 0; i < g.bw; i++) {
          const v = soft[j * g.bw + i];
          if (!v) continue;
          const x0 = (i - g.ox) * scale + ox, x1 = x0 + scale, tx = Math.floor(x0), xs = Math.min(x1, tx + 1);
          // A source pixel covers at most 2 × 2 target pixels.
          for (const [y, hy] of [[ty, ys - y0], [ty + 1, y1 - ys]])
            for (const [x, wx] of [[tx, xs - x0], [tx + 1, x1 - xs]])
              if (hy > 0 && wx > 0 && x >= 0 && x < bw && y < bh) ink[y * bw + x] += v * wx * hy;
        }
      }
      return { ch: g.ch, adv: g.adv * scale, bw, bh, ox, ink, soft: true, constant: glyphConstant(g.ch, soft, g.bw, g.bh, options) * scale * scale };
    }),
    kern: (a, b) => kern(a, b) * scale
  };
}
export const ROW_FONT = `${DOTA.fontWeight} ${DOTA.fontSize}px StudioRadiance`;
// A player's own set: uppercase (the game shows labels uppercase), only glyphs of the game
// font, always with a space.
export function rowGlyphs(text) {
  const allowed = new Set(Array.from(ROW_GLYPH_SETS.all)), chars = new Set([' ']), skipped = new Set();
  for (const ch of Array.from(String(text).toUpperCase())) (allowed.has(ch) ? chars : /\s/u.test(ch) ? new Set() : skipped).add(ch);
  return { glyphs: [...chars].join(''), skipped: [...skipped].join('') };
}
export const ROW_DEFAULTS = Object.freeze({
  mode: 'mix', ink: 'auto', glyphs: 'signs', customGlyphs: '', fill: 85, bright: 0, contrast: 15,
  detail: 50, density: 80, pitch: 12
});
// The band of a label that a row fills: with the game's 15.15px labels the capitals span rows 2..13.
export const ROW_BAND_TOP = 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Glyph bitmaps as the game draws a label (Radiance at DOTA.fontSize), the pen at
// (ox, baseline − ROW_BAND_TOP). Advances and pair adjustments come from the calibrated
// label model in dota-rendering.mjs, so rows keep their shape in the game.
// makeCanvas(w, h) is a browser or node canvas.
// bandTop: the label row where a row's band starts (the dot of «.» sits at rows ~11–13).
export function rowAtlas(chars, makeCanvas, font = ROW_FONT, bandTop = ROW_BAND_TOP) {
  const measure = makeCanvas(8, 8).getContext('2d');
  const advance = (text) => measureCategoryText(measure, text).advances;
  const glyphs = [...new Set(Array.from(chars.toUpperCase()))].map((ch) => {
    const adv = advance(ch)[0], bw = Math.ceil(adv) + 6, bh = 18, ox = 3;
    const canvas = makeCanvas(bw, bh), ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = font; ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, ox, DOTA.fontSize * 0.857 - bandTop);
    const data = ctx.getImageData(0, 0, bw, bh).data, ink = new Float32Array(bw * bh);
    for (let i = 0; i < ink.length; i++) ink[i] = data[i * 4 + 3] / 255;
    return { ch, adv, bw, bh, ox, ink };
  });
  const pairs = new Float32Array(glyphs.length * glyphs.length);
  glyphs.forEach((a, i) => glyphs.forEach((b, j) => { pairs[i * glyphs.length + j] = advance(a.ch + b.ch)[1] - b.adv; }));
  return { glyphs, pairs, kern: atlasKern(glyphs, pairs), bandTop };
}
// Kerning lookup from the pair table, which is what crosses into the worker.
export function atlasKern(glyphs, pairs) {
  const index = new Map(glyphs.map((g, i) => [g.ch, i])), n = glyphs.length;
  return (a, b) => pairs[index.get(a) * n + index.get(b)] || 0;
}

// typesetRows' defaults: matching blur, cost of ink in the next row, of ink, of a mark.
export const ROW_TYPESET = Object.freeze({ sigma: 0.8, spill: 0.7, ink: 0.02, mark: 0.3 });
// The part of a glyph's cost that does not depend on the picture: its mark, its ink and
// self-energy, and what it spills into the next row. Ink spilling into a neighbouring row is
// only a cost: that row is matched on its own, and rewarding the overlap turned dark areas
// into walls of tall bars.
function glyphConstant(ch, soft, bw, bh, { pitch, ink, mark, spill }) {
  let constant = ch === ' ' ? 0 : mark;
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const v = soft[j * bw + i];
      if (v < 0.004) continue;
      constant += ink * v;
      constant += j >= pitch ? spill * v * v : v * v;
    }
  return constant;
}

export function blur(src, w, h, sigma) {
  if (!(sigma > 0)) return Float32Array.from(src);
  const r = Math.ceil(sigma * 2.5), kernel = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += kernel[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * kernel[i + r];
      tmp[y * w + x] = a;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * kernel[i + r];
      out[y * w + x] = a;
    }
  return out;
}

// Luminance 0..1 → how much ink each pixel wants, 0..1.
// ink: 'auto' decides from the border, which is usually background; 'dark' draws the dark
// parts of the picture with glyphs (line art on white), 'light' the light ones (photos).
// scale < 1: a draft's smaller picture, so the fixed blurs shrink with it.
export function rowTarget(luma, w, h, settings = {}, scale = 1) {
  const s = { ...ROW_DEFAULTS, ...settings };
  const sorted = Float32Array.from(luma).sort();
  const lo = sorted[Math.floor((luma.length - 1) * 0.01)], hi = sorted[Math.floor((luma.length - 1) * 0.99)];
  const bright = s.bright / 100, contrast = s.contrast / 100;
  const level = luma.map((v) => clamp01(((v - lo) / (hi - lo || 1) + bright - 0.5) * (1 + contrast * 2) + 0.5));
  let ink = s.ink;
  if (ink !== 'dark' && ink !== 'light') {
    let sum = 0;
    for (let x = 0; x < w; x++) sum += level[x] + level[(h - 1) * w + x];
    for (let y = 0; y < h; y++) sum += level[y * w] + level[y * w + w - 1];
    ink = sum / (2 * (w + h)) > 0.5 ? 'dark' : 'light';
  }
  let tone = level.map((v) => (ink === 'dark' ? 1 - v : v));
  // Local contrast: a wide unsharp mask lifts detail out of flat photos.
  const detail = s.detail / 100;
  if (detail) {
    const wide = blur(tone, w, h, Math.max(3 * scale, Math.min(w, h) / 40));
    tone = tone.map((v, i) => clamp01(v + detail * 1.5 * (v - wide[i])));
  }
  let target = tone;
  if (s.mode !== 'tone') {
    // XDoG: a soft threshold of a sharpened difference of Gaussians gives clean ink lines
    // on the dark side of every edge.
    const src = ink === 'dark' ? level : level.map((v) => 1 - v);
    const g1 = blur(src, w, h, 0.9 * scale), g2 = blur(src, w, h, 1.44 * scale);
    const lines = new Float32Array(w * h);
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x, u = 21 * g1[i] - 20 * g2[i] + 0.01;
        lines[i] = u < 0 ? clamp01(-Math.tanh(60 * u)) : 0;
      }
    target = s.mode === 'lines' ? lines : tone.map((v, i) => Math.max(v * 0.6, lines[i]));
  }
  const strength = (s.density / 100) * 0.85;
  return { target: target.map((v) => v * strength), ink };
}

// atlas.glyphs: [{ ch, adv, bw, bh, ox, ink: Float32Array(bw*bh) }] — a glyph drawn with its
// pen at (ox, baseline − band top) in a bw×bh bitmap. atlas.kern(a, b): pair adjustment.
// Returns rows of { text, x, y } in target pixels: x is the pen position of the first
// visible glyph, y the top of the row's band. scale: a draft's size (rowTypesetOptions).
export function typesetRows(target, W, H, atlas, { pitch = 12, sigma = ROW_TYPESET.sigma, spill = ROW_TYPESET.spill, ink = ROW_TYPESET.ink, mark = ROW_TYPESET.mark, quant = 4, diffuse = 0, level = 1, jitter = 0, scale = 1 } = {}) {
  // level rescales the wanted ink to what the glyph set can reach: dots cover far less than @.
  // jitter adds a fixed, dot-sized noise so flat areas stipple irregularly instead of in a grid.
  const cellSize = 4 * scale;
  const T = blur(target, W, H, sigma).map((v, i) => {
    if (!jitter || !v) return v * level;
    const cell = Math.imul(Math.floor((i % W) / cellSize), 73856093) ^ Math.imul(Math.floor(((i / W) | 0) / cellSize), 19349663);
    return clamp01(v * level * (1 + jitter * (((cell >>> 0) % 1000) / 500 - 1)));
  });
  // Identical bitmaps (Latin A and Cyrillic А) are one candidate. Glyphs that barely show
  // (the underscore at 16px) would act as free wide spaces.
  const seen = new Set();
  const glyphs = atlas.glyphs.filter((g) => {
    if (g.ch !== ' ' && g.ink.reduce((a, b) => a + b, 0) < 3 * scale * scale) return false;
    const key = `${g.adv.toFixed(3)}:${Array.from(g.ink, (v) => Math.round(v * 8)).join('')}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const space = glyphs.findIndex((g) => g.ch === ' ');
  if (space < 0) throw new Error('В наборе символов нужен пробел.');
  const bh = Math.max(...glyphs.map((g) => g.bh)), pad = Math.max(...glyphs.map((g) => g.bw)) + 2;
  const Wp = W + pad * 2, band = new Float32Array(Wp * bh);
  const prepared = glyphs.map((g) => {
    // A draft's glyphs arrive blurred, with their fixed cost (rowDraftAtlas).
    const soft = g.soft ? g.ink : blur(g.ink, g.bw, g.bh, sigma), offsets = [], weights = [];
    for (let j = 0; j < Math.min(g.bh, pitch); j++)
      for (let i = 0; i < g.bw; i++) {
        const v = soft[j * g.bw + i];
        if (v >= 0.004) { offsets.push(j * Wp + i - g.ox + pad); weights.push(-2 * v); }
      }
    const constant = g.soft ? g.constant : glyphConstant(g.ch, soft, g.bw, g.bh, { pitch, ink, mark, spill });
    return { ch: g.ch, adv: g.adv, own: Math.max(1, Math.round(g.adv)), constant, offsets: Int32Array.from(offsets), weights: Float32Array.from(weights) };
  });
  const K = prepared.length, kern = new Float32Array(K * K);
  for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) kern[a * K + b] = atlas.kern(prepared[a].ch, prepared[b].ch);
  const steps = new Int32Array(K * (K + 1));
  for (let a = 0; a <= K; a++) for (let b = 0; b < K; b++)
    steps[a * K + b] = Math.max(1, Math.round((prepared[b].adv + (a < K ? kern[a * K + b] : 0)) * quant));
  const rows = [], limit = W * quant, states = limit + 32 * quant;
  const best = new Float64Array(states), from = new Int32Array(states), used = new Int16Array(states);
  const columns = new Float64Array(W + 1), cost = prepared.map(() => new Float32Array(W + 1));
  const drawn = new Float32Array(Wp * bh), spread = new Float32Array(W);
  for (let top = 0; top < H; top += pitch) {
    band.fill(0);
    for (let j = 0; j < bh && top + j < H; j++) band.set(T.subarray((top + j) * W, (top + j + 1) * W), j * Wp + pad);
    // Pixels a glyph owns (its advance) cost t² plus the glyph's own terms; prefix sums of
    // the band's column energy make the owned part O(1).
    for (let x = 0; x < W; x++) {
      let e = 0;
      for (let j = 0; j < pitch && top + j < H; j++) { const t = band[j * Wp + x + pad]; e += t * t; }
      columns[x + 1] = columns[x] + e;
    }
    for (let gi = 0; gi < K; gi++) {
      const g = prepared[gi], out = cost[gi], { offsets, weights } = g, n = offsets.length;
      for (let x = 0; x <= W; x++) {
        let e = g.constant + columns[Math.min(W, x + g.own)] - columns[x];
        for (let k = 0; k < n; k++) e += weights[k] * band[x + offsets[k]];
        out[x] = e;
      }
    }
    best.fill(Infinity); from.fill(-1); used.fill(-1); best[0] = 0;
    for (let p = 0; p < limit; p++) {
      const here = best[p];
      if (here === Infinity) continue;
      const x = Math.min(W, Math.round(p / quant)), row = (used[p] >= 0 ? used[p] : K) * K;
      for (let gi = 0; gi < K; gi++) {
        const q = p + steps[row + gi], c = here + cost[gi][x];
        if (q < states && c < best[q]) { best[q] = c; from[q] = p; used[q] = gi; }
      }
    }
    let end = -1, score = Infinity;
    for (let p = limit; p < states; p++) if (best[p] < score) { score = best[p]; end = p; }
    const sequence = [];
    for (let p = end; p > 0; p = from[p]) sequence.push({ glyph: prepared[used[p]], x: Math.min(W, Math.round(from[p] / quant)) });
    sequence.reverse();
    if (diffuse && top + pitch < H) {
      // Error diffusion between rows, as in Floyd–Steinberg: the tone this row could not
      // reproduce passes to the next one, so the density of marks follows the picture.
      drawn.fill(0);
      for (const { glyph, x } of sequence)
        for (let k = 0; k < glyph.offsets.length; k++) drawn[x + glyph.offsets[k]] -= glyph.weights[k] / 2;
      for (let x = 0; x < W; x++) {
        let e = 0;
        for (let j = 0; j < pitch && top + j < H; j++) { const i = j * Wp + x + pad; e += band[i] - Math.min(1, drawn[i]); }
        spread[x] = e / pitch;
      }
      const smooth = blur(spread, W, 1, 2 * scale);
      for (let j = 0; j < pitch && top + pitch + j < H; j++) {
        const row = (top + pitch + j) * W;
        for (let x = 0; x < W; x++) T[row + x] = clamp01(T[row + x] + diffuse * smooth[x]);
      }
    }
    let text = sequence.map(({ glyph }) => glyph.ch).join(''), lead = 0;
    while (text[lead] === ' ') lead++;
    text = text.trimEnd().slice(lead);
    if (!text) continue;
    // A label starting with # is a localization token in Dota's UI.
    if (text[0] === '#') text = '%' + text.slice(1);
    rows.push({ text, x: lead * prepared[space].adv, y: top });
  }
  return rows;
}
