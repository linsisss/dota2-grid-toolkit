#!/usr/bin/env node
// «Замкобой»: renders the units of Crownfall's artillery minigame from Valve's models into sprite atlases,
// assets/minigames/castle/sprites/<unit>.webp + sprites.json. Offline, with three.js in a headless Chromium
// (Playwright): each glb (Source 2 Viewer export: meshopt, WebP textures, metres) is posed clip by clip and drawn
// with an orthographic side camera at 1.5 sprite px per game px (game px = Dota units × the unit's
// m_flDefaultScale from artillery_graphics.vdata), facing right and turned 28° towards the camera; then
// pack.mjs trims, packs and encodes the atlases and writes review contact sheets.
//
//   node scripts/castle-scene/make.mjs [--models <dir with the glbs>] [--work <dir>] [--review <dir>]
//     [--playwright <path to playwright/index.mjs>] [--only snapfire,ogre,...]
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { UNITS, PPU, CAMERA } from './units.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const MODELS = resolve(opt('models', '/tmp/claude-0/-home-code-gridstudio/393fe78e-42d4-4fe6-823d-d9629de18d4f/scratchpad/minigames/raw5/artillery/export/models'));
const WORK = resolve(opt('work', join(tmpdir(), 'castle-scene-work'))), REVIEW = resolve(opt('review', join(WORK, 'review')));
const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);

const ONLY = opt('only', UNITS.map((u) => u.unit).join(',')).split(',');
for (const dir of [WORK, REVIEW]) mkdirSync(dir, { recursive: true });
const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/models/': `${MODELS}/` };
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' };
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

for (const u of UNITS.filter((x) => ONLY.includes(x.unit))) {
  console.log('unit:', u.unit);
  rmSync(join(WORK, u.unit), { recursive: true, force: true }); mkdirSync(join(WORK, u.unit), { recursive: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page]', e.message)); page.on('console', (m) => console.log('[page]', m.text()));
  await page.goto(`${origin}/tool/render.html`); await page.waitForFunction(() => window.ready);
  const job = { ...CAMERA, ...u, ppu: PPU };
  const out = await page.evaluate(`(async () => { window.JOB = ${JSON.stringify(job)}; ${readFileSync(join(HERE, 'unit.js'), 'utf8')} })()`);
  await page.close();
  for (const [name, value] of Object.entries(out)) if (typeof value === 'string') writeFileSync(join(WORK, name), Buffer.from(value.split(',')[1], 'base64'));
  writeFileSync(join(WORK, u.unit, 'meta.json'), JSON.stringify({ ...out.meta, hitbox: u.hitbox, lift: u.lift || 0 }, null, 1));
}
await browser.close(); server.close();
execFileSync(process.execPath, [join(HERE, 'pack.mjs'), '--work', WORK, '--review', REVIEW], { stdio: 'inherit' });
