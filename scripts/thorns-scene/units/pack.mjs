// Packs the frames rendered by make.mjs (<work>/<unit>/<clip>-<d>-<i>.png + meta.json) into
// assets/minigames/thorns/sprites/<unit>.webp (<unit>_1.webp … when one 2048² atlas is not enough) and
// sprites/units.json, and draws review contact sheets over the palace floor's purple (anchor red, footprint
// radius yellow): <review>/<unit>.png (every clip, all 8 facings — mirrored ones flipped as the game draws them,
// decoded back from the WebP), <review>/facings.png (walk frame 0 of every unit in d = 0..7) and lineup.png.
//   node scripts/thorns-scene/units/pack.mjs --work <dir> [--review <dir>] [--quality 80]
// units.json: units.<key> = { model, scale, ppu, atlases, dirs, radius, height, clips: { <clip>: { fps, loop,
// duration, dirs: [ { frames: [[atlas, x, y, w, h, ax, ay], …] } | { mirror: <source d> } ] } } }; ax, ay = the
// ground point under the unit relative to the frame's top-left (atlas px). A mirrored facing draws the source
// frames flipped horizontally: its ground point is then at (w − ax, ay).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UNITS, MIRROR, PITCH } from './units.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const WORK = resolve(opt('work', 'thorns-units-work')), REVIEW = resolve(opt('review', join(WORK, 'review')));
const OUT = new URL('../../../assets/minigames/thorns/sprites/', import.meta.url).pathname;
const QUALITY = +opt('quality', 70), MAX = 2048, PAD = 1, GAP = 1, BG = '#2b1b33', FLOOR = '#3a2442';
mkdirSync(OUT, { recursive: true }); mkdirSync(REVIEW, { recursive: true });
const json = { version: 1, pitch: PITCH, units: {} };
const sizes = [], facings = [], lineup = [];
let total = 0;

