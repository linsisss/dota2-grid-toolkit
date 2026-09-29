import { useEffect, useState } from 'react';
import { CATALOG_TAGS, normalizeCatalogGrid } from '../../scripts/catalog-document.mjs';
import { Brand, Captcha, Icon, Modal, Notice, SegmentSwitch, Stats, useCatalogConfig } from './Common.jsx';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, EDITOR_PATH, RULES_PATH, STUDIO_PATH, downloadGrid, forgetWork, managementLink, ownedWorks, rememberWork } from './api.js';
import GridPreview from './GridPreview.jsx';
import { SensitiveArt } from './Sensitive.jsx';
import { AdminEditButton } from './AdminEdit.jsx';
import { InstallButton } from './InstallGuide.jsx';
import SubmissionForm from './SubmissionForm.jsx';
import Moderation from './Moderation.jsx';
import Rules from './Rules.jsx';
import OwnedPublications from './OwnedPublications.jsx';
import { AccountProvider, AccountButton, LikeButton, SubscribeButton, useAccount } from './Account.jsx';
import { useAppMotion } from '../useAppMotion.js';
import { GridBackgroundSwitch } from './GridBackgroundSwitch.jsx';
import { BackgroundCard, BackgroundTagFilter, useBackgrounds } from './BackgroundGallery.jsx';

