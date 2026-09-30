import { useState } from 'react';
import { ART_CATEGORIES } from '../../scripts/art-document.mjs';
import { ArtPreview, DOTA_GRID } from '../ArtPreview.jsx';
import { catalogAPI } from './api.js';
import { Icon } from './Common.jsx';
import { Queue, RejectReason, reasonNote, useQueue } from './ModerationQueue.jsx';

const TABS = [['pending', 'На проверке'], ['approved', 'В библиотеке'], ['hidden', 'Скрыты и отклонены']];
const STATUS = { pending: 'На проверке', approved: 'В библиотеке у всех пользователей', hidden: 'Скрыт из библиотеки', rejected: 'Отклонён' };

// Arts sent for the editor's library, in the admin panel.
export default function ArtModeration({ denied }) {
  const queue = useQueue('arts', 'pending', denied), { item } = queue;
  return <Queue queue={queue} tabs={TABS} label="Арты" entry={art => <><strong>{art.name}</strong><span>{art.author || 'Без подписи'}</span><small>{art.category} · строк: {art.text.split('\n').length}</small></>}>
    {/* A fresh form per art and after its name, category or author were saved. */}
    {item && <Review key={[item.id, item.name, item.category, item.author].join('\n')} item={item} queue={queue}/>}
  </Queue>;
}

function Review({ item, queue: { busy, run } }) {
  const [reason, setReason] = useState(''), [meta, setMeta] = useState({ name: item.name, category: item.category, author: item.author });
  const act = (action, extra = {}) => run(() => catalogAPI(`/admin/arts/${item.id}`, { method: 'POST', body: { action, reason, ...extra } }));
  const changed = ['name', 'category', 'author'].some(key => meta[key] !== item[key]);
  return <section className="catalog-review">
    <div className="art-review-preview"><ArtPreview art={item} canvas={DOTA_GRID}/></div>
    <p className="catalog-muted">{STATUS[item.status]}{reasonNote(item.reason)}. Отправок артов из этого браузера: {item.related}.{item.linked ? ' Автор вошёл через Telegram — бот сообщит ему о решении.' : ''}</p>
    {item.status !== 'rejected' && item.status !== 'hidden' && <form className="art-review-meta" onSubmit={event => { event.preventDefault(); act('edit', meta); }}>
      <label>Название<input value={meta.name} maxLength={60} onChange={event => setMeta({ ...meta, name: event.target.value })}/></label>
      <label>Категория<select value={meta.category} onChange={event => setMeta({ ...meta, category: event.target.value })}>{ART_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Автор<input value={meta.author} maxLength={40} onChange={event => setMeta({ ...meta, author: event.target.value })}/></label>
      <button className="catalog-button" disabled={busy || !changed}>Сохранить</button></form>}
    {item.status === 'pending' && <><RejectReason kind="arts" value={reason} onChange={setReason}/>
      <div className="catalog-actions"><button className="catalog-button primary" disabled={busy || changed} onClick={() => act('approve')}><Icon name="check"/>Одобрить</button>
        <button className="catalog-button" disabled={busy || !reason.trim()} onClick={() => act('reject')}>Отклонить</button></div>
      {changed && <p className="catalog-muted">Сначала сохрани изменения названия, категории или автора.</p>}</>}
    {item.status === 'approved' && <><label>Причина <span className="catalog-muted">необязательно</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
      <div className="catalog-actions"><button className="catalog-button danger" disabled={busy} onClick={() => act('hide')}>Скрыть из библиотеки</button></div></>}
    {(item.status === 'hidden' || item.status === 'rejected') && <div className="catalog-actions"><button className="catalog-button primary" disabled={busy} onClick={() => act('restore')}>Вернуть в библиотеку</button></div>}
  </section>;
}
