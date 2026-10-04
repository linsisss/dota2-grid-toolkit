import { Fragment, useEffect, useRef, useState } from 'react';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';
import { BadgeIcons } from './Badges.jsx';
import { profilePath } from './Creator.jsx';
import { sourceColor } from './stat-sources.js';

// «Пользователи» (server/admin-users.mjs; asked for on 2026-10-03, redone the same day with where people
// came from): everyone who signed in with Telegram — their profile, their Telegram, where they came from
// (server/site-stats.mjs signup), when they joined and were here last (a green dot while on the site),
// what they published and commented. A search, the sources as filters, three orders, 50 at a time; a row
// opens to the details. The first page refreshes itself every 30 s while the tab is shown. Admins only.
// The details make an account a moderator or take it back (server/moderators.mjs, asked for on 2026-10-04).
const SORTS = [['new', 'Новые'], ['seen', 'Недавно заходили'], ['works', 'Больше работ']];
const REFRESH = 30_000;
const date = (at, time = false) => new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });
function ago(at) {
  const minutes = (Date.now() - at) / 60_000;
  if (minutes < 5) return 'сейчас на сайте';
  if (minutes < 60) return `${Math.round(minutes)} мин назад`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} ч назад`;
  if (minutes < 30 * 24 * 60) return `${Math.round(minutes / 60 / 24)} дн. назад`;
  return date(at);
}
const ROLES = { admin: 'админ', moderator: 'модератор' };
const WORKS = [['grids', 'сетки', 'grid'], ['backgrounds', 'фоны', 'brush'], ['guides', 'гайды', 'guides'], ['arts', 'арты', 'art']];

function Source({ came }) {
  return <span className="admin-source" style={{ '--source': sourceColor(came.source) }}><i/>{came.label}{came.source === 'other' && came.site ? ` · ${came.site}` : ''}</span>;
}
function Copy({ text }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="admin-copy" onClick={(event) => { event.stopPropagation(); navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
    aria-label={`Скопировать ${text}`}><Icon name={done ? 'check' : 'copy'} size={13}/></button>;
}
// «Модератор»: approves or turns down grids, backgrounds and guides waiting for a decision, nothing else.
function Role({ user, onRole }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (user.role === 'admin') return <p className="admin-user-role">Администратор: все права в админке (список администраторов задаётся на сервере).</p>;
  const on = user.role !== 'moderator';
  const toggle = () => { setBusy(true); setError(''); catalogAPI(`/admin/users/${user.id}/moderator`, { method: 'POST', body: { on } })
    .then((value) => onRole(value.moderator ? 'moderator' : null), (problem) => setError(problem.message)).finally(() => setBusy(false)); };
  return <div className="admin-user-role">
    <p>{on ? 'Модератор может одобрять и отклонять сетки, фоны и гайды на проверке — больше ничего в админке.' : 'Модератор: одобряет и отклоняет сетки, фоны и гайды на проверке.'}</p>
    <button type="button" className={`catalog-button${on ? '' : ' danger'}`} disabled={busy} onClick={toggle}><Icon name="shield" size={15}/>{busy ? 'Сохраняем…' : on ? 'Сделать модератором' : 'Снять роль модератора'}</button>
    {error && <Notice error>{error}</Notice>}
  </div>;
}
function Details({ user, onRole }) {
  const came = user.came, utm = came.utm && Object.entries(came.utm).map(([key, value]) => `${key}: ${value}`).join(' · ');
  const fields = [
    ['Что привело', <><Source came={came}/>{came.site && came.source !== 'other' ? <small>{came.site}</small> : null}{came.source === 'unknown' ? <small>Аккаунт создан до того, как сайт начал это запоминать.</small> : null}</>],
    ['Метки ссылки (utm)', utm || '—'], ['Первая страница', came.landing || '—'], ['Вход в аккаунт со страницы', came.signup || '—'],
    ['Первый заход', came.firstSeen ? date(came.firstSeen, true) : '—'], ['Регистрация', date(user.joined, true)], ['Последний заход', `${ago(user.seen)} · ${date(user.seen, true)}`],
    ['Telegram', <>{user.telegram.name}{user.telegram.username ? ` · @${user.telegram.username}` : ''} · id {user.id}<Copy text={user.id}/>{!user.telegram.shown && <small>не показывается в профиле</small>}</>],
  ];
  return <div className="admin-user-details">
    <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <Role user={user} onRole={onRole}/>
    <div className="admin-user-links">{user.profile && <a className="catalog-button" href={profilePath(user.profile.key)} target="_blank" rel="noreferrer"><Icon name="user" size={15}/>Профиль на сайте</a>}
      {user.telegram.username && <a className="catalog-button" href={`https://t.me/${user.telegram.username}`} target="_blank" rel="noreferrer"><Icon name="telegram" size={15}/>Написать в Telegram</a>}</div>
  </div>;
}

