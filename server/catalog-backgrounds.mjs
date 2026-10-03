import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { digest, equal, fail } from './catalog-store.mjs';
import { BACKGROUND_LIMITS, backgroundMeta } from '../scripts/background-document.mjs';
import { MENU_SIZES } from '../scripts/menu-background.mjs';
import { videoFingerprint } from './similarity.mjs';

// Shared menu backgrounds (the workshop's «Фоны»). Like player arts: anyone may send one (ALTCHA, daily
// limits), a moderator approves it on the site or in the Telegram topic, only approved ones are
// listed. The files live next to the database (not in a release folder): <id>.webm as uploaded
// after ffprobe confirms a VP8/VP9 WebM of the stated screen size, <id>.jpg re-encoded here.
export const backgroundKey = (id) => `bg:${id}`;
const FILTERS = { pending: "status='pending'", reports: "status='approved' AND EXISTS(SELECT 1 FROM background_reports WHERE background=backgrounds.id AND resolved=0)",
  approved: "status='approved'", hidden: "status IN ('hidden','rejected')" };
const LIKES = '(SELECT count(*) FROM background_likes WHERE background=backgrounds.id)';

function ffprobe(args, path) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'matroska', ...args, path], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error('ffprobe')); });
  });
}
// Streams and duration; a WebM written without seeking has no duration in its header, then the
// last frame's end tells it.
async function probe(path) {
  const info = JSON.parse(await ffprobe(['-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json'], path));
  if (!(Number(info.format?.duration) > 0)) {
    const ends = (await ffprobe(['-select_streams', 'v:0', '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0'], path))
      .trim().split('\n').map((line) => line.split(',').map(Number)).map(([pts, duration]) => pts + (duration || 0)).filter(Number.isFinite);
    info.format = { ...info.format, duration: ends.length ? Math.max(...ends) : 0 };
  }
  return info;
}


