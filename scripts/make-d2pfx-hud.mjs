// d2pfx HUD skins and HUD parts in our own match preview, as close to Dota as the emulator gets
// (2026-10-17, the owner: «худы должны накладываться как в доте 1 в 1»):
//   node scripts/make-d2pfx-hud.mjs --s2v <Source2Viewer-CLI> --playwright <path to the playwright package> [--fonts <dir with Valve's radiancem-*.otf>] [--cache <dir>] [--only id,id]
// 1. Every HUD skin and HUD part of src/customize/d2pfx-mods.json is downloaded at the list's commit and taken
//    apart: its textures (vtex_c → PNG by Source 2 Viewer), its stylesheets (vcss_c → the source text they
//    carry) and layouts (vxml_c → XML by Source 2 Viewer).
// 2. Dota's HUD is laid out by the Panorama emulator (src/customize/panorama, in Chromium through Vite) at every
//    captured scale, in the capture's own state (hudScene capture: colour-blind off, its numbers; the portrait,
//    the minimap and the top bar's hero cut from the capture itself), twice for each file set: with the
//    backdrops on (the capture's F) and off (C), over black and over white. Once with Valve's files (E_valve),
//    once per mod with the mod's files in their place (E_mod) — textures, styles and layouts alike, so a
//    skin's colours, sizes and moved panels come out as the emulator draws them.
// 3. → assets/d2pfx-hud: valve/<layer>-<scale>.webp (lossless RGBA: RGB = the layer over black, A = 255 − the
//    added light over white) and <mod>/<layer>-<scale>.webp with only the pixels the mod changes (A 0 = no
//    change; colour lossy, alpha exact), layers lowerF, lowerC (the lower HUD in both backdrop states) and top; hud.json says where.
// The page adds the difference E_mod − E_valve to the captured plates in linear light
// (scripts/hud-capture/reskin.mjs): what a mod does not change keeps Dota's own pixels — the portrait, the
// icons, the numbers. scripts/check-d2pfx-hud.mjs measures E_valve against the capture.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';
import { readVPK, buildVPK, panoramaSource } from './vpk.mjs';
import { readZip } from './zip.mjs';
import { md5 } from './md5.mjs';
import { hudRules, HUD_DEFAULTS } from './hud-style.mjs';
import { atlasPlate, buildLower, encodeFast, lowerFromAtlas } from './hud-capture/compose.mjs';
import { layerAt } from './hud-capture/reskin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const s2v = arg('--s2v'), playwrightPath = arg('--playwright'), only = arg('--only'), fontDir = arg('--fonts');
if (!s2v || !existsSync(s2v)) throw new Error('--s2v <Source2Viewer-CLI>');
if (!playwrightPath) throw new Error('--playwright <path to the playwright package>');
const { chromium } = createRequire(join(root, 'package.json'))(playwrightPath);
const cache = arg('--cache') || join(root, 'node_modules/.cache/d2pfx');
const catalog = JSON.parse(readFileSync(join(root, 'src/customize/d2pfx-mods.json'), 'utf8'));
const capture = JSON.parse(readFileSync(join(root, 'assets/dota-hud-capture/hud.json'), 'utf8'));
const out = join(root, 'assets/d2pfx-hud');

