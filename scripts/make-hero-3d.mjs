// The hero on the hero page of the /customize preview («За героем»): Shadow Fiend in the set from the
// user's screenshot — Demon Eater (arcana) with its head, Souls Tyrant shoulders and Arms of
// Desolation, on the arcana's pedestal — with the page's animations and the set's own particle
// effects. Everything is taken from the game's files by Source 2 Viewer's command line
// (github.com/ValveResourceFormat/ValveResourceFormat, MIT):
//   node scripts/make-hero-3d.mjs <game dir> <Source2Viewer-CLI> [out dir]
// <game dir>: the needed part of pak01 extracted with the game's layout (models/, materials/,
// particles/…) and a gameinfo.gi with «Game dota» beside it, so the CLI resolves dependencies.
// Models: glTF with only the page's animations, textures stripped (the page draws them with its
// own copy of Dota's hero shader). Materials: the decompiled .vmat parameters and textures, packed
// into colour+alpha, normal and a masks texture. Effects: the .vpcf files as JSON, their textures
// with sprite sheets rebuilt at Valve's UV rectangles, particle snapshots and model attachments.
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { parseKV3 } from './kv3.mjs';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

const [gameArg, cliArg, outArg] = process.argv.slice(2);
if (!gameArg || !cliArg) throw new Error('Укажи папку с файлами игры (с gameinfo.gi) и путь к Source2Viewer-CLI.');
const game = resolve(gameArg), cli = resolve(cliArg), gameinfo = join(game, 'gameinfo.gi');
if (!existsSync(gameinfo)) throw new Error(`Нет ${gameinfo}.`);
const out = resolve(outArg || new URL('../assets/dota-hero/sf-arcana/', import.meta.url).pathname);
const temp = mkdtempSync(join(tmpdir(), 'hero3d-'));
mkdirSync(join(out, 'models'), { recursive: true }); mkdirSync(join(out, 'textures'), { recursive: true }); mkdirSync(join(out, 'fx'), { recursive: true });
const run = (args) => execFileSync(cli, args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
const decompile = (path, target) => { mkdirSync(dirname(target), { recursive: true }); run(['-i', join(game, `${path}_c`), '--game', gameinfo, '-d', '-o', target]); };

// The page shows the hero's loadout animations: the entry once, then the idle loop (both the
// Desolation variants, since those arms change the hero's activities to «desolation»); and the
// taunt «Fiendish Swag!» (items_game 8072: ACT_DOTA_TAUNT with swag_gesture), played by its icon.
const ANIMATIONS = ['loadout_spawn_arcana_desolation', 'loadout_desolation', 'taunt_fiendish_swag_anim'];
const MODELS = {
  hero: 'models/heroes/shadow_fiend/shadow_fiend_arcana.vmdl',
  head: 'models/heroes/shadow_fiend/shadow_fiend_arcana_head.vmdl',
  arms: 'models/items/shadow_fiend/arms_deso/arms_deso.vmdl',
  shoulders: 'models/items/nevermore/sf_souls_tyrant_shoulder/sf_souls_tyrant_shoulder.vmdl',
  pedestal: 'models/heroes/shadow_fiend/shadow_fiend_arcana_pedestal.vmdl',
};
// The set's particles as the game creates them (items_game.txt: particle_create of each item, the
// arcana's replacement of the hero's glow, and the page's loadout effect), with the model whose
// attachments they use first.
const EFFECTS = [
  ['particles/econ/items/shadow_fiend/sf_fire_arcana/sf_fire_arcana_ambient.vpcf', 'hero'],
  ['particles/econ/items/shadow_fiend/sf_fire_arcana/sf_fire_arcana_ambient_eyes.vpcf', 'head'],
  ['particles/econ/items/shadow_fiend/sf_fire_arcana/sf_fire_arcana_ambient_head_parent.vpcf', 'head'],
  ['particles/econ/items/shadow_fiend/sf_souls_tyrant/sf_souls_tyrant_shoulder_ambient.vpcf', 'shoulders'],
  ['particles/econ/items/shadow_fiend/sf_desolation/shadow_fiend_desolation_ambient.vpcf', 'arms'],
  ['particles/units/heroes/hero_nevermore/sf_fire_arcana_ambient_glow.vpcf', 'hero'],
  ['particles/econ/items/shadow_fiend/sf_fire_arcana/sf_fire_arcana_loadout.vpcf', 'hero', { once: true }],
];

// ---------------------------------------------------------------- models
// Resource external references (the RERL block) of a compiled file.
function references(path) {
  const b = readFileSync(join(game, `${path}_c`)), v = new DataView(b.buffer, b.byteOffset);
  const refs = [];
  for (let i = 0, at = 8 + v.getUint32(8, true); i < v.getUint32(12, true); i++, at += 12) {
    if (b.toString('latin1', at, at + 4) !== 'RERL') continue;
    const data = at + 4 + v.getUint32(at + 4, true), entries = data + v.getUint32(data, true), count = v.getUint32(data + 4, true);
    for (let k = 0; k < count; k++) { const e = entries + 16 * k, s = e + 8 + v.getUint32(e + 8, true); refs.push(b.toString('utf8', s, b.indexOf(0, s))); }
  }
  return refs;
}
function readGlb(file) {
  const b = readFileSync(file), jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength, bin = binStart < b.length ? b.subarray(binStart + 8, binStart + 8 + b.readUInt32LE(binStart)) : Buffer.alloc(0);
  return { json, bin };
}
function writeGlb(file, json, bin) {
  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(JSON.stringify(json)), 0x20), b = pad(bin, 0);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + j.length + (b.length ? 8 + b.length : 0), 8);
  const chunk = (buffer, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buffer.length, 0); h.writeUInt32LE(type, 4); return [h, buffer]; };
  writeFileSync(file, Buffer.concat([header, ...chunk(j, 0x4e4f534a), ...(b.length ? chunk(b, 0x004e4942) : [])]));
}
// Morph targets (facial flexes) are not used by the page: dropped, and the binary chunk rebuilt with
// only the buffer views still referenced.
function compact(json, bin) {
  for (const mesh of json.meshes || []) { delete mesh.weights; delete mesh.extras; for (const p of mesh.primitives) delete p.targets; }
  const used = new Set();
  const mark = (i) => { if (i !== undefined) used.add(i); };
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) { Object.values(p.attributes).forEach(mark); mark(p.indices); }
  for (const skin of json.skins || []) mark(skin.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) { mark(s.input); mark(s.output); }
  const accessors = [], accessorMap = new Map(), views = [], viewMap = new Map(), chunks = []; let offset = 0;
  for (const [i, accessor] of (json.accessors || []).entries()) {
    if (!used.has(i)) continue;
    if (accessor.bufferView !== undefined && !viewMap.has(accessor.bufferView)) {
      const view = json.bufferViews[accessor.bufferView], data = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
      const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
      viewMap.set(accessor.bufferView, views.length); views.push({ ...view, buffer: 0, byteOffset: offset }); chunks.push(data); offset += data.length;
    }
    accessorMap.set(i, accessors.length); accessors.push({ ...accessor, bufferView: viewMap.get(accessor.bufferView) });
  }
  const remap = (i) => accessorMap.get(i);
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) { for (const k of Object.keys(p.attributes)) p.attributes[k] = remap(p.attributes[k]); if (p.indices !== undefined) p.indices = remap(p.indices); }
  for (const skin of json.skins || []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remap(skin.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) { s.input = remap(s.input); s.output = remap(s.output); }
  json.accessors = accessors; json.bufferViews = views; const out = Buffer.concat(chunks); json.buffers = [{ byteLength: out.length }];
  return out;
}
const materials = {}, modelFiles = {};
for (const [name, path] of Object.entries(MODELS)) {
  const dir = join(temp, 'glb', name), file = join(dir, `${name}.glb`); mkdirSync(dir, { recursive: true });
  const args = ['-i', join(game, `${path}_c`), '--game', gameinfo, '-o', file, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_textures_adapt'];
  // The skeleton only comes with animations exported; items take the hero's, so only the hero keeps its clips.
  args.push('--gltf_export_animations'); if (name === 'hero') args.push('--gltf_animation_list', ANIMATIONS.join(','));
  run(args);
  const { json, bin } = readGlb(file);
  // The normal maps come adapted to glTF by the exporter; everything else is read from the material.
  for (const material of json.materials || []) {
    const normal = json.images?.[json.textures?.[material.normalTexture?.index]?.source]?.uri;
    materials[material.name] = { normalFile: normal ? join(dir, normal) : null };
  }
  for (const m of json.materials || []) { for (const k of ['pbrMetallicRoughness', 'normalTexture', 'occlusionTexture', 'emissiveTexture']) delete m[k]; delete m.extensions; }
  delete json.images; delete json.textures; delete json.samplers; if (name !== 'hero') delete json.animations;
  for (const n of json.nodes || []) if (n.name?.includes('/')) n.name = basename(n.name).replace(/\.vmdl_c.*/, '');
  for (const m of json.meshes || []) if (m.name?.includes('/')) m.name = basename(m.name);
  writeGlb(join(out, 'models', `${name}.glb`), json, compact(json, bin));
  modelFiles[name] = `models/${name}.glb`;
  for (const ref of references(path)) if (ref.endsWith('.vmat')) materials[basename(ref, '.vmat')] = { ...materials[basename(ref, '.vmat')], vmat: ref };
}

// ---------------------------------------------------------------- materials
// Normal maps come with alpha 0, and canvas decoding premultiplies it away with the colour: they
// are read here straight from the PNG (8-bit RGB/RGBA, not interlaced) and made opaque.
function readPng(file) {
  const b = readFileSync(file), idat = []; let width = 0, height = 0, type = 0;
  for (let at = 8; at < b.length;) { const length = b.readUInt32BE(at), kind = b.toString('latin1', at + 4, at + 8), data = b.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12]) throw new Error(`${file}: нужен 8-битный PNG без чересстрочности.`); }
    else if (kind === 'IDAT') idat.push(data); at += 12 + length; }
  const channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[type], raw = inflateSync(Buffer.concat(idat)), stride = width * channels, out = new Uint8ClampedArray(width * height * 4), prev = new Uint8Array(stride), row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0, up = prev[x], c = x >= channels ? prev[x - channels] : 0, v = line[x];
      const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c), paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      row[x] = filter === 1 ? v + a : filter === 2 ? v + up : filter === 3 ? v + ((a + up) >> 1) : filter === 4 ? v + paeth : v;
    }
    for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; out[o] = row[x * channels]; out[o + 1] = row[x * channels + (channels > 2 ? 1 : 0)]; out[o + 2] = row[x * channels + (channels > 2 ? 2 : 0)]; out[o + 3] = 255; }
    prev.set(row);
  }
  const canvas = createCanvas(width, height); canvas.getContext('2d').putImageData(new ImageData(out, width, height), 0, 0); return canvas;
}
async function image(file) { return loadImage(readFileSync(file)); }
function channel(img, size) { const c = createCanvas(size, size).getContext('2d'); c.drawImage(img, 0, 0, size, size); return c.getImageData(0, 0, size, size).data; }
async function webp(canvas, file, quality = 90) { writeFileSync(file, await canvas.encode('webp', quality)); return basename(file); }
const vector = (text) => (text || '').replace(/[[\]]/g, '').trim().split(/\s+/).map(Number);
const details = new Map();
for (const [name, entry] of Object.entries(materials)) {
  if (!entry.vmat) { delete materials[name]; continue; }
  const dir = join(temp, 'vmat', name); decompile(entry.vmat, join(dir, `${name}.vmat`));
  const text = readFileSync(join(dir, `${name}.vmat`), 'utf8'), p = Object.fromEntries([...text.matchAll(/^\t"([^"]+)"\t"([^"]*)"/gm)].map((m) => [m[1], m[2]]));
  const pick = (suffix) => { const f = readdirSync(dir).find((x) => x.endsWith(`${suffix}.png`)); return f ? join(dir, f) : null; };
  const scroll = /float2\(([-.\d]+),([-.\d]+)\)/.exec(text.split('"DynamicParams"')[1] || '');
  // Colour with the alpha-test mask in alpha.
  // Textures need not be square (Souls Tyrant's are 512 × 256): the colour keeps its own shape, the
  // masks below are stretched to squares, which keeps their UVs.
  const color = await image(pick('_color')), size = color.width, c = createCanvas(color.width, color.height), cc = c.getContext('2d'); cc.drawImage(color, 0, 0);
  const trans = pick('_trans');
  if (trans) { const t = createCanvas(c.width, c.height).getContext('2d'); t.drawImage(await image(trans), 0, 0, c.width, c.height); const a = t.getImageData(0, 0, c.width, c.height).data, d = cc.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < a.length; i += 4) d.data[i + 3] = a[i]; cc.putImageData(d, 0, 0); }
  // Masks and the specular texture are saved lossless (WebP quality 100): lossy WebP halves the
