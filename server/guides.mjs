import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './catalog-store.mjs';
import { GUIDE_CATEGORIES, GUIDE_LIMITS, cleanComment, guideExcerpt, isGuideCategory, normalizeGuideDoc } from '../scripts/guide-document.mjs';

// «Гайды» (asked for on 2026-10-02): guides written by users signed in with Telegram, in the visual
// editor (src/guides/GuideEditor.jsx), with pictures, GIFs, video files, files to download and YouTube;
// every version waits for a moderator (the Telegram topic or the site's admin panel) like grids, arts
// and backgrounds. Likes (not one's own), comments published at once (the commenter, the guide's author
// and admins delete them; anyone signed in reports them) and reports on guides.
//
// A guide has revisions like a grid: the public one stays while an edit is a draft, waits or is
// rejected. Uploads belong to their account until a revision uses them; they live in `dir` (next to
// the database, CATALOG_GUIDES) as <dir>/<id[0..1]>/<id>.<ext>. Pictures other than GIF and animated
// WebP are re-encoded to WebP here (no camera metadata, at most 2400 px), videos are checked with
// ffprobe, files are kept as sent and always served as attachments.
export const guideKey = (id) => `guide:${id}`;
export const GUIDE_MEDIA = Object.freeze({
  image: 10 * 1024 * 1024, video: 50 * 1024 * 1024, file: 50 * 1024 * 1024,
  side: 2400, pixels: 60_000_000, seconds: 15 * 60,
  account: 1024 * 1024 * 1024, uploadsDaily: 120, storage: 40 * 1024 * 1024 * 1024
});
// Uploads come in parts of this size (src/guides/api.js), under nginx's 9 MB for the API.
export const UPLOAD_PART = 4 * 1024 * 1024;
export const GUIDE_QUOTAS = Object.freeze({ draftsDaily: 30, submitsDaily: 15, pending: 300, comments: 8, commentsDaily: 150, reportsDaily: 20 });
const FILE_EXTENSIONS = new Set(['json', 'txt', 'cfg', 'ini', 'md', 'kv', 'kv3', 'vpk', 'zip', '7z', 'rar', 'ttf', 'otf', 'woff', 'woff2',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'psd', 'mp4', 'webm', 'mp3', 'ogg', 'wav']);
const PAGE = 18, COMMENTS_PAGE = 50;
const now = (store) => store.now();
const newId = (bytes) => randomBytes(bytes).toString('base64url');
const isId = (value, length) => typeof value === 'string' && new RegExp(`^[A-Za-z0-9_-]{${length}}$`).test(value);

// A file name to show and to save as: no folders, no control characters, at most 120 characters.
export function cleanFileName(value) {
  const name = String(value ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').replace(/\s+/g, ' ').trim().slice(-120);
  return name && !/^\.+$/.test(name) ? name : 'file';
}
const extensionOf = (name) => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] || '').toLowerCase();

// The picture's format and size from its first bytes, before anything decodes it.
export function imageInfo(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 30) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (/^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return { type: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8X') return { type: 'webp', animated: !!(buf[20] & 0x02), width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { type: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const bits = buf.readUInt32LE(21); return { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) { at++; continue; }
      const marker = buf[at + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { at += marker === 0xff ? 1 : 2; continue; }
      const length = buf.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { type: 'jpeg', height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
      at += 2 + length;
    }
    return null;
  }
  return null;
}
// A picture as WebP, at most GUIDE_MEDIA.side on its long side, without the camera's metadata.
// The decoder turns a phone photo upright by its EXIF orientation itself (checked: a 40 × 20 JPEG
// marked «6» decodes 20 × 40), so nothing turns it again here.
async function reencode(bytes) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const image = await loadImage(Buffer.from(bytes));
  const scale = Math.min(1, GUIDE_MEDIA.side / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, w, h);
  return { bytes: await canvas.encode('webp', 86), width: w, height: h };
}

function ffprobe(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration,format_name', '-of', 'json', path],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(JSON.parse(out)) : reject(new Error('ffprobe')); });
  });
}
// Browsers play H.264, VP8, VP9 and AV1; H.265 and the rest show a black frame.
const VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);

const GUIDE_FILTERS = {
  pending: "r.status='pending'",
  approved: "g.status='approved' AND r.id=g.public_revision",
  hidden: "(g.status='hidden' AND r.id=g.public_revision) OR r.status='rejected'",
  reports: "r.id=g.public_revision AND g.status='approved' AND EXISTS(SELECT 1 FROM guide_reports p WHERE p.guide=g.id AND p.resolved=0)"
};

