import { badgeOf } from '../scripts/profile-badges.mjs';
// The admin panel's «Журнал» (src/catalog/AdminJournal.jsx): the latest decisions with who took them,
// on the site or by a button in the Telegram topic, across grids, arts, backgrounds, guides and profile badges. Read
// from the audit log; only entries with an actor (people's decisions, not the system's).
const ACTIONS = {
  approve: 'Одобрено', reject: 'Отклонено', edit: 'Исправлено', block: 'Скрыто и ограничено', unblock: 'Разблокировано',
  feature: 'Подборка', resolve: 'Жалобы проверены', hide: 'Скрыто', restore: 'Возвращено', keep: 'Жалоба отклонена',
  'report-keep': 'Жалоба отклонена', 'report-hide': 'Скрыто по жалобе'
};
const KINDS = { work: 'Сетка', art: 'Арт', bg: 'Фон', guide: 'Гайд', profile: 'Профиль' };

function parse(entry) {
  const telegram = /^telegram:(\w+):revision:\d+:user:\d+$/.exec(entry.action);
  const comment = /^comment-delete:(\d+)$/.exec(entry.action);
  // A profile badge (scripts/profile-badges.mjs): «Значок выдан: Разработчик».
  const badge = /^badge-(on|off):(\w+)$/.exec(entry.action);
  const action = telegram ? telegram[1] : comment ? 'comment' : badge ? `badge-${badge[1]}` : entry.action;
  const label = comment ? 'Комментарий удалён' : badge ? `${badge[1] === 'on' ? 'Значок выдан' : 'Значок снят'}: ${badgeOf(badge[2])?.label || badge[2]}` : ACTIONS[action];
  return label ? { action, label, via: telegram ? 'telegram' : 'site' } : null;
}

export function adminJournal(store, { limit = 100, before = 0 } = {}) {
  const table = (name) => !!store.get('SELECT 1 x FROM sqlite_master WHERE name=?', name);
  const has = { arts: table('arts'), backgrounds: table('backgrounds'), guides: table('guide_revisions') };
  const rows = store.all(`SELECT id, work, action, at, actor FROM audit WHERE actor IS NOT NULL${before ? ' AND id<?' : ''} ORDER BY id DESC LIMIT ?`,
    ...(before ? [before] : []), Math.min(200, limit) * 2);
  const items = [];
  for (const row of rows) {
    const what = parse(row);
    if (!what) continue;
    let actor = null;
    try { actor = JSON.parse(row.actor); } catch { /* An old entry without a name. */ }
    const [prefix, key] = row.work.includes(':') ? row.work.split(/:(.*)/s) : ['work', row.work];
    let title = null, link = null;
    if (prefix === 'work') { title = store.get('SELECT title FROM revisions WHERE work=? ORDER BY id DESC LIMIT 1', key)?.title; link = `workshop?id=${key}`; }
    else if (prefix === 'art' && has.arts) title = store.get('SELECT name FROM arts WHERE id=?', Number(key))?.name;
    else if (prefix === 'bg' && has.backgrounds) { title = store.get('SELECT title FROM backgrounds WHERE id=?', Number(key))?.title; link = 'workshop?backgrounds'; }
    else if (prefix === 'profile') { title = store.get('SELECT nickname FROM profiles WHERE key=?', key)?.nickname; link = `workshop?creator=${key}`; }
    else if (prefix === 'guide' && has.guides) { title = store.get('SELECT title FROM guide_revisions WHERE guide=? ORDER BY id DESC LIMIT 1', key)?.title; link = title ? `guides?id=${key}` : null; }
    if (!(prefix in KINDS)) continue;
    items.push({ id: row.id, at: row.at, kind: prefix, kindLabel: KINDS[prefix], title: title ?? null, link: title ? link : null,
      ...what, actor: actor ? { id: String(actor.id ?? ''), name: String(actor.name ?? '').replace(/ · (сайт|Telegram)$/, '') } : null });
    if (items.length >= limit) break;
  }
  return { items, more: rows.length >= Math.min(200, limit) * 2 || items.length >= limit };
}
