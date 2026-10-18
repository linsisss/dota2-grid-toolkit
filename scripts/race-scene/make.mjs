#!/usr/bin/env node
// «Крылатые гонки»: renders the race's scene from Valve's files into assets/minigames/race/scene/
// (docs/minigames.md, «Крылатые гонки»). Offline, with three.js in a headless Chromium (Playwright):
//   1. the canyon: the scene maps flappy_skywrath_act2 / _loop / _bg, exported by Source 2 Viewer to glb
//      with their materials (the map vpks plus the pak01 files they reference), rendered from the ring's
//      centre as a cylindrical panorama in 64-px slices (back layer, and the ground tiles in front);
//   2. the rocks: stalagmite_cavern_02_no_shadows and journey_stoneforest01, four turns of each;
//   3. the heroes: Skywrath Mage in the Dragonus set and Batrider, with dota-loadout's viewer (glTF of
//      the game's models and animations), frame by frame;
//   4. pack.mjs: grade, WebP, outlines of the rocks for the collisions, scene.json.
//
//   node scripts/race-scene/make.mjs --maps <dir> --models <dir> --loadout <dota-loadout dir> --work <dir>
//     [--playwright <path to playwright>] [--only pano,obstacles,heroes,pack]
//
// --maps: flappy_skywrath_act2{,_loop,_bg}.glb with textures (Source2Viewer-CLI -i <map>.vpk -d
// --gltf_export_format glb --gltf_export_materials --game <dir with the referenced pak01 files>/gameinfo.gi);
// --models: the two rock glbs exported the same way.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const MAPS = resolve(opt('maps', '')), MODELS = resolve(opt('models', '')), LOADOUT = resolve(opt('loadout', '/home/code/dota-loadout')), WORK = resolve(opt('work', 'race-scene-work'));
const ONLY = (opt('only', 'pano,obstacles,heroes,pack')).split(',');
const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
for (const dir of ['pano', 'ob', 'sp']) mkdirSync(join(WORK, dir), { recursive: true });

const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/maps/': `${MAPS}/`, '/models/': `${MODELS}/`, '/hero/': `${LOADOUT}/` };
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' };
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

const LIGHT = 'window.RAYS = 0.12; window.GROUND_DZ = -230;';
if (ONLY.includes('pano')) {
  console.log('panorama: race');
  await run('render.html', [`${LIGHT} window.PANO = { map: 'flappy_skywrath_act2', ents: 'ground-ents.json', hide: 'journey_stoneforest01|stalagmite_cavern|black_gradient_trans', a0: 376, width: 17608, f: 3911.4, ss: 2, out: 'pano/race' };`, 'lib.js', 'pano.js']);
  console.log('panorama: loop');
  await run('render.html', [`${LIGHT} window.PANO = { map: 'flappy_skywrath_act2_loop', ents: 'loop-ents.json', hide: 'journey_stoneforest01|stalagmite_cavern|banner_dire|bannerbase_dire|black_gradient_trans', a0: 376, width: 24576, f: 3911.4, ss: 2, out: 'pano/loop' };`, 'lib.js', 'pano.js']);
}
if (ONLY.includes('obstacles')) {
  console.log('rocks');
  writeFileSync(join(WORK, 'ob-meta.json'), JSON.stringify(await run('render.html', ['window.OBA = 200;', 'lib.js', 'obst.js'])));
}
if (ONLY.includes('heroes')) {
  for (const who of ['sky', 'bat']) {
    console.log('hero:', who);
    const meta = await run('hero.html', [`jobs-${who}.js`, 'hlib.js', 'hsheet.js']);
    writeFileSync(join(WORK, `meta-${who}.txt`), Object.entries(meta).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join('\n'));
  }
}
await browser.close(); server.close();
if (ONLY.includes('pack')) execFileSync(process.execPath, [join(HERE, 'pack.mjs')], { cwd: WORK, stdio: 'inherit' });
