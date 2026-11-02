import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal } from '../catalog/Common.jsx';
import { catalogAPI } from '../catalog/api.js';
import { useAccount } from '../catalog/Account.jsx';
import { locale, t, translateMessage } from '../../scripts/i18n.mjs';
import { MediaFrom } from './live.js';
import { WidgetMini } from './WidgetView.jsx';
import { forgetPublished, useWorkshop, widgetMediaURL } from './workshop.js';
import './workshop.css';

// The shelf «Виджеты» → «Мастерская» (2026-10-31): widgets other users made from blocks and a moderator approved,
// popular or new, with a search by name; more come as the row scrolls to its end. Each card draws its widget
// live (clocks tick, hover lights up) with the server's copies of its files. Dragged onto the screen or «В меню»:
// on the menu (its files come into this browser first); «В мои»: into «Мои виджеты», to change in the editor.
// The author's own widgets waiting for a moderator or turned down come first, with the reason; the author may
// delete them (and their published ones).
export const WORKSHOP_SORTS = () => [['popular', t('Популярные')], ['new', t('Новые')]];
const STATES = () => ({ pending: t('На проверке'), rejected: t('Отклонён'), hidden: t('Скрыт') });

// Drawn only once it has been on screen (a row of 24 live widgets, videos too, costs nothing until seen).
function useSeen() {
  const ref = useRef(null), [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (seen || !node) return undefined;
    if (typeof IntersectionObserver !== 'function') { setSeen(true); return undefined; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setSeen(true); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
}
// A published design drawn with the server's files, fitted into `box`.
export function WorkshopPreview({ design, box }) {
  const sample = useMemo(() => ({ type: 'custom', w: design.size[0], h: design.size[1], props: { design } }), [design]);
  return <MediaFrom.Provider value={widgetMediaURL}><WidgetMini widget={sample} box={box}/></MediaFrom.Provider>;
}
function Avatar({ card }) {
  const [failed, setFailed] = useState(false);
  return card.avatar && !failed ? <img className="kz-wk-ava" src={card.avatar} alt="" width="18" height="18" loading="lazy" onError={() => setFailed(true)}/>
    : <i className="kz-wk-ava" aria-hidden="true">{(card.author || '?').trim().charAt(0).toUpperCase()}</i>;
}

function WorkshopCard({ card, onPick, onAdd, onSave, onLike, onDelete }) {
  const [ref, seen] = useSeen(), mine = card.own, waiting = card.status !== 'approved';
  const [W, H] = card.design.size, blocks = card.design.blocks.length;
  return <article className={`kz-wk-card${waiting ? ` is-${card.status}` : ''}${mine && !waiting ? ' is-mine' : ''}`} aria-label={card.name}>
    <span ref={ref} className="kz-wk-pv" title={waiting ? undefined : t('Перетащи на экран или нажми — встанет в середину')}
      onPointerDown={waiting ? undefined : (event) => onPick(event, card)}>
      {seen && <WorkshopPreview design={card.design} box={[212, 128]}/>}
      {waiting ? <span className={`kz-wk-state is-${card.status}`}>{STATES()[card.status]}</span> : mine ? <span className="kz-wk-state is-mine">{t('Твой')}</span> : null}
      <span className="kz-wk-size" title={`${t('Блоков: {count}', { count: blocks })} · ${new Date(card.created).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`}>{W} × {H}</span>
    </span>
    <div className="kz-wk-line"><b title={card.name}>{card.name}</b>
      {!waiting && <button type="button" className="kz-wk-like" aria-pressed={!!card.liked} disabled={mine}
        title={mine ? t('Свой виджет лайкнуть нельзя') : card.liked ? t('Убрать лайк') : t('Нравится')}
        aria-label={t('Нравится: {count}', { count: card.likes })} onClick={() => onLike(card)}><Icon name="heart" size={15}/><span>{card.likes}</span></button>}</div>
    {waiting ? <p className={`kz-wk-why${card.status === 'rejected' && card.reason ? ' is-reason' : ''}`} title={card.reason ? translateMessage(card.reason) : undefined}>
      {card.status === 'pending' ? t('Модератор посмотрит его, обычно в течение суток.') : card.status === 'rejected' ? (card.reason ? t('Причина: {reason}', { reason: translateMessage(card.reason) }) : t('Модератор не пропустил его.'))
        : t('Модератор убрал его из мастерской.')}</p>
      : <div className="kz-wk-by"><Avatar card={card}/><span>{card.author || t('Без подписи')}</span>
        <small title={t('Добавили в меню: {count}', { count: card.uses })}><Icon name="groupPlus" size={13}/>{card.uses}</small></div>}
    <div className="kz-wk-acts">
      {!waiting && <button type="button" className="kz-wk-add" onClick={() => onAdd(card)} title={t('Добавить в меню — встанет в середину')}><Icon name="plus" size={15}/>{t('В меню')}</button>}
      {!waiting && <button type="button" className="kz-wk-ghost" onClick={() => onSave(card)} title={t('Сохранить в «Мои виджеты»: его можно поменять в редакторе')}><Icon name="download" size={15}/>{t('В мои')}</button>}
      {mine && <button type="button" className={`kz-wk-ghost is-danger${waiting ? ' is-wide' : ''}`} onClick={() => onDelete(card)} title={t('Удалить из мастерской')} aria-label={t('Удалить «{name}» из мастерской', { name: card.name })}>
        <Icon name="trash" size={15}/>{waiting ? t('Удалить') : null}</button>}
    </div>
  </article>;
}

// The row's contents: `sort`, `query` from the shelf's head; `onPick` (a drag or a click on a picture), `onAdd`,
// `onSave` from the page (ConstructorPage.jsx); `onCreate`: «Создать свой виджет»; `onSay`: the page's toast.
export function WorkshopRow({ sort, query, onPick, onAdd, onSave, onCreate, onSay }) {
  const auth = useAccount(), user = auth?.user?.id || null;
  const gallery = useWorkshop({ sort, query: query.trim(), user, active: !auth?.loading });
  const [removing, setRemoving] = useState(null), [busy, setBusy] = useState(false);
  const end = useRef(null);
  // More as the row scrolls to its end.
  useEffect(() => {
    const node = end.current;
    if (!node || !gallery.hasMore || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) gallery.more(); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [gallery.hasMore, gallery.items?.length, gallery.loading]);
  async function like(card) {
    if (!auth?.user) { auth?.requestLogin(t('Войди, чтобы поставить лайк.')); return; }
    const liked = !card.liked;
    gallery.patch(card.id, { liked, likes: Math.max(0, card.likes + (liked ? 1 : -1)) });
    try { gallery.patch(card.id, await catalogAPI(`/widgets/${card.id}/like`, { method: 'POST', body: { liked } })); }
    catch (error) { gallery.patch(card.id, { liked: card.liked, likes: card.likes }); onSay(error.message); }
  }
  async function remove() {
    setBusy(true);
    try {
      await catalogAPI(`/widgets/${removing.id}`, { method: 'DELETE' });
      gallery.drop(removing.id);
      forgetPublished(removing.id);
      onSay(t('Удалено из мастерской: {name}', { name: removing.name }));
      setRemoving(null);
    } catch (error) { onSay(error.message); } finally { setBusy(false); }
  }
  const own = query.trim() ? [] : gallery.own;
  const first = gallery.items === null;
  return <>
    {own.length > 0 && <><span className="kz-sub">{t('Мои отправленные')}</span>
      {own.map((card) => <WorkshopCard key={card.id} card={card} onPick={onPick} onAdd={onAdd} onSave={onSave} onLike={like} onDelete={setRemoving}/>)}</>}
    {(own.length > 0 || first || gallery.items.length > 0) && <span className="kz-sub">{sort === 'new' ? t('Новые') : t('Популярные')}</span>}
    {first && [0, 1, 2, 3].map((i) => <span key={i} className="kz-wk-card is-empty" aria-hidden="true"><span className="kz-wk-pv"/></span>)}
    {gallery.items?.map((card) => <WorkshopCard key={card.id} card={card} onPick={onPick} onAdd={onAdd} onSave={onSave} onLike={like} onDelete={setRemoving}/>)}
    {gallery.hasMore && <button ref={end} type="button" className="kz-tile is-new kz-wk-more" disabled={gallery.loading} onClick={gallery.more}>
      <Icon name={gallery.loading ? 'loader' : 'chevronRight'}/><b>{gallery.loading ? t('Загружаем…') : t('Ещё')}</b><small>{t('{shown} из {total}', { shown: gallery.items.length, total: gallery.total })}</small></button>}
    {gallery.error && <p className="kz-shelf-empty kz-wk-error"><Icon name="alert" size={16}/>{gallery.error} <button type="button" className="kz-ghostbtn" onClick={gallery.reload}>{t('Попробовать ещё раз')}</button></p>}
    {!first && !gallery.error && !gallery.items.length && query.trim() && <p className="kz-shelf-empty">{t('В мастерской нет виджетов с «{query}» в названии.', { query: query.trim() })}</p>}
    {!first && !query.trim() && <button type="button" className="kz-tile is-new kz-create" onClick={onCreate}><Icon name="edit"/><b>{t('Собрать свой')}</b><small>{t('и опубликовать в мастерскую')}</small></button>}
    {!first && !gallery.error && !gallery.items.length && !query.trim() && <p className="kz-shelf-empty kz-wk-empty"><b>{t('В мастерской пока пусто')}</b>
      {t('Собери свой виджет и опубликуй его: после проверки он появится здесь, и его смогут добавить в меню другие пользователи.')}</p>}
    {removing && <Modal title={t('Удалить из мастерской?')} icon="trash" tone="danger" onClose={() => !busy && setRemoving(null)}>
      <div className="catalog-confirm"><p>{removing.status === 'approved' ? t('«{name}» пропадёт из мастерской: его больше не найдут и не добавят в меню. У тех, кто уже добавил, он останется.', { name: removing.name })
        : t('«{name}» больше не будет ждать проверки.', { name: removing.name })} {t('В «Моих виджетах» и в меню этого браузера он останется.')}</p>
        <div className="catalog-actions"><button type="button" className="catalog-button" disabled={busy} onClick={() => setRemoving(null)}>{t('Оставить')}</button>
          <button type="button" className="catalog-button danger" disabled={busy} onClick={remove}><Icon name="trash"/>{t('Удалить')}</button></div></div>
    </Modal>}
  </>;
}
