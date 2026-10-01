import { useEffect, useMemo, useState } from 'react';
import { CATALOG_TAGS, normalizeCatalogGrid } from '../../scripts/catalog-document.mjs';
import { Brand, Captcha, Icon, Modal, Notice, SegmentSwitch, Stats, useCatalogConfig } from './Common.jsx';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, EDITOR_PATH, RULES_PATH, STUDIO_PATH, downloadGrid, forgetWork, managementLink, ownedWorks, rememberWork } from './api.js';
import GridPreview from './GridPreview.jsx';
import { foreignNoticeable, foreignSample, gridForeignGlyphs } from '../../scripts/dota-rendering.mjs';
import { HideAdultButton, SensitiveArt } from './Sensitive.jsx';
import { AdminEditButton } from './AdminEdit.jsx';
import { InstallButton } from './InstallGuide.jsx';
import SubmissionForm from './SubmissionForm.jsx';
import Moderation from './Moderation.jsx';
import Rules from './Rules.jsx';
import OwnedPublications from './OwnedPublications.jsx';
import OwnedBackgrounds from './OwnedBackgrounds.jsx';
import { AccountProvider, AccountButton, LikeButton, SubscribeButton, useAccount } from './Account.jsx';
import { useLanguage } from '../useLanguage.js';
import { useAppMotion } from '../useAppMotion.js';
import { VersionButton } from '../ChangelogButton.jsx';
import { GridBackgroundSwitch } from './GridBackgroundSwitch.jsx';
import { BackgroundCard, BackgroundTagFilter, useBackgrounds } from './BackgroundGallery.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { locale, t, translateMessage } from '../../scripts/i18n.mjs';

