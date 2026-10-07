import { useState } from 'react';
import { Icon, Modal } from './Common.jsx';
import ItemComments from './ItemComments.jsx';
import { t } from '../../scripts/i18n.mjs';

const media = (id, file) => `/api/catalog/backgrounds/${id}/${file}`;
// A background has no page of its own: its comments open in a window over the workshop (asked for on
// 2026-10-03) — the video on the left and the comments in a column of their own beside it (2026-10-07: the
// video took the whole window and the comments were below its edge); on a phone a small video on top. `onCount`: the card's count follows what is written or deleted. The
// bot's messages about comments open it by /workshop?backgrounds&comments=<id> (CatalogApp).
export function BackgroundCommentsWindow({ item, onClose, onCount }) {
  return <Modal title={item.title} icon="comment" size="lg" onClose={onClose}>
    <div className="background-comments">
      <video src={media(item.id, 'video.webm')} poster={media(item.id, 'poster.jpg')} autoPlay muted loop playsInline/>
      <div className="background-comments-list"><ItemComments kind="background" id={item.id} total={item.comments || 0} onCount={onCount}/></div>
    </div>
  </Modal>;
}
export function BackgroundCommentsButton({ item, onCount }) {
  const [open, setOpen] = useState(false), count = item.comments || 0;
  return <>
    <button type="button" className="catalog-icon background-comments-button" aria-label={t('Комментарии: {count}', { count })} title={t('Комментарии')} onClick={() => setOpen(true)}>
      <Icon name="comment"/>{count > 0 && <span>{count}</span>}</button>
    {open && <BackgroundCommentsWindow item={item} onClose={() => setOpen(false)} onCount={onCount}/>}
  </>;
}
