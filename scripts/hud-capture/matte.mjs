// HUD capture solver — blend space and mattes (plan pipeline[3], pipeline[4]). Dota draws the HUD over our
// backdrop; for every pixel and channel, in the blend space φ, P = b + a·X: b is what the HUD adds, a how much
// of the backdrop X shows through (a = 1 − alpha, per channel, so LCD fringes and screen-like blends stay
// exact). Over black b = φ(P_K); over white a = φ(P_W) − φ(P_K); over grey the same b and a must give
// φ(P_G) = b + a·φ(128/255) — and do so for exactly one φ: sRGB-encoded values (blending on the bytes) or
// linear light (the GPU decodes sRGB, blends, encodes).
// Layers are kept the way they were measured: the encoded value over black (k) and over white (w), bytes.
// b = φ(k), a = φ(w) − φ(k), so a layer is exact by construction. Where the white backdrop clips an additive
// glow (w = 255 while b + a > 1), a comes from grey instead: a = (φ(P_G) − b) / φ(g); if b + a then still
// fits a byte it is stored as w, otherwise in the layer's overflow list ([sample index, a]).
export const PHIS = Object.freeze(['srgb', 'linear']);
export const GREY = 128;

export const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
const LUTS = new Map(), MIDS = new Map();
// φ of each byte value.
export function phiLUT(phi) {
  if (!LUTS.has(phi)) {
    if (!PHIS.includes(phi)) throw new Error(`unknown blend space ${phi}`);
    const lut = new Float64Array(256);
    for (let v = 0; v < 256; v++) lut[v] = phi === 'srgb' ? v / 255 : srgbToLinear(v / 255);
    LUTS.set(phi, lut);
  }
  return LUTS.get(phi);
}
// The encoded value (0…255, not rounded) of a φ-space value.
export const phiInv = (phi, y) => 255 * (phi === 'srgb' ? y : linearToSrgb(Math.max(0, y)));
// The byte the game would store for a φ-space value: exact rounding through the byte midpoints.
export function phiEncoder(phi) {
  if (!MIDS.has(phi)) {
    const mids = new Float64Array(255);
    for (let k = 0; k < 255; k++) mids[k] = phi === 'srgb' ? (k + 0.5) / 255 : srgbToLinear((k + 0.5) / 255);
    MIDS.set(phi, mids);
  }
  const mids = MIDS.get(phi);
  return (y) => {
    if (!(y > mids[0])) return 0;
    if (y >= mids[254]) return 255;
    let lo = 0, hi = 254;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (y >= mids[mid]) lo = mid; else hi = mid; }
    return lo + 1;
  };
}
const isPossibleClip = (k, w) => w === 255 && k > 0;

