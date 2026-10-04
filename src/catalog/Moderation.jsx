import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CATALOG_TAGS } from '../../scripts/catalog-document.mjs';
import { catalogAPI, CATALOG_PATH } from './api.js';
import { Icon, Notice, useCatalogConfig } from './Common.jsx';
import { useAccount } from './Account.jsx';
import GridPreview from './GridPreview.jsx';
import ArtModeration from './ArtModeration.jsx';
import BackgroundModeration from './BackgroundModeration.jsx';
import { Queue, reasonNote, StaffRole, useQueue } from './ModerationQueue.jsx';
import { CompareStage, MetaFields, metaBy, ReportsAlert, ReviewLayout, SimilarAlert } from './AdminReview.jsx';
import { creatorText } from './Creator.jsx';
import AdminJournal from './AdminJournal.jsx';
const AdminStats = lazy(() => import('./AdminStats.jsx'));
const AdminUsers = lazy(() => import('./AdminUsers.jsx'));
import './admin.css';
// Guides bring their reader and styles: loaded with their section and «Входящие».
const GuideModeration = lazy(() => import('./GuideModeration.jsx'));
const AdminInbox = lazy(() => import('./AdminInbox.jsx'));

// The admin panel (redone on 2026-10-02 to be quicker to use): a menu of sections with what waits in
// each, «Входящие» — everything waiting for a decision in one list, oldest first — and «Журнал» of who
// decided what. A review keeps its decision on top (src/catalog/AdminReview.jsx), keys do the usual:
// ↑ ↓ the list, A approve, R turn down, H hide. The server checks the Telegram account on every
// /admin request; these screens only spare everyone else from an empty page. A moderator
// (server/moderators.mjs, 2026-10-04) gets only «Сетки», «Готовые арты», «Фоны» and «Гайды» waiting for a decision.
export default function Moderation() {
  const auth = useAccount();
  if (auth.loading) return <p role="status">Проверяем доступ…</p>;
  if (!auth.user) return <section className="catalog-empty"><h1>Админка</h1><p>Доступна только администраторам и модераторам GridStudio. Войди через Telegram.</p>
    <button className="catalog-button primary" onClick={() => auth.requestLogin('Войди через Telegram, чтобы открыть админку.')}><Icon name="telegram"/>Войти через Telegram</button></section>;
  if (!auth.admin && !auth.moderator) return <section className="catalog-empty"><h1>Нет доступа</h1><p>Админка доступна только администраторам и модераторам GridStudio.</p>
    <a className="catalog-button" href={CATALOG_PATH}>В мастерскую</a></section>;
  return <StaffRole.Provider value={auth.admin ? 'admin' : 'moderator'}><AdminPanel auth={auth}/></StaffRole.Provider>;
}

const VIEWS = [['inbox', 'Входящие', 'bell'], ['works', 'Сетки', 'grid'], ['arts', 'Готовые арты', 'art'], ['backgrounds', 'Фоны', 'brush'], ['guides', 'Гайды', 'guides'], ['stats', 'Статистика', 'gauge'], ['users', 'Пользователи', 'user'], ['journal', 'Журнал', 'history']];
const MODERATOR_VIEWS = ['works', 'arts', 'backgrounds', 'guides'];