// colour resolution and bleeds one mask into another along thin trims.
// Masks: R detail (where the fire shows), G self-illumination, B rim light; the specular mask
  // apart (a canvas keeps colour premultiplied, so a fourth mask in alpha would erase the others).
  const ms = Math.min(size, 512), masks = createCanvas(ms, ms), mc = masks.getContext('2d'), md = mc.createImageData(ms, ms);
  const layers = await Promise.all(['_detailmask', '_selfillummask', '_rimmask', '_specmask'].map(async (s) => (pick(s) ? channel(await image(pick(s)), ms) : null)));
  for (let i = 0; i < md.data.length; i += 4) { for (let k = 0; k < 3; k++) md.data[i + k] = layers[k] ? layers[k][i] : 0; md.data[i + 3] = 255; }
  mc.putImageData(md, 0, 0);
  // Specular texture: R specular, G metalness, B «tint specular by base colour» (Dota's masks).
  const ss = Math.min(ms, 512), spec = createCanvas(ss, ss), sc = spec.getContext('2d'), sd = sc.createImageData(ss, ss);
  const specLayers = await Promise.all(['_specmask', '_metalnessmask', '_basetintmask'].map(async (s) => (pick(s) ? channel(await image(pick(s)), ss) : null)));
  for (let i = 0; i < sd.data.length; i += 4) { for (let k = 0; k < 3; k++) sd.data[i + k] = specLayers[k] ? specLayers[k][i] : 0; sd.data[i + 3] = 255; }
  sc.putImageData(sd, 0, 0);
  const normal = entry.normalFile && existsSync(entry.normalFile) ? readPng(entry.normalFile) : null, n = normal && createCanvas(Math.min(normal.width, 1024), Math.min(normal.width, 1024));
  // The normal's blue channel (rebuilt from red and green on the page) carries the specular exponent mask.
  if (n) { const nc = n.getContext('2d'); nc.drawImage(normal, 0, 0, n.width, n.height); const exponent = pick('_specexp') && channel(await image(pick('_specexp')), n.width), d = nc.getImageData(0, 0, n.width, n.height);
    for (let i = 0; i < d.data.length; i += 4) d.data[i + 2] = exponent ? exponent[i] : 255; nc.putImageData(d, 0, 0); }
  // The fresnel warp (R rim, G colour, B specular by the angle to the eye), shared by materials.
  const warp = /"g_tFresnelWarp"\s+"([^"]+)\.vtex"/.exec(text)?.[1], warpName = warp ? basename(warp).replace(/_tga_|_psd_/, '_') : null;
  if (warp && !details.has(warpName)) { decompile(`${warp}.vtex`, join(temp, 'warp', 'warp.png')); details.set(warpName, await webp(readPng(join(temp, 'warp', `${basename(warp)}.png`)), join(out, 'textures', `${warpName}.webp`), 100)); }
  const detailName = p.TextureDetail ? basename(p.TextureDetail).replace(/\.\w+$/, '') : null;
  if (detailName && !details.has(detailName)) { const f = pick(`${detailName.replace(/^.*\//, '')}`) || join(dir, basename(p.TextureDetail)); if (existsSync(f)) { const d = await image(f), dc = createCanvas(d.width, d.height); dc.getContext('2d').drawImage(d, 0, 0); details.set(detailName, await webp(dc, join(out, 'textures', `${detailName}.webp`))); } }
  materials[name] = {
    color: await webp(c, join(out, 'textures', `${name}_color.webp`)), masks: await webp(masks, join(out, 'textures', `${name}_masks.webp`), 100), specular: await webp(spec, join(out, 'textures', `${name}_specular.webp`), 100),
    normal: n ? await webp(n, join(out, 'textures', `${name}_normal.webp`), 92) : null, detail: detailName ? details.get(detailName) || null : null, fresnel: warpName ? details.get(warpName) : null,
    detailMode: +(p.F_DETAIL || 0), detailScale: vector(p.g_vDetailTexCoordScale).slice(0, 2), detailScroll: scroll ? [+scroll[1], +scroll[2]] : [0, 0], detailBlend: +(p.g_flDetailBlendFactor ?? 1),
    rimColor: vector(p.g_vRimLightColor).slice(0, 3), rimScale: +(p.g_flRimLightScale ?? 0), specColor: vector(p.g_vSpecularColor).slice(0, 3), specScale: +(p.g_flSpecularScale ?? 1),
    specExponent: +(p.g_flSpecularExponent ?? 16), alphaTest: p.F_ALPHA_TEST === '1' ? +(p.g_flAlphaTestReference ?? 0.5) : 0,
  };
}