// ---- 1. The mods' files.
async function modFiles(mod) {
  const file = join(cache, catalog.commit, createHash('sha1').update(mod.file).digest('hex'));
  let bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : new Uint8Array(await (await fetch(mod.file)).arrayBuffer());
  if (mod.inner) bytes = (await readZip(bytes, { want: (name) => name === mod.inner, limit: 300_000_000 })).find((entry) => entry.name === mod.inner).data;
  // Only proper game paths (a mod may carry stray copies like «inventory_bg_psd (2).vtex_c»).
  const files = readVPK(bytes).files.filter((f) => f.path.startsWith('panorama/') && /^[a-z0-9_./-]+$/.test(f.path));
  const textures = {}, sources = {}, unread = [];
  const work = mkdtempSync(join(tmpdir(), 'd2pfx-hud-'));
  try {
    const decompile = files.filter((f) => /\.(vtex_c|vxml_c)$/.test(f.path) || (/\.vcss_c$/.test(f.path) && !textOf(f.data)));
    if (decompile.length) {
      writeFileSync(join(work, 'mod_dir.vpk'), buildVPK(decompile.map((f) => ({ path: f.path, data: f.data })), { md5 }));
      execFileSync(s2v, ['-i', join(work, 'mod_dir.vpk'), '-o', join(work, 'out'), '-d'], { stdio: 'ignore' });
    }
    for (const f of files) {
      const base = f.path.replace(/_c$/, '').replace(/\.v(css|xml|tex)$/, '');
      if (f.path.endsWith('.vtex_c')) {
        const png = join(work, 'out', `${base}.png`);
        if (existsSync(png)) textures[base] = readFileSync(png); else unread.push(f.path);
      } else if (f.path.endsWith('.vcss_c')) {
        const text = textOf(f.data) ?? (existsSync(join(work, 'out', `${base}.css`)) ? readFileSync(join(work, 'out', `${base}.css`), 'utf8') : null);
        if (text) sources[`${base}.css`] = text; else unread.push(f.path);
      } else if (f.path.endsWith('.vxml_c')) {
        const xml = join(work, 'out', `${base}.xml`);
        if (existsSync(xml)) sources[`${base}.xml`] = readFileSync(xml, 'utf8'); else unread.push(f.path);
      }
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  return { textures, sources, unread };
}
function textOf(data) { try { return panoramaSource(data); } catch { return null; } }

// ---- The capture's own pixels for what Dota draws itself (portrait, minimap, the top bar's hero): an RGBA
// picture of a plate's rectangle (alpha from the over-black and over-white plates).
const raw = async (file) => { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data }; };
const capDir = join(root, 'assets/dota-hud-capture');
const lower100 = buildLower(lowerFromAtlas(await raw(join(capDir, capture.lower[100].atlas)), capture.lower[100]), {});
const top100 = atlasPlate(await raw(join(capDir, capture.top[100].atlas)), capture.top[100].plate);
async function cut(plate, [x, y, w, h]) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const rgba = Buffer.alloc(w * h * 4);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const px = x + xx - plate.x, py = y + yy - plate.y;
    if (px < 0 || py < 0 || px >= plate.w || py >= plate.h) continue;
    const i = (py * plate.w + px) * 3, o = (yy * w + xx) * 4;
    const a = 1 - ((plate.wt[i] - plate.k[i]) + (plate.wt[i + 1] - plate.k[i + 1]) + (plate.wt[i + 2] - plate.k[i + 2])) / 765;
    rgba[o + 3] = Math.round(Math.max(0, a) * 255);
    for (let c = 0; c < 3; c++) rgba[o + c] = a > 0.004 ? Math.min(255, Math.round(plate.k[i + c] / a)) : 0;
  }
  return `data:image/png;base64,${(await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()).toString('base64')}`;
}

