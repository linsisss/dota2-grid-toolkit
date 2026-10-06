import { Fragment, Suspense, lazy, useEffect, useState } from 'react';
import { Spot } from '../Spot.jsx';
import { Brand, Icon, Notice } from '../catalog/Common.jsx';
import { AccountButton, AccountProvider, useAccount } from '../catalog/Account.jsx';
import { CATALOG_PATH, STUDIO_PATH } from '../catalog/api.js';
import { CommunityLink } from '../Community.jsx';
import { VersionButton } from '../ChangelogButton.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { useLanguage } from '../useLanguage.js';
import { useAppMotion } from '../useAppMotion.js';
import { GUIDE_CATEGORIES } from '../../scripts/guide-document.mjs';
import { t } from '../../scripts/i18n.mjs';
import { GUIDES_PATH, guidesAPI } from './api.js';
import GuidePage from './GuidePage.jsx';
import { GuideCard } from './GuideParts.jsx';
// The editor (TipTap) loads only for writing, not for reading.
const GuideWrite = lazy(() => import('./GuideWrite.jsx'));

// «Гайды» (asked for on 2026-10-02): the community's guides — the list (/guides, ?category=, ?mine),
// a guide (?id=), writing one (?write, ?write=<id>). Reading is open to all; writing, likes and
// comments need Telegram. The rules and the moderation are server/guides.mjs.
function GuideList({ mine: startMine }) {
  const auth = useAccount();
  const params = new URLSearchParams(location.search);
  const [category, setCategory] = useState(() => params.get('category') || ''), [mine, setMine] = useState(startMine);
  const [sort, setSort] = useState('new'), [query, setQuery] = useState(''), [data, setData] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [extra, setExtra] = useState({ page: 0, items: [] });
  useEffect(() => { document.title = `${t('Гайды')} — GridStudio`; });
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setExtra({ page: 0, items: [] });
    const timer = setTimeout(async () => {
      try {
        if (mine) setData(auth.user ? await guidesAPI('/mine', { signal: controller.signal }) : { items: [] });
        else setData(await guidesAPI(`?${new URLSearchParams({ category, q: query, sort })}`, { signal: controller.signal }));
      } catch (e) { if (!controller.signal.aborted) { setError(e.message); setData({ items: [] }); } }
    }, query ? 220 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, sort, query, mine, retry, auth.user?.id]);
  const choose = (next, own = false) => {
    const url = new URL(location.href);
    url.searchParams.delete('category'); url.searchParams.delete('mine');
    if (own) url.searchParams.set('mine', '1'); else if (next) url.searchParams.set('category', next);
    history.replaceState(history.state, '', url);
    setData(null); setMine(own); setCategory(next);
  };
  async function more() {
    try { const next = await guidesAPI(`?${new URLSearchParams({ category, q: query, sort, page: String(extra.page + 1) })}`); setExtra((current) => ({ page: current.page + 1, items: [...current.items, ...next.items] })); }
    catch (e) { setError(e.message); }
  }
  const write = () => (auth.user ? location.assign(`${GUIDES_PATH}?write`) : auth.requestLogin(t('Войди, чтобы написать гайд.')));
  const items = data ? [...data.items, ...extra.items] : null;
  return <>
    <header className="catalog-heading"><div><div className="catalog-title"><span className="win-icon page-icon" aria-hidden="true"><Icon name="guides"/></span><h1>{mine ? t('Мои гайды') : t('Гайды')}</h1></div>
      <p>{mine ? t('Черновики, гайды на проверке и опубликованные.') : t('Как оформить Dota 2 под себя — от тех, кто уже разобрался. Пиши свои: после проверки гайд увидят все.')}</p></div>
      <div className="catalog-actions"><button className="catalog-button primary" onClick={write}><Icon name="penLine"/>{t('Написать гайд')}</button></div></header>
    <div className="catalog-toolbar">
      <div className="catalog-tabs" aria-label={t('Разделы')}>
        <button aria-pressed={!mine && !category} onClick={() => choose('')}>{t('Все')}</button>
        {GUIDE_CATEGORIES.map((item) => <button key={item.id} aria-pressed={!mine && category === item.id} onClick={() => choose(item.id)}>{t(item.title)}{data?.categories?.[item.id] ? <span className="catalog-count">{data.categories[item.id]}</span> : null}</button>)}
        <button aria-pressed={mine} onClick={() => choose('', true)}>{t('Мои гайды')}</button>
      </div>
      {!mine && <div className="guide-toolbar-end">
        <div className="catalog-tabs is-small" aria-label={t('Порядок')}><button aria-pressed={sort === 'new'} onClick={() => setSort('new')}>{t('Новые')}</button><button aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>{t('Популярные')}</button></div>
        <label className="catalog-search"><Icon name="search"/><input aria-label={t('Поиск гайдов')} placeholder={t('Название или текст')} value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)}/></label>
      </div>}
    </div>
    {error && <Notice error report>{error}<button className="catalog-link" onClick={() => setRetry((x) => x + 1)}>{t('Попробовать снова')}</button></Notice>}
    {mine && !auth.user && !auth.loading ? <section className="catalog-empty"><h2>{t('Войди, чтобы увидеть свои гайды')}</h2><p>{t('Гайды привязаны к аккаунту: так их можно писать и править с любого устройства.')}</p>
      <button className="catalog-button primary" onClick={() => auth.requestLogin()}><Icon name="user"/>{t('Войти')}</button></section>
    : !items ? <p role="status">{t('Загружаем гайды…')}</p>
    : items.length ? <>
      <section className="guide-grid" aria-label={mine ? t('Мои гайды') : t('Гайды')}>{items.map((item, i) => <Fragment key={item.id}><GuideCard item={item} mine={mine}/>{i === 0 && !mine && <Spot place="guides" className="is-in-grid"/>}</Fragment>)}</section>
      {!mine && items.length < data.total && <button className="catalog-button guide-more" onClick={more}>{t('Показать ещё')}</button>}
    </> : <section className="catalog-empty guide-empty"><Icon name="guides" size={30}/>
      <h2>{mine ? t('Ты ещё не писал гайдов') : query ? t('Ничего не нашлось') : t('Здесь пока пусто')}</h2>
      <p>{mine ? t('Расскажи, как ты оформил профиль или минипрофиль: с картинками, видео и файлами.') : query ? t('Попробуй другой запрос.') : t('Стань первым: напиши гайд, и после проверки его увидят все.')}</p>
      {!query && <button className="catalog-button primary" onClick={write}><Icon name="penLine"/>{t('Написать гайд')}</button>}</section>}
  </>;
}