// ---------------------------------------------------------------- effects
const systems = {}, textureSet = new Set(), snapshotSet = new Set();
const collect = (o) => { if (Array.isArray(o)) o.forEach(collect); else if (o && typeof o === 'object') Object.values(o).forEach(collect); else if (typeof o === 'string') { if (o.endsWith('.vtex')) textureSet.add(o); if (o.endsWith('.vsnap')) snapshotSet.add(o); } };
function loadSystem(path) {
  const key = path.replace(/\.vpcf$/, ''); if (systems[key]) return;
  const file = join(temp, 'vpcf', path); decompile(path, file);
  const def = parseKV3(readFileSync(file, 'utf8')); systems[key] = def; collect(def);
  for (const child of def.m_Children || []) if (child.m_ChildRef) loadSystem(child.m_ChildRef);
}
for (const [path] of EFFECTS) loadSystem(path);

// Particle textures; sprite sheets come out of the CLI as frames cropped to their content, put back
// at their own rectangles so the sheet's UVs are Valve's.
const textures = {};
for (const vtex of [...textureSet].sort()) {
  const base = basename(vtex, '.vtex'), dir = join(temp, 'vtex', base), name = vtex.replace(/^materials\/particle\//, '').replace(/\.vtex$/, '').replace(/\//g, '__');
  decompile(vtex, join(dir, `${base}.vtex`));
  const info = run(['-i', join(game, `${vtex}_c`), '-b', 'DATA']);
  const width = +/Width\s+=\s+(\d+)/.exec(info)[1], height = +/Height\s+=\s+(\d+)/.exec(info)[1];
  const rect = (text, kind) => { const m = new RegExp(`\\[\\d+\\.\\d+\\.0\\] ${kind}\\s+=\\s+\\{ \\( ([-\\d.]+), ([-\\d.]+) \\), \\( ([-\\d.]+), ([-\\d.]+) \\) \\}`).exec(text); return m ? m.slice(1, 5).map(Number) : null; };
  const sequences = [];
  const parts = info.split(/\[Sequence (\d+)\]:/);
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1], frames = [];
    for (const f of text.split(/\[Sequence \d+ Frame \d+\]:/).slice(1)) { const uv = rect(f, 'uvUncropped'); if (uv) frames.push({ time: +(/m_flDisplayTime\s+=\s+([\d.]+)/.exec(f)?.[1] ?? 1), uv, crop: rect(f, 'uvCropped') || uv }); }
    sequences[+parts[i]] = { clamp: /m_bClamp\s+=\s+True/.test(text), frames };
  }
  let img;
  if (sequences.length) {
    const canvas = createCanvas(width, height), c = canvas.getContext('2d');
    for (const [s, seq] of sequences.entries()) for (const [f, frame] of (seq?.frames || []).entries()) {
      const file = [join(dir, `${base}_seq${s}_${f}.png`), join(dir, `${base}_seq${s}.png`)].find(existsSync); if (!file) continue;
      c.drawImage(await image(file), Math.round(frame.crop[0] * width), Math.round(frame.crop[1] * height));
    }
    img = canvas;
  } else img = await image(join(dir, `${base}.png`));
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height)), final = createCanvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
  final.getContext('2d').drawImage(img, 0, 0, final.width, final.height);
  textures[vtex] = { file: await webp(final, join(out, 'fx', `${name}.webp`), 92), sequences: sequences.length ? sequences.filter(Boolean) : null };
}

