import Comments from './Comments.jsx';
import { guidesAPI } from './api.js';
import { ReportGuide } from './GuidePage.jsx';
import { t } from '../../scripts/i18n.mjs';

// Comments under a guide (server/guides.mjs) — src/guides/Comments.jsx with the guides' API.
export default function GuideComments({ guide, onCount }) {
  const api = {
    load: (offset, signal) => guidesAPI(`/${guide.id}/comments${offset ? `?offset=${offset}` : ''}`, { signal }),
    add: (body) => guidesAPI(`/${guide.id}/comments`, { method: 'POST', body }),
    remove: (id) => guidesAPI(`/comments/${id}`, { method: 'DELETE' })
  };
  return <Comments id={guide.id} api={api} total={guide.comments || 0} onCount={onCount} authorLabel={t('Автор гайда')}
    Report={({ comment, onClose }) => <ReportGuide guide={guide.id} comment={comment} onClose={onClose}/>}/>;
}
