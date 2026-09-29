import { useEffect, useState } from 'react';
import { catalogAPI, CATALOG_PATH } from './api.js';
import { Icon, Notice, Stats, useCatalogConfig } from './Common.jsx';
import { useAccount } from './Account.jsx';
import GridPreview from './GridPreview.jsx';
import { AdminEditButton } from './AdminEdit.jsx';
import ArtModeration from './ArtModeration.jsx';
import BackgroundModeration from './BackgroundModeration.jsx';

const TABS = [['pending', 'На проверке'], ['reports', 'Жалобы'], ['published', 'Опубликованы'], ['blocked', 'Заблокированы']];

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
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [filter, setFilter] = useState('pending');
  const [data, setData] = useState(null), [selected, setSelected] = useState(''), [page, setPage] = useState(0), [refresh, setRefresh] = useState(0);
  const [reason, setReason] = useState(''), [blockIP, setBlockIP] = useState(false);
  const [kind, setKind] = useState(() => { const value = new URLSearchParams(location.search).get('moderate'); return ['arts', 'backgrounds'].includes(value) ? value : 'works'; });
  const showKind = value => { const url = new URL(location.href); url.searchParams.set('moderate', value === 'works' ? '' : value); history.replaceState(history.state, '', url); setKind(value); };
  const denied = error => { if (error.status === 401 || error.status === 403) auth.refresh().catch(() => {}); };
  useEffect(() => {
    const c = new AbortController(); setError('');
    catalogAPI(`/admin/works?filter=${filter}&page=${page}`, { signal: c.signal }).then(next => { setData(next); setSelected(current => next.items.some(item => item.id === current) ? current : next.items[0]?.id || ''); })
      .catch(error => { if (c.signal.aborted) return; denied(error); setError(error.message); });
    return () => c.abort();
  }, [filter, page, refresh]);
  const item = data?.items.find(item => item.id === selected);
  useEffect(() => { setReason(''); setBlockIP(false); }, [item?.id, item?.revision]);
  async function run(request) {
    setBusy(true); setError('');
    try { await request(); setRefresh(x => x + 1); } catch (e) { denied(e); setError(e.message); } finally { setBusy(false); }
  }
  const review = action => run(() => catalogAPI(`/admin/works/${item.id}`, { method: 'POST', body: { action, revision: item.revision, reason, blockIP } }));
  return <><header className="catalog-heading"><div><h1>Админка</h1><p>Проверяй именно ту версию, которая будет опубликована. Решения отражаются и на карточках в Telegram.</p></div>
    <div className="catalog-actions"><button className="catalog-button" disabled={busy || !data} onClick={() => run(() => catalogAPI('/admin/settings', { method: 'PATCH', body: { paused: !data.paused } }))}>
      {data?.paused ? 'Возобновить приём' : 'Приостановить приём'}</button>
      {config?.moderationUrl && <a className="catalog-button" href={config.moderationUrl} target="_blank" rel="noreferrer">Топик модерации<Icon name="external"/></a>}</div></header>
    {data?.paused && <Notice>Новые заявки, обновления и арты временно не принимаются. Просмотр и скачивание доступны.</Notice>}
    <div className="catalog-kind" role="tablist" aria-label="Что проверять">{[['works', 'Сетки', data?.counts?.pending], ['arts', 'Готовые арты', data?.artsPending], ['backgrounds', 'Фоны', data?.backgroundsPending]].map(([value, label, count]) =>
      <button key={value} role="tab" aria-selected={kind === value} onClick={() => showKind(value)}>{label}{count ? <span className="catalog-count">{count}</span> : null}</button>)}</div>
    {kind === 'arts' ? <ArtModeration denied={denied}/> : kind === 'backgrounds' ? <BackgroundModeration denied={denied}/> : <>
    <div className="catalog-toolbar"><div className="catalog-tabs">{TABS.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); setData(null); }}>
      {label}{data?.counts?.[value] ? <span className="catalog-count">{data.counts[value]}</span> : null}</button>)}</div></div>
    {error && <Notice error>{error}</Notice>}
    {!data ? <p role="status">Загружаем очередь…</p> : !data.items.length ? <section className="catalog-empty"><h2>Здесь всё разобрано</h2><p>В этой подборке пусто.</p>{page > 0 && <button className="catalog-button" onClick={() => setPage(x => x - 1)}>Предыдущая страница</button>}</section> : <>
      <div className="catalog-moderation"><nav className="catalog-queue" aria-label="Работы">{data.items.map(work => <button key={work.id} aria-current={selected === work.id ? 'true' : undefined} onClick={() => setSelected(work.id)}>
        <strong>{work.title}</strong><span>{work.author || 'Без подписи'}</span><small>{work.stats.categories} категорий{work.reports.length ? ` · жалоб: ${work.reports.length}` : ''}{work.featured ? ' · в подборке' : ''}</small></button>)}</nav>
        {item && <section className="catalog-review"><div className="catalog-review-title"><h2>{item.title}</h2><AdminEditButton item={item} compact onSaved={() => setRefresh(x => x + 1)}/></div><GridPreview grid={item.grid} title={item.title} large/><Stats stats={item.stats}/>
          <p className="catalog-muted">Автор: {item.author || 'не указан'}. Работ от этого браузера: {item.related}. {item.linked ? 'Привязана к Telegram. ' : ''}{item.published && item.status !== 'pending' ? <a href={`${CATALOG_PATH}?id=${item.id}`} target="_blank" rel="noreferrer">Открыть в мастерской</a> : null}</p>
          {item.published && item.status === 'pending' && <details><summary>Сравнить с опубликованной версией</summary><GridPreview grid={item.published.grid} title="Опубликованная версия" large/></details>}
          {!!item.reports.length && <div className="catalog-reports"><h3>Жалобы</h3>{item.reports.map(report => <p key={report.id}>{report.reason}</p>)}</div>}
          {item.blocked ? <><Notice>Работа скрыта из мастерской.{item.reason ? ` Причина: ${item.reason}` : ''}</Notice>
            <div className="catalog-actions"><button className="catalog-button primary" disabled={busy} onClick={() => review('unblock')}>Разблокировать</button></div>
            <p className="catalog-muted">Работа вернётся в мастерскую, а браузер и IP автора снова смогут отправлять сетки.</p></> : <>
          <label>Причина отказа или ограничения<textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
          <div className="catalog-actions">{item.status === 'pending' ? <><button className="catalog-button primary" disabled={busy} onClick={() => review('approve')}><Icon name="check"/>Одобрить</button>
            <button className="catalog-button" disabled={busy || !reason.trim()} onClick={() => review('reject')}>Вернуть на доработку</button></> : null}
            {!!item.reports.length && <button className="catalog-button" disabled={busy} onClick={() => review('resolve')}>Жалобы проверены</button>}
            {item.published && <button className="catalog-button" disabled={busy} onClick={() => run(() => catalogAPI(`/admin/works/${item.id}`, { method: 'POST', body: { action: 'feature', revision: item.revision, featured: !item.featured } }))}>{item.featured ? 'Убрать из подборки' : 'В подборку'}</button>}</div>
          <details className="catalog-block"><summary>Скрыть работу и ограничить источник спама</summary><p>Работа исчезнет из мастерской. Браузер автора не сможет отправлять сетки 7 дней. Вернуть можно во вкладке «Заблокированы».</p>
            <label className="catalog-check"><input type="checkbox" checked={blockIP} onChange={e => setBlockIP(e.target.checked)}/>Также ограничить IP на 7 дней</label>
            <p className="catalog-muted">Одним IP могут пользоваться разные люди. Включай только при массовом спаме.</p>
            <button className="catalog-button danger" disabled={busy || !reason.trim()} onClick={() => review('block')}>Скрыть работу и ограничить отправку</button></details></>}
        </section>}</div>
      {data.total > 20 && <nav className="catalog-pagination"><button className="catalog-button" disabled={!page} onClick={() => setPage(x => x - 1)}>Назад</button><span>{page + 1} / {Math.ceil(data.total / 20)}</span><button className="catalog-button" disabled={(page + 1) * 20 >= data.total} onClick={() => setPage(x => x + 1)}>Дальше</button></nav>}
    </>}
    </>}
  </>;
}