// The matte of one region from its plates (RGB byte arrays of one size): K (and W, G) as medians of stable
// frames. tol: ±levels for the grey check. Returns the layer { k, w, over } plus per-sample sources:
// 0 = K/W, 1 = K/G (white clipped), 2 = clipped but no grey to resolve it, 3 = inconsistent (W darker than K).
export function matteFromPlates({ K, W, G = null, phi, grey = GREY, tol = 1 }) {
  if (K.length !== W.length || (G && G.length !== K.length)) throw new Error('plates of different sizes');
  const lut = phiLUT(phi), enc = phiEncoder(phi), g = lut[grey], n = K.length;
  const k = new Uint8Array(K), w = new Uint8Array(W), src = new Uint8Array(n), over = [];
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const kv = K[i], wv = W[i];
    if (wv < kv - tol) { src[i] = 3; w[i] = kv; counts[3]++; continue; }
    if (wv < kv) { w[i] = kv; continue; }
    if (isPossibleClip(kv, wv)) {
      if (!G) { src[i] = 2; counts[2]++; continue; }
      const b = lut[kv], pred = enc(b + (lut[wv] - b) * g);
      if (Math.abs(pred - G[i]) <= tol) continue;
      const a = Math.max(0, (lut[G[i]] - b) / g), top = b + a;
      src[i] = 1; counts[1]++;
      if (top <= lut[255] + 1e-12) w[i] = enc(top);
      else { w[i] = 255; over.push([i, a]); }
    }
  }
  counts[0] = n - counts[1] - counts[2] - counts[3];
  return { k, w, over, src, counts };
}
// b and a of a layer as floats (φ space), overflow applied.
export function layerBA(layer, phi) {
  const lut = phiLUT(phi), n = layer.k.length, b = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0; i < n; i++) { b[i] = lut[layer.k[i]]; a[i] = lut[layer.w[i]] - b[i]; }
  for (const [i, av] of layer.over || []) a[i] = av;
  return { b, a };
}
// A layer over a backdrop: X is an RGB byte array of the same size, or one byte value for all.
export function composeLayer(layer, X, phi, out = new Uint8Array(layer.k.length)) {
  const lut = phiLUT(phi), enc = phiEncoder(phi), n = layer.k.length, xs = typeof X === 'number' ? null : X, xc = typeof X === 'number' ? lut[X] : 0;
  const over = layer.over?.length ? new Map(layer.over) : null;
  for (let i = 0; i < n; i++) {
    const b = lut[layer.k[i]], a = over?.has(i) ? over.get(i) : lut[layer.w[i]] - b;
    out[i] = enc(b + a * (xs ? lut[xs[i]] : xc));
  }
  return out;
}
// Samples that carry HUD (anything but fully transparent).
export const isHudSample = (layer, i) => layer.k[i] !== 0 || layer.w[i] !== 255;

// Residual histogram of predicted against measured bytes over the samples in mask (a per-pixel mask or none).
export function residuals(pred, actual, { mask = null, hud = null, tol = 1 } = {}) {
  const hist = new Map();
  let n = 0, within = 0, sumAbs = 0;
  const abs = [];
  for (let i = 0; i < pred.length; i++) {
    const px = (i / 3) | 0;
    if (mask && !mask[px]) continue;
    if (hud && !hud[px]) continue;
    const d = pred[i] - actual[i], ad = d < 0 ? -d : d;
    n++; sumAbs += ad; if (ad <= tol) within++;
    hist.set(d, (hist.get(d) || 0) + 1);
    abs.push(ad);
  }
  abs.sort((x, y) => x - y);
  return { n, within, frac: n ? within / n : 1, mae: n ? sumAbs / n : 0, p99: n ? abs[Math.min(n - 1, Math.floor(n * 0.99))] : 0, max: n ? abs[n - 1] : 0,
    hist: Object.fromEntries([...hist].sort((x, y) => x[0] - y[0])) };
}

// The grey gate (pipeline[4]): the layer must reproduce every grey plate within ±tol. Samples whose a came
// from grey are excluded (they reproduce it by construction). Returns stats and a per-pixel fail mask.
export function greyGate(layer, G, { phi, grey = GREY, tol = 1, mask = null } = {}) {
  const pred = composeLayer(layer, grey, phi), n = layer.k.length, fail = new Uint8Array(n / 3), hudPx = new Uint8Array(n / 3);
  let hudN = 0, hudOk = 0, worst = 0;
  for (let p = 0; p < n / 3; p++) {
    if (mask && !mask[p]) continue;
    let hud = false, bad = false;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      if (layer.src?.[i] === 1) continue;
      if (isHudSample(layer, i)) hud = true;
      const d = Math.abs(pred[i] - G[i]);
      if (d > tol) bad = true;
      if (d > worst) worst = d;
    }
    if (!hud) continue;
    hudPx[p] = 1; hudN++;
    if (bad) fail[p] = 1; else hudOk++;
  }
  return { hudPixels: hudN, within: hudOk, frac: hudN ? hudOk / hudN : 1, worst, fail, hud: hudPx };
}

