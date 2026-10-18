// The d2pfx click mods' real effect for the match preview (2026-10-17): each «Клик» mod of the page
// (scripts/d2pfx-mods.mjs, section click) replaces Valve's move-click particles
// (particles/ui_mouseactions/clicked_occlusion_*.vpcf_c; some bring textures of their own). This script
// decompiles the mod's files the way src/customize/click-fx.json was made from Valve's — Source 2 Viewer's
// CLI turns vpcf_c into KeyValues3 text and vtex_c into PNG — and keeps only what scripts/click-fx.mjs
// simulates, so the preview plays the mod's own particles, not a recolouring of Valve's:
//   node scripts/make-d2pfx-click.mjs --s2v <Source2Viewer-CLI> [--cache <dir>]
// → assets/d2pfx-click/<mod id>/fx.json ({ mod, credits, page, commit, systems }: the systems the mod replaces,
// by name, over click-fx.json's) and the PNG textures it adds that Valve's set (assets/dota-click) lacks
// (at most 256 px).
// The mods' files come from d2pfx at the catalog's commit (src/customize/d2pfx-mods.json); each mod stays
// its author's, credited in fx.json and on the page.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKV3 } from './kv3.mjs';
import { readVPK, buildVPK } from './vpk.mjs';
import { readZip } from './zip.mjs';
import { md5 } from './md5.mjs';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const s2v = arg('--s2v') || process.env.S2V;
if (!s2v || !existsSync(s2v)) throw new Error('Source 2 Viewer CLI: --s2v <path to Source2Viewer-CLI>');
const cache = arg('--cache') || join(root, 'node_modules/.cache/d2pfx');
const catalog = JSON.parse(readFileSync(join(root, 'src/customize/d2pfx-mods.json'), 'utf8'));
const valve = JSON.parse(readFileSync(join(root, 'src/customize/click-fx.json'), 'utf8'));
const valveTextures = new Set(readdirSync(join(root, 'assets/dota-click')).map((name) => name.replace(/(?:_seq\d+)?\.png$/, '')));

// The same reduction as click-fx.json's (the systems' constants, emitters, initializers, operators,
// renderers and children; PF_TYPE_LITERAL numbers as plain numbers; colours, textures, children by name).
const KEEP = ['m_nMaxParticles', 'm_flConstantRadius', 'm_nConstantSequenceNumber', 'm_flConstantLifespan', 'm_ConstantColor', 'm_ForceGenerators'];
const compact = (v) => (Array.isArray(v) ? v.map(compact) : v && typeof v === 'object'
  ? (v.m_nType === 'PF_TYPE_LITERAL' ? v.m_flLiteralValue ?? 0 : Object.fromEntries(Object.entries(v).filter(([k]) => !['m_bShouldHitboxesFallbackToRenderBounds', 'm_controlPointConfigurations'].includes(k)).map(([k, x]) => [k, compact(x)])))
  : v);
const texture = (value) => /materials\/particle\/(?:lens_flare\/)?([a-z0-9_]+)\.vtex/.exec(value)?.[1];
function slim(v) {
  if (Array.isArray(v)) return v.map(slim);
  if (v && typeof v === 'object') {
    if (v.m_nType === 'PVEC_TYPE_LITERAL_COLOR') return { color: v.m_LiteralColor };
    if ('m_hTexture' in v) return { texture: texture(v.m_hTexture), ...(v.m_TextureControls || {}) };
    if ('m_nControlPoint' in v && Object.keys(v).length <= 2) return v.m_nControlPoint;
    return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'm_LocalSpaceTransform').map(([k, x]) => [k, slim(x)]));
  }
  if (typeof v === 'string' && /particles\/ui_mouseactions\/[a-z0-9_]+\.vpcf$/.test(v)) return /ui_mouseactions\/([a-z0-9_]+)\.vpcf$/.exec(v)[1];
  return v;
}
export function systemOf(text) {
  const d = compact(parseKV3(text)), s = Object.fromEntries(KEEP.filter((k) => k in d).map((k) => [k, d[k]]));
  for (const section of ['m_Emitters', 'm_Initializers', 'm_Operators', 'm_Renderers']) s[section.slice(2).toLowerCase()] = slim(d[section] || []);
  s.children = (d.m_Children || []).map((child) => slim(child.m_ChildRef));
  return s;
}
const texturesOf = (system) => system.renderers.flatMap((r) => (r.m_vecTexturesInput || []).map((input) => input.texture)).filter(Boolean);