function GuidesShell() {
  const auth = useAccount();
  const params = new URLSearchParams(location.search);
  const id = params.get('id'), write = params.has('write');
  return <div className="catalog-page guides-page">
    <header className="catalog-nav"><Brand/><nav>{(auth.admin || auth.moderator) && <a href={`${CATALOG_PATH}?moderate=guides`}>{auth.admin ? 'Админка' : 'Модерация'}</a>}<CommunityLink/>
      <a href={CATALOG_PATH}>{t('Мастерская')}</a><a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow"/></a><AccountButton/></nav></header>
    <main className="catalog-main">{write ? <Suspense fallback={<p role="status">{t('Открываем редактор…')}</p>}><GuideWrite id={params.get('write') || ''}/></Suspense> : id ? <GuidePage id={id} review={params.get('review') || ''}/> : <GuideList mine={params.has('mine')}/>}</main>
    <footer className="catalog-footer"><span>GridStudio</span><a href={GUIDES_PATH}>{t('Гайды')}</a><span className="catalog-footer-source"><a href="https://github.com/linsisss/dota2-grid-toolkit">GitHub</a><VersionButton/><LanguageSwitch/></span></footer>
  </div>;
}
// useLanguage: RU / EN redraws the page in place.
export default function GuidesApp() { useAppMotion(); useLanguage(); return <AccountProvider><GuidesShell/></AccountProvider>; }
