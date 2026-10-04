import { GUIDE_CATEGORIES } from '../../scripts/guide-document.mjs';
import { catalogAPI } from './api.js';
import { Icon } from './Common.jsx';
import { Queue, reasonNote, useQueue } from './ModerationQueue.jsx';
import { ReportsAlert, ReviewLayout, useStaffRole } from './AdminReview.jsx';
import GuideContent, { fileSize } from '../guides/GuideContent.jsx';
import '../guides/guides.css';

const TABS = [['pending', 'На проверке'], ['reports', 'Жалобы'], ['approved', 'Опубликованы'], ['hidden', 'Скрыты и отклонены']];
const section = (id) => GUIDE_CATEGORIES.find((category) => category.id === id)?.title || id;

// A row of the list (here and in «Входящие»): the cover beside the title.
export const guideEntry = (guide) => <>{guide.cover ? <img className="admin-thumb" src={`${guide.cover.url}?review=${guide.review}`} alt="" loading="lazy"/> : null}
  <strong>{guide.title || 'Без названия'}</strong><span>{guide.author?.name || 'Пользователь'}</span>
  <small>{[section(guide.category), guide.update && 'изменения', guide.modding && 'модификация файлов', guide.reports.length && `жалоб: ${guide.reports.length}`].filter(Boolean).join(' · ')}</small></>;

// «Гайды» in the admin panel (server/guides.mjs): the version to publish as readers will see it, with
// its files (download them before publishing), the reports on it and on its comments.
export default function GuideModeration({ denied, onChanged }) {
  const queue = useQueue('guides', 'pending', denied, onChanged), { item } = queue;
  return <Queue queue={queue} tabs={TABS} label="Гайды" entry={guideEntry}>
    {item && <GuideReview key={`${item.id}:${item.status}:${item.guideStatus}:${item.reports.length}:${item.modding}`} item={item} queue={queue}/>}
  </Queue>;
}

export function GuideReview({ item, queue: { busy, run } }) {
  const decide = (action, reason = '') => run(() => catalogAPI(`/admin/guides/${item.revision}`, { method: 'POST', body: { action, reason } }));
  const removeComment = (id) => run(() => catalogAPI(`/guides/comments/${id}`, { method: 'DELETE' }));
  // «! Используется модификация файлов игры»: the author can put it; here a moderator puts it or takes it off.
  const mark = () => run(() => catalogAPI(`/admin/guides/${item.guide}/modding`, { method: 'POST', body: { modding: !item.modding } }));
  const moderator = useStaffRole() === 'moderator';
  const files = Object.values(item.media).filter((media) => media.kind === 'file');
  const hidden = item.guideStatus === 'hidden' && item.status === 'approved';
  const status = hidden ? ['Скрыт', 'bad'] : { pending: ['На проверке', 'wait'], approved: ['Опубликован', 'ok'], rejected: ['Отклонён', 'bad'], draft: ['Черновик', 'neutral'] }[item.status] || [item.status, 'neutral'];
  const actions = item.status === 'pending' ? [
    { id: 'approve', label: 'Опубликовать', icon: 'check', tone: 'primary', key: 'a', run: () => decide('approve') },
    { id: 'reject', label: 'Отклонить', icon: 'close', key: 'r', reason: { kind: 'guides', required: true }, run: (reason) => decide('reject', reason) }
  ] : item.status === 'approved' && !hidden ? [
    ...(item.reports.length ? [{ id: 'resolve', label: 'Оставить, жалобы проверены', icon: 'check', tone: 'primary', key: 'a', run: () => decide('resolve') }] : []),
    { id: 'hide', label: 'Скрыть гайд', icon: 'eyeOff', tone: 'danger', key: 'h', reason: { confirm: 'Скрыть' }, run: (reason) => decide('hide', reason) }
  ] : hidden ? [{ id: 'restore', label: 'Вернуть в «Гайды»', icon: 'back', tone: 'primary', key: 'a', run: () => decide('restore') }] : [];
  const media = Object.fromEntries(Object.entries(item.media).map(([id, value]) => [id, { ...value, url: `${value.url}?review=${item.review}` }]));
  return <ReviewLayout stage="text" badge={item.update ? 'Гайд · изменения' : 'Гайд'} title={item.title} status={{ text: status[0] + reasonNote(item.reason), tone: status[1] }} busy={busy} actions={actions}
    meta={<>{item.author?.name || 'Пользователь'} · {section(item.category)} · <a href={`./guides?id=${item.guide}&review=${item.review}`} target="_blank" rel="noreferrer">открыть на сайте<Icon name="external" size={13}/></a>
      {moderator ? (item.modding ? <> · пометка «Модификация файлов игры»</> : null) : <>{' '}<button type="button" className="guide-modding-switch is-small" aria-pressed={!!item.modding} disabled={busy} onClick={mark}
        title={item.modding ? 'Снять пометку (автор снять её не может)' : 'Поставить пометку'}><span className="guide-modding-mark" aria-hidden="true">!</span>Модификация файлов игры</button></>}</>}
    alert={<>{files.length > 0 && <div className="admin-files"><strong><Icon name="paperclip" size={16}/>Файлы — скачай и проверь перед публикацией</strong>
      <ul>{files.map((file) => <li key={file.id}><a href={`${file.url}?review=${item.review}`} download={file.name}>{file.name}</a> <span className="catalog-muted">{fileSize(file.size)}</span></li>)}</ul></div>}
      <ReportsAlert reports={item.reports} render={(report) => <>{report.kind === 'comment' ? <>На комментарий «{(report.body || 'удалён').slice(0, 200)}»: </> : 'На гайд: '}{report.reason}
        {report.kind === 'comment' && report.body && !moderator && <button type="button" className="catalog-link" disabled={busy} onClick={() => removeComment(report.comment)}>удалить комментарий</button>}</>}/></>}>
    <div className="guide-review-text guide-review"><GuideContent doc={item.doc} media={media}/></div>
  </ReviewLayout>;
}
