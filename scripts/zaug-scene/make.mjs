#!/usr/bin/env node
// «Логово Зауга»: renders the game's pictures from Valve's files (docs/minigames.md, «Логово Зауга»). Offline,
// three.js in a headless Chromium (Playwright):
//   1. backdrop: the scene map's tundra belt (shmup_tundra_env + sky and mountain plates, Source 2 Viewer glb with
//      textures) in two skins — «mellow» (the first part) and «harsh» (from the first intermission on) — as a
//      still back picture and parallax bands (backdrop.js);
//   2. units: Shen (Vengeful Spirit arcana), the eight enemy kinds, the splinter and Zaug (Winter Wyvern) frame by
//      frame (unit.js, units.mjs);
//   3. pack.mjs: WebP strips and atlases, scene.json.
//
//   node scripts/zaug-scene/make.mjs --env <dir> [--models <glb dir>] [--work <dir>] [--playwright <path>]
//     [--only backdrop,units,pack] [--units shen,boss]
//
// --env: Source2Viewer-CLI exports (-d --gltf_export_format glb --gltf_export_materials --gltf_textures_adapt
// --gltf_export_animations, --game <dir with the pak01 files>/gameinfo.gi) of models/events/crownfall/shmup_shooting/
// shmup_tundra_env, shmup_tundra_mellow_bg_sky, shmup_tundra_mellow_bg_mountains (with their PNG textures), plus the
// decoded harsh skin: tundra_harsh_padding_color_png_78d78856.png, shmup_tundra_harsh_bg_color_png_93ac4400.png.
// --models: the unit glbs (meshopt, WebP textures) — venge_arcana*.glb, venge_gauntlet, artifact_vengeful, enemy_*.glb,
// splinter_blast, winterwyvern*.glb.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { UNITS } from './units.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const ENV = resolve(opt('env', 'zaug-env')), MODELS = resolve(opt('models', '/tmp/claude-0/-home-code-gridstudio/393fe78e-42d4-4fe6-823d-d9629de18d4f/scratchpad/minigames/raw5/shmup/export/models'));
const WORK = resolve(opt('work', join(tmpdir(), 'zaug-scene-work')));
const ONLY = opt('only', 'backdrop,units,pack').split(','), ONLY_UNITS = opt('units', UNITS.map((u) => u.unit).join(',')).split(',');
const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
mkdirSync(WORK, { recursive: true });

const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/models/': `${MODELS}/`, '/env/': `${ENV}/` };
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

async function run(script, job) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page]', e.message)); page.on('console', (m) => { if (!/GPU stall|GL Driver/.test(m.text())) console.log('[page]', m.text()); });
  await page.goto(`${origin}/tool/render.html`); await page.waitForFunction(() => window.ready);
  const out = await page.evaluate(`(async () => { window.JOB = ${JSON.stringify(job)}; ${readFileSync(join(HERE, script), 'utf8')} })()`);
  await page.close();
  for (const [name, value] of Object.entries(out)) if (typeof value === 'string' && value.startsWith('data:')) { mkdirSync(dirname(join(WORK, name)), { recursive: true }); writeFileSync(join(WORK, name), Buffer.from(value.split(',')[1], 'base64')); }
  return out.meta;
}

// Depth bands of the belt (camera distance, map units): nearer bands are thinner (their speed changes faster).
export const BANDS = [[2000, 3000], [3000, 4400], [4400, 6500], [6500, 9500], [9500, 14000], [14000, 21000], [21000, 60000]];
if (ONLY.includes('backdrop')) {
  for (const skin of ['mellow', 'harsh']) {
    console.log('backdrop:', skin);
    rmSync(join(WORK, skin), { recursive: true, force: true });
    const meta = await run('backdrop.js', { skin, scale: 0.75, bands: BANDS, slit: 16, ss: 2, out: skin });
    writeFileSync(join(WORK, skin, 'meta.json'), JSON.stringify(meta, null, 1));
  }
}
if (ONLY.includes('units')) {
  for (const u of UNITS.filter((x) => ONLY_UNITS.includes(x.unit))) {
    console.log('unit:', u.unit);
    rmSync(join(WORK, u.unit), { recursive: true, force: true });
    const meta = await run('unit.js', u);
    writeFileSync(join(WORK, u.unit, 'meta.json'), JSON.stringify(meta, null, 1));
  }
}
await browser.close(); server.close();
if (ONLY.includes('pack')) execFileSync(process.execPath, [join(HERE, 'pack.mjs'), '--work', WORK], { stdio: 'inherit' });
