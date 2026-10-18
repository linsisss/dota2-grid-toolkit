#!/usr/bin/env node
// «Сосулечный боец»: renders the tavern stage from Valve's scene maps into assets/minigames/fighter/images/stage/
// (docs/minigames.md, «Сосулечный боец»). Offline, three.js in a headless Chromium (Playwright), stage.js:
//   background.webp — maps/scenes/crownfall/arena from its point_camera cam_main (horizontal fov 38° over the
//     1920 px of the game's panel), 240 px wider on each side: the game pans it a little with the fight;
//   foreground.webp — maps/scenes/crownfall/arena_fg (the beam frame in front of the stage) from the same camera,
//     with alpha (the game blurs it and washes it blue, as Valve's CSS does #ForegroundScene).
// The fighters themselves are drawn live from the glTF models (src/minigames/games/fighter/render.js).
//
//   node scripts/fighter-scene/make.mjs --maps <dir> [--work <dir>] [--playwright <path>]
//
// --maps: Source2Viewer-CLI glb exports of the two maps with materials and textures, and lights.json (the maps'
// env_global_light / env_deferred_light / info_particle_system entities):
//   Source2Viewer-CLI -i arena.vpk -f maps/scenes/crownfall/arena.vmap_c -o arena.glb -d --game <pak01 export>/gameinfo.gi
//     --gltf_export_format glb --gltf_export_materials --gltf_textures_adapt   (and the same for arena_fg)
// The maps' props live in pak01 (models/events/crownfall/tussle_stage/*, tusktown01, penguin_alt, tuskfolk001b_f).
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const MAPS = resolve(opt('maps', 'fighter-maps')), WORK = resolve(opt('work', join(tmpdir(), 'fighter-scene-work')));
const OUT = join(ROOT, 'assets/minigames/fighter/images/stage');
const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
const sharp = createRequire(join(ROOT, 'package.json'))('sharp');
mkdirSync(WORK, { recursive: true }); mkdirSync(OUT, { recursive: true });

const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/stage/': `${MAPS}/` };
const types = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json' };
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
async function run(job) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto(`${origin}/tool/render.html`); await page.waitForFunction(() => window.ready);
  const out = await page.evaluate(`(async () => { window.JOB = ${JSON.stringify(job)}; ${readFileSync(join(HERE, 'stage.js'), 'utf8')} })()`);
  await page.close();
  writeFileSync(join(WORK, job.out), Buffer.from(out[job.out].split(',')[1], 'base64'));
  return out.meta;
}

// The panel is 1920 px wide at hfov 38°; the picture is 2400 px at the same focal length.
const PANEL = 1920, WIDTH = 2400, HEIGHT = 1080, PAN = (WIDTH - PANEL) / 2;
const fov = 2 * Math.atan(Math.tan(19 * Math.PI / 180) * WIDTH / PANEL) * 180 / Math.PI;
const lights = JSON.parse(readFileSync(join(MAPS, 'lights.json'), 'utf8'));
// Valve's lighting is baked and goes through a post-process grade; these strengths are matched by eye.
const LIGHT = { exposure: 1.8, hemi: 1.4, point: 8, sun: 1.6, fire: 4 };
const fires = (l) => (l.fires || []).map((f) => ({ origin: f.origin, power: /candle/.test(f.effect) ? 0.6 : 3, radius: /candle/.test(f.effect) ? 90 : 260 }));
const common = { width: WIDTH, height: HEIGHT, ss: 2, fov, fovAxis: 'h', light: LIGHT };
const bg = await run({ ...common, map: 'arena', ...lights.arena, fires: fires(lights.arena), out: 'background.png', probe: [[0, -1300, 160], [0, -1100, 160]] });
await run({ ...common, map: 'arena_fg', ...lights.arena_fg, out: 'foreground.png' });
await browser.close(); server.close();

await sharp(join(WORK, 'background.png')).webp({ quality: 80, effort: 6 }).toFile(join(OUT, 'background.webp'));
await sharp(join(WORK, 'foreground.png')).trim({ threshold: 0 }).webp({ quality: 82, alphaQuality: 80, effort: 6 }).toFile(join(WORK, 'fg-trim.webp')).then(async (info) => {
  // The foreground keeps only its drawn part; stage.json says where it goes.
  writeFileSync(join(OUT, 'foreground.webp'), readFileSync(join(WORK, 'fg-trim.webp')));
  const meta = { width: WIDTH, height: HEIGHT, panel: PANEL, pan: PAN, fov: +fov.toFixed(4), floor: bg.points,
    foreground: { left: -info.trimOffsetLeft, top: -info.trimOffsetTop, width: info.width, height: info.height } };
  writeFileSync(join(OUT, 'stage.json'), JSON.stringify(meta, null, 1));
  console.log(meta);
});
