import { useEffect, useRef, useState } from 'react';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';

// What the admin queues (grids, arts, backgrounds, guides) share, so they look and work alike: tabs
// with counts and a search, the list on the left with a scroll of its own and its pages under it
// (↑ ↓ walk it), and the rejection reason's quick answers. The server checks the Telegram admin on
// every request.

const PAGE = 20;
// A key typed into a field is not a command (the list's ↑ ↓, a review's A / R / H).
export const typing = (event) => !!event.target.closest?.('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey;
const NOUNS = {
  works: { many: 'сеток', loading: 'Загружаем сетки…', inside: 'В вашей сетке', bad: 'она плохая', yours: 'Ваша сетка', other: 'другую', place: 'мастерскую' },
  arts: { many: 'артов', loading: 'Загружаем арты…', inside: 'В вашем арте', bad: 'он плохой', yours: 'Ваш арт', other: 'другой', place: 'библиотеку' },
  backgrounds: { many: 'фонов', loading: 'Загружаем фоны…', inside: 'В вашем фоне', bad: 'он плохой', yours: 'Ваш фон', other: 'другой', place: 'мастерскую' },
  guides: { many: 'гайдов', loading: 'Загружаем гайды…', inside: 'В вашем гайде', bad: 'он плохой', yours: 'Ваш гайд', other: 'другой', place: 'гайды' }
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

// One queue: `kind` is works, arts, backgrounds or guides (/api/catalog/admin/<kind>); `first` is the tab
// to open; `onChanged` hears about every decision (the panel's counts follow).
export function useQueue(kind, first, denied, onChanged = () => {}) {
  const [filter, setFilter] = useState(first), [page, setPage] = useState(0), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [done, setDone] = useState('');
  // Searching by title or author waits for a pause in typing, then starts from the first page.
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const c = new AbortController(); setError('');
    catalogAPI(`/admin/${kind}?${new URLSearchParams({ filter, page: String(page), q: query })}`, { signal: c.signal })
      .then(next => {
        setData(next);
        // After a decision the next one in the list is selected (the decided one left it).
        setSelected(current => next.items.some(item => item.id === current) ? current : next.items[Math.min(position.current, next.items.length - 1)]?.id ?? null);
      })
      .catch(problem => { if (c.signal.aborted) return; denied(problem); setError(problem.message); });
    return () => c.abort();
  }, [kind, filter, page, refresh, query]);
  const position = useRef(0);
  useEffect(() => { if (data) position.current = Math.max(0, data.items.findIndex(item => item.id === selected)); }, [selected, data]);
  async function run(request, note = 'Готово') {
    setBusy(true); setError('');
    try { await request(); setRefresh(x => x + 1); setDone(note); onChanged(); } catch (problem) { denied(problem); setError(problem.message); } finally { setBusy(false); }
  }
  return { kind, filter, showFilter: value => { setFilter(value); setPage(0); setData(null); }, page, setPage, data, selected, setSelected,
    item: data?.items.find(item => item.id === selected), error, busy, run, search, setSearch, query, done, setDone };
}

// ↑ ↓ (or J K) walk the list when no field has the keys.
export function useListKeys(items, selected, select) {
  useEffect(() => {
    const onKey = (event) => {
      if (typing(event) || !items?.length) return;
      const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const at = items.findIndex((item) => item === selected);
      const next = items[Math.max(0, Math.min(items.length - 1, (at < 0 ? 0 : at + step)))];
      if (next !== undefined) { select(next); document.querySelector(`[data-queue-key="${CSS.escape(String(next))}"]`)?.scrollIntoView({ block: 'nearest' }); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
}

// The list of a queue: `entry` draws one row; `keyOf` gives its key (the item's id by default).
export function QueueList({ items, selected, onSelect, entry, label, keyOf = (item) => item.id }) {
  useListKeys(items.map(keyOf), selected, onSelect);
  return <nav className="catalog-queue admin-list" aria-label={label}>{items.map(item => { const key = keyOf(item);
    return <button key={key} data-queue-key={key} aria-current={selected === key ? 'true' : undefined} onClick={() => onSelect(key)}>{entry(item)}</button>; })}</nav>;
}

// Tabs, search, then the list beside `children`, the review of the selected one.
export function Queue({ queue, tabs, label, entry, children }) {
  const { kind, data, query, page, setPage } = queue, noun = NOUNS[kind];
  return <>
    <div className="catalog-toolbar admin-toolbar"><div className="catalog-tabs is-small">{tabs.map(([value, name]) => <button key={value} aria-pressed={queue.filter === value} onClick={() => queue.showFilter(value)}>
      {name}{data?.counts?.[value] ? <span className="catalog-count">{data.counts[value]}</span> : null}</button>)}</div>
      <label className="catalog-search"><Icon name="search"/><input aria-label={`Поиск ${noun.many} в админке`} placeholder="Название или автор" value={queue.search} maxLength={80} onChange={e => queue.setSearch(e.target.value)}/></label></div>
    {queue.error && <Notice error>{queue.error}</Notice>}
    {!data ? <p role="status">{noun.loading}</p> : !data.items.length ? <section className="catalog-empty admin-empty"><Icon name="check"/>{query ? <><h2>Ничего не нашлось</h2><p>В этой подборке нет {noun.many} с «{query}» в названии или авторе.</p></> : <><h2>Здесь всё разобрано</h2><p>В этой подборке пусто.</p></>}{page > 0 && <button className="catalog-button" onClick={() => setPage(x => x - 1)}>Предыдущая страница</button>}</section> :
      <div className="catalog-moderation"><aside className="catalog-queue-side">
        <QueueList items={data.items} selected={queue.selected} onSelect={queue.setSelected} entry={entry} label={label}/>
        {data.total > PAGE && <nav className="catalog-pagination" aria-label="Страницы"><button className="catalog-button" disabled={!page} onClick={() => setPage(x => x - 1)}>Назад</button><span>{page + 1} / {Math.ceil(data.total / PAGE)}</span><button className="catalog-button" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(x => x + 1)}>Дальше</button></nav>}
      </aside>{children}</div>}
  </>;
}
