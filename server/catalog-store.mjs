import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { catalogMeta, catalogSubmission, CATALOG_LIMITS } from '../scripts/catalog-document.mjs';

export class CatalogError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => { throw new CatalogError(status, message, extra); };
export const digest = (text) => createHash('sha256').update(text).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const equal = (a, b) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
function rateExceeded(at, duration, now, message, code) {
  const retryAt = at + duration, retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000));
  const minutes = Math.ceil(retryAfter / 60), hours = Math.floor(minutes / 60);
  const wait = retryAfter < 60 ? `${retryAfter} сек.` : [hours && `${hours} ч.`, minutes % 60 && `${minutes % 60} мин.`].filter(Boolean).join(' ');
  fail(429, `${message} Попробуй через ${wait}`, { code, retryAfter, retryAt });
}
export function gridHash(grid) {
  // Category order and the file/grid name cannot turn the same content into a new work.
  return digest(JSON.stringify(grid.configs[0].categories.map(c => JSON.stringify(c)).sort()));
}
export class CatalogStore {
  constructor(path, salt, now = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path); this.salt = salt; this.now = now;
    this.db.function('unicode_lower', { deterministic: true }, text => text.toLowerCase());
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS works(id TEXT PRIMARY KEY, owner TEXT NOT NULL, browser TEXT NOT NULL, ip TEXT NOT NULL,
        public_revision INTEGER, draft_revision INTEGER, state TEXT NOT NULL DEFAULT 'active', featured INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY AUTOINCREMENT, work TEXT NOT NULL REFERENCES works(id),
        title TEXT NOT NULL, author TEXT NOT NULL, tags TEXT NOT NULL, grid TEXT NOT NULL, stats TEXT NOT NULL,
        hash TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS revisions_hash ON revisions(hash, status);
      CREATE TABLE IF NOT EXISTS limits(key TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS limits_key ON limits(key, at);
      CREATE TABLE IF NOT EXISTS blocks(key TEXT PRIMARY KEY, reason TEXT NOT NULL, until_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, work TEXT NOT NULL REFERENCES works(id),
        browser TEXT NOT NULL, reason TEXT NOT NULL, created INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS one_report ON reports(work,browser) WHERE resolved=0;
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, work TEXT, action TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS likes(work TEXT NOT NULL REFERENCES works(id), account TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(work,account));
      CREATE TABLE IF NOT EXISTS subscriptions(account TEXT NOT NULL, author TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(account,author));
      CREATE INDEX IF NOT EXISTS subscriptions_author ON subscriptions(author);
      CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, work TEXT NOT NULL, created INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, UNIQUE(account,work));
      CREATE TABLE IF NOT EXISTS arts(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL, author TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL DEFAULT '',
        account TEXT, browser TEXT NOT NULL, ip TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS arts_status ON arts(status, updated);
      CREATE UNIQUE INDEX IF NOT EXISTS arts_live_hash ON arts(hash) WHERE status IN ('pending','approved');
      CREATE TABLE IF NOT EXISTS art_notices(art INTEGER PRIMARY KEY, account TEXT NOT NULL, created INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS author_notices(revision INTEGER PRIMARY KEY, account TEXT NOT NULL, work TEXT NOT NULL, first INTEGER NOT NULL, created INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0);
      PRAGMA user_version=1;`);
    if (!this.all('PRAGMA table_info(works)').some(c => c.name === 'account')) this.run('ALTER TABLE works ADD COLUMN account TEXT');
    this.db.exec('CREATE INDEX IF NOT EXISTS works_account ON works(account); CREATE INDEX IF NOT EXISTS audit_work_action_at ON audit(work,action,at);');
    // Who took an admin decision: {"id","name"} JSON, null for automatic and author actions.
    if (!this.all('PRAGMA table_info(audit)').some(c => c.name === 'actor')) this.run('ALTER TABLE audit ADD COLUMN actor TEXT');
  }
  close() { this.db.close(); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  tx(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  identity(kind, value) { return createHmac('sha256', this.salt).update(`${kind}:${value}`).digest('hex'); }
  paused() { return this.get("SELECT value FROM settings WHERE key='paused'")?.value === '1'; }
  setPaused(value, actor = null) { this.run("INSERT OR REPLACE INTO settings VALUES('paused',?)", value ? '1' : '0'); this.audit(null, value ? 'pause' : 'resume', actor); }
  audit(id, action, actor = null) { this.run('INSERT INTO audit(work,action,at,actor) VALUES(?,?,?,?)', id, action, this.now(), actor); }
  rate(key, max, duration, { message = 'Слишком много запросов.', code = 'rate_limited' } = {}) {
    const now = this.now();
    // Rows older than a day never affect a window; a full-table prune per call costs more than it saves.
    if (!(now - this.pruned < 60_000)) { this.pruned = now; this.run('DELETE FROM limits WHERE at < ?', now - 86_400_000); }
    const boundary = this.get('SELECT at FROM limits WHERE key=? AND at>? ORDER BY at DESC LIMIT 1 OFFSET ?', key, now - duration, max - 1);
    if (boundary) rateExceeded(boundary.at, duration, now, message, code);
    this.run('INSERT INTO limits VALUES(?,?)', key, now);
  }
  // Same sliding window as rate(), kept in memory for short anti-flood limits on reads:
  // they need no durability, and a SQLite write per page view dominated the API's CPU.
  burst(key, max, duration) {
    const now = this.now(), bursts = this.bursts ||= new Map();
    let entry = bursts.get(key);
    if (!entry) bursts.set(key, entry = { duration, hits: [] });
    while (entry.hits.length && entry.hits[0] <= now - duration) entry.hits.shift();
    if (entry.hits.length >= max) rateExceeded(entry.hits[entry.hits.length - max], duration, now, 'Слишком много запросов.', 'rate_limited');
    entry.hits.push(now);
    if (!(now - this.swept < 60_000)) {
      this.swept = now;
      for (const [name, { duration: window, hits }] of bursts) if (!hits.length || hits.at(-1) <= now - window) bursts.delete(name);
    }
  }
  submitting(identity, account = null) {
    if (this.paused()) fail(503, 'Приём сеток временно приостановлен. Мастерская и редактор доступны.');
    for (const key of [identity.browser, identity.ip]) if (this.get('SELECT key FROM blocks WHERE key=? AND until_at>?', key, this.now())) fail(403, 'Отправка с этого источника временно ограничена.');
    if (account) {
      // The existing audit includes updates and deleted/claimed works. Using it
      // preserves the budget across this change, restarts and browser switches.
      const boundary = this.get(`SELECT a.at FROM audit a JOIN works w ON w.id=a.work
        WHERE w.account=? AND a.action='submit' AND a.at>? ORDER BY a.at DESC LIMIT 1 OFFSET ?`,
        account, this.now() - 86_400_000, CATALOG_LIMITS.accountDaily - 1);
      if (boundary) rateExceeded(boundary.at, 86_400_000, this.now(),
        `Лимит аккаунта — ${CATALOG_LIMITS.accountDaily} отправок за 24 часа, включая обновления сеток.`, 'submission_account_limit');
    } else this.rate(`submit:${identity.browser}`, CATALOG_LIMITS.daily, 86_400_000, {
      message: `Без входа можно отправить ${CATALOG_LIMITS.daily} сетки за 24 часа, включая обновления. С Telegram — до ${CATALOG_LIMITS.accountDaily} отправок.`, code: 'submission_guest_limit'
    });
    // Shared networks have a deliberately higher budget than one browser.
    this.rate(`submit-ip:${identity.ip}`, 60, 86_400_000, {
      message: 'Достигнут общий лимит отправок из этой сети за 24 часа.', code: 'submission_network_limit'
    });
    if (this.get("SELECT count(*) n FROM revisions WHERE status='pending'").n >= 5000) fail(503, 'Очередь проверки заполнена. Попробуй позже.');
  }
  revision(id) { return this.get('SELECT * FROM revisions WHERE id=?', id); }
  view(work, revision, withGrid = true) {
    return { id: work.id, revision: revision.id, title: revision.title, author: revision.author,
      tags: JSON.parse(revision.tags), stats: JSON.parse(revision.stats), featured: !!work.featured,
      created: work.created, updated: revision.created, status: revision.status, reason: revision.reason,
      ...(withGrid ? { grid: JSON.parse(revision.grid) } : {}) };
  }
  owned(id, token, account = null) {
    const work = this.get('SELECT * FROM works WHERE id=?', id);
    if (!work || !(work.account ? work.account === account : token && equal(work.owner, digest(token)))) fail(404, 'Публикация не найдена в этом аккаунте или ссылка недействительна.');
    if (work.state === 'deleted') fail(410, 'Публикация удалена.');
    return work;
  }
  ownerView(id, token, account = null) {
    const work = this.owned(id, token, account);
    return { ...this.view(work, this.revision(work.draft_revision || work.public_revision)),
      blocked: work.state === 'blocked', published: !!work.public_revision, paused: this.paused(), linked: !!work.account, canEdit: !work.public_revision || !!(account && work.account === account) };
  }
  receipt(id, token, account = null) {
    if (typeof id !== 'string' || typeof token !== 'string') return null;
    const work = this.get('SELECT * FROM works WHERE id=?', id);
    if (!work) return null;
    this.owned(id, token, account);
    const revision = this.revision(work.draft_revision || work.public_revision);
    return { id, revision: revision.id, status: revision.status };
  }
  duplicate(hash, id = '') {
    return this.get(`SELECT r.work, w.public_revision FROM revisions r JOIN works w ON w.id=r.work
      WHERE r.hash=? AND r.work!=? AND r.status IN ('pending','approved') AND w.state!='deleted' LIMIT 1`, hash, id);
  }
  save(input, identity, id = null, token = null, expected = null, account = null) {
    const value = catalogSubmission(input), hash = gridHash(value.grid);
    return this.tx(() => {
      let work = id ? this.owned(id, token, account) : null;
      if (work?.state === 'blocked') fail(403, 'Публикация заблокирована модератором.');
      if (work && expected !== (work.draft_revision || work.public_revision)) fail(409, 'Версия уже изменилась. Обнови страницу перед сохранением.');
      const duplicate = this.duplicate(hash, id || '');
      if (duplicate) fail(409, 'Такая сетка уже отправлена. Новая карточка не создана.', duplicate.public_revision ? { duplicateId: duplicate.work } : {});
      this.submitting(identity, account);
      let managementToken;
      if (!work) {
        id = input.requestId || randomUUID(); managementToken = input.managementToken || secret();
        if (!/^[a-f0-9-]{36}$/.test(id) || !/^[\w-]{43}$/.test(managementToken)) fail(400, 'Некорректный ключ новой публикации.');
        this.run('INSERT INTO works(id,owner,browser,ip,created,account) VALUES(?,?,?,?,?,?)', id, digest(managementToken), identity.browser, identity.ip, this.now(), account);
        work = this.get('SELECT * FROM works WHERE id=?', id);
      }
      if (work.draft_revision && work.draft_revision !== work.public_revision) this.run('DELETE FROM revisions WHERE id=?', work.draft_revision);
      const revision = Number(this.run('INSERT INTO revisions(work,title,author,tags,grid,stats,hash,status,created) VALUES(?,?,?,?,?,?,?,?,?)',
        id, value.title, value.author, JSON.stringify(value.tags), JSON.stringify(value.grid), JSON.stringify(value.stats), hash, 'pending', this.now()).lastInsertRowid);
      this.run('UPDATE works SET draft_revision=? WHERE id=?', revision, id);
      this.audit(id, 'submit');
      return { id, revision, status: 'pending', ...(managementToken ? { managementToken } : {}) };
    });
  }
  remove(id, token, account = null) {
    return this.tx(() => {
      this.owned(id, token, account);
      this.run("UPDATE works SET state='deleted', public_revision=NULL, draft_revision=NULL, featured=0 WHERE id=?", id);
      this.run('DELETE FROM revisions WHERE work=?', id); this.run('DELETE FROM reports WHERE work=?', id);
      this.run('DELETE FROM likes WHERE work=?', id);
      this.audit(id, 'owner-delete');
    });
  }
  // Stored JSON as-is: previews need neither likes nor a parse/serialize round trip.
  publicGrid(id) {
    const row = this.get("SELECT r.id revision, r.grid FROM works w JOIN revisions r ON r.id=w.public_revision WHERE w.id=? AND w.state='active'", id);
    if (!row) fail(404, 'Сетка не найдена или ещё не опубликована.');
    return row;
  }
  publicItem(id, account = null) {
    const work = this.get("SELECT * FROM works WHERE id=? AND state='active' AND public_revision IS NOT NULL", id);
    if (!work) fail(404, 'Сетка не найдена или ещё не опубликована.');
    return { ...this.view(work, this.revision(work.public_revision)), likes: this.get('SELECT count(*) n FROM likes WHERE work=?', id).n,
      liked: !!(account && this.get('SELECT work FROM likes WHERE work=? AND account=?', id, account)), mine: !!(account && work.account === account),
      ...this.following(work, account) };
  }
  // Only Telegram-linked authors can be followed; the author's account id never leaves the server.
  following(work, account) {
    return { followable: !!work.account && work.account !== account,
      subscribed: !!(account && work.account && this.get('SELECT 1 x FROM subscriptions WHERE account=? AND author=?', account, work.account)) };
  }
  subscribe(account, id, subscribed) {
    const work = this.get("SELECT * FROM works WHERE id=? AND state='active' AND public_revision IS NOT NULL", id);
    if (!work) fail(404, 'Сетка не найдена или ещё не опубликована.');
    if (!work.account) fail(409, 'Автор этой сетки не входил через Telegram, поэтому подписаться на него пока нельзя.');
    if (work.account === account) fail(400, 'Это твоя сетка.');
    if (subscribed) this.run('INSERT OR IGNORE INTO subscriptions VALUES(?,?,?)', account, work.account, this.now());
    else this.run('DELETE FROM subscriptions WHERE account=? AND author=?', account, work.account);
    return this.following(work, account);
  }
  list({ query = '', tag = '', popular = false, page = 0, account = null } = {}) {
    const clauses = ["w.state='active'", 'w.public_revision IS NOT NULL'], args = [];
    if (query) { clauses.push('(unicode_lower(r.title) LIKE ? ESCAPE \'!\' OR unicode_lower(r.author) LIKE ? ESCAPE \'!\')'); const q = `%${query.toLowerCase().replace(/[!%_]/g, c => `!${c}`)}%`; args.push(q, q); }
    if (tag) { clauses.push('EXISTS (SELECT 1 FROM json_each(r.tags) WHERE value=?)'); args.push(tag); }
    const from = `FROM works w JOIN revisions r ON r.id=w.public_revision WHERE ${clauses.join(' AND ')}`;
    const total = this.get(`SELECT count(*) n ${from}`, ...args).n;
    const rows = this.all(`SELECT w.id ${from} ORDER BY ${popular ? '(SELECT count(*) FROM likes WHERE work=w.id) DESC,' : ''}r.created DESC,w.id LIMIT 12 OFFSET ?`, ...args, page * 12);
    return { total, page, items: rows.map(({ id }) => { const item = this.publicItem(id, account); delete item.grid; return item; }) };
  }
  like(id, account, liked) {
    if (!account) fail(401, 'Войди через Telegram, чтобы поставить лайк.');
    return this.tx(() => {
      this.publicItem(id);
      if (liked) this.run('INSERT OR IGNORE INTO likes VALUES(?,?,?)', id, account, this.now());
      else this.run('DELETE FROM likes WHERE work=? AND account=?', id, account);
      return { likes: this.get('SELECT count(*) n FROM likes WHERE work=?', id).n, liked };
    });
  }
  report(id, identity, reason) {
    this.publicItem(id);
    return this.tx(() => {
      this.rate(`report:${identity.browser}`, 5, 86_400_000); this.rate(`report-ip:${identity.ip}`, 100, 86_400_000);
      this.run('INSERT OR IGNORE INTO reports(work,browser,reason,created) VALUES(?,?,?,?)', id, identity.browser, reason, this.now());
    });
  }
  moderation(filter = 'pending', page = 0) {
    const filters = { pending: "w.state='active' AND r.status='pending'", reports: "w.state='active' AND EXISTS(SELECT 1 FROM reports WHERE work=w.id AND resolved=0)",
      published: "w.state='active' AND w.public_revision IS NOT NULL", blocked: "w.state='blocked'" };
    const query = where => `FROM works w JOIN revisions r ON r.id=COALESCE(w.draft_revision,w.public_revision) WHERE ${where}`;
    const from = query(filters[filter] || filters.pending);
    const counts = Object.fromEntries(Object.entries(filters).map(([name, where]) => [name, this.get(`SELECT count(*) n ${query(where)}`).n]));
    return { paused: this.paused(), counts, total: this.get(`SELECT count(*) n ${from}`).n,
      items: this.all(`SELECT w.id ${from} ORDER BY r.created ASC LIMIT 20 OFFSET ?`, page * 20).map(({ id }) => {
        const work = this.get('SELECT * FROM works WHERE id=?', id), rev = this.revision(work.draft_revision || work.public_revision);
        return { ...this.view(work, rev), blocked: work.state === 'blocked', linked: !!work.account,
          published: work.public_revision ? this.view(work, this.revision(work.public_revision)) : null,
          reports: this.all('SELECT id,reason,created FROM reports WHERE work=? AND resolved=0', id),
          related: this.get("SELECT count(*) n FROM works WHERE browser=? AND state='active'", work.browser).n };
      }) };
  }
  moderate(id, { action, revision, reason = '', featured = false, blockIP = false, title, author, tags }, { transaction = true, actor = null } = {}) {
    const apply = () => {
      const work = this.get("SELECT * FROM works WHERE id=? AND state!='deleted'", id);
      if (!work) fail(404, 'Заявка не найдена.');
      // Admins correct the title, author and tags of the public version or of a pending update in place;
      // the grid's own name follows the title so a download matches the gallery.
      if (action === 'edit') {
        if (!revision || ![work.public_revision, work.draft_revision].includes(revision)) fail(409, 'Версия уже изменилась. Обнови страницу.');
        const meta = catalogMeta({ title, author, tags }), grid = JSON.parse(this.revision(revision).grid);
        grid.configs[0].config_name = meta.title;
        this.run('UPDATE revisions SET title=?,author=?,tags=?,grid=? WHERE id=?', meta.title, meta.author, JSON.stringify(meta.tags), JSON.stringify(grid), revision);
        this.audit(id, action, actor);
        return meta;
      }
      if (revision !== (work.draft_revision || work.public_revision)) fail(409, 'Автор изменил заявку. Обнови очередь и проверь новую версию.');
      const rev = this.revision(revision);
      if (['approve','reject'].includes(action) && rev.status !== 'pending') fail(409, 'Эта версия уже проверена.');
      if (action === 'approve') {
        if (this.duplicate(rev.hash, id)) fail(409, 'Найден повтор другой сетки.');
        // An author signed in with Telegram hears from the bot once per approved version.
        if (work.account) this.run('INSERT OR IGNORE INTO author_notices(revision,account,work,first,created) VALUES(?,?,?,?,?)',
          revision, work.account, id, work.public_revision ? 0 : 1, this.now());
        if (work.public_revision) this.run('DELETE FROM revisions WHERE id=?', work.public_revision);
        // A Telegram-linked author's first publication notifies each subscriber once; updates do not.
        else if (work.account) this.run('INSERT OR IGNORE INTO notifications(account,work,created) SELECT account,?,? FROM subscriptions WHERE author=? AND account<>?',
          id, this.now(), work.account, work.account);
        this.run("UPDATE revisions SET status='approved',reason='' WHERE id=?", revision);
        this.run("UPDATE works SET public_revision=?,draft_revision=NULL,state='active',featured=? WHERE id=?", revision, featured ? 1 : 0, id);
      } else if (action === 'reject') {
        if (!reason) fail(400, 'Укажи причину отказа.');
        this.run("UPDATE revisions SET status='rejected',reason=? WHERE id=?", reason, revision);
      } else if (action === 'block') {
        this.run("UPDATE works SET state='blocked',featured=0 WHERE id=?", id);
        this.run('UPDATE revisions SET reason=? WHERE id=?', reason, revision);
        for (const key of blockIP ? [work.browser, work.ip] : [work.browser]) this.run('INSERT OR REPLACE INTO blocks VALUES(?,?,?)', key, reason, this.now() + 7 * 86_400_000);
      } else if (action === 'unblock') {
        if (work.state !== 'blocked') fail(409, 'Работа не заблокирована.');
        this.run("UPDATE works SET state='active' WHERE id=?", id);
        this.run('DELETE FROM blocks WHERE key IN (?,?)', work.browser, work.ip);
      } else if (action === 'feature') this.run('UPDATE works SET featured=? WHERE id=?', featured ? 1 : 0, id);
      else if (action === 'resolve') this.run('UPDATE reports SET resolved=1 WHERE work=?', id);
      else fail(400, 'Неизвестное действие.');
      this.audit(id, action, actor);
    };
    return transaction ? this.tx(apply) : apply();
  }
}
