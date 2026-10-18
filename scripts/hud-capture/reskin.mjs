// HUD capture — a d2pfx HUD skin or HUD part over the captured plates (2026-10-17). Shared by the page
// (src/customize/HudCanvas.jsx), the thumbnails and the check (scripts/make-d2pfx-hud-thumbs.mjs,
// scripts/check-d2pfx-hud.mjs).
// scripts/make-d2pfx-hud.mjs renders Dota's HUD in the Panorama emulator with Valve's files (E_valve) and with
// a mod's (E_mod) at every captured scale, over black and over white. A layer here: { rect: [x, y, w, h] on
// screen, rgba } — RGB the layer over black (k), A = 255 − (over white − over black); a mod's layer has A 0 where
// the mod changes nothing. Chromium blends in sRGB, Dota in linear light: a pixel's opacity α = A / 255 and colour
// c = k / α are read back and blended as Dota does, b = α·lin(c), a = 1 − α (layerAt).
// The captured plate gets the mod's difference in linear light, per channel (compose.mjs: b = lin(k),
// a = lin(w) − lin(k)): b' = b + (b_mod − b_valve), a' = a + (a_mod − a_valve). Where the mod changes nothing
// the plate stays Dota's own bytes — the portrait, the icons, the numbers; where E_valve is Dota (the check
// measures how close), b' and a' are the mod as Dota would draw it. Where E_valve is visibly not Dota (6–24
// levels off: a text rastered elsewhere, an icon drawn differently, content a mod moves away), the pixel goes
// over to E_mod itself, so the two never show at once.
import { LIN, encodeFast } from './compose.mjs';

const smooth = (lo, hi, v) => { const x = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); return x * x * (3 - 2 * x); };
// A stored pixel as Dota blends it: { b: [r, g, b] premultiplied in linear light, a: what shows through }.
export function layerAt(rgba, l) {
  const alpha = rgba[l + 3] / 255;
  if (alpha <= 0.002) return { b: [0, 0, 0], a: 1 };
  return { b: [0, 1, 2].map((c) => alpha * LIN[Math.min(255, Math.round(rgba[l + c] / alpha))]), a: 1 - alpha };
}
const copy = (p) => ({ ...p, k: new Uint8Array(p.k), wt: new Uint8Array(p.wt) });

