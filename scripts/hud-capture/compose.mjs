// HUD capture — compose (2026-10-17): the builder's HUD preview as exact arithmetic on layers Dota drew
// itself. Shared by the browser (src/customize/HudCanvas.jsx) and the solver's validation
// (scripts/hud-capture-solve.mjs), so what is validated is what the page runs.
// Measured on the owner's capture (docs/hud-capture/README.md):
// - Dota blends the HUD in linear light (sRGB-encoded screen): over the lower HUD's grey backdrop the
//   linear model reproduces 99.98 % of HUD samples within one level, the byte model 81 %.
// - A layer is two plates of bytes: k, the layer over black, and w, the layer over white. In linear light
//   b = lin(k) is what the layer adds and a = lin(w) − lin(k) how much of what is under it shows, per
//   channel; over anything X the screen is enc(b + a·X).
// - Panel opacity o is a group opacity: the lower HUD with the backdrops at opacity o is the per-sample
//   blend of the backdrops-off state C and the backdrops-on state F: b = bC + o·(bF − bC), a = aC − o·(aC − aF).
// - wash-color #rrggbbαα multiplies the panel's colour (not its alpha) in linear light by 1 − s + s·lin(rgb),
//   s = αα / 255 (fitted on a copy of #center_bg under nine washes and opacities, each within one level).
//   A multiply commutes with blending, so on the composite it scales bF − bC.
export const SCREEN = Object.freeze({ width: 1920, height: 1080 });

export const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
// lin() of every byte.
export const LIN = (() => { const t = new Float32Array(256); for (let v = 0; v < 256; v++) t[v] = srgbToLinear(v / 255); return t; })();
// Byte midpoints in linear light: enc(y) = the byte the game stores for y (exact rounding).
const MIDS = (() => { const t = new Float64Array(255); for (let k = 0; k < 255; k++) t[k] = srgbToLinear((k + 0.5) / 255); return t; })();
export function encodeExact(y) {
  if (!(y > MIDS[0])) return 0;
  if (y >= MIDS[254]) return 255;
  let lo = 0, hi = 254;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (y >= MIDS[mid]) lo = mid; else hi = mid; }
  return lo + 1;
}
// A fast encoder for the browser: a table over [0, 1] in 1/65536 steps, fixed up at the byte midpoints so
// it agrees with encodeExact everywhere except within 1/65536 of a midpoint.
export const ENC = (() => {
  const n = 65537, t = new Uint8Array(n);
  for (let i = 0; i < n; i++) t[i] = encodeExact(i / 65536);
  return t;
})();
export const encodeFast = (y) => (y <= 0 ? 0 : y >= 1 ? 255 : ENC[(y * 65536 + 0.5) | 0]);

// The colour multiplier of a wash: tint '#rrggbb', strength 0–100 (the builder's slider; hud-style.mjs
// writes αα = round(strength · 2.55)). [r, g, b] factors in linear light.
export function washFactors(tint, strength) {
  const s = Math.round((Math.max(0, Math.min(100, strength)) / 100) * 255) / 255;
  if (!s || !/^#[0-9a-f]{6}$/i.test(tint || '')) return [1, 1, 1];
  return [1, 3, 5].map((i) => 1 - s + s * LIN[parseInt(tint.slice(i, i + 2), 16)]);
}

// ---- Plates ----
// A plate: { x, y, w, h, k, wt, mask? } — k and wt are RGB bytes (w·h·3) of the layer over black and
// over white, at screen position (x, y); mask (w·h, 0/1) limits a patch to its own pixels.
export function plate(x, y, w, h, k, wt, mask = null) { return { x, y, w, h, k, wt, mask }; }
const copyPlate = (p) => ({ ...p, k: new Uint8Array(p.k), wt: new Uint8Array(p.wt), mask: null });
// Paste a patch into a plate (both in screen coordinates; masked-out patch pixels are skipped).
export function pastePatch(into, patch) {
  for (let py = 0; py < patch.h; py++) {
    const y = patch.y + py - into.y;
    if (y < 0 || y >= into.h) continue;
    for (let px = 0; px < patch.w; px++) {
      const x = patch.x + px - into.x;
      if (x < 0 || x >= into.w || (patch.mask && !patch.mask[py * patch.w + px])) continue;
      const s = (py * patch.w + px) * 3, d = (y * into.w + x) * 3;
      into.k[d] = patch.k[s]; into.k[d + 1] = patch.k[s + 1]; into.k[d + 2] = patch.k[s + 2];
      into.wt[d] = patch.wt[s]; into.wt[d + 1] = patch.wt[s + 1]; into.wt[d + 2] = patch.wt[s + 2];
    }
  }
  return into;
}

// ---- Plates from hud.json and its decoded atlases (RGBA: { width, height, data }) ----
// A record: { rect: [x, y, w, h] on screen, k: [x, y] and w: [x, y] in the atlas, mask? (the atlas alpha) }.
export function atlasPlate(img, { rect: [x, y, w, h], k: [kx, ky], w: [wx, wy], mask }) {
  const k = new Uint8Array(w * h * 3), wt = new Uint8Array(w * h * 3), m = mask ? new Uint8Array(w * h) : null;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const p = yy * w + xx, a = ((ky + yy) * img.width + kx + xx) * 4, b = ((wy + yy) * img.width + wx + xx) * 4;
    k[p * 3] = img.data[a]; k[p * 3 + 1] = img.data[a + 1]; k[p * 3 + 2] = img.data[a + 2];
    wt[p * 3] = img.data[b]; wt[p * 3 + 1] = img.data[b + 1]; wt[p * 3 + 2] = img.data[b + 2];
    if (m) m[p] = img.data[a + 3] ? 1 : 0;
  }
  return { x, y, w, h, k, wt, mask: m };
}
export const lowerFromAtlas = (img, rec) => ({ base: atlasPlate(img, rec.base), cbg: atlasPlate(img, rec.cbg),
  decor: Object.fromEntries(Object.entries(rec.decor || {}).map(([key, d]) => [key, { C: atlasPlate(img, d.C), F: atlasPlate(img, d.F) }])) });
