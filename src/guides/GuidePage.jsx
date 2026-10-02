import { useEffect, useState } from 'react';
import { Icon, Modal, Notice } from '../catalog/Common.jsx';
import { LikeButton, useAccount } from '../catalog/Account.jsx';
import { CATALOG_PATH, catalogAPI } from '../catalog/api.js';
import { quickReasons } from '../catalog/ModerationQueue.jsx';
import ReportDialog from '../catalog/ReportDialog.jsx';
import { t } from '../../scripts/i18n.mjs';
import { GUIDES_PATH, guidesAPI } from './api.js';
import GuideContent, { guideHeadings } from './GuideContent.jsx';
import GuideComments from './GuideComments.jsx';
import { Author, ago, day, guideLink, guideState, section, ModdingTag } from './GuideParts.jsx';

// A guide to read (?id=): the published version for everyone; its author and admins also see the
// version they are writing or that waits (?review=draft), moderators the one a Telegram card links
// (?review=<token>). The text has the middle to itself (asked for on 2026-10-02): the section, the
// author and the counts on the left, likes, sharing, editing or a report and the contents on the
// right; on narrow screens they go back above the text. Comments under it.
export function ReportGuide({ guide, comment = null, onClose }) {
  return <ReportDialog kind={comment ? 'comment' : 'guide'} onClose={onClose} title={comment ? t('Пожаловаться на комментарий') : t('Пожаловаться на гайд')}
    question={comment ? t('Что не так с комментарием?') : t('Что не так с гайдом?')}
    send={(reason) => guidesAPI(`/${guide}/report`, { method: 'POST', body: { reason, comment } })}/>;
}

function Share({ id }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = new URL(guideLink(id), location.href).href;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt(t('Ссылка на гайд'), url); }
  }
  return <button className="catalog-button" onClick={share}><Icon name={copied ? 'check' : 'link'}/>{copied ? t('Ссылка скопирована') : t('Поделиться')}</button>;
}

// Who wrote it and when: the left column on wide screens, under the title on narrow ones.
function Byline({ guide }) {
  return <Author author={guide.author}><small>{guide.published ? day(guide.published) : t('ещё не опубликован')}</small>
    {guide.updated && guide.published && guide.updated - guide.published > 3_600_000 && <small>{t('обновлён {when}', { when: ago(guide.updated) })}</small>}</Author>;
}

// The guide's contents from its headings, the one being read lit (wide screens, two headings or more).
function Contents({ guide }) {
  const items = guideHeadings(guide.doc), [current, setCurrent] = useState('');
  // The last heading that reached the top of the window is the one being read.
  useEffect(() => {
    if (items.length < 2) return;
    let frame = 0;
    const find = () => { frame = 0; const above = items.filter((item) => document.getElementById(item.id)?.getBoundingClientRect().top < 140); setCurrent(above.at(-1)?.id || items[0].id); };
    const soon = () => { if (!frame) frame = requestAnimationFrame(find); };
    find();
    addEventListener('scroll', soon, { passive: true });
    return () => { cancelAnimationFrame(frame); removeEventListener('scroll', soon); };
  }, [guide.revision]);
  if (items.length < 2) return null;
  return <nav className="guide-contents" aria-label={t('Содержание')}><strong>{t('Содержание')}</strong>
    <ol>{items.map((item) => <li key={item.id} className={`is-h${item.level}`}><a href={`#${item.id}`} aria-current={current === item.id ? 'location' : undefined}
      onClick={(event) => { event.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(history.state, '', `#${item.id}`); }}>{item.text || t('Без названия')}</a></li>)}</ol></nav>;
}

