// Packs what make.mjs rendered into assets/minigames/zaug/scene/: the units' atlases (<unit>.webp, one clip per row),
// the two backdrops (<skin>-back.webp and the bands cut into ≤ 8192-px chunks) and scene.json; review sheets go to
// <work>/review (frames over the tundra's blue, anchor red, hit circle yellow, boss attachments).
//   node scripts/zaug-scene/pack.mjs --work <dir>
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UNITS } from './units.mjs';

const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const WORK = resolve(opt('work', 'zaug-scene-work')), REVIEW = join(WORK, 'review');
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'assets/minigames/zaug/scene');
const DATA = JSON.parse(readFileSync(join(ROOT, 'assets/minigames/zaug/data.json'), 'utf8'));
mkdirSync(OUT, { recursive: true }); mkdirSync(REVIEW, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.webp')) rmSync(join(OUT, f));
const UNIT_Q = 82, BACK_Q = 80, BAND_Q = 74, CHUNK = 8192, PER_ROW = 16, PAD = 2, BG = '#3a617b';
const json = { version: 1, units: {}, backdrops: {} };
let total = 0;
const save = (name, buf) => { writeFileSync(join(OUT, name), buf); total += buf.length; return buf.length; };

// The boss's m_vecBodyParts attachments, from the bones next to them.
const ATTACH = {
  attach_head: ['head1'], attach_neck: ['neck04'], attach_spine_1: ['neck07'], attach_spine_2: ['spine1'], attach_spine_3: ['spine1_1'],
  attach_spine_4: ['spine1_1', 'tail_R1C0'], attach_spine_5: ['tail_R1C0'], attach_knee_l: ['knee_L'], attach_knee_r: ['knee_R'], attach_tail_1: ['tail_R3C0'], attach_tail_2: ['tail_R5C0'],
};

for (const u of UNITS) {
  const metaFile = join(WORK, u.unit, 'meta.json');
  if (!existsSync(metaFile)) { console.log('skip (not rendered):', u.unit); continue; }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const [W, H] = meta.size;
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
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const anchor = [+(meta.anchor[0] - x0).toFixed(1), +(meta.anchor[1] - y0).toFixed(1)];
  // The visual centre of the first clip (its frames' opaque bounds), in game px from the anchor.
  const first = Object.keys(meta.clips)[0];
  // (the alpha-weighted centroid: the body, not the wing tips)
  let sa = 0, sxw = 0, syw = 0;
  for (const cv of frames[first]) { const d = cv.getContext('2d').getImageData(0, 0, W, H).data; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = d[(y * W + x) * 4 + 3]; if (a > 60) { sa += a; sxw += a * x; syw += a * y; } } }
  const center = [+((sxw / sa - meta.anchor[0]) / meta.ppu).toFixed(1), +((syw / sa - meta.anchor[1]) / meta.ppu).toFixed(1)];
  const clips = {}; let y = 0, cols = 1;
  for (const [name, c] of Object.entries(meta.clips)) {
    const perRow = Math.min(c.frames, PER_ROW), rows = Math.ceil(c.frames / perRow);
    clips[name] = { y, frames: c.frames, perRow, fps: c.fps, loop: c.loop };
    y += rows * h; cols = Math.max(cols, perRow);
  }
  const atlas = createCanvas(cols * w, y), ax = atlas.getContext('2d');
  for (const [name, c] of Object.entries(clips)) frames[name].forEach((cv, i) => ax.drawImage(cv, x0, y0, w, h, (i % c.perRow) * w, c.y + Math.floor(i / c.perRow) * h, w, h));
  const buf = atlas.toBuffer('image/webp', UNIT_Q);
  save(`${u.unit}.webp`, buf);
  const entry = { image: `${u.unit}.webp`, frame: [w, h], anchor, ppu: meta.ppu, center, clips };
  // Bones per frame (game px from the anchor), for the boss's hit circles and Shen's hands.
  if (meta.bones && Object.values(meta.bones).some((list) => list.some((b) => Object.keys(b).length))) {
    if (u.unit === 'boss') {
      entry.parts = {};
      for (const [clip, list] of Object.entries(meta.bones)) entry.parts[clip] = list.map((b) => Object.fromEntries(Object.entries(ATTACH).map(([attach, names]) => {
        const pts = names.map((n) => b[n]).filter(Boolean);
        return [attach, pts.length ? [+(pts.reduce((s, p) => s + p[0], 0) / pts.length).toFixed(1), +(pts.reduce((s, p) => s + p[1], 0) / pts.length).toFixed(1)] : [0, 0]];
      })));
    } else entry.bones = meta.bones;
  }
  json.units[u.unit] = entry;
  console.log(`${u.unit}: frame ${w}x${h}, anchor ${anchor}, centre ${center}, atlas ${atlas.width}x${atlas.height}, ${(buf.length / 1024).toFixed(0)} KB`);

  // Review: frames of each clip with the anchor, the vdata hit circle (at the hitbox offset) and the boss's parts.
  const back = await loadImage(buf);
  const def = DATA.enemies[u.unit === 'boss' ? 'enemy_boss' : u.unit];
  const show = Object.entries(clips).map(([name, c]) => { const k = Math.max(1, Math.ceil(c.frames / 8)); const idx = []; for (let i = 0; i < c.frames; i += k) idx.push(i); return [name, c, idx]; });
  const sw = Math.max(...show.map(([, , idx]) => idx.length)) * (w + 4) + 110, sh = show.length * (h + 4);
  const sheet = createCanvas(sw, sh), sx = sheet.getContext('2d');
  sx.fillStyle = BG; sx.fillRect(0, 0, sw, sh);
  show.forEach(([name, c, idx], r) => {
    sx.fillStyle = '#fff'; sx.font = '14px sans-serif'; sx.fillText(`${name} (${c.frames})`, 4, r * (h + 4) + 18);
    idx.forEach((i, k) => {
      const dx = 110 + k * (w + 4), dy = r * (h + 4);
      sx.drawImage(back, (i % c.perRow) * w, c.y + Math.floor(i / c.perRow) * h, w, h, dx, dy, w, h);
      sx.fillStyle = '#ff3030'; sx.fillRect(dx + anchor[0] - 6, dy + anchor[1], 12, 1); sx.fillRect(dx + anchor[0], dy + anchor[1] - 6, 1, 12);
      if (def && !def.m_bIsBoss) {
        const off = def.m_vHitboxOffsetWS || [0, 0, 0];
        sx.strokeStyle = 'rgba(255,220,0,0.9)'; sx.beginPath(); sx.arc(dx + anchor[0] + off[0] / 2 * meta.ppu, dy + anchor[1] - off[2] / 2 * meta.ppu, def.m_flHitboxRadius * meta.ppu, 0, Math.PI * 2); sx.stroke();
      }
      if (entry.parts?.[name]) {
        const parts = DATA.game.m_boss.m_vecBodyParts;
        for (const p of parts) { const o = entry.parts[name][i][p.m_strAttachName]; sx.strokeStyle = p.m_nDamageMultiplier === 2 ? 'rgba(255,60,60,0.9)' : p.m_nDamageMultiplier === 0 ? 'rgba(120,120,120,0.9)' : 'rgba(255,220,0,0.9)'; sx.beginPath(); sx.arc(dx + anchor[0] + o[0] * meta.ppu, dy + anchor[1] + o[1] * meta.ppu, p.m_flRadius * meta.ppu, 0, Math.PI * 2); sx.stroke(); }
      }
    });
  });
  writeFileSync(join(REVIEW, `${u.unit}.png`), sheet.toBuffer('image/png'));
}