export const commonFromAtlas = (img, manifest) => ({ rest: manifest.rest.map((r) => atlasPlate(img, r)),
  chat: { plate: atlasPlate(img, manifest.chat.plate), anchor: manifest.chat.anchor, wrap: manifest.chat.wrap } });

// ---- The lower HUD of one scale ----
// lowerSet: { base: plate C (backdrops off, decorations off), cbg: plate F inside the backdrop's box
// (backdrops on, decorations off), decor: { flares: { C, F }, insets: { C, F } } } (patches).
// Returns { C, F }: full plates for the decorations shown (flares, shadows).
export function buildLower(lowerSet, { flares = true, shadows = true } = {}) {
  const C = copyPlate(lowerSet.base), F = copyPlate(lowerSet.base);
  pastePatch(F, lowerSet.cbg);
  const on = { flares, insets: shadows };
  for (const [key, d] of Object.entries(lowerSet.decor || {})) {
    if (!on[key]) continue;
    pastePatch(C, d.C);
    pastePatch(F, d.F);
  }
  return { C, F };
}

// ---- Compose ----
// layers: [{ kind: 'plain', plate } | { kind: 'lower', C, F, opacity, wash: [r, g, b] }] bottom to top over
// world (RGB bytes of the whole screen, or a number: one byte value everywhere, or { rgb: [r, g, b] }).
// Only the layers' rectangles are computed; the rest of the screen is the world. out: RGB bytes of the
// screen (allocated if missing); scratch: reused buffers ({} kept by the caller). exact: encodeExact
// (validation) or the table (the page).
export function composeScreen(world, layers, { width = SCREEN.width, height = SCREEN.height, out = null, exact = false, scratch = {} } = {}) {
  const n = width * height, res = out || new Uint8Array(n * 3), enc = exact ? encodeExact : encodeFast;
  if (typeof world === 'number') res.fill(world);
  else if (world?.rgb) for (let i = 0; i < n * 3; i += 3) { res[i] = world.rgb[0]; res[i + 1] = world.rgb[1]; res[i + 2] = world.rgb[2]; }
  else res.set(world);
  if (!scratch.acc || scratch.acc.length !== n * 3) { scratch.acc = new Float32Array(n * 3); scratch.stamp = new Uint32Array(n); scratch.gen = 0; }
  const acc = scratch.acc, stamp = scratch.stamp, gen = ++scratch.gen;
  const rects = layers.map((l) => { const p = l.kind === 'lower' ? l.C : l.plate; return [Math.max(0, p.x), Math.max(0, p.y), Math.min(width, p.x + p.w), Math.min(height, p.y + p.h)]; });
  // Linear light of the world under every layer.
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0, p = y * width + x0; x < x1; x++, p++) {
    if (stamp[p] === gen) continue;
    stamp[p] = gen;
    const i = p * 3;
    acc[i] = LIN[res[i]]; acc[i + 1] = LIN[res[i + 1]]; acc[i + 2] = LIN[res[i + 2]];
  }
  for (const layer of layers) {
    if (layer.kind === 'lower') applyLower(acc, layer, width, height);
    else applyPlate(acc, layer.plate, width, height);
  }
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0, i = (y * width + x0) * 3; x < x1; x++, i += 3) {
    res[i] = enc(acc[i]); res[i + 1] = enc(acc[i + 1]); res[i + 2] = enc(acc[i + 2]);
  }
  return res;
}
function applyPlate(acc, p, width, height) {
  for (let py = 0; py < p.h; py++) {
    const y = p.y + py;
    if (y < 0 || y >= height) continue;
    for (let px = 0; px < p.w; px++) {
      const x = p.x + px;
      if (x < 0 || x >= width || (p.mask && !p.mask[py * p.w + px])) continue;
      const s = (py * p.w + px) * 3, d = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) { const b = LIN[p.k[s + c]]; acc[d + c] = b + (LIN[p.wt[s + c]] - b) * acc[d + c]; }
    }
  }
}
function applyLower(acc, { C, F, opacity = 1, wash = [1, 1, 1] }, width, height) {
  const o = Math.max(0, Math.min(1, opacity));
  for (let py = 0; py < C.h; py++) {
    const y = C.y + py;
    if (y < 0 || y >= height) continue;
    for (let px = 0; px < C.w; px++) {
      const x = C.x + px;
      if (x < 0 || x >= width) continue;
      const s = (py * C.w + px) * 3, d = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const bC = LIN[C.k[s + c]], aC = LIN[C.wt[s + c]] - bC, bF = LIN[F.k[s + c]], aF = LIN[F.wt[s + c]] - bF;
        acc[d + c] = bC + o * wash[c] * (bF - bC) + (aC - o * (aC - aF)) * acc[d + c];
      }
    }
  }
}