// Snapshots: points on the model with their bones (or rigid, without).
const snapshots = {};
for (const path of [...snapshotSet].sort()) {
  const text = run(['-i', join(game, `${path}_c`), '-a']).split('--- Data for block "SNAP" ---')[1] || '', attributes = {};
  for (const m of text.matchAll(/- Attribute (\w+) \((\w+)\) -\n([\s\S]*?)(?=\n- Attribute|$)/g)) {
    const rows = m[3].trim().split('\n').filter((l) => l.trim());
    if (m[2] === 'float3' || m[2] === 'vector') attributes[m[1]] = rows.map((r) => (r.match(/[-\d.eE+]+/g) || []).map(Number));
    else if (m[2] === 'skinning') attributes[m[1]] = rows.map((r) => [...r.matchAll(/\(([^:()]*): ([-\d.eE+]+)\)/g)].filter((x) => x[1]).map((x) => [x[1], +x[2]]));
  }
  snapshots[path] = attributes;
}

// Rigid snapshots (no bone weights, like the Desolation blades) hold points in one bone's space:
// the bone is found by fitting the points to the models' vertices in the bind pose.
const S2G = new Matrix4().compose(new Vector3(), new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, -Math.PI / 2, 'YXZ')), new Vector3(0.0254, 0.0254, 0.0254)), G2S = S2G.clone().invert();
const floats = (json, bin, index) => { const a = json.accessors[index], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], start = (v.byteOffset || 0) + (a.byteOffset || 0);
  return new Float32Array(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * n * 4)); };
