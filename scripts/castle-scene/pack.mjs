// Packs the frames rendered by make.mjs (<work>/<unit>/<clip>-<i>.png + meta.json) into
// assets/minigames/castle/sprites/<unit>.webp + sprites.json, and draws review contact sheets over the level's
// blue (frame borders grey, anchor red, gameplay hitbox yellow).
//   node scripts/castle-scene/pack.mjs --work <dir> [--review <dir>]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UNITS, PPU } from './units.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const WORK = resolve(opt('work', 'castle-scene-work')), REVIEW = resolve(opt('review', join(WORK, 'review')));
const OUT = new URL('../../assets/minigames/castle/sprites/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true }); mkdirSync(REVIEW, { recursive: true });
const QUALITY = 80, PER_ROW = 24, PAD = 2, BG = '#3a4a5e';
const json = { version: 1, scale: PPU, units: {} };
const lineup = [];
let total = 0;

for (const u of UNITS) {
  const metaFile = join(WORK, u.unit, 'meta.json');
  if (!existsSync(metaFile)) { console.log('skip (not rendered):', u.unit); continue; }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const [W, H] = meta.size;
  // Load every frame; the union of their opaque pixels (+ PAD) is the unit's frame.
  const frames = {};
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const [name, c] of Object.entries(meta.clips)) {
    frames[name] = [];
    for (let i = 0; i < c.frames; i++) {
      const im = await loadImage(join(WORK, u.unit, `${name}-${i}.png`));
      const cv = createCanvas(W, H), cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
      const d = cx.getImageData(0, 0, W, H).data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      frames[name].push(cv);
    }
  }
  x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 = Math.min(W - 1, x1 + PAD); y1 = Math.min(H - 1, y1 + PAD);
  if (x0 === 0 || y0 === 0 || x1 === W - 1 || y1 === H - 1) console.log(`  warning: ${u.unit} touches the render border`);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const anchor = [+(meta.anchor[0] - x0).toFixed(1), +(meta.anchor[1] - y0).toFixed(1)];
  // Layout: one clip per row, wrapping after PER_ROW frames.
  const clips = {}; let y = 0, cols = 1;
  for (const [name, c] of Object.entries(meta.clips)) {
    const perRow = Math.min(c.frames, PER_ROW), rows = Math.ceil(c.frames / perRow);
    clips[name] = { x: 0, y, frames: c.frames, perRow, fps: c.fps, loop: c.loop };
    y += rows * h; cols = Math.max(cols, perRow);
  }
  const atlas = createCanvas(cols * w, y), ax = atlas.getContext('2d');
  for (const [name, c] of Object.entries(clips)) frames[name].forEach((cv, i) => ax.drawImage(cv, x0, y0, w, h, c.x + (i % c.perRow) * w, c.y + Math.floor(i / c.perRow) * h, w, h));
  const buf = atlas.toBuffer('image/webp', QUALITY);
  writeFileSync(join(OUT, `${u.unit}.webp`), buf); total += buf.length;
  json.units[u.unit] = { image: `${u.unit}.webp`, frame: [w, h], anchor, clips };
  console.log(`${u.unit}: frame ${w}x${h}, anchor ${anchor}, atlas ${atlas.width}x${atlas.height}, ${(buf.length / 1024).toFixed(0)} KB, dota box ${JSON.stringify(meta.dotaBox)}`);

  // Review sheet: up to 12 frames of each clip, decoded back from the WebP so the compression shows too.
  const back = await loadImage(buf);
  const show = Object.entries(clips).map(([name, c]) => { const k = Math.max(1, Math.ceil(c.frames / 12)); const idx = []; for (let i = 0; i < c.frames; i += k) idx.push(i); if (!c.loop && idx.at(-1) !== c.frames - 1) idx.push(c.frames - 1); return [name, c, idx]; });
  const sw = Math.max(...show.map(([, , idx]) => idx.length)) * (w + 4) + 120, sh = show.length * (h + 4);
  const sheet = createCanvas(sw, sh), sx = sheet.getContext('2d');
  sx.fillStyle = BG; sx.fillRect(0, 0, sw, sh);
  const [hw, hh] = (u.hitbox || [0, 0]).map((v) => v * PPU);
  show.forEach(([name, c, idx], r) => {
    sx.fillStyle = '#fff'; sx.font = '14px sans-serif'; sx.fillText(`${name} (${c.frames})`, 4, r * (h + 4) + 18);
    idx.forEach((i, k) => {
      const dx = 120 + k * (w + 4), dy = r * (h + 4);
      sx.drawImage(back, c.x + (i % c.perRow) * w, c.y + Math.floor(i / c.perRow) * h, w, h, dx, dy, w, h);
      sx.strokeStyle = 'rgba(255,255,255,0.25)'; sx.lineWidth = 1; sx.strokeRect(dx + 0.5, dy + 0.5, w - 1, h - 1);
      if (hw) { sx.strokeStyle = 'rgba(255,220,0,0.8)'; sx.strokeRect(dx + anchor[0] - hw / 2, dy + anchor[1] - hh, hw, hh); }
      sx.fillStyle = '#ff3030'; sx.fillRect(dx + anchor[0] - 6, dy + anchor[1], 12, 1); sx.fillRect(dx + anchor[0], dy + anchor[1] - 6, 1, 12);
    });
  });
  writeFileSync(join(REVIEW, `${u.unit}.png`), sheet.toBuffer('image/png'));
  lineup.push({ u, back, w, h, anchor, c: Object.values(clips)[0] });
}
writeFileSync(join(OUT, 'sprites.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`total ${(total / 1024).toFixed(0)} KB`);

// Line-up: the first frame of every unit at game size × PPU on one ground line, with hitboxes.
if (lineup.length) {
  const gap = 20, lw = lineup.reduce((s, l) => s + l.w + gap, gap), top = Math.max(...lineup.map((l) => l.anchor[1])) + 20, lh = top + Math.max(...lineup.map((l) => l.h - l.anchor[1])) + 20;
  const sheet = createCanvas(lw, lh), sx = sheet.getContext('2d');
  sx.fillStyle = BG; sx.fillRect(0, 0, lw, lh);
  sx.fillStyle = 'rgba(0,0,0,0.25)'; sx.fillRect(0, top, lw, lh - top);
  let x = gap;
  for (const { u, back, w, h, anchor, c } of lineup) {
    const dx = x, dy = top - anchor[1];
    sx.drawImage(back, c.x, c.y, w, h, dx, dy, w, h);
    const [hw, hh] = (u.hitbox || [0, 0]).map((v) => v * PPU);
    if (hw) { sx.strokeStyle = 'rgba(255,220,0,0.8)'; sx.strokeRect(dx + anchor[0] - hw / 2, top - hh, hw, hh); }
    sx.fillStyle = '#fff'; sx.font = '14px sans-serif'; sx.fillText(u.unit, dx, 16);
    x += w + gap;
  }
  writeFileSync(join(REVIEW, 'lineup.png'), sheet.toBuffer('image/png'));
}
