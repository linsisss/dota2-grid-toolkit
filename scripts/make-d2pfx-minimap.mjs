// The minimap colour mods (d2pfx «Grey Minimap», «Purple Minimap», 2026-10-17) in the match preview. They replace
// the SIMPLIFIED minimap's picture (materials/overviews/dota_minimal_psd_*.vtex_c; resource/overviews/dota.txt names
// it simple_material, the normal minimap being dota.vmat → dota_tga_*.vtex) and Panorama's dotamap_psd (not on the
// HUD's screen). The engine draws the minimap, not Panorama, so the emulator cannot show them.
// The captured minimap cannot be refitted either: the capture is a hero-demo session, whose minimap is that map's
// own picture with its fog — Valve's overview of the main map does not match it (checked: per-channel fit of
// dota_tga_d8178876 to the capture leaves a median error of 0.19 in linear light — it is another picture).
// So the preview shows what the mod changes: the simplified minimap of the main map, Valve's picture replaced by the
// mod's, drawn over #minimap_block (the minimap's own box at each scale), without the demo's icons.
//   node scripts/make-d2pfx-minimap.mjs --s2v <Source2Viewer-CLI> [--cache <dir>]
// → assets/d2pfx-hud/<mod>/lowerF|lowerC-<scale>.webp in the layers' format (reskin.mjs), hud.json updated.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readVPK, buildVPK } from './vpk.mjs';
import { readZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const s2v = arg('--s2v'), cache = arg('--cache') || join(root, 'node_modules/.cache/d2pfx');
if (!s2v) throw new Error('--s2v <Source2Viewer-CLI>');
const out = join(root, 'assets/d2pfx-hud'), manifestFile = join(out, 'hud.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')), catalog = JSON.parse(readFileSync(join(root, 'src/customize/d2pfx-mods.json'), 'utf8'));

// The mod's simplified overview as PNG bytes.
async function simplified(mod) {
  const file = join(cache, catalog.commit, createHash('sha1').update(mod.file).digest('hex'));
  let bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : new Uint8Array(await (await fetch(mod.file)).arrayBuffer());
  if (mod.inner) bytes = (await readZip(bytes, { want: (name) => name === mod.inner, limit: 300_000_000 })).find((entry) => entry.name === mod.inner).data;
  const f = readVPK(bytes).files.find((x) => /^materials\/overviews\/dota_minimal_psd_[0-9a-f]+\.vtex_c$/.test(x.path));
  const work = mkdtempSync(join(tmpdir(), 'd2pfx-mm-'));
  try {
    writeFileSync(join(work, 'm_dir.vpk'), buildVPK([{ path: f.path, data: f.data }], { md5 }));
    execFileSync(s2v, ['-i', join(work, 'm_dir.vpk'), '-o', join(work, 'out'), '-d'], { stdio: 'ignore' });
    return readFileSync(join(work, 'out', f.path.replace(/\.vtex_c$/, '.png')));
  } finally { rmSync(work, { recursive: true, force: true }); }
}

const mods = Object.values(catalog.mods).filter((mod) => /^(grey|purple)-minimap$/.test(mod.id));
for (const mod of mods) {
  const png = await simplified(mod), entry = manifest.mods[mod.id] ||= { section: mod.section, textures: 1, sources: [], unread: [] };
  entry.layers = {}; entry.changed = 0; entry.simplified = true; delete entry.replace; delete entry.moves;
  rmSync(join(out, mod.id), { recursive: true, force: true }); mkdirSync(join(out, mod.id), { recursive: true });
  // Two boxes per scale: the normal minimap and the extra-large one (with «Larger Minimap»: 400 px at 100 %, at the
  // bottom-left like the normal one; the page takes the «xl» layers when both mods are chosen).
  const boxOf = (scale, xl) => { if (!xl) return manifest.panels[scale].minimap_block; const size = (400 * scale) / 100; return [0, 1080 - size, size, size]; };
  entry.replace = { lower: {}, top: {} }; entry.replaceXL = { lower: {}, top: {} }; entry.layersXL = {};
  for (const xl of [false, true]) for (const scale of Object.keys(manifest.layers.lowerF)) {
    const [bx, by, bw] = boxOf(+scale, xl), size = Math.round(bw), x0 = Math.round(bx), y0 = Math.round(by);
    const [rx, ry, rw, rh] = manifest.layers.lowerF[scale].rect, layer = Buffer.alloc(rw * rh * 4);
    // The picture over black (the minimap's dark backdrop), opaque: RGB over black, A 255.
    const { data } = await sharp(png).resize(size, size).flatten({ background: '#000000' }).raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (sx < rx || sy < ry || sx >= rx + rw || sy >= ry + rh) continue;
      const l = ((sy - ry) * rw + (sx - rx)) * 4, i = (y * size + x) * 3;
      layer[l] = data[i]; layer[l + 1] = data[i + 1]; layer[l + 2] = data[i + 2]; layer[l + 3] = 255;
      if (!xl) entry.changed++;
    }
    for (const kind of ['lowerF', 'lowerC']) {
      const file = `${mod.id}/${kind}${xl ? '-xl' : ''}-${scale}.webp`;
      await sharp(layer, { raw: { width: rw, height: rh, channels: 4 } }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(join(out, file));
      ((xl ? entry.layersXL : entry.layers)[kind] ||= {})[scale] = file;
    }
    // Drawn over the whole box: the demo's minimap is not the main map's.
    (xl ? entry.replaceXL : entry.replace).lower[scale] = [[x0 - 1, y0 - 1, size + 2, size + 2]];
  }
  console.log(mod.id, entry.changed, 'pixels');
}
delete manifest.minimapFit;
writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
