// The hero's silhouette and depth in the match preview's captured frame (2026-10-17), so ground effects
// hide behind him the way the game's depth test hides them (scripts/click-fx-draw.mjs) and the cursor knows
// when it is over him (DotaCursor.jsx).
//   node scripts/make-hero-depth.mjs <depth.json> [world.webp] [out dir]
// depth.json comes from tools/hero-depth (a headless three.js render of Keeper of the Light from dota-loadout's
// models, through the game camera of scripts/click-fx.mjs, fitted to the frame): { box: {x, y, w, h}, depth:
// [view depth per pixel, 0 = empty] }. The silhouette is cut from the frame itself — the hero's pixels by
// colour (pale body, wings and spear; the staff's brown) inside the render grown by 14 px, closed, small bits
// dropped, the health bar left out — so it sits on the picture exactly; each of its pixels takes the render's
// depth, or the nearest one's where the render does not reach. Written as assets/match-hero/kotl-depth.png (R =
// depth scaled to near…far everywhere, A = 255 on the hero) and kotl-depth.json ({ box, near, far }).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const [input, framePath = 'assets/dota-hud-capture/world.webp', out = 'assets/match-hero'] = process.argv.slice(2);
if (!input) { console.error('usage: node scripts/make-hero-depth.mjs <depth.json> [world.webp] [out dir]'); process.exit(1); }
const { box, depth } = JSON.parse(readFileSync(input, 'utf8')), { x: X, y: Y, w: W, h: H } = box;
const frame = await loadImage(framePath), canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
ctx.drawImage(frame, X, Y, W, H, 0, 0, W, H);
const px = ctx.getImageData(0, 0, W, H).data, N = W * H;
const render = Uint8Array.from(depth, (d) => (d > 0 ? 1 : 0));
const grow = (mask, r) => { // square dilation, separable
  const a = new Uint8Array(N), b = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < W) v = mask[y * W + xx]; } a[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < H) v = a[yy * W + x]; } b[y * W + x] = v; }
  return b;
};
const shrink = (mask, r) => grow(mask.map((v) => 1 - v), r).map((v) => 1 - v);
const near = grow(render, 14);
let hero = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  if (!near[i]) continue;
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], L = 0.299 * r + 0.587 * g + 0.114 * b;
  hero[i] = (L > 118 && b >= g - 4) || (r > g + 10 && g >= b - 6 && L > 40 && L < 140) ? 1 : 0;
}
hero = shrink(grow(hero, 2), 2);
// The health bar and its portrait are the HUD's, not the hero.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const gx = X + x, gy = Y + y; if (gy < 452 && gx > 860 && gx < 1050) hero[y * W + x] = 0; }
// Keep what belongs to the hero: the largest part and parts the render mostly covers (not a butterfly
// that the grown render happens to reach); then fill the holes the shading leaves inside (dark folds of the
// robe), up to 900 px each.
const label = new Int32Array(N).fill(-1), parts = [];
for (let i = 0; i < N; i++) {
  if (!hero[i] || label[i] >= 0) continue;
  const stack = [i], part = []; label[i] = parts.length;
  while (stack.length) { const j = stack.pop(); part.push(j); const x = j % W, y = (j / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy, k = yy * W + xx; if (xx >= 0 && yy >= 0 && xx < W && yy < H && hero[k] && label[k] < 0) { label[k] = parts.length; stack.push(k); } } }
  parts.push(part);
}
const largest = parts.reduce((a, b) => (b.length > a.length ? b : a), []);
for (const part of parts) {
  const covered = part.filter((j) => render[j]).length / part.length;
  if (part !== largest && (part.length < 40 || covered < 0.5)) for (const j of part) hero[j] = 0;
}
const outside = new Uint8Array(N), stack = [];
for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
const seen = new Uint8Array(N);
while (stack.length) { const j = stack.pop(); if (seen[j] || hero[j]) continue; seen[j] = 1; outside[j] = 1; const x = j % W, y = (j / W) | 0;
  if (x > 0) stack.push(j - 1); if (x < W - 1) stack.push(j + 1); if (y > 0) stack.push(j - W); if (y < H - 1) stack.push(j + W); }
const visited = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  if (hero[i] || outside[i] || visited[i]) continue;
  const hole = [], st = [i]; visited[i] = 1;
  while (st.length) { const j = st.pop(); hole.push(j); const x = j % W, y = (j / W) | 0;
    for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (k >= 0 && !hero[k] && !outside[k] && !visited[k]) { visited[k] = 1; st.push(k); } }
  if (hole.length <= 900) for (const j of hole) hero[j] = 1;
}
// Depth: the render's, else the nearest render pixel's (breadth-first from all of them).
const filled = Float32Array.from(depth), queue = [];
for (let i = 0; i < N; i++) if (filled[i] > 0) queue.push(i);
for (let q = 0; q < queue.length; q++) { const j = queue[q], x = j % W, y = (j / W) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy, k = yy * W + xx; if (xx >= 0 && yy >= 0 && xx < W && yy < H && !(filled[k] > 0)) { filled[k] = filled[j]; queue.push(k); } } }
let lo = Infinity, hi = -Infinity;
for (let i = 0; i < N; i++) if (hero[i]) { lo = Math.min(lo, filled[i]); hi = Math.max(hi, filled[i]); }
lo = Math.floor(lo); hi = Math.ceil(hi);
const image = ctx.createImageData(W, H);
for (let i = 0; i < N; i++) {
  // Depth everywhere (the nearest render pixel's off the silhouette), so the 8-px closing the page applies\n  // (click-fx-draw.mjs heroDepthData) finds a depth too.
  image.data[i * 4] = Math.round((Math.min(Math.max(filled[i], lo), hi) - lo) / (hi - lo) * 255);
  image.data[i * 4 + 1] = hero[i] ? 255 : 0;
  image.data[i * 4 + 3] = 255;
}
ctx.putImageData(image, 0, 0);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'kotl-depth.png'), canvas.toBuffer('image/png'));
writeFileSync(join(out, 'kotl-depth.json'), `${JSON.stringify({ box, near: lo, far: hi, source: 'tools/hero-depth fit + frame cut', pose: JSON.parse(readFileSync(input, 'utf8')).pose, items: JSON.parse(readFileSync(input, 'utf8')).items })}\n`);
console.log(`hero pixels ${hero.reduce((a, b) => a + b, 0)}, depth ${lo}…${hi}`);
