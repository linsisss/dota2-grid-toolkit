import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './catalog-store.mjs';
import { WIDGET_SHARE, cleanDesign, designMedia } from '../scripts/menu-widgets.mjs';
import { mediaKind } from '../scripts/menu-background.mjs';

// «Мастерская виджетов» (2026-10-31): widgets of one's own, made from blocks in the constructor's editor
// (scripts/menu-widgets.mjs cleanDesign), shared by signed-in authors. Every one waits for a moderator (the
// admin panel), as arts and backgrounds do; approved ones are in the gallery for everyone to add to their menu.
// A design names its pictures and videos by SHA-256: the author uploads each file once (widget_media, the files
// next to the database), the gallery serves them by that hash, and adding a widget downloads them into the
// browser (look-store.js keepMedia), so the built menu has them as the author's own build did.
const FILTERS = { pending: "status='pending'", approved: "status='approved'", hidden: "status IN ('hidden','rejected')" };
const HASH = /^[a-f0-9]{64}$/;

export { WIDGET_SHARE };

export class MenuWidgets {
  constructor(store, { dir }) {
    this.store = store; this.dir = dir;
    mkdirSync(dir, { recursive: true });
    store.db.exec(`CREATE TABLE IF NOT EXISTS menu_widgets(id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, name TEXT NOT NULL,
        design TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL DEFAULT '',
        likes INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS menu_widgets_status ON menu_widgets(status, updated);
      CREATE TABLE IF NOT EXISTS menu_widget_likes(widget INTEGER NOT NULL, account TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(widget, account));
      CREATE TABLE IF NOT EXISTS widget_media(hash TEXT PRIMARY KEY, account TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL);`);
  }
  // ——— Files. A picture (PNG, JPEG, WebP, GIF) or a video (MP4, WebM), by its own hash; the same file once.
  putMedia(user, hash, bytes) {
    if (!HASH.test(hash)) fail(400, 'Неверный адрес файла.');
    if (createHash('sha256').update(bytes).digest('hex') !== hash) fail(400, 'Файл повреждён при отправке. Попробуй ещё раз.');
    const kind = mediaKind(bytes);
    if (!kind) fail(415, 'Нужна картинка (PNG, JPEG, WebP, GIF) или видео (MP4, WebM).');
    if (bytes.length > WIDGET_SHARE.mediaBytes[kind.type]) fail(413, `${kind.type === 'image' ? 'Картинка' : 'Видео'} больше ${WIDGET_SHARE.mediaBytes[kind.type] / 1_000_000} МБ.`);
    const store = this.store;
    return store.tx(() => {
      if (store.get('SELECT hash FROM widget_media WHERE hash=?', hash)) return { hash, type: kind.mime };
      store.rate(`widget-media:${user.id}`, WIDGET_SHARE.dailyMedia, 86_400_000, { message: `За 24 часа можно отправить ${WIDGET_SHARE.dailyMedia} файлов для виджетов.`, code: 'widget_media_limit' });
      const used = store.get('SELECT coalesce(sum(size),0) n FROM widget_media WHERE account=?', user.id).n;
      if (used + bytes.length > WIDGET_SHARE.accountBytes) fail(413, 'Файлы виджетов этого аккаунта заняли 300 МБ.');
      writeFileSync(join(this.dir, hash), bytes);
      store.run('INSERT INTO widget_media(hash,account,type,size,created) VALUES(?,?,?,?,?)', hash, user.id, kind.mime, bytes.length, store.now());
      return { hash, type: kind.mime };
    });
  }
  // A file of a widget the asker may see (approved, or their own) → { path, size, mtime, type }.
  media(hash, user = null) {
    if (!HASH.test(hash)) fail(404, 'Файла нет.');
    const row = this.store.get('SELECT type,account FROM widget_media WHERE hash=?', hash);
    if (!row || !existsSync(join(this.dir, hash))) fail(404, 'Файла нет.');
    const path = join(this.dir, hash), stat = statSync(path);
    return { path, size: stat.size, mtime: stat.mtimeMs, type: row.type };
  }
  // ——— Widgets.
  submit(user, body) {
    const design = cleanDesign(body?.design), store = this.store;
    if (!design.blocks.length) fail(400, 'В виджете нет ни одного блока.');
    const media = designMedia(design), raw = JSON.stringify(design), hash = createHash('sha256').update(raw).digest('hex');
    return store.tx(() => {
      if (store.paused()) fail(503, 'Приём временно приостановлен. Мастерская доступна.');
      let bytes = 0;
      for (const key of media) {
        const row = store.get('SELECT size FROM widget_media WHERE hash=?', key);
        if (!row) fail(409, 'Не все картинки и видео виджета дошли до GridStudio. Попробуй ещё раз.', { code: 'widget_media_missing', hash: key });
        bytes += row.size;
      }
      if (bytes > WIDGET_SHARE.perWidgetBytes) fail(413, `Картинки и видео одного виджета — до ${WIDGET_SHARE.perWidgetBytes / 1_000_000} МБ.`);
      const same = store.get("SELECT status FROM menu_widgets WHERE hash=? AND status IN ('pending','approved')", hash);
      if (same) fail(409, same.status === 'approved' ? 'Такой виджет уже есть в мастерской.' : 'Такой виджет уже ждёт проверки.');
      if (!store.trusted(user.id)) store.rate(`widget:${user.id}`, WIDGET_SHARE.dailyWidgets, 86_400_000, { message: `За 24 часа можно отправить ${WIDGET_SHARE.dailyWidgets} виджетов.`, code: 'widget_limit' });
      if (store.get("SELECT count(*) n FROM menu_widgets WHERE status='pending'").n >= WIDGET_SHARE.pending) fail(503, 'Очередь проверки виджетов заполнена. Попробуй позже.');
      const now = store.now();
      const { lastInsertRowid } = store.run('INSERT INTO menu_widgets(account,name,design,hash,created,updated) VALUES(?,?,?,?,?,?)', user.id, design.name, raw, hash, now, now);
      const id = Number(lastInsertRowid);
      store.audit(`widget:${id}`, 'widget-submit');
      return { id, status: 'pending' };
    });
  }
  card(row, user = null) {
    const creator = this.store.profiles.creator(row.account);
    return { id: row.id, name: row.name, design: JSON.parse(row.design), status: row.status, reason: row.status === 'rejected' ? row.reason : '',
      author: creator?.name || '', avatar: creator?.avatar || null, creator: creator ? { key: creator.key, name: creator.name, avatar: creator.avatar, badges: creator.badges } : null, likes: row.likes, uses: row.uses, created: row.created, own: !!user && row.account === user.id,
      liked: !!user && !!this.store.get('SELECT 1 FROM menu_widget_likes WHERE widget=? AND account=?', row.id, user.id) };
  }
  // The gallery: approved widgets (and the asker's own, whatever their state, first), popular or new.
  gallery({ sort = 'popular', page = 0, search = '' } = {}, user = null) {
    const order = sort === 'new' ? 'created DESC, id DESC' : 'likes DESC, uses DESC, id DESC', store = this.store;
    const match = search ? " AND unicode_lower(name) LIKE ? ESCAPE '!'" : '', args = search ? [`%${search.toLowerCase().replace(/[!%_]/g, (c) => `!${c}`)}%`] : [];
    const items = store.all(`SELECT * FROM menu_widgets WHERE status='approved'${match} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, WIDGET_SHARE.page, page * WIDGET_SHARE.page).map((row) => this.card(row, user));
    const total = store.get(`SELECT count(*) n FROM menu_widgets WHERE status='approved'${match}`, ...args).n;
    const own = user && page === 0 ? store.all("SELECT * FROM menu_widgets WHERE account=? AND status IN ('pending','rejected','hidden') ORDER BY updated DESC LIMIT 20", user.id).map((row) => this.card(row, user)) : [];
    return { items, total, own };
  }
  one(id, user = null) {
    const row = this.store.get('SELECT * FROM menu_widgets WHERE id=?', id);
    if (!row || (row.status !== 'approved' && row.account !== user?.id)) fail(404, 'Виджет не найден.');
    return this.card(row, user);
  }
  like(id, user, on) {
    const store = this.store;
    return store.tx(() => {
      const row = store.get("SELECT account FROM menu_widgets WHERE id=? AND status='approved'", id);
      if (!row) fail(404, 'Виджет не найден.');
      if (row.account === user.id) fail(403, 'Свой виджет лайкнуть нельзя.');
      if (on) store.run('INSERT OR IGNORE INTO menu_widget_likes(widget,account,created) VALUES(?,?,?)', id, user.id, store.now());
      else store.run('DELETE FROM menu_widget_likes WHERE widget=? AND account=?', id, user.id);
      const { n } = store.get('SELECT count(*) n FROM menu_widget_likes WHERE widget=?', id);
      store.run('UPDATE menu_widgets SET likes=? WHERE id=?', n, id);
      return { likes: n, liked: on };
    });
  }
  // «Добавить в меню»: counted once a browser a day.
  use(id, identity) {
    const store = this.store;
    if (!store.get("SELECT 1 FROM menu_widgets WHERE id=? AND status='approved'", id)) fail(404, 'Виджет не найден.');
    try { store.rate(`widget-use:${id}:${identity.browser}`, 1, 86_400_000); } catch { return { ok: true }; }
    store.run('UPDATE menu_widgets SET uses=uses+1 WHERE id=?', id);
    return { ok: true };
  }
  remove(id, user) {
    const store = this.store, row = store.get('SELECT account FROM menu_widgets WHERE id=?', id);
    if (!row || row.account !== user.id) fail(404, 'Виджет не найден.');
    store.run("UPDATE menu_widgets SET status='deleted',updated=? WHERE id=?", store.now(), id);
    store.audit(`widget:${id}`, 'widget-delete');
    return { ok: true };
  }
  // ——— The admin queue and decisions.
  moderation(filter = 'pending', page = 0, search = '') {
    const store = this.store, match = search ? " AND unicode_lower(name) LIKE ? ESCAPE '!'" : '', args = search ? [`%${search.toLowerCase().replace(/[!%_]/g, (c) => `!${c}`)}%`] : [];
    const where = (FILTERS[filter] || FILTERS.pending) + match;
    const counts = Object.fromEntries(Object.entries(FILTERS).map(([key, sql]) => [key, store.get(`SELECT count(*) n FROM menu_widgets WHERE ${sql}`).n]));
    const items = store.all(`SELECT * FROM menu_widgets WHERE ${where} ORDER BY ${filter === 'pending' ? 'id' : 'updated DESC, id DESC'} LIMIT 20 OFFSET ?`, ...args, page * 20)
      .map((row) => ({ ...this.card(row), creator: store.profiles.creator(row.account), reason: row.reason }));
    const total = search ? store.get(`SELECT count(*) n FROM menu_widgets WHERE ${where}`, ...args).n : counts[filter in FILTERS ? filter : 'pending'];
    return { items, total, counts, paused: store.paused() };
  }
  moderate(id, { action, reason = '' }, { actor = null } = {}) {
    const store = this.store;
    return store.tx(() => {
      const row = store.get('SELECT * FROM menu_widgets WHERE id=?', id);
      if (!row) fail(404, 'Виджет не найден.');
      const need = (...states) => { if (!states.includes(row.status)) fail(409, 'Виджет уже проверен или изменён. Обнови список.'); };
      const set = (status, why = '') => store.run('UPDATE menu_widgets SET status=?,reason=?,updated=? WHERE id=?', status, why, store.now(), id);
      if (action === 'approve') { need('pending'); set('approved'); }
      else if (action === 'reject') { need('pending'); if (!reason) fail(400, 'Укажи причину отказа.'); set('rejected', reason); }
      else if (action === 'hide') { need('approved'); set('hidden', reason); }
      else if (action === 'restore') {
        need('hidden', 'rejected');
        if (store.get("SELECT id FROM menu_widgets WHERE hash=? AND status IN ('pending','approved') AND id<>?", row.hash, id)) fail(409, 'Такой же виджет уже есть или ждёт проверки.');
        set('approved');
      } else fail(400, 'Неизвестное действие.');
      store.audit(`widget:${id}`, action, actor);
      return { id, status: store.get('SELECT status FROM menu_widgets WHERE id=?', id).status };
    });
  }
}
