#!/usr/bin/env node
// «Терновый трон»: renders the units of Crownfall's Nest of Thorns (heroes, Imperia, enemies, breakables, pickups)
// from Valve's models into sprite atlases, assets/minigames/thorns/sprites/<unit>.webp + units.json
// (docs/minigames.md, «Терновый трон»). Offline, with three.js in a headless Chromium (Playwright), in three stages:
//   1. export: Source2Viewer-CLI exports every model of units.mjs SOURCES (glb, all animations, materials, full
//      textures) to <work>/models/<name>/, and the colour textures of the skins the units use (m_sSkinName →
//      the vmdl's material group → vmat g_tColor → PNG) to <work>/skins/;
//   2. render: each unit (unit.js) posed clip by clip with the game's camera — orthographic, looking north, 45° down —
//      at PPU (0.5 atlas px per Dota unit, 2× supersampled), facings d = 0, 1, 2, 6, 7 (1-dir units: their yaw),
//      frames to <work>/<unit>/<clip>-<d>-<i>.png + meta.json;
//   3. pack.mjs: per-frame trim, shelf-packed WebP atlases (≤ 2048²), units.json, review contact sheets.
//
//   node scripts/thorns-scene/units/make.mjs [--vpk <pak01 files folder, named «dota», with gameinfo.gi>]
//     [--cli <Source2Viewer-CLI>] [--work <dir>] [--review <dir>] [--playwright <path to playwright/index.mjs>]
//     [--only export,render,pack] [--units dragonus,skeleton,...]
//
// Defaults are the session scratch folders (raw5/survivors/game/dota = the pak01 files, thorns/units-work,
// thorns/units-review). Re-rendering one unit: --only render,pack --units kez (pack always packs every unit
// rendered in <work>).
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { UNITS, SOURCES, PPU, PITCH, SS, RENDER_DIRS } from './units.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../../..');
const SCRATCH = '/tmp/claude-0/-home-code-gridstudio/393fe78e-42d4-4fe6-823d-d9629de18d4f/scratchpad';
const args = process.argv.slice(2), opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const VPK = resolve(opt('vpk', `${SCRATCH}/minigames/raw5/survivors/game/dota`));
const CLI = resolve(opt('cli', '/tmp/claude-0/-home-code-gridstudio/9fec1763-98d6-40ee-b67a-0513fe001c10/scratchpad/s2v/cli/Source2Viewer-CLI'));
const WORK = resolve(opt('work', `${SCRATCH}/thorns/units-work`)), REVIEW = resolve(opt('review', `${SCRATCH}/thorns/units-review`));
const ONLY = opt('only', 'export,render,pack').split(','), ONLY_UNITS = opt('units', UNITS.map((u) => u.key).join(',')).split(',');
const MODELS = join(WORK, 'models'), SKINS = join(WORK, 'skins');
for (const dir of [WORK, MODELS, SKINS, REVIEW]) mkdirSync(dir, { recursive: true });
const units = UNITS.filter((u) => ONLY_UNITS.includes(u.key));

