import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fail } from './catalog-store.mjs';
import { panoramaSource, readVPK } from '../scripts/vpk.mjs';
import { MENU_LAYOUT, MENU_PACK_PATHS, MENU_PACK_VIDEOS, MENU_VIDEO } from '../scripts/menu-background.mjs';
import { HUD_STYLE } from '../scripts/hud-style.mjs';
import { ABILITIES_PATH, TEXTS_PATH } from '../scripts/dota-texts.mjs';
import { CURSOR_IDS as CURSOR_ID_LIST, CURSOR_SIZES } from '../scripts/dota-cursor.mjs';
import { CUSTOMIZE_PAKS, customizeEntry } from '../scripts/customize-pack.mjs';
import { DOTA_FONT_FILES } from '../scripts/dota-font.mjs';
import { D2PFX_FILE } from '../scripts/d2pfx-mods.mjs';
import { portraitsPackProblem } from '../scripts/hero-portraits.mjs';

// The menu background's and the font's packs for their PowerShell commands (asked for on 2026-10-03:
// «чтобы скрипт сам качал выбранный фон, а не брал из загрузок — чтобы юзер не мог ошибиться»). The
// page builds the pack as before and uploads it here in parts (PACK_LIMITS.part, under nginx's 9 MB for
// the API); the command's script downloads exactly this file from /api/catalog/install/file/<id> and
// checks its SHA-256 and size (scripts/installer.mjs). A pack is named by its SHA-256 (the same pack is
// kept once) and kept for a week. The server takes only what the site's own builders make, so nobody
// can hand out anything else under gridstudio.me: a background is a VPK of MENU_PACK_PATHS (WebM videos
// and Panorama files without outside addresses, network calls or handlers but the site's own), a font
// a ZIP of fonts/<Dota's font>.otf, OFL.txt and the read-me.
// `storage`: 15 GB since 2026-10-07 (5 GB filled up and every new pack was refused for a day); when a
// new pack does not fit, the oldest ready ones make room (evict).
// 'all': the customization page's one file (scripts/customize-pack.mjs): a background's videos, the
// interface, the cursor, the d2pfx mods, the heroes' portraits (pak05: only Valve's hero picture and movie
// paths, pictures exactly as scripts/hero-portraits.mjs writes them) and a font together (200 MB since the d2pfx mods, 2026-10-17: a HUD
// skin and a play-panel background alone may be 25 MB each).
export const PACK_LIMITS = Object.freeze({ bg: 80_000_000, font: 30_000_000, all: 200_000_000, part: 4 * 1024 * 1024, days: 7, storage: 15_000_000_000, startsHourly: 30 });
const EXT = { bg: 'vpk', font: 'zip', all: 'zip' };
const DAY = 86_400_000;

