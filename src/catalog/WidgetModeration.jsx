import { useLayoutEffect, useRef, useState } from 'react';
import { WIDGET_ACTIONS, designMedia } from '../../scripts/menu-widgets.mjs';
import { DesignView } from '../constructor/BlockView.jsx';
import { MediaFrom } from '../constructor/live.js';
import { widgetMediaURL } from '../constructor/workshop.js';
import { catalogAPI } from './api.js';
import { Icon } from './Common.jsx';
import { Queue, reasonNote, useQueue } from './ModerationQueue.jsx';
import { ReviewLayout } from './AdminReview.jsx';
import { CreatorName, creatorText } from './Creator.jsx';
import '../constructor/radiance.css';

// «Мастерская виджетов» in the admin panel (2026-10-31; server/menu-widgets.mjs): widgets users made from blocks
// in the constructor and sent to be shared. Each is drawn live as Dota will show it (with the files the server
// keeps for it), with what a moderator checks beside it: where its buttons lead and its pictures and videos.
// Like the rest of the admin panel, Russian only.
const TABS = [['pending', 'На проверке'], ['approved', 'В мастерской'], ['hidden', 'Скрыты и отклонены']];
const STATUS = { pending: ['На проверке', 'wait'], approved: ['В мастерской, «Виджеты»', 'ok'], hidden: ['Скрыт', 'bad'], rejected: ['Отклонён', 'bad'] };
const day = (at) => new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const blocksText = (count) => `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'блок' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'блока' : 'блоков'}`;

// A widget drawn small for the list (and «Входящие»): fitted into the 64 × 40 thumbnail, in its middle.
function Thumb({ design }) {
  const [W, H] = design.size, scale = Math.min(60 / W, 36 / H);
  return <span className="admin-thumb admin-widget-thumb" aria-hidden="true"><span style={{ left: (64 - W * scale) / 2, top: (40 - H * scale) / 2 }}>
    <MediaFrom.Provider value={widgetMediaURL}><DesignView design={design} scale={scale} state="normal"/></MediaFrom.Provider></span></span>;
}
export const widgetEntry = (widget) => <><Thumb design={widget.design}/><strong>{widget.name}</strong><span>{creatorText(widget, 'Без подписи')}</span>
  <small>{blocksText(widget.design.blocks.length)} · {widget.design.size.join(' × ')} · {new Date(widget.created).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</small></>;

export default function WidgetModeration({ denied, onChanged }) {
  const asked = new URLSearchParams(location.search).get('filter');
  const queue = useQueue('widgets', TABS.some(([id]) => id === asked) ? asked : 'pending', denied, onChanged), { item } = queue;
  return <Queue queue={queue} tabs={TABS} label="Виджеты" entry={widgetEntry} search={false}>
    {item && <WidgetReview key={[item.id, item.status].join('\n')} item={item} queue={queue}/>}
  </Queue>;
}

// The widget at the largest size that fits the stage (at most twice its own), hover and animations live.
function Stage({ design }) {
  const box = useRef(null), [room, setRoom] = useState(null);
  useLayoutEffect(() => {
    const node = box.current, measure = () => setRoom([node.clientWidth, node.clientHeight]);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [W, H] = design.size, scale = room ? Math.max(0.05, Math.min((room[0] - 48) / W, (room[1] - 48) / H, 2)) : 0;
  return <div ref={box} className="admin-widget-stage">
    {scale > 0 && <div className="admin-widget-frame" style={{ width: W * scale, height: H * scale }}>
      <MediaFrom.Provider value={widgetMediaURL}><DesignView design={design} scale={scale}/></MediaFrom.Provider></div>}
    <span className="admin-stage-label">{W} × {H} px{scale ? ` · ${Math.round(scale * 100)}%` : ''}</span>
  </div>;
}

// What the picture alone does not tell: where every button leads, and the files to open one by one.
function Facts({ design }) {
  const buttons = design.blocks.filter((block) => block.type === 'button'), media = designMedia(design);
  if (!buttons.length && !media.length) return null;
  return <div className="admin-widget-facts" role="note">
    {buttons.length > 0 && <div><strong><Icon name="link" size={16}/>Кнопки</strong><ul>{buttons.map((block) => <li key={block.id}>«{block.props.label}» →{' '}
      {block.props.action === 'link' ? (block.props.url ? <a href={block.props.url} target="_blank" rel="noreferrer noopener">{block.props.url}<Icon name="external" size={13}/></a> : <em>ссылка не задана, кнопка ничего не откроет</em>)
        : <>раздел Dota «{WIDGET_ACTIONS[block.props.action]?.title || block.props.action}»</>}</li>)}</ul></div>}
    {media.length > 0 && <div><strong><Icon name="image" size={16}/>Картинки и видео: {media.length}</strong>
      <p>{media.map((hash, index) => <a key={hash} href={widgetMediaURL(hash)} target="_blank" rel="noreferrer noopener">файл {index + 1}<Icon name="external" size={13}/></a>)}</p></div>}
  </div>;
}

export function WidgetReview({ item, queue: { busy, run } }) {
  const send = (action, reason = '') => catalogAPI(`/admin/widgets/${item.id}`, { method: 'POST', body: { action, reason } });
  const decide = (action, reason = '') => run(() => send(action, reason));
  const [text, tone] = STATUS[item.status] || [item.status, 'neutral'];
  const actions = item.status === 'pending' ? [
    { id: 'approve', label: 'Одобрить', icon: 'check', tone: 'primary', key: 'a', run: () => decide('approve') },
    { id: 'reject', label: 'Отклонить', icon: 'close', key: 'r', reason: { kind: 'widgets', required: true }, run: (reason) => decide('reject', reason) }
  ] : item.status === 'approved' ? [
    { id: 'hide', label: 'Скрыть из мастерской', icon: 'eyeOff', tone: 'danger', key: 'h', reason: { confirm: 'Скрыть' }, run: (reason) => decide('hide', reason) }
  ] : [{ id: 'restore', label: 'Вернуть в мастерскую', icon: 'back', tone: 'primary', key: 'a', run: () => decide('restore') }];
  return <ReviewLayout badge="Виджет" title={item.name} status={{ text: text + reasonNote(item.reason), tone }} busy={busy} actions={actions}
    meta={<><span className="admin-widget-by"><CreatorName item={item} fallback="Без подписи"/></span> · {blocksText(item.design.blocks.length)} · {item.design.size.join(' × ')} px · отправлен {day(item.created)}
      {item.status === 'approved' ? ` · лайков: ${item.likes} · добавили в меню: ${item.uses}` : ''}</>}
    alert={<Facts design={item.design}/>}>
    <Stage design={item.design}/>
  </ReviewLayout>;
}
