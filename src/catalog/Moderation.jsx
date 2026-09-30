import { useState } from 'react';
import { CATALOG_TAGS } from '../../scripts/catalog-document.mjs';
import { catalogAPI, CATALOG_PATH } from './api.js';
import { Icon, Notice, Stats, useCatalogConfig } from './Common.jsx';
import { useAccount } from './Account.jsx';
import GridPreview from './GridPreview.jsx';
import ArtModeration from './ArtModeration.jsx';
import BackgroundModeration from './BackgroundModeration.jsx';
import { Queue, RejectReason, reasonNote, useQueue } from './ModerationQueue.jsx';

const TABS = [['pending', 'На проверке'], ['reports', 'Жалобы'], ['published', 'В мастерской'], ['blocked', 'Заблокированы']];
const STATUS = { pending: 'На проверке', approved: 'В мастерской', rejected: 'Отклонена' };

// The admin panel. The server checks the Telegram account on every /admin request;
// these screens only spare everyone else from an empty page.
export default function Moderation() {
  const auth = useAccount();
  if (auth.loading) return <p role="status">Проверяем доступ…</p>;
  if (!auth.user) return <section className="catalog-empty"><h1>Админка</h1><p>Доступна только администраторам GridStudio. Войди через Telegram.</p>
    <button className="catalog-button primary" onClick={() => auth.requestLogin('Войди через Telegram, чтобы открыть админку.')}><Icon name="telegram"/>Войти через Telegram</button></section>;
  if (!auth.admin) return <section className="catalog-empty"><h1>Нет доступа</h1><p>Админка доступна только администраторам GridStudio.</p>
    <a className="catalog-button" href={CATALOG_PATH}>В мастерскую</a></section>;
  return <AdminPanel auth={auth}/>;
}

function AdminPanel({ auth }) {
  const { config } = useCatalogConfig();
  const [kind, setKind] = useState(() => { const value = new URLSearchParams(location.search).get('moderate'); return ['arts', 'backgrounds'].includes(value) ? value : 'works'; });
  const showKind = value => { const url = new URL(location.href); url.searchParams.set('moderate', value === 'works' ? '' : value); history.replaceState(history.state, '', url); setKind(value); };
  const denied = error => { if (error.status === 401 || error.status === 403) auth.refresh().catch(() => {}); };
  // The grid queue also brings the pause switch and the other queues' counts, so it loads on every tab.
  const queue = useQueue('works', 'pending', denied), { data, item, busy, run } = queue;
  return <><header className="catalog-heading"><div><h1>Админка</h1><p>Проверяй именно ту версию, которая будет опубликована. Решения отражаются и на карточках в Telegram.</p></div>
    <div className="catalog-actions"><button className="catalog-button" disabled={busy || !data} onClick={() => run(() => catalogAPI('/admin/settings', { method: 'PATCH', body: { paused: !data.paused } }))}>
      {data?.paused ? 'Возобновить приём' : 'Приостановить приём'}</button>
      {config?.moderationUrl && <a className="catalog-button" href={config.moderationUrl} target="_blank" rel="noreferrer">Топик модерации<Icon name="external"/></a>}</div></header>
    {data?.paused && <Notice>Новые заявки, обновления и арты временно не принимаются. Просмотр и скачивание доступны.</Notice>}
    <div className="catalog-kind" role="tablist" aria-label="Что проверять">{[['works', 'Сетки', data?.counts?.pending], ['arts', 'Готовые арты', data?.artsPending], ['backgrounds', 'Фоны', data?.backgroundsPending]].map(([value, label, count]) =>
      <button key={value} role="tab" aria-selected={kind === value} onClick={() => showKind(value)}>{label}{count ? <span className="catalog-count">{count}</span> : null}</button>)}</div>
    {kind === 'arts' ? <ArtModeration denied={denied}/> : kind === 'backgrounds' ? <BackgroundModeration denied={denied}/> :
      <Queue queue={queue} tabs={TABS} label="Сетки" entry={work => <><strong>{work.title}</strong><span>{work.author || 'Без подписи'}</span>
        <small>{[work.tags.join(', ') || 'Без тегов', `${work.stats.categories} категорий`, work.reports.length && `жалоб: ${work.reports.length}`, work.featured && 'в подборке'].filter(Boolean).join(' · ')}</small></>}>
        {/* A fresh form per version and after its title, author or tags were saved. */}
        {item && <WorkReview key={[item.id, item.revision, item.title, item.author, item.tags.join()].join('\n')} item={item} queue={queue}/>}
      </Queue>}
  </>;
}

