import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fail } from './catalog-store.mjs';
import { panoramaSource, readVPK } from '../scripts/vpk.mjs';
import { MENU_PACK_PATHS, MENU_PACK_VIDEOS } from '../scripts/menu-background.mjs';
import { DOTA_FONT_FILES } from '../scripts/dota-font.mjs';

// The menu background's and the font's packs for their PowerShell commands (asked for on 2026-10-03:
// «чтобы скрипт сам качал выбранный фон, а не брал из загрузок — чтобы юзер не мог ошибиться»). The
// page builds the pack as before and uploads it here in parts (PACK_LIMITS.part, under nginx's 9 MB for
// the API); the command's script downloads exactly this file from /api/catalog/install/file/<id> and
// checks its SHA-256 and size (scripts/installer.mjs). A pack is named by its SHA-256 (the same pack is
// kept once) and kept for a week. The server takes only what the site's own builders make, so nobody
// can hand out anything else under gridstudio.me: a background is a VPK of MENU_PACK_PATHS (WebM videos
// and Panorama files without outside addresses, network calls or handlers but the site's own), a font
// a ZIP of fonts/<Dota's font>.otf, OFL.txt and the read-me.
export const PACK_LIMITS = Object.freeze({ bg: 80_000_000, font: 30_000_000, part: 4 * 1024 * 1024, days: 7, storage: 5_000_000_000, startsHourly: 30 });
const EXT = { bg: 'vpk', font: 'zip' };
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
function backgroundProblem(bytes) {
  let files;
  try { files = readVPK(bytes).files; } catch { return 'Это не фон GridStudio.'; }
  if (!files.some((file) => file.path === MENU_PACK_PATHS[0]) || !files.some((file) => file.path === MENU_PACK_VIDEOS[0])) return 'Это не фон GridStudio.';
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
export const packProblem = (kind, bytes) => (kind === 'bg' ? backgroundProblem(bytes) : fontProblem(bytes));

export class InstallPacks {
  constructor(store, { dir }) {
    this.store = store; this.dir = dir;
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
    if (store.get('SELECT coalesce(sum(size),0) n FROM install_packs').n + size > PACK_LIMITS.storage) fail(503, 'Сейчас не получается сохранить файл. Попробуй через несколько минут или скачай его.');
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
  // Out-of-date packs and uploads left for a day go, at most once an hour.
  prune(now = this.store.now()) {
    if (now - this.pruned < 3_600_000) return;
    this.pruned = now;
    for (const row of this.store.all("SELECT id FROM install_packs WHERE expires<=? OR (state='upload' AND created<?)", now, now - DAY)) this.forget(row.id);
  }
}