// Backdrops: the back picture and each band cut into chunks.
for (const skin of ['mellow', 'harsh']) {
  const metaFile = join(WORK, skin, 'meta.json');
  if (!existsSync(metaFile)) { console.log('skip backdrop (not rendered):', skin); continue; }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  const backImg = await loadImage(join(WORK, skin, 'back.png'));
  const bc = createCanvas(backImg.width, backImg.height); bc.getContext('2d').drawImage(backImg, 0, 0);
  let bytes = save(`${skin}-back.webp`, bc.toBuffer('image/webp', BACK_Q));
  const layers = [];
  for (const [i, layer] of meta.layers.entries()) {
    if (layer.height <= 2) continue; // nothing at that depth
    const im = await loadImage(join(WORK, layer.file));
    const chunks = [];
    for (let x = 0, k = 0; x < im.width; x += CHUNK, k++) {
      const cw = Math.min(CHUNK, im.width - x), c = createCanvas(cw, im.height); c.getContext('2d').drawImage(im, x, 0, cw, im.height, 0, 0, cw, im.height);
      const name = `${skin}-band${i}-${k}.webp`;
      bytes += save(name, c.toBuffer('image/webp', BAND_Q));
      chunks.push([name, cw]);
    }
    layers.push({ speed: layer.speed, length: layer.length, top: layer.top, height: layer.height, depth: layer.depth, chunks });
  }
  json.backdrops[skin] = { width: meta.width, height: meta.height, scale: meta.scale, period: meta.period, slit: meta.slit || 16, back: `${skin}-back.webp`, layers };
  console.log(`backdrop ${skin}: ${layers.length} bands, ${(bytes / 1024).toFixed(0)} KB`);
}
writeFileSync(join(OUT, 'scene.json'), JSON.stringify(json) + '\n');
console.log(`total ${(total / 1024).toFixed(0)} KB`);