// A grid laid out as a background's review, plus what only grids have: statistics, the published
// version to compare an update with, the selection on the main page and the spam block.
function WorkReview({ item, queue: { busy, run } }) {
  const tags = item.tags.filter(tag => CATALOG_TAGS.includes(tag));
  const [reason, setReason] = useState(''), [blockIP, setBlockIP] = useState(false), [meta, setMeta] = useState({ title: item.title, author: item.author || '', tags });
  const review = (action, extra = {}) => run(() => catalogAPI(`/admin/works/${item.id}`, { method: 'POST', body: { action, revision: item.revision, reason, blockIP, ...extra } }));
  const changed = meta.title !== item.title || meta.author !== (item.author || '') || [...meta.tags].sort().join() !== [...tags].sort().join();
  const pending = item.status === 'pending';
  return <section className="catalog-review">
    <GridPreview grid={item.grid} title={item.title} large/><Stats stats={item.stats}/>
    <p className="catalog-muted">{item.blocked ? 'Скрыта из мастерской' : STATUS[item.status] || 'В мастерской'}{reasonNote(item.reason)}. Работ из этого браузера: {item.related}.{item.linked ? ' Автор вошёл через Telegram — бот сообщит ему о решении.' : ''}
      {item.published && !pending && !item.blocked ? <> <a href={`${CATALOG_PATH}?id=${item.id}`} target="_blank" rel="noreferrer">Открыть в мастерской</a></> : null}</p>
    {item.published && pending && <details><summary>Сравнить с опубликованной версией</summary><GridPreview grid={item.published.grid} title="Опубликованная версия" large/></details>}
    {item.blocked ? <><div className="catalog-actions"><button className="catalog-button primary" disabled={busy} onClick={() => review('unblock')}>Разблокировать</button></div>
      <p className="catalog-muted">Работа вернётся в мастерскую, а браузер и IP автора снова смогут отправлять сетки.</p></> : <>
      <form className="art-review-meta" onSubmit={event => { event.preventDefault(); review('edit', meta); }}>
        <label>Название<input value={meta.title} maxLength={80} required onChange={event => setMeta({ ...meta, title: event.target.value })}/></label>
        <label>Автор<input value={meta.author} maxLength={40} onChange={event => setMeta({ ...meta, author: event.target.value })}/></label>
        <fieldset><legend>Теги <span className="catalog-muted">до трёх</span></legend><div className="catalog-tags">{CATALOG_TAGS.map(tag =>
          <button type="button" key={tag} aria-pressed={meta.tags.includes(tag)} disabled={!meta.tags.includes(tag) && meta.tags.length >= 3}
            onClick={() => setMeta({ ...meta, tags: meta.tags.includes(tag) ? meta.tags.filter(value => value !== tag) : [...meta.tags, tag] })}>{tag}</button>)}</div></fieldset>
        <button className="catalog-button" disabled={busy || !changed || !meta.title.trim()}>Сохранить</button></form>
      {pending ? <><RejectReason kind="works" value={reason} onChange={setReason}/>
        <div className="catalog-actions"><button className="catalog-button primary" disabled={busy || changed} onClick={() => review('approve')}><Icon name="check"/>Одобрить</button>
          <button className="catalog-button" disabled={busy || !reason.trim()} onClick={() => review('reject')}>Отклонить</button></div>
        {changed && <p className="catalog-muted">Сначала сохрани изменения названия, тегов или автора.</p>}</>
        : <label>Причина <span className="catalog-muted">для скрытия</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>}
      {!!item.reports.length && <div className="catalog-reports"><h3>Жалобы</h3>{item.reports.map(report => <p key={report.id}>{report.reason}</p>)}</div>}
      {(!!item.reports.length || item.published) && <div className="catalog-actions">{!!item.reports.length && <button className="catalog-button" disabled={busy} onClick={() => review('resolve')}>Жалобы проверены</button>}
        {item.published && <button className="catalog-button" disabled={busy} onClick={() => review('feature', { featured: !item.featured })}>{item.featured ? 'Убрать из подборки' : 'В подборку'}</button>}</div>}
      <details className="catalog-block"><summary>Скрыть работу и ограничить источник спама</summary><p>Работа исчезнет из мастерской. Браузер автора не сможет отправлять сетки 7 дней. Вернуть можно во вкладке «Заблокированы». Причина — из поля выше.</p>
        <label className="catalog-check"><input type="checkbox" checked={blockIP} onChange={e => setBlockIP(e.target.checked)}/>Также ограничить IP на 7 дней</label>
        <p className="catalog-muted">Одним IP могут пользоваться разные люди. Включай только при массовом спаме.</p>
        <button className="catalog-button danger" disabled={busy || !reason.trim()} onClick={() => review('block')}>Скрыть работу и ограничить отправку</button></details></>}
  </section>;
}