export class CatalogGuides {
  constructor(store, { dir, salt = 'guides', probe = ffprobe } = {}) {
    this.store = store; this.dir = dir; this.salt = salt; this.probe = probe;
    if (dir) mkdirSync(join(dir, 'tmp'), { recursive: true });
    store.db.exec(`CREATE TABLE IF NOT EXISTS guides(id TEXT PRIMARY KEY, account TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
        public_revision INTEGER, draft_revision INTEGER, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, updated INTEGER NOT NULL, published INTEGER);
      CREATE INDEX IF NOT EXISTS guides_account ON guides(account, updated);
      CREATE TABLE IF NOT EXISTS guide_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT, guide TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
        title TEXT NOT NULL, category TEXT NOT NULL, cover TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft', reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS guide_media(id TEXT PRIMARY KEY, account TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, ext TEXT NOT NULL DEFAULT '',
        mime TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
        seconds REAL NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'uploading', created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS guide_media_account ON guide_media(account, created);
      CREATE TABLE IF NOT EXISTS guide_revision_media(revision INTEGER NOT NULL REFERENCES guide_revisions(id) ON DELETE CASCADE, media TEXT NOT NULL, PRIMARY KEY(revision, media));
      CREATE INDEX IF NOT EXISTS guide_revision_media_media ON guide_revision_media(media);
      CREATE TABLE IF NOT EXISTS guide_likes(guide TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE, account TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(guide, account));
      CREATE TABLE IF NOT EXISTS guide_comments(id INTEGER PRIMARY KEY AUTOINCREMENT, guide TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE, account TEXT NOT NULL,
        reply INTEGER, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'visible', created INTEGER NOT NULL, edited INTEGER);
      CREATE INDEX IF NOT EXISTS guide_comments_guide ON guide_comments(guide, id);
      CREATE TABLE IF NOT EXISTS guide_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, guide TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
        comment INTEGER, account TEXT NOT NULL, reason TEXT NOT NULL, created INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS guide_reports_open ON guide_reports(kind, guide, coalesce(comment, 0), account) WHERE resolved=0;
      CREATE TABLE IF NOT EXISTS guide_people(key TEXT PRIMARY KEY, account TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS guide_notices(revision INTEGER PRIMARY KEY, account TEXT NOT NULL, guide TEXT NOT NULL, first INTEGER NOT NULL,
        created INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0);`);
    // Replies sit under the comment that starts their thread (the page nests them one level).
    if (!store.all('PRAGMA table_info(guide_comments)').some((column) => column.name === 'thread')) {
      store.db.exec('ALTER TABLE guide_comments ADD COLUMN thread INTEGER');
      for (const row of store.all('SELECT id, reply FROM guide_comments WHERE reply IS NOT NULL ORDER BY id'))
        store.run('UPDATE guide_comments SET thread=coalesce((SELECT coalesce(thread, id) FROM guide_comments WHERE id=?), ?) WHERE id=?', row.reply, row.reply, row.id);
    }
    // «! Используется модификация файлов игры» (asked for on 2026-10-02): a mark on the whole guide, shown
    // on its page and card. The author can put it, only an admin can take it off.
    if (!store.all('PRAGMA table_info(guides)').some((column) => column.name === 'modding'))
      store.db.exec('ALTER TABLE guides ADD COLUMN modding INTEGER NOT NULL DEFAULT 0');
    store.removeSelfLikes('guide_likes', 'guide', 'guides', 'guide');
  }

  // ——— People: authors and commenters as their creator profiles (server/profiles.mjs) — the nickname,
  // the avatar they chose and the key of their profile page; never the Telegram name or id.
  person(account) {
    const key = createHmac('sha256', this.salt).update(`guide-person:${account}`).digest('base64url').slice(0, 20);
    this.store.run('INSERT OR IGNORE INTO guide_people(key, account) VALUES(?,?)', key, account);
    return key;
  }
  people(accounts) {
    const unique = [...new Set(accounts.filter(Boolean))];
    return Object.fromEntries(unique.map((account) => [account, this.store.profiles.creator(account)]));
  }
  // Links from before profiles (/guides/people/<key>.jpg) show the profile's avatar now.
  avatar(key) {
    const row = isId(key, 20) && this.store.get('SELECT account FROM guide_people WHERE key=?', key);
    if (!row) fail(404, 'Нет фото.');
    return this.store.profiles.avatar(this.store.profiles.ensure(row.account).key);
  }
  // A creator's published guides, newest first (the profile page).
  byAccount(account, limit = 60) {
    const rows = this.store.all(`SELECT g.id, g.account, g.published, g.updated, g.modding, r.title, r.category, r.cover, r.text,
      (SELECT count(*) FROM guide_likes l WHERE l.guide=g.id) likes, (SELECT count(*) FROM guide_comments c WHERE c.guide=g.id AND c.state='visible') comments
      FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE g.account=? AND g.status='approved' ORDER BY g.published DESC LIMIT ?`, account, limit);
    const people = this.people([account]);
    return rows.map((row) => this.card(row, people));
  }

  // The published guides an account liked, the latest like first.
  liked(account, limit = 200) {
    const rows = this.store.all(`SELECT g.id, g.account, g.published, g.updated, g.modding, r.title, r.category, r.cover, r.text,
      (SELECT count(*) FROM guide_likes x WHERE x.guide=g.id) likes, (SELECT count(*) FROM guide_comments c WHERE c.guide=g.id AND c.state='visible') comments
      FROM guide_likes l JOIN guides g ON g.id=l.guide JOIN guide_revisions r ON r.id=g.public_revision WHERE l.account=? AND g.status='approved' ORDER BY l.created DESC LIMIT ?`, account, limit);
    const people = this.people(rows.map((row) => row.account));
    return rows.map((row) => this.card(row, people, { liked: true }));
  }

