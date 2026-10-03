import { useEffect, useRef, useState } from 'react';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';
import { BadgeIcons } from './Badges.jsx';
import { profilePath } from './Creator.jsx';

// «Пользователи» (server/admin-users.mjs; asked for on 2026-10-03): everyone who signed in with Telegram —
// their profile on the site, their Telegram (name, @username, id), when they joined and were here last,
// what they published and commented. A search by nickname, @username, name or id; three orders; 50 at a
// time. Admins only.
const SORTS = [['new', 'Новые'], ['seen', 'Недавно заходили'], ['works', 'Больше работ']];
const date = (at) => new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
function ago(at) {
  const minutes = (Date.now() - at) / 60_000;
  if (minutes < 5) return 'сейчас на сайте';
  if (minutes < 60) return `${Math.round(minutes)} мин назад`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} ч назад`;
  if (minutes < 30 * 24 * 60) return `${Math.round(minutes / 60 / 24)} дн. назад`;
  return date(at);
}
const WORKS = [['grids', 'сетки'], ['backgrounds', 'фоны'], ['guides', 'гайды'], ['arts', 'арты']];

export default function AdminUsers({ denied }) {
  const [q, setQ] = useState(''), [sort, setSort] = useState('new'), [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef(0);
  const load = (offset = 0) => {
    const id = ++request.current; setBusy(true);
    catalogAPI(`/admin/users?${new URLSearchParams({ q, sort, offset: String(offset) })}`).then((value) => {
      if (id !== request.current) return;
      setData((current) => (offset && current ? { ...value, items: [...current.items, ...value.items] } : value)); setError('');
    }, (problem) => { denied?.(problem); setError(problem.message); }).finally(() => { if (id === request.current) setBusy(false); });
  };
  useEffect(() => { const timer = setTimeout(() => load(0), q ? 250 : 0); return () => clearTimeout(timer); }, [q, sort]);
  return <section className="admin-users">
    <div className="admin-users-head">
      <label className="catalog-search"><Icon name="search"/><input aria-label="Поиск пользователей" placeholder="Ник, @username, имя или id" value={q} maxLength={80} onChange={(event) => setQ(event.target.value)}/></label>
      <div className="catalog-tabs" aria-label="Порядок">{SORTS.map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>)}</div>
      {data && <span className="admin-users-count">{q.trim() ? `Найдено ${data.total} из ${data.all}` : `Всего ${data.all}`}</span>}
    </div>
    <p className="catalog-muted admin-hint">Все аккаунты, вошедшие через Telegram. Ник ведёт в профиль, @username — в Telegram. «Скрыт в профиле» — пользователь не показывает свой Telegram на сайте.</p>
    {error && <Notice error>{error}</Notice>}
    {!data ? <p role="status">Загружаем пользователей…</p> : !data.items.length ? <p className="catalog-muted">Никого не нашлось.</p>
      : <div className="admin-users-scroll"><table className="admin-users-table">
        <thead><tr><th>На сайте</th><th>Telegram</th><th>Регистрация</th><th>Последний заход</th><th>Работы</th><th>Комм.</th></tr></thead>
        <tbody>{data.items.map((user) => {
          const works = WORKS.filter(([key]) => user.works[key]).map(([key, label]) => `${label} ${user.works[key]}`);
          return <tr key={user.id}>
            <td><div className="admin-user">
              {user.profile?.avatar ? <img src={user.profile.avatar} alt="" width="34" height="34" loading="lazy"/> : <span className="admin-user-blank"><Icon name="user" size={16}/></span>}
              <div>{user.profile ? <span className="admin-user-name"><a href={profilePath(user.profile.key)} target="_blank" rel="noreferrer">{user.profile.nickname}</a><BadgeIcons badges={user.profile.badges}/></span> : <b>Без профиля</b>}
                {user.blocked > 0 && <small className="admin-user-blocked">ограничение до {date(user.blocked)}</small>}</div>
            </div></td>
            <td><div className="admin-user-tg">{user.telegram.username ? <a href={`https://t.me/${user.telegram.username}`} target="_blank" rel="noreferrer">@{user.telegram.username}</a> : <span className="catalog-muted">без @username</span>}
              <small>{user.telegram.name} · id {user.id}{!user.telegram.shown && ' · скрыт в профиле'}</small></div></td>
            <td>{date(user.joined)}</td>
            <td>{ago(user.seen)}</td>
            <td>{works.length ? works.join(' · ') : '—'}</td>
            <td>{user.comments || '—'}</td>
          </tr>;
        })}</tbody></table></div>}
    {data?.more && <button type="button" className="catalog-button admin-users-more" disabled={busy} onClick={() => load(data.items.length)}>{busy ? 'Загружаем…' : 'Показать ещё'}</button>}
  </section>;
}