// Alpha bounds of a canvas (null when empty).
function trim(cv) {
  const { width: W, height: H } = cv, d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 = Math.min(W - 1, x1 + PAD); y1 = Math.min(H - 1, y1 + PAD);
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// Shelf packing, tallest first, into atlases of at most MAX², about square.
function shelfPack(items) {
  const area = items.reduce((s, it) => s + (it.w + GAP) * (it.h + GAP), 0), widest = Math.max(...items.map((it) => it.w + GAP));
  const width = Math.min(MAX, Math.max(widest, Math.ceil(Math.sqrt(area * 1.08))));
  const order = [...items].sort((a, b) => b.h - a.h || b.w - a.w), atlases = [];
  let cur = null, x = 0, y = 0, rowH = 0;
  const open = () => { cur = { w: 0, h: 0, items: [] }; atlases.push(cur); x = 0; y = 0; rowH = 0; };
  open();
  for (const it of order) {
    if (x + it.w > width) { x = 0; y += rowH + GAP; rowH = 0; }
    if (y + it.h > MAX) { open(); }
    it.atlas = atlases.length - 1; it.x = x; it.y = y; cur.items.push(it);
    x += it.w + GAP; rowH = Math.max(rowH, it.h); cur.w = Math.max(cur.w, x - GAP); cur.h = Math.max(cur.h, y + it.h);
  }
  return atlases;
}

for (const f of readdirSync(OUT)) if (f.endsWith('.webp') || f === 'units.json') rmSync(join(OUT, f));
for (const u of UNITS) {
  const metaFile = join(WORK, u.key, 'meta.json');
  if (!existsSync(metaFile)) { console.log('skip (not rendered):', u.key); continue; }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const [W, H] = meta.size, [AX, AY] = meta.anchor;
  // Every frame, trimmed to its own opaque pixels.
  const items = [], byClip = {};
  for (const [name, c] of Object.entries(meta.clips)) {
    byClip[name] = {};
    for (const d of meta.dirs) {
      byClip[name][d] = [];
      for (let i = 0; i < c.frames; i++) {
        const im = await loadImage(join(WORK, u.key, `${name}-${d}-${i}.png`));
        const cv = createCanvas(W, H); cv.getContext('2d').drawImage(im, 0, 0);
        const t = trim(cv) || { x0: Math.round(AX), y0: Math.round(AY), w: 1, h: 1 };
        const it = { cv, ...t }; items.push(it); byClip[name][d].push(it);
      }
    }
  }
  const atlases = shelfPack(items), names = atlases.map((_, k) => (k ? `${u.key}_${k}.webp` : `${u.key}.webp`));
  const backs = [];
  let bytes = 0;
  for (const [k, a] of atlases.entries()) {
    const cv = createCanvas(a.w, a.h), cx = cv.getContext('2d');
    for (const it of a.items) cx.drawImage(it.cv, it.x0, it.y0, it.w, it.h, it.x, it.y, it.w, it.h);
    const raw = cx.getImageData(0, 0, a.w, a.h);
    const buf = await sharp(Buffer.from(raw.data.buffer), { raw: { width: a.w, height: a.h, channels: 4 } }).webp({ quality: u.quality ?? QUALITY, alphaQuality: 85, effort: 6, preset: 'picture' }).toBuffer();
    writeFileSync(join(OUT, names[k]), buf); bytes += buf.length;
    backs.push(await loadImage(buf));
  }
  for (const it of items) it.cv = null;
  total += bytes;
  const rect = (it) => [it.atlas, it.x, it.y, it.w, it.h, +(AX - it.x0).toFixed(1), +(AY - it.y0).toFixed(1)];
  const clips = {};
  for (const [name, c] of Object.entries(meta.clips)) {
    const dirs = [];
    if (meta.dirs.length === 1) dirs.push({ frames: byClip[name][meta.dirs[0]].map(rect) });
    else for (let d = 0; d < 8; d++) dirs.push(MIRROR[d] != null ? { mirror: MIRROR[d] } : { frames: byClip[name][d].map(rect) });
    clips[name] = { fps: c.fps, loop: c.loop, duration: c.duration, dirs };
  }
  json.units[u.key] = { model: `${u.file}.glb`, scale: u.scale, ppu: meta.ppu, atlases: names.map((n) => `sprites/${n}`), dirs: meta.dirs.length === 1 ? 1 : 8, radius: meta.radius, height: meta.height, clips };
  sizes.push([u.key, bytes, items.length, atlases.map((a) => `${a.w}x${a.h}`).join('+')]);
  console.log(`${u.key}: ${items.length} frames, atlas ${atlases.map((a) => `${a.w}x${a.h}`).join(' + ')}, ${(bytes / 1024).toFixed(0)} KB`);

  // Review sheet: per clip, one row per facing (mirrored ones flipped), up to 12 frames each, from the WebP.
  const draw = (sx, it, dx, dy, flip) => {
    const img = backs[it.atlas], ax = AX - it.x0, ay = AY - it.y0;
    sx.save();
    if (flip) { sx.translate(dx, dy); sx.scale(-1, 1); sx.drawImage(img, it.x, it.y, it.w, it.h, -ax, -ay, it.w, it.h); }
    else sx.drawImage(img, it.x, it.y, it.w, it.h, dx - ax, dy - ay, it.w, it.h);
    sx.restore();
  };
  const ground = (sx, dx, dy) => {
    sx.strokeStyle = 'rgba(255,220,0,0.55)'; sx.beginPath(); sx.ellipse(dx, dy, meta.radius * meta.ppu, meta.radius * meta.ppu * Math.SQRT1_2, 0, 0, Math.PI * 2); sx.stroke();
    sx.fillStyle = '#ff3030'; sx.fillRect(dx - 4, dy, 9, 1); sx.fillRect(dx, dy - 4, 1, 9);
  };
  const cellW = Math.max(...items.map((it) => Math.max(AX - it.x0, it.x0 + it.w - AX))) * 2 + 6, up = Math.max(...items.map((it) => AY - it.y0)) + 4, down = Math.max(...items.map((it) => it.y0 + it.h - AY)) + 4;
  const rows = [];
  for (const [name, c] of Object.entries(meta.clips)) {
    const k = Math.max(1, Math.ceil(c.frames / 12)), idx = []; for (let i = 0; i < c.frames; i += k) idx.push(i);
    if (!c.loop && idx.at(-1) !== c.frames - 1) idx.push(c.frames - 1);
    const ds = meta.dirs.length === 1 ? [null] : [0, 1, 2, 3, 4, 5, 6, 7];
    for (const d of ds) rows.push({ label: `${name}${d == null ? '' : ` d${d}`} (${c.frames})`, d, name, idx });
  }
  const sw = 130 + Math.max(...rows.map((r) => r.idx.length)) * cellW, sh = rows.length * (up + down);
  const sheet = createCanvas(Math.min(sw, 16000), sh), sx = sheet.getContext('2d');
  sx.fillStyle = BG; sx.fillRect(0, 0, sheet.width, sh);
  rows.forEach((r, ri) => {
    const y0 = ri * (up + down);
    sx.fillStyle = FLOOR; sx.fillRect(0, y0 + up, sheet.width, 1);
    sx.fillStyle = '#fff'; sx.font = '13px sans-serif'; sx.fillText(r.label, 4, y0 + 16);
    const src = r.d == null ? meta.dirs[0] : MIRROR[r.d] ?? r.d, flip = r.d != null && MIRROR[r.d] != null;
    r.idx.forEach((i, k) => { const dx = 130 + k * cellW + cellW / 2, dy = y0 + up; ground(sx, dx, dy); draw(sx, byClip[r.name][src][i], dx, dy, flip); });
  });
  writeFileSync(join(REVIEW, `${u.key}.png`), sheet.toBuffer('image/png'));
  const first = Object.keys(meta.clips).find((n) => n === 'walk' || n === 'fly') || Object.keys(meta.clips)[0];
  facings.push({ key: u.key, meta, byClip: { [first]: Object.fromEntries(Object.entries(byClip[first]).map(([d, l]) => [d, [l[0]]])) }, first, draw, ground, cellW, up, down });
}
writeFileSync(join(OUT, 'units.json'), JSON.stringify(json) + '\n');
sizes.sort((a, b) => b[1] - a[1]);
console.log(sizes.map(([k, b, n, a]) => `  ${k.padEnd(22)} ${(b / 1024).toFixed(0).padStart(5)} KB  ${String(n).padStart(4)} frames  ${a}`).join('\n'));
console.log(`total ${(total / 1024).toFixed(0)} KB (${(total / 1048576).toFixed(2)} MB) + units.json ${(JSON.stringify(json).length / 1024).toFixed(0)} KB`);

// Facings: walk/fly frame 0 of every unit in d = 0..7 (labels E NE N NW W SW S SE).
if (facings.length) {
  const lab = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
  const cw = Math.min(260, Math.max(...facings.map((f) => f.cellW))), rh = facings.map((f) => Math.min(300, f.up + f.down));
  const sheet = createCanvas(140 + 8 * cw, rh.reduce((s, h) => s + h, 0) + 20), sx = sheet.getContext('2d');
  sx.fillStyle = BG; sx.fillRect(0, 0, sheet.width, sheet.height);
  sx.fillStyle = '#fff'; sx.font = '13px sans-serif'; lab.forEach((l, d) => sx.fillText(`d${d} ${l}`, 140 + d * cw + cw / 2 - 14, 14));
  let y = 20;
  facings.forEach((f, k) => {
    sx.fillStyle = '#fff'; sx.fillText(f.key, 4, y + 16);
    const scale = Math.min(1, 300 / (f.up + f.down), 260 / f.cellW);
    for (let d = 0; d < 8; d++) {
      const one = f.meta.dirs.length === 1; if (one && d) break;
      const src = one ? f.meta.dirs[0] : MIRROR[d] ?? d, flip = !one && MIRROR[d] != null;
      sx.save(); sx.translate(140 + d * cw + cw / 2, y + f.up * scale); sx.scale(scale, scale);
      f.ground(sx, 0, 0); f.draw(sx, f.byClip[f.first][src][0], 0, 0, flip); sx.restore();
    }
    y += rh[k];
  });
  writeFileSync(join(REVIEW, 'facings.png'), sheet.toBuffer('image/png'));
  // Line-up: d = 6 (front), frame 0, at the sprite scale on one ground line.
  const gap = 16, list = facings.map((f) => { const src = f.meta.dirs.length === 1 ? f.meta.dirs[0] : 6; const it = f.byClip[f.first][src][0]; return { f, it }; });
  const top = Math.max(...list.map(({ f, it }) => f.meta.anchor[1] - it.y0)) + 24, bottom = Math.max(...list.map(({ f, it }) => it.y0 + it.h - f.meta.anchor[1])) + 10;
  const widths = list.map(({ f, it }) => Math.max(f.meta.anchor[0] - it.x0, it.x0 + it.w - f.meta.anchor[0]) * 2);
  const lw = widths.reduce((s, w) => s + w + gap, gap), ls = createCanvas(Math.min(lw, 16000), top + bottom), lx = ls.getContext('2d');
  lx.fillStyle = BG; lx.fillRect(0, 0, ls.width, ls.height); lx.fillStyle = FLOOR; lx.fillRect(0, top, ls.width, bottom);
  let x = gap;
  list.forEach(({ f, it }, k) => { const dx = x + widths[k] / 2; f.ground(lx, dx, top); f.draw(lx, it, dx, top, false); lx.fillStyle = '#fff'; lx.font = '11px sans-serif'; lx.fillText(f.key, x, 12 + (k % 2) * 11); x += widths[k] + gap; });
  writeFileSync(join(REVIEW, 'lineup.png'), ls.toBuffer('image/png'));
}