const vertices = [], frames = new Map();
for (const name of ['hero', 'head', 'arms', 'shoulders']) {
  const { json, bin } = readGlb(join(out, 'models', `${name}.glb`));
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) { const f = floats(json, bin, p.attributes.POSITION); for (let i = 0; i < f.length; i += 3) vertices.push(new Vector3(f[i], f[i + 1], f[i + 2]).applyMatrix4(G2S)); }
  for (const skin of json.skins || []) { const ibm = floats(json, bin, skin.inverseBindMatrices);
    skin.joints.forEach((joint, k) => { const bone = json.nodes[joint].name; if (!frames.has(bone)) frames.set(bone, G2S.clone().multiply(new Matrix4().fromArray(ibm, k * 16).invert()).multiply(new Matrix4().makeScale(0.0254, 0.0254, 0.0254))); }); }
}
const fitBone = (points) => {
  const nearest = (p) => { let d = Infinity; for (const v of vertices) d = Math.min(d, v.distanceToSquared(p)); return Math.sqrt(d); };
  let best = null;
  for (const [bone, frame] of frames) { const error = points.reduce((sum, p) => sum + nearest(new Vector3(...p).applyMatrix4(frame)), 0) / points.length; if (!best || error < best.error) best = { bone, error }; }
  return best;
};
for (const [path, snapshot] of Object.entries(snapshots)) {
  if (snapshot.skinning?.length || !snapshot.position?.length) continue;
  const fit = fitBone(snapshot.position);
  if (fit.error < 6) snapshot.bone = fit.bone;
  console.log(`${basename(path)}: кость ${fit.bone}, отклонение ${fit.error.toFixed(1)} дюйма`);
}

