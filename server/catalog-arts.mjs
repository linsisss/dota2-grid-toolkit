import { readFileSync } from 'node:fs';
import { digest, fail } from './catalog-store.mjs';
import { artLines } from '../scripts/ascii-library.mjs';
import { ART_LIMITS, artMeta, artSubmission } from '../scripts/art-document.mjs';

// Built-in arts cannot be submitted again as someone's own.
const builtin = new Set(JSON.parse(readFileSync(new URL('../data/ascii-arts.json', import.meta.url), 'utf8')).arts
  .map(art => digest(artLines(art.text).join('\n'))));
// Arts share the audit log with grids; the prefix keeps their ids apart.
export const artKey = id => `art:${id}`;
const FILTERS = { pending: "status='pending'", approved: "status='approved'", hidden: "status IN ('hidden','rejected')" };

// Ready-made arts from players. Every art waits for a moderator, on the site or in the
// Telegram topic; only approved ones reach the editor's library.
export class CatalogArts {
  constructor(store) { this.store = store; }
  get(id) { return this.store.get('SELECT * FROM arts WHERE id=?', id); }
  submit(input, identity, account = null) {
    const art = artSubmission(input), hash = digest(art.text), store = this.store;
    return store.tx(() => {
      if (store.paused()) fail(503, 'Приём временно приостановлен. Мастерская и редактор доступны.');
      for (const key of [identity.browser, identity.ip]) if (store.get('SELECT key FROM blocks WHERE key=? AND until_at>?', key, store.now())) fail(403, 'Отправка с этого источника временно ограничена.');
      if (builtin.has(hash)) fail(409, 'Этот арт уже есть в «Готовых артах».');
      const same = store.get("SELECT status FROM arts WHERE hash=? AND status IN ('pending','approved')", hash);
      if (same) fail(409, same.status === 'approved' ? 'Этот арт уже есть в «Готовых артах».' : 'Такой арт уже ждёт проверки.');
      if (store.trusted(account)) { /* No account budget; the network cap below still applies. */ }
      else if (account) store.rate(`art-account:${account}`, ART_LIMITS.accountDaily, 86_400_000, { message: `С Telegram можно предложить ${ART_LIMITS.accountDaily} артов за 24 часа.`, code: 'art_account_limit' });
      else store.rate(`art:${identity.browser}`, ART_LIMITS.daily, 86_400_000, { message: `Без входа можно предложить ${ART_LIMITS.daily} артов за 24 часа. С Telegram — до ${ART_LIMITS.accountDaily}.`, code: 'art_guest_limit' });
      store.rate(`art-ip:${identity.ip}`, 40, 86_400_000, { message: 'Достигнут общий лимит отправки артов из этой сети за 24 часа.', code: 'art_network_limit' });
      if (store.get("SELECT count(*) n FROM arts WHERE status='pending'").n >= 1000) fail(503, 'Очередь проверки артов заполнена. Попробуй позже.');
      const now = store.now();
      const { lastInsertRowid } = store.run('INSERT INTO arts(name,category,author,text,hash,account,browser,ip,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',
        art.name, art.category, art.author, art.text, hash, account, identity.browser, identity.ip, now, now);
      const id = Number(lastInsertRowid);
      store.audit(artKey(id), 'art-submit');
      return { id, status: 'pending' };
    });
  }
  // The public library. The version changes with every decision or correction, so the editor
  // revalidates with one cheap request instead of downloading every art again.
  library() {
    const { n, updated } = this.store.get("SELECT count(*) n, coalesce(max(updated),0) updated FROM arts WHERE status='approved'");
    return { version: `${n}-${updated}`, load: () => this.store.all("SELECT id,name,category,author,text FROM arts WHERE status='approved' ORDER BY updated DESC, id DESC") };
  }
  // The admin queue; `search` finds a name or an author in it, as for grids and backgrounds (tab counts stay whole).
  moderation(filter = 'pending', page = 0, search = '') {
    const store = this.store, match = search ? " AND (unicode_lower(name) LIKE ? ESCAPE '!' OR unicode_lower(author) LIKE ? ESCAPE '!')" : '';
    const args = search ? Array(2).fill(`%${search.toLowerCase().replace(/[!%_]/g, (c) => `!${c}`)}%`) : [];
    const where = (FILTERS[filter] || FILTERS.pending) + match;
    const counts = Object.fromEntries(Object.entries(FILTERS).map(([key, sql]) => [key, store.get(`SELECT count(*) n FROM arts WHERE ${sql}`).n]));
    const total = search ? store.get(`SELECT count(*) n FROM arts WHERE ${where}`, ...args).n : counts[filter in FILTERS ? filter : 'pending'];
    const items = store.all(`SELECT * FROM arts WHERE ${where} ORDER BY ${filter === 'pending' ? 'id' : 'updated DESC, id DESC'} LIMIT 20 OFFSET ?`, ...args, page * 20)
      .map(art => ({ id: art.id, name: art.name, category: art.category, author: art.author, text: art.text, status: art.status, reason: art.reason,
        created: art.created, linked: !!art.account, related: store.get('SELECT count(*) n FROM arts WHERE browser=?', art.browser).n }));
    return { items, total, counts, paused: store.paused() };
  }
  moderate(id, { action, reason = '', name, category, author }, { transaction = true, actor = null } = {}) {
    const store = this.store;
    const apply = () => {
      const art = this.get(id);
      if (!art) fail(404, 'Арт не найден.');
      const need = (...states) => { if (!states.includes(art.status)) fail(409, 'Арт уже проверен или изменён. Обнови список.'); };
      const set = (status, why = '') => store.run('UPDATE arts SET status=?,reason=?,updated=? WHERE id=?', status, why, store.now(), id);
      if (action === 'approve') {
        need('pending'); set('approved');
        // A player who signed in with Telegram hears from the bot once.
        if (art.account) store.run('INSERT OR IGNORE INTO art_notices(art,account,created) VALUES(?,?,?)', id, art.account, store.now());
      } else if (action === 'reject') { need('pending'); if (!reason) fail(400, 'Укажи причину отказа.'); set('rejected', reason); store.rejectNotice('art', id, art.account); }
      else if (action === 'hide') { need('approved'); set('hidden', reason); }
      else if (action === 'restore') {
        need('hidden', 'rejected');
        if (store.get("SELECT id FROM arts WHERE hash=? AND status IN ('pending','approved') AND id<>?", art.hash, id)) fail(409, 'Такой же арт уже есть в библиотеке или ждёт проверки.');
        set('approved');
      } else if (action === 'edit') {
        need('pending', 'approved');
        const meta = artMeta({ name, category, author });
        store.run('UPDATE arts SET name=?,category=?,author=?,updated=? WHERE id=?', meta.name, meta.category, meta.author, store.now(), id);
        store.audit(artKey(id), action, actor);
        return meta;
      } else fail(400, 'Неизвестное действие.');
      store.audit(artKey(id), action, actor);
      return { id, status: this.get(id).status };
    };
    return transaction ? store.tx(apply) : apply();
  }
}
