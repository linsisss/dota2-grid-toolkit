import { useState } from 'react';
import { Icon, Modal } from './Common.jsx';
import ItemComments from './ItemComments.jsx';
import { t } from '../../scripts/i18n.mjs';

const media = (id, file) => `/api/catalog/backgrounds/${id}/${file}`;
// A background has no page of its own: its comments open in a window over the workshop, the video on
// top (asked for on 2026-10-03). `onCount`: the card's count follows what is written or deleted.
export function BackgroundCommentsButton({ item, onCount }) {
  const [open, setOpen] = useState(false), count = item.comments || 0;
  return <>
    <button type="button" className="catalog-icon background-comments-button" aria-label={t('Комментарии: {count}', { count })} title={t('Комментарии')} onClick={() => setOpen(true)}>
      <Icon name="comment"/>{count > 0 && <span>{count}</span>}</button>
    {open && <Modal title={item.title} icon="comment" size="lg" onClose={() => setOpen(false)}>
      <div className="background-comments">
        <video src={media(item.id, 'video.webm')} poster={media(item.id, 'poster.jpg')} autoPlay muted loop playsInline/>
        <ItemComments kind="background" id={item.id} total={count} onCount={onCount}/>
      </div>
    </Modal>}
  </>;
}