  // ——— Uploads, in parts (src/guides/api.js uploadMedia).
  startUpload(account, { kind, name, size }) {
    const store = this.store;
    if (!['image', 'video', 'file'].includes(kind)) fail(400, 'Неизвестный тип вложения.');
    const bytes = Number(size), clean = cleanFileName(name), ext = extensionOf(clean);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) fail(400, 'Файл пустой.');
    if (bytes > GUIDE_MEDIA[kind]) fail(413, `Файл больше ${GUIDE_MEDIA[kind] / 1024 / 1024} МБ.`);
    if (kind === 'file' && !FILE_EXTENSIONS.has(ext)) fail(415, 'Такой файл в гайд не добавить: программы и скрипты нельзя.');
    return store.tx(() => {
      if (store.paused()) fail(503, 'Приём временно приостановлен. Попробуй позже.');
      if (!store.trusted(account)) store.rate(`guide-upload:${account}`, GUIDE_MEDIA.uploadsDaily, 86_400_000, { message: `За сутки можно загрузить ${GUIDE_MEDIA.uploadsDaily} файлов.`, code: 'guide_upload_limit' });
      const used = store.get("SELECT coalesce(sum(size),0) n FROM guide_media WHERE account=?", account).n;
      if (used + bytes > GUIDE_MEDIA.account) fail(413, 'Место для твоих вложений закончилось (1 ГБ). Удали ненужные черновики.');
      if (store.get('SELECT coalesce(sum(size),0) n FROM guide_media').n + bytes > GUIDE_MEDIA.storage) fail(503, 'Хранилище гайдов заполнено. Попробуй позже.');
      const id = newId(15);
      store.run('INSERT INTO guide_media(id,account,kind,name,size,created) VALUES(?,?,?,?,?,?)', id, account, kind, clean, bytes, now(store));
      writeFileSync(this.part(id), '');
      return { id };
    });
  }
  part(id) { return join(this.dir, 'tmp', `${id}.part`); }
  file(row) { return join(this.dir, row.id.slice(0, 2), `${row.id}.${row.ext || 'bin'}`); }
  upload(account, id) {
    const row = isId(id, 20) && this.store.get('SELECT * FROM guide_media WHERE id=?', id);
    if (!row || row.account !== account) fail(404, 'Загрузка не найдена.');
    return row;
  }
  // A part at `offset`; a part sent again after a lost answer is taken as received.
  appendUpload(account, id, offset, bytes) {
    const row = this.upload(account, id);
    if (row.state !== 'uploading') fail(409, 'Файл уже загружен.');
    const at = Number(offset);
    if (!Number.isSafeInteger(at) || at < 0) fail(400, 'Неверная часть файла.');
    if (at + bytes.length <= row.received) return { received: row.received };
    if (at !== row.received) fail(409, 'Части файла пришли не по порядку. Загрузи его ещё раз.', { received: row.received });
    if (at + bytes.length > row.size) fail(413, 'Файл больше, чем было заявлено.');
    appendFileSync(this.part(id), bytes);
    this.store.run('UPDATE guide_media SET received=? WHERE id=?', at + bytes.length, id);
    return { received: at + bytes.length };
  }
  async finishUpload(account, id) {
    const row = this.upload(account, id);
    if (row.state === 'ready') return this.mediaView(row);
    if (row.received !== row.size) fail(409, 'Файл загружен не до конца.');
    const part = this.part(id);
    const drop = (message, status = 415) => { this.forget(row); fail(status, message); };
    let bytes = readFileSync(part), ext, mime, width = 0, height = 0, seconds = 0;
    if (row.kind === 'image') {
      const info = imageInfo(bytes);
      if (!info) drop('Это не картинка PNG, JPEG, WebP или GIF.');
      if (!info.width || !info.height || info.width * info.height > GUIDE_MEDIA.pixels) drop('Картинка слишком большая: до 60 мегапикселей.');
      if (info.type === 'gif' || info.animated) { ext = info.type; mime = `image/${info.type}`; width = info.width; height = info.height; }
      else {
        let made;
        try { made = await reencode(bytes); } catch { drop('Не удалось прочитать картинку.'); }
        bytes = made.bytes; ext = 'webp'; mime = 'image/webp'; width = made.width; height = made.height;
        writeFileSync(part, bytes);
      }
    } else if (row.kind === 'video') {
      const mp4 = bytes.length > 12 && bytes.toString('latin1', 4, 8) === 'ftyp', webm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
      if (!mp4 && !webm) drop('Это не видео MP4 или WebM.');
      ext = mp4 ? 'mp4' : 'webm'; mime = `video/${ext}`;
      let info = null;
      try { info = await this.probe(part); } catch (error) { if (error?.code !== 'ENOENT') drop('Не удалось прочитать видео.'); }
      if (info) {
        const video = info.streams?.find((stream) => stream.codec_type === 'video');
        if (!video) drop('В файле нет видео.');
        if (!VIDEO_CODECS.has(video.codec_name)) drop(video.codec_name === 'hevc' ? 'Видео в H.265 браузеры не показывают. Сохрани его в H.264 (MP4) или WebM.' : 'Браузеры не покажут это видео. Сохрани его в H.264 (MP4) или WebM.');
        width = Number(video.width) || 0; height = Number(video.height) || 0; seconds = Number(info.format?.duration) || 0;
        if (width > 4096 || height > 4096) drop('Видео больше 4K.');
        if (seconds > GUIDE_MEDIA.seconds) drop('Видео длиннее 15 минут.');
      }
    } else {
      ext = extensionOf(row.name); mime = 'application/octet-stream';
      if (!FILE_EXTENSIONS.has(ext)) drop('Такой файл в гайд не добавить: программы и скрипты нельзя.');
    }
    const ready = { ...row, ext, mime, width, height, seconds, size: bytes.length, state: 'ready' };
    mkdirSync(join(this.dir, id.slice(0, 2)), { recursive: true });
    renameSync(part, this.file(ready));
    this.store.run("UPDATE guide_media SET ext=?,mime=?,width=?,height=?,seconds=?,size=?,received=?,state='ready' WHERE id=?", ext, mime, width, height, seconds, bytes.length, bytes.length, id);
    return this.mediaView(ready);
  }
  forget(row) {
    rmSync(this.part(row.id), { force: true });
    if (row.state === 'ready') rmSync(this.file(row), { force: true });
    this.store.run('DELETE FROM guide_media WHERE id=?', row.id);
  }
  mediaView(row) {
    return { id: row.id, kind: row.kind, url: `/api/catalog/guides/media/${row.id}.${row.ext}`, name: row.name, size: row.size,
      ...(row.width ? { width: row.width, height: row.height } : {}), ...(row.seconds ? { seconds: Math.round(row.seconds) } : {}) };
  }
  mediaMap(revision) {
    return Object.fromEntries(this.store.all("SELECT m.* FROM guide_revision_media r JOIN guide_media m ON m.id=r.media WHERE r.revision=? AND m.state='ready'", revision)
      .map((row) => [row.id, this.mediaView(row)]));
  }
  // A file: public once a published guide shows it; before that its author, admins and the holder of a
  // review link (the Telegram card) see it.
  media(name, { account = null, admin = false, review = '' } = {}) {
    const match = /^([A-Za-z0-9_-]{20})\.([a-z0-9]{1,8})$/.exec(name || '');
    const row = match && this.store.get("SELECT * FROM guide_media WHERE id=? AND state='ready' AND ext=?", match[1], match[2]);
    if (!row) fail(404, 'Файл не найден.');
    const published = !!this.store.get(`SELECT 1 x FROM guide_revision_media rm JOIN guides g ON g.public_revision=rm.revision
      WHERE rm.media=? AND g.status='approved'`, row.id);
    const reviewed = !published && !!review && !!this.store.get('SELECT 1 x FROM guide_revision_media WHERE media=? AND revision=?', row.id, this.reviewRevision(review) || 0);
    if (!published && !admin && row.account !== account && !reviewed) fail(404, 'Файл не найден.');
    const path = this.file(row);
    if (!existsSync(path)) fail(404, 'Файл не найден.');
    return { path, size: statSync(path).size, type: row.mime, kind: row.kind, name: row.name, public: published };
  }
  // Uploads nothing uses: unfinished after a day, finished but in no revision after two.
  cleanup() {
    const store = this.store, at = now(store);
    for (const row of store.all(`SELECT * FROM guide_media m WHERE (state='uploading' AND created<?) OR (state='ready' AND created<?
      AND NOT EXISTS(SELECT 1 FROM guide_revision_media r WHERE r.media=m.id)) LIMIT 500`, at - 86_400_000, at - 2 * 86_400_000)) this.forget(row);
  }

  // ——— Writing.
  get(id) { return isId(id, 12) ? this.store.get('SELECT * FROM guides WHERE id=?', id) : null; }
  revision(id) { return this.store.get('SELECT * FROM guide_revisions WHERE id=?', id); }
  // The author's guide; admins may take anyone's (to correct it, src/guides/GuideWrite.jsx).
  owned(account, id, { admin = false } = {}) {
    const guide = this.get(id);
    if (!guide || (guide.account !== account && !admin) || guide.status === 'deleted') fail(404, 'Гайд не найден.');
    return guide;
  }
  // Checks a draft from the editor → the row to store and its uploads.
  prepare(account, input, guide = null) {
    const title = String(input.title ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (title.length > GUIDE_LIMITS.title) fail(400, `Название до ${GUIDE_LIMITS.title} символов.`);
    const category = isGuideCategory(input.category) ? input.category : 'general';
    let normal;
    try { normal = normalizeGuideDoc(input.doc); } catch (error) { fail(400, error.message); }
    const ids = [...new Set(normal.media)];
    const rows = ids.length ? this.store.all(`SELECT * FROM guide_media WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const kinds = new Map();
    const walk = (nodes) => { for (const node of nodes || []) { if (node.attrs?.media) kinds.set(node.attrs.media, node.type); walk(node.content); } };
    walk(normal.doc.content);
    for (const id of ids) {
      const row = byId.get(id);
      // The author's uploads, and an admin's own when an admin corrects the guide.
      if (!row || row.state !== 'ready' || (row.account !== (guide?.account ?? account) && row.account !== account)) fail(400, 'Одно из вложений не загружено или удалено. Добавь его ещё раз.');
      if (row.kind !== kinds.get(id)) fail(400, 'Вложение вставлено не тем блоком.');
    }
    const images = ids.filter((id) => byId.get(id).kind === 'image');
    const cover = images.includes(input.cover) ? input.cover : images[0] || '';
    return { title, category, cover, body: JSON.stringify(normal.doc), text: normal.text, media: ids };
  }
  // Saves the editor's draft: a new guide, its draft, or a new draft over the published version.
  // A version waiting for review goes back to the draft (it leaves the queue until sent again).
  save(account, input, { admin = false } = {}) {
    const store = this.store;
    return store.tx(() => {
      let guide = input.id ? this.owned(account, input.id, { admin }) : null;
      if (guide?.status === 'hidden' && !admin) fail(403, 'Гайд скрыт модератором.');
      const draft = this.prepare(account, input, guide), at = now(store);
      if (!guide) {
        if (!store.trusted(account)) store.rate(`guide-new:${account}`, GUIDE_QUOTAS.draftsDaily, 86_400_000, { message: `За сутки можно начать ${GUIDE_QUOTAS.draftsDaily} гайдов.`, code: 'guide_new_limit' });
        const id = newId(9);
        store.run('INSERT INTO guides(id,account,created,updated) VALUES(?,?,?,?)', id, account, at, at);
        guide = this.get(id);
        this.person(account);
      }
      let revision = guide.draft_revision ? this.revision(guide.draft_revision) : null;
      if (revision && input.revision && Number(input.revision) !== revision.id) fail(409, 'Гайд изменён в другой вкладке. Обнови страницу.');
      if (revision) {
        store.run("UPDATE guide_revisions SET title=?,category=?,cover=?,body=?,text=?,status='draft',reason='',updated=? WHERE id=?",
          draft.title, draft.category, draft.cover, draft.body, draft.text, at, revision.id);
      } else {
        const made = store.run('INSERT INTO guide_revisions(guide,title,category,cover,body,text,created,updated) VALUES(?,?,?,?,?,?,?,?)',
          guide.id, draft.title, draft.category, draft.cover, draft.body, draft.text, at, at);
        revision = { id: Number(made.lastInsertRowid) };
        store.run('UPDATE guides SET draft_revision=? WHERE id=?', revision.id, guide.id);
      }
      store.run('DELETE FROM guide_revision_media WHERE revision=?', revision.id);
      for (const media of draft.media) store.run('INSERT INTO guide_revision_media(revision,media) VALUES(?,?)', revision.id, media);
      store.run("UPDATE guides SET updated=?, status=CASE WHEN status IN ('pending','rejected') AND public_revision IS NULL THEN 'draft' ELSE status END WHERE id=?", at, guide.id);
      // The mark: on by anyone who may edit; off only by an admin (the author's «off» changes nothing).
      const modding = input.modding === true ? 1 : input.modding === false && admin ? 0 : null;
      if (modding !== null && modding !== (this.get(guide.id).modding || 0)) {
        store.run('UPDATE guides SET modding=? WHERE id=?', modding, guide.id);
        store.audit(guideKey(guide.id), modding ? 'guide-modding-on' : 'guide-modding-off');
      }
      return { id: guide.id, revision: revision.id, status: 'draft', saved: at, modding: !!this.get(guide.id).modding };
    });
  }
  // Sends the draft to the moderators.
  submit(account, id, identity = null) {
    const store = this.store;
    return store.tx(() => {
      const guide = this.owned(account, id);
      if (guide.status === 'hidden') fail(403, 'Гайд скрыт модератором.');
      const revision = guide.draft_revision && this.revision(guide.draft_revision);
      if (!revision) fail(409, 'Нет изменений для проверки.');
      if (revision.status === 'pending') return { id, revision: revision.id, status: 'pending' };
      if (store.paused()) fail(503, 'Приём временно приостановлен. Попробуй позже.');
      for (const key of [identity?.browser, identity?.ip, `account:${account}`].filter(Boolean))
        if (store.get('SELECT key FROM blocks WHERE key=? AND until_at>?', key, now(store))) fail(403, 'Отправка временно ограничена.');
      if (revision.title.length < 3) fail(400, 'Назови гайд: от 3 символов.');
      const media = store.get('SELECT count(*) n FROM guide_revision_media WHERE revision=?', revision.id).n;
      if (revision.text.length < 40 && !media && !/"youtube"/.test(revision.body)) fail(400, 'В гайде пока почти ничего нет: добавь текст или картинки.');
      if (!store.trusted(account)) store.rate(`guide-submit:${account}`, GUIDE_QUOTAS.submitsDaily, 86_400_000, { message: `За сутки можно отправить на проверку ${GUIDE_QUOTAS.submitsDaily} версий.`, code: 'guide_submit_limit' });
      if (store.get("SELECT count(*) n FROM guide_revisions WHERE status='pending'").n >= GUIDE_QUOTAS.pending) fail(503, 'Очередь проверки заполнена. Попробуй позже.');
      store.run("UPDATE guide_revisions SET status='pending',reason='',updated=? WHERE id=?", now(store), revision.id);
      store.run("UPDATE guides SET status=CASE WHEN public_revision IS NULL THEN 'pending' ELSE status END, updated=? WHERE id=?", now(store), id);
      store.audit(guideKey(id), 'guide-submit');
      return { id, revision: revision.id, status: 'pending' };
    });
  }
  // The author deletes the guide: versions, comments, likes; its uploads go with the next cleanup.
  remove(account, id, { admin = false } = {}) {
    const store = this.store;
    return store.tx(() => {
      const guide = admin ? this.get(id) : this.owned(account, id);
      if (!guide) fail(404, 'Гайд не найден.');
      const media = store.all('SELECT DISTINCT rm.media FROM guide_revision_media rm JOIN guide_revisions r ON r.id=rm.revision WHERE r.guide=?', id).map((row) => row.media);
      store.run('DELETE FROM guides WHERE id=?', id);
      // Unused now: gone at once, not with the cleanup two days later.
      for (const mediaId of media) {
        if (store.get('SELECT 1 x FROM guide_revision_media WHERE media=?', mediaId)) continue;
        const row = store.get('SELECT * FROM guide_media WHERE id=?', mediaId);
        if (row) this.forget(row);
      }
      store.audit(guideKey(id), admin ? 'guide-delete-admin' : 'guide-delete');
      return { deleted: true };
    });
  }

  // ——— Reading.
  card(row, people, extra = {}) {
    const cover = row.cover ? this.store.get("SELECT * FROM guide_media WHERE id=? AND state='ready'", row.cover) : null;
    return { id: row.id, title: row.title, category: row.category, excerpt: guideExcerpt(row.text, 180),
      cover: cover ? { url: this.mediaView(cover).url, width: cover.width, height: cover.height } : null,
      author: people[row.account] || null, published: row.published, updated: row.updated,
      likes: row.likes ?? 0, comments: row.comments ?? 0, modding: !!row.modding, ...extra };
  }
  list({ category = '', query = '', sort = 'new', page = 0 } = {}) {
    const store = this.store, args = [];
    let where = "g.status='approved'";
    if (isGuideCategory(category)) { where += ' AND r.category=?'; args.push(category); }
    const q = String(query || '').trim().toLowerCase().slice(0, 80);
    if (q) { where += " AND (unicode_lower(r.title) LIKE ? ESCAPE '!' OR unicode_lower(r.text) LIKE ? ESCAPE '!')"; const like = `%${q.replace(/[!%_]/g, (c) => `!${c}`)}%`; args.push(like, like); }
    const counts = `(SELECT count(*) FROM guide_likes l WHERE l.guide=g.id) likes, (SELECT count(*) FROM guide_comments c WHERE c.guide=g.id AND c.state='visible') comments`;
    const order = sort === 'popular' ? 'likes DESC, g.published DESC' : 'g.published DESC';
    const total = store.get(`SELECT count(*) n FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE ${where}`, ...args).n;
    const rows = store.all(`SELECT g.id, g.account, g.published, g.updated, g.modding, r.title, r.category, r.cover, r.text, ${counts}
      FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, PAGE, Math.max(0, page | 0) * PAGE);
    const people = this.people(rows.map((row) => row.account));
    const categories = Object.fromEntries(store.all("SELECT r.category, count(*) n FROM guides g JOIN guide_revisions r ON r.id=g.public_revision WHERE g.status='approved' GROUP BY r.category").map((row) => [row.category, row.n]));
    return { items: rows.map((row) => this.card(row, people)), total, page: Math.max(0, page | 0), pageSize: PAGE, categories };
  }
  // A guide to read: the published version, or for its author and admins (and a review link) the
  // version being written or checked (`review`).
  view(id, { account = null, admin = false, review = '' } = {}) {
    const store = this.store, guide = this.get(id);
    if (!guide || guide.status === 'deleted') fail(404, 'Гайд не найден.');
    const mine = !!account && guide.account === account;
    const reviewing = review ? this.reviewRevision(review) : 0;
    let revision = guide.public_revision && guide.status === 'approved' ? this.revision(guide.public_revision) : null;
    const draft = guide.draft_revision ? this.revision(guide.draft_revision) : null;
    if (draft && ((reviewing && reviewing === draft.id) || ((mine || admin) && (review === 'draft' || !revision)))) revision = draft;
    if (!revision && (mine || admin) && guide.public_revision) revision = this.revision(guide.public_revision);
    if (!revision) fail(404, guide.status === 'hidden' ? 'Гайд скрыт модератором.' : 'Гайд не найден.');
    const people = this.people([guide.account]);
    const likes = store.get('SELECT count(*) n FROM guide_likes WHERE guide=?', id).n;
    const liked = !!account && !!store.get('SELECT 1 x FROM guide_likes WHERE guide=? AND account=?', id, account);
    const isPublic = revision.id === guide.public_revision && guide.status === 'approved';
    return { ...this.card({ ...revision, id, account: guide.account, published: guide.published, updated: revision.updated, likes, modding: guide.modding,
      comments: store.get("SELECT count(*) n FROM guide_comments WHERE guide=? AND state='visible'", id).n }, people),
      revision: revision.id, doc: JSON.parse(revision.body), media: this.mediaMap(revision.id), liked, mine, public: isPublic,
      // What only the author and admins see: the version's state, the reason it was turned down, a waiting edit.
      ...((mine || admin) ? { status: isPublic ? guide.status : revision.status, guideStatus: guide.status, publicRevision: guide.public_revision || null,
        reason: revision.reason || guide.reason || '', draft: draft ? { revision: draft.id, status: draft.status, reason: draft.reason } : null } : {}),
      ...(admin ? { review: this.reviewToken(revision.id) } : {}) };
  }
  // The editor's start: the draft if there is one, else the published version to edit.
  editable(account, id, { admin = false } = {}) {
    const guide = this.owned(account, id, { admin });
    const revision = this.revision(guide.draft_revision || guide.public_revision);
    if (!revision) fail(404, 'Гайд не найден.');
    return { id, revision: guide.draft_revision || null, title: revision.title, category: revision.category, cover: revision.cover,
      doc: JSON.parse(revision.body), media: this.mediaMap(revision.id), status: revision.status, reason: revision.reason, published: !!guide.public_revision && guide.status === 'approved',
      modding: !!guide.modding,
      // An admin correcting someone else's guide publishes at once (publish).
      ...(guide.account !== account ? { foreign: true, author: this.people([guide.account])[guide.account] || null } : {}) };
  }
  // An admin publishes the draft at once — their own correction or the author's version — as approving
  // it would; the author hears from the bot as after any approval.
  publish(id, actor) {
    const store = this.store;
    return store.tx(() => {
      const guide = this.get(id);
      if (!guide || guide.status === 'deleted') fail(404, 'Гайд не найден.');
      const revision = guide.draft_revision && this.revision(guide.draft_revision);
      if (!revision) fail(409, 'Нет изменений для публикации.');
      if (revision.title.length < 3) fail(400, 'Назови гайд: от 3 символов.');
      store.run("UPDATE guide_revisions SET status='pending', reason='' WHERE id=?", revision.id);
      return this.moderate(revision.id, { action: 'approve' }, { transaction: false, actor });
    });
  }
  mine(account) {
    const rows = this.store.all(`SELECT g.*, r.title, r.category, r.cover, r.text, r.status rstatus, r.reason rreason,
      (SELECT count(*) FROM guide_likes l WHERE l.guide=g.id) likes, (SELECT count(*) FROM guide_comments c WHERE c.guide=g.id AND c.state='visible') comments
      FROM guides g JOIN guide_revisions r ON r.id=coalesce(g.draft_revision, g.public_revision) WHERE g.account=? AND g.status<>'deleted' ORDER BY g.updated DESC LIMIT 200`, account);
    const people = this.people([account]);
    return { items: rows.map((row) => this.card(row, people, { status: row.status, draft: row.draft_revision ? { status: row.rstatus, reason: row.rreason } : null,
      reason: row.reason || '' })) };
  }
  like(id, account, liked) {
    const store = this.store, guide = this.get(id);
    if (!guide || guide.status !== 'approved') fail(404, 'Гайд не найден.');
    if (liked && guide.account === account) fail(403, 'Свой гайд лайкнуть нельзя.');
    store.rate(`like:${account}`, 90, 60_000);
    if (liked) store.run('INSERT OR IGNORE INTO guide_likes(guide,account,created) VALUES(?,?,?)', id, account, now(store));
    else store.run('DELETE FROM guide_likes WHERE guide=? AND account=?', id, account);
    return { likes: store.get('SELECT count(*) n FROM guide_likes WHERE guide=?', id).n, liked };
  }

  // ——— Comments: published at once, threads oldest first, each thread's replies under its first
  // comment; a deleted first comment with replies stays as «удалён». Pages go by `offset`.
  comments(id, { account = null, admin = false, offset = 0 } = {}) {
    const store = this.store, guide = this.get(id);
    if (!guide || guide.status !== 'approved') fail(404, 'Гайд не найден.');
    const rows = store.all(`SELECT * FROM guide_comments c WHERE guide=? AND (state='visible'
      OR (thread IS NULL AND EXISTS(SELECT 1 FROM guide_comments x WHERE x.thread=c.id AND x.state='visible')))
      ORDER BY coalesce(thread, id), id LIMIT ? OFFSET ?`, id, COMMENTS_PAGE + 1, Math.max(0, Math.min(100_000, Number(offset) || 0)));
    const more = rows.length > COMMENTS_PAGE, page = rows.slice(0, COMMENTS_PAGE);
    const people = this.people(page.map((row) => row.account));
    return { items: page.map((row) => this.commentView(row, people, { account, admin, owner: guide.account })), more,
      total: store.get("SELECT count(*) n FROM guide_comments WHERE guide=? AND state='visible'", id).n };
  }
  commentView(row, people, { account, admin, owner }) {
    const visible = row.state === 'visible';
    const reply = row.reply ? this.store.get('SELECT id, account, state FROM guide_comments WHERE id=?', row.reply) : null;
    const replyName = reply ? (this.people([reply.account])[reply.account]?.name || '') : '';
    return { id: row.id, thread: row.thread || null, author: visible ? people[row.account] || null : null, body: visible ? row.body : '', deleted: !visible, created: row.created, edited: row.edited || null,
      reply: reply ? { id: reply.id, name: reply.state === 'visible' ? replyName : '' } : null,
      mine: !!account && row.account === account, removable: visible && !!account && (row.account === account || owner === account || admin) };
  }
  comment(id, account, { body, reply = null }) {
    const store = this.store;
    return store.tx(() => {
      const guide = this.get(id);
      if (!guide || guide.status !== 'approved') fail(404, 'Гайд не найден.');
      if (store.get('SELECT key FROM blocks WHERE key=? AND until_at>?', `account:${account}`, now(store))) fail(403, 'Комментарии для тебя временно ограничены.');
      let text;
      try { text = cleanComment(body); } catch (error) { fail(400, error.message); }
      const to = reply ? store.get("SELECT id, thread FROM guide_comments WHERE id=? AND guide=? AND state='visible'", Number(reply), id) : null;
      if (reply && !to) fail(404, 'Комментарий, на который ты отвечаешь, удалён.');
      if (!store.trusted(account)) {
        store.rate(`guide-comment:${account}`, GUIDE_QUOTAS.comments, 60_000, { message: 'Слишком часто. Подожди минуту.', code: 'guide_comment_burst' });
        store.rate(`guide-comment-day:${account}`, GUIDE_QUOTAS.commentsDaily, 86_400_000, { message: 'На сегодня комментариев достаточно.', code: 'guide_comment_limit' });
      }
      const made = store.run('INSERT INTO guide_comments(guide,account,reply,thread,body,created) VALUES(?,?,?,?,?,?)', id, account, to?.id ?? null, to ? to.thread || to.id : null, text, now(store));
      this.person(account);
      const row = store.get('SELECT * FROM guide_comments WHERE id=?', Number(made.lastInsertRowid));
      return this.commentView(row, this.people([account]), { account, admin: false, owner: guide.account });
    });
  }
  removeComment(commentId, account, { admin = false, actor = null } = {}) {
    const store = this.store, row = store.get('SELECT c.*, g.account owner FROM guide_comments c JOIN guides g ON g.id=c.guide WHERE c.id=?', Number(commentId));
    if (!row || row.state !== 'visible') fail(404, 'Комментарий не найден.');
    if (!admin && row.account !== account && row.owner !== account) fail(403, 'Удалить можно свой комментарий или комментарий к своему гайду.');
    store.run("UPDATE guide_comments SET state=?, body='' WHERE id=?", admin && row.account !== account ? 'hidden' : 'deleted', row.id);
    store.run('UPDATE guide_reports SET resolved=1 WHERE comment=? AND resolved=0', row.id);
    store.audit(guideKey(row.guide), `comment-delete:${row.id}`, actor);
    return { deleted: true };
  }
  report(account, { guide: id, comment = null, reason }) {
    const store = this.store, guide = this.get(id);
    if (!guide || guide.status !== 'approved') fail(404, 'Гайд не найден.');
    const text = String(reason ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) fail(400, 'Напиши, что не так.');
    if (text.length > 500) fail(400, 'Причина до 500 символов.');
    if (comment && !store.get("SELECT 1 x FROM guide_comments WHERE id=? AND guide=? AND state='visible'", Number(comment), id)) fail(404, 'Комментарий не найден.');
    if (!store.trusted(account)) store.rate(`guide-report:${account}`, GUIDE_QUOTAS.reportsDaily, 86_400_000, { message: 'На сегодня жалоб достаточно.', code: 'guide_report_limit' });
    store.run('INSERT OR IGNORE INTO guide_reports(kind,guide,comment,account,reason,created) VALUES(?,?,?,?,?,?)', comment ? 'comment' : 'guide', id, comment ? Number(comment) : null, account, text, now(store));
    return { reported: true };
  }

  // What the link preview and the Telegram card draw (server/link-preview.mjs guidePreviewImage): a
  // published guide, or a given version.
  preview(id, revisionId = null) {
    const guide = this.get(id);
    const revision = revisionId ? this.revision(revisionId) : guide?.status === 'approved' && this.revision(guide.public_revision);
    if (!guide || !revision || revision.guide !== guide.id) fail(404, 'Гайд не найден.');
    const cover = revision.cover && this.store.get("SELECT * FROM guide_media WHERE id=? AND state='ready'", revision.cover);
    const path = cover ? this.file(cover) : null;
    return { revision: revision.id, title: revision.title || 'Без названия', section: GUIDE_CATEGORIES.find((c) => c.id === revision.category)?.title || '',
      author: this.people([guide.account])[guide.account]?.name || '', cover: path && existsSync(path) ? path : null };
  }
  // An admin puts the mark on or takes it off (the review panel, the guide page).
  setModding(id, on, actor = null) {
    const guide = this.get(id);
    if (!guide || guide.status === 'deleted') fail(404, 'Гайд не найден.');
    this.store.run('UPDATE guides SET modding=? WHERE id=?', on ? 1 : 0, id);
    this.store.audit(guideKey(id), on ? 'guide-modding-on' : 'guide-modding-off', actor);
    return { id, modding: !!on };
  }
  // ——— Moderation. A review link lets the Telegram topic read a waiting version (and its files).
  reviewToken(revision) { return `${revision}.${createHmac('sha256', this.salt).update(`guide-review:${revision}`).digest('base64url').slice(0, 22)}`; }
  reviewRevision(token) {
    const match = /^([1-9]\d{0,12})\.([A-Za-z0-9_-]{22})$/.exec(token || '');
    return match && this.reviewToken(Number(match[1])) === token ? Number(match[1]) : 0;
  }
  // The admin panel's tabs and their counts.
  counts() {
    return Object.fromEntries(Object.entries(GUIDE_FILTERS).map(([key, sql]) => [key, this.store.get(`SELECT count(*) n FROM guide_revisions r JOIN guides g ON g.id=r.guide WHERE ${sql}`).n]));
  }
  moderation(filter = 'pending', page = 0, search = '') {
    const store = this.store, FILTERS = GUIDE_FILTERS;
    const counts = this.counts();
    const where = `(${FILTERS[filter] || FILTERS.pending})${search ? " AND unicode_lower(r.title) LIKE ? ESCAPE '!'" : ''}`;
    const args = search ? [`%${search.toLowerCase().replace(/[!%_]/g, (c) => `!${c}`)}%`] : [];
    const rows = store.all(`SELECT r.*, g.account, g.status gstatus, g.public_revision, g.published, g.modding FROM guide_revisions r JOIN guides g ON g.id=r.guide WHERE ${where}
      ORDER BY ${filter === 'pending' ? 'r.updated' : 'r.updated DESC'} LIMIT 20 OFFSET ?`, ...args, Math.max(0, page | 0) * 20);
    const people = this.people(rows.map((row) => row.account));
    // One row per version (a guide can be in a tab twice: hidden, with a rejected edit); `guide` is its id.
    const items = rows.map((row) => ({ ...this.card({ ...row, id: row.guide }, people), id: row.id, guide: row.guide, revision: row.id, status: row.status, guideStatus: row.gstatus, reason: row.reason,
      update: !!row.public_revision && row.public_revision !== row.id, doc: JSON.parse(row.body), media: this.mediaMap(row.id), review: this.reviewToken(row.id),
      reports: store.all('SELECT p.id, p.kind, p.comment, p.reason, p.created, c.body FROM guide_reports p LEFT JOIN guide_comments c ON c.id=p.comment WHERE p.guide=? AND p.resolved=0 ORDER BY p.id', row.guide) }));
    return { items, total: store.get(`SELECT count(*) n FROM guide_revisions r JOIN guides g ON g.id=r.guide WHERE ${where}`, ...args).n, counts };
  }
  // approve / reject (a waiting version), hide / restore (the published guide), resolve (its reports).
  moderate(revisionId, { action, reason = '' }, { transaction = true, actor = null } = {}) {
    const store = this.store;
    const apply = () => {
      const revision = this.revision(Number(revisionId));
      if (!revision) fail(404, 'Версия гайда не найдена.');
      const guide = this.get(revision.guide);
      const need = (ok) => { if (!ok) fail(409, 'Гайд уже проверен или изменён. Обнови список.'); };
      const at = now(store);
      if (action === 'approve') {
        need(revision.status === 'pending' && guide.draft_revision === revision.id);
        const first = !guide.public_revision;
        if (guide.public_revision) store.run('DELETE FROM guide_revisions WHERE id=?', guide.public_revision);
        store.run("UPDATE guide_revisions SET status='approved', reason='', updated=? WHERE id=?", at, revision.id);
        store.run("UPDATE guides SET public_revision=?, draft_revision=NULL, status=CASE WHEN status='hidden' THEN 'hidden' ELSE 'approved' END, reason='', updated=?, published=coalesce(published, ?) WHERE id=?",
          revision.id, at, at, guide.id);
        store.run('INSERT OR IGNORE INTO guide_notices(revision,account,guide,first,created) VALUES(?,?,?,?,?)', revision.id, guide.account, guide.id, first ? 1 : 0, at);
        if (first) store.notifyFollowers(guide.account, `guide:${guide.id}`);
      } else if (action === 'reject') {
        need(revision.status === 'pending' && guide.draft_revision === revision.id);
        if (!reason) fail(400, 'Укажи причину отказа.');
        store.run("UPDATE guide_revisions SET status='rejected', reason=?, updated=? WHERE id=?", reason, at, revision.id);
        store.run("UPDATE guides SET status=CASE WHEN public_revision IS NULL THEN 'rejected' ELSE status END, updated=? WHERE id=?", at, guide.id);
        store.rejectNotice('guide', revision.id, guide.account);
      } else if (action === 'hide') {
        need(guide.status === 'approved' && guide.public_revision === revision.id);
        store.run("UPDATE guides SET status='hidden', reason=?, updated=? WHERE id=?", reason, at, guide.id);
        store.run('UPDATE guide_reports SET resolved=1 WHERE guide=? AND resolved=0', guide.id);
      } else if (action === 'restore') {
        need(guide.status === 'hidden' && guide.public_revision === revision.id);
        store.run("UPDATE guides SET status='approved', reason='', updated=? WHERE id=?", at, guide.id);
      } else if (action === 'resolve') {
        store.run('UPDATE guide_reports SET resolved=1 WHERE guide=? AND resolved=0', guide.id);
      } else fail(400, 'Неизвестное действие.');
      store.audit(guideKey(guide.id), action, actor);
      return { id: guide.id, revision: revision.id };
    };
    return transaction ? store.tx(apply) : apply();
  }
  // A report from the Telegram topic: keep (resolve) or hide (the guide, or the reported comment).
  decideReport(reportId, action, { actor = null } = {}) {
    const store = this.store, report = store.get('SELECT * FROM guide_reports WHERE id=?', reportId);
    if (!report || report.resolved) fail(409, 'Жалоба уже рассмотрена.');
    if (action === 'hide') {
      if (report.kind === 'comment') this.removeComment(report.comment, null, { admin: true, actor });
      else {
        const guide = this.get(report.guide);
        this.moderate(guide.public_revision, { action: 'hide', reason: 'Скрыто после жалобы в Telegram.' }, { transaction: false, actor });
      }
    }
    store.run('UPDATE guide_reports SET resolved=1 WHERE id=?', reportId);
    store.audit(guideKey(report.guide), `report-${action}`, actor);
  }
}
