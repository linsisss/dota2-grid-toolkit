// Makes the list of d2pfx mods the customization page offers (scripts/d2pfx-mods.mjs says which and why):
//   node scripts/make-d2pfx-catalog.mjs [--commit <sha>] [--cache <dir>]
// It reads d2pfx's index (assets/data/mods.json, constants.json) at one commit of h6rd/Dota2PornFxWeb
// (main's latest when none is given), downloads every listed mod at that commit, opens its VPK and writes:
//   src/customize/d2pfx-mods.json — for the page: each mod's names, d2pfx's picture and video, its credits
//     (scripts/d2pfx.mjs d2pfxCredits), the file's address at that commit, sizes, and the paths two slots'
//     mods share (for the «one file, one winner» notes);
//   server/d2pfx-files.json — for the server: every game file's path and SHA-256 (and of our few fixed
//     files, D2PFX_FIXES in scripts/d2pfx-mods.mjs), so the PowerShell command's pack carries only d2pfx's
//     own files, byte for byte, or our fixed ones (server/install-packs.mjs).
// A mod whose Panorama files call out to the web or run scripts is left out (none did on 2026-10-17).
// Run it again to take d2pfx's newer mods; the page then fetches them at the new commit.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { D2PFX, d2pfxCredits, d2pfxPath } from './d2pfx.mjs';
import { D2PFX_FILE, D2PFX_SECTIONS, d2pfxFixed, d2pfxSlug } from './d2pfx-mods.mjs';
import { crc32, readVPK } from './vpk.mjs';
import { readZip } from './zip.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const cache = arg('--cache') || join(root, 'node_modules/.cache/d2pfx');
const get = async (url, type = 'buffer') => {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': 'GridStudio d2pfx catalog' } });
    if (response.ok) return type === 'json' ? response.json() : new Uint8Array(await response.arrayBuffer());
    if (attempt >= 3) throw new Error(`${url}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
};
const commit = arg('--commit') || (await get('https://api.github.com/repos/h6rd/Dota2PornFxWeb/commits/main', 'json')).sha;
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Bad commit ${commit}`);
const raw = `https://raw.githubusercontent.com/h6rd/Dota2PornFxWeb/${commit}`;
const [index, constants] = await Promise.all([get(`${raw}/assets/data/mods.json`, 'json'), get(`${raw}/assets/data/constants.json`, 'json')]);

// A file of d2pfx at the commit, kept in the cache by its address.
async function download(url) {
  const file = join(cache, commit, createHash('sha1').update(url).digest('hex'));
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const bytes = await get(url);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return bytes;
}
// Text Panorama files must not reach out: no web address, no inline script, no web request.
function unsafe(path, data) {
  if (!/\.(?:vcss_c|vxml_c)$/.test(path)) return '';
  const text = new TextDecoder('latin1').decode(data);
  const url = (text.match(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]*/gi) || []).find((value) => !/^(?:s2r:\/\/(?:panorama|materials)\/|file:\/\/\{(?:images|resources)\}\/)/i.test(value));
  if (url) return `address ${url}`;
  if (/AsyncWebRequest|XMLHttpRequest|WebSocket|<script(?!s\s*>)|javascript:/i.test(text)) return 'script';
  return '';
}

const mods = {}, files = {}, slotsOf = new Map(), left = [];
for (const [section, def] of Object.entries(D2PFX_SECTIONS)) {
  const category = index.modsData[def.category], list = def.group ? category.groups.find((group) => group.id === def.group).mods : category;
  for (const [slot, names] of Object.entries(def.slots)) {
    const wanted = names || list.map((mod) => mod.name);
    for (const want of wanted) {
      const [name, style = ''] = want.split('|'), mod = list.find((item) => item.name === name);
      if (!mod) { left.push(`${section}/${slot}: ${want} — not in d2pfx`); continue; }
      const variant = mod.styles ? mod.styles.find((item) => (item.label || 'I') === (style || 'I')) : mod;
      if (!variant?.file) { left.push(`${want} — no file`); continue; }
      const url = `${raw}/assets/files/${def.category}/${d2pfxPath(variant.file)}`, bytes = await download(url);
      let vpk = bytes, inner = '';
      if (/\.zip$/i.test(variant.file)) {
        const entries = (await readZip(bytes, { limit: 300_000_000 })).filter((entry) => /(?:^|\/)pak\d+_dir\.vpk$/i.test(entry.name));
        if (entries.length !== 1) { left.push(`${want} — ${entries.length} VPKs in its ZIP`); continue; }
        vpk = entries[0].data; inner = entries[0].name;
      }
      const game = readVPK(vpk).files.filter((file) => D2PFX_FILE.test(file.path));
      const problem = game.map((file) => (crc32(file.data) !== file.crc ? `${file.path}: CRC` : unsafe(file.path, file.data))).find(Boolean);
      if (!game.length || problem) { left.push(`${want} — ${problem || 'no game files'}`); continue; }
      const id = d2pfxSlug(name, style), video = (mod.links || []).find((link) => link.type === 'preview')?.url || '';
      // d2pfx's files and our fixed ones (D2PFX_FIXES: the page builds those in their place).
      for (const file of [...game, ...d2pfxFixed(id, game).filter((fixed, i) => fixed !== game[i])]) {
        const sha = createHash('sha256').update(file.data).digest('hex');
        if (!(files[file.path] ||= []).includes(sha)) files[file.path].push(sha);
        if (!slotsOf.has(file.path)) slotsOf.set(file.path, new Set());
        slotsOf.get(file.path).add(`${section}/${slot}`);
      }
      mods[id] = {
        id, section, slot, name, style: mod.styles ? style || 'I' : '', category: def.category,
        preview: variant.preview ? `${D2PFX.site}assets/previews/${def.category}/${d2pfxPath(variant.preview)}` : '',
        video: /^assets\/previews\/.+\.(?:mp4|webm)$/i.test(video) ? `${D2PFX.site}${d2pfxPath(video)}` : '',
        youtube: /^https:\/\/(?:www\.)?(?:youtu\.be|youtube\.com)\//.test(video) ? video : '',
        page: `${D2PFX.site}?category=${def.category}&mod=${encodeURIComponent(name)}`,
        credits: d2pfxCredits(mod, constants), file: url, inner,
        bytes: game.reduce((sum, file) => sum + file.data.length, 0), count: game.length,
        restyle: game.some((file) => /\.vcss_c$/.test(file.path)), layout: game.some((file) => /\.vxml_c$/.test(file.path)),
        paths: game.map((file) => file.path)
      };
      process.stdout.write(`${section}/${slot}: ${want} · ${game.length} files · ${(mods[id].bytes / 1e6).toFixed(2)} MB\n`);
    }
  }
}
// Paths that more than one slot's mods bring: only those can make two choices fight.
const shared = [...slotsOf].filter(([, slots]) => slots.size > 1).map(([path]) => path).sort();
const at = new Map(shared.map((path, i) => [path, i]));
for (const mod of Object.values(mods)) { mod.shared = mod.paths.filter((path) => at.has(path)).map((path) => at.get(path)); delete mod.paths; }
const made = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, 'src/customize/d2pfx-mods.json'), `${JSON.stringify({ source: D2PFX.repo, commit, made, shared, mods })}\n`);
writeFileSync(join(root, 'server/d2pfx-files.json'), `${JSON.stringify({ source: D2PFX.repo, commit, made, files })}\n`);
console.log(`\n${Object.keys(mods).length} mods, ${Object.keys(files).length} paths, ${shared.length} shared, commit ${commit}`);
if (left.length) console.log(`Left out:\n  ${left.join('\n  ')}`);