// Resource DATA block of a compiled file, as text.
const dataBlock = (file) => execFileSync(CLI, ['-i', file, '-b', 'DATA'], { encoding: 'utf8', maxBuffer: 1 << 28 });
// A model's material groups, in order: [[group, [vmat paths]], …] (the first is the default).
function materialGroups(vmdl) {
  const text = dataBlock(vmdl), i = text.indexOf('m_materialGroups'), j = text.indexOf('m_nDefaultMeshGroupMask', i);
  return [...text.slice(i, j).matchAll(/m_name = "([^"]*)"\s*m_materials =\s*\[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/resource:"([^"]*)"/g)].map((r) => r[1])]);
}
const vmatName = (p) => p.replace(/^.*\//, '').replace(/\.vmat$/, '');

if (ONLY.includes('export')) {
  const names = new Set();
  for (const u of units) { names.add(u.file); for (const p of u.parts || []) names.add(p.file); }
  for (const name of names) {
    const out = join(MODELS, name);
    if (existsSync(join(out, `${name}.glb`))) continue;
    console.log('export:', name);
    mkdirSync(out, { recursive: true });
    const log = execFileSync(CLI, ['-i', join(VPK, SOURCES[name]), '-o', join(out, `${name}.glb`), '-d', '--game', join(VPK, 'gameinfo.gi'),
      '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_textures_adapt', '--gltf_export_animations'], { cwd: out, encoding: 'utf8', maxBuffer: 1 << 28 });
    writeFileSync(join(out, 'log.txt'), log);
  }
  // Skins: for each default-group material, the skin's colour texture, as <work>/skins/<model>-<skin>/<material>.png.
  for (const u of units) for (const [file, skin] of [[u.file, u.skin], ...(u.parts || []).map((p) => [p.file, p.skin])]) {
    if (skin == null) continue;
    const dir = join(SKINS, `${file}-${skin}`);
    if (existsSync(join(dir, 'skin.json'))) continue;
    mkdirSync(dir, { recursive: true });
    const groups = materialGroups(join(VPK, SOURCES[file])), def = groups[0]?.[1], alt = groups.find(([g]) => g === skin)?.[1], map = {};
    if (!alt) { console.log(`skin: ${file} has no material group "${skin}" (groups: ${groups.map(([g]) => g).join(', ') || 'none'}) — default materials`); writeFileSync(join(dir, 'skin.json'), '{}'); continue; }
    def.forEach((m, i) => {
      if (!alt[i] || alt[i] === m) return;
      const vmat = join(VPK, `${alt[i]}_c`);
      if (!existsSync(vmat)) { console.log(`skin: ${file} "${skin}": ${alt[i]} is not in the pak01 files — default`); return; }
      const tex = /m_name = "g_tColor"\s*m_pValue = resource:"([^"]*)"/.exec(dataBlock(vmat))?.[1];
      if (!tex || !existsSync(join(VPK, `${tex}_c`))) { console.log(`skin: ${file} "${skin}": no colour texture for ${alt[i]}`); return; }
      const png = join(dir, `${vmatName(m)}.png`), tmp = join(dir, 'tmp');
      rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
      execFileSync(CLI, ['-i', join(VPK, `${tex}_c`), '-o', join(tmp, 'color.png'), '-d'], { encoding: 'utf8' });
      renameSync(join(tmp, readdirSync(tmp).find((f) => f.endsWith('.png'))), png); rmSync(tmp, { recursive: true });
      map[vmatName(m)] = `${vmatName(m)}.png`;
      console.log(`skin: ${file} "${skin}": ${vmatName(m)} → ${vmatName(alt[i])}`);
    });
    writeFileSync(join(dir, 'skin.json'), JSON.stringify(map));
  }
}

if (ONLY.includes('render')) {
  const roots = { '/three/': join(ROOT, 'node_modules/three/'), '/tool/': `${HERE}/`, '/models/': `${MODELS}/`, '/skins/': `${SKINS}/` };
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
  const { chromium } = await import(pathToFileURL(resolve(opt('playwright', '/home/router-new/frontend/node_modules/playwright/index.mjs'))).href);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const skinsOf = (file, skin) => {
    if (skin == null) return {};
    const f = join(SKINS, `${file}-${skin}`, 'skin.json');
    if (!existsSync(f)) throw new Error(`run --only export first (${file} skin ${skin})`);
    return Object.fromEntries(Object.entries(JSON.parse(readFileSync(f, 'utf8'))).map(([m, png]) => [m, `/skins/${file}-${skin}/${png}`]));
  };
  for (const u of units) {
    const t0 = Date.now();
    rmSync(join(WORK, u.key), { recursive: true, force: true }); mkdirSync(join(WORK, u.key), { recursive: true });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('[page]', e.message)); page.on('console', (m) => { if (!/GPU stall|GL Driver|WebGL/.test(m.text())) console.log('[page]', m.text()); });
    let meta = null;
    await page.exposeFunction('saveFrame', (name, url) => writeFileSync(join(WORK, name), Buffer.from(url.split(',')[1], 'base64')));
    await page.exposeFunction('saveMeta', (m) => { meta = m; });
    await page.goto(`${origin}/tool/render.html`); await page.waitForFunction(() => window.ready);
    const job = { ppu: PPU, pitch: PITCH, ss: SS, renderDirs: RENDER_DIRS, ...u, skins: skinsOf(u.file, u.skin), partSkins: (u.parts || []).map((p) => skinsOf(p.file, p.skin)) };
    await page.evaluate(`(async () => { window.JOB = ${JSON.stringify(job)}; ${readFileSync(join(HERE, 'unit.js'), 'utf8')} })()`);
    await page.close();
    writeFileSync(join(WORK, u.key, 'meta.json'), JSON.stringify(meta, null, 1));
    console.log(`${u.key}: ${meta.size.join('x')} px, ${((Date.now() - t0) / 1000).toFixed(0)} s\n  ${meta.notes.join('\n  ')}`);
  }
  await browser.close(); server.close();
}
if (ONLY.includes('pack')) execFileSync(process.execPath, [join(HERE, 'pack.mjs'), '--work', WORK, '--review', REVIEW], { stdio: 'inherit' });