// ---- 2. The emulator.
const server = await createServer({ root, configFile: join(root, 'vite.config.mjs'), logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let served = {};
// Valve's RadianceM (the numbers' font: gold, timers, health) from the game's files, when given (--fonts <dir>
// with radiancem-*.otf; never shipped: only the rendered layers are): the emulator otherwise stands in a heavier
// Radiance, whose digits are wider — the gold's «99999» then overflows its box.
const NUMBER_FACES = fontDir ? readdirSync(fontDir).filter((name) => /^radiancem-(regular|bold|black|light|semibold|medium)\.otf$/i.test(name)) : [];
const FACE_WEIGHT = { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, black: 900 };
await page.route('**/__font/**', (route) => route.fulfill({ status: 200, contentType: 'font/otf', body: readFileSync(join(fontDir, decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__font\//, '')))) }));
await page.route('**/__d2pfx/**', (route) => {
  const png = served[decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__d2pfx\//, ''))];
  return png ? route.fulfill({ status: 200, contentType: 'image/png', body: png }) : route.fulfill({ status: 404, body: '' });
});
// The panels whose rectangles the check and the previews use.
const PANELS = ['PortraitContainer', 'minimap_block', 'minimap_container', 'center_bg', 'PortraitBacker', 'inventory_items', 'InventoryBG', 'QuickBuyRows', 'shop_launcher_bg', 'right_flare', 'left_flare',
  'GlyphScanContainer', 'TimeOfDayBG', 'TopBarRadiantTeam', 'TopBarDireTeam', 'StatBranchBG', 'AghsStatusScepter', 'stash', 'xp', 'HealthContainer', 'ManaContainer', 'lower_hud', 'topbar'];
async function scene(mod, previews) {
  served = mod ? Object.fromEntries(Object.entries(mod.textures).map(([path, png]) => [path, png])) : {};
  await page.goto(`${base}/customize.html`, { waitUntil: 'domcontentloaded' });
  return page.evaluate(async ({ textures, sources, previews, classes, faces }) => {
    const [{ hudScene }, A] = await Promise.all([import('/src/customize/panorama/hud.mjs'), import('/src/customize/panorama/hud-assets.js')]);
    for (const node of [...document.body.children]) node.remove();
    document.documentElement.style.background = document.body.style.background = '#000';
    document.body.style.margin = '0';
    const host = document.createElement('div');
    host.id = 'gs-host'; host.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;';
    document.body.append(host);
    const own = new Set(textures);
    const asset = (path) => (own.has(path) ? `/__d2pfx/${encodeURIComponent(path)}` : A.asset(path));
    // With Valve's RadianceM given, the emulator's stand-in faces of that family go, so the real ones are used.
    const fonts = faces.length ? A.fonts.replace(/@font-face\s*\{[^}]*PanoramaRadianceM[^}]*\}/g, '') : A.fonts;
    const made = hudScene({ sources: { ...A.sources, ...sources }, asset, fonts, previews: { ...A.previews, ...previews }, chat: [], capture: true });
    host.append(made.element);
    if (classes.length) host.querySelector('pa-dotahud')?.classList.add(...classes);
    if (faces.length) { const style = document.createElement('style'); style.textContent = faces.map(([file, weight]) => `@font-face { font-family: 'PanoramaRadianceM'; src: url('/__font/${file}'); font-weight: ${weight}; }`).join('\n'); document.head.append(style); }
    window.gsScene = made;
  }, { textures: Object.keys(served), sources: mod?.sources || {}, previews, classes: mod?.classes || [], faces: NUMBER_FACES.map((file) => [file, FACE_WEIGHT[file.match(/-(\w+)\./)[1].toLowerCase()]]) });
}
async function layout(rules) {
  return page.evaluate(async ({ rules, ids }) => {
    window.gsScene.setStyles({ 'panorama/styles/custom_ui.css': rules });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const host = document.getElementById('gs-host');
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
    // Every background picture loaded and decoded before the screenshot (they load on their own, after layout:
    // a skin's inventory could otherwise be shot before its texture arrived).
    const urls = new Set();
    for (const el of host.querySelectorAll('.pano *')) for (const m of getComputedStyle(el).backgroundImage.matchAll(/url\("([^"]+)"\)/g)) if (!m[1].startsWith('data:')) urls.add(m[1]);
    await Promise.all([...urls].map((url) => { const image = new Image(); image.src = url; return image.decode().catch(() => {}); }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rects = {}, boxes = [];
    for (const id of ids) { const el = host.querySelector(`[id="${id}"]`); if (el) { const r = el.getBoundingClientRect(); if (r.width && r.height) rects[id] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); } }
    // Every painted panel (a picture, a background, a text) of a size worth registering, for the shift map.
    for (const el of host.querySelectorAll('.pano *')) {
      const r = el.getBoundingClientRect(), area = r.width * r.height;
      if (area < 64 || area > 250000 || r.width < 6 || r.height < 6) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const painted = el.tagName === 'IMG' || (cs.backgroundImage !== 'none, none' && cs.backgroundImage !== 'none') || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') || (el.tagName === 'PA-LABEL' && el.textContent.trim());
      if (painted) boxes.push([r.x, r.y, r.width, r.height].map((v) => Math.round(v)));
    }
    return { rects, boxes };
  }, { rules, ids: PANELS });
}
// The whole screen over black and over white → { k, w } RGB bytes.
async function shot() {
  const planes = [];
  for (const bg of ['#000', '#fff']) {
    await page.evaluate((bg) => { document.documentElement.style.background = document.body.style.background = bg; }, bg);
    planes.push(await sharp(await page.screenshot({ animations: 'disabled' })).removeAlpha().raw().toBuffer());
  }
  return { k: planes[0], w: planes[1] };
}
const crop = ({ k, w }, [x, y, cw, ch]) => {
  const rgba = Buffer.alloc(cw * ch * 4);
  for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
    const i = ((y + yy) * 1920 + x + xx) * 3, o = (yy * cw + xx) * 4;
    rgba[o] = k[i]; rgba[o + 1] = k[i + 1]; rgba[o + 2] = k[i + 2];
    rgba[o + 3] = Math.max(0, Math.min(255, 255 - Math.round(((w[i] - k[i]) + (w[i + 1] - k[i + 1]) + (w[i + 2] - k[i + 2])) / 3)));
  }
  return rgba;
};
// Classes a mod needs from Dota's settings to do anything: «Larger Minimap» only changes the extra-large minimap
// (Dota: Settings → «Очень большая миникарта»), so its preview shows that setting on.
const MOD_CLASSES = { 'larger-minimap': ['MinimapExtraLarge'] };
// The top bar's layers reach 40 px below the captured plate: a mod may make the bar taller (Larger Timer);
// the page grows the plate to fit (reskin.mjs grow).
const topRect = (scale) => { const [x, y, w, h] = capture.top[scale].plate.rect; return [x, y, w, h + 40]; };
const PAIRS = [[70, 70], [80, 80], [85, 90], [90, 110], [95, 120], [100, 100]];
const rulesOf = (lower, top, opacity = 100) => hudRules({ ...HUD_DEFAULTS, lower, top, opacity });
// Renders a file set at every scale: { [layer|scale]: rgba }, and the panels' rectangles per scale.
async function renders(mod, previews) {
  await scene(mod, previews);
  const layers = {}, rects = {}, boxes = {};
  for (const [lower, top] of PAIRS) {
    const laid = await layout(rulesOf(lower, top));
    rects[lower] = laid.rects; boxes[lower] = laid.boxes;
    const F = await shot();
    layers[`lowerF|${lower}`] = crop(F, capture.lower[lower].base.rect);
    layers[`top|${top}`] = crop(F, topRect(top));
    await layout(rulesOf(lower, top, 0));
    layers[`lowerC|${lower}`] = crop(await shot(), capture.lower[lower].base.rect);
    // Valve's texts alone (labels' glyphs, nothing else): where the emulator writes text, its raster is not
    // Dota's — the page never swaps the captured glyphs for the emulator's there (reskin.mjs text).
    if (!mod) {
      await layout(rulesOf(lower, top));
      await page.evaluate(() => { const style = document.createElement('style'); style.id = 'gs-text'; style.textContent = '#gs-host .pano * { background-image: none !important; background-color: transparent !important; box-shadow: none !important; border-color: transparent !important; text-shadow: none !important; outline-color: transparent !important; } #gs-host .pano img { visibility: hidden !important; }'; document.head.append(style); });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const text = await shot();
      await page.evaluate(() => document.getElementById('gs-text')?.remove());
      layers[`textLower|${lower}`] = crop(text, capture.lower[lower].base.rect);
      layers[`textTop|${top}`] = crop(text, topRect(top));
    }
  }
  return { layers, rects, boxes };
}
const rectOf = (layer, scale) => (layer === 'top' || layer === 'textTop' ? topRect(scale) : capture.lower[scale].base.rect);
// Valve's layers lossless; a mod's lossy in colour with its alpha exact (A 0 = «no change» must stay 0).
const save = (rgba, [, , w, h], file, lossless = true) => sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).webp(lossless ? { lossless: true, exact: true, effort: 6 } : { quality: 90, alphaQuality: 100, effort: 6 }).toFile(join(out, file));

// Valve first, with the capture's own portrait, minimap and top bar hero (their rectangles from a first layout).
await scene(null, {});
const first = (await layout(rulesOf(100, 100))).rects;
const boxOf = (selector) => page.evaluate((selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && r.width ? [r.x, r.y, r.width, r.height] : null; }, selector);
const [topHero, overInventory, innate] = await Promise.all(['#gs-host #RadiantPlayer0 #HeroImage', '#gs-host pa-dotainventory > img.pa-shot', '#gs-host pa-dotainnateicon img.pa-shot'].map(boxOf));
// The portrait, the minimap, the icons over the inventory and the innate's icon: the capture's own pixels.
const previews = { portrait: await cut(lower100.C, first.PortraitContainer), minimap: await cut(lower100.C, first.minimap_block),
  ...(topHero ? { topbarHero: await cut(top100, topHero) } : {}), ...(overInventory ? { overInventory: await cut(lower100.C, overInventory) } : {}), ...(innate ? { innate: await cut(lower100.C, innate) } : {}) };
// With --only, the other mods' layers stay (their manifest entries too); without it, everything is made anew.
const kept = only && existsSync(join(out, 'hud.json')) ? JSON.parse(readFileSync(join(out, 'hud.json'), 'utf8')).mods : {};
if (only) rmSync(join(out, 'valve'), { recursive: true, force: true }); else rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'valve'), { recursive: true });
const manifest = { source: catalog.source, commit: catalog.commit, made: new Date().toISOString().slice(0, 10), pairs: PAIRS, layers: {}, panels: {}, mods: { ...kept } };
const valve = await renders(null, previews);
manifest.panels = valve.rects;
// ---- Registration: the emulator places some panels a few pixels off Dota (its CSS layout is not Panorama's).
// Each painted panel of E_valve gets the integer shift (±6 px) that fits the capture best (over black and over
// white, blended in linear light as Dota does, F state); a pixel takes its smallest panel's shift. Valve's and every mod's layers are resampled
// through that map, so a mod's difference lands where Dota draws the panel. → manifest.registration
const { buildLower: build } = await import('./hud-capture/compose.mjs');
const { plates } = await import('./d2pfx-hud-node.mjs');
const shiftMaps = {}, registration = {};
function fit(plate, rgba, rect, [x0, y0, w0, h0], dx, dy) {
  const [rx, ry, rw, rh] = rect;
  let sum = 0, n = 0;
  for (let y = Math.max(y0, plate.y, ry); y < Math.min(y0 + h0, plate.y + plate.h, ry + rh); y++) for (let x = Math.max(x0, plate.x, rx); x < Math.min(x0 + w0, plate.x + plate.w, rx + rw); x++) {
    const lx = x - dx - rx, ly = y - dy - ry;
    if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) continue;
    const l = (ly * rw + lx) * 4, i = ((y - plate.y) * plate.w + (x - plate.x)) * 3, v = layerAt(rgba, l);
    for (let c = 0; c < 3; c++) sum += Math.abs(encodeFast(v.b[c]) - plate.k[i + c]) + Math.abs(encodeFast(v.b[c] + v.a) - plate.wt[i + c]);
    n++;
  }
  return n ? sum / (n * 6) : Infinity;
}
function shiftMap(plate, rgba, rect, boxes) {
  const [rx, ry, rw, rh] = rect, map = new Int8Array(rw * rh * 2), owner = new Float64Array(rw * rh).fill(Infinity), panels = [];
  for (const box of boxes) {
    if (box[0] + box[2] <= rx || box[1] + box[3] <= ry || box[0] >= rx + rw || box[1] >= ry + rh) continue;
    const at = fit(plate, rgba, rect, box, 0, 0);
    if (!Number.isFinite(at)) continue;
    let best = { dx: 0, dy: 0, e: at };
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const e = fit(plate, rgba, rect, box, dx, dy); if (e < best.e) best = { dx, dy, e }; }
    if (best.e > at * 0.85) best = { dx: 0, dy: 0, e: at };
    panels.push({ box, before: +at.toFixed(2), after: +best.e.toFixed(2), shift: [best.dx, best.dy] });
    // The shift reaches a little past the panel's box (by the shift and 2 px): text and shadows that overflow
    // their label move with it instead of being cut at its edge.
    const area = box[2] * box[3], pad = Math.max(Math.abs(best.dx), Math.abs(best.dy)) + 2;
    for (let y = Math.max(box[1] - pad, ry); y < Math.min(box[1] + box[3] + pad, ry + rh); y++) for (let x = Math.max(box[0] - pad, rx); x < Math.min(box[0] + box[2] + pad, rx + rw); x++) {
      const p = (y - ry) * rw + (x - rx);
      if (area < owner[p]) { owner[p] = area; map[p * 2] = best.dx; map[p * 2 + 1] = best.dy; }
    }
  }
  return { map, panels };
}
const remap = (rgba, rect, map) => {
  const [, , rw, rh] = rect, out = Buffer.alloc(rgba.length);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const p = y * rw + x, sx = x - map[p * 2], sy = y - map[p * 2 + 1];
    if (sx < 0 || sy < 0 || sx >= rw || sy >= rh) continue;
    rgba.copy(out, p * 4, (sy * rw + sx) * 4, (sy * rw + sx) * 4 + 4);
  }
  return out;
};
for (const [lower, top] of PAIRS) {
  const p = await plates(lower, top), { F } = build(p.set, {});
  const lowerMap = shiftMap(F, valve.layers[`lowerF|${lower}`], capture.lower[lower].base.rect, valve.boxes[lower]);
  const topMap = shiftMap(p.top, valve.layers[`top|${top}`], topRect(top), valve.boxes[lower]);
  shiftMaps[`lowerF|${lower}`] = shiftMaps[`lowerC|${lower}`] = lowerMap.map;
  shiftMaps[`top|${top}`] = shiftMaps[`textTop|${top}`] = topMap.map;
  shiftMaps[`textLower|${lower}`] = lowerMap.map;
  const summary = (list) => ({ panels: list.length, moved: list.filter((x) => x.shift[0] || x.shift[1]).length, before: +(list.reduce((a, x) => a + x.before, 0) / list.length).toFixed(2), after: +(list.reduce((a, x) => a + x.after, 0) / list.length).toFixed(2) });
  registration[`lower ${lower}`] = summary(lowerMap.panels); registration[`top ${top}`] = summary(topMap.panels);
}
manifest.registration = registration;
for (const key of Object.keys(valve.layers)) { const [layer, scale] = key.split('|'); valve.layers[key] = remap(valve.layers[key], rectOf(layer, scale), shiftMaps[key]); }
console.log('registration', JSON.stringify(registration));
for (const [key, rgba] of Object.entries(valve.layers)) {
  const [layer, scale] = key.split('|'), file = `valve/${layer}-${scale}.webp`;
  // A text layer is kept as a mask: A 255 on a glyph's pixels and one around them.
  if (layer.startsWith('text')) {
    const [, , w, h] = rectOf(layer, scale), on = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) if (Math.max(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]) > 24 || rgba[p * 4 + 3] > 24) on[p] = 1;
    rgba.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on[y * w + x]) for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) rgba[(yy * w + xx) * 4 + 3] = 255;
  }
  await save(rgba, rectOf(layer, scale), file);
  (manifest.layers[layer] ||= {})[scale] = { rect: rectOf(layer, scale), file };
}
console.log('valve: rendered');

