#!/usr/bin/env node
// «Терновый трон»: renders the arena map survivors_arena from Valve's files into assets/minigames/thorns/map/
// (docs/minigames.md, «Терновый трон»). Offline, with three.js in a headless Chromium (Playwright).
// One orthographic camera for everything, the game's survivors_camera turned orthographic: looking north (+y),
// 45° down, screen right = +x; a world point (x, y, z) lands at image px
//   X = (x − X0)·ppu,  Y = (Y0 − y)·ppu·sin45 − (z − Z0)·ppu·cos45      (map.json: ppu, X0, Y0, Z0)
//   1. ground: the world (Source 2 Viewer → glb with materials: the map vpk plus the pak01 files it references)
//      without the tall props, the game's destructibles, the wildlife and the effects, lit like Valve's day
//      (env 1 of crownfall_act4: warm key from vdata's light direction, ambient, shadow maps), in 1024-px
//      tiles at 2× (ground.js → WORK/ground/t_<col>_<row>.png);
//   2. props: one frame per distinct tall model (columns with braziers, braziers, statues, topiary, trees),
//      same camera (props.js), and their instances from the glb nodes;
//   3. pillar: the boss tower cf_palace_new_column_large_a_breakable, idle and its break animation (pillar.js);
//   4. nav: a height/coverage render from straight above (nav.js) → walkability grid, 32 units a cell;
//   5. pack.mjs: grade, void fade, WebP tiles, props atlas, nav.png, map.json.
//
//   node scripts/thorns-scene/map/make.mjs --world <world.glb> --pillar <pillar.glb> --ents <default_ents.vents>
//     --gnv <survivors_arena.gnv> --work <dir> [--review <dir>] [--playwright <path>] [--ppu 0.25] [--props-ppu 0.4] [--pillar-ppu 0.32] [--only ground,props,pillar,nav,pack]
//     [--eval <page script>]      (env TILES="c,r;c,r" renders some tiles only, PREVIEW=<ppu> one small picture)
//
// --world: Source2Viewer-CLI -i survivors_arena.vpk -f maps/scenes/crownfall/survivors_arena/world.vwrld_c -o <dir>
//   -d --gltf_export_format glb --gltf_export_materials --gltf_textures_adapt --gltf_export_extras
//   --game <root>/dota/gameinfo.gi, where <root>/dota merges the map vpk's folder and the pak01 files it references
//   (the CLI adds <root>/dota and <root>/core as search paths, so the folder must be called «dota»);
// --pillar: models/events/crownfall/survivors/breakable/cf_palace_new_column_large_a_breakable.vmdl_c exported the
//   same way with --gltf_export_animations; --ents: the map's entities decompiled (default_ents.vents, Source 2 Viewer's
//   text dump); --gnv: maps/scenes/crownfall/survivors_arena.gnv from the map vpk (Valve's gridnav).
// --eval runs one page script (with lib.js; it defines async function main()) and prints what main returns.
// Page scripts are function declarations so that node --check can parse them.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../../..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const WORLD = resolve(opt('world', '')), PILLAR = resolve(opt('pillar', '')), ENTS = resolve(opt('ents', '')), GNV = resolve(opt('gnv', '')), WORK = resolve(opt('work', 'thorns-map-work'));
const REVIEW = opt('review', ''), EVAL = opt('eval', '');
const ONLY = (EVAL ? '' : opt('only', 'ground,props,pillar,nav,pack')).split(',');
for (const dir of ['ground', 'props', 'pillar', 'nav']) mkdirSync(join(WORK, dir), { recursive: true });

// The scene settings shared by every stage (also read by pack.mjs from WORK/setup.json). The ground image covers
// the walkable area (gridnav: x −11 072…10 688, y −13 248…11 264) plus ~2 400 units around it on the floor plane
// z = Z0, centred, in whole tiles; X0, Y0 = the world point at its top-left on that plane.
const BOUNDS = { x0: -13472, x1: 13088, y0: -15648, y1: 13264 };
// The walkability grid: walkable area + 448…576 units, on the gridnav's 64-unit lattice; 32-unit cells; the height
// render under it at 8 units a pixel.
export const NAV = { x0: -11584, x1: 11200, y0: -13696, y1: 11712, cell: 32, res: 8 };
export const SETUP = { ppu: +opt('ppu', 0.25), propsPpu: +opt('props-ppu', 0.4), pillarPpu: +opt('pillar-ppu', 0.32), pitch: 45, tile: 1024, ss: 2, Z0: 512 };
{
  const { ppu, tile } = SETUP, s = Math.SQRT1_2;
  SETUP.cols = Math.ceil((BOUNDS.x1 - BOUNDS.x0) * ppu / tile);
  SETUP.rows = Math.ceil((BOUNDS.y1 - BOUNDS.y0) * ppu * s / tile);
  SETUP.X0 = Math.round((BOUNDS.x0 + BOUNDS.x1) / 2 - SETUP.cols * tile / ppu / 2);
  SETUP.Y0 = Math.round((BOUNDS.y0 + BOUNDS.y1) / 2 + SETUP.rows * tile / ppu / s / 2);
}
writeFileSync(join(WORK, 'setup.json'), JSON.stringify({ ...SETUP, nav: NAV }, null, 1));

