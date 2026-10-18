#!/usr/bin/env node
// The minigames' assets (docs/minigames.md): from the user's Dota 2 files, exported and decompiled by
// Source 2 Viewer, into assets/minigames/<id>/ — the only place the site keeps Valve's minigame files,
// so they can be removed at once. What goes where is listed by src/minigames/core/pipeline.mjs (the
// picker, shared files, the visual novel) and src/minigames/games/<id>/pipeline.mjs (each game).
//
//   node scripts/make-minigame-assets.mjs --src <export dir> [ids…] [--refresh] [--offline] [--force] [--verbose]
//
//   --src       the decompiled export (panorama/images/**/*.png, sounds/**/*.{mp3,wav,vsnd}, scripts/**/*.vdata, …);
//               or MINIGAMES_SRC in the environment
//   ids         only these folders (picker, shared, novel, sweeper, spoon, fishing, race)
//   --refresh   download Valve's text files again (soundevents, localization) instead of the cache
//   --offline   use the cache only
//   --force     convert every file again
//
// Per folder it writes:
//   images/*.webp       PNG → WebP: lossless for small pictures, pixel art and masks; lossy (q≈90, scaled
//                       down) for big backgrounds and portraits. SVG is copied.
//   sounds/**/*.mp3     the files the folder's sound events use; MP3 copied, WAV → MP3 (LAME VBR q4)
//   sounds.json         the sound events (src/minigames/core/valve-data.mjs buildSoundTable)
//   data.json           vdata (KeyValues 3) → JSON, and Panorama CSS @define constants
//   strings.ru.json, strings.en.json   the Valve strings the folder needs (dota_*.txt, novels/crownfall_*.txt)
//   manifest.json       every file made, from what, its size, and Valve path → file (ctx.asset accepts both)
// Valve's text files come from the dota_vpk_updates mirror and are cached in node_modules/.cache.
// Files that are already up to date are not converted again; files the pipeline did not make are
// never deleted (only listed).
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parseKV3 } from './kv3.mjs';
import { buildSoundTable, cssDefines, localizationTokens, pickStrings, valveKey } from '../src/minigames/core/valve-data.mjs';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/minigames');
const CACHE = join(ROOT, 'node_modules/.cache/minigame-assets');
const MIRROR = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/';
// Bumped when a conversion's settings change, so every file is made again.
const PIPELINE_VERSION = 1;
const LOCALIZATION = {
  ru: ['resource/localization/dota_russian.txt', 'resource/localization/novels/crownfall_russian.txt'],
  en: ['resource/localization/dota_english.txt', 'resource/localization/novels/crownfall_english.txt'],
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : undefined; };
const SRC = resolve(option('src') || process.env.MINIGAMES_SRC || '');
const ONLY = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--src');
const VERBOSE = flag('verbose'), FORCE = flag('force'), REFRESH = flag('refresh'), OFFLINE = flag('offline');