// The check: Valve's own decompiled files through this reduction give click-fx.json's systems.
const valveDir = arg('--valve');
if (valveDir) for (const name of Object.keys(valve.systems)) {
  const file = join(valveDir, `${name}.vpcf`);
  if (existsSync(file) && JSON.stringify(systemOf(readFileSync(file, 'utf8'))) !== JSON.stringify(valve.systems[name])) throw new Error(`${name}: the reduction differs from click-fx.json`);
}

const out = join(root, 'assets/d2pfx-click');
for (const mod of Object.values(catalog.mods).filter((item) => item.section === 'click')) {
  const file = join(cache, catalog.commit, createHash('sha1').update(mod.file).digest('hex'));
  let bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : new Uint8Array(await (await fetch(mod.file)).arrayBuffer());
  if (mod.inner) bytes = (await readZip(bytes, { want: (name) => name === mod.inner })).find((entry) => entry.name === mod.inner).data;
  const work = mkdtempSync(join(tmpdir(), 'd2pfx-click-')), input = join(work, 'mod_dir.vpk');
  try {
    // Only the particles and their textures, in a VPK of their own, decompiled.
    writeFileSync(input, buildVPK(readVPK(bytes).files.filter((f) => /^(?:particles|materials)\//.test(f.path)).map((f) => ({ path: f.path, data: f.data })), { md5 }));
    execFileSync(s2v, ['-i', input, '-o', join(work, 'out'), '-d'], { stdio: 'ignore' });
    const dir = join(work, 'out/particles/ui_mouseactions'), systems = {};
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.vpcf')).sort()) systems[name.slice(0, -5)] = systemOf(readFileSync(join(dir, name), 'utf8'));
    const target = join(out, mod.id);
    rmSync(target, { recursive: true, force: true }); mkdirSync(target, { recursive: true });
    const own = [...new Set(Object.values(systems).flatMap(texturesOf))].filter((name) => !valveTextures.has(name));
    for (const name of own) {
      const png = join(work, 'out/materials/particle', `${name}.png`);
      if (!existsSync(png)) throw new Error(`${mod.name}: texture ${name} not decompiled`);
      // Small for the page: a glow drawn a few dozen pixels wide needs no 512-px picture (as Valve's 128-px one).
      const { width } = await sharp(png).metadata();
      if (width > 256) await sharp(png).resize(256, 256).png({ compressionLevel: 9 }).toFile(join(target, `${name}.png`));
      else copyFileSync(png, join(target, `${name}.png`));
    }
    // What the simulation does not run, for the record (it draws the rest and skips these).
    const classes = new Set(Object.values(systems).flatMap((s) => [...s.emitters, ...s.initializers, ...s.operators, ...s.renderers].map((x) => x._class)));
    const known = new Set(Object.values(valve.systems).flatMap((s) => [...s.emitters, ...s.initializers, ...s.operators, ...s.renderers].map((x) => x._class)));
    const unknown = [...classes].filter((c) => !known.has(c));
    writeFileSync(join(target, 'fx.json'), `${JSON.stringify({ mod: mod.name, credits: mod.credits, page: mod.page, commit: catalog.commit, systems, textures: own })}\n`);
    console.log(`${mod.id}: ${Object.keys(systems).length} systems, textures ${own.join(', ') || '—'}${unknown.length ? `, not simulated: ${unknown.join(', ')}` : ''}`);
  } finally { rmSync(work, { recursive: true, force: true }); }
}