function AdminPanel({ auth }) {
  const { config } = useCatalogConfig();
  const moderator = !auth.admin, views = moderator ? VIEWS.filter(([id]) => MODERATOR_VIEWS.includes(id)) : VIEWS;
  const [view, setView] = useState(() => { const value = new URLSearchParams(location.search).get('moderate'); return views.some(([id]) => id === value) ? value : views[0][0]; });
  const [summary, setSummary] = useState(null), [tick, setTick] = useState(0), [busy, setBusy] = useState(false);
  // The panel fills the window under the site's header, like an app: the lists scroll inside it and a
  // review fits on one screen (src/catalog/admin.css).
  const box = useRef(null), [offset, setOffset] = useState(150);
  useLayoutEffect(() => {
    const measure = () => { if (box.current) setOffset(Math.round(box.current.getBoundingClientRect().top + scrollY) + 16); };
    measure(); addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, []);
  const denied = error => { if (error.status === 401 || error.status === 403) auth.refresh().catch(() => {}); };
  useEffect(() => { catalogAPI('/admin/summary').then(setSummary, denied); }, [tick]);
  const changed = () => setTick(x => x + 1);
  const show = value => { const url = new URL(location.href); url.searchParams.set('moderate', value === 'inbox' ? '' : value); url.searchParams.delete('filter'); history.replaceState(history.state, '', url); setView(value); };
  // A moderator's counts are what waits for their decision; reports are the admins'.
  const c = summary?.counts, waiting = c ? (moderator ? { works: c.works.pending, arts: c.arts.pending, backgrounds: c.backgrounds.pending, guides: c.guides.pending }
    : { works: c.works.pending + c.works.reports, arts: c.arts.pending, backgrounds: c.backgrounds.pending + c.backgrounds.reports, guides: c.guides.pending + c.guides.reports }) : {};
  waiting.inbox = c ? waiting.works + waiting.arts + waiting.backgrounds + waiting.guides : 0;
  async function pause() {
    setBusy(true);
    try { setSummary({ ...summary, ...(await catalogAPI('/admin/settings', { method: 'PATCH', body: { paused: !summary.paused } })) }); } catch (error) { denied(error); } finally { setBusy(false); }
  }
  return <div className="admin" ref={box} style={{ '--admin-offset': `${offset}px` }}>
    <header className="admin-top"><div><h1>Модерация</h1><p>{moderator ? 'Одобряй или отклоняй сетки, арты, фоны и гайды на проверке. ' : ''}Проверяй именно ту версию, которая будет опубликована. Решения отражаются и на карточках в Telegram.</p></div>
      {!moderator && <div className="admin-top-actions">
        <button type="button" className={`admin-pause${summary?.paused ? ' is-paused' : ''}`} role="switch" aria-checked={summary ? !summary.paused : undefined} disabled={busy || !summary} onClick={pause}
          title={summary?.paused ? 'Новые заявки не принимаются. Нажми, чтобы открыть приём.' : 'Нажми, чтобы временно не принимать новые заявки.'}><i/>{summary?.paused ? 'Приём приостановлен' : 'Приём открыт'}</button>
        {config?.moderationUrl && <a className="catalog-button" href={config.moderationUrl} target="_blank" rel="noreferrer"><Icon name="telegramLogo"/>Топик модерации<Icon name="external" size={14}/></a>}
      </div>}</header>
    {summary?.paused && <Notice>Новые заявки, обновления, арты, фоны и гайды временно не принимаются. Просмотр и скачивание работают.</Notice>}
    <div className="admin-layout">
      <nav className="admin-nav" aria-label="Разделы админки">
        {views.map(([id, label, icon]) => <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => show(id)}>
          <Icon name={icon}/><span>{label}</span>{waiting[id] ? <span className="catalog-count">{waiting[id]}</span> : null}</button>)}
        <div className="admin-keys"><strong>Клавиши</strong>
          <p><kbd>↑</kbd><kbd>↓</kbd> по списку</p><p><kbd>A</kbd> {moderator ? 'одобрить' : 'одобрить, оставить'}</p><p><kbd>R</kbd> отклонить{moderator ? '' : <> · <kbd>H</kbd> скрыть</>}</p><p><kbd>Ctrl</kbd> + <kbd>Enter</kbd> подтвердить</p></div>
      </nav>
      <div className="admin-main" key={view}>
        {view === 'inbox' ? <Suspense fallback={<p role="status">Собираем входящие…</p>}><AdminInbox denied={denied} onChanged={changed} counts={c}/></Suspense>
          : view === 'works' ? <WorkModeration denied={denied} onChanged={changed}/>
          : view === 'arts' ? <ArtModeration denied={denied} onChanged={changed}/>
          : view === 'backgrounds' ? <BackgroundModeration denied={denied} onChanged={changed}/>
          : view === 'guides' ? <Suspense fallback={<p role="status">Загружаем гайды…</p>}><GuideModeration denied={denied} onChanged={changed}/></Suspense>
          : view === 'stats' ? <Suspense fallback={<p role="status">Загружаем статистику…</p>}><AdminStats denied={denied}/></Suspense>
          : view === 'users' ? <Suspense fallback={<p role="status">Загружаем пользователей…</p>}><AdminUsers denied={denied}/></Suspense>
          : <AdminJournal denied={denied}/>}
      </div>
    </div>
  </div>;
}

