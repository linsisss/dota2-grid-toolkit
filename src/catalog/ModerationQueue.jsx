import { useEffect, useState } from 'react';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';

// What the three admin queues (grids, arts, backgrounds) share, so they look and work alike: tabs
// with counts and a search, the list on the left with a scroll of its own and its pages under it,
// and the rejection reason with quick answers. The server checks the Telegram admin on every request.

const PAGE = 20;
const NOUNS = {
  works: { many: 'сеток', loading: 'Загружаем сетки…', inside: 'В вашей сетке', bad: 'она плохая', yours: 'Ваша сетка', other: 'другую', place: 'мастерскую' },
  arts: { many: 'артов', loading: 'Загружаем арты…', inside: 'В вашем арте', bad: 'он плохой', yours: 'Ваш арт', other: 'другой', place: 'библиотеку' },
  backgrounds: { many: 'фонов', loading: 'Загружаем фоны…', inside: 'В вашем фоне', bad: 'он плохой', yours: 'Ваш фон', other: 'другой', place: 'мастерскую' }
};

// The author sees the reason word for word in «Мои публикации» and, signed in with Telegram, in a message
// from the bot (catalog-telegram.mjs deliverRejectNotices).
export function quickReasons(kind) {
  const n = NOUNS[kind];
  return [
    ['Не хватает деталей', `${n.inside} недостаточно деталей для публикации. Это не значит, что ${n.bad}, просто мы не можем пропускать каждую заявку в ${n.place}.`],
    ['Плохое качество', `${n.yours} слишком низкого качества. Попробуйте найти качество лучше, либо загрузите ${n.other}.`],
    ['Нарушение правил', 'Нарушение правил']
  ];
}

// «…. Причина: …» after a status, without a doubled full stop.
export const reasonNote = reason => reason ? `. Причина: ${reason.replace(/\.+$/, '')}` : '';

// One queue: `kind` is works, arts or backgrounds (/api/catalog/admin/<kind>); `first` is the tab to open.
export function useQueue(kind, first, denied) {
  const [filter, setFilter] = useState(first), [page, setPage] = useState(0), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  // Searching by title or author waits for a pause in typing, then starts from the first page.
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const c = new AbortController(); setError('');
    catalogAPI(`/admin/${kind}?${new URLSearchParams({ filter, page: String(page), q: query })}`, { signal: c.signal })
      .then(next => { setData(next); setSelected(current => next.items.some(item => item.id === current) ? current : next.items[0]?.id ?? null); })
      .catch(problem => { if (c.signal.aborted) return; denied(problem); setError(problem.message); });
    return () => c.abort();
  }, [kind, filter, page, refresh, query]);
  async function run(request) {
    setBusy(true); setError('');
    try { await request(); setRefresh(x => x + 1); } catch (problem) { denied(problem); setError(problem.message); } finally { setBusy(false); }
  }
  return { kind, filter, showFilter: value => { setFilter(value); setPage(0); setData(null); }, page, setPage, data, selected, setSelected,
    item: data?.items.find(item => item.id === selected), error, busy, run, search, setSearch, query };
}

// Tabs, search, then the list (`entry` draws one row) beside `children`, the review of the selected one.
export function Queue({ queue, tabs, label, entry, children }) {
  const { kind, data, query, page, setPage } = queue, noun = NOUNS[kind];
  return <>
    <div className="catalog-toolbar"><div className="catalog-tabs">{tabs.map(([value, name]) => <button key={value} aria-pressed={queue.filter === value} onClick={() => queue.showFilter(value)}>
      {name}{data?.counts?.[value] ? <span className="catalog-count">{data.counts[value]}</span> : null}</button>)}</div>
      <label className="catalog-search"><Icon name="search"/><input aria-label={`Поиск ${noun.many} в админке`} placeholder="Название или автор" value={queue.search} maxLength={80} onChange={e => queue.setSearch(e.target.value)}/></label></div>
    {queue.error && <Notice error>{queue.error}</Notice>}
    {!data ? <p role="status">{noun.loading}</p> : !data.items.length ? <section className="catalog-empty">{query ? <><h2>Ничего не нашлось</h2><p>В этой подборке нет {noun.many} с «{query}» в названии или авторе.</p></> : <><h2>Здесь всё разобрано</h2><p>В этой подборке пусто.</p></>}{page > 0 && <button className="catalog-button" onClick={() => setPage(x => x - 1)}>Предыдущая страница</button>}</section> :
      <div className="catalog-moderation"><aside className="catalog-queue-side">
        <nav className="catalog-queue" aria-label={label}>{data.items.map(item => <button key={item.id} aria-current={queue.selected === item.id ? 'true' : undefined} onClick={() => queue.setSelected(item.id)}>{entry(item)}</button>)}</nav>
        {data.total > PAGE && <nav className="catalog-pagination" aria-label="Страницы"><button className="catalog-button" disabled={!page} onClick={() => setPage(x => x - 1)}>Назад</button><span>{page + 1} / {Math.ceil(data.total / PAGE)}</span><button className="catalog-button" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(x => x + 1)}>Дальше</button></nav>}
      </aside>{children}</div>}
  </>;
}

// The rejection reason: a quick answer fills it in, and it can still be edited before «Отклонить».
export function RejectReason({ kind, value, onChange }) {
  return <fieldset className="catalog-reason"><legend>Причина отказа</legend>
    <div className="catalog-tags" role="group" aria-label="Быстрые причины">{quickReasons(kind).map(([name, text]) =>
      <button type="button" key={name} aria-pressed={value === text} onClick={() => onChange(value === text ? '' : text)}>{name}</button>)}</div>
    <textarea aria-label="Причина отказа" rows={3} value={value} onChange={e => onChange(e.target.value)} maxLength={500}/></fieldset>;
}
