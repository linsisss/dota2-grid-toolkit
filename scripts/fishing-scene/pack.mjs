// Packs the renders of make.mjs (views/, sp/, props/ and their *-meta files in the working directory)
// into assets/minigames/fishing/scene/: the three views as WebP, each hero animation as one WebP sheet of
// trimmed frames, the catches, and scene.json (cameras for the projection, frame rectangles, the rod's
// tip per frame). Run from the work dir.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = new URL('../../assets/minigames/fishing/scene/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const Q = { view: 80, sprite: 74, prop: 84 };
// Slow idles keep every second frame (Tidehunter barely moves; 5 fps is enough).
const EVERY = { tide_idle: 2, tide_catch: 2 };
let total = 0;
const save = (name, canvas, q) => { const buf = canvas.toBuffer('image/webp', q); writeFileSync(OUT + name, buf); total += buf.length; return buf.length; };
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

// A light grade towards the videos: brighter, a little warmer and more saturated.
function grade(ctx, w, h, { bright = 1.05, sat = 1.12, warm = 1.02 } = {}) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2]; const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r = (l + (r - l) * sat) * bright * warm; g = (l + (g - l) * sat) * bright; b = (l + (b - l) * sat) * bright / warm;
    d[i] = Math.min(255, Math.max(0, r)); d[i + 1] = Math.min(255, Math.max(0, g)); d[i + 2] = Math.min(255, Math.max(0, b));
  }
  ctx.putImageData(img, 0, 0);
}
// The drawn part of a picture (alpha > 8).
function bounds(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const views = json('views-meta.json');
const meta = { version: 1, design: [1244, 700], waterZ: views.waterZ, hero: [-383.745575, -1274.26001, 256], tide: [-107.453659, -1276.870483, 256], cameras: {}, views: {}, sheets: {}, props: {} };
for (const name of ['side', 'overhead', 'centered']) {
  const im = await loadImage(`views/${name}.png`);
  const c = createCanvas(1244, 700), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, 1244, 700); grade(x, 1244, 700);
  save(`${name}.webp`, c, Q.view);
  meta.views[name] = `${name}.webp`;
  meta.cameras[name] = { projection: views[name].projection.map((v) => +v.toFixed(6)), view: views[name].view.map((v) => +v.toFixed(5)) };
}

// Hero sheets: every frame trimmed to what it shows (the region's design offset kept), then the frames
// side by side in rows of a sheet at most 2048 wide.
const heroMeta = Object.assign({}, ...['meta-jobs-venge.json', 'meta-jobs-tide.json'].filter(existsSync).map(json));
for (const [name, s] of Object.entries(heroMeta)) {
  const frames = [], every = EVERY[name] || 1, kept = [];
  for (let i = 0; i < s.n; i += every) {
    kept.push(i);
    const im = await loadImage(`sp/${name}-${i}.png`);
    const k = 1 / (s.ss || 1), w = Math.round(im.width * k), h = Math.round(im.height * k);
    const c = createCanvas(w, h), x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
    // The heroes are a little dark next to the scene on the videos.
    grade(x, w, h, { bright: 1.08, sat: 1.1, warm: 1.0 });
    const b = bounds(x, w, h);
    frames.push({ c, b });
  }
  const pad = 1, maxW = 2048;
  let cx = 0, cy = 0, rowH = 0, W = 0;
  const rects = frames.map(({ b }) => { if (cx + b.w > maxW) { cx = 0; cy += rowH + pad; rowH = 0; } const r = [cx, cy, b.w, b.h]; cx += b.w + pad; rowH = Math.max(rowH, b.h); W = Math.max(W, cx); return r; });
  const H = cy + rowH;
  const sheet = createCanvas(Math.max(1, W), Math.max(1, H)), sx = sheet.getContext('2d');
  frames.forEach(({ c, b }, i) => sx.drawImage(c, b.x, b.y, b.w, b.h, rects[i][0], rects[i][1], b.w, b.h));
  const bytes = save(`${name}.webp`, sheet, Q.sprite);
  meta.sheets[name] = { image: `${name}.webp`, fps: +(s.fps / every).toFixed(3), loop: s.loop, frames: rects.map((r, i) => [...r, s.region[0] + frames[i].b.x, s.region[1] + frames[i].b.y]), tips: kept.map((i) => s.tips[i]) };
  console.log(name, frames.length, 'frames', `${W}×${H}`, `${(bytes / 1024).toFixed(0)} KB`);
}

// The catches: trimmed, the mouth (the right end, middle) as the hook point.
const props = existsSync('props-meta.json') ? json('props-meta.json') : {};
for (const id of Object.keys(props)) {
  const im = await loadImage(`props/${id}.png`);
  const c = createCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); grade(x, im.width, im.height, { bright: 1.1, sat: 1.15 });
  const b = bounds(x, im.width, im.height), o = createCanvas(b.w, b.h); o.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  save(`${id}.webp`, o, Q.prop);
  meta.props[id] = { image: `${id}.webp`, size: [b.w, b.h] };
}
writeFileSync(OUT + 'scene.json', JSON.stringify(meta));
console.log('scene:', `${(total / 1048576).toFixed(2)} MB`);
