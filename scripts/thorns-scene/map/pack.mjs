#!/usr/bin/env node
// «Терновый трон», map: packs make.mjs's renders into assets/minigames/thorns/map/ (docs/minigames.md, «Терновый трон»):
//   nav.png    — walkability, one pixel per 32-unit cell (grey = R = value × 100): 0 blocked, 1 floor, 2 pit/void
//                inside the arena. From Valve's gridnav (survivors_arena.gnv, 64-unit cells: bit 0x40 = the arena's
//                playable zone, 0x08 = the throne room's, 0x10 = blocked) refined with the height render (a cell is
//                floor only if most of it is at z ≈ 512; 0x10 alone = walls and rims, blocked; 0x10 inside a zone
//                = thin dashed lines with nothing on the floor, walkable); walkable specks cut off from the floor (column cores) are
//                blocked; non-walkable regions enclosed by the floor are pits (2) when large, blocked (0) when small;
//   g_<c>_<r>.webp — ground tiles 1024², faded to the void colour ~1 700…2 500 units beyond the arena, tiles that
//                are void only are left out;
//   props.webp — one frame per tall prop (model × yaw), pillar.webp — the boss pillar, idle + break;
//   map.json   — camera and image geometry, tiles, nav, props, pillar, entities, bounds, minimap transform.
//
//   node scripts/thorns-scene/map/pack.mjs --work <dir> --ents <default_ents.vents> --gnv <survivors_arena.gnv>
//     [--review <dir>] [--out assets/minigames/thorns/map] [--budget 2500000]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../../..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const WORK = resolve(opt('work', 'thorns-map-work')), ENTS = resolve(opt('ents', '')), GNV = resolve(opt('gnv', ''));
const OUT = resolve(ROOT, opt('out', 'assets/minigames/thorns/map')), REVIEW = opt('review', '') && resolve(opt('review'));
const BUDGET = +opt('budget', 2500000);
const MINIMAP = join(ROOT, 'assets/minigames/thorns/images/minimap/survivors_minimap.webp');
const st = JSON.parse(readFileSync(join(WORK, 'setup.json'), 'utf8')), NAV = st.nav, SIN = Math.SQRT1_2;
const T = st.tile, ss = st.ss, IW = st.cols * T, IH = st.rows * T;
mkdirSync(OUT, { recursive: true }); if (REVIEW) mkdirSync(REVIEW, { recursive: true });
const r1 = (v) => Math.round(v * 10) / 10;

