import { useEffect, useState } from 'react';
import { catalogAPI } from './api.js';
import { Icon, Notice } from './Common.jsx';

// «Журнал» (server/admin-journal.mjs): who decided what lately, on the site or by a button in the
// Telegram topic, newest first, by day.
const day = (at) => new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
const time = (at) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const TONES = { approve: 'ok', restore: 'ok', unblock: 'ok', resolve: 'ok', keep: 'ok', 'report-keep': 'ok', reject: 'bad', hide: 'bad', block: 'bad', 'report-hide': 'bad', comment: 'bad', 'badge-on': 'ok' };

export default function AdminJournal({ denied }) {
  const [items, setItems] = useState(null), [more, setMore] = useState(false), [error, setError] = useState('');
  const load = (before = 0) => catalogAPI(`/admin/journal${before ? `?before=${before}` : ''}`).then((data) => {
    setItems((current) => (before ? [...current, ...data.items] : data.items)); setMore(data.more);
  }, (problem) => { denied(problem); setError(problem.message); });
  useEffect(() => { load(); }, []);
  if (error) return <Notice error>{error}</Notice>;
  if (!items) return <p role="status">Загружаем журнал…</p>;
  if (!items.length) return <section className="catalog-empty admin-empty"><Icon name="history"/><h2>Решений пока нет</h2><p>Здесь появится, кто что одобрил, отклонил или скрыл — на сайте и в Telegram.</p></section>;
  const days = [];
  for (const item of items) { const label = day(item.at); if (days.at(-1)?.label !== label) days.push({ label, items: [] }); days.at(-1).items.push(item); }
  return <section className="admin-journal">
    <p className="catalog-muted admin-hint">Кто что решил — на сайте и кнопками в Telegram-топике, новые сверху.</p>
    {days.map((group) => <div key={group.label} className="admin-journal-day"><h3>{group.label}</h3>
      <ol>{group.items.map((item) => <li key={item.id}>
        <time>{time(item.at)}</time>
        <span className={`admin-status is-${TONES[item.action] || 'neutral'}`}>{item.label}</span>
        <span className="admin-journal-what">{item.kindLabel} {item.link ? <a href={`./${item.link}`} target="_blank" rel="noreferrer">«{item.title}»</a> : item.title ? `«${item.title}»` : <em>удалён</em>}</span>
        <span className="admin-journal-who"><Icon name={item.via === 'telegram' ? 'telegramLogo' : 'user'} size={14}/>{item.actor?.name || 'Администратор'}</span>
      </li>)}</ol></div>)}
    {more && <button className="catalog-button" onClick={() => load(items.at(-1).id)}>Показать ещё</button>}
  </section>;
}