// Admins' tools on the page itself (asked for on 2026-10-02): correct the guide (published at once,
// src/guides/GuideWrite.jsx), publish or turn down a waiting version, hide, bring back, delete, and the
// admin panel. Like the admin panel, Russian only. The server checks the admin on every request.
function AdminTools({ guide, onChanged }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ask, setAsk] = useState(''), [reason, setReason] = useState('');
  const run = async (request, after = onChanged) => {
    setBusy(true); setError('');
    try { await request(); setAsk(''); setReason(''); after(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const decide = (action, revision) => run(() => catalogAPI(`/admin/guides/${revision}`, { method: 'POST', body: { action, reason } }));
  const waiting = guide.status === 'pending' && !guide.public;
  const hidden = guide.guideStatus === 'hidden';
  return <section className="guide-admin" aria-label="Модерация">
    <strong>Модерация</strong>
    {!guide.mine && <a className="catalog-button" href={`${GUIDES_PATH}?write=${guide.id}`}><Icon name="penLine"/>Редактировать</a>}
    {waiting && <><button className="catalog-button primary" disabled={busy} onClick={() => decide('approve', guide.revision)}><Icon name="check"/>Опубликовать</button>
      <button className="catalog-button" disabled={busy} onClick={() => setAsk('reject')}><Icon name="close"/>Отклонить</button></>}
    {!waiting && guide.draft?.status === 'pending' && <a className="catalog-button" href={`${GUIDES_PATH}?id=${guide.id}&review=draft`}><Icon name="clock"/>Правки на проверке</a>}
    {guide.guideStatus === 'approved' && guide.publicRevision && <button className="catalog-button" disabled={busy} onClick={() => setAsk('hide')}><Icon name="eyeOff"/>Скрыть</button>}
    {hidden && guide.publicRevision && <button className="catalog-button" disabled={busy} onClick={() => decide('restore', guide.publicRevision)}><Icon name="eye"/>Вернуть в «Гайды»</button>}
    <button className="catalog-button" aria-pressed={!!guide.modding} disabled={busy} title="Автор поставить пометку может, а снять — только модератор"
      onClick={() => run(() => catalogAPI(`/admin/guides/${guide.id}/modding`, { method: 'POST', body: { modding: !guide.modding } }))}>
      <span className="guide-modding-mark" aria-hidden="true">!</span>{guide.modding ? 'Снять пометку «модификация»' : 'Пометить: модификация файлов'}</button>
    {!guide.mine && <button className="catalog-button guide-delete" disabled={busy} onClick={() => setAsk('delete')}><Icon name="trash"/>Удалить</button>}
    <a className="guide-admin-link" href={`${CATALOG_PATH}?moderate=guides`}>Админка<Icon name="external" size={13}/></a>
    {error && <Notice error>{error}</Notice>}
    {ask === 'reject' && <Modal title="Отклонить версию?" icon="close" tone="danger" lead="Автор увидит причину в «Моих гайдах» и в сообщении от бота." onClose={() => setAsk('')}>
      <div className="catalog-confirm"><div className="catalog-tags" role="group" aria-label="Быстрые причины">{quickReasons('guides').map(([name, text]) =>
        <button type="button" key={name} aria-pressed={reason === text} onClick={() => setReason(reason === text ? '' : text)}>{name}</button>)}</div>
        <textarea aria-label="Причина отказа" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}/>
        <div className="catalog-actions"><button className="catalog-button" onClick={() => setAsk('')}>Отмена</button>
          <button className="catalog-button danger" disabled={busy || !reason.trim()} onClick={() => decide('reject', guide.revision)}>Отклонить</button></div></div></Modal>}
    {ask === 'hide' && <Modal title="Скрыть гайд?" icon="eyeOff" tone="danger" lead="Он пропадёт из «Гайдов»; вернуть можно здесь же или в админке." onClose={() => setAsk('')}>
      <div className="catalog-confirm"><label>Причина <span className="catalog-muted">необязательно</span><textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}/></label>
        <div className="catalog-actions"><button className="catalog-button" onClick={() => setAsk('')}>Отмена</button>
          <button className="catalog-button danger" disabled={busy} onClick={() => decide('hide', guide.publicRevision)}>Скрыть</button></div></div></Modal>}
    {ask === 'delete' && <Modal title="Удалить чужой гайд?" icon="trash" tone="danger" lead="Гайд, его версии, комментарии, лайки и файлы удалятся навсегда. Скрыть его можно без удаления." onClose={() => setAsk('')}>
      <div className="catalog-confirm"><div className="catalog-actions"><button className="catalog-button" onClick={() => setAsk('')}>Оставить</button>
        <button className="catalog-button danger" disabled={busy} onClick={() => run(() => guidesAPI(`/${guide.id}?admin=1`, { method: 'DELETE' }), () => location.assign(GUIDES_PATH))}>Удалить</button></div></div></Modal>}
  </section>;
}