const TABS = [['pending', 'На проверке'], ['reports', 'Жалобы'], ['published', 'В мастерской'], ['blocked', 'Заблокированы']];

export const workEntry = work => <><strong>{work.title}</strong><span>{creatorText(work, 'Без подписи')}</span>
  <small>{[work.published && work.status === 'pending' && 'обновление', work.similar?.length && `похожа: ${Math.round(work.similar[0].score * 100)}%`,
    work.tags.join(', ') || 'Без тегов', `${work.stats.categories} категорий`, work.reports.length && `жалоб: ${work.reports.length}`, work.featured && 'в подборке'].filter(Boolean).join(' · ')}</small></>;

function WorkModeration({ denied, onChanged }) {
  const asked = new URLSearchParams(location.search).get('filter');
  const queue = useQueue('works', TABS.some(([id]) => id === asked) ? asked : 'pending', denied, onChanged), { item } = queue;
  return <Queue queue={queue} tabs={TABS} label="Сетки" entry={workEntry}>
    {/* A fresh form per version and after its title, author or tags were saved. */}
    {item && <WorkReview key={[item.id, item.revision, item.title, item.author, item.credit, item.tags.join(), item.status, item.blocked, item.featured, item.reports.length].join('\n')} item={item} queue={queue}/>}
  </Queue>;
}

