import { fail } from './catalog-store.mjs';
import { GUIDE_LIMITS, cleanComment } from '../scripts/guide-document.mjs';
import { GUIDE_QUOTAS } from './guides.mjs';
import { commentNoticesTable, queueCommentNotices } from './comment-notices.mjs';

// Comments under workshop grids and menu backgrounds (asked for on 2026-10-03), as under guides
// (server/guides.mjs): published at once, threads oldest first, each thread's replies under its first
// comment; the commenter, the work's author and admins delete, others report — a report becomes a card
// in the Telegram moderation topic (server/catalog-telegram-store.mjs, kind 'item-comment-report').
// `kind`: 'work' (a grid's id) or 'background' (a background's id).
export const COMMENTS_PAGE = 50;
export class ItemComments {
  constructor(store) {
    this.store = store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS item_comments(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, item TEXT NOT NULL, account TEXT NOT NULL,
        reply INTEGER, thread INTEGER, body TEXT NOT NULL, created INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'visible');
      CREATE INDEX IF NOT EXISTS item_comments_item ON item_comments(kind, item, id);
      CREATE TABLE IF NOT EXISTS item_comment_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, comment INTEGER NOT NULL, account TEXT NOT NULL, reason TEXT NOT NULL,
        created INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS item_comment_reports_open ON item_comment_reports(comment, account) WHERE resolved=0;`);
    commentNoticesTable(store);
  }
  // The published work or background → its owner's account (null for a guest's), or a 404.
  owner(kind, item) {
    const store = this.store;
    if (kind === 'work') {
      const row = store.get("SELECT account FROM works WHERE id=? AND state='active' AND public_revision IS NOT NULL", String(item));
      if (!row) fail(404, 'Сетка не найдена или ещё не опубликована.');
      return row.account || null;
    }
    const row = store.get("SELECT account FROM backgrounds WHERE id=? AND status='approved'", Number(item));
    if (!row) fail(404, 'Фон не найден.');
    return row.account || null;
  }
  count(kind, item) { return this.store.get("SELECT count(*) n FROM item_comments WHERE kind=? AND item=? AND state='visible'", kind, String(item)).n; }
  list(kind, item, { account = null, admin = false, offset = 0 } = {}) {
    const owner = this.owner(kind, item), key = String(item);
    const rows = this.store.all(`SELECT * FROM item_comments c WHERE kind=? AND item=? AND (state='visible'
      OR (thread IS NULL AND EXISTS(SELECT 1 FROM item_comments x WHERE x.thread=c.id AND x.state='visible')))
      ORDER BY coalesce(thread, id), id LIMIT ? OFFSET ?`, kind, key, COMMENTS_PAGE + 1, Math.max(0, Math.min(100_000, Number(offset) || 0)));
    const more = rows.length > COMMENTS_PAGE, page = rows.slice(0, COMMENTS_PAGE);
    return { items: page.map((row) => this.view(row, { account, admin, owner })), more, total: this.count(kind, key) };
  }
  view(row, { account, admin, owner }) {
    const visible = row.state === 'visible', profiles = this.store.profiles;
    const reply = row.reply ? this.store.get('SELECT id, account, state FROM item_comments WHERE id=?', row.reply) : null;
    // `byAuthor`: written by the work's author (a crown by the name).
    return { id: row.id, thread: row.thread || null, author: visible ? profiles.creator(row.account) : null, byAuthor: visible && !!owner && row.account === owner, body: visible ? row.body : '', deleted: !visible, created: row.created,
      reply: reply ? { id: reply.id, name: reply.state === 'visible' ? profiles.creator(reply.account).name : '' } : null,
      mine: !!account && row.account === account, removable: visible && !!account && (row.account === account || owner === account || admin) };
  }
  add(kind, item, account, { body, reply = null }) {
    const store = this.store;
    return store.tx(() => {
      const owner = this.owner(kind, item), key = String(item);
      if (store.get('SELECT key FROM blocks WHERE key=? AND until_at>?', `account:${account}`, store.now())) fail(403, 'Комментарии для тебя временно ограничены.');
      let text;
      try { text = cleanComment(body); } catch (error) { fail(400, error.message); }
      const to = reply ? store.get("SELECT id, thread, account FROM item_comments WHERE id=? AND kind=? AND item=? AND state='visible'", Number(reply), kind, key) : null;
      if (reply && !to) fail(404, 'Комментарий, на который ты отвечаешь, удалён.');
      if (!store.trusted(account)) {
        store.rate(`comment:${account}`, GUIDE_QUOTAS.comments, 60_000, { message: 'Слишком часто. Подожди минуту.', code: 'comment_burst' });
        store.rate(`comment-day:${account}`, GUIDE_QUOTAS.commentsDaily, 86_400_000, { message: 'На сегодня комментариев достаточно.', code: 'comment_limit' });
      }
      const made = store.run('INSERT INTO item_comments(kind,item,account,reply,thread,body,created) VALUES(?,?,?,?,?,?,?)', kind, key, account, to?.id ?? null, to ? to.thread || to.id : null, text, store.now());
      const row = store.get('SELECT * FROM item_comments WHERE id=?', Number(made.lastInsertRowid));
      queueCommentNotices(store, { kind, item: key, comment: row.id, account, owner, replyTo: to?.account });
      return this.view(row, { account, admin: false, owner });
    });
  }
  remove(id, account, { admin = false, actor = null } = {}) {
    const store = this.store, row = store.get('SELECT * FROM item_comments WHERE id=?', Number(id));
    if (!row || row.state !== 'visible') fail(404, 'Комментарий не найден.');
    let owner = null;
    try { owner = this.owner(row.kind, row.item); } catch { /* A hidden work: its comments go with the commenter or an admin. */ }
    if (!admin && row.account !== account && (!owner || owner !== account)) fail(403, 'Удалить можно свой комментарий или комментарий к своей работе.');
    store.run("UPDATE item_comments SET state=?, body='' WHERE id=?", admin && row.account !== account ? 'hidden' : 'deleted', row.id);
    store.run('UPDATE item_comment_reports SET resolved=1 WHERE comment=? AND resolved=0', row.id);
    store.audit(row.kind === 'work' ? row.item : `bg:${row.item}`, `comment-delete:${row.id}`, actor);
    return { deleted: true };
  }
  report(account, id, reason) {
    const store = this.store, row = store.get("SELECT * FROM item_comments WHERE id=? AND state='visible'", Number(id));
    if (!row) fail(404, 'Комментарий не найден.');
    const text = String(reason ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) fail(400, 'Напиши, что не так.');
    if (text.length > 500) fail(400, 'Причина до 500 символов.');
    if (!store.trusted(account)) store.rate(`comment-report:${account}`, GUIDE_QUOTAS.reportsDaily, 86_400_000, { message: 'На сегодня жалоб достаточно.', code: 'comment_report_limit' });
    store.run('INSERT OR IGNORE INTO item_comment_reports(comment,account,reason,created) VALUES(?,?,?,?)', row.id, account, text, store.now());
    return { reported: true };
  }
  // A report's card in the moderation topic: keep the comment, or hide it.
  decideReport(reportId, action, { actor = null } = {}) {
    const store = this.store, report = store.get('SELECT * FROM item_comment_reports WHERE id=?', reportId);
    if (!report || report.resolved) fail(409, 'Жалоба уже рассмотрена.');
    if (action === 'hide') this.remove(report.comment, null, { admin: true, actor });
    store.run('UPDATE item_comment_reports SET resolved=1 WHERE id=?', reportId);
  }
}
export const COMMENT_LIMIT = GUIDE_LIMITS.comment;
