// Moderators (asked for on 2026-10-04: «ранг модератор — только одобрение и отказ, без статистики,
// выдачи и всего остального; модерировать сетки, фоны и гайды»; ready-made arts too, asked for the same
// day). An admin makes an account a
// moderator in «Пользователи» (POST /admin/users/:id/moderator, recorded in «Журнал»). On the site a
// moderator sees the grids, arts, backgrounds and guides waiting for a decision and can only approve or
// turn one down: no reports, no published or hidden ones, no corrections, hiding or blocking, no
// «Входящие», statistics, users, journal, badges or the pause. The server checks it on every request
// (moderatorAllows); the Telegram moderation topic is as before — any member of its chat decides there.
// Admins stay the CATALOG_ADMIN_TELEGRAM_IDS list.
import { fail } from './catalog-store.mjs';

export const MODERATED = Object.freeze(['works', 'arts', 'backgrounds', 'guides']);
export const MODERATOR_ACTIONS = Object.freeze(['approve', 'reject']);

export class Moderators {
  constructor(store) {
    this.store = store;
    store.db.exec('CREATE TABLE IF NOT EXISTS moderators(account TEXT PRIMARY KEY, created INTEGER NOT NULL)');
  }
  has(account) { return !!account && !!this.store.get('SELECT 1 x FROM moderators WHERE account=?', String(account)); }
  // true when it changed.
  set(account, on) {
    const id = String(account);
    if (!this.store.get('SELECT 1 x FROM accounts WHERE id=?', id)) fail(404, 'Такого пользователя нет.');
    return on ? this.store.run('INSERT OR IGNORE INTO moderators(account, created) VALUES(?,?)', id, this.store.now()).changes > 0
      : this.store.run('DELETE FROM moderators WHERE account=?', id).changes > 0;
  }
}

// What a moderator may ask of /api/catalog/admin/*: the session, the menu's counts, the four queues
// and a decision in them (its action is checked by the route, MODERATOR_ACTIONS).
export function moderatorAllows(method, path) {
  if (method === 'GET') return /^\/admin\/(session|summary|works|arts|backgrounds|guides)$/.test(path);
  return method === 'POST' && /^\/admin\/(works\/[0-9a-f-]{36}|arts\/[1-9]\d{0,12}|backgrounds\/[1-9]\d{0,12}|guides\/[1-9]\d{0,12})$/.test(path);
}
