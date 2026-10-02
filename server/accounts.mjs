import { randomBytes } from 'node:crypto';
import { digest, secret, equal, fail } from './catalog-store.mjs';
import { catalogText, selectedCatalogGrid } from '../scripts/catalog-document.mjs';
import C from '../scripts/core.mjs';

export const SESSION_AGE = 30 * 86400;
export class Accounts {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_sessions(hash TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_requests(id TEXT PRIMARY KEY, verifier TEXT NOT NULL, code TEXT NOT NULL, expires INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', candidate TEXT, message INTEGER);
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL,
        document TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL, preview TEXT, archived INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS workspace_owner ON workspaces(account,updated);
      CREATE TABLE IF NOT EXISTS account_avatars(account TEXT PRIMARY KEY, image BLOB NOT NULL, version TEXT NOT NULL);`);
    // 1.6.1: the grids of a file (names and the open one), so «Студия» on another device lists
    // them without the document. Older rows get it on their next save.
    if (!store.all('PRAGMA table_info(workspaces)').some((column) => column.name === 'grids')) store.db.exec('ALTER TABLE workspaces ADD COLUMN grids TEXT');
    this.thumbnails = new Map();
    // Every account has a creator profile; ones signed in before profiles get a generated nickname here.
    store.profiles.ensureAll();
  }
  // The signed-in account: its Telegram id and name (the server's), and its profile — the nickname and
  // avatar the site shows for it (server/profiles.mjs).
  user(session) {
    if (!session || !/^[\w-]{43}$/.test(session)) return null;
    const user = this.store.get('SELECT a.id,a.name,a.username FROM account_sessions s JOIN accounts a ON a.id=s.account WHERE s.hash=? AND s.expires>?', digest(session), this.store.now());
    if (!user) return null;
    const creator = this.store.profiles.creator(user.id);
    return { ...user, nickname: creator.name, profile: creator.key, avatar: creator.avatar };
  }
  setAvatar(id, image) {
    if (!image) return this.store.run('DELETE FROM account_avatars WHERE account=?', String(id));
    this.store.run('INSERT INTO account_avatars VALUES(?,?,?) ON CONFLICT(account) DO UPDATE SET image=excluded.image,version=excluded.version', String(id), image, digest(image).slice(0, 16));
  }
  avatar(user) { return this.store.get('SELECT image FROM account_avatars WHERE account=?', user.id)?.image; }
  require(session) { const user = this.user(session); if (!user) fail(401, 'Войди через Telegram.'); return user; }
  begin(ip, browser) {
    return this.store.tx(() => {
      this.store.rate(`login-tg:${ip}`, 20, 3_600_000); this.store.rate(`login-browser:${browser}`, 5, 600_000);
      this.store.run('DELETE FROM login_requests WHERE expires<?', this.store.now() - 86_400_000);
      this.store.run('DELETE FROM account_sessions WHERE expires<?', this.store.now());
      const id = randomBytes(24).toString('base64url'), verifier = secret(), expires = this.store.now() + 5 * 60_000;
      // Keep the legacy column to open existing databases without destructive migration.
      this.store.run('INSERT INTO login_requests(id,verifier,code,expires) VALUES(?,?,?,?)', id, digest(verifier), '', expires);
      return { id, verifier, expires };
    });
  }
  request(id) {
    const row = this.store.get('SELECT * FROM login_requests WHERE id=?', id);
    if (!row || row.expires <= this.store.now() || ['consumed', 'cancelled'].includes(row.state)) fail(410, 'Ссылка входа истекла. Начни вход заново на сайте.');
    return row;
  }
  candidate(id, from) {
    if (!Number.isSafeInteger(from?.id) || from.id < 1 || from.is_bot) fail(403, 'Вход доступен только пользователям Telegram.');
    return this.store.tx(() => {
      const row = this.request(id);
      const user = { id: String(from.id), name: [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 120) || 'Пользователь', username: String(from.username || '').slice(0, 40) };
      if (row.candidate && JSON.parse(row.candidate).id !== user.id) fail(409, 'Эта попытка входа уже открыта другим пользователем. Начни новую на сайте.');
      this.store.run('UPDATE login_requests SET candidate=? WHERE id=?', JSON.stringify(user), id);
      return { ...row, candidate: JSON.stringify(user) };
    });
  }
  approve(id, userId, approve) {
    return this.store.tx(() => {
      const row = this.request(id);
      if (!row.candidate || JSON.parse(row.candidate).id !== String(userId)) fail(403, 'Подтвердить вход может только тот, кто открыл ссылку.');
      this.store.run('UPDATE login_requests SET state=? WHERE id=?', approve ? 'approved' : 'cancelled', id);
    });
  }
  poll(id, verifier) {
    const row = this.request(id);
    if (!verifier || !equal(row.verifier, digest(verifier))) fail(404, 'Попытка входа не найдена в этом браузере.');
    return { state: row.state, expires: row.expires, ...(row.state === 'approved' ? { user: JSON.parse(row.candidate) } : {}) };
  }
  finish(id, verifier, expectedId, oldSession) {
    return this.store.tx(() => {
      const state = this.poll(id, verifier);
      if (state.state !== 'approved' || state.user.id !== expectedId) fail(409, 'Вход ещё не подтверждён в Telegram.');
      const user = state.user;
      this.store.run('INSERT INTO accounts VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username,updated=excluded.updated', user.id, user.name, user.username, this.store.now());
      if (oldSession) this.logout(oldSession);
      const session = secret(); this.store.run('INSERT INTO account_sessions VALUES(?,?,?)', digest(session), user.id, this.store.now() + SESSION_AGE * 1000);
      this.store.run("UPDATE login_requests SET state='consumed',verifier='' WHERE id=?", id);
      return { user: this.user(session), session };
    });
  }
  logout(session) { if (session) this.store.run('DELETE FROM account_sessions WHERE hash=?', digest(session)); }
  claim(id, token, user) {
    return this.store.tx(() => {
      const work = this.store.get('SELECT * FROM works WHERE id=?', id);
      if (work?.account === user.id) return { linked: true };
      this.store.owned(id, token);
      this.store.run('UPDATE works SET account=? WHERE id=? AND account IS NULL', user.id, id);
      // A like this account gave the guest grid would now be a like on its own work (refused by store.like).
      this.store.run('DELETE FROM likes WHERE work=? AND account=?', id, user.id);
      this.store.audit(id, `account-claim:${user.id}`); return { linked: true };
    });
  }
  publications(user) {
    return this.store.all("SELECT * FROM works WHERE account=? AND state!='deleted' ORDER BY created DESC", user.id).map(w => {
      const item = this.store.ownerView(w.id, '', user.id); delete item.grid; return item;
    });
  }
  listSpaces(user, archived = false) {
    return this.store.all('SELECT id,name,revision,updated,preview,archived,grids FROM workspaces WHERE account=? AND archived=? ORDER BY updated DESC', user.id, archived ? 1 : 0)
      .map(({ grids, ...row }) => {
        const info = grids ? JSON.parse(grids) : null;
        return { ...row, account: user.id, preview: row.preview ? JSON.parse(row.preview) : null, ...(info ? { gridNames: info.names, configIndex: info.configIndex } : {}) };
      });
  }
  space(id, user) {
    const row = this.store.get('SELECT * FROM workspaces WHERE id=? AND account=?', id, user.id);
    if (!row) fail(404, 'Рабочее пространство не найдено в этом аккаунте.');
    return { ...row, document: JSON.parse(row.document), preview: row.preview ? JSON.parse(row.preview) : null };
  }
  saveSpace(id, user, input) {
    if (!/^[a-f0-9-]{36}$/.test(id) || input.account !== user.id || !Number.isSafeInteger(input.revision) || input.revision < 0) fail(409, 'Аккаунт или версия рабочего пространства изменились. Открой его заново.');
    const name = catalogText(input.name, 100, 'Имя файла', true);
    let document;
    try { document = C.importProject(input.document); delete document._studioSave; } catch { fail(400, 'Не удалось прочитать файл GridStudio. Локальная копия сохранена.'); }
    const raw = JSON.stringify(document);
    if (Buffer.byteLength(raw) > 8_000_000) fail(413, 'Файл больше 8 МБ. Скачай его для резервной копии или уменьши размер подложки.');
    let preview = null; try { preview = JSON.stringify(selectedCatalogGrid(document)); if (preview.length > 150_000) preview = null; } catch { /* Large private documents still save. */ }
    const grids = JSON.stringify({ names: C.configurations(document).map((config) => config.name), configIndex: document.configIndex });
    return this.store.tx(() => {
      const old = this.store.get('SELECT * FROM workspaces WHERE id=?', id);
      if (old && old.account !== user.id) fail(404, 'Рабочее пространство не найдено.');
      if (old && old.document === raw && old.name === name && (!old.archived || input.archived === true)) return { id, revision: old.revision, updated: old.updated };
      if (old && (old.revision !== input.revision || old.archived)) fail(409, 'Файл изменён на другом устройстве. Твои правки остались локально; сохрани их отдельной копией.');
      if (!old && input.revision !== 0) fail(409, 'Серверная копия не найдена. Локальные данные сохранены.');
      const size = this.store.get('SELECT count(*) n,coalesce(sum(length(CAST(document AS BLOB))),0) bytes FROM workspaces WHERE account=?', user.id);
      if ((!old && size.n >= 100) || size.bytes - (old ? Buffer.byteLength(old.document) : 0) + Buffer.byteLength(raw) > 200_000_000) fail(413, 'Лимит аккаунта: 100 файлов или 200 МБ. Сохрани резервную копию на устройство.');
      const revision = (old?.revision || 0) + 1, updated = this.store.now();
      this.store.run('INSERT INTO workspaces(id,account,name,document,revision,updated,preview,archived,grids) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,revision=excluded.revision,updated=excluded.updated,preview=excluded.preview,grids=excluded.grids', id, user.id, name, raw, revision, updated, preview, input.archived === true ? 1 : 0, grids);
      return { id, revision, updated };
    });
  }
  // A picture of one grid of the account's copy (catalog-preview renderSpaceThumbnail), drawn once
  // per revision and kept for the 48 most recent. The URL names the revision, so browsers cache it.
  async spaceThumbnail(id, user, index, render) {
    const row = this.store.get('SELECT revision,document FROM workspaces WHERE id=? AND account=?', id, user.id);
    if (!row) fail(404, 'Рабочее пространство не найдено в этом аккаунте.');
    const key = `${id}:${row.revision}:${index}`;
    if (!this.thumbnails.has(key)) {
      let document;
      try { document = C.importProject(JSON.parse(row.document)); } catch { fail(422, 'Не удалось прочитать файл для превью.'); }
      if (!Number.isInteger(index) || index < 0 || index >= document.source.configs.length) fail(404, 'Сетка не найдена.');
      const picture = render(document, index);
      this.thumbnails.set(key, picture);
      picture.catch(() => this.thumbnails.delete(key));
      if (this.thumbnails.size > 48) this.thumbnails.delete(this.thumbnails.keys().next().value);
    }
    return this.thumbnails.get(key);
  }
  archiveSpace(id, user, revision, archived) {
    return this.store.tx(() => {
      const row = this.space(id, user); if (row.revision !== revision) fail(409, 'Файл изменился. Обнови список.');
      this.store.run('UPDATE workspaces SET archived=?,revision=revision+1,updated=? WHERE id=? AND account=?', archived ? 1 : 0, this.store.now(), id, user.id);
      return { archived, revision: revision + 1 };
    });
  }
}