// Attachments of every model (bone, offset in inches and rotation in the bone's space).
const attachments = {};
for (const [name, path] of Object.entries(MODELS)) {
  const text = run(['-i', join(game, `${path}_c`), '-a']), list = {};
  for (const m of text.matchAll(/m_attachments =\s*\[/g)) {
    let depth = 0, end = m.index + m[0].length - 1;
    for (let i = end; i < text.length; i++) { if (text[i] === '[') depth++; else if (text[i] === ']' && --depth === 0) { end = i; break; } }
    for (const e of parseKV3(`{ a = ${text.slice(m.index + m[0].length - 1, end + 1)} }`).a) {
      const v = e.value, n = v.m_nInfluences;
      list[v.m_name] = { bones: v.m_influenceNames.slice(0, n), offsets: v.m_vInfluenceOffsets.slice(0, n), rotations: v.m_vInfluenceRotations.slice(0, n), weights: v.m_influenceWeights.slice(0, n) };
    }
  }
  attachments[name] = list;
}

// The hero page's light and camera for Shadow Fiend (scripts/npc/portraits_full_body_loadout.txt,
// the full-body loadout portraits): the key light's angles, colour and scale, the directional
// ambient, the fill in shadow and the default camera, in the game's units.
const portraits = readFileSync(join(game, 'scripts/npc/portraits_full_body_loadout.txt'), 'utf8');
const portrait = portraits.slice(portraits.indexOf('"npc_dota_hero_nevermore"')).split(/\n\t"npc_dota_hero_/)[0];
const value = (key, text = portrait) => (new RegExp(`"${key}"\\s+"([^"]+)"`).exec(text)?.[1] || '').trim().split(/\s+/).map(Number);
const defaultCamera = portrait.slice(portrait.indexOf('"default"'));
const lighting = {
  light: { angles: value('PortraitLightAngles'), color: value('PortraitLightColor'), scale: value('PortraitLightScale')[0] },
  ambient: { angles: value('PortraitAmbientDirection'), color: value('PortraitAmbientColor'), scale: value('PortraitAmbientScale')[0] },
  shadow: { color: value('PortraitShadowColor'), scale: value('PortraitShadowScale')[0] },
  camera: { position: value('PortraitPosition', defaultCamera), angles: value('PortraitAngles', defaultCamera), fov: value('PortraitFOV', defaultCamera)[0] },
};
if (lighting.light.angles.length !== 3 || lighting.camera.position.length !== 3) throw new Error('Не нашёл свет Shadow Fiend в portraits_full_body_loadout.txt');

writeFileSync(join(out, 'hero.json'), JSON.stringify({
  models: modelFiles, animations: { entry: ANIMATIONS[0], idle: ANIMATIONS[1], taunt: ANIMATIONS[2] }, materials, lighting,
  effects: EFFECTS.map(([path, owner, options]) => ({ system: path.replace(/\.vpcf$/, ''), owner, ...options })),
  systems, textures, snapshots, attachments,
}));
rmSync(temp, { recursive: true, force: true });
console.log(`Готово: ${Object.keys(modelFiles).length} моделей, ${Object.keys(materials).length} материалов, ${Object.keys(systems).length} систем частиц, ${Object.keys(textures).length} текстур эффектов → ${out}`);
