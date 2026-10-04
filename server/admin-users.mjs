// «Пользователи» in the admin panel (asked for on 2026-10-03: everyone who signed in with Telegram,
// their accounts on the site and their Telegram): the profile (nickname, avatar, badges, when they
// joined), the Telegram account (name, @username, id, whether the profile shows it), when they were on
// the site last (server/site-stats.mjs visits, else their last sign-in), what they published and
// commented, a restriction if there is one, and where the account came from (server/site-stats.mjs
// signup: the source, the site, utm_* marks, the first page and the page it signed in on; 'unknown' for
// accounts from before 03.10.2026). Admins only. A search finds a nickname, an @username, a Telegram name
// or an id; a source narrows the list; 50 at a time. `role`: 'admin' (CATALOG_ADMIN_TELEGRAM_IDS, `admins`), 'moderator'
// (server/moderators.mjs, given here) or null.
import { SOURCES } from './site-stats.mjs';
export const USERS_PAGE = 50;
const SORTS = {
  new: 'coalesce(p.created, a.updated) DESC',
  seen: 'coalesce(seen, a.updated) DESC',
  works: '(grids + backgrounds + guides) DESC, coalesce(seen, a.updated) DESC',
};

export function adminUsers(store, stats, { q = '', sort = 'new', offset = 0, source = '', admins = new Set() } = {}) {
  const has = (name) => !!store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name);
  const count = (table, where) => (has(table) ? `(SELECT count(*) FROM ${table} WHERE ${where})` : '0');
  const query = String(q).trim().replace(/^@/, '').toLowerCase().slice(0, 80);
  const like = `%${query.replace(/[!%_]/g, (c) => `!${c}`)}%`;
  const conditions = [], args = [];
  if (query) { conditions.push(`(unicode_lower(coalesce(p.nickname,'')) LIKE ?${args.length + 1} ESCAPE '!' OR unicode_lower(a.username) LIKE ?${args.length + 1} ESCAPE '!' OR unicode_lower(a.name) LIKE ?${args.length + 1} ESCAPE '!' OR a.id = ?${args.length + 2})`); args.push(like, query); }
  if (SOURCES[source]) { conditions.push(`coalesce(s.source, 'unknown') = ?${args.length + 1}`); args.push(source); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = "FROM accounts a LEFT JOIN profiles p ON p.account=a.id LEFT JOIN signup_sources s ON s.account=a.id";
  const rows = store.all(`SELECT a.id, a.name, a.username, a.updated, p.key, p.nickname, p.created, p.telegram, s.source, s.referrer, s.landing, s.signup, s.utm, s.first_seen,
      ${has('visits') ? '(SELECT max(last) FROM visits v WHERE v.account=a.id)' : 'NULL'} seen,
      ${has('moderators') ? '(SELECT 1 FROM moderators m WHERE m.account=a.id)' : 'NULL'} moderator,
      ${count('works', "account=a.id AND state='active' AND public_revision IS NOT NULL")} grids,
      ${count('backgrounds', "account=a.id AND status='approved'")} backgrounds,
      ${count('guides', "account=a.id AND status='approved'")} guides,
      ${count('arts', "account=a.id AND status='approved'")} arts,
      ${has('item_comments') || has('guide_comments') ? `(${count('item_comments', "account=a.id AND state='visible'")} + ${count('guide_comments', "account=a.id AND state='visible'")})` : '0'} comments,
      (SELECT until_at FROM blocks WHERE key='account:' || a.id AND until_at > ${Number(store.now())}) blocked
    ${from} ${where}
    ORDER BY ${SORTS[sort] || SORTS.new}, a.id LIMIT ${USERS_PAGE + 1} OFFSET ${Math.max(0, Math.min(1_000_000, Number(offset) || 0))}`, ...args);
  const total = store.get(`SELECT count(*) n ${from} ${where}`, ...args).n;
  const sources = store.all(`SELECT coalesce(s.source, 'unknown') source, count(*) n ${from} GROUP BY coalesce(s.source, 'unknown') ORDER BY n DESC`)
    .map((row) => ({ source: row.source, label: SOURCES[row.source] || row.source, accounts: row.n }));
  const now = store.now();
  const items = rows.slice(0, USERS_PAGE).map((row) => {
    const creator = row.key ? store.profiles.creator(row.id) : null;
    return { id: row.id, telegram: { name: row.name, username: row.username || '', shown: !!row.telegram },
      profile: creator && { key: creator.key, nickname: creator.name, avatar: creator.avatar, badges: creator.badges },
      joined: row.created || row.updated, seen: row.seen || row.updated, blocked: row.blocked || 0,
      works: { grids: row.grids, backgrounds: row.backgrounds, guides: row.guides, arts: row.arts }, comments: row.comments,
      online: !!row.seen && now - row.seen < 5 * 60_000, role: admins.has(String(row.id)) ? 'admin' : row.moderator ? 'moderator' : null,
      came: { source: row.source || 'unknown', label: SOURCES[row.source || 'unknown'], site: row.referrer || '', utm: row.utm ? JSON.parse(row.utm) : null,
        landing: row.landing ? stats.pageLabel(row.landing) : '', signup: row.signup ? stats.pageLabel(row.signup) : '', firstSeen: row.first_seen || null } };
  });
  return { items, more: rows.length > USERS_PAGE, total, all: store.get('SELECT count(*) n FROM accounts').n, sources };
}