// A report on a grid or (kind 'background') a menu background; the captcha, then the moderators.
function Report({ item, onClose, kind = 'grid' }) {
  const background = kind === 'background';
  const [reason, setReason] = useState(''), [captcha, setCaptcha] = useState(''), [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  const { config, error: configError } = useCatalogConfig();
  return <Modal title={background ? 'Пожаловаться на фон' : 'Пожаловаться на сетку'} onClose={onClose}><form className="catalog-report" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await catalogAPI(background ? `/backgrounds/${item.id}/report` : `/works/${item.id}/report`, { method: 'POST', body: { reason, captcha } }); setSent(true); }
    catch (error) { setError(error.message); setReset(x => x + 1); } finally { setBusy(false); }
  }}>{sent ? <><h3>Жалоба отправлена</h3><p>Модераторы проверят «{item.title}».</p><button type="button" className="catalog-button" onClick={onClose}>Закрыть</button></> : <>
    <label>{background ? `Что не так с фоном «${item.title}»?` : `Что не так с работой «${item.title}»?`}<textarea required maxLength={500} rows={4} value={reason} onChange={e => setReason(e.target.value)} autoFocus/></label>
    <Captcha config={config} action="report" reset={reset} onToken={setCaptcha}/>{(error || configError) && <Notice error>{error || configError}</Notice>}
    <button className="catalog-button primary" disabled={busy || !config || !captcha}>{busy ? 'Отправляем…' : 'Отправить жалобу'}</button>
  </>}</form></Modal>;
}
function WorkDetail({ id, ownerToken, managing }) {
  const auth = useAccount();
  const [item, setItem] = useState(null), [error, setError] = useState(''), [editing, setEditing] = useState(false), [replacement, setReplacement] = useState(null);
  const [deleting, setDeleting] = useState(false), [deleted, setDeleted] = useState(false), [busy, setBusy] = useState(false), [report, setReport] = useState(false), [copied, setCopied] = useState(false);
  async function reload() { setError(''); try { setItem(await catalogAPI(managing ? `/manage/${id}` : `/works/${id}`, { token: ownerToken })); } catch (e) { setError(e.message); } }
  useEffect(() => { const c = new AbortController(); setItem(null); setError(''); catalogAPI(managing ? `/manage/${id}` : `/works/${id}`, { token: ownerToken, signal: c.signal }).then(value => {
    // A secret management link opened in this browser also lets the editor update the draft.
    if (managing && ownerToken) rememberWork({ id, token: ownerToken, title: value.title });
    setItem(value);
  }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [id, ownerToken, managing, auth.user?.id]);
  if (deleted) return <section className="catalog-empty"><h1>Публикация удалена</h1><p>Она больше не доступна в мастерской. Файлы в редакторе не изменены.</p><a className="catalog-button" href={CATALOG_PATH}>Вернуться в мастерскую</a></section>;
  if (!item) return <section className="catalog-empty">{error ? <><Notice error>{error}</Notice>{managing && !auth.user && <button className="catalog-button" onClick={() => auth.requestLogin()}>Войти через Telegram</button>}<button className="catalog-button" onClick={reload}>Попробовать снова</button></> : <p role="status">Загружаем сетку…</p>}</section>;
  return <>
    <a className="catalog-back" href={managing ? `${CATALOG_PATH}?mine=1` : CATALOG_PATH}><Icon name="back"/>{managing ? 'Мои публикации' : 'Все сетки'}</a>
    <section className="catalog-detail"><div>{managing ? <GridPreview grid={item.grid} title={item.title} large/> : <SensitiveArt item={item}><GridPreview grid={item.grid} title={item.title} large/></SensitiveArt>}
      <div className="catalog-preview-caption"><p className="catalog-muted">Превью 1193 × 593. Шрифты и портреты в игре могут отличаться.</p><GridBackgroundSwitch/></div></div>
      <div className="catalog-detail-info"><div className="catalog-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div><h1>{item.title}</h1>
        <p className="catalog-author">{item.author || 'Без подписи'}<span>{new Date(item.updated).toLocaleDateString('ru-RU')}</span></p><Stats stats={item.stats}/>
        {item.stats.categories > 2000 && <Notice>Более 2 000 категорий. На некоторых компьютерах сетка может заметно снизить FPS или вызвать вылет Dota.</Notice>}
        {managing ? <>
          <Notice>{item.blocked ? 'Публикация заблокирована' : { pending: 'На проверке', approved: 'Опубликована', rejected: 'Нужны изменения' }[item.status]}{item.status === 'pending' && item.published && '. В мастерской пока видна прежняя версия.'}{item.reason && <>. {item.reason}</>}</Notice>
          <a className={`catalog-button primary${item.blocked || !item.canEdit ? ' is-disabled' : ''}`} aria-disabled={item.blocked || !item.canEdit} href={item.blocked || !item.canEdit ? undefined : `${EDITOR_PATH}?catalog=${id}&manage=1`}>Редактировать в редакторе<Icon name="edit"/></a>
          <button className="catalog-button" disabled={item.blocked || !item.canEdit} onClick={() => { setReplacement(null); setEditing(true); }}>Изменить название, теги или JSON</button>
          {!item.linked && <><p className="catalog-muted">{item.status === 'pending' ? 'Привяжи сетку к Telegram: бот сообщит, когда её одобрят, а после публикации её можно будет менять.' : 'Для изменения опубликованной сетки привяжи её к Telegram.'} Ссылка подтверждает, что сетка твоя.</p><button className="catalog-button" onClick={async () => { if (!auth.user) return auth.requestLogin('Войди, чтобы привязать сетку и редактировать её после публикации.'); try { await catalogAPI(`/manage/${id}/claim`, { method: 'POST', token: ownerToken, body: {} }); await reload(); } catch(e) { setError(e.message); } }}>{auth.user ? 'Привязать к моему Telegram' : 'Войти через Telegram'}</button></>}
          <button className="catalog-button" onClick={async () => { try { await navigator.clipboard.writeText(item.linked ? new URL(`${CATALOG_PATH}?id=${id}&manage=1`, location.href).href : managementLink(id, ownerToken)); setCopied(true); } catch { setError('Скопируй секретную ссылку из адресной строки.'); } }}>{copied ? 'Ссылка скопирована' : item.linked ? 'Скопировать ссылку на публикацию' : 'Скопировать ссылку управления'}</button>
          {item.published && !item.blocked && <a className="catalog-button" href={`${CATALOG_PATH}?id=${id}`}>Открыть публичную страницу</a>}
          <p className="catalog-muted">{item.linked ? 'Управление доступно только из твоего Telegram-аккаунта.' : 'Секретная ссылка подтверждает владение сеткой. Сохрани её для привязки к Telegram.'}</p>
          <button className="catalog-link danger" onClick={() => setDeleting(true)}>Удалить публикацию</button>
        </> : <><LikeButton item={item} onChange={value => setItem(current => ({...current,...value}))}/><SubscribeButton item={item} onChange={value => setItem(current => ({...current,...value}))}/><AdminEditButton item={item} onSaved={value => setItem(current => ({...current,...value}))}/>{item.mine && <a className="catalog-button" href={`${CATALOG_PATH}?id=${id}&manage=1`}>Управлять публикацией</a>}<button className="catalog-button primary" onClick={() => downloadGrid(item.grid)}><Icon name="download"/>Скачать грид</button><InstallButton item={item}/>
          <a className="catalog-button" href={`${EDITOR_PATH}?catalog=${id}`}>Открыть в редакторе<Icon name="arrow"/></a><p className="catalog-muted">В редакторе сетка добавится к твоему файлу после подтверждения.</p>
          <button className="catalog-link" onClick={() => setReport(true)}>Пожаловаться</button></>}
        {error && <Notice error>{error}</Notice>}
      </div></section>
    {editing && <Modal title="Изменить публикацию" size="lg" onClose={() => { setEditing(false); reload(); }}>
      <div className="catalog-replace"><label className="catalog-button"><Icon name="plus"/>Заменить сетку из JSON<input type="file" accept=".json,application/json" className="catalog-file" onChange={async event => {
        const file = event.target.files[0]; if (!file) return;
        try { if (file.size > 2_000_000) throw new Error('Файл больше 2 МБ.'); setReplacement(normalizeCatalogGrid(JSON.parse((await file.text()).replace(/^\uFEFF/, ''))).grid); setError(''); }
        catch (e) { setError(e.message); } event.target.value = '';
      }}/></label><span className="catalog-muted">Файл должен содержать ровно одну сетку.</span>{error && <Notice error>{error}</Notice>}</div>
      <SubmissionForm key={replacement ? 'replacement' : item.revision} grid={replacement || item.grid} existing={item} token={ownerToken}/>
    </Modal>}
    {deleting && <Modal title="Удалить публикацию?" onClose={() => setDeleting(false)}><div className="catalog-confirm"><p>«{item.title}» исчезнет из мастерской вместе с заявкой на обновление. Это действие нельзя отменить.</p>{error && <Notice error>{error}</Notice>}
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setDeleting(false)}>Оставить</button><button className="catalog-button danger" disabled={busy} onClick={async () => {
        setBusy(true); try { await catalogAPI(`/manage/${id}`, { method: 'DELETE', token: ownerToken }); forgetWork(id); setDeleted(true); } catch (e) { setError(e.message); } finally { setBusy(false); }
      }}>{busy ? 'Удаляем…' : 'Удалить'}</button></div></div></Modal>}
    {report && <Report item={item} onClose={() => setReport(false)}/>}
  </>;
}
// «Сетки» or «Фоны» next to the title; ?backgrounds keeps the choice in the address.
const KINDS = [['grids', 'Сетки'], ['backgrounds', 'Фоны']];
// Menu backgrounds users shared (server/catalog-backgrounds.mjs); «Использовать» opens one in the builder.
function Backgrounds() {
  const [tag, setTag] = useState(''), [query, setQuery] = useState(''), [sort, setSort] = useState('new'), [report, setReport] = useState(null);
  const { items, total, error, more, update } = useBackgrounds({ tag, query, sort });
  return <>
    <div className="catalog-toolbar"><div className="catalog-tabs" aria-label="Подборка"><button aria-pressed={sort === 'new'} onClick={() => setSort('new')}>Новые</button><button aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>Популярные</button></div>
      <label className="catalog-search"><Icon name="search"/><input aria-label="Поиск фонов" placeholder="Название или автор" value={query} maxLength={80} onChange={e => setQuery(e.target.value)}/></label></div>
    <BackgroundTagFilter value={tag} onChange={setTag}/>
    {error && <Notice error>{error}</Notice>}
    {!items ? !error && <p role="status">Загружаем фоны…</p> : items.length ? <>
      <div className="catalog-results"><span>Фонов: {total}{sort === 'popular' && ' · По числу лайков'}</span></div>
      <section className="background-grid" aria-label="Фоны пользователей">{items.map(item => <BackgroundCard key={item.id} item={item}><div className="background-card-actions">
        <LikeButton item={item} path={`/backgrounds/${item.id}/like`} onChange={value => update(item.id, value)}/>
        <button className="catalog-icon" aria-label={`Пожаловаться на фон ${item.title}`} title="Пожаловаться" onClick={() => setReport(item)}><Icon name="flag"/></button>
        <a className="catalog-button" href={`${CUSTOMIZE_PATH}?background=${item.id}`}>Использовать</a></div></BackgroundCard>)}</section>
      {items.length < total && <button className="catalog-button background-more" onClick={more}>Показать ещё</button>}
    </> : <section className="catalog-empty"><h2>{query || tag ? 'Таких фонов пока нет' : 'Здесь появятся фоны пользователей'}</h2><p>{query || tag ? 'Попробуй другой запрос. ' : ''}Собери фон из картинки, GIF или видео и нажми «Опубликовать в мастерскую».</p><a className="catalog-button" href={CUSTOMIZE_PATH}>Собрать фон</a></section>}
    {report && <Report kind="background" item={report} onClose={() => setReport(null)}/>}
  </>;
}
function Gallery() {
  const auth = useAccount();
  const [kind, setKind] = useState(() => new URLSearchParams(location.search).has('backgrounds') ? 'backgrounds' : 'grids');
  const [query, setQuery] = useState(''), [tag, setTag] = useState(''), [sort, setSort] = useState('new'), [mine, setMine] = useState(() => new URLSearchParams(location.search).has('mine')), [page, setPage] = useState(0);
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
    history.replaceState(history.state, '', url); setMine(value);
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
    <header className="catalog-heading"><div><div className="catalog-title"><h1>{mine ? 'Мои публикации' : 'Мастерская'}</h1>{!mine && <SegmentSwitch label="Что показать" value={kind} options={KINDS} onChange={showKind}/>}</div>
      <p>{mine ? 'Опубликованные сетки и заявки на проверке.' : backgrounds ? 'Фоны главного меню от пользователей. Возьми готовый или собери свой.' : 'Найди свой вариант. Открой в редакторе и сделай по-своему.'}</p></div>
      <div className="catalog-actions">{backgrounds ? <a className="catalog-button primary" href={CUSTOMIZE_PATH}><Icon name="plus"/>Собрать фон</a> : <>{!mine && <InstallButton/>}<a className="catalog-button primary" href={`${EDITOR_PATH}?new=1`}><Icon name="plus"/>Создать сетку</a></>}</div></header>
    <div key={kind} className="workshop-switch-view">{backgrounds ? <Backgrounds/> : <>
    <div className="catalog-toolbar"><div className="catalog-tabs" aria-label="Подборка"><button aria-pressed={!mine && sort==='new'} onClick={()=>filter(setSort,'new')}>Новые</button><button aria-pressed={!mine && sort==='popular'} onClick={()=>filter(setSort,'popular')}>Популярные</button><button aria-pressed={mine} onClick={()=>showMine(true)}>Мои публикации</button></div>
      {!mine && <label className="catalog-search"><Icon name="search"/><input aria-label="Поиск сеток" placeholder="Название или автор" value={query} maxLength={80} onChange={e=>filter(setQuery,e.target.value)}/></label>}</div>
    {!mine && <div className="catalog-tags catalog-filters"><button aria-pressed={!tag} onClick={()=>filter(setTag,'')}>Все теги</button>{CATALOG_TAGS.map(value=><button key={value} aria-pressed={tag===value} onClick={()=>filter(setTag,tag===value?'':value)}>{value}</button>)}</div>}
    {error && <Notice error>{error}<button className="catalog-link" onClick={()=>setRetry(x=>x+1)}>Повторить</button></Notice>}
    {loading ? <p role="status">Загружаем сетки…</p> : mine ? <OwnedPublications items={privateItems} guestItems={owned} auth={auth}/> : data?.items.length ? <>
      <div className="catalog-results"><span>Сеток: {data.total}{sort==='popular' && ' · По числу лайков'}</span><GridBackgroundSwitch/></div>
      <section className="catalog-grid" aria-label="Работы пользователей">{data.items.map(item=><article key={item.id} className="catalog-card"><SensitiveArt item={item}><a className="catalog-card-art" href={CATALOG_PATH+'?id='+item.id}><GridPreview id={item.id} revision={item.revision} title={item.title}/></a></SensitiveArt>
        <div className="catalog-card-info"><div><a href={CATALOG_PATH+'?id='+item.id}><h2>{item.title}</h2></a><p>{item.author||'Без подписи'}</p></div><div className="catalog-card-actions"><AdminEditButton item={item} compact onSaved={value=>updateLike(item.id,value)}/><LikeButton item={item} onChange={value=>updateLike(item.id,value)}/></div></div>
        <div className="catalog-card-meta"><span>Символов: {(item.stats.symbols || 0).toLocaleString('ru-RU')} · категорий: {item.stats.categories.toLocaleString('ru-RU')}</span><span>{item.tags.join(', ')}</span></div></article>)}</section>
      {data.total>12 && <nav className="catalog-pagination" aria-label="Страницы мастерской"><button className="catalog-button" disabled={!page} onClick={()=>setPage(x=>x-1)}>Назад</button><span>{page+1} / {Math.ceil(data.total/12)}</span><button className="catalog-button" disabled={(page+1)*12>=data.total} onClick={()=>setPage(x=>x+1)}>Дальше</button></nav>}
    </> : !error && <section className="catalog-empty"><h2>{query||tag?'Таких сеток пока нет':'Мастерская начинается с твоей сетки'}</h2><p>{query||tag?'Попробуй другой запрос.':'Создай сетку в редакторе и отправь её на проверку.'}</p><a className="catalog-button" href={STUDIO_PATH}>Открыть студию</a></section>}
    </>}</div>
  </>;
}
export default function CatalogApp() { useAppMotion(); return <AccountProvider><CatalogShell/></AccountProvider>; }
function CatalogShell() {
  const auth = useAccount();
  const params = new URLSearchParams(location.search), id = params.get('id'), moderation = params.has('moderate'), rules = params.has('rules');
  const ownerToken = new URLSearchParams(location.hash.slice(1)).get('manage');
  const managing = !!ownerToken || params.has('manage');
  return <div className="catalog-page"><header className="catalog-nav"><Brand/><nav>{auth.admin && <a href={`${CATALOG_PATH}?moderate`}>Админка</a>}<a href={STUDIO_PATH}>Студия<Icon name="arrow"/></a><AccountButton/></nav></header><main className="catalog-main">{moderation ? <Moderation/> : rules ? <Rules/> : id ? <WorkDetail id={id} ownerToken={ownerToken} managing={managing}/> : <Gallery/>}</main><footer className="catalog-footer"><span>GridStudio</span><a href={RULES_PATH}>Правила мастерской</a><a href="https://github.com/linsisss/dota2-grid-toolkit">GitHub</a></footer></div>;
}
