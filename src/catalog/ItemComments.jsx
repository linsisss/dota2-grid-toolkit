import Comments from '../guides/Comments.jsx';
import ReportDialog from './ReportDialog.jsx';
import { catalogAPI } from './api.js';
import { t } from '../../scripts/i18n.mjs';
import '../guides/guides.css';

// Comments under a workshop grid (kind 'work') or a menu background ('background') — server/item-comments.mjs,
// the same component as under guides.
export default function ItemComments({ kind, id, total = 0, onCount }) {
  const base = `/${kind === 'background' ? 'backgrounds' : 'works'}/${id}/comments`;
  const api = {
    load: (offset, signal) => catalogAPI(`${base}${offset ? `?offset=${offset}` : ''}`, { signal }),
    add: (body) => catalogAPI(base, { method: 'POST', body }),
    remove: (comment) => catalogAPI(`/comments/${comment}`, { method: 'DELETE' })
  };
  return <div className="item-comments"><Comments id={`${kind}:${id}`} api={api} total={total} onCount={onCount} authorLabel={kind === 'work' ? t('Автор сетки') : t('Автор фона')}
    Report={({ comment, onClose }) => <ReportDialog kind="comment" onClose={onClose} title={t('Пожаловаться на комментарий')} question={t('Что не так с комментарием?')}
      send={(reason) => catalogAPI(`/comments/${comment}/report`, { method: 'POST', body: { reason } })}/>}/></div>;
}