export default function AdminUsers({ denied }) {
  const [q, setQ] = useState(''), [sort, setSort] = useState('new'), [source, setSource] = useState(''), [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState('');
  const request = useRef(0), loaded = useRef(0);
  const load = (offset = 0, quiet = false) => {
    const id = ++request.current; if (!quiet) setBusy(true);
    return catalogAPI(`/admin/users?${new URLSearchParams({ q, sort, source, offset: String(offset) })}`).then((value) => {
      if (id !== request.current) return;
      setData((current) => { const next = offset && current ? { ...value, items: [...current.items, ...value.items] } : value; loaded.current = next.items.length; return next; }); setError('');
    }, (problem) => { if (!quiet) { denied?.(problem); setError(problem.message); } }).finally(() => { if (id === request.current) setBusy(false); });
  };
  useEffect(() => { const timer = setTimeout(() => load(0), q ? 250 : 0); return () => clearTimeout(timer); }, [q, sort, source]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && loaded.current <= 50) load(0, true); }, REFRESH);
    return () => clearInterval(timer);
  }, [q, sort, source]);
  const online = data?.items.filter((user) => user.online).length || 0;
  return <section className="admin-users">
    <div className="admin-users-head">
      <label className="catalog-search"><Icon name="search"/><input aria-label="Поиск пользователей" placeholder="Ник, @username, имя или id" value={q} maxLength={80} onChange={(event) => setQ(event.target.value)}/></label>
      <div className="catalog-tabs" aria-label="Порядок">{SORTS.map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{label}</button>)}</div>
      {data && <span className="admin-users-count">{online > 0 && <><i className="admin-pulse"/>{online} на сайте · </>}{q.trim() || source ? `найдено ${data.total} из ${data.all}` : `всего ${data.all}`}</span>}
    </div>
    {data && <div className="admin-source-filter" role="group" aria-label="Откуда пришли">
      <button type="button" aria-pressed={!source} onClick={() => setSource('')}>Все<b>{data.all}</b></button>
      {data.sources.map((row) => <button key={row.source} type="button" aria-pressed={source === row.source} onClick={() => setSource(source === row.source ? '' : row.source)} style={{ '--source': sourceColor(row.source) }}>
        <i/>{row.label}<b>{row.accounts}</b></button>)}
    </div>}
    {error && <Notice error>{error}</Notice>}
    {!data ? <p role="status">Загружаем пользователей…</p> : !data.items.length ? <p className="admin-empty-line">Никого не нашлось.</p>
      : <div className="admin-users-scroll"><table className="admin-users-table">
        <thead><tr><th>Пользователь</th><th>Telegram</th><th>Откуда</th><th>Регистрация</th><th>Последний заход</th><th>Работы</th><th>Комм.</th></tr></thead>
        <tbody>{data.items.map((user) => {
          const shown = open === user.id;
          return <Fragment key={user.id}>
            <tr className={shown ? 'is-open' : ''} onClick={() => setOpen(shown ? '' : user.id)} aria-expanded={shown} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(shown ? '' : user.id); } }}>
              <td><div className="admin-user">
                <span className={`admin-avatar${user.online ? ' is-online' : ''}`}>{user.profile?.avatar ? <img src={user.profile.avatar} alt="" width="38" height="38" loading="lazy"/> : <Icon name="user" size={17}/>}</span>
                <div>{user.profile ? <span className="admin-user-name"><a href={profilePath(user.profile.key)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{user.profile.nickname}</a><BadgeIcons badges={user.profile.badges}/>{user.role && <i className={`admin-role is-${user.role}`}>{ROLES[user.role]}</i>}</span> : <b>Без профиля</b>}
                  {user.blocked > 0 ? <small className="admin-user-blocked">ограничение до {date(user.blocked)}</small> : <small>с {date(user.joined)}</small>}</div>
              </div></td>
              <td><div className="admin-user-tg">{user.telegram.username ? <a className="admin-tg" href={`https://t.me/${user.telegram.username}`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><Icon name="telegram" size={13}/>@{user.telegram.username}</a> : <span className="admin-tg is-none">без @username</span>}
                <small>{user.telegram.name} · id {user.id}{!user.telegram.shown && ' · скрыт в профиле'}</small></div></td>
              <td><div className="admin-user-came"><Source came={user.came}/>{user.came.landing && <small>{user.came.landing}</small>}</div></td>
              <td title={date(user.joined, true)}>{date(user.joined)}</td>
              <td className={user.online ? 'is-online' : ''}>{ago(user.seen)}</td>
              <td><div className="admin-user-works">{WORKS.filter(([key]) => user.works[key]).map(([key, label, icon]) => <span key={key} title={label}><Icon name={icon} size={12}/>{user.works[key]}</span>)}{!WORKS.some(([key]) => user.works[key]) && '—'}</div></td>
              <td>{user.comments || '—'}</td>
            </tr>
            {shown && <tr className="admin-user-open"><td colSpan={7}><Details user={user} onRole={(role) => setData((current) => ({ ...current, items: current.items.map((item) => (item.id === user.id ? { ...item, role } : item)) }))}/></td></tr>}
          </Fragment>;
        })}</tbody></table></div>}
    {data?.more && <button type="button" className="catalog-button admin-users-more" disabled={busy} onClick={() => load(data.items.length)}>{busy ? 'Загружаем…' : 'Показать ещё'}</button>}
  </section>;
}
