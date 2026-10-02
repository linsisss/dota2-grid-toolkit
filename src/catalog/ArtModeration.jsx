import { useState } from 'react';
import { ART_CATEGORIES } from '../../scripts/art-document.mjs';
import { ArtPreview, DOTA_GRID } from '../ArtPreview.jsx';
import { catalogAPI } from './api.js';
import { Queue, reasonNote, useQueue } from './ModerationQueue.jsx';
import { MetaFields, ReviewLayout } from './AdminReview.jsx';

const TABS = [['pending', 'На проверке'], ['approved', 'В библиотеке'], ['hidden', 'Скрыты и отклонены']];
const STATUS = { pending: ['На проверке', 'wait'], approved: ['В библиотеке', 'ok'], hidden: ['Скрыт', 'bad'], rejected: ['Отклонён', 'bad'] };

// A row of the list (here and in «Входящие»).
export const artEntry = (art) => <><strong>{art.name}</strong><span>{art.author || 'Без подписи'}</span><small>{art.category} · строк: {art.text.split('\n').length}</small></>;

// Arts sent for the editor's library, in the admin panel.
export default function ArtModeration({ denied, onChanged }) {
  const queue = useQueue('arts', 'pending', denied, onChanged), { item } = queue;
  return <Queue queue={queue} tabs={TABS} label="Арты" entry={artEntry}>
    {/* A fresh form per art and after its name, category or author were saved. */}
    {item && <ArtReview key={[item.id, item.name, item.category, item.author, item.status].join('\n')} item={item} queue={queue}/>}
  </Queue>;
}

export function ArtReview({ item, queue: { busy, run } }) {
  const [meta, setMeta] = useState({ name: item.name, category: item.category, author: item.author });
  const send = (action, extra = {}) => catalogAPI(`/admin/arts/${item.id}`, { method: 'POST', body: { action, ...extra } });
  const changed = ['name', 'category', 'author'].some((key) => meta[key] !== item[key]);
  // Approving with corrections saves them first.
  const decide = (action, reason = '') => run(async () => { if (changed && action === 'approve') await send('edit', meta); await send(action, { reason }); });
  const [text, tone] = STATUS[item.status] || [item.status, 'neutral'];
  const actions = item.status === 'pending' ? [
    { id: 'approve', label: changed ? 'Сохранить и одобрить' : 'Одобрить', icon: 'check', tone: 'primary', key: 'a', run: () => decide('approve') },
    { id: 'reject', label: 'Отклонить', icon: 'close', key: 'r', reason: { kind: 'arts', required: true }, run: (reason) => decide('reject', reason) }
  ] : item.status === 'approved' ? [
    { id: 'hide', label: 'Скрыть из библиотеки', icon: 'eyeOff', tone: 'danger', key: 'h', reason: { confirm: 'Скрыть' }, run: (reason) => decide('hide', reason) }
  ] : [{ id: 'restore', label: 'Вернуть в библиотеку', icon: 'back', tone: 'primary', key: 'a', run: () => decide('restore') }];
  const fields = item.status === 'rejected' || item.status === 'hidden' ? null : <MetaFields title={meta.name} author={meta.author} titleMax={60}
    onTitle={(name) => setMeta({ ...meta, name })} onAuthor={(author) => setMeta({ ...meta, author })} changed={changed} busy={busy} onSave={() => run(() => send('edit', meta))}
    extra={<label className="admin-inline"><span>Категория</span><select value={meta.category} onChange={(event) => setMeta({ ...meta, category: event.target.value })}>{ART_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>}/>;
  return <ReviewLayout badge="Готовый арт" title={item.name} fields={fields} status={{ text: text + reasonNote(item.reason), tone }} busy={busy} actions={actions}
    meta={<>строк: {item.text.split('\n').length} · отправок из этого браузера: {item.related}{item.linked ? ' · автор в Telegram, бот сообщит о решении' : ''}</>}>
    <div className="art-review-preview"><ArtPreview art={item} canvas={DOTA_GRID}/></div>
  </ReviewLayout>;
}
