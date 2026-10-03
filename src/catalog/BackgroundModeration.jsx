import { useState } from 'react';
import { MENU_SIZES } from '../../scripts/menu-background.mjs';
import { BackgroundTagPicker } from './BackgroundGallery.jsx';
import { catalogAPI } from './api.js';
import { Queue, reasonNote, useQueue } from './ModerationQueue.jsx';
import { CompareStage, MetaFields, metaBy, ReportsAlert, ReviewLayout, SimilarAlert } from './AdminReview.jsx';
import { creatorText } from './Creator.jsx';

const TABS = [['pending', 'На проверке'], ['reports', 'Жалобы'], ['approved', 'В мастерской'], ['hidden', 'Скрыты и отклонены']];
const STATUS = { pending: ['На проверке', 'wait'], approved: ['В мастерской, «Фоны»', 'ok'], hidden: ['Скрыт', 'bad'], rejected: ['Отклонён', 'bad'] };

// A row of the list (here and in «Входящие»): the poster beside the title.
export const backgroundEntry = (background) => <><img className="admin-thumb" src={`/api/catalog/backgrounds/${background.id}/poster.jpg`} alt="" loading="lazy"/>
  <strong>{background.title}</strong><span>{creatorText(background, 'Без подписи')}</span>
  <small>{background.similar?.length ? `похож: ${Math.round(background.similar[0].score * 100)}% · ` : ''}{background.tags.join(', ') || 'Без тегов'} · {background.aspect} · {String(background.seconds).replace('.', ',')} с{background.reports?.length ? ` · жалоб: ${background.reports.length}` : ''}</small></>;

// Shared menu backgrounds in the admin panel.
export default function BackgroundModeration({ denied, onChanged }) {
  // ?filter=reports: the Telegram report card's «Посмотреть видео» opens the reports.
  const asked = new URLSearchParams(location.search).get('filter');
  const queue = useQueue('backgrounds', TABS.some(([id]) => id === asked) ? asked : 'pending', denied, onChanged), { item } = queue;
  return <Queue queue={queue} tabs={TABS} label="Фоны" entry={backgroundEntry}>
    {/* A fresh form per background and after its title, author or tags were saved. */}
    {item && <BackgroundReview key={[item.id, item.title, item.author, item.credit, item.tags.join(), item.status, item.reports?.length].join('\n')} item={item} queue={queue}/>}
  </Queue>;
}

export function BackgroundReview({ item, queue: { busy, run } }) {
  const by = metaBy(item);
  const [meta, setMeta] = useState({ title: item.title, tags: item.tags, [by]: item[by] || '' }), [compare, setCompare] = useState(0);
  // A near copy (server/similarity.mjs): the published background it looks like, beside this one.
  const match = item.similar?.find((other) => other.id === compare);
  const video = (id) => <video src={`/api/catalog/backgrounds/${id}/video.webm`} poster={`/api/catalog/backgrounds/${id}/poster.jpg`} loop muted autoPlay playsInline/>;
  const send = (action, extra = {}) => catalogAPI(`/admin/backgrounds/${item.id}`, { method: 'POST', body: { action, ...extra } });
  const changed = meta.title !== item.title || meta[by] !== (item[by] || '') || [...meta.tags].sort().join() !== [...item.tags].sort().join();
  const decide = (action, reason = '') => run(async () => { if (changed && action === 'approve') await send('edit', meta); await send(action, { reason }); });
  const reports = item.reports?.length > 0;
  const [text, tone] = STATUS[item.status] || [item.status, 'neutral'];
  const actions = item.status === 'pending' ? [
    { id: 'approve', label: changed ? 'Сохранить и одобрить' : 'Одобрить', icon: 'check', tone: 'primary', key: 'a', run: () => decide('approve') },
    { id: 'reject', label: 'Отклонить', icon: 'close', key: 'r', reason: { kind: 'backgrounds', required: true, original: item.similar?.[0] ? new URL(`/background?background=${item.similar[0].id}`, location.href).href : '' }, run: (reason) => decide('reject', reason) }
  ] : item.status === 'approved' ? [
    ...(reports ? [{ id: 'resolve', label: 'Оставить, жалобы проверены', icon: 'check', tone: 'primary', key: 'a', run: () => decide('resolve') }] : []),
    { id: 'hide', label: 'Скрыть из мастерской', icon: 'eyeOff', tone: 'danger', key: 'h', reason: { confirm: 'Скрыть' }, run: (reason) => decide('hide', reason) }
  ] : [{ id: 'restore', label: 'Вернуть в мастерскую', icon: 'back', tone: 'primary', key: 'a', run: () => decide('restore') }];
  const fields = item.status === 'rejected' || item.status === 'hidden' ? null : <MetaFields title={meta.title} author={meta[by]} credit={by === 'credit'} titleMax={60}
    onTitle={(title) => setMeta({ ...meta, title })} onAuthor={(value) => setMeta({ ...meta, [by]: value })} changed={changed} busy={busy} onSave={() => run(() => send('edit', meta))}
    tags={<div className="admin-tags"><BackgroundTagPicker value={meta.tags} onChange={(tags) => setMeta({ ...meta, tags })}/></div>}/>;
  return <ReviewLayout badge="Фон меню" title={item.title} fields={fields} status={{ text: text + reasonNote(item.reason), tone }} busy={busy} actions={actions}
    meta={<>{item.aspect} · {String(item.seconds).replace('.', ',')} с · {(item.bytes / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ · фонов из этого браузера: {item.related}{item.linked ? ` · автор в Telegram: ${creatorText(item)}` : ''}</>}
    alert={<><SimilarAlert items={item.similar} what="фон" active={compare} onCompare={(id) => setCompare(id || 0)} picture={(other) => `/api/catalog/backgrounds/${other.id}/poster.jpg`}/>
      <ReportsAlert reports={item.reports}/></>}>
    {match ? <CompareStage aspect={(MENU_SIZES[item.aspect] || MENU_SIZES['16:9'])[0] / (MENU_SIZES[item.aspect] || MENU_SIZES['16:9'])[1]} left={video(match.id)} right={video(item.id)}
      labels={[`${match.published < item.created ? 'Оригинал' : 'Похожий'}: «${match.title}»`, item.status === 'pending' ? 'На проверке' : 'Этот фон']}/>
      : <video className="background-review-video" src={`/api/catalog/backgrounds/${item.id}/video.webm`} poster={`/api/catalog/backgrounds/${item.id}/poster.jpg`} controls loop muted autoPlay playsInline/>}
  </ReviewLayout>;
}