// ---- entities (Source 2 Viewer's text dump of default_ents.vents)
const ents = readFileSync(ENTS, 'utf8').split(/\n====\d+====\n/).map((block) => {
  const e = {};
  for (const line of block.split('\n')) { const m = /^(\S+)\s+"(.*)"$/.exec(line); if (m) e[m[1]] = m[2]; }
  if (e.targetname) e.targetname = e.targetname.replace(/^\[PR#\]/, '');
  return e;
}).filter((e) => e.classname);
const vec = (s) => s.split(/\s+/).map((v) => r1(+v));
const named = (re) => ents.filter((e) => e.targetname && re.test(e.targetname)).sort((a, b) => a.targetname.localeCompare(b.targetname, 'en', { numeric: true }));
const pos = (re) => named(re).map((e) => vec(e.origin));
const one = (re) => pos(re)[0];
const entities = {
  player_spawn: one(/^player_spawn$/), player_spawn_boss: one(/^player_spawn_boss$/), boss_spawn: one(/^boss_spawn$/),
  boss_radiating_rays_teleport: one(/^boss_radiating_rays_teleport$/),
  boss_pillars: named(/^boss_pillar_\d$/).map((e) => [...vec(e.origin), vec(e.angles)[1]]),
  boss_demon_portal_spawn: pos(/^boss_demon_portal_spawn$/), destructible_boss_tower: pos(/^destructible_boss_tower$/),
  destructible_lock: pos(/^destructible_lock$/), destructible_spawn_vase: pos(/^destructible_spawn_vase$/),
  destructible_spawn_box: pos(/^destructible_spawn_box$/), destructible_spawn_vase_boss: pos(/^destructible_spawn_vase_boss$/),
  elite_room: pos(/^elite_room$/), item_drop_1: pos(/^item_drop_1$/), item_drop_2: pos(/^item_drop_2$/), item_drop_3: pos(/^item_drop_3$/),
};
for (const [k, v] of Object.entries(entities)) if (!v || (Array.isArray(v) && !v.length)) console.warn('entity missing:', k);
const camEnt = ents.find((e) => e.targetname === 'survivors_camera');

// ---- walkability
const gnv = readFileSync(GNV);
if (gnv.readUInt32LE(0) !== 0xfadebead) throw new Error('not a .gnv');
const G = { cell: gnv.readFloatLE(4), w: gnv.readInt32LE(16), h: gnv.readInt32LE(20), ox: gnv.readInt32LE(24), oy: gnv.readInt32LE(28) }, gd = gnv.subarray(32);
const gAt = (x, y) => { const i = Math.floor(x / G.cell) - G.ox, j = Math.floor(y / G.cell) - G.oy; return i < 0 || j < 0 || i >= G.w || j >= G.h ? 0 : gd[j * G.w + i]; };
const { data: hp, info: hi } = await sharp(join(WORK, 'nav/height.png')).raw().toBuffer({ resolveWithObject: true });
const hAt = (px, py) => { const o = (py * hi.width + px) * hi.channels; return hp[o] * 256 + hp[o + 1] - 8192; };
const C = NAV.cell, NW = (NAV.x1 - NAV.x0) / C, NH = (NAV.y1 - NAV.y0) / C, k = C / NAV.res;
const nav = new Uint8Array(NW * NH); // row 0 = north
for (let r = 0; r < NH; r++) for (let c = 0; c < NW; c++) {
  const x = NAV.x0 + (c + 0.5) * C, y = NAV.y1 - (r + 0.5) * C, v = gAt(x, y);
  if (!(v & 0x48)) continue; // the zone bits; 0x10 inside a zone marks invisible dashed lines and column rings — the height decides
  let floor = 0;
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const z = hAt(c * k + i, r * k + j); if (z > 490 && z < 548) floor++; }
  if (floor >= k * k / 2) nav[r * NW + c] = 1;
}
const comps = (test) => { // 4-connected components of cells passing test → [label array, sizes, touchesBorder]
  const lab = new Int32Array(NW * NH).fill(-1), size = [], border = [], q = new Int32Array(NW * NH);
  for (let s = 0; s < NW * NH; s++) {
    if (lab[s] >= 0 || !test(s)) continue;
    const id = size.length; let n = 0, qh = 0, qt = 0, b = false; lab[s] = id; q[qt++] = s;
    while (qh < qt) {
      const p = q[qh++], c = p % NW, r = (p / NW) | 0; n++; if (!c || !r || c === NW - 1 || r === NH - 1) b = true;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= NW || rr >= NH) continue; const t = rr * NW + cc; if (lab[t] < 0 && test(t)) { lab[t] = id; q[qt++] = t; } }
    }
    size.push(n); border.push(b);
  }
  return { lab, size, border };
};
{ const w = comps((s) => nav[s] === 1); for (let s = 0; s < nav.length; s++) if (nav[s] === 1 && w.size[w.lab[s]] < 64) nav[s] = 0; }
{ const b = comps((s) => nav[s] !== 1); for (let s = 0; s < nav.length; s++) if (nav[s] !== 1 && !b.border[b.lab[s]] && b.size[b.lab[s]] >= 400) nav[s] = 2; }
const cellOf = (x, y) => [Math.floor((x - NAV.x0) / C), Math.floor((NAV.y1 - y) / C)];
const navAt = (x, y) => { const [c, r] = cellOf(x, y); return c < 0 || r < 0 || c >= NW || r >= NH ? 0 : nav[r * NW + c]; };
await sharp(Buffer.from(nav.map((v) => v * 100)), { raw: { width: NW, height: NH, channels: 1 } }).png({ compressionLevel: 9 }).toFile(join(OUT, 'nav.png'));
const wc = comps((s) => nav[s] === 1);
const compBox = (pt) => {
  const [c0, r0] = cellOf(pt[0], pt[1]), id = wc.lab[r0 * NW + c0]; if (id < 0) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let s = 0; s < nav.length; s++) if (wc.lab[s] === id) { const c = s % NW, r = (s / NW) | 0; x0 = Math.min(x0, NAV.x0 + c * C); x1 = Math.max(x1, NAV.x0 + (c + 1) * C); y1 = Math.max(y1, NAV.y1 - r * C); y0 = Math.min(y0, NAV.y1 - (r + 1) * C); }
  return { id, box: [x0, y0, x1, y1], cells: wc.size[id] };
};
const mainFloor = compBox(entities.player_spawn), throne = compBox(entities.player_spawn_boss);
const counts = [0, 0, 0]; for (const v of nav) counts[v]++;
console.log('nav', NW, 'x', NH, 'cells; blocked/floor/pit', counts.join('/'), '; main', mainFloor.box, 'throne', throne.box, mainFloor.id === throne.id ? 'CONNECTED' : 'separate');