// --- small helpers ------------------------------------------------------------------------------
const posix = (path) => path.split(sep).join('/');
const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`);
const stampOf = (...parts) => createHash('sha1').update(JSON.stringify([PIPELINE_VERSION, ...parts])).digest('hex').slice(0, 16);
async function walk(dir, base = dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, base, found); else found.push(posix(relative(base, path)));
  }
  return found;
}
// A glob of the export: * within a name, ** across folders, {a,b} alternatives.
export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else if (c === '{') { const end = glob.indexOf('}', i); source += `(?:${glob.slice(i + 1, end).split(',').map((part) => part.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`; i = end; }
    else source += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}
const matching = (files, entry) => {
  const pattern = globToRegExp(entry.from), excluded = [].concat(entry.exclude || []);
  return files.filter((file) => pattern.test(file) && !excluded.some((rule) => rule.test(file)));
};
// Valve's texture names end in _png / _psd (and S2V adds a hash to material textures): dropped.
const cleanName = (file) => basename(file).replace(/\.[^.]+$/, '').replace(/_(png|psd|tga)(_[0-9a-f]{8})?$/i, '').toLowerCase();
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
async function pool(jobs, size = Math.max(2, Math.min(8, cpus().length))) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, async () => { while (next < jobs.length) { const at = next++; results[at] = await jobs[at](); } }));
  return results;
}

// Valve's text files: the mirror, cached.
async function valveText(path) {
  const cached = join(CACHE, path);
  if (!REFRESH && existsSync(cached)) return readFile(cached, 'utf8');
  if (OFFLINE) throw new Error(`Нет в кэше и включён --offline: ${path}`);
  const response = await fetch(MIRROR + path);
  if (!response.ok) throw new Error(`${MIRROR + path}: HTTP ${response.status}`);
  const text = await response.text();
  await mkdir(dirname(cached), { recursive: true });
  await writeFile(cached, text);
  return text;
}
const tokenCache = new Map();
// A folder may add its own localization files (config.localization: paths with {language}, e.g. the
// vdata names resource/localization/vdata/<file>/<file>_{language}.txt), read after the shared ones.
const LANGUAGE = { ru: 'russian', en: 'english' };
async function tokens(lang, extra = []) {
  const files = [...LOCALIZATION[lang], ...extra.map((path) => path.replace('{language}', LANGUAGE[lang]))];
  const key = files.join('|');
  if (!tokenCache.has(key)) tokenCache.set(key, Promise.all(files.map(async (path) => localizationTokens(await valveText(path)))).then((parts) => Object.assign({}, ...parts)));
  return tokenCache.get(key);
}

// --- one folder ---------------------------------------------------------------------------------
async function build(config, exportFiles) {
  const dir = join(OUT, config.id);
  await mkdir(dir, { recursive: true });
  const manifestPath = join(dir, 'manifest.json');
  const before = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { files: {} };
  const files = {}, valve = {}, notes = [];
  const jobs = [];
  const fresh = (out, stamp) => !FORCE && before.files?.[out]?.stamp === stamp && existsSync(join(dir, out));
  const claim = (out, from) => {
    if (files[out] && files[out].from !== from) throw new Error(`${config.id}: ${out} — два источника: ${files[out].from} и ${from}. Задайте name или to.`);
  };

  // Pictures: every matching entry's options are merged in order (a later entry refines an earlier one).
  const pictures = new Map();
  for (const entry of config.images || []) {
    const found = matching(exportFiles, entry);
    if (!found.length) notes.push(`нет файлов для ${entry.from}`);
    for (const file of found) {
      const { from, exclude, ...options } = entry;
      pictures.set(file, { ...(pictures.get(file) || {}), ...options });
    }
  }
  for (const [file, options] of pictures) {
    const source = join(SRC, file), info = await stat(source);
    const svg = /\.svg$/i.test(file);
    const out = `${options.to || config.to || 'images'}/${options.name || cleanName(file)}.${svg ? 'svg' : 'webp'}`;
    claim(out, file);
    if (svg) {
      const stamp = stampOf(info.size, info.mtimeMs, 'svg');
      files[out] = { from: file, stamp };
      valve[valveKey(file)] = out;
      if (!fresh(out, stamp)) jobs.push(async () => { await mkdir(dirname(join(dir, out)), { recursive: true }); await copyFile(source, join(dir, out)); return out; });
      continue;
    }
    const size = pngSize(await readFile(source).then((buffer) => buffer.subarray(0, 32)));
    if (!size) { notes.push(`не PNG: ${file}`); continue; }
    // Lossy only when asked, or for a big picture that is not a strip of sprites.
    const big = size.width * size.height > 600_000 && Math.min(size.width, size.height) >= 400;
    const lossy = options.lossless ? null : options.lossy ?? (big ? 90 : null);
    const maxWidth = options.maxWidth ?? (lossy && big ? 1920 : null);
    const width = maxWidth && size.width > maxWidth ? maxWidth : size.width;
    const height = Math.round(size.height * width / size.width);
    const settings = { lossy, width };
    const stamp = stampOf(info.size, info.mtimeMs, settings);
    files[out] = { from: file, width, height, ...(lossy ? { quality: lossy } : { lossless: true }), stamp };
    valve[valveKey(file)] = out;
    if (fresh(out, stamp)) continue;
    jobs.push(async () => {
      await mkdir(dirname(join(dir, out)), { recursive: true });
      const flags = lossy ? ['-q', String(lossy), '-m', '6', '-sharp_yuv', '-alpha_q', '100'] : ['-lossless', '-z', '9'];
      if (width !== size.width) flags.push('-resize', String(width), String(height));
      await run('cwebp', ['-quiet', '-mt', ...flags, source, '-o', join(dir, out)]);
      return out;
    });
  }

  // Sound events and the files they play.
  if (config.sounds) {
    const sources = [];
    for (const path of config.sounds.files) sources.push(parseKV3(await valveText(path)));
    const match = (name) => config.sounds.match.some((rule) => (rule instanceof RegExp ? rule.test(name) : rule === name));
    const audio = new Map();
    const fileFor = (name) => {
      for (const extension of ['mp3', 'wav']) {
        const file = `sounds/${name}.${extension}`;
        if (exportFiles.includes(file)) { const out = `sounds/${name}.mp3`; audio.set(out, file); return out; }
      }
      return undefined;
    };
    const table = buildSoundTable(sources, { match, fileFor });
    // Loop points of the files that loop (the .vsnd beside the audio, as S2V exports it).
    const meta = {};
    for (const [out, file] of audio) {
      const vsnd = join(SRC, file.replace(/\.(mp3|wav)$/, '.vsnd'));
      if (!existsSync(vsnd)) continue;
      try {
        const sound = parseKV3(await readFile(vsnd, 'utf8')).VrfExportedSound?.m_vSound;
        if (!sound) continue;
        const entry = { duration: sound.m_flDuration };
        if (sound.m_nLoopStart >= 0 && sound.m_nRate) entry.loop = [sound.m_nLoopStart / sound.m_nRate, (sound.m_nLoopEnd || sound.m_nSampleCount) / sound.m_nRate];
        meta[out] = entry;
      } catch { /* No loop information. */ }
    }
    for (const [out, file] of audio) {
      const source = join(SRC, file), info = await stat(source);
      const stamp = stampOf(info.size, info.mtimeMs, 'mp3');
      claim(out, file);
      files[out] = { from: file, stamp };
      valve[valveKey(file)] = out;
      if (fresh(out, stamp)) continue;
      jobs.push(async () => {
        await mkdir(dirname(join(dir, out)), { recursive: true });
        if (file.endsWith('.mp3')) await copyFile(source, join(dir, out));
        else await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-q:a', '4', join(dir, out)]);
        return out;
      });
    }
    const missing = Object.keys(table.missing).length;
    if (missing) notes.push(`звуки без файлов в выгрузке: ${missing} событий (sounds.json → missing)`);
    const json = { events: sortKeys(table.events), files: sortKeys(meta), missing: sortKeys(table.missing) };
    await writeJSON(join(dir, 'sounds.json'), json);
    files['sounds.json'] = { from: config.sounds.files.join(', ') };
  }

  // Game data: vdata and CSS constants.
  if (config.data || config.defines) {
    const data = {};
    for (const [name, path] of Object.entries(config.data || {})) {
      if (!exportFiles.includes(path)) { notes.push(`нет данных ${path}`); continue; }
      data[name] = parseKV3(await readFile(join(SRC, path), 'utf8'));
    }
    if (config.defines) {
      const path = config.defines;
      const text = exportFiles.includes(path) ? await readFile(join(SRC, path), 'utf8') : await valveText(path);
      data.defines = cssDefines(text);
    }
    await writeJSON(join(dir, 'data.json'), data);
    files['data.json'] = { from: [...Object.values(config.data || {}), config.defines].filter(Boolean).join(', ') };
  }

  // Strings, in both languages, in the files' order.
  const patterns = [...(config.strings || []), ...(config.novel || [])];
  if (patterns.length) {
    const ru = pickStrings(await tokens('ru', config.localization), patterns), en = pickStrings(await tokens('en', config.localization), patterns);
    const lost = Object.keys(ru).filter((key) => !(key in en));
    if (lost.length) notes.push(`нет английских строк: ${lost.slice(0, 5).join(', ')}${lost.length > 5 ? ` и ещё ${lost.length - 5}` : ''}`);
    await writeJSON(join(dir, 'strings.ru.json'), ru);
    await writeJSON(join(dir, 'strings.en.json'), en);
    files['strings.ru.json'] = { from: LOCALIZATION.ru.join(', '), count: Object.keys(ru).length };
    files['strings.en.json'] = { from: LOCALIZATION.en.join(', '), count: Object.keys(en).length };
  }

  // Files copied as they are (models) and KeyValues 3 text turned into JSON (particles).
  for (const entry of config.copy || []) {
    for (const file of matching(exportFiles, entry)) {
      const out = `${entry.to || 'files'}/${basename(file)}`, source = join(SRC, file), info = await stat(source);
      const stamp = stampOf(info.size, info.mtimeMs, 'copy');
      claim(out, file);
      files[out] = { from: file, stamp };
      valve[valveKey(file)] = out;
      if (!fresh(out, stamp)) jobs.push(async () => { await mkdir(dirname(join(dir, out)), { recursive: true }); await copyFile(source, join(dir, out)); return out; });
    }
  }
  for (const entry of config.kv3 || []) {
    for (const file of matching(exportFiles, entry)) {
      const out = `${entry.to || 'data'}/${basename(file).replace(/\.[^.]+$/, '')}.json`;
      claim(out, file);
      await writeJSON(join(dir, out), parseKV3(await readFile(join(SRC, file), 'utf8')));
      files[out] = { from: file };
      valve[valveKey(file)] = out;
    }
  }

  const made = (await pool(jobs)).filter(Boolean);
  // Sizes of everything listed, then the manifest (written last: it marks the files as done).
  let total = 0;
  for (const [out, entry] of Object.entries(files)) {
    const path = join(dir, out);
    if (existsSync(path)) { entry.bytes = (await stat(path)).size; total += entry.bytes; }
  }
  await writeJSON(manifestPath, { about: 'Made by scripts/make-minigame-assets.mjs from Valve’s Dota 2 files; see docs/minigames.md.', files: sortKeys(files), valve: sortKeys(valve) });
  const strays = (await walk(dir)).filter((file) => file !== 'manifest.json' && !files[file]);
  return { id: config.id, made, files, total, notes, strays };
}

function sortKeys(object) { return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))); }
async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const text = `${JSON.stringify(value, null, 1)}\n`;
  if (existsSync(path) && (await readFile(path, 'utf8')) === text) return;
  await writeFile(path, text);
}

// --- all of it ----------------------------------------------------------------------------------
async function configs() {
  const list = [...(await import(pathToFileURL(join(ROOT, 'src/minigames/core/pipeline.mjs')).href)).default];
  const games = join(ROOT, 'src/minigames/games');
  for (const id of (await readdir(games)).sort()) {
    const path = join(games, id, 'pipeline.mjs');
    if (existsSync(path)) list.push((await import(pathToFileURL(path).href)).default);
  }
  return list;
}

async function main() {
  if (!SRC || !existsSync(SRC)) {
    console.error('Укажите выгрузку: --src <папка> или MINIGAMES_SRC (файлы Source 2 Viewer: panorama/images, sounds, scripts…).');
    process.exit(1);
  }
  const exportFiles = await walk(SRC);
  const all = await configs();
  const chosen = ONLY.length ? all.filter((config) => ONLY.includes(config.id)) : all;
  if (ONLY.length && chosen.length !== ONLY.length) throw new Error(`Неизвестные папки: ${ONLY.filter((id) => !all.some((config) => config.id === id)).join(', ')}`);
  let grand = 0;
  for (const config of chosen) {
    const result = await build(config, exportFiles);
    grand += result.total;
    const count = Object.keys(result.files).length;
    console.log(`\nassets/minigames/${result.id}: ${count} файлов, ${kb(result.total)}; сделано сейчас: ${result.made.length}`);
    const biggest = Object.entries(result.files).filter(([, entry]) => entry.bytes).sort(([, a], [, b]) => b.bytes - a.bytes);
    for (const [out, entry] of VERBOSE ? biggest : biggest.slice(0, 6)) console.log(`  ${kb(entry.bytes).padStart(10)}  ${out}${entry.width ? `  ${entry.width}×${entry.height}${entry.lossless ? ' lossless' : ` q${entry.quality}`}` : ''}`);
    for (const note of result.notes) console.log(`  ! ${note}`);
    if (result.strays.length) console.log(`  · не из конвейера (не трогаем): ${result.strays.join(', ')}`);
  }
  console.log(`\nВсего: ${kb(grand)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