// The blend-space test (pipeline[3]) over K/W/G plate triples (HON at every lower scale). For each φ: the
// share of HUD pixels whose grey is predicted within ±tol, and the same over the discriminative samples (where
// the two spaces predict grey more than 2·tol apart). Possible clips and masked (unstable) pixels are left
// out. verdict: the φ that passes alone; 'ambiguous' if both pass and the discriminative samples cannot tell;
// 'none' if neither passes (the HUD is not drawn affinely over our backdrop — stop and report).
export function phiTest(triples, { grey = GREY, tol = 1, minFrac = 0.999, minDisc = 50 } = {}) {
  const res = Object.fromEntries(PHIS.map((phi) => [phi, { hud: 0, hudOk: 0, disc: 0, discOk: 0, hist: new Map() }]));
  const lut = Object.fromEntries(PHIS.map((phi) => [phi, phiLUT(phi)])), enc = Object.fromEntries(PHIS.map((phi) => [phi, phiEncoder(phi)]));
  for (const { K, W, G, mask = null } of triples) {
    for (let p = 0; p < K.length / 3; p++) {
      if (mask && !mask[p]) continue;
      let hud = false, skip = false;
      const pred = {};
      for (const phi of PHIS) pred[phi] = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const i = p * 3 + c, kv = K[i], wv = W[i];
        if (kv !== 0 || wv !== 255) hud = true;
        if (isPossibleClip(kv, wv) || wv < kv - tol) skip = true;
        for (const phi of PHIS) { const L = lut[phi], b = L[kv]; pred[phi][c] = enc[phi](b + (L[wv] - b) * L[grey]); }
      }
      if (!hud || skip) continue;
      let disc = false;
      for (let c = 0; c < 3; c++) if (Math.abs(pred.srgb[c] - pred.linear[c]) > 2 * tol) disc = true;
      for (const phi of PHIS) {
        const r = res[phi];
        let ok = true;
        for (let c = 0; c < 3; c++) {
          const d = pred[phi][c] - G[p * 3 + c];
          r.hist.set(d, (r.hist.get(d) || 0) + 1);
          if (Math.abs(d) > tol) ok = false;
        }
        r.hud++; if (ok) r.hudOk++;
        if (disc) { r.disc++; if (ok) r.discOk++; }
      }
    }
  }
  const out = {};
  for (const phi of PHIS) {
    const r = res[phi];
    out[phi] = { hudPixels: r.hud, within: r.hudOk, frac: r.hud ? r.hudOk / r.hud : 0, discPixels: r.disc, discWithin: r.discOk,
      discFrac: r.disc ? r.discOk / r.disc : null, pass: r.hud > 0 && r.hudOk / r.hud >= minFrac,
      hist: Object.fromEntries([...r.hist].filter(([d]) => Math.abs(d) <= 8).sort((x, y) => x[0] - y[0])) };
  }
  const passing = PHIS.filter((phi) => out[phi].pass);
  let verdict, phi = null, reason;
  if (passing.length === 1) { verdict = phi = passing[0]; reason = 'only one space reproduces grey'; }
  else if (!passing.length) { verdict = 'none'; reason = 'neither space reproduces grey: the HUD is not composited affinely over the backdrop'; }
  else {
    const [x, y] = PHIS, dx = out[x].discFrac ?? 0, dy = out[y].discFrac ?? 0, nd = out[x].discPixels;
    if (nd >= minDisc && Math.max(dx, dy) >= minFrac * 0.99 && Math.min(dx, dy) < 0.9) { verdict = phi = dx > dy ? x : y; reason = 'both pass overall; the discriminative pixels decide'; }
    else { verdict = 'ambiguous'; reason = `both spaces pass and ${nd} discriminative pixels cannot tell them apart`; }
  }
  return { verdict, phi, reason, ...out };
}

