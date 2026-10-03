// «Пользователи» in the admin panel (asked for on 2026-10-03: everyone who signed in with Telegram,
// their accounts on the site and their Telegram): the profile (nickname, avatar, badges, when they
// joined), the Telegram account (name, @username, id, whether the profile shows it), when they were on
// the site last (server/site-stats.mjs visits, else their last sign-in), what they published and
// commented, and a restriction if there is one. Admins only. A search finds a nickname, an @username,
// a Telegram name or an id; 50 at a time.
export const USERS_PAGE = 50;
const SORTS = {
  new: 'coalesce(p.created, a.updated) DESC',
  seen: 'coalesce(seen, a.updated) DESC',
  works: '(grids + backgrounds + guides) DESC, coalesce(seen, a.updated) DESC',
};

export function adminUsers(store, { q = '', sort = 'new', offset = 0 } = {}) {
  const has = (name) => !!store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name);
  const count = (table, where) => (has(table) ? `(SELECT count(*) FROM ${table} WHERE ${where})` : '0');
  const query = String(q).trim().replace(/^@/, '').toLowerCase().slice(0, 80);
  const like = `%${query.replace(/[!%_]/g, (c) => `!${c}`)}%`;
  const where = query ? "WHERE (unicode_lower(coalesce(p.nickname,'')) LIKE ?1 ESCAPE '!' OR unicode_lower(a.username) LIKE ?1 ESCAPE '!' OR unicode_lower(a.name) LIKE ?1 ESCAPE '!' OR a.id = ?2)" : '';
  const args = query ? [like, query] : [];
  const rows = store.all(`SELECT a.id, a.name, a.username, a.updated, p.key, p.nickname, p.created, p.telegram,
      ${has('visits') ? '(SELECT max(last) FROM visits v WHERE v.account=a.id)' : 'NULL'} seen,
      ${count('works', "account=a.id AND state='active' AND public_revision IS NOT NULL")} grids,
      ${count('backgrounds', "account=a.id AND status='approved'")} backgrounds,
      ${count('guides', "account=a.id AND status='approved'")} guides,
      ${count('arts', "account=a.id AND status='approved'")} arts,
      ${has('item_comments') || has('guide_comments') ? `(${count('item_comments', "account=a.id AND state='visible'")} + ${count('guide_comments', "account=a.id AND state='visible'")})` : '0'} comments,
      (SELECT until_at FROM blocks WHERE key='account:' || a.id AND until_at > ${Number(store.now())}) blocked
    FROM accounts a LEFT JOIN profiles p ON p.account=a.id ${where}
    ORDER BY ${SORTS[sort] || SORTS.new}, a.id LIMIT ${USERS_PAGE + 1} OFFSET ${Math.max(0, Math.min(1_000_000, Number(offset) || 0))}`, ...args);
  const total = store.get(`SELECT count(*) n FROM accounts a LEFT JOIN profiles p ON p.account=a.id ${where}`, ...args).n;
  const items = rows.slice(0, USERS_PAGE).map((row) => {
    const creator = row.key ? store.profiles.creator(row.id) : null;
    return { id: row.id, telegram: { name: row.name, username: row.username || '', shown: !!row.telegram },
      profile: creator && { key: creator.key, nickname: creator.name, avatar: creator.avatar, badges: creator.badges },
      joined: row.created || row.updated, seen: row.seen || row.updated, blocked: row.blocked || 0,
      works: { grids: row.grids, backgrounds: row.backgrounds, guides: row.guides, arts: row.arts }, comments: row.comments };
  });
  return { items, more: rows.length > USERS_PAGE, total, all: store.get('SELECT count(*) n FROM accounts').n };
}