// A report on a grid or (kind 'background') a menu background; the captcha, then the moderators.
function Report({ item, onClose, kind = 'grid' }) {
  const background = kind === 'background';
  const [reason, setReason] = useState(''), [captcha, setCaptcha] = useState(''), [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  const { config, error: configError } = useCatalogConfig();
  return <Modal title={background ? t('Пожаловаться на фон') : t('Пожаловаться на сетку')} onClose={onClose}><form className="catalog-report" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await catalogAPI(background ? `/backgrounds/${item.id}/report` : `/works/${item.id}/report`, { method: 'POST', body: { reason, captcha } }); setSent(true); }
    catch (error) { setError(error.message); setReset(x => x + 1); } finally { setBusy(false); }
  }}>{sent ? <><h3>{t('Жалоба отправлена')}</h3><p>{t('Модераторы проверят «{title}».', { title: item.title })}</p><button type="button" className="catalog-button" onClick={onClose}>{t('Закрыть')}</button></> : <>
    <label>{background ? t('Что не так с фоном «{title}»?', { title: item.title }) : t('Что не так с работой «{title}»?', { title: item.title })}<textarea required maxLength={500} rows={4} value={reason} onChange={e => setReason(e.target.value)} autoFocus/></label>
    <Captcha config={config} action="report" reset={reset} onToken={setCaptcha}/>{(error || configError) && <Notice error>{error || configError}</Notice>}
    <button className="catalog-button primary" disabled={busy || !config || !captcha}>{busy ? t('Отправляем…') : t('Отправить жалобу')}</button>
  </>}</form></Modal>;
}
function WorkDetail({ id, ownerToken, managing }) {
  const auth = useAccount();
  const [item, setItem] = useState(null), [error, setError] = useState(''), [editing, setEditing] = useState(false), [replacement, setReplacement] = useState(null);
  const [deleting, setDeleting] = useState(false), [deleted, setDeleted] = useState(false), [busy, setBusy] = useState(false), [report, setReport] = useState(false), [copied, setCopied] = useState(false);
  const foreign = useMemo(() => gridForeignGlyphs(item?.grid), [item?.grid]);
  async function reload() { setError(''); try { setItem(await catalogAPI(managing ? `/manage/${id}` : `/works/${id}`, { token: ownerToken })); } catch (e) { setError(e.message); } }
  useEffect(() => { const c = new AbortController(); setItem(null); setError(''); catalogAPI(managing ? `/manage/${id}` : `/works/${id}`, { token: ownerToken, signal: c.signal }).then(value => {
    // A secret management link opened in this browser also lets the editor update the draft.
    if (managing && ownerToken) rememberWork({ id, token: ownerToken, title: value.title });
    setItem(value);
  }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [id, ownerToken, managing, auth.user?.id]);
  if (deleted) return <section className="catalog-empty"><h1>{t('Публикация удалена')}</h1><p>{t('Она больше не доступна в мастерской. Файлы в редакторе не изменены.')}</p><a className="catalog-button" href={CATALOG_PATH}>{t('Вернуться в мастерскую')}</a></section>;
  if (!item) return <section className="catalog-empty">{error ? <><Notice error>{error}</Notice>{managing && !auth.user && <button className="catalog-button" onClick={() => auth.requestLogin()}>{t('Войти через Telegram')}</button>}<button className="catalog-button" onClick={reload}>{t('Попробовать снова')}</button></> : <p role="status">{t('Загружаем сетку…')}</p>}</section>;
  return <>
    <a className="catalog-back" href={managing ? `${CATALOG_PATH}?mine=1` : CATALOG_PATH}><Icon name="back"/>{managing ? t('Мои публикации') : t('Все сетки')}</a>
    <section className="catalog-detail"><div>{managing ? <GridPreview grid={item.grid} title={item.title} large/> : <SensitiveArt item={item}><GridPreview grid={item.grid} title={item.title} large/></SensitiveArt>}
      <div className="catalog-preview-caption"><p className="catalog-muted">{t('Превью 1193 × 593. Шрифты и портреты в игре могут отличаться.')}</p>{!managing && <HideAdultButton/>}<GridBackgroundSwitch/></div></div>
      <div className="catalog-detail-info"><div className="catalog-tags">{item.tags.map(tag => <span key={tag}>{t(tag)}</span>)}</div><h1>{item.title}</h1>
        <p className="catalog-author">{item.author || t('Без подписи')}<span>{new Date(item.updated).toLocaleDateString(locale)}</span></p><Stats stats={item.stats}/>
        {item.stats.categories > 2000 && <Notice>{t('Более 2 000 категорий. На некоторых компьютерах сетка может заметно снизить FPS или вызвать вылет Dota.')}</Notice>}
        {foreignNoticeable(foreign) && <Notice>{t('{count} символов из {total} нет в шрифте Dota ({sample}). Игра рисует их шрифтом Windows, поэтому в Dota они выглядят иначе, чем на превью, и на разных компьютерах по-разному.', { count: foreign.count.toLocaleString(locale), total: foreign.total.toLocaleString(locale), sample: foreignSample(foreign) })}</Notice>}
        {managing ? <>
          <Notice>{item.blocked ? t('Публикация заблокирована') : { pending: t('На проверке'), approved: t('Опубликована'), rejected: t('Нужны изменения') }[item.status]}{item.status === 'pending' && item.published && t('. В мастерской пока видна прежняя версия.')}{item.reason && <>. {translateMessage(item.reason)}</>}</Notice>
          <a className={`catalog-button primary${item.blocked || !item.canEdit ? ' is-disabled' : ''}`} aria-disabled={item.blocked || !item.canEdit} href={item.blocked || !item.canEdit ? undefined : `${EDITOR_PATH}?catalog=${id}&manage=1`}>{t('Редактировать в редакторе')}<Icon name="edit"/></a>
          <button className="catalog-button" disabled={item.blocked || !item.canEdit} onClick={() => { setReplacement(null); setEditing(true); }}>{t('Изменить название, теги или JSON')}</button>
          {!item.linked && <><p className="catalog-muted">{item.status === 'pending' ? t('Привяжи сетку к Telegram: бот сообщит, когда её одобрят, а после публикации её можно будет менять.') : t('Для изменения опубликованной сетки привяжи её к Telegram.')} {t('Ссылка подтверждает, что сетка твоя.')}</p><button className="catalog-button" onClick={async () => { if (!auth.user) return auth.requestLogin(t('Войди, чтобы привязать сетку и редактировать её после публикации.')); try { await catalogAPI(`/manage/${id}/claim`, { method: 'POST', token: ownerToken, body: {} }); await reload(); } catch(e) { setError(e.message); } }}>{auth.user ? t('Привязать к моему Telegram') : t('Войти через Telegram')}</button></>}
          <button className="catalog-button" onClick={async () => { try { await navigator.clipboard.writeText(item.linked ? new URL(`${CATALOG_PATH}?id=${id}&manage=1`, location.href).href : managementLink(id, ownerToken)); setCopied(true); } catch { setError(t('Скопируй секретную ссылку из адресной строки.')); } }}>{copied ? t('Ссылка скопирована') : item.linked ? t('Скопировать ссылку на публикацию') : t('Скопировать ссылку управления')}</button>
          {item.published && !item.blocked && <a className="catalog-button" href={`${CATALOG_PATH}?id=${id}`}>{t('Открыть публичную страницу')}</a>}
          <p className="catalog-muted">{item.linked ? t('Управление доступно только из твоего Telegram-аккаунта.') : t('Секретная ссылка подтверждает владение сеткой. Сохрани её для привязки к Telegram.')}</p>
          <button className="catalog-link danger" onClick={() => setDeleting(true)}>{t('Удалить публикацию')}</button>
        </> : <><LikeButton item={item} onChange={value => setItem(current => ({...current,...value}))}/><SubscribeButton item={item} onChange={value => setItem(current => ({...current,...value}))}/><AdminEditButton item={item} onSaved={value => setItem(current => ({...current,...value}))}/>{item.mine && <a className="catalog-button" href={`${CATALOG_PATH}?id=${id}&manage=1`}>{t('Управлять публикацией')}</a>}<button className="catalog-button primary" onClick={() => downloadGrid(item.grid)}><Icon name="download"/>{t('Скачать грид')}</button><InstallButton item={item}/>
          <a className="catalog-button" href={`${EDITOR_PATH}?catalog=${id}`}>{t('Открыть в редакторе')}<Icon name="arrow"/></a><p className="catalog-muted">{t('В редакторе сетка добавится к твоему файлу после подтверждения.')}</p>
          <button className="catalog-link" onClick={() => setReport(true)}>{t('Пожаловаться')}</button></>}
        {error && <Notice error>{error}</Notice>}
      </div></section>
    {editing && <Modal title={t('Изменить публикацию')} size="lg" onClose={() => { setEditing(false); reload(); }}>
      <div className="catalog-replace"><label className="catalog-button"><Icon name="plus"/>{t('Заменить сетку из JSON')}<input type="file" accept=".json,application/json" className="catalog-file" onChange={async event => {
        const file = event.target.files[0]; if (!file) return;
        try { if (file.size > 2_000_000) throw new Error(t('Файл больше 2 МБ.')); setReplacement(normalizeCatalogGrid(JSON.parse((await file.text()).replace(/^\uFEFF/, ''))).grid); setError(''); }
        // The check is the server's own (catalog-document.mjs): its Russian messages are in the server dictionary.
        catch (e) { setError(translateMessage(e.message)); } event.target.value = '';
      }}/></label><span className="catalog-muted">{t('Файл должен содержать ровно одну сетку.')}</span>{error && <Notice error>{error}</Notice>}</div>
      <SubmissionForm key={replacement ? 'replacement' : item.revision} grid={replacement || item.grid} existing={item} token={ownerToken}/>
    </Modal>}
    {deleting && <Modal title={t('Удалить публикацию?')} onClose={() => setDeleting(false)}><div className="catalog-confirm"><p>{t('«{title}» исчезнет из мастерской вместе с заявкой на обновление. Это действие нельзя отменить.', { title: item.title })}</p>{error && <Notice error>{error}</Notice>}
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setDeleting(false)}>{t('Оставить')}</button><button className="catalog-button danger" disabled={busy} onClick={async () => {
        setBusy(true); try { await catalogAPI(`/manage/${id}`, { method: 'DELETE', token: ownerToken }); forgetWork(id); setDeleted(true); } catch (e) { setError(e.message); } finally { setBusy(false); }
      }}>{busy ? t('Удаляем…') : t('Удалить')}</button></div></div></Modal>}
    {report && <Report item={item} onClose={() => setReport(false)}/>}
  </>;
}
// «Сетки» or «Фоны» next to the title; ?backgrounds keeps the choice in the address.
const KINDS = () => [['grids', t('Сетки')], ['backgrounds', t('Фоны')]];
// Menu backgrounds users shared (server/catalog-backgrounds.mjs); «Использовать» opens one in the builder.
// «Мои публикации» (?backgrounds&mine=1) are the author's own, with statuses, as for grids.
function Backgrounds({ mine, onMine, auth }) {
  const [tag, setTag] = useState(''), [query, setQuery] = useState(''), [sort, setSort] = useState('popular'), [report, setReport] = useState(null);
  const { items, total, error, more, update } = useBackgrounds({ tag, query, sort });
  const pick = (value) => { setSort(value); onMine(false); };
  return <>
    <div className="catalog-toolbar"><div className="catalog-tabs" aria-label={t('Подборка')}><button aria-pressed={!mine && sort === 'popular'} onClick={() => pick('popular')}>{t('Популярные')}</button><button aria-pressed={!mine && sort === 'new'} onClick={() => pick('new')}>{t('Новые')}</button><button aria-pressed={mine} onClick={() => onMine(true)}>{t('Мои публикации')}</button></div>
      {!mine && <label className="catalog-search"><Icon name="search"/><input aria-label={t('Поиск фонов')} placeholder={t('Название или автор')} value={query} maxLength={80} onChange={e => setQuery(e.target.value)}/></label>}</div>
    {mine ? <OwnedBackgrounds auth={auth}/> : <>
    <BackgroundTagFilter value={tag} onChange={setTag}/>
    {error && <Notice error>{error}</Notice>}
    {!items ? !error && <p role="status">{t('Загружаем фоны…')}</p> : items.length ? <>
      <div className="catalog-results"><span>{t('Фонов: {count}', { count: total })}{sort === 'popular' && ` · ${t('По числу лайков')}`}</span><HideAdultButton/></div>
      <section className="background-grid" aria-label={t('Фоны пользователей')}>{items.map(item => <BackgroundCard key={item.id} item={item}><div className="background-card-actions">
        <LikeButton item={item} path={`/backgrounds/${item.id}/like`} onChange={value => update(item.id, value)}/>
        <button className="catalog-icon" aria-label={t('Пожаловаться на фон {title}', { title: item.title })} title={t('Пожаловаться')} onClick={() => setReport(item)}><Icon name="flag"/></button>
        <a className="catalog-button" href={`${CUSTOMIZE_PATH}?background=${item.id}`}>{t('Использовать')}</a></div></BackgroundCard>)}</section>
      {items.length < total && <button className="catalog-button background-more" onClick={more}>{t('Показать ещё')}</button>}
    </> : <section className="catalog-empty"><h2>{query || tag ? t('Таких фонов пока нет') : t('Здесь появятся фоны пользователей')}</h2><p>{query || tag ? `${t('Попробуй другой запрос.')} ` : ''}{t('Собери фон из картинки, GIF или видео и нажми «Опубликовать в мастерскую».')}</p><a className="catalog-button" href={CUSTOMIZE_PATH}>{t('Собрать фон')}</a></section>}
    </>}
    {report && <Report kind="background" item={report} onClose={() => setReport(null)}/>}
  </>;
}
function Gallery() {
  const auth = useAccount();
  const [kind, setKind] = useState(() => new URLSearchParams(location.search).has('backgrounds') ? 'backgrounds' : 'grids');
  const [query, setQuery] = useState(''), [tag, setTag] = useState(''), [sort, setSort] = useState('popular'), [mine, setMine] = useState(() => new URLSearchParams(location.search).has('mine')), [page, setPage] = useState(0);
  const [data, setData] = useState(null), [privateItems, setPrivateItems] = useState([]), [error, setError] = useState(''), [retry, setRetry] = useState(0), [loading, setLoading] = useState(true);
  const owned = ownedWorks().filter(x => !privateItems.some(item => item.id === x.id));
  useEffect(() => {
    if (kind !== 'grids') return;
    const controller = new AbortController(); setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        if (mine) { setPrivateItems(auth.user ? (await catalogAPI('/mine', {signal:controller.signal})).items : []); }
        else setData(await catalogAPI('/works?' + new URLSearchParams({q:query,tag,sort,page:String(page)}), {signal:controller.signal}));
      } catch(e) { if (!controller.signal.aborted) setError(e.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, query && !mine ? 220 : 0);
    return () => {clearTimeout(timer);controller.abort();};
  }, [kind,query,tag,sort,mine,page,retry,auth.user?.id]);
  function showMine(value) {
    const url = new URL(location.href);
    if (value) url.searchParams.set('mine', '1'); else url.searchParams.delete('mine');
    history.replaceState(history.state, '', url.href.replace(/backgrounds=(&|$)/, 'backgrounds$1')); setMine(value);
  }
  function showKind(value) {
    const url = new URL(location.href); url.searchParams.delete('mine');
    if (value === 'backgrounds') url.searchParams.set('backgrounds', ''); else url.searchParams.delete('backgrounds');
    history.replaceState(history.state, '', url.href.replace(/backgrounds=(&|$)/, 'backgrounds$1')); setMine(false); setKind(value);
  }
  const backgrounds = kind === 'backgrounds';
  const filter = (fn,value) => {fn(value);setPage(0);showMine(false);};
  // Preserve the mounted previews and the reader's position after a like.
  // Popularity order is fetched again on the next filter/page visit.
  const updateLike = (id, value) => setData(current => current && ({
    ...current, items: current.items.map(item => item.id === id ? { ...item, ...value } : item)
  }));
  return <>
    <header className="catalog-heading"><div><div className="catalog-title"><h1>{mine ? t('Мои публикации') : t('Мастерская')}</h1>{!mine && <SegmentSwitch label={t('Что показать')} value={kind} options={KINDS()} onChange={showKind}/>}</div>
      <p>{mine ? (backgrounds ? t('Опубликованные фоны и заявки на проверке.') : t('Опубликованные сетки и заявки на проверке.')) : backgrounds ? t('Фоны главного меню от пользователей. Возьми готовый или собери свой.') : t('Найди свой вариант. Открой в редакторе и сделай по-своему.')}</p></div>
      <div className="catalog-actions">{backgrounds ? <a className="catalog-button primary" href={CUSTOMIZE_PATH}><Icon name="plus"/>{t('Собрать фон')}</a> : <>{!mine && <InstallButton/>}<a className="catalog-button primary" href={`${EDITOR_PATH}?new=1`}><Icon name="plus"/>{t('Создать сетку')}</a></>}</div></header>
    <div key={kind} className="workshop-switch-view">{backgrounds ? <Backgrounds key={auth.user?.id || 'guest'} mine={mine} onMine={showMine} auth={auth}/> : <>
    <div className="catalog-toolbar"><div className="catalog-tabs" aria-label={t('Подборка')}><button aria-pressed={!mine && sort==='popular'} onClick={()=>filter(setSort,'popular')}>{t('Популярные')}</button><button aria-pressed={!mine && sort==='new'} onClick={()=>filter(setSort,'new')}>{t('Новые')}</button><button aria-pressed={mine} onClick={()=>showMine(true)}>{t('Мои публикации')}</button></div>
      {!mine && <label className="catalog-search"><Icon name="search"/><input aria-label={t('Поиск сеток')} placeholder={t('Название или автор')} value={query} maxLength={80} onChange={e=>filter(setQuery,e.target.value)}/></label>}</div>
    {!mine && <div className="catalog-tags catalog-filters"><button aria-pressed={!tag} onClick={()=>filter(setTag,'')}>{t('Все теги')}</button>{CATALOG_TAGS.map(value=><button key={value} aria-pressed={tag===value} onClick={()=>filter(setTag,tag===value?'':value)}>{t(value)}</button>)}</div>}
    {error && <Notice error>{error}<button className="catalog-link" onClick={()=>setRetry(x=>x+1)}>{t('Попробовать снова')}</button></Notice>}
    {loading ? <p role="status">{t('Загружаем сетки…')}</p> : mine ? <OwnedPublications items={privateItems} guestItems={owned} auth={auth}/> : data?.items.length ? <>
      <div className="catalog-results"><span>{t('Сеток: {count}', { count: data.total })}{sort==='popular' && ` · ${t('По числу лайков')}`}</span><HideAdultButton/><GridBackgroundSwitch/></div>
      <section className="catalog-grid" aria-label={t('Работы пользователей')}>{data.items.map(item=><article key={item.id} className="catalog-card"><SensitiveArt item={item}><a className="catalog-card-art" href={CATALOG_PATH+'?id='+item.id}><GridPreview id={item.id} revision={item.revision} title={item.title}/></a></SensitiveArt>
        <div className="catalog-card-info"><div><a href={CATALOG_PATH+'?id='+item.id}><h2>{item.title}</h2></a><p>{item.author||t('Без подписи')}</p></div><div className="catalog-card-actions"><AdminEditButton item={item} compact onSaved={value=>updateLike(item.id,value)}/><LikeButton item={item} onChange={value=>updateLike(item.id,value)}/></div></div>
        <div className="catalog-card-meta"><span>{t('Символов: {symbols} · категорий: {categories}', { symbols: (item.stats.symbols || 0).toLocaleString(locale), categories: item.stats.categories.toLocaleString(locale) })}</span><span>{item.tags.map(tag => t(tag)).join(', ')}</span></div></article>)}</section>
      {data.total>12 && <nav className="catalog-pagination" aria-label={t('Страницы мастерской')}><button className="catalog-button" disabled={!page} onClick={()=>setPage(x=>x-1)}>{t('Назад')}</button><span>{page+1} / {Math.ceil(data.total/12)}</span><button className="catalog-button" disabled={(page+1)*12>=data.total} onClick={()=>setPage(x=>x+1)}>{t('Дальше')}</button></nav>}
    </> : !error && <section className="catalog-empty"><h2>{query||tag?t('Таких сеток пока нет'):t('Мастерская начинается с твоей сетки')}</h2><p>{query||tag?t('Попробуй другой запрос.'):t('Создай сетку в редакторе и отправь её на проверку.')}</p><a className="catalog-button" href={STUDIO_PATH}>{t('Открыть студию')}</a></section>}
    </>}</div>
  </>;
}
// useLanguage: RU / EN redraws the whole workshop in place.
export default function CatalogApp() { useAppMotion(); useLanguage(); return <AccountProvider><CatalogShell/></AccountProvider>; }
function CatalogShell() {
  const auth = useAccount();
  const params = new URLSearchParams(location.search), id = params.get('id'), moderation = params.has('moderate'), rules = params.has('rules');
  const ownerToken = new URLSearchParams(location.hash.slice(1)).get('manage');
  const managing = !!ownerToken || params.has('manage');
  return <div className="catalog-page"><header className="catalog-nav"><Brand/><nav>{auth.admin && <a href={`${CATALOG_PATH}?moderate`}>Админка</a>}<a href={STUDIO_PATH}>{t('Студия')}<Icon name="arrow"/></a><AccountButton/></nav></header><main className="catalog-main">{moderation ? <Moderation/> : rules ? <Rules/> : id ? <WorkDetail id={id} ownerToken={ownerToken} managing={managing}/> : <Gallery/>}</main><footer className="catalog-footer"><span>GridStudio</span><a href={RULES_PATH}>{t('Правила мастерской')}</a><span className="catalog-footer-source"><a href="https://github.com/linsisss/dota2-grid-toolkit">GitHub</a><VersionButton/><LanguageSwitch/></span></footer></div>;
}
