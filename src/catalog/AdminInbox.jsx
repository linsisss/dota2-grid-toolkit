import { useEffect, useRef, useState } from 'react';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';
import { QueueList } from './ModerationQueue.jsx';
import { WorkReview, workEntry } from './Moderation.jsx';
import { ArtReview, artEntry } from './ArtModeration.jsx';
import { BackgroundReview, backgroundEntry } from './BackgroundModeration.jsx';
import { GuideReview, guideEntry } from './GuideModeration.jsx';

// «Входящие» (asked for on 2026-10-02 as part of a quicker admin panel): everything that waits for a
// decision — new grids, arts, backgrounds and guides, their updates, and reports — in one list,
// oldest first, each reviewed as in its own section. A decision moves to the next one.
const SOURCES = [['works', 'pending'], ['works', 'reports'], ['arts', 'pending'], ['backgrounds', 'pending'], ['backgrounds', 'reports'], ['guides', 'pending'], ['guides', 'reports']];
const KINDS = {
  works: { label: 'Сетка', icon: 'grid', entry: workEntry, Review: WorkReview },
  arts: { label: 'Арт', icon: 'art', entry: artEntry, Review: ArtReview },
  backgrounds: { label: 'Фон', icon: 'brush', entry: backgroundEntry, Review: BackgroundReview },
  guides: { label: 'Гайд', icon: 'guides', entry: guideEntry, Review: GuideReview }
};
const SHOWS = [['all', 'Всё'], ['pending', 'На проверке'], ['reports', 'Жалобы']];

export default function AdminInbox({ denied, onChanged }) {
  const [entries, setEntries] = useState(null), [selected, setSelected] = useState(null), [show, setShow] = useState('all');
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const position = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(SOURCES.map(([kind, filter]) => catalogAPI(`/admin/${kind}?filter=${filter}`, { signal: controller.signal })
      .then((data) => data.items.map((item) => ({ key: `${kind}:${filter}:${item.id}`, kind, filter, item, at: item.updated || item.created || 0 })))))
      .then((lists) => {
        const all = lists.flat().sort((a, b) => a.at - b.at);
        setEntries(all);
        setSelected((current) => (all.some((entry) => entry.key === current) ? current : all[Math.min(position.current, all.length - 1)]?.key ?? null));
      }, (problem) => { if (controller.signal.aborted) return; denied(problem); setError(problem.message); });
    return () => controller.abort();
  }, [refresh]);
  const visible = entries?.filter((entry) => show === 'all' || entry.filter === show) || [];
  useEffect(() => { position.current = Math.max(0, visible.findIndex((entry) => entry.key === selected)); }, [selected, entries, show]);
  async function run(request) {
    setBusy(true); setError('');
    try { await request(); setRefresh((x) => x + 1); onChanged(); } catch (problem) { denied(problem); setError(problem.message); } finally { setBusy(false); }
  }
  const counts = { all: entries?.length || 0, pending: entries?.filter((entry) => entry.filter === 'pending').length || 0, reports: entries?.filter((entry) => entry.filter === 'reports').length || 0 };
  const current = visible.find((entry) => entry.key === selected) || null;
  const kind = current && KINDS[current.kind];
  return <>
    <div className="catalog-toolbar admin-toolbar"><div className="catalog-tabs is-small">{SHOWS.map(([value, name]) => <button key={value} aria-pressed={show === value} onClick={() => setShow(value)}>
      {name}{counts[value] ? <span className="catalog-count">{counts[value]}</span> : null}</button>)}</div>
      <p className="catalog-muted admin-hint">Всё, что ждёт решения, по порядку поступления.</p></div>
    {error && <Notice error>{error}</Notice>}
    {!entries ? <p role="status">Собираем входящие…</p> : !visible.length ? <section className="catalog-empty admin-empty"><Icon name="check"/><h2>Всё разобрано</h2>
      <p>Новые заявки и жалобы появятся здесь и в Telegram-топике модерации.</p></section> :
      <div className="catalog-moderation"><aside className="catalog-queue-side">
        <QueueList items={visible} selected={selected} onSelect={setSelected} label="Входящие" keyOf={(entry) => entry.key}
          entry={(entry) => <><span className={`admin-kind is-${entry.kind}${entry.filter === 'reports' ? ' is-report' : ''}`}><Icon name={entry.filter === 'reports' ? 'flag' : KINDS[entry.kind].icon} size={13}/>
            {KINDS[entry.kind].label}{entry.filter === 'reports' ? ' · жалоба' : ''}</span>{KINDS[entry.kind].entry(entry.item)}</>}/>
      </aside>{current && <kind.Review key={`${current.key}:${JSON.stringify([current.item.status, current.item.title, current.item.reports?.length, current.item.updated])}`} item={current.item} queue={{ busy, run }}/>}</div>}
  </>;
}
