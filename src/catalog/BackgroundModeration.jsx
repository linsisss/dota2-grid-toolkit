import { useState } from 'react';
import { BackgroundTagPicker } from './BackgroundGallery.jsx';
import { catalogAPI } from './api.js';
import { Icon } from './Common.jsx';
import { Queue, RejectReason, reasonNote, useQueue } from './ModerationQueue.jsx';

const TABS = [['pending', 'На проверке'], ['reports', 'Жалобы'], ['approved', 'В мастерской'], ['hidden', 'Скрыты и отклонены']];
const STATUS = { pending: 'На проверке', approved: 'В мастерской, раздел «Фоны»', hidden: 'Скрыт из мастерской', rejected: 'Отклонён' };

// Shared menu backgrounds in the admin panel.
export default function BackgroundModeration({ denied }) {
  // ?filter=reports: the Telegram report card's «Посмотреть видео» opens the reports.
  const asked = new URLSearchParams(location.search).get('filter');
  const queue = useQueue('backgrounds', TABS.some(([id]) => id === asked) ? asked : 'pending', denied), { item } = queue;
  return <Queue queue={queue} tabs={TABS} label="Фоны" entry={background => <><strong>{background.title}</strong><span>{background.author || 'Без подписи'}</span>
    <small>{background.tags.join(', ') || 'Без тегов'} · {background.aspect} · {String(background.seconds).replace('.', ',')} с{background.reports?.length ? ` · жалоб: ${background.reports.length}` : ''}</small></>}>
    {/* A fresh form per background and after its title, author or tags were saved. */}
    {item && <Review key={[item.id, item.title, item.author, item.tags.join()].join('\n')} item={item} queue={queue}/>}
  </Queue>;
}

function Review({ item, queue: { busy, run } }) {
  const [reason, setReason] = useState(''), [meta, setMeta] = useState({ title: item.title, tags: item.tags, author: item.author });
  const act = (action, extra = {}) => run(() => catalogAPI(`/admin/backgrounds/${item.id}`, { method: 'POST', body: { action, reason, ...extra } }));
  const changed = meta.title !== item.title || meta.author !== item.author || [...meta.tags].sort().join() !== item.tags.join();
  return <section className="catalog-review">
    <video className="background-review-video" src={`/api/catalog/backgrounds/${item.id}/video.webm`} poster={`/api/catalog/backgrounds/${item.id}/poster.jpg`} controls loop muted autoPlay playsInline/>
    <p className="catalog-muted">{STATUS[item.status]}{reasonNote(item.reason)}. {(item.bytes / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ. Фонов из этого браузера: {item.related}.{item.linked ? ' Автор вошёл через Telegram — об отказе бот сообщит ему с причиной.' : ''}</p>
    {item.status !== 'rejected' && item.status !== 'hidden' && <form className="art-review-meta" onSubmit={event => { event.preventDefault(); act('edit', meta); }}>
      <label>Название<input value={meta.title} maxLength={60} onChange={event => setMeta({ ...meta, title: event.target.value })}/></label>
      <label>Автор<input value={meta.author} maxLength={40} onChange={event => setMeta({ ...meta, author: event.target.value })}/></label>
      <BackgroundTagPicker value={meta.tags} onChange={tags => setMeta({ ...meta, tags })}/>
      <button className="catalog-button" disabled={busy || !changed}>Сохранить</button></form>}
    {item.status === 'pending' && <><RejectReason kind="backgrounds" value={reason} onChange={setReason}/>
      <div className="catalog-actions"><button className="catalog-button primary" disabled={busy || changed} onClick={() => act('approve')}><Icon name="check"/>Одобрить</button>
        <button className="catalog-button" disabled={busy || !reason.trim()} onClick={() => act('reject')}>Отклонить</button></div>
      {changed && <p className="catalog-muted">Сначала сохрани изменения названия, тегов или автора.</p>}</>}
    {!!item.reports?.length && <div className="catalog-reports"><h3>Жалобы</h3>{item.reports.map(report => <p key={report.id}>{report.reason}</p>)}</div>}
    {item.status === 'approved' && <><label>Причина <span className="catalog-muted">необязательно</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/></label>
      <div className="catalog-actions">{!!item.reports?.length && <button className="catalog-button" disabled={busy} onClick={() => act('resolve')}>Жалобы проверены</button>}<button className="catalog-button danger" disabled={busy} onClick={() => act('hide')}>Скрыть из мастерской</button></div></>}
    {(item.status === 'hidden' || item.status === 'rejected') && <div className="catalog-actions"><button className="catalog-button primary" disabled={busy} onClick={() => act('restore')}>Вернуть в мастерскую</button></div>}
  </section>;
}