// ---- distance from the arena (floor or pit cells) on a 64-unit lattice over the image's floor-plane rectangle
const D = 64, dx0 = st.X0, dy1 = st.Y0, DW = Math.ceil(IW / st.ppu / D) + 1, DH = Math.ceil(IH / st.ppu / SIN / D) + 1;
const dist = new Float32Array(DW * DH).fill(1e9);
for (let r = 0; r < DH; r++) for (let c = 0; c < DW; c++) if (navAt(dx0 + (c + 0.5) * D, dy1 - (r + 0.5) * D)) dist[r * DW + c] = 0;
const relax = (s, t, w) => { if (dist[t] + w < dist[s]) dist[s] = dist[t] + w; };
for (let r = 0; r < DH; r++) for (let c = 0; c < DW; c++) { const s = r * DW + c; if (c) relax(s, s - 1, D); if (r) { relax(s, s - DW, D); if (c) relax(s, s - DW - 1, D * 1.4142); if (c < DW - 1) relax(s, s - DW + 1, D * 1.4142); } }
for (let r = DH - 1; r >= 0; r--) for (let c = DW - 1; c >= 0; c--) { const s = r * DW + c; if (c < DW - 1) relax(s, s + 1, D); if (r < DH - 1) { relax(s, s + DW, D); if (c < DW - 1) relax(s, s + DW + 1, D * 1.4142); if (c) relax(s, s + DW - 1, D * 1.4142); } }
const distAt = (x, y) => { // bilinear
  const fx = (x - dx0) / D - 0.5, fy = (dy1 - y) / D - 0.5, c = Math.max(0, Math.min(DW - 2, Math.floor(fx))), r = Math.max(0, Math.min(DH - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - c)), ty = Math.max(0, Math.min(1, fy - r)), a = dist[r * DW + c], b = dist[r * DW + c + 1], e = dist[(r + 1) * DW + c], f = dist[(r + 1) * DW + c + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (e * (1 - tx) + f * tx) * ty;
};
const FADE0 = 1700, FADE1 = 2500;
const fadeAt = (X, Y) => { const d = distAt(st.X0 + X / st.ppu, st.Y0 - Y / st.ppu / SIN), t = Math.max(0, Math.min(1, (d - FADE0) / (FADE1 - FADE0))); return t * t * (3 - 2 * t); };

// ---- ground tiles: downscale, fade to the void colour (dark violet between the purple backdrop and the minimap's
// navy), WebP at the highest quality that fits the budget
const tiles = [];
for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
  const file = join(WORK, `ground/t_${c}_${r}.png`);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  const { data } = await sharp(file).resize(T, T, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const fade = new Float32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    fade[y * T + x] = fadeAt(c * T + x + 0.5, r * T + y + 0.5);
  }
  tiles.push({ c, r, data, fade });
}
const VOID = [0x11, 0x0d, 0x18];
const voidHex = '#' + VOID.map((v) => v.toString(16).padStart(2, '0')).join('');
for (const t of tiles) {
  let all = true;
  for (let i = 0; i < T * T; i++) { const f = t.fade[i]; if (f < 0.995) all = false; for (let ch = 0; ch < 3; ch++) t.data[i * 3 + ch] = Math.round(t.data[i * 3 + ch] * (1 - f) + VOID[ch] * f); }
  t.skip = all;
}
for (const f of readdirSync(OUT)) if (/^g_\d+_\d+\.webp$/.test(f)) rmSync(join(OUT, f));
let q = 80, encoded;
for (;;) {
  encoded = await Promise.all(tiles.filter((t) => !t.skip).map(async (t) => ({ t, buf: await sharp(t.data, { raw: { width: T, height: T, channels: 3 } }).webp({ quality: q, effort: 6 }).toBuffer() })));
  const total = encoded.reduce((a, e) => a + e.buf.length, 0);
  console.log(`tiles q${q}: ${encoded.length} tiles, ${total} bytes`);
  if (total <= BUDGET || q <= 50) break;
  q -= 2;
}
for (const { t, buf } of encoded) writeFileSync(join(OUT, `g_${t.c}_${t.r}.webp`), buf);
const tileGrid = [];
for (let r = 0; r < st.rows; r++) { const row = []; for (let c = 0; c < st.cols; c++) { const t = tiles.find((x) => x.c === c && x.r === r); row.push(t.skip ? null : `g_${c}_${r}.webp`); } tileGrid.push(row); }