// A grid on one screen: the title, author and tags to correct on top with the decision, the numbers in
// one line, the grid fitted below. An update compares «Было» with «Стало», a near copy (server/similarity.mjs)
// the published work it looks like with this one — both by a line dragged across the grid.
export function WorkReview({ item, queue: { busy, run } }) {
  const tags = item.tags.filter(tag => CATALOG_TAGS.includes(tag));
  const by = metaBy(item);
  const [blockIP, setBlockIP] = useState(false), [meta, setMeta] = useState({ title: item.title, [by]: item[by] || '', tags }), [compare, setCompare] = useState(item.published && item.status === 'pending' ? 'published' : '');
  const send = (action, extra = {}) => catalogAPI(`/admin/works/${item.id}`, { method: 'POST', body: { action, revision: item.revision, ...extra } });
  const changed = meta.title !== item.title || meta[by] !== (item[by] || '') || [...meta.tags].sort().join() !== [...tags].sort().join();
  const decide = (action, extra = {}) => run(async () => { if (changed && action === 'approve') await send('edit', meta); await send(action, extra); });
  const pending = item.status === 'pending', reports = item.reports.length > 0;
  const match = item.similar?.find(other => other.work === compare);
  const status = item.blocked ? ['Скрыта и ограничена', 'bad'] : pending ? [item.published ? 'Обновление на проверке' : 'На проверке', 'wait'] : [item.featured ? 'В мастерской · в подборке' : 'В мастерской', 'ok'];
  const actions = item.blocked ? [{ id: 'unblock', label: 'Разблокировать', icon: 'unlock', tone: 'primary', key: 'a', run: () => decide('unblock') }] : [
    ...(pending ? [
      { id: 'approve', label: changed ? 'Сохранить и одобрить' : 'Одобрить', icon: 'check', tone: 'primary', key: 'a', run: () => decide('approve') },
      { id: 'reject', label: 'Отклонить', icon: 'close', key: 'r', reason: { kind: 'works', required: true, original: item.similar?.[0] ? new URL(`${CATALOG_PATH}?id=${item.similar[0].work}`, location.href).href : '' }, run: reason => decide('reject', { reason }) }] : []),
    ...(reports ? [{ id: 'resolve', label: 'Оставить, жалобы проверены', icon: 'check', tone: pending ? '' : 'primary', key: pending ? '' : 'a', run: () => decide('resolve') }] : []),
    ...(item.published && !pending ? [{ id: 'feature', label: item.featured ? 'Убрать из подборки' : 'В подборку', icon: 'sparkle', run: () => decide('feature', { featured: !item.featured }) }] : []),
    ...(item.published || reports ? [{ id: 'block', label: 'Скрыть', icon: 'eyeOff', tone: 'danger', key: 'h', hint: 'Скрыть из мастерской и на 7 дней ограничить отправку из этого браузера',
      reason: { required: true, confirm: 'Скрыть и ограничить', placeholder: 'Причина — автор увидит её в «Моих публикациях»' },
      extra: <><label className="catalog-check"><input type="checkbox" checked={blockIP} onChange={e => setBlockIP(e.target.checked)}/>Также ограничить IP на 7 дней</label>
        <p className="catalog-muted">Работа пропадёт из мастерской, браузер автора 7 дней не сможет отправлять сетки. Одним IP могут пользоваться разные люди — IP ограничивай только при массовом спаме.</p></>,
      run: reason => decide('block', { reason, blockIP }) }] : [])];
  const fields = item.blocked ? null : <MetaFields title={meta.title} author={meta[by]} credit={by === 'credit'} onTitle={title => setMeta({ ...meta, title })} onAuthor={value => setMeta({ ...meta, [by]: value })}
    changed={changed} busy={busy} onSave={() => run(() => send('edit', meta))}
    tags={<div className="catalog-tags admin-tags" role="group" aria-label="Теги, до трёх">{CATALOG_TAGS.map(tag =>
      <button type="button" key={tag} aria-pressed={meta.tags.includes(tag)} disabled={!meta.tags.includes(tag) && meta.tags.length >= 3}
        onClick={() => setMeta({ ...meta, tags: meta.tags.includes(tag) ? meta.tags.filter(value => value !== tag) : [...meta.tags, tag] })}>{tag}</button>)}</div>}/>;
  return <ReviewLayout badge={item.published && pending ? 'Сетка · обновление' : 'Сетка'} title={item.title} fields={fields} busy={busy} actions={actions}
    status={{ text: status[0] + reasonNote(item.reason), tone: status[1] }}
    tools={item.published && pending ? <button type="button" className="catalog-button" aria-pressed={compare === 'published'} onClick={() => setCompare(value => (value === 'published' ? '' : 'published'))}>
      <Icon name="replace"/>{compare === 'published' ? 'Скрыть сравнение' : 'Было / стало'}</button> : null}
    meta={<>{item.stats.heroes} героев · {(item.stats.symbols || 0).toLocaleString('ru-RU')} символов · {item.stats.categories.toLocaleString('ru-RU')} категорий · работ из этого браузера: {item.related}{item.linked ? ` · автор в Telegram: ${creatorText(item)}, бот сообщит о решении` : ''}
      {item.published && !item.blocked ? <> · <a href={`${CATALOG_PATH}?id=${item.id}`} target="_blank" rel="noreferrer">открыть в мастерской<Icon name="external" size={13}/></a></> : null}</>}
    alert={<><SimilarAlert items={item.similar} active={compare} onCompare={setCompare} link={match => `${CATALOG_PATH}?id=${match.work}`}/><ReportsAlert reports={item.reports}/></>}>
    {compare === 'published' ? <CompareStage left={<GridPreview grid={item.published.grid} title="Опубликованная версия" large/>} right={<GridPreview grid={item.grid} title={item.title} large/>}
      labels={['Было — опубликовано', 'Стало — на проверке']}/>
      : match ? <CompareStage left={<GridPreview id={match.work} revision={match.revision} title={match.title} large/>} right={<GridPreview grid={item.grid} title={item.title} large/>}
        labels={[`${match.published < item.created ? 'Оригинал' : 'Похожая'}: «${match.title}»`, pending ? 'На проверке' : 'Эта сетка']}/>
      : <GridPreview grid={item.grid} title={item.title} large/>}
  </ReviewLayout>;
}
