// Packs the renders (pano/, ob/, sp/ and their *-meta files in the working directory, made by
// make.mjs) into assets/minigames/race/scene/: WebP tiles and sprites + scene.json. Run from the work dir.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const OUT = new URL('../../assets/minigames/race/scene/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const Q = { pano: 88, front: 86, sprite: 88 };
const meta = { version: 1, design: [1244, 700], f: 3911.4, trackRadius: 5120, panoStart: 376, startAngle: 358.4, tile: 2048, height: 700, pxPerUnit: 3911.4 / 5120, horizonY: 691.0, tiles: {}, obstacles: {}, heroes: {} };
let total = 0;
const save = (name, canvas, q) => { const buf = canvas.toBuffer('image/webp', q); writeFileSync(OUT + name, buf); total += buf.length; return buf.length; };
// A light grade towards the videos: a little brighter and warmer, more saturated.
function grade(ctx, w, h, { bright = 1.06, sat = 1.14, warm = 1.03 } = {}) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2]; const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r = (l + (r - l) * sat) * bright * warm; g = (l + (g - l) * sat) * bright; b = (l + (b - l) * sat) * bright / warm;
    d[i] = Math.min(255, Math.max(0, r)); d[i + 1] = Math.min(255, Math.max(0, g)); d[i + 2] = Math.min(255, Math.max(0, b));
  }
  ctx.putImageData(img, 0, 0);
}
async function tile(src, name, q) {
  const im = await loadImage(src); const c = createCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); grade(x, im.width, im.height); return [save(name, c, q), im.width];
}
const loopTiles = [], raceTiles = [];
for (let i = 0; i < 12; i++) { const [, w] = await tile(`pano/loop-back-${i}.png`, `loop-${i}.webp`, Q.pano); await tile(`pano/loop-front-${i}.png`, `loop-front-${i}.webp`, Q.front); loopTiles.push({ back: `loop-${i}.webp`, front: `loop-front-${i}.webp`, w }); }
for (let i = 0; i < 9; i++) {
  if (i === 0 || i === 8) { const [, w] = await tile(`pano/race-back-${i}.png`, `race-${i}.webp`, Q.pano); await tile(`pano/race-front-${i}.png`, `race-front-${i}.webp`, Q.front); raceTiles.push({ back: `race-${i}.webp`, front: `race-front-${i}.webp`, w }); }
  else raceTiles.push(loopTiles[i]);
}
meta.tiles = { loop: loopTiles, race: raceTiles, loopWidth: 24576, raceWidth: 17608 };

// Trims a picture to what is drawn; returns the canvas and the offset.
function trim(im, scale = 1, pad = 2) {
  const c = createCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data; let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
  for (let y = 0; y < im.height; y++) for (let k = 0; k < im.width; k++) if (d[(y * im.width + k) * 4 + 3] > 8) { if (k < x0) x0 = k; if (k > x1) x1 = k; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(im.width - 1, x1 + pad); y1 = Math.min(im.height - 1, y1 + pad);
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// Obstacles: rendered at 2× of the design size; packed at 1× in one atlas row each kind.
const obMeta = JSON.parse(readFileSync('ob-meta.json', 'utf8'));
for (const kind of ['top', 'bottom']) {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const im = await loadImage(`ob/${kind}${k}.png`); const box = trim(im, 1, 0);
    const c = createCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, im.width, im.height).data;
    const ox = obMeta[`${kind}${k}`].origin[0];
    // The tip: the lowest drawn row of a stalactite, the highest of a stone.
    const tipY = kind === 'top' ? box.y0 + box.h - 1 : box.y0;
    // Its outline from the tip, every 10 design px: left and right edge relative to the origin (design px).
    const left = [], right = [];
    for (let s = 0; ; s++) {
      const y = kind === 'top' ? tipY - s * 20 : tipY + s * 20; if (y < box.y0 || y >= box.y0 + box.h) break;
      let l = Infinity, r = -Infinity; for (let k2 = box.x0; k2 < box.x0 + box.w; k2++) if (d[(y * im.width + k2) * 4 + 3] > 128) { l = Math.min(l, k2); r = Math.max(r, k2); }
      left.push(l === Infinity ? 0 : (l - ox) / 2); right.push(r === -Infinity ? 0 : (r - ox) / 2);
    }
    const w = Math.ceil(box.w / 2), h = Math.ceil(box.h / 2);
    const out = createCanvas(w, h); out.getContext('2d').drawImage(im, box.x0, box.y0, box.w, box.h, 0, 0, w, h); grade(out.getContext('2d'), w, h, { bright: 1.04, sat: 1.1 });
    parts.push({ canvas: out, w, h, tip: [(ox - box.x0) / 2, (tipY - box.y0) / 2], left, right });
  }
  const W = parts.reduce((s, p) => s + p.w + 2, 0), H = Math.max(...parts.map((p) => p.h));
  const atlas = createCanvas(W, H); let at = 0; const frames = [];
  for (const p of parts) { atlas.getContext('2d').drawImage(p.canvas, at, 0); frames.push({ x: at, y: 0, w: p.w, h: p.h, tip: p.tip, left: p.left, right: p.right }); at += p.w + 2; }
  save(`${kind}.webp`, atlas, Q.sprite);
  meta.obstacles[kind] = { image: `${kind}.webp`, step: 10, frames };
}
// Heroes: frames rendered at 2× (60 px a metre), packed at 1× in a strip, cut to the union of their outlines.
const heroMeta = Object.assign({}, ...['sky', 'bat'].map((j) => Object.fromEntries(readFileSync(`meta-${j}.txt`, 'utf8').trim().split('\n').map((l) => { const i = l.indexOf(' '); return [l.slice(0, i), JSON.parse(l.slice(i + 1))]; }))));
for (const [name, m] of Object.entries(heroMeta)) {
  const ims = []; for (let i = 0; i < m.n; i++) ims.push(await loadImage(`sp/${name}-${i}.png`));
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const im of ims) { const b = trim(im, 1, 2); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x0 + b.w); y1 = Math.max(y1, b.y0 + b.h); }
  const scale = name.endsWith('menu') ? 0.9 : 0.5; const w = Math.ceil((x1 - x0) * scale), h = Math.ceil((y1 - y0) * scale);
  const strip = createCanvas(w * m.n, h), sx = strip.getContext('2d');
  ims.forEach((im, i) => sx.drawImage(im, x0, y0, x1 - x0, y1 - y0, i * w, 0, w, h));
  save(`${name}.webp`, strip, Q.sprite);
  // The body's middle: the centroid of the first frame's opaque pixels.
  const d0 = strip.getContext('2d').getImageData(0, 0, w, h).data; let sx0 = 0, sy0 = 0, sn = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d0[(y * w + x) * 4 + 3] > 128) { sx0 += x; sy0 += y; sn++; }
  const body = sn ? [sx0 / sn, sy0 / sn] : [w / 2, h / 2];
  meta.heroes[name] = { image: `${name}.webp`, w, h, n: m.n, duration: m.d, body, origin: [(m.origin[0] - x0) * scale, (m.origin[1] - y0) * scale], pxPerMetre: m.ppu * scale };
}
writeFileSync(OUT + 'scene.json', JSON.stringify(meta));
console.log('total', (total / 1048576).toFixed(2), 'MB');
