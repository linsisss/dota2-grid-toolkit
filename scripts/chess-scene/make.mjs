#!/usr/bin/env node
// «Драконьи шахматы»: renders Valve's 3D pieces of Crownfall's match3 into sprites for the board and the
// opponent's stage, assets/minigames/chess/sprites/. Offline, with three.js in a headless Chromium (Playwright).
//   gems       gems.webp (6 heroes × plain / super / ultra) and fragments.webp (the shattered gem) — gems.js
//   opponents  <opponent>.webp strips (idle, attack, hit, death…) — opponents.js (creeps, pets, the frost dragon:
//              Source 2 Viewer glb) and heroes.js (Chaos Knight, Ancient Apparition, Drow Ranger: dota-loadout's
//              viewer with Valve's hero shader and the vdata's items)
// sprites.json lists cells, frames and anchors.
//   node scripts/chess-scene/make.mjs [--models <glb dir>] [--cubes <dir of the gem cube-map PNGs>] [--loadout <dota-loadout>]
//     [--work <dir>] [--playwright <playwright/index.mjs>] [--only gems,opponents] [--units a,b]
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { OPPONENTS } from './opponents.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const SCRATCH = '/tmp/claude-0/-home-code-gridstudio/393fe78e-42d4-4fe6-823d-d9629de18d4f/scratchpad';
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const MODELS = resolve(opt('models', `${SCRATCH}/minigames/raw5/match3/export/models`));
const CUBES = resolve(opt('cubes', `${SCRATCH}/chess/cubes`));
const LOADOUT = resolve(opt('loadout', '/home/code/dota-loadout'));
const WORK = resolve(opt('work', join(tmpdir(), 'chess-scene-work')));
const ONLY = opt('only', 'gems,opponents').split(',');
const UNITS = opt('units', '') ? opt('units', '').split(',') : null;
const OUT = join(ROOT, 'assets/minigames/chess/sprites');
const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
for (const dir of [WORK, OUT]) mkdirSync(dir, { recursive: true });

// The gems in the order of crownfall_act3's m_vecHeroes; the cube maps are the gems' g_tCubeMapExterior
// (decoded by Source 2 Viewer; Winter Wyvern's was not exported, a glow of its tint stands in).
const HEROES = [
  { key: 'lina', gem: 'gem_lina', cube: 'match3_gem_lina_cube_psd_7f811070_dn.png' },
  { key: 'broodmother', gem: 'gem_broodmother', cube: 'match3_gem_broodmother_cube_psd_1e66e93c_dn.png' },
  { key: 'crystal_maiden', gem: 'gem_crystalmaiden', cube: 'match3_gem_cm_cube_psd_be596738_dn.png' },
  { key: 'lich', gem: 'gem_lich', cube: 'match3_gem_lich_cube_psd_52b3c66b_dn.png' },
  { key: 'vengefulspirit', gem: 'gem_venge', cube: 'match3_gem_venge_cube_psd_9620221d_dn.png' },
  { key: 'winter_wyvern', gem: 'gem_wyvern', cube: 'wyvern_glow.png' },
];
if (!existsSync(join(CUBES, 'wyvern_glow.png'))) {
  mkdirSync(CUBES, { recursive: true });
  const c = createCanvas(256, 256), x = c.getContext('2d'), g = x.createRadialGradient(128, 118, 4, 128, 118, 140);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, '#c8f6ff'); g.addColorStop(0.55, '#3d8fa8'); g.addColorStop(1, '#0d2836');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); writeFileSync(join(CUBES, 'wyvern_glow.png'), c.toBuffer('image/png'));
}

const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/models/': `${MODELS}/`, '/cubes/': `${CUBES}/`, '/hero/': `${LOADOUT}/` };
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  for (const [prefix, dir] of Object.entries(roots)) if (url.startsWith(prefix)) {
    const file = join(dir, url.slice(prefix.length));
    if (existsSync(file) && statSync(file).isFile()) { res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; }
  }
  res.writeHead(404); res.end();
}).listen(0, '127.0.0.1');
await new Promise((done) => server.once('listening', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function run(html, job, scripts) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page]', e.message)); page.on('console', (m) => console.log('[page]', m.text()));
  await page.goto(`${origin}/tool/${html}`); await page.waitForFunction(() => window.ready);
  const code = scripts.map((s) => readFileSync(join(HERE, s), 'utf8')).join('\n');
  const out = await page.evaluate(`(async () => { window.JOB = ${JSON.stringify(job)}; ${code} })()`);
  await page.close();
  return out;
}
const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
const webp = (input, output, quality = 82) => { execFileSync('cwebp', ['-quiet', '-q', String(quality), '-alpha_q', '90', '-m', '6', '-sharp_yuv', input, '-o', output]); return statSync(output).size; };

const spritesFile = join(OUT, 'sprites.json');
const sprites = existsSync(spritesFile) ? JSON.parse(readFileSync(spritesFile, 'utf8')) : { version: 1, opponents: {} };

