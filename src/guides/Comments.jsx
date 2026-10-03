import { useEffect, useRef, useState } from 'react';
import { Icon, Notice } from '../catalog/Common.jsx';
import { useAccount } from '../catalog/Account.jsx';
import { GUIDE_LIMITS } from '../../scripts/guide-document.mjs';
import { t, tn } from '../../scripts/i18n.mjs';
import { Author, ago } from './GuideParts.jsx';

// Comments (asked for on 2026-10-02 under guides, on 2026-10-03 under grids and backgrounds): published
// at once, threads oldest first, 50 at a time. Replies sit under the comment that started their thread,
// one step in; a reply to a reply names whom it answers. The commenter, the author of what is commented
// and admins delete; others report. Addresses in a comment become links (never markup: the text is
// plain). `api`: load(offset) → { items, more, total }, add({ body, reply }) → item, remove(id);
// `Report`: the report window for a comment ({ comment, onClose }); `id`: what is commented (reloads);
// `authorLabel`: the crown's words by the comments of what is commented's author («Автор гайда»). A link
// to #comment-<id> (the bot's messages about comments) scrolls to that comment and lights it up.
const LINK = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
const linked = (text) => text.split(LINK).map((part, i) => (i % 2 ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc">{part}</a> : part));

function Comment({ item, nested, onReply, onRemove, onReport, flash, authorLabel }) {
  const [confirm, setConfirm] = useState(false);
  if (item.deleted) return <div id={`comment-${item.id}`} className="guide-comment is-deleted"><p>{t('Комментарий удалён.')}</p></div>;
  // Under its thread a reply to the thread's first comment needs no «в ответ».
  const answers = item.reply && !(nested && item.reply.id === item.thread);
  return <div id={`comment-${item.id}`} className={`guide-comment${flash ? ' is-new' : ''}`}>
    <Author author={item.author} crown={item.byAuthor ? authorLabel : ''}><small>{ago(item.created)}</small></Author>
    {answers && <a className="guide-comment-reply" href={`#comment-${item.reply.id}`}><Icon name="reply" size={13}/>{item.reply.name ? t('в ответ {name}', { name: item.reply.name }) : t('в ответ на удалённый')}</a>}
    <p className="guide-comment-body">{linked(item.body)}</p>
    <div className="guide-comment-actions">
      <button type="button" onClick={() => onReply(item)}>{t('Ответить')}</button>
      {item.removable && (confirm ? <><button type="button" className="is-danger" onClick={() => onRemove(item)}>{t('Точно удалить')}</button><button type="button" onClick={() => setConfirm(false)}>{t('Отмена')}</button></>
        : <button type="button" onClick={() => setConfirm(true)}>{t('Удалить')}</button>)}
      {!item.mine && <button type="button" onClick={() => onReport(item)}>{t('Пожаловаться')}</button>}
    </div>
  </div>;
}

// The loaded comments as threads: first comments in order, each with its replies. A reply whose first
// comment is not loaded stands alone; a deleted comment shows only while it holds replies.
function threads(items) {
  const known = new Set(items.map((item) => item.id)), replies = new Map(), roots = [];
  for (const item of items) {
    if (item.thread && known.has(item.thread)) { if (!item.deleted) replies.set(item.thread, [...(replies.get(item.thread) || []), item]); }
    else roots.push(item);
  }
  return roots.filter((item) => !item.deleted || replies.get(item.id)?.length).map((item) => ({ item, replies: replies.get(item.id) || [] }));
}

export default function Comments({ id, api, Report, total: initial = 0, onCount, authorLabel = t('Автор') }) {
  const auth = useAccount();
  const [items, setItems] = useState(null), [more, setMore] = useState(false), [total, setTotal] = useState(initial), [error, setError] = useState('');
  const [text, setText] = useState(''), [reply, setReply] = useState(null), [busy, setBusy] = useState(false), [report, setReport] = useState(null), [fresh, setFresh] = useState(0);
  const field = useRef(null), loaded = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    api.load(0, controller.signal).then((data) => {
      loaded.current = data.items.length; setItems(data.items); setMore(data.more); setTotal(data.total);
      const linked = Number(/^#comment-(\d+)$/.exec(location.hash)?.[1]);
      if (linked && data.items.some((item) => item.id === linked)) { setFresh(linked); requestAnimationFrame(() => document.getElementById(`comment-${linked}`)?.scrollIntoView({ block: 'center' })); }
    }, (e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id, auth.user?.id]);
  useEffect(() => { onCount?.(total); }, [total]);
  async function loadMore() {
    try {
      const data = await api.load(loaded.current);
      loaded.current += data.items.length;
      setItems((current) => [...current, ...data.items.filter((item) => !current.some((row) => row.id === item.id))]); setMore(data.more);
    }
    catch (e) { setError(e.message); }
  }
  async function send(event) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const item = await api.add({ body: text, reply: reply?.id || null });
      setItems((current) => [...(current || []), item]); setTotal((n) => n + 1); setText(''); setReply(null); setFresh(item.id);
    } catch (e) { setError(e.message); if (e.status === 401) auth.requestLogin(); } finally { setBusy(false); }
  }
  async function remove(item) {
    try { await api.remove(item.id); setItems((current) => current.map((row) => (row.id === item.id ? { ...row, deleted: true, body: '' } : row))); setTotal((n) => n - 1); }
    catch (e) { setError(e.message); }
  }
  const answer = (item) => {
    if (!auth.user) return auth.requestLogin(t('Войди через Telegram, чтобы отвечать.'));
    setReply(item); field.current?.focus();
  };
  return <section className="guide-comments" aria-labelledby="guideComments">
    <h2 id="guideComments">{t('Комментарии')}{total ? <small>{total}</small> : null}</h2>
    {error && <Notice error>{error}</Notice>}
    {!items ? <p role="status">{t('Загружаем комментарии…')}</p> : threads(items).length ? <ol className="guide-comment-list">{threads(items).map(({ item, replies }) => {
      const props = { authorLabel, onReply: answer, onRemove: remove, onReport: (row) => (auth.user ? setReport(row) : auth.requestLogin(t('Войди через Telegram, чтобы пожаловаться.'))) };
      return <li key={item.id} className="guide-thread"><Comment item={item} flash={item.id === fresh} {...props}/>
        {replies.length > 0 && <ol className="guide-replies">{replies.map((row) => <li key={row.id}><Comment item={row} nested flash={row.id === fresh} {...props}/></li>)}</ol>}</li>;
    })}</ol>
      : <p className="guide-comments-empty">{t('Пока никто не написал — спроси или поблагодари автора.')}</p>}
    {more && <button className="catalog-button guide-more" onClick={loadMore}>{t('Показать ещё')}</button>}
    {auth.user ? <form className="guide-comment-form" onSubmit={send}>
      {reply && <p className="guide-comment-replying"><Icon name="reply" size={14}/>{t('Ответ {name}', { name: reply.author?.name || '' })}<button type="button" aria-label={t('Не отвечать')} onClick={() => setReply(null)}><Icon name="close" size={14}/></button></p>}
      <textarea ref={field} value={text} maxLength={GUIDE_LIMITS.comment} rows={3} placeholder={t('Напиши комментарий…')} aria-label={t('Комментарий')}
        onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send(event); }}/>
      <div className="guide-comment-send"><small>{text.length > GUIDE_LIMITS.comment - 200 ? t('Осталось: {count}', { count: tn(GUIDE_LIMITS.comment - text.length, ['символ', 'символа', 'символов'], ['character', 'characters']) }) : t('Ctrl + Enter — отправить')}</small>
        <button className="catalog-button primary" disabled={busy || !text.trim()}><Icon name="send"/>{busy ? t('Отправляем…') : t('Отправить')}</button></div>
    </form> : <div className="guide-comment-login"><p>{t('Комментировать можно после входа через Telegram.')}</p><button className="catalog-button" onClick={() => auth.requestLogin(t('Войди через Telegram, чтобы комментировать.'))}><Icon name="telegram"/>{t('Войти через Telegram')}</button></div>}
    {report && <Report comment={report.id} onClose={() => setReport(null)}/>}
  </section>;
}