// plate: { x, y, w, h, k, wt, mask? }; V, S: Valve's and the mod's layer over the same rect. skip(x, y): leave
// a pixel as it is (a decoration the settings hide). → a new plate.
// replace: the mod moves panels — its render is taken wherever it changes something inside these screen boxes
// ([[x, y, w, h]…], true for everywhere, 'all' for the mod's whole render over the rect — a mod that moves
// everything, Smaller Hud): no captured content stays where the mod's layout no longer has it.
// text: a mask layer over the same rect (A 255 where the emulator writes Valve's text): there the emulator's own
// raster is never taken over the captured glyphs — only the difference is added (a recoloured text still shows).
// only: a HUD part's own boxes — its difference applies there alone (its stale copy of a whole stylesheet must not
// undo a skin's colours elsewhere).
export function applyDelta(plate, V, S, { enc = encodeFast, skip = null, replace = false, text = null, only = false } = {}) {
  const out = copy(plate), [rx, ry, rw, rh] = S.rect, plan = text ? textPlan(text, S, V) : null;
  const inBoxes = Array.isArray(replace) ? (x, y) => replace.some(([bx, by, bw, bh]) => x >= bx && y >= by && x < bx + bw && y < by + bh) : () => !!replace;
  for (let y = Math.max(ry, plate.y); y < Math.min(ry + rh, plate.y + plate.h); y++) {
    for (let x = Math.max(rx, plate.x); x < Math.min(rx + rw, plate.x + plate.w); x++) {
      const l = ((y - ry) * rw + (x - rx)) * 4;
      if ((!S.rgba[l + 3] && !(plan && plan[l >> 2] === 2) && replace !== 'all') || (skip && skip(x, y)) || (only && !inBoxes(x, y))) continue;
      const i = ((y - plate.y) * plate.w + (x - plate.x)) * 3;
      // Where E_valve is not what Dota drew here (another raster of a text, an icon the emulator draws its
      // own way), adding the difference would show both: the mod's render is taken instead, by how far off.
      const v = layerAt(V.rgba, l), m = layerAt(S.rgba[l + 3] ? S.rgba : V.rgba, l), word = plan ? plan[l >> 2] : 0;
      // A text the mod changes for the most part (a recoloured bar's label): the emulator's whole word, never
      // half of it beside Dota's glyphs; one it barely touches keeps Dota's glyphs (the difference only).
      if (word === 2 || replace === 'all') {
        for (let c = 0; c < 3; c++) { out.k[i + c] = enc(m.b[c]); out.wt[i + c] = enc(m.b[c] + m.a); }
        continue;
      }
      let miss = 0;
      for (let c = 0; c < 3; c++) miss = Math.max(miss, Math.abs(enc(v.b[c]) - plate.k[i + c]), Math.abs(enc(v.b[c] + v.a) - plate.wt[i + c]));
      // Content a mod takes away (it moves or hides a panel): nothing of the HUD is left there, whatever Dota drew.
      const gone = m.a >= 0.99 && v.a < 0.9;
      const moved = inBoxes(x, y), t = word === 1 && !moved ? 0 : gone || moved ? 1 : smooth(6, 24, miss);
      for (let c = 0; c < 3; c++) {
        const bv = v.b[c], av = v.a, bs = m.b[c], as = m.a;
        const b0 = LIN[plate.k[i + c]], a0 = LIN[plate.wt[i + c]] - b0;
        const a1 = Math.min(1, Math.max(0, a0 + as - av)), b1 = Math.min(1 - a1, Math.max(0, b0 + bs - bv));
        const a = a1 + t * (as - a1), b = b1 + t * (bs - b1);
        out.k[i + c] = enc(b); out.wt[i + c] = enc(b + a);
      }
    }
  }
  return out;
}
// The words of Valve's text (the mask grown by 2 px, 8-connected) and, per pixel of the rect: 0 not text,
// 1 a word the mod changes little (≤ half its pixels by more than 12 levels), 2 one it mostly changes. Cached on
// the mod's layer.
export function textPlan(text, S, V) {
  if (S.plan) return S.plan;
  const [, , w, h] = S.rect, n = w * h, grown = new Uint8Array(n), plan = new Uint8Array(n), seen = new Int32Array(n).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!text.rgba[(y * w + x) * 4 + 3]) continue;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) grown[yy * w + xx] = 1;
  }
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (!grown[start] || seen[start] >= 0) continue;
    const members = [];
    let changed = 0;
    stack.push(start); seen[start] = start;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      members.push(p);
      // Changed for real: a few levels of a stale stylesheet's raster do not count.
      const l = p * 4;
      if (S.rgba[l + 3] && (Math.abs(S.rgba[l] - V.rgba[l]) > 12 || Math.abs(S.rgba[l + 1] - V.rgba[l + 1]) > 12 || Math.abs(S.rgba[l + 2] - V.rgba[l + 2]) > 12 || Math.abs(S.rgba[l + 3] - V.rgba[l + 3]) > 12)) changed++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = (y + dy) * w + (x + dx);
        if (y + dy < 0 || y + dy >= h || x + dx < 0 || x + dx >= w || !grown[q] || seen[q] >= 0) continue;
        seen[q] = start; stack.push(q);
      }
    }
    if (!changed) continue;
    const mark = changed * 2 > members.length ? 2 : 1;
    for (const p of members) plan[p] = mark;
  }
  S.plan = plan;
  return plan;
}
// The lower HUD ({ C, F } of buildLower) with a mod: { C: [V, S], F: [V, S] } (either may be missing).
// A plate grown to cover a rect: the new pixels are nothing of the HUD (over black 0, over white 255).
export function grow(plate, [rx, ry, rw, rh]) {
  const x = Math.min(plate.x, rx), y = Math.min(plate.y, ry), w = Math.max(plate.x + plate.w, rx + rw) - x, h = Math.max(plate.y + plate.h, ry + rh) - y;
  if (x === plate.x && y === plate.y && w === plate.w && h === plate.h) return plate;
  const k = new Uint8Array(w * h * 3), wt = new Uint8Array(w * h * 3).fill(255);
  for (let yy = 0; yy < plate.h; yy++) {
    const from = yy * plate.w * 3, to = ((plate.y - y + yy) * w + (plate.x - x)) * 3;
    k.set(plate.k.subarray(from, from + plate.w * 3), to); wt.set(plate.wt.subarray(from, from + plate.w * 3), to);
  }
  return { x, y, w, h, k, wt, mask: null };
}
// options.text: the lower HUD's text mask (applyDelta text).
export function reskinLower({ C, F }, layers, options) {
  return { C: layers.C ? applyDelta(C, layers.C[0], layers.C[1], options) : C, F: layers.F ? applyDelta(F, layers.F[0], layers.F[1], options) : F };
}
// Where the hidden decorations' patches are (buildLower's decor), for skip.
export function hiddenDecor(lowerSet, { flares = true, shadows = true } = {}) {
  const off = [!flares && lowerSet.decor?.flares, !shadows && lowerSet.decor?.insets].filter(Boolean).map((d) => d.F);
  if (!off.length) return null;
  return (x, y) => off.some((p) => x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h && (!p.mask || p.mask[(y - p.y) * p.w + (x - p.x)]));
}