const needBrowser = EVAL || ONLY.some((s) => ['ground', 'props', 'pillar', 'nav'].includes(s));
let browser, server, origin;
if (needBrowser) {
  const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
  const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/world/': `${dirname(WORLD)}/`, '/pillar/': `${dirname(PILLAR)}/` };
  const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg' };
  server = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    for (const [prefix, dir] of Object.entries(roots)) if (url.startsWith(prefix)) {
      const file = join(dir, url.slice(prefix.length));
      if (existsSync(file) && statSync(file).isFile()) { res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res); return; }
    }
    res.writeHead(404); res.end();
  }).listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=16000'] });
}

// Runs lib.js + a page script in render.html with window.JOB; saves the data: URLs it returns (keys = paths in
// WORK), returns the rest. Page scripts may also call window.save(path, dataURL) to write as they go.
async function run(script, job = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => { if (!/GPU stall|GL Driver|THREE.WebGLRenderer: Context/.test(m.text())) console.log('[page]', m.text().slice(0, 400)); });
  await page.exposeFunction('save', (name, value) => { mkdirSync(dirname(join(WORK, name)), { recursive: true }); writeFileSync(join(WORK, name), Buffer.from(value.split(',')[1], 'base64')); });
  await page.goto(`${origin}/tool/render.html`); await page.waitForFunction(() => window.ready);
  const code = ['lib.js', script].map((s) => readFileSync(s.includes('/') ? s : join(HERE, s), 'utf8')).join('\n');
  const out = await page.evaluate(`(async () => { window.JOB = ${JSON.stringify({ ...job, setup: SETUP })}; ${code}\n return main(); })()`);
  await page.close();
  const rest = {};
  for (const [name, value] of Object.entries(out || {})) {
    if (typeof value === 'string' && value.startsWith('data:')) { mkdirSync(dirname(join(WORK, name)), { recursive: true }); writeFileSync(join(WORK, name), Buffer.from(value.split(',')[1], 'base64')); }
    else rest[name] = value;
  }
  return rest;
}

const world = `/world/${basename(WORLD)}`, pillar = `/pillar/${basename(PILLAR)}`;
if (EVAL) console.log(JSON.stringify(await run(resolve(EVAL), { world, pillar, args }), null, 1));
if (ONLY.includes('ground')) {
  console.log('ground');
  writeFileSync(join(WORK, 'ground-meta.json'), JSON.stringify(await run('ground.js', { world, only: process.env.TILES || '', preview: +(process.env.PREVIEW || 0) }), null, 1));
}
if (ONLY.includes('props')) {
  console.log('props');
  writeFileSync(join(WORK, 'props-meta.json'), JSON.stringify(await run('props.js', { world, ppu: SETUP.propsPpu }), null, 1));
}
if (ONLY.includes('pillar')) {
  console.log('pillar');
  writeFileSync(join(WORK, 'pillar-meta.json'), JSON.stringify(await run('pillar.js', { pillar, ppu: SETUP.pillarPpu, fps: 8, clip: 'anim0' }), null, 1));
}
if (ONLY.includes('nav')) {
  console.log('nav');
  writeFileSync(join(WORK, 'nav-meta.json'), JSON.stringify(await run('nav.js', { world, nav: NAV }), null, 1));
}
if (browser) { await browser.close(); server.close(); }
if (ONLY.includes('pack')) execFileSync(process.execPath, [join(HERE, 'pack.mjs'), '--work', WORK, '--ents', ENTS, '--gnv', GNV, ...(REVIEW ? ['--review', REVIEW] : [])], { stdio: 'inherit' });