export class CatalogBackgrounds {
  constructor(store, { dir }) {
    this.store = store; this.dir = dir;
    mkdirSync(dir, { recursive: true });
    store.db.exec(`CREATE TABLE IF NOT EXISTS backgrounds(
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
      aspect TEXT NOT NULL, seconds REAL NOT NULL, bytes INTEGER NOT NULL, hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL DEFAULT '',
      account TEXT, browser TEXT NOT NULL, ip TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS backgrounds_status ON backgrounds(status, updated);
      -- Likes from Telegram accounts and reports from browsers, as for grids (catalog-store.mjs).
      CREATE TABLE IF NOT EXISTS background_likes(background INTEGER NOT NULL, account TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(background, account));
      CREATE TABLE IF NOT EXISTS background_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, background INTEGER NOT NULL, browser TEXT NOT NULL, reason TEXT NOT NULL,
        created INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS one_background_report ON background_reports(background, browser) WHERE resolved=0;`);
    // Before 1.6 a background had one category; it becomes its only tag («Другое» — none). The API
    // and the bot may start together: the check is repeated under the write lock.
    const tagged = () => store.all('PRAGMA table_info(backgrounds)').some((column) => column.name === 'tags');
    if (!tagged()) store.tx(() => { if (!tagged()) store.db.exec(`
      ALTER TABLE backgrounds ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
      UPDATE backgrounds SET tags=json_array(category) WHERE category<>'Другое';
      ALTER TABLE backgrounds DROP COLUMN category;`); });
    // «Оригинал / по мотивам» of a signed-in author's background (scripts/background-document.mjs).
    if (!store.all('PRAGMA table_info(backgrounds)').some((column) => column.name === 'credit')) store.run("ALTER TABLE backgrounds ADD COLUMN credit TEXT NOT NULL DEFAULT ''");
    // Own backgrounds cannot be liked any more (like()); earlier self-likes go, as for grids.
    store.removeSelfLikes('background_likes', 'background', 'backgrounds', backgroundKey('*'));
  }
  get(id) { return this.store.get('SELECT * FROM backgrounds WHERE id=?', id); }
  // Backgrounds without a fingerprint — sent before them (2026-10-02) or before the second kind
  // (2026-10-03) — get theirs, one by one: a few seconds of ffmpeg each, then the comparison with the rest.
  async fingerprintMissing(limit = 500) {
    const rows = this.store.all(`SELECT id, seconds FROM backgrounds WHERE status IN ('pending','approved')
      AND NOT EXISTS(SELECT 1 FROM fingerprints f WHERE f.kind='background' AND f.id=backgrounds.id) ORDER BY id LIMIT ?`, limit);
    for (const row of rows) {
      const video = this.file(row.id, 'video');
      if (!existsSync(video)) continue;
      try { await this.store.similarity.saveBackground(row.id, await videoFingerprint(video)); } catch { /* Tried again on the next start. */ }
    }
    return rows.length;
  }
  file(id, kind) { return join(this.dir, `${id}.${kind === 'poster' ? 'jpg' : 'webm'}`); }
  // Checks and quotas before anything is written; files first, then the row, so a row always has files.
  async submit(input, poster, video, identity, account = null) {
    const meta = backgroundMeta(input), store = this.store, limits = BACKGROUND_LIMITS;
    if (video.length > limits.video) fail(413, `Видео больше ${limits.video / 1_000_000} МБ.`);
    if (poster.length > limits.poster) fail(413, 'Обложка слишком большая.');
    if (!(video[0] === 0x1a && video[1] === 0x45 && video[2] === 0xdf && video[3] === 0xa3)) fail(415, 'Нужен WebM, собранный на этой странице.');
    const hash = digest(Buffer.from(video.buffer, video.byteOffset, video.byteLength));
    const guard = () => {
      if (store.paused()) fail(503, 'Приём временно приостановлен. Мастерская и редактор доступны.');
      for (const key of [identity.browser, identity.ip]) if (store.get('SELECT key FROM blocks WHERE key=? AND until_at>?', key, store.now())) fail(403, 'Отправка с этого источника временно ограничена.');
      const same = store.get("SELECT status FROM backgrounds WHERE hash=? AND status IN ('pending','approved')", hash);
      if (same) fail(409, same.status === 'approved' ? 'Этот фон уже есть в галерее.' : 'Такой фон уже ждёт проверки.');
      if (store.get("SELECT count(*) n FROM backgrounds WHERE status='pending'").n >= limits.pending) fail(503, 'Очередь проверки фонов заполнена. Попробуй позже.');
      if (store.get("SELECT coalesce(sum(bytes),0) n FROM backgrounds WHERE status IN ('pending','approved')").n + video.length > limits.storage) fail(503, 'Галерея фонов заполнена. Попробуй позже.');
    };
    guard();
    // The upload must be what this page makes: one VP8/VP9 video track of the stated size, no sound.
    const temp = join(this.dir, `upload-${hash.slice(0, 16)}.webm`);
    writeFileSync(temp, video);
    let info;
    try { info = await probe(temp); } catch { rmSync(temp, { force: true }); fail(415, 'Видео не читается. Собери фон на этой странице заново.'); }
    const streams = info.streams || [], picture = streams.find((stream) => stream.codec_type === 'video'), [width, height] = MENU_SIZES[meta.aspect];
    const seconds = Number(info.format?.duration) || 0;
    const problem = !picture || streams.length !== 1 ? 'В файле должен быть один видеопоток без звука.'
      : !['vp8', 'vp9'].includes(picture.codec_name) ? 'Нужен WebM VP8 или VP9.'
      : picture.width !== width || picture.height !== height ? `Размер видео ${picture.width}×${picture.height}, а для ${meta.aspect} нужен ${width}×${height}.`
      : !(seconds > 0 && seconds <= limits.seconds) ? `Длина видео ${seconds.toFixed(1)} с, можно до ${limits.seconds - 1} с.` : '';
    if (problem) { rmSync(temp, { force: true }); fail(415, problem); }
    // The poster is redrawn, so only pixels are kept.
    let jpeg;
    try {
      const image = await loadImage(Buffer.from(poster.buffer, poster.byteOffset, poster.byteLength));
      const w = 640, h = Math.round(640 * height / width), canvas = createCanvas(w, h);
      canvas.getContext('2d').drawImage(image, 0, 0, w, h);
      jpeg = await canvas.encode('jpeg', 82);
    } catch { rmSync(temp, { force: true }); fail(415, 'Обложка не читается.'); }
    // Its fingerprint for near copies (server/similarity.mjs); a background without one is only not compared.
    const prints = await videoFingerprint(temp).catch(() => null);
    const now = store.now();
    return store.tx(() => {
      guard();
      if (store.trusted(account)) { /* No account budget; the network cap below still applies. */ }
      else if (account) store.rate(`bg-account:${account}`, limits.accountDaily, 86_400_000, { message: `С Telegram можно отправить ${limits.accountDaily} фонов за 24 часа.`, code: 'background_account_limit' });
      else store.rate(`bg:${identity.browser}`, limits.daily, 86_400_000, { message: `Без входа можно отправить ${limits.daily} фона за 24 часа. С Telegram — до ${limits.accountDaily}.`, code: 'background_guest_limit' });
      store.rate(`bg-ip:${identity.ip}`, limits.networkDaily, 86_400_000, { message: 'Достигнут общий лимит отправки фонов из этой сети за 24 часа.', code: 'background_network_limit' });
      // A signed-in author is their profile (server/profiles.mjs): no signature, only «по мотивам».
      const { lastInsertRowid } = store.run('INSERT INTO backgrounds(title,author,credit,tags,aspect,seconds,bytes,hash,account,browser,ip,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        meta.title, account ? '' : meta.author, meta.credit, JSON.stringify(meta.tags), meta.aspect, Math.round(seconds * 10) / 10, video.length, hash, account, identity.browser, identity.ip, now, now);
      const id = Number(lastInsertRowid);
      writeFileSync(this.file(id, 'poster'), jpeg);
      renameSync(temp, this.file(id, 'video'));  // the very bytes ffprobe checked
      // Compared with the other backgrounds after this answer (server/similarity.mjs queueMatches).
      if (prints) store.similarity.saveBackground(id, prints).catch(() => {});
      store.audit(backgroundKey(id), 'background-submit');
      return { id, status: 'pending', token: this.token(id) };
    });
  }
  // liked and mine are the viewer's (the like button is off on their own background); the answers are never cached.
  view(row, account = null) {
    // A signed-in author's background shows their profile; an old signature of theirs stays private.
    return { id: row.id, title: row.title, author: row.account ? '' : row.author, credit: row.credit || '', ...(row.account ? { creator: this.store.profiles.creator(row.account) } : {}),
      tags: JSON.parse(row.tags), aspect: row.aspect, seconds: row.seconds, bytes: row.bytes, updated: row.updated,
      likes: this.store.get('SELECT count(*) n FROM background_likes WHERE background=?', row.id).n,
      liked: !!(account && this.store.get('SELECT 1 FROM background_likes WHERE background=? AND account=?', row.id, account)), mine: !!(account && row.account === account) };
  }
  // The author's key to the moderation result of one submission (no account needed): derived from
  // the id, so nothing more is stored. The studio card keeps it (docs/customize.md).
  token(id) { return this.store.identity('background-status', String(id)).slice(0, 32); }
  status(id, token) {
    const row = this.get(id);
    if (!row || typeof token !== 'string' || !equal(token, this.token(id))) fail(404, 'Фон не найден.');
    return { id, status: row.status, reason: row.status === 'rejected' || row.status === 'hidden' ? row.reason : '' };
  }
  item(id, account = null) {
    const row = this.get(id);
    if (!row || row.status !== 'approved') fail(404, 'Фон не найден.');
    return this.view(row, account);
  }
  like(id, account, liked) {
    if (!account) fail(401, 'Войди через Telegram, чтобы поставить лайк.');
    return this.store.tx(() => {
      if (this.item(id, account).mine && liked) fail(403, 'Свою работу лайкнуть нельзя.');
      if (liked) this.store.run('INSERT OR IGNORE INTO background_likes VALUES(?,?,?)', id, account, this.store.now());
      else this.store.run('DELETE FROM background_likes WHERE background=? AND account=?', id, account);
      return { likes: this.store.get('SELECT count(*) n FROM background_likes WHERE background=?', id).n, liked };
    });
  }
  // One open report per browser and background; moderators see them in the Telegram topic and on the site.
  report(id, identity, reason) {
    this.item(id);
    return this.store.tx(() => {
      this.store.rate(`report:${identity.browser}`, 5, 86_400_000); this.store.rate(`report-ip:${identity.ip}`, 100, 86_400_000);
      this.store.run('INSERT OR IGNORE INTO background_reports(background,browser,reason,created) VALUES(?,?,?,?)', id, identity.browser, reason, this.store.now());
      return { reported: true };
    });
  }
  // The public gallery: approved only, newest or most liked first; search and tags as for grids
  // (CatalogStore.list), and the screen a background is made for (MENU_SIZES). `aspects`: how many
  // there are for every screen with this search and tag, for the filter.
  list({ query = '', tag = '', aspect = '', page = 0, popular = false, account = null } = {}) {
    const clauses = ["status='approved'"], args = [];
    if (query) {
      // The title, a guest's signature or a signed-in author's nickname.
      const q = `%${query.toLowerCase().replace(/[!%_]/g, (c) => `!${c}`)}%`, accounts = this.store.profiles.matching(query);
      clauses.push(`(unicode_lower(title) LIKE ? ESCAPE '!' OR (account IS NULL AND unicode_lower(author) LIKE ? ESCAPE '!')${accounts.length ? ` OR account IN (${accounts.map(() => '?').join(',')})` : ''})`);
      args.push(q, q, ...accounts);
    }
    if (tag) { clauses.push('EXISTS (SELECT 1 FROM json_each(tags) WHERE value=?)'); args.push(tag); }
    const aspects = Object.fromEntries(this.store.all(`SELECT aspect, count(*) n FROM backgrounds WHERE ${clauses.join(' AND ')} GROUP BY aspect`, ...args).map((row) => [row.aspect, row.n]));
    if (aspect) { clauses.push('aspect=?'); args.push(aspect); }
    const where = clauses.join(' AND ');
    const total = this.store.get(`SELECT count(*) n FROM backgrounds WHERE ${where}`, ...args).n;
    const items = this.store.all(`SELECT * FROM backgrounds WHERE ${where} ORDER BY ${popular ? `${LIKES} DESC, ` : ''}updated DESC, id DESC LIMIT 24 OFFSET ?`, ...args, page * 24).map((row) => this.view(row, account));
    return { items, total, aspects };
  }
  // A creator's approved backgrounds, newest first (the profile page, server/profiles.mjs).
  byAccount(account, viewer = null, limit = 60) {
    return this.store.all("SELECT * FROM backgrounds WHERE account=? AND status='approved' ORDER BY updated DESC, id DESC LIMIT ?", account, limit).map((row) => this.view(row, viewer));
  }
  // The approved backgrounds an account liked, the latest like first.
  liked(account, limit = 200) {
    return this.store.all(`SELECT b.* FROM background_likes l JOIN backgrounds b ON b.id=l.background WHERE l.account=? AND b.status='approved'
      ORDER BY l.created DESC, b.id DESC LIMIT ?`, account, limit).map((row) => this.view(row, account));
  }
  // A file may be read when it is approved, or by an admin.
  // Approved files are public; the others only for admins and the author's Telegram account.
  media(id, kind, admin = false, account = null) {
    const row = this.get(id);
    if (!row || (row.status !== 'approved' && !admin && !(account && row.account === account))) fail(404, 'Фон не найден.');
    const path = this.file(id, kind);
    if (!existsSync(path)) fail(404, 'Файл фона не найден.');
    return { path, size: statSync(path).size, public: row.status === 'approved' };
  }
  // The author's own backgrounds on their Telegram account, every status (the workshop's «Мои публикации»).
  mine(account) {
    return this.store.all("SELECT * FROM backgrounds WHERE account=? AND status IN ('pending','approved','rejected','hidden') ORDER BY created DESC, id DESC LIMIT 200", account)
      .map((row) => ({ ...this.view(row, account), status: row.status, reason: row.status === 'rejected' || row.status === 'hidden' ? row.reason : '', created: row.created }));
  }
  // The admin queue; `search` finds a title or an author in it, as the gallery's search does (tab counts stay whole).
  moderation(filter = 'pending', page = 0, search = '') {
    const store = this.store, creators = search ? store.profiles.matching(search) : [];
    const match = search ? ` AND (unicode_lower(title) LIKE ? ESCAPE '!' OR unicode_lower(author) LIKE ? ESCAPE '!'${creators.length ? ` OR account IN (${creators.map(() => '?').join(',')})` : ''})` : '';
    const args = search ? [...Array(2).fill(`%${search.toLowerCase().replace(/[!%_]/g, (c) => `!${c}`)}%`), ...creators] : [];
    const where = (FILTERS[filter] || FILTERS.pending) + match;
    const counts = Object.fromEntries(Object.entries(FILTERS).map(([key, sql]) => [key, store.get(`SELECT count(*) n FROM backgrounds WHERE ${sql}`).n]));
    const total = search ? store.get(`SELECT count(*) n FROM backgrounds WHERE ${where}`, ...args).n : counts[filter in FILTERS ? filter : 'pending'];
    const items = store.all(`SELECT * FROM backgrounds WHERE ${where} ORDER BY ${filter === 'pending' ? 'id' : 'updated DESC, id DESC'} LIMIT 20 OFFSET ?`, ...args, page * 20)
      .map((row) => {
        const reports = store.all('SELECT id,reason,created FROM background_reports WHERE background=? AND resolved=0 ORDER BY id', row.id);
        return { ...this.view(row), status: row.status, reason: row.reason, created: row.created, linked: !!row.account, related: store.get('SELECT count(*) n FROM backgrounds WHERE browser=?', row.browser).n,
          reports, similar: row.status === 'pending' || reports.length ? store.similarity.similarBackgrounds(row) : [] };
      });
    return { items, total, counts, paused: store.paused() };
  }
  moderate(id, { action, reason = '', title, author, credit, tags }, { transaction = true, actor = null } = {}) {
    const store = this.store;
    const apply = () => {
      const row = this.get(id);
      if (!row) fail(404, 'Фон не найден.');
      const need = (...states) => { if (!states.includes(row.status)) fail(409, 'Фон уже проверен или изменён. Обнови список.'); };
      const set = (status, why = '') => store.run('UPDATE backgrounds SET status=?,reason=?,updated=? WHERE id=?', status, why, store.now(), id);
      if (action === 'approve') { need('pending'); set('approved'); }
      else if (action === 'reject') { need('pending'); if (!reason) fail(400, 'Укажи причину отказа.'); set('rejected', reason); store.rejectNotice('background', id, row.account); }
      else if (action === 'hide') { need('approved'); set('hidden', reason); store.run('UPDATE background_reports SET resolved=1 WHERE background=?', id); }
      else if (action === 'resolve') { need('approved'); store.run('UPDATE background_reports SET resolved=1 WHERE background=?', id); }
      else if (action === 'restore') {
        need('hidden', 'rejected');
        if (store.get("SELECT id FROM backgrounds WHERE hash=? AND status IN ('pending','approved') AND id<>?", row.hash, id)) fail(409, 'Такой же фон уже есть в галерее или ждёт проверки.');
        set('approved');
      } else if (action === 'edit') {
        need('pending', 'approved');
        const meta = backgroundMeta({ title, author: row.account ? '' : author ?? row.author, credit: credit ?? row.credit, tags, aspect: row.aspect });
        store.run('UPDATE backgrounds SET title=?,author=?,credit=?,tags=?,updated=? WHERE id=?', meta.title, meta.author, meta.credit, JSON.stringify(meta.tags), store.now(), id);
        store.audit(backgroundKey(id), action, actor);
        return { title: meta.title, author: meta.author, credit: meta.credit, tags: meta.tags };
      } else fail(400, 'Неизвестное действие.');
      store.audit(backgroundKey(id), action, actor);
      return { id, status: this.get(id).status };
    };
    return transaction ? store.tx(apply) : apply();
  }
}