export default function GuidePage({ id, review }) {
  const auth = useAccount();
  const [guide, setGuide] = useState(null), [error, setError] = useState(''), [reporting, setReporting] = useState(false), [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    guidesAPI(`/${id}${review ? `?review=${encodeURIComponent(review)}` : ''}`, { signal: controller.signal }).then(setGuide, (e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id, review, auth.user?.id, reload]);
  useEffect(() => { if (guide) document.title = `${guide.title} — ${t('Гайды')} — GridStudio`; });
  if (error) return <section className="catalog-empty guide-empty"><Icon name="guides" size={30}/><h1>{t('Гайд не найден')}</h1><p>{error}</p><a className="catalog-button" href={GUIDES_PATH}>{t('Все гайды')}</a></section>;
  if (!guide) return <p role="status">{t('Открываем гайд…')}</p>;
  // The author and admins see the version's state: hidden, waiting, turned down, a draft.
  const state = (guide.mine || auth.admin) && guide.status ? guideState(guide.guideStatus === 'hidden' ? { status: 'hidden', reason: guide.reason }
    : { status: guide.public ? 'approved' : guide.status, reason: guide.reason, draft: guide.public ? guide.draft : { status: guide.status, reason: guide.reason } }) : null;
  async function remove() {
    setBusy(true);
    try { await guidesAPI(`/${id}`, { method: 'DELETE' }); location.assign(`${GUIDES_PATH}?mine=1`); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  const update = (value) => setGuide((current) => ({ ...current, ...value }));
  const actions = <>
    {guide.public && <LikeButton item={guide} path={`/guides/${id}/like`} ownLabel={t('Свой гайд лайкнуть нельзя')} onChange={update}/>}
    {guide.public && <Share id={id}/>}
    {guide.mine && <a className="catalog-button" href={`${GUIDES_PATH}?write=${id}`}><Icon name="penLine"/>{t('Редактировать')}</a>}
    {guide.mine && <button className="catalog-button guide-delete" title={t('Удалить гайд')} aria-label={t('Удалить гайд')} onClick={() => setDeleting(true)}><Icon name="trash"/><span>{t('Удалить')}</span></button>}
    {guide.public && !guide.mine && <button className="catalog-button guide-report" title={t('Пожаловаться на гайд')} aria-label={t('Пожаловаться на гайд')}
      onClick={() => (auth.user ? setReporting(true) : auth.requestLogin(t('Войди через Telegram, чтобы пожаловаться.')))}><Icon name="flag"/><span>{t('Пожаловаться')}</span></button>}
  </>;
  const back = <a className="guide-back" href={GUIDES_PATH}><Icon name="back" size={16}/>{t('Все гайды')}</a>, chip = <span className="guide-chip">{section(guide.category)}</span>;
  return <div className="guide-layout">
    <aside className="guide-rail is-left"><div className="guide-rail-sticky">
      {back}{chip}
      <div className="guide-rail-author"><Byline guide={guide}/></div>
      {guide.public && <dl className="guide-rail-stats"><div><dt>{t('Лайки')}</dt><dd><Icon name="heart" size={15}/>{guide.likes}</dd></div>
        <div><dt>{t('Комментарии')}</dt><dd><a href="#guideComments"><Icon name="comment" size={15}/>{guide.comments}</a></dd></div></dl>}
    </div></aside>
    <article className="guide-article">
      <div className="guide-compact">{back}{chip}</div>
      {state && (!guide.public || guide.draft) && <div className={`guide-banner is-${state.tone}`}><Icon name={state.icon} size={17}/>
        <span>{guide.public ? state.text : review && !guide.mine ? t('Версия на проверке — её видят только модераторы.') : state.text}</span>
        {guide.mine && guide.public && guide.draft && <a href={`${GUIDES_PATH}?id=${id}&review=draft`}>{t('Посмотреть правки')}</a>}
        {guide.mine && !guide.public && <a href={`${GUIDES_PATH}?write=${id}`}>{t('Редактировать')}</a>}</div>}
      <h1 className="guide-title">{guide.title || t('Без названия')}</h1>
      {guide.modding && <ModdingTag/>}
      <div className="guide-compact guide-compact-meta"><Byline guide={guide}/><div className="guide-actions">{actions}</div>{auth.admin && <AdminTools guide={guide} onChanged={() => setReload((n) => n + 1)}/>}</div>
      <GuideContent doc={guide.doc} media={guide.media}/>
      {guide.public && <GuideComments guide={guide} onCount={(comments) => update({ comments })}/>}
    </article>
    <aside className="guide-rail is-right"><div className="guide-rail-sticky">
      <div className="guide-actions is-column">{actions}</div>
      {auth.admin && <AdminTools guide={guide} onChanged={() => setReload((n) => n + 1)}/>}
      <Contents guide={guide}/>
    </div></aside>
    {reporting && <ReportGuide guide={id} onClose={() => setReporting(false)}/>}
    {deleting && <Modal title={t('Удалить гайд?')} icon="trash" tone="danger" onClose={() => setDeleting(false)} lead={t('Гайд, его комментарии, лайки и файлы удалятся навсегда.')}>
      <div className="catalog-confirm"><div className="catalog-actions"><button className="catalog-button" onClick={() => setDeleting(false)}>{t('Оставить')}</button>
        <button className="catalog-button danger" disabled={busy} onClick={remove}>{busy ? t('Удаляем…') : t('Удалить')}</button></div></div></Modal>}
  </div>;
}