// ---- sprite atlases: trim each frame (alpha bbox at ss×), downscale by ss, shelf-pack
async function atlas(items, file, maxW = 2048, quality = 85) {
  const out = [];
  for (const it of items) {
    const img = sharp(join(WORK, it.file)); const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = ss - 1; }
    x0 = Math.floor(x0 / ss) * ss; y0 = Math.floor(y0 / ss) * ss; x1 = Math.min(info.width, Math.ceil((x1 + 1) / ss) * ss); y1 = Math.min(info.height, Math.ceil((y1 + 1) / ss) * ss);
    const w = (x1 - x0) / ss, h = (y1 - y0) / ss;
    const buf = await sharp(join(WORK, it.file)).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    out.push({ ...it, buf, w, h, ax: r1((it.ax - x0) / ss), ay: r1((it.ay - y0) / ss) });
  }
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const o of [...out].sort((a, b) => b.h - a.h)) { if (x + o.w > maxW) { x = 0; y += rowH + 2; rowH = 0; } o.x = x; o.y = y; x += o.w + 2; rowH = Math.max(rowH, o.h); W = Math.max(W, x); }
  const H = y + rowH;
  const img = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(out.map((o) => ({ input: o.buf, left: o.x, top: o.y }))).webp({ quality, alphaQuality: 90, effort: 6 }).toBuffer();
  writeFileSync(join(OUT, file), img);
  console.log(`${file}: ${W}×${H}, ${img.length} bytes`);
  return { frames: out.map((o) => [o.x, o.y, o.w, o.h, o.ax, o.ay]), list: out, size: [W, H], bytes: img.length };
}
const pm = JSON.parse(readFileSync(join(WORK, 'props-meta.json'), 'utf8'));
const keys = Object.keys(pm.frames).sort();
const pa = await atlas(keys.map((key) => ({ key, ...pm.frames[key] })), 'props.webp');
const propModels = keys.map((key) => key.split('@')[0].replace(/^.*\//, ''));
const props = pm.instances.map((i) => ({ frame: keys.indexOf(i.key), x: i.origin[0], y: i.origin[1], z: i.origin[2], yaw: i.yaw, model: i.model }))
  .sort((a, b) => b.y - a.y || a.x - b.x);

const pl = JSON.parse(readFileSync(join(WORK, 'pillar-meta.json'), 'utf8'));
const pf = readdirSync(join(WORK, 'pillar')).filter((f) => /\.png$/.test(f)).sort();
// the collapse is over after ~4 s (the rest of anim0 is the rubble settling a few units): cut the death where the
// frame-to-frame change falls under 8 % of its peak; the game holds the last frame
const death = pf.filter((f) => f.startsWith('death_'));
let last = death.length - 1;
{
  const diffs = []; let prev = null;
  for (const f of death) {
    const b = await sharp(join(WORK, 'pillar', f)).raw().toBuffer();
    if (prev) { let n = 0; for (let i = 0; i < b.length; i += 4) if (Math.abs(b[i + 3] - prev[i + 3]) + Math.abs(b[i] - prev[i]) > 40) n++; diffs.push(n); }
    prev = b;
  }
  const early = diffs.slice(0, Math.ceil(diffs.length * 0.6)), peak = early.indexOf(Math.max(...early)); // the end of anim0 sinks the rubble: not part of the fall
  for (let i = peak; i < diffs.length; i++) if (diffs[i] < diffs[peak] * 0.08) { last = i + 1; break; }
}
const pillarItems = [...pf.filter((f) => f.startsWith('idle_')), ...death.slice(0, last + 1)].map((f) => ({ file: `pillar/${f}`, ax: pl.ax, ay: pl.ay }));
const pla = await atlas(pillarItems, 'pillar.webp', 2048, 72);
const nIdle = pf.filter((f) => f.startsWith('idle_')).length;

// ---- minimap: fit x' = bx + a·x, y' = by − a·y by matching the minimap's floor colour to nav's floor
const mm = await sharp(MINIMAP).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const MW = mm.info.width, mmFloor = new Uint8Array(MW * mm.info.height);
for (let i = 0; i < mmFloor.length; i++) { const R = mm.data[i * 3], Gc = mm.data[i * 3 + 1], B = mm.data[i * 3 + 2]; mmFloor[i] = R > 150 && Gc > 100 && R - B > 30 ? 1 : 0; }
const score = (a, bx, by, step = 2) => {
  let s = 0, n = 0;
  for (let r = 0; r < NH; r += step) for (let c = 0; c < NW; c += step) {
    const x = NAV.x0 + (c + 0.5) * C, y = NAV.y1 - (r + 0.5) * C, px = Math.round(bx + a * x), py = Math.round(by - a * y);
    if (px < 0 || py < 0 || px >= MW || py >= mm.info.height) continue;
    const v = nav[r * NW + c] === 1 ? 1 : 0; s += v === mmFloor[py * MW + px] ? 1 : 0; n++;
  }
  return s / n;
};
let best = { a: 0.026, bx: 600, by: 600, s: 0 };
for (let a = 0.022; a <= 0.032; a += 0.0005) for (let bx = 520; bx <= 680; bx += 4) for (let by = 480; by <= 720; by += 4) { const s = score(a, bx, by, 6); if (s > best.s) best = { a, bx, by, s }; }
for (const [da, db] of [[0.0001, 1], [0.00002, 0.25]]) {
  const b0 = { ...best };
  for (let a = b0.a - da * 5; a <= b0.a + da * 5; a += da) for (let bx = b0.bx - db * 6; bx <= b0.bx + db * 6; bx += db) for (let by = b0.by - db * 6; by <= b0.by + db * 6; by += db) { const s = score(a, bx, by, 2); if (s > best.s) best = { a, bx, by, s }; }
}
const minimap = { size: [MW, mm.info.height], scale: +best.a.toFixed(6), offset: [+best.bx.toFixed(2), +best.by.toFixed(2)],
  formula: 'px = offset[0] + scale·x, py = offset[1] − scale·y', agreement: +best.s.toFixed(4),
  checks: Object.fromEntries(Object.entries({ player_spawn: entities.player_spawn, player_spawn_boss: entities.player_spawn_boss, boss_spawn: entities.boss_spawn }).map(([k, v]) => [k, [r1(best.bx + best.a * v[0]), r1(best.by - best.a * v[1])]])) };
console.log('minimap', JSON.stringify(minimap));

// ---- map.json
const map = {
  about: 'survivors_arena (Valve) rendered by scripts/thorns-scene/map; world units, Dota axes (x east, y north, z up)',
  camera: { projection: 'orthographic', pitch: 45, yaw: 90, note: 'looking north, 45° down (survivors_camera angles 45 90 0, made orthographic)', formula: 'X = (x − X0)·ppu, Y = (Y0 − y)·ppu·sin45 − (z − Z0)·ppu·cos45', valveCamera: camEnt ? { origin: vec(camEnt.origin), angles: vec(camEnt.angles), fov: +camEnt.fov || 20 } : null },
  ppu: st.ppu, pitch: 45, X0: st.X0, Y0: st.Y0, Z0: st.Z0, tile: T, cols: st.cols, rows: st.rows, width: IW, height: IH,
  tiles: tileGrid, void: voidHex, webpQuality: q,
  nav: { file: 'nav.png', cell: C, w: NW, h: NH, x0: NAV.x0, y0: NAV.y1, corner: 'north-west: pixel (c, r) covers x ∈ [x0 + c·cell, x0 + (c+1)·cell], y ∈ [y0 − (r+1)·cell, y0 − r·cell]', values: { 0: 'blocked', 1: 'floor', 2: 'pit / void inside the arena (flyers only)' }, encoding: 'grey PNG, R = value × 100' },
  props: { file: 'props.webp', ppu: st.propsPpu, size: pa.size, models: propModels, frames: pa.frames, frameKeys: keys,
    note: 'frame [x, y, w, h, ax, ay] in props.webp at props.ppu; draw a prop with (ax, ay) on the screen point of its (x, y, z); y-sort by y. Valve fades the *_fadeout wall columns when they hide units.',
    instances: props.map((p) => [p.frame, p.x, p.y, p.z, p.yaw]), instanceFormat: '[frame, x, y, z, yaw]' },
  pillar: { file: 'pillar.webp', ppu: st.pillarPpu, size: pla.size, model: 'models/events/crownfall/survivors/breakable/cf_palace_new_column_large_a_breakable.vmdl', yaw: 135, collisionRadius: 125,
    frames: pla.frames, idle: [0, nIdle], death: { from: nIdle, count: pla.frames.length - nIdle, fps: pl.seq.death.fps, clip: pl.seq.death.clip, loop: false },
    note: 'frame [x, y, w, h, ax, ay]; anchor = the pillar origin (z = 482 in the map); four ACT_DOTA_DIE variants exist, anim0 is used' },
  entities,
  bounds: { mainFloor: { box: mainFloor.box, cells: mainFloor.cells }, throneRoom: { box: throne.box, cells: throne.cells }, boxFormat: '[x0, y0, x1, y1]',
    throneConnected: mainFloor.id === throne.id, gridnavWalkable: { main: 'bit 0x40', throne: 'bit 0x08' } },
  minimap,
};
// short number arrays on one line
writeFileSync(join(OUT, 'map.json'), JSON.stringify(map, (k, v) => (Array.isArray(v) && v.length <= 6 && v.every((x) => typeof x === 'number') ? `@@${JSON.stringify(v)}@@` : v), 1).replace(/"@@(.*?)@@"/g, '$1') + '\n');
const total = readdirSync(OUT).reduce((a, f) => a + statSync(join(OUT, f)).size, 0);
console.log('map.json written; total', total, 'bytes in', OUT);

// ---- review pictures
if (REVIEW) {
  const sc = 0.25, cw = Math.round(IW * sc), ch = Math.round(IH * sc);
  const cv = createCanvas(cw, ch), g = cv.getContext('2d');
  g.fillStyle = voidHex; g.fillRect(0, 0, cw, ch);
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) if (tileGrid[r][c]) g.drawImage(await loadImage(readFileSync(join(OUT, tileGrid[r][c]))), c * T * sc, r * T * sc, T * sc, T * sc);
  const P = (x, y, z = st.Z0) => [(x - st.X0) * st.ppu * sc, ((st.Y0 - y) * SIN - (z - st.Z0) * SIN) * st.ppu * sc];
  const propImg = await loadImage(readFileSync(join(OUT, 'props.webp'))), pillImg = await loadImage(readFileSync(join(OUT, 'pillar.webp')));
  const k2 = st.ppu / st.propsPpu * sc;
  const drawSprites = () => {
    const list = props.map((p) => ({ ...p, img: propImg, f: pa.frames[p.frame] }))
      .concat(entities.destructible_boss_tower.map(([x, y, z]) => ({ x, y, z, img: pillImg, f: pla.frames[0], k: st.ppu / st.pillarPpu * sc })));
    for (const p of list.sort((a, b) => b.y - a.y)) { const [X, Y] = P(p.x, p.y, p.z), [fx, fy, fw, fh, ax, ay] = p.f; const kk = p.k || k2; g.drawImage(p.img, fx, fy, fw, fh, X - ax * kk, Y - ay * kk, fw * kk, fh * kk); }
  };
  const marks = () => {
    const dot = (pts, color, rad = 5) => { g.fillStyle = color; g.strokeStyle = '#000'; for (const p of pts) { const [X, Y] = P(p[0], p[1], p[2]); g.beginPath(); g.arc(X, Y, rad, 0, 7); g.fill(); g.stroke(); } };
    dot([entities.player_spawn, entities.player_spawn_boss], '#00ff66', 8); dot([entities.boss_spawn, entities.boss_radiating_rays_teleport], '#ff00ff', 8);
    dot(entities.destructible_spawn_vase, '#ffd000'); dot(entities.destructible_spawn_box, '#ff8000'); dot(entities.destructible_spawn_vase_boss, '#ffff80');
    dot(entities.destructible_boss_tower, '#ff3030', 7); dot(entities.destructible_lock, '#00e0ff', 8); dot(entities.boss_demon_portal_spawn, '#a040ff', 6);
    dot(entities.elite_room, '#ffffff', 7); dot([...entities.item_drop_1, ...entities.item_drop_2, ...entities.item_drop_3], '#40a0ff', 4);
  };
  drawSprites(); marks();
  writeFileSync(join(REVIEW, 'overview.png'), cv.toBuffer('image/png'));
  // nav overlay on the floor plane: blocked red, pit blue, floor (only its cells' outlines are implied) green
  g.globalAlpha = 0.38;
  for (let r = 0; r < NH; r++) for (let c = 0; c < NW; c++) {
    const v = nav[r * NW + c], x = NAV.x0 + c * C, y = NAV.y1 - r * C;
    if (v === 0 && distAt(x, y) > 600) continue;
    g.fillStyle = v === 1 ? '#30ff60' : v === 2 ? '#3060ff' : '#ff2020';
    const [X, Y] = P(x, y), [X2, Y2] = P(x + C, y - C); g.fillRect(X, Y, X2 - X + 0.3, Y2 - Y + 0.3);
  }
  g.globalAlpha = 1; marks();
  writeFileSync(join(REVIEW, 'overview-nav.png'), cv.toBuffer('image/png'));
  // minimap with nav floor outline mapped through the fit
  const mc = createCanvas(MW, mm.info.height), m = mc.getContext('2d');
  m.drawImage(await loadImage(readFileSync(MINIMAP)), 0, 0);
  m.globalAlpha = 0.5;
  for (let r = 0; r < NH; r += 2) for (let c = 0; c < NW; c += 2) { const v = nav[r * NW + c]; if (!v) continue; m.fillStyle = v === 1 ? '#00ff00' : '#0040ff'; const x = NAV.x0 + c * C, y = NAV.y1 - r * C; m.fillRect(best.bx + best.a * x, best.by - best.a * y, best.a * C * 2 + 0.2, best.a * C * 2 + 0.2); }
  m.globalAlpha = 1; m.fillStyle = '#ff0000';
  for (const p of [...props.filter((p) => /w_brazier/.test(p.model)).map((p) => [p.x, p.y]), entities.player_spawn, entities.player_spawn_boss]) { m.beginPath(); m.arc(best.bx + best.a * p[0], best.by - best.a * p[1], 3, 0, 7); m.fill(); }
  writeFileSync(join(REVIEW, 'minimap-fit.png'), mc.toBuffer('image/png'));
  console.log('review:', REVIEW);
}