if (ONLY.includes('gems')) {
  const out = await run('page.html', { cell: 128, frag: 48, heroes: HEROES }, ['gems.js']);
  writeFileSync(join(WORK, 'gems.png'), png(out['gems.png'])); writeFileSync(join(WORK, 'fragments.png'), png(out['fragments.png']));
  const a = webp(join(WORK, 'gems.png'), join(OUT, 'gems.webp'), 88), b = webp(join(WORK, 'fragments.png'), join(OUT, 'fragments.webp'), 85);
  sprites.gems = { file: 'gems.webp', cell: out.meta.cell, heroes: HEROES.map((h) => h.key), kinds: ['normal', 'super', 'ultra'], tints: out.meta.tints };
  sprites.fragments = { file: 'fragments.webp', cell: out.meta.frag, offsets: out.meta.fragments };
  console.log(`gems ${a >> 10} KB, fragments ${b >> 10} KB`);
}

if (ONLY.includes('opponents')) {
  for (const o of OPPONENTS.filter((x) => !UNITS || UNITS.includes(x.name))) {
    console.log('opponent:', o.name);
    const out = o.hero ? await run('hero.html', o, ['../race-scene/hlib.js', 'heroes.js']) : await run('page.html', o, ['opponents.js']);
    if (out?.anims) console.log('  clips in the model:', out.anims.join(' '));
    if (!out) { console.log('  failed'); continue; }
    // one strip: every clip's frames side by side, rows per clip, trimmed to the union of the frames
    const frames = {};
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const [clip, list] of Object.entries(out.clips)) {
      frames[clip] = [];
      for (const url of list) {
        const im = await loadImage(png(url)); const c = createCanvas(im.width, im.height), cx = c.getContext('2d'); cx.drawImage(im, 0, 0);
        const d = cx.getImageData(0, 0, im.width, im.height).data;
        for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (d[(y * im.width + x) * 4 + 3] > 3) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        frames[clip].push(c);
      }
    }
    const PAD = 2; x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 += PAD; y1 += PAD;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, perRow = Math.max(...Object.values(frames).map((l) => l.length));
    const clipNames = Object.keys(frames);
    const atlas = createCanvas(w * perRow, h * clipNames.length), ax = atlas.getContext('2d');
    const clips = {};
    clipNames.forEach((clip, row) => { frames[clip].forEach((c, i) => ax.drawImage(c, x0, y0, w, h, i * w, row * h, w, h)); clips[clip] = { row, frames: frames[clip].length, fps: out.fps[clip], loop: out.loop[clip] }; });
    writeFileSync(join(WORK, `${o.name}.png`), atlas.toBuffer('image/png'));
    const bytes = webp(join(WORK, `${o.name}.png`), join(OUT, `${o.name}.webp`), o.quality || 70);
    sprites.opponents[o.name] = { file: `${o.name}.webp`, size: [w, h], anchor: [+(out.anchor[0] - x0).toFixed(1), +(out.anchor[1] - y0).toFixed(1)], scale: o.display || 1, ...(o.fog ? { fog: o.fog } : {}), ...(o.portrait ? { portrait: o.portrait } : {}), clips };
    console.log(`  ${w}×${h}, ${Object.entries(clips).map(([k, v]) => `${k}:${v.frames}`).join(' ')}, ${bytes >> 10} KB`);
  }
}
// Portraits for the setup screen's campaign list: a square around the head of each idle strip's first frame,
// 64 px, one atlas (so the list does not load the strips).
if (ONLY.includes('opponents') || ONLY.includes('portraits')) {
  const names = Object.keys(sprites.opponents).filter((name) => existsSync(join(WORK, `${name}.png`)));
  const P = 64, atlas = createCanvas(P * names.length, P), ax = atlas.getContext('2d');
  for (const [i, name] of names.entries()) {
    const meta = sprites.opponents[name], im = await loadImage(join(WORK, `${name}.png`));
    const [w, h] = meta.size, row = meta.clips.idle.row;
    const c = createCanvas(w, h), cx = c.getContext('2d'); cx.drawImage(im, 0, row * h, w, h, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data; let top = 0;
    find: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { top = y; break find; }
    const side = Math.min(w, Math.round((meta.anchor[1] - top) * (meta.portrait ?? 0.55)));
    let x0 = Math.round(meta.anchor[0] - side / 2);
    // centre on the opaque pixels of that band
    let sx = 0, n = 0; for (let y = top; y < top + side; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { sx += x; n++; }
    if (n) x0 = Math.round(sx / n - side / 2);
    ax.drawImage(c, Math.max(0, x0), Math.max(0, top - side * 0.06), side, side, i * P, 0, P, P);
    meta.portraitIndex = i;
  }
  writeFileSync(join(WORK, 'portraits.png'), atlas.toBuffer('image/png'));
  const bytes = webp(join(WORK, 'portraits.png'), join(OUT, 'portraits.webp'), 82);
  sprites.portraits = { file: 'portraits.webp', size: P };
  console.log(`portraits: ${names.length}, ${bytes >> 10} KB`);
}
writeFileSync(spritesFile, JSON.stringify(sprites, null, 1));
await browser.close(); server.close();
