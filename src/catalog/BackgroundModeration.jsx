import { useEffect, useState } from 'react';
import { BackgroundTagPicker } from './BackgroundGallery.jsx';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';

const TABS = [['pending', 'На проверке'], ['reports', 'Жалобы'], ['approved', 'В мастерской'], ['hidden', 'Скрыты и отклонены']];
const STATUS = { pending: 'На проверке', approved: 'В мастерской, раздел «Фоны»', hidden: 'Скрыт из мастерской', rejected: 'Отклонён' };

// Shared menu backgrounds in the admin panel; the server checks the Telegram admin on every request.
export default function BackgroundModeration({ denied }) {
  // ?filter=reports: the Telegram report card's «Посмотреть видео» opens the reports.
  const [filter, setFilter] = useState(() => TABS.some(([id]) => id === new URLSearchParams(location.search).get('filter')) ? new URLSearchParams(location.search).get('filter') : 'pending'), [page, setPage] = useState(0), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null), [selected, setSelected] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''), [meta, setMeta] = useState(null), [search, setSearch] = useState(''), [query, setQuery] = useState('');
  // Searching by title or author waits for a pause in typing, then starts from the first page.
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const c = new AbortController(); setError('');
    catalogAPI(`/admin/backgrounds?${new URLSearchParams({ filter, page: String(page), q: query })}`, { signal: c.signal })
      .then(next => { setData(next); setSelected(current => next.items.some(item => item.id === current) ? current : next.items[0]?.id || 0); })
      .catch(problem => { if (c.signal.aborted) return; denied(problem); setError(problem.message); });
    return () => c.abort();
  }, [filter, page, refresh, query]);
  const item = data?.items.find(background => background.id === selected);
  useEffect(() => { setReason(''); setMeta(item ? { title: item.title, tags: item.tags, author: item.author } : null); }, [item?.id, item?.title, item?.tags?.join(), item?.author]);
  async function act(action, extra = {}) {
    setBusy(true); setError('');
    try { await catalogAPI(`/admin/backgrounds/${item.id}`, { method: 'POST', body: { action, reason, ...extra } }); setRefresh(x => x + 1); }
    catch (problem) { denied(problem); setError(problem.message); } finally { setBusy(false); }
  }
  const changed = item && meta && (meta.title !== item.title || meta.author !== item.author || [...meta.tags].sort().join() !== item.tags.join());
  return <>
    <div className="catalog-toolbar"><div className="catalog-tabs">{TABS.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); setData(null); }}>
      {label}{data?.counts?.[value] ? <span className="catalog-count">{data.counts[value]}</span> : null}</button>)}</div>
      <label className="catalog-search"><Icon name="search"/><input aria-label="Поиск фонов в админке" placeholder="Название или автор" value={search} maxLength={80} onChange={e => setSearch(e.target.value)}/></label></div>
    {error && <Notice error>{error}</Notice>}
    {!data ? <p role="status">Загружаем фоны…</p> : !data.items.length ? <section className="catalog-empty">{query ? <><h2>Ничего не нашлось</h2><p>В этой подборке нет фонов с «{query}» в названии или авторе.</p></> : <><h2>Здесь всё разобрано</h2><p>В этой подборке пусто.</p></>}{page > 0 && <button className="catalog-button" onClick={() => setPage(x => x - 1)}>Предыдущая страница</button>}</section> : <>
      <div className="catalog-moderation"><nav className="catalog-queue" aria-label="Фоны">{data.items.map(background => <button key={background.id} aria-current={selected === background.id ? 'true' : undefined} onClick={() => setSelected(background.id)}>
        <strong>{background.title}</strong><span>{background.author || 'Без подписи'}</span><small>{background.tags.join(', ') || 'Без тегов'} · {background.aspect} · {String(background.seconds).replace('.', ',')} с{background.reports?.length ? ` · жалоб: ${background.reports.length}` : ''}</small></button>)}</nav>
        {item && <section className="catalog-review">
          <video key={item.id} className="background-review-video" src={`/api/catalog/backgrounds/${item.id}/video.webm`} poster={`/api/catalog/backgrounds/${item.id}/poster.jpg`} controls loop muted autoPlay playsInline/>
          <p className="catalog-muted">{STATUS[item.status]}{item.reason ? `. Причина: ${item.reason}` : ''}. {(item.bytes / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ. Фонов из этого браузера: {item.related}.{item.linked ? ' Автор вошёл через Telegram.' : ''}</p>
          {item.status !== 'rejected' && item.status !== 'hidden' && meta && <form className="art-review-meta" onSubmit={event => { event.preventDefault(); act('edit', meta); }}>
            <label>Название<input value={meta.title} maxLength={60} onChange={event => setMeta({ ...meta, title: event.target.value })}/></label>
            <label>Автор<input value={meta.author} maxLength={40} onChange={event => setMeta({ ...meta, author: event.target.value })}/></label>
            <BackgroundTagPicker value={meta.tags} onChange={tags => setMeta({ ...meta, tags })}/>
            <button className="catalog-button" disabled={busy || !changed}>Сохранить</button></form>}
          {item.status === 'pending' && <><label>Причина отказа<textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
            <div className="catalog-actions"><button className="catalog-button primary" disabled={busy || changed} onClick={() => act('approve')}><Icon name="check"/>Одобрить</button>
              <button className="catalog-button" disabled={busy || !reason.trim()} onClick={() => act('reject')}>Отклонить</button></div>
            {changed && <p className="catalog-muted">Сначала сохрани изменения названия, тегов или автора.</p>}</>}
          {!!item.reports?.length && <div className="catalog-reports"><h3>Жалобы</h3>{item.reports.map(report => <p key={report.id}>{report.reason}</p>)}</div>}
          {item.status === 'approved' && <><label>Причина <span className="catalog-muted">необязательно</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
            <div className="catalog-actions">{!!item.reports?.length && <button className="catalog-button" disabled={busy} onClick={() => act('resolve')}>Жалобы проверены</button>}<button className="catalog-button danger" disabled={busy} onClick={() => act('hide')}>Скрыть из мастерской</button></div></>}
          {(item.status === 'hidden' || item.status === 'rejected') && <div className="catalog-actions"><button className="catalog-button primary" disabled={busy} onClick={() => act('restore')}>Вернуть в мастерскую</button></div>}
        </section>}</div>
      {data.total > 20 && <nav className="catalog-pagination"><button className="catalog-button" disabled={!page} onClick={() => setPage(x => x - 1)}>Назад</button><span>{page + 1} / {Math.ceil(data.total / 20)}</span><button className="catalog-button" disabled={(page + 1) * 20 >= data.total} onClick={() => setPage(x => x + 1)}>Дальше</button></nav>}
    </>}
  </>;
}
