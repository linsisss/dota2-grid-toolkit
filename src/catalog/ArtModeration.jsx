import { useEffect, useState } from 'react';
import { ART_CATEGORIES } from '../../scripts/art-document.mjs';
import { ArtPreview, DOTA_GRID } from '../ArtPreview.jsx';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';

const TABS = [['pending', 'На проверке'], ['approved', 'В библиотеке'], ['hidden', 'Скрыты и отклонены']];
const STATUS = { pending: 'На проверке', approved: 'В библиотеке у всех пользователей', hidden: 'Скрыт из библиотеки', rejected: 'Отклонён' };

// Player arts in the admin panel. The server checks the Telegram admin on every request.
export default function ArtModeration({ denied }) {
  const [filter, setFilter] = useState('pending'), [page, setPage] = useState(0), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null), [selected, setSelected] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''), [meta, setMeta] = useState(null);
  useEffect(() => {
    const c = new AbortController(); setError('');
    catalogAPI(`/admin/arts?filter=${filter}&page=${page}`, { signal: c.signal })
      .then(next => { setData(next); setSelected(current => next.items.some(item => item.id === current) ? current : next.items[0]?.id || 0); })
      .catch(problem => { if (c.signal.aborted) return; denied(problem); setError(problem.message); });
    return () => c.abort();
  }, [filter, page, refresh]);
  const item = data?.items.find(art => art.id === selected);
  useEffect(() => { setReason(''); setMeta(item ? { name: item.name, category: item.category, author: item.author } : null); }, [item?.id, item?.name, item?.category, item?.author]);
  async function act(action, extra = {}) {
    setBusy(true); setError('');
    try { await catalogAPI(`/admin/arts/${item.id}`, { method: 'POST', body: { action, reason, ...extra } }); setRefresh(x => x + 1); }
    catch (problem) { denied(problem); setError(problem.message); } finally { setBusy(false); }
  }
  const changed = item && meta && ['name', 'category', 'author'].some(key => meta[key] !== item[key]);
  return <>
    <div className="catalog-toolbar"><div className="catalog-tabs">{TABS.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); setData(null); }}>
      {label}{data?.counts?.[value] ? <span className="catalog-count">{data.counts[value]}</span> : null}</button>)}</div></div>
    {error && <Notice error>{error}</Notice>}
    {!data ? <p role="status">Загружаем арты…</p> : !data.items.length ? <section className="catalog-empty"><h2>Здесь всё разобрано</h2><p>В этой подборке пусто.</p>{page > 0 && <button className="catalog-button" onClick={() => setPage(x => x - 1)}>Предыдущая страница</button>}</section> : <>
      <div className="catalog-moderation"><nav className="catalog-queue" aria-label="Арты">{data.items.map(art => <button key={art.id} aria-current={selected === art.id ? 'true' : undefined} onClick={() => setSelected(art.id)}>
        <strong>{art.name}</strong><span>{art.author || 'Без подписи'}</span><small>{art.category} · строк: {art.text.split('\n').length}</small></button>)}</nav>
        {item && <section className="catalog-review">
          <div className="art-review-preview"><ArtPreview art={item} canvas={DOTA_GRID}/></div>
          <p className="catalog-muted">{STATUS[item.status]}{item.reason ? `. Причина: ${item.reason}` : ''}. Отправок артов из этого браузера: {item.related}.{item.linked ? ' Автор вошёл через Telegram — бот сообщит ему об одобрении.' : ''}</p>
          {item.status !== 'rejected' && item.status !== 'hidden' && meta && <form className="art-review-meta" onSubmit={event => { event.preventDefault(); act('edit', meta); }}>
            <label>Название<input value={meta.name} maxLength={60} onChange={event => setMeta({ ...meta, name: event.target.value })}/></label>
            <label>Категория<select value={meta.category} onChange={event => setMeta({ ...meta, category: event.target.value })}>{ART_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Автор<input value={meta.author} maxLength={40} onChange={event => setMeta({ ...meta, author: event.target.value })}/></label>
            <button className="catalog-button" disabled={busy || !changed}>Сохранить</button></form>}
          {item.status === 'pending' && <><label>Причина отказа<textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
            <div className="catalog-actions"><button className="catalog-button primary" disabled={busy || changed} onClick={() => act('approve')}><Icon name="check"/>Одобрить</button>
              <button className="catalog-button" disabled={busy || !reason.trim()} onClick={() => act('reject')}>Отклонить</button></div>
            {changed && <p className="catalog-muted">Сначала сохрани изменения названия, категории или автора.</p>}</>}
          {item.status === 'approved' && <><label>Причина <span className="catalog-muted">необязательно</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
            <div className="catalog-actions"><button className="catalog-button danger" disabled={busy} onClick={() => act('hide')}>Скрыть из библиотеки</button></div></>}
          {(item.status === 'hidden' || item.status === 'rejected') && <div className="catalog-actions"><button className="catalog-button primary" disabled={busy} onClick={() => act('restore')}>Вернуть в библиотеку</button></div>}
        </section>}</div>
      {data.total > 20 && <nav className="catalog-pagination"><button className="catalog-button" disabled={!page} onClick={() => setPage(x => x - 1)}>Назад</button><span>{page + 1} / {Math.ceil(data.total / 20)}</span><button className="catalog-button" disabled={(page + 1) * 20 >= data.total} onClick={() => setPage(x => x + 1)}>Дальше</button></nav>}
    </>}
  </>;
}