// ——— What a pack may hold.
const URLS = ['https://stratz.com/players/', 'https://www.dotabuff.com/players/', 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'];
// The Stratz and Dotabuff buttons on the profile (menu-background.mjs profilePage), the only handler that builds an address.
const PROFILE_HANDLER = /^\$\.DispatchEvent\( 'ExternalBrowserGoToURL', '(?:https:\/\/stratz\.com\/players\/|https:\/\/www\.dotabuff\.com\/players\/)' \+ \$\.Localize\( '\{s:account_id\}', \$\.GetContextPanel\(\) \) \);$/;
export function panoramaProblem(text) {
  for (const url of text.match(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]*/gi) || [])
    if (!/^s2r:\/\/panorama\//i.test(url) && !url.startsWith('file://{resources}/') && !URLS.some((allowed) => url.startsWith(allowed))) return `адрес ${url.slice(0, 60)}`;
  if (/AsyncWebRequest|XMLHttpRequest|WebSocket|fromCharCode|\batob\s*\(|\beval\s*\(|\bFunction\s*\(|javascript:|<script(?!s\s*>)/i.test(text)) return 'скрипт';
  for (const value of Array.from(text.matchAll(/\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi), (m) => m[1] ?? m[2]))
    if (/[+`\\]|url/i.test(value) && !PROFILE_HANDLER.test(value)) return 'обработчик';
  for (const [, src] of text.matchAll(/<include\s+src\s*=\s*["']([^"']*)["']/gi)) if (!/^(?:s2r:\/\/panorama\/|file:\/\/\{resources\}\/)/.test(src)) return 'подключение';
  return '';
}
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
// `whole`: the background's own pack has the menu's video and dashboard; inside the customization's one
// file it may carry only the other parts (no menu background: scripts/menu-background.mjs, video null),
// but a layout that plays the menu's video comes with it.
function backgroundProblem(bytes, { whole = true } = {}) {
  let files;
  try { files = readVPK(bytes).files; } catch { return 'Это не фон GridStudio.'; }
  const has = (path) => files.some((file) => file.path === path);
  if (whole ? !has(MENU_PACK_PATHS[0]) || !has(MENU_PACK_VIDEOS[0]) : !files.length || (has(MENU_LAYOUT) && !has(MENU_VIDEO))) return 'Это не фон GridStudio.';
  for (const file of files) {
    if (!MENU_PACK_PATHS.includes(file.path)) return 'В фоне есть лишний файл.';
    if (MENU_PACK_VIDEOS.includes(file.path)) { if (!EBML.every((byte, i) => file.data[i] === byte)) return 'Видео фона повреждено.'; continue; }
    let text;
    try { text = panoramaSource(file.data); } catch { return 'Файл меню повреждён.'; }
    const problem = panoramaProblem(text);
    if (problem) return `В файле меню недопустимое: ${problem}.`;
  }
  return '';
}

// The entries of a ZIP, by its central directory: [{ name, data }]; deflated ones are unpacked, up to `limit` bytes in all.
export function readZip(bytes, limit = PACK_LIMITS.font * 3) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
  if (end < 0) throw new Error('no zip');
  const count = view.getUint16(end + 10, true), entries = [];
  let at = view.getUint32(end + 16, true), total = 0;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('bad zip');
    const method = view.getUint16(at + 10, true), packed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('bad zip');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), raw = bytes.subarray(start, start + packed);
    if ((total += size) > limit || ![0, 8].includes(method)) throw new Error('bad zip');
    const data = method === 8 ? new Uint8Array(inflateRawSync(raw, { maxOutputLength: size })) : raw;
    if (data.length !== size) throw new Error('bad zip');
    entries.push({ name, data });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}
const FONT_NAMES = new Set(DOTA_FONT_FILES.map((file) => `fonts/${file}`)), FONT_TEXTS = new Set(['OFL.txt', 'ПРОЧТИ.txt', 'README.txt']);
const FONT_MAGIC = [[0x4f, 0x54, 0x54, 0x4f], [0x00, 0x01, 0x00, 0x00], [0x74, 0x72, 0x75, 0x65]];
function fontProblem(bytes) {
  let entries;
  try { entries = readZip(bytes); } catch { return 'Это не шрифт GridStudio.'; }
  if (!entries.some((entry) => FONT_NAMES.has(entry.name))) return 'В архиве нет шрифтов Dota.';
  for (const { name, data } of entries) {
    if (FONT_NAMES.has(name)) { if (!FONT_MAGIC.some((magic) => magic.every((byte, i) => data[i] === byte))) return 'Шрифт в архиве повреждён.'; continue; }
    if (!FONT_TEXTS.has(name) || data.includes(0)) return 'В архиве шрифта есть лишний файл.';
  }
  return '';
}
// The interface's pak03 (scripts/interface-modules.mjs): the HUD's style (Panorama, checked like the menu's
// files) and Valve's localization files with the user's texts (plain UTF-8 text, nothing to run).
const INTERFACE_PATHS = [HUD_STYLE, TEXTS_PATH, ABILITIES_PATH];
function interfaceProblem(bytes) {
  let files;
  try { files = readVPK(bytes).files; } catch { return 'Это не интерфейс GridStudio.'; }
  if (!files.length) return 'Это не интерфейс GridStudio.';
  for (const file of files) {
    if (!INTERFACE_PATHS.includes(file.path)) return 'В интерфейсе есть лишний файл.';
    if (file.path === HUD_STYLE) {
      let text;
      try { text = panoramaSource(file.data); } catch { return 'Файл интерфейса повреждён.'; }
      const problem = /[^\x00-\x7f]/.test(text) ? 'не ASCII' : panoramaProblem(text);
      if (problem) return `В файле интерфейса недопустимое: ${problem}.`;
    } else if (file.data.includes(0) || file.data.length > 8_000_000) return 'Файл текстов повреждён.';
  }
  return '';
}
// The cursor's loose files: every id of Dota's cursors at its sizes (scripts/dota-cursor.mjs CURSOR_IDS, 23
// since 2026-10-17), 32-bit BMPs exactly as cursorBMP writes them, and cursor.res.
const CURSOR_IDS = new Set(CURSOR_ID_LIST);
function cursorProblem(path, data) {
  if (path === 'resource/cursor/cursor.res') return data.includes(0) || data.length > 200_000 ? 'Файл курсора повреждён.' : '';
  const name = /^resource\/cursor\/([a-z_]+?)(?:_vsz([0-3]))?\.bmp$/.exec(path);
  if (!name || !CURSOR_IDS.has(name[1])) return 'В архиве есть лишний файл.';
  const size = CURSOR_SIZES[Number(name[2] ?? 0)];
  return data[0] === 0x42 && data[1] === 0x4d && data.length === 54 + size * size * 4 ? '' : 'Курсор в архиве повреждён.';
}
// The d2pfx mods' pak04 (scripts/d2pfx-mods.mjs): only d2pfx's own files, byte for byte — every path and
// SHA-256 is one of those the page's list was made from (server/d2pfx-files.json, scripts/make-d2pfx-catalog.mjs),
// or one of our few fixed files (D2PFX_FIXES, whose hashes are listed there too), so nothing but the mods the
// page offers can be handed out under gridstudio.me.
let d2pfxKnown = null;
const d2pfxFiles = () => (d2pfxKnown ||= JSON.parse(readFileSync(new URL('./d2pfx-files.json', import.meta.url), 'utf8')).files);
export function d2pfxProblem(bytes) {
  let files;
  try { files = readVPK(bytes).files; } catch { return 'Это не моды d2pfx.'; }
  if (!files.length || files.length > 2000) return 'Это не моды d2pfx.';
  const known = d2pfxFiles(), seen = new Set();
  for (const file of files) {
    if (seen.has(file.path) || !D2PFX_FILE.test(file.path) || !known[file.path]) return 'В модах d2pfx есть лишний файл.';
    seen.add(file.path);
    if (!known[file.path].includes(createHash('sha256').update(file.data).digest('hex'))) return 'Файл мода d2pfx не совпадает с d2pfx.';
  }
  return '';
}
function customizeProblem(bytes) {
  let entries;
  try { entries = readZip(bytes, PACK_LIMITS.all * 2); } catch { return 'Это не сборка GridStudio.'; }
  if (!entries.some((entry) => customizeEntry(entry.name)?.kind !== 'text' && customizeEntry(entry.name))) return 'В сборке ничего нет.';
  const names = new Set();
  for (const { name, data } of entries) {
    const entry = customizeEntry(name);
    if (!entry || names.has(name)) return 'В сборке есть лишний файл.';
    names.add(name);
    let problem = '';
    if (entry.kind === 'text') problem = data.includes(0) ? 'В сборке есть лишний файл.' : '';
    else if (entry.kind === 'fonts') problem = !FONT_NAMES.has(`fonts/${entry.path}`) ? 'В сборке есть лишний файл.' : FONT_MAGIC.some((magic) => magic.every((byte, i) => data[i] === byte)) ? '' : 'Шрифт в сборке повреждён.';
    else if (entry.path === CUSTOMIZE_PAKS.menu) problem = backgroundProblem(data, { whole: false });
    else if (entry.path === CUSTOMIZE_PAKS.match) problem = interfaceProblem(data);
    else if (entry.path === CUSTOMIZE_PAKS.d2pfx) problem = d2pfxProblem(data);
    else if (entry.path === CUSTOMIZE_PAKS.portraits) problem = portraitsPackProblem(data);
    else problem = cursorProblem(entry.path, data);
    if (problem) return problem;
  }
  return '';
}
export const packProblem = (kind, bytes) => (kind === 'bg' ? backgroundProblem(bytes) : kind === 'all' ? customizeProblem(bytes) : fontProblem(bytes));

export class InstallPacks {
  constructor(store, { dir, storage = PACK_LIMITS.storage }) {
    this.store = store; this.dir = dir; this.storage = storage;
    store.db.exec(`CREATE TABLE IF NOT EXISTS install_packs(id TEXT PRIMARY KEY, kind TEXT NOT NULL, size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'upload', created INTEGER NOT NULL, expires INTEGER NOT NULL)`);
    this.pruned = 0;
  }
  file(id, part = false) { return join(this.dir, `${id}.${part ? 'part' : EXT[id.split('-')[0]]}`); }
  view(row) { return { id: row.id, received: row.received, ready: row.state === 'ready' }; }
  // A pack the page is about to send (or has sent): its upload, resumed where it stopped, or ready at once.
  start(kind, sha256, size, ipHash) {
    const store = this.store, now = store.now();
    if (!EXT[kind] || !/^[0-9a-f]{64}$/.test(String(sha256))) fail(400, 'Неверный файл.');
    if (!Number.isSafeInteger(size) || size <= 0) fail(400, 'Файл пустой.');
    if (size > PACK_LIMITS[kind]) fail(413, `Файл больше ${PACK_LIMITS[kind] / 1_000_000} МБ.`);
    this.prune(now);
    const id = `${kind}-${sha256}`, row = store.get('SELECT * FROM install_packs WHERE id=?', id);
    if (row && row.size === size && (row.state === 'ready' ? existsSync(this.file(id)) : existsSync(this.file(id, true)))) {
      store.run('UPDATE install_packs SET expires=? WHERE id=?', now + PACK_LIMITS.days * DAY, id);
      return this.view(row);
    }
    store.rate(`install-pack:${ipHash}`, PACK_LIMITS.startsHourly, 3_600_000, { message: 'Слишком много команд подряд. Подожди немного.', code: 'install_pack_limit' });
    // Then room: the oldest ready packs go to make it, so the store no longer refuses everyone once it is
    // full (2026-10-07: 5 GB filled, every new pack was refused for a day, and users retrying used up
    // their hourly starts). Refused only while uploads in progress fill it all.
    this.evict(size);
    if (this.used() + size > this.storage) fail(503, 'Сейчас не получается сохранить файл. Попробуй через несколько минут или скачай его.');
    mkdirSync(this.dir, { recursive: true });
    closeSync(openSync(this.file(id, true), 'w'));
    store.run('INSERT OR REPLACE INTO install_packs(id,kind,size,received,state,created,expires) VALUES(?,?,?,0,?,?,?)', id, kind, size, 'upload', now, now + PACK_LIMITS.days * DAY);
    return { id, received: 0, ready: false };
  }
  // A part at `offset`; the last one checks the whole file. A part out of place changes nothing.
  write(id, offset, bytes) {
    const store = this.store, row = store.get('SELECT * FROM install_packs WHERE id=?', id);
    if (!row) fail(404, 'Загрузка не найдена. Собери файл заново.');
    if (row.state === 'ready' || offset !== row.received) return this.view(row);
    if (bytes.length > PACK_LIMITS.part || row.received + bytes.length > row.size) fail(413, 'Лишние данные.');
    const handle = openSync(this.file(id, true), 'a');
    try { writeSync(handle, bytes); } finally { closeSync(handle); }
    const received = row.received + bytes.length;
    store.run('UPDATE install_packs SET received=? WHERE id=?', received, id);
    if (received < row.size) return { id, received, ready: false };
    const whole = new Uint8Array(readFileSync(this.file(id, true))), drop = (message) => { this.forget(id); fail(422, message); };
    if (createHash('sha256').update(whole).digest('hex') !== id.slice(id.indexOf('-') + 1)) drop('Файл дошёл с ошибкой. Попробуй ещё раз.');
    const problem = packProblem(row.kind, whole);
    if (problem) drop(problem);
    renameSync(this.file(id, true), this.file(id));
    store.run("UPDATE install_packs SET state='ready', expires=? WHERE id=?", store.now() + PACK_LIMITS.days * DAY, id);
    return { id, received, ready: true };
  }
  // The file for the command's script, while it is kept.
  ready(id) {
    const row = this.store.get("SELECT * FROM install_packs WHERE id=? AND state='ready' AND expires>?", id, this.store.now());
    const path = row && this.file(id);
    return path && existsSync(path) ? { path, size: statSync(path).size } : null;
  }
  forget(id) {
    rmSync(this.file(id, true), { force: true }); rmSync(this.file(id), { force: true });
    this.store.run('DELETE FROM install_packs WHERE id=?', id);
  }
  used() { return this.store.get('SELECT coalesce(sum(size),0) n FROM install_packs').n; }
  // Makes room for `size` more bytes: ready packs, the soonest to expire first (the oldest); a pack
  // being uploaded is never cut short. Its command, if someone still has it, then says the file is gone.
  evict(size) {
    let over = this.used() + size - this.storage;
    if (over <= 0) return;
    for (const row of this.store.all("SELECT id, size FROM install_packs WHERE state='ready' ORDER BY expires, created")) {
      this.forget(row.id);
      over -= row.size;
      if (over <= 0) return;
    }
  }
  // Out-of-date packs and uploads left for a day go, at most once an hour.
  prune(now = this.store.now()) {
    if (now - this.pruned < 3_600_000) return;
    this.pruned = now;
    for (const row of this.store.all("SELECT id FROM install_packs WHERE expires<=? OR (state='upload' AND created<?)", now, now - DAY)) this.forget(row.id);
  }
}
