#!/usr/bin/env node
// «Рыбалка»: renders the lake scene from Valve's files into assets/minigames/fishing/scene/
// (docs/minigames.md, «Рыбалка»). Offline, with three.js in a headless Chromium (Playwright):
//   1. views: the map fishing_game_act1 (Source 2 Viewer → glb with materials; the map vpk plus the pak01
//      files it references) from the game's three point_cameras — side_character_camera (the menu),
//      overhead_camera (casting and reeling), centered_overhead_camera (the catch) — without the heroes;
//      the water is left out and drawn by the game (scene.js) over a painted lake;
//   2. heroes: Vengeful Spirit in the arcana (Sovereigns of Skywrath set) with the fishing rod and the
//      arcana model's fishing animations, Tidehunter, frame by frame from the same cameras (dota-loadout's
//      viewer, its hero shader); the rod's tip per frame for the line;
//   3. props: the eight fish of reef_fish_flat, the shoe, the stick, the bobber;
//   4. pack.mjs: WebP, sprite sheets, scene.json.
//
//   node scripts/fishing-scene/make.mjs --map <dir with fishing_game_act1.glb> --models <dir> --arcana <glb>
//     --loadout <dota-loadout dir> --work <dir> [--playwright <path>] [--only views,heroes,props,pack]
//
// --models: the props exported by Source 2 Viewer (reef_fish_flat.glb, fishing_debris_*.glb,
// crownfall_fishing_bobber.glb); --arcana: models/items/vengefulspirit/vengeful_spirit_arcana/
// vengeful_spirit_arcana.vmdl_c exported with --gltf_export_animations (only its fishing clips are used),
// with pole.glb beside it: models/events/crownfall/fishing_pole/crownfall_fishing_pole_vengeful.vmdl_c exported
// the same way (the rod's bones in the same animations). PRE='window.ONLY_NAMES=[…]' renders some sheets only.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const MAP = resolve(opt('map', '')), MODELS = resolve(opt('models', '')), ARCANA = resolve(opt('arcana', '')), LOADOUT = resolve(opt('loadout', '/home/code/dota-loadout')), WORK = resolve(opt('work', 'fishing-scene-work'));
const ONLY = opt('only', 'views,heroes,props,pack').split(',');
const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
for (const dir of ['views', 'sp', 'props']) mkdirSync(join(WORK, dir), { recursive: true });

const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/map/': `${MAP}/`, '/models/': `${MODELS}/`, '/arcana/': `${dirname(ARCANA)}/`, '/hero/': `${LOADOUT}/` };
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2' };
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

// Runs page scripts in render.html / hero.html; saves the data: URLs they return, returns the rest.
async function run(pageFile, scripts) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`${origin}/tool/${pageFile}`); await page.waitForFunction(() => window.ready);
  const code = scripts.map((s) => (s.endsWith('.js') ? readFileSync(join(HERE, s), 'utf8') : s)).join('\n');
  const out = await page.evaluate(`(async () => { ${code} })()`);
  await page.close();
  const rest = {};
  for (const [name, value] of Object.entries(out || {})) {
    if (typeof value === 'string' && value.startsWith('data:')) writeFileSync(join(WORK, name), Buffer.from(value.split(',')[1], 'base64'));
    else rest[name] = value;
  }
  return rest;
}

if (ONLY.includes('views')) {
  console.log('views');
  writeFileSync(join(WORK, 'views-meta.json'), JSON.stringify(await run('render.html', ['lib.js', 'views.js']), null, 1));
}
if (ONLY.includes('heroes')) {
  for (const job of (process.env.JOBS || 'jobs-venge.js,jobs-tide.js').split(',')) {
    console.log('heroes:', job);
    const meta = await run('hero.html', [process.env.PRE || '', job, 'lib-hero.js', 'heroes.js']);
    // A run of some sheets only (window.ONLY_NAMES) keeps the others' metadata.
    const file = join(WORK, `meta-${job.replace(/\.js$/, '')}.json`), before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    writeFileSync(file, JSON.stringify({ ...before, ...meta }, null, 1));
  }
}
if (ONLY.includes('props')) {
  console.log('props');
  writeFileSync(join(WORK, 'props-meta.json'), JSON.stringify(await run('render.html', ['lib.js', 'props.js']), null, 1));
}
await browser.close(); server.close();
if (ONLY.includes('pack')) execFileSync(process.execPath, [join(HERE, 'pack.mjs')], { cwd: WORK, stdio: 'inherit' });