// ---- Two-frame mattes (the 2026-10-16 probe: one black and one white frame, not paused) ----
// Without a grey or a temporal group, motion shows only as W darker than K (a < 0) beyond rounding; such
// samples are flagged per pixel, then tiles with at least minNeg of them are flagged whole and grown by
// `grow` tiles, so a moving part is flagged as a region. Samples where W clipped (w = 255, k > 0: an additive
// glow or a sparkle) cannot be matted without grey; they are reported as a second kind.
export function probeMatte(K, W, { width, height, tile = 16, negTol = 2, minNeg = 3, grow = 1, minClip = 6 } = {}) {
  const n = width * height, neg = new Uint8Array(n), clip = new Uint8Array(n), hud = new Uint8Array(n);
  const k = new Uint8Array(K), w = new Uint8Array(W);
  let negN = 0, clipN = 0, hudN = 0;
  for (let p = 0; p < n; p++) {
    let isNeg = false, isClip = false, isHud = false;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c, kv = K[i], wv = W[i];
      if (kv !== 0 || wv !== 255) isHud = true;
      if (wv < kv - negTol) isNeg = true;
      if (isPossibleClip(kv, wv)) isClip = true;
      if (wv < kv) w[i] = kv;
    }
    if (isHud) { hud[p] = 1; hudN++; }
    if (isNeg) { neg[p] = 1; negN++; }
    if (isClip) { clip[p] = 1; clipN++; }
  }
  const tw = Math.ceil(width / tile), th = Math.ceil(height / tile), negT = new Uint16Array(tw * th), clipT = new Uint16Array(tw * th);
  for (let p = 0; p < n; p++) {
    const t = Math.floor(Math.floor(p / width) / tile) * tw + Math.floor((p % width) / tile);
    if (neg[p]) negT[t]++;
    if (clip[p]) clipT[t]++;
  }
  const flagTiles = (counts, min) => {
    const on = new Uint8Array(tw * th), grown = new Uint8Array(tw * th);
    for (let t = 0; t < on.length; t++) on[t] = counts[t] >= min ? 1 : 0;
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      if (!on[ty * tw + tx]) continue;
      for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x >= 0 && y >= 0 && x < tw && y < th) grown[y * tw + x] = 1;
      }
    }
    return grown;
  };
  const motionT = flagTiles(negT, minNeg), clipTiles = flagTiles(clipT, minClip);
  const regions = (tiles, counts, kind) => components(tiles, tw, th).map((c) => {
    let samples = 0;
    for (const t of c.cells) samples += counts[t];
    return { kind, rect: [c.x0 * tile, c.y0 * tile, Math.min(width, (c.x1 + 1) * tile), Math.min(height, (c.y1 + 1) * tile)], tiles: c.cells.length, pixels: samples };
  }).sort((a, b) => b.pixels - a.pixels);
  const motion = new Uint8Array(n), clipped = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const t = Math.floor(Math.floor(p / width) / tile) * tw + Math.floor((p % width) / tile);
    if (motionT[t] && hud[p]) motion[p] = 1;
    if (clipTiles[t] && clip[p] && !motion[p]) clipped[p] = 1;
  }
  return { k, w, hud, neg, clip, motion, clipped, regions: [...regions(motionT, negT, 'motion'), ...regions(clipTiles, clipT, 'clipped')],
    stats: { hudPixels: hudN, negativePixels: negN, clippedPixels: clipN, motionPixels: motion.reduce((s, v) => s + v, 0), tile } };
}
// 8-connected components of a 0/1 grid.
export function components(grid, w, h) {
  const label = new Int32Array(w * h).fill(-1), out = [];
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || label[i] >= 0) continue;
    const comp = { x0: Infinity, y0: Infinity, x1: -1, y1: -1, cells: [] }, stack = [i];
    label[i] = out.length;
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j / w) | 0;
      comp.cells.push(j);
      if (x < comp.x0) comp.x0 = x; if (y < comp.y0) comp.y0 = y; if (x > comp.x1) comp.x1 = x; if (y > comp.y1) comp.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (grid[k] && label[k] < 0) { label[k] = out.length; stack.push(k); }
      }
    }
    out.push(comp);
  }
  return out;
}