// Each mod: only the pixels it changes.
const mods = Object.values(catalog.mods).filter((mod) => (mod.section === 'hudskin' || mod.section === 'hudparts') && (!only || only.split(',').includes(mod.id)));
for (const mod of mods) {
  const files = await modFiles(mod);
  files.classes = MOD_CLASSES[mod.id] || [];
  const entry = { section: mod.section, textures: Object.keys(files.textures).length, sources: Object.keys(files.sources), unread: files.unread, layers: {}, changed: 0 };
  manifest.mods[mod.id] = entry;
  if (!entry.textures && !entry.sources.length) { console.log(`${mod.id}: nothing for Panorama`); continue; }
  mkdirSync(join(out, mod.id), { recursive: true });
  const own = await renders(files, previews);
  for (const [key, ownRgba] of Object.entries(own.layers)) {
    const [layerName, layerScale] = key.split('|'), rgba = remap(ownRgba, rectOf(layerName, layerScale), shiftMaps[key]);
    const v = valve.layers[key], delta = Buffer.alloc(rgba.length), [, , rw, rh] = rectOf(layerName, layerScale);
    // The pixels the mod changes, grown by 3 px: Dota's own content sits a pixel or two off the emulator's, and
    // where a mod moves it away its edge must go too (reskin.mjs takes E_mod where E_valve is not Dota).
    const diff = new Uint8Array(rw * rh), near = new Uint8Array(rw * rh);
    for (let p = 0, i = 0; p < diff.length; p++, i += 4) diff[p] = rgba[i] !== v[i] || rgba[i + 1] !== v[i + 1] || rgba[i + 2] !== v[i + 2] || rgba[i + 3] !== v[i + 3] ? 1 : 0;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      if (!diff[y * rw + x]) continue;
      for (let yy = Math.max(0, y - 3); yy <= Math.min(rh - 1, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(rw - 1, x + 3); xx++) near[yy * rw + xx] = 1;
    }
    let changed = 0;
    for (let p = 0, i = 0; p < near.length; p++, i += 4) {
      if (!near[p]) continue;
      delta[i] = rgba[i]; delta[i + 1] = rgba[i + 1]; delta[i + 2] = rgba[i + 2]; delta[i + 3] = Math.max(1, rgba[i + 3]);
      changed += diff[p];
    }
    if (!changed) continue;
    const [layer, scale] = key.split('|'), file = `${mod.id}/${layer}-${scale}.webp`;
    await save(delta, rectOf(layer, scale), file, false);
    (entry.layers[layer] ||= {})[scale] = file;
    entry.changed += changed;
  }
  // A few hundred changed pixels are the emulator's noise (a picture decoded a shade apart): nothing to draw.
  if (entry.changed <= 3000) { rmSync(join(out, mod.id), { recursive: true, force: true }); entry.layers = {}; }
  entry.panels = own.rects[100];
  // A mod that moves or resizes panels (Smaller Hud, Larger Minimap, Larger Timer…): where it changes pixels the
  // preview shows its render outright (reskin.mjs replace), as the captured content is no longer where it was.
  entry.moves = Object.keys(valve.rects[100]).filter((id) => { const a = valve.rects[100][id], b = own.rects[100][id]; return !b || a.some((v, i) => Math.abs(v - b[i]) > 3); });
  // Where the moved panels are (before and after, 8 px around) at each scale: only there is the mod's render
  // taken outright — elsewhere its difference is added as usual (a part over a skin keeps the skin's colours).
  if (entry.moves.length) {
    entry.replace = { lower: {}, top: {} };
    for (const [lower, top] of PAIRS) {
      const boxes = entry.moves.filter((id) => !['lower_hud', 'topbar'].includes(id) || entry.moves.length > 6).flatMap((id) => [valve.rects[lower][id], own.rects[lower][id]]).filter(Boolean)
        .map(([x, y, w, h]) => [Math.floor(x) - 8, Math.floor(y) - 8, Math.ceil(w) + 16, Math.ceil(h) + 16])
        // Full-width containers (#minimap_container spans the screen) are not what a part moves.
        .filter((box) => entry.moves.length > 6 || box[2] < 1000);
      // A mod that moves nearly everything (Smaller Hud) is its own render over the whole HUD (reskin.mjs 'all').
      const all = entry.moves.length > 6 ? 'all' : boxes;
      entry.replace.lower[lower] = all; entry.replace.top[top] = all;
    }
  }
  console.log(`${mod.id}: ${entry.textures} textures, ${entry.sources.length} styles/layouts, ${entry.changed} changed pixels${files.unread.length ? `, unread ${files.unread.length}` : ''}`);
}
writeFileSync(join(out, 'hud.json'), `${JSON.stringify(manifest)}\n`);
await browser.close();
await server.close();
// 4. Thumbnails as the preview draws them (scripts/make-d2pfx-hud-thumbs.mjs).
await import('./make-d2pfx-hud-thumbs.mjs');