// ---- Settings → layers ----
// The chat's lines are drawn where #HudChat puts them: production's hudRules move #HudChat (align, y,
// width; margin 24 px at the sides). The capture parked it at left 40 px, bottom 1080 − 437.
export function hudChatBox({ align = 'center', x: gap = 24, y = 220, width = 800 } = {}) {
  const x = align === 'left' ? gap : align === 'right' ? SCREEN.width - gap - width : Math.round((SCREEN.width - width) / 2);
  return { x, bottom: SCREEN.height - y, width };
}
// The chat's lines as plates for a #HudChat box. chat = { plate, anchor: { x, bottom }, wrap: { rows: [y0, y1),
// gaps: [[x0, x1), …], start, pitch, padding } }: the captured lines (parked at anchor) move with the box.
// Valve's lines are 750 px wide and squish into a narrower box (minus 14 px of padding); then the longest
// captured line (the bottom one) wraps at its last word gap that fits, its rest goes on a new row at the
// line start and the rows above move up one pitch. The wrap point is our estimate (no capture at those
// widths): docs/hud-capture/README.md.
export function chatPlates(chat, settings) {
  const box = hudChatBox(settings), { plate: p, anchor, wrap } = chat;
  const dx = box.x - anchor.x, dy = box.bottom - anchor.bottom;
  const limit = anchor.x + box.width - (wrap?.padding ?? 14);
  if (!wrap || p.x + p.w <= limit) return [{ ...p, x: p.x + dx, y: p.y + dy }];
  const gap = [...wrap.gaps].reverse().find(([g0]) => g0 <= limit);
  if (!gap) return [{ ...p, x: p.x + dx, y: p.y + dy }];
  const sub = (x0, y0, x1, y1) => {
    const w = x1 - x0, h = y1 - y0, k = new Uint8Array(w * h * 3), wt = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      const from = ((y0 - p.y + y) * p.w + (x0 - p.x)) * 3;
      k.set(p.k.subarray(from, from + w * 3), y * w * 3); wt.set(p.wt.subarray(from, from + w * 3), y * w * 3);
    }
    return { x: x0, y: y0, w, h, k, wt, mask: null };
  };
  const [r0, r1] = wrap.rows, right = p.x + p.w;
  const above = sub(p.x, p.y, right, r0), first = sub(p.x, r0, gap[0], r1), rest = sub(gap[1], r0, right, r1);
  return [{ ...above, x: above.x + dx, y: above.y + dy - wrap.pitch }, { ...first, x: first.x + dx, y: first.y + dy - wrap.pitch },
    { ...rest, x: wrap.start + dx, y: rest.y + dy }];
}
// The layers of a hudSettings() value from loaded assets:
// assets = { lower: { [scale]: lowerSet }, top: { [scale]: plate }, chat: { plate, anchor, wrap }, rest: [plates] }.
// cache: a Map kept by the caller (the lower HUD's plates per scale and decorations are built once).
export function hudLayers(settings, assets, { chat = false, cache = null } = {}) {
  const layers = [];
  const top = assets.top?.[settings.top];
  if (top) layers.push({ kind: 'plain', plate: top });
  if (chat && assets.chat) for (const plate of chatPlates(assets.chat, settings.chat)) layers.push({ kind: 'plain', plate });
  for (const p of assets.rest || []) layers.push({ kind: 'plain', plate: p });
  const set = assets.lower?.[settings.lower];
  if (set) {
    const flares = !settings.hide.includes('flares'), shadows = !settings.hide.includes('shadows'), key = `${settings.lower}|${flares}|${shadows}`;
    let built = cache?.get(key);
    if (!built) { built = buildLower(set, { flares, shadows }); cache?.set(key, built); }
    const { C, F } = built;
    layers.push({ kind: 'lower', C, F, opacity: settings.opacity / 100, wash: washFactors(settings.tint, settings.tintStrength) });
  }
  return layers;
}
