// Telegram messages about comments (asked for on 2026-10-03): the author of a guide, grid or background
// hears of a new comment under it, a commenter of a reply to their comment — one message per person and
// comment (a reply to the author is a reply), never about one's own words. server/catalog-telegram.mjs
// (deliverCommentNotices) sends them, if the comment is still there and the person did not switch the
// kind off in «Настройки профиля». `kind`: 'guide', 'work' or 'background'; `item`: its id.
export function commentNoticesTable(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS comment_notices(id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL,
    comment INTEGER NOT NULL, reason TEXT NOT NULL, created INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0)`);
}
export function queueCommentNotices(store, { kind, item, comment, account, owner = null, replyTo = null }) {
  const people = new Map();
  if (replyTo && replyTo !== account) people.set(replyTo, 'reply');
  if (owner && owner !== account && !people.has(owner)) people.set(owner, 'comment');
  for (const [to, reason] of people)
    store.run('INSERT INTO comment_notices(account,kind,item,comment,reason,created) VALUES(?,?,?,?,?,?)', String(to), kind, String(item), Number(comment), reason, store.now());
}
