import { useEffect, useState } from 'react';
import { CATALOG_TAGS, normalizeCatalogGrid } from '../../scripts/catalog-document.mjs';
import { Brand, Captcha, Icon, Modal, Notice, Stats, useCatalogConfig } from './Common.jsx';
import { catalogAPI, CATALOG_PATH, EDITOR_PATH, downloadGrid, forgetWork, managementLink, ownedWorks } from './api.js';
import GridPreview from './GridPreview.jsx';
import SubmissionForm from './SubmissionForm.jsx';
import Moderation from './Moderation.jsx';
import OwnedPublications from './OwnedPublications.jsx';
import { AccountProvider, AccountButton, LikeButton, useAccount } from './Account.jsx';
import { useAppMotion } from '../useAppMotion.js';

function Report({ item, onClose }) {
  const [reason, setReason] = useState(''), [captcha, setCaptcha] = useState(''), [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  const { config, error: configError } = useCatalogConfig();
  return <Modal title="Пожаловаться на сетку" onClose={onClose}><form className="catalog-report" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await catalogAPI(`/works/${item.id}/report`, { method: 'POST', body: { reason, captcha } }); setSent(true); }
    catch (error) { setError(error.message); setReset(x => x + 1); } finally { setBusy(false); }
  }}>{sent ? <><h3>Жалоба отправлена</h3><p>Модераторы проверят «{item.title}».</p><button type="button" className="catalog-button" onClick={onClose}>Закрыть</button></> : <>
    <label>Что не так с работой «{item.title}»?<textarea required maxLength={500} rows={4} value={reason} onChange={e => setReason(e.target.value)} autoFocus/></label>
    <Captcha config={config} action="report" reset={reset} onToken={setCaptcha}/>{(error || configError) && <Notice error>{error || configError}</Notice>}
    <button className="catalog-button primary" disabled={busy || !config || !captcha}>{busy ? 'Отправляем…' : 'Отправить жалобу'}</button>
  </>}</form></Modal>;
}
function WorkDetail({ id, ownerToken, managing }) {
  const auth = useAccount();
  const [item, setItem] = useState(null), [error, setError] = useState(''), [editing, setEditing] = useState(false), [replacement, setReplacement] = useState(null);
  const [deleting, setDeleting] = useState(false), [deleted, setDeleted] = useState(false), [busy, setBusy] = useState(false), [report, setReport] = useState(false), [copied, setCopied] = useState(false);
  async function reload() { setError(''); try { setItem(await catalogAPI(managing ? `/manage/${id}` : `/works/${id}`, { token: ownerToken })); } catch (e) { setError(e.message); } }
  useEffect(() => { const c = new AbortController(); setItem(null); setError(''); catalogAPI(managing ? `/manage/${id}` : `/works/${id}`, { token: ownerToken, signal: c.signal }).then(setItem).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [id, ownerToken, managing, auth.user?.id]);
  if (deleted) return <section className="catalog-empty"><h1>Публикация удалена</h1><p>Она больше не доступна в каталоге. Файлы в редакторе не изменены.</p><a className="catalog-button" href={CATALOG_PATH}>Вернуться в каталог</a></section>;
  if (!item) return <section className="catalog-empty">{error ? <><Notice error>{error}</Notice>{managing && !auth.user && <button className="catalog-button" onClick={() => auth.requestLogin()}>Войти через Telegram</button>}<button className="catalog-button" onClick={reload}>Попробовать снова</button></> : <p role="status">Загружаем сетку…</p>}</section>;
  return <>
    <a className="catalog-back" href={managing ? `${CATALOG_PATH}?mine=1` : CATALOG_PATH}><Icon name="back"/>{managing ? 'Мои публикации' : 'Все сетки'}</a>
    <section className="catalog-detail"><div><GridPreview grid={item.grid} title={item.title} large/>
      <p className="catalog-muted catalog-preview-caption">Превью 1193 × 593. Шрифты и портреты в игре могут отличаться.</p></div>
      <div className="catalog-detail-info"><div className="catalog-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div><h1>{item.title}</h1>
        <p className="catalog-author">{item.author || 'Без подписи'}<span>{new Date(item.updated).toLocaleDateString('ru-RU')}</span></p><Stats stats={item.stats}/>
        {item.stats.categories > 2000 && <Notice>Более 2 000 категорий. На некоторых компьютерах сетка может заметно снизить FPS или вызвать вылет Dota.</Notice>}
        {managing ? <>
          <Notice>{item.blocked ? 'Публикация заблокирована' : { pending: 'На проверке', approved: 'Опубликована', rejected: 'Нужны изменения' }[item.status]}{item.status === 'pending' && item.published && '. В каталоге пока видна прежняя версия.'}{item.reason && <>. {item.reason}</>}</Notice>
          <button className="catalog-button primary" disabled={item.blocked || !item.canEdit} onClick={() => { setReplacement(null); setEditing(true); }}>Изменить публикацию</button>
          {!item.linked && <><p className="catalog-muted">Для изменения опубликованной сетки привяжи её к Telegram. Ссылка подтверждает, что сетка твоя.</p><button className="catalog-button" onClick={async () => { if (!auth.user) return auth.requestLogin('Войди, чтобы привязать сетку и редактировать её после публикации.'); try { await catalogAPI(`/manage/${id}/claim`, { method: 'POST', token: ownerToken, body: {} }); await reload(); } catch(e) { setError(e.message); } }}>{auth.user ? 'Привязать к моему Telegram' : 'Войти через Telegram'}</button></>}
          <button className="catalog-button" onClick={async () => { try { await navigator.clipboard.writeText(item.linked ? new URL(`${CATALOG_PATH}?id=${id}&manage=1`, location.href).href : managementLink(id, ownerToken)); setCopied(true); } catch { setError('Скопируй секретную ссылку из адресной строки.'); } }}>{copied ? 'Ссылка скопирована' : item.linked ? 'Скопировать ссылку на публикацию' : 'Скопировать ссылку управления'}</button>
          {item.published && !item.blocked && <a className="catalog-button" href={`${CATALOG_PATH}?id=${id}`}>Открыть публичную страницу</a>}
          <p className="catalog-muted">{item.linked ? 'Управление доступно только из твоего Telegram-аккаунта.' : 'Секретная ссылка подтверждает владение сеткой. Сохрани её для привязки к Telegram.'}</p>
          <button className="catalog-link danger" onClick={() => setDeleting(true)}>Удалить публикацию</button>
        </> : <><LikeButton item={item} onChange={value => setItem(current => ({...current,...value}))}/>{item.mine && <a className="catalog-button" href={`${CATALOG_PATH}?id=${id}&manage=1`}>Управлять публикацией</a>}<button className="catalog-button primary" onClick={() => downloadGrid(item.grid)}><Icon name="download"/>Скачать грид</button>
          <a className="catalog-button" href={`${EDITOR_PATH}?catalog=${id}`}>Открыть в редакторе<Icon name="arrow"/></a><p className="catalog-muted">В редакторе сетка добавится к твоему файлу после подтверждения.</p>
          <button className="catalog-link" onClick={() => setReport(true)}>Пожаловаться</button></>}
        {error && <Notice error>{error}</Notice>}
      </div></section>
    {editing && <Modal title="Изменить публикацию" onClose={() => { setEditing(false); reload(); }}>
      <div className="catalog-replace"><label className="catalog-button"><Icon name="plus"/>Заменить сетку из JSON<input type="file" accept=".json,application/json" className="catalog-file" onChange={async event => {
        const file = event.target.files[0]; if (!file) return;
        try { if (file.size > 2_000_000) throw new Error('Файл больше 2 МБ.'); setReplacement(normalizeCatalogGrid(JSON.parse((await file.text()).replace(/^\uFEFF/, ''))).grid); setError(''); }
        catch (e) { setError(e.message); } event.target.value = '';
      }}/></label><span className="catalog-muted">Файл должен содержать ровно одну сетку.</span>{error && <Notice error>{error}</Notice>}</div>
      <SubmissionForm key={replacement ? 'replacement' : item.revision} grid={replacement || item.grid} existing={item} token={ownerToken}/>
    </Modal>}
    {deleting && <Modal title="Удалить публикацию?" onClose={() => setDeleting(false)}><div className="catalog-confirm"><p>«{item.title}» исчезнет из каталога вместе с заявкой на обновление. Это действие нельзя отменить.</p>{error && <Notice error>{error}</Notice>}
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setDeleting(false)}>Оставить</button><button className="catalog-button danger" disabled={busy} onClick={async () => {
        setBusy(true); try { await catalogAPI(`/manage/${id}`, { method: 'DELETE', token: ownerToken }); forgetWork(id); setDeleted(true); } catch (e) { setError(e.message); } finally { setBusy(false); }
      }}>{busy ? 'Удаляем…' : 'Удалить'}</button></div></div></Modal>}
    {report && <Report item={item} onClose={() => setReport(false)}/>}
  </>;
}
function Gallery() {
  const auth = useAccount();
  const [query, setQuery] = useState(''), [tag, setTag] = useState(''), [sort, setSort] = useState('new'), [mine, setMine] = useState(() => new URLSearchParams(location.search).has('mine')), [page, setPage] = useState(0);
  const [data, setData] = useState(null), [privateItems, setPrivateItems] = useState([]), [error, setError] = useState(''), [retry, setRetry] = useState(0), [loading, setLoading] = useState(true);
  const owned = ownedWorks().filter(x => !privateItems.some(item => item.id === x.id));
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        if (mine) { setPrivateItems(auth.user ? (await catalogAPI('/mine', {signal:controller.signal})).items : []); }
        else setData(await catalogAPI('/works?' + new URLSearchParams({q:query,tag,sort,page:String(page)}), {signal:controller.signal}));
      } catch(e) { if (!controller.signal.aborted) setError(e.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, query && !mine ? 220 : 0);
    return () => {clearTimeout(timer);controller.abort();};
  }, [query,tag,sort,mine,page,retry,auth.user?.id]);
  function showMine(value) {
    const url = new URL(location.href);
    if (value) url.searchParams.set('mine', '1'); else url.searchParams.delete('mine');
    history.replaceState(history.state, '', url); setMine(value);
  }
  const filter = (fn,value) => {fn(value);setPage(0);showMine(false);};
  // Preserve the mounted previews and the reader's position after a like.
  // Popularity order is fetched again on the next filter/page visit.
  const updateLike = (id, value) => setData(current => current && ({
    ...current, items: current.items.map(item => item.id === id ? { ...item, ...value } : item)
  }));
  return <>
    <header className="catalog-heading"><div><h1>{mine ? 'Мои публикации' : 'Каталог сеток'}</h1><p>{mine ? 'Опубликованные сетки и заявки на проверке.' : 'Найди свой вариант. Открой в редакторе и сделай по-своему.'}</p></div><a className="catalog-button primary" href={EDITOR_PATH}><Icon name="plus"/>Создать сетку</a></header>
    <div className="catalog-toolbar"><div className="catalog-tabs" aria-label="Подборка"><button aria-pressed={!mine && sort==='new'} onClick={()=>filter(setSort,'new')}>Новые</button><button aria-pressed={!mine && sort==='popular'} onClick={()=>filter(setSort,'popular')}>Популярные</button><button aria-pressed={mine} onClick={()=>showMine(true)}>Мои публикации</button></div>
      {!mine && <label className="catalog-search"><Icon name="search"/><input aria-label="Поиск сеток" placeholder="Название или автор" value={query} maxLength={80} onChange={e=>filter(setQuery,e.target.value)}/></label>}</div>
    {!mine && <div className="catalog-tags catalog-filters"><button aria-pressed={!tag} onClick={()=>filter(setTag,'')}>Все теги</button>{CATALOG_TAGS.map(value=><button key={value} aria-pressed={tag===value} onClick={()=>filter(setTag,tag===value?'':value)}>{value}</button>)}</div>}
    {error && <Notice error>{error}<button className="catalog-link" onClick={()=>setRetry(x=>x+1)}>Повторить</button></Notice>}
    {loading ? <p role="status">Загружаем сетки…</p> : mine ? <OwnedPublications items={privateItems} guestItems={owned} auth={auth}/> : data?.items.length ? <>
      <div className="catalog-results">Сеток: {data.total}{sort==='popular' && ' · По числу лайков'}</div>
      <section className="catalog-grid" aria-label="Работы игроков">{data.items.map(item=><article key={item.id} className="catalog-card"><a className="catalog-card-art" href={CATALOG_PATH+'?id='+item.id}><GridPreview id={item.id} revision={item.revision} title={item.title}/></a>
        <div className="catalog-card-info"><div><a href={CATALOG_PATH+'?id='+item.id}><h2>{item.title}</h2></a><p>{item.author||'Без подписи'}</p></div><LikeButton item={item} onChange={value=>updateLike(item.id,value)}/></div>
        <div className="catalog-card-meta"><span>Категорий: {item.stats.categories.toLocaleString('ru-RU')}</span><span>{item.tags.join(', ')}</span></div></article>)}</section>
      {data.total>12 && <nav className="catalog-pagination" aria-label="Страницы каталога"><button className="catalog-button" disabled={!page} onClick={()=>setPage(x=>x-1)}>Назад</button><span>{page+1} / {Math.ceil(data.total/12)}</span><button className="catalog-button" disabled={(page+1)*12>=data.total} onClick={()=>setPage(x=>x+1)}>Дальше</button></nav>}
    </> : !error && <section className="catalog-empty"><h2>{query||tag?'Таких сеток пока нет':'Каталог начинается с твоей сетки'}</h2><p>{query||tag?'Попробуй другой запрос.':'Создай сетку в редакторе и отправь её на проверку.'}</p><a className="catalog-button" href={EDITOR_PATH}>Мои файлы</a></section>}
  </>;
}
export default function CatalogApp() { useAppMotion(); return <AccountProvider><CatalogShell/></AccountProvider>; }
function CatalogShell() {
  const params = new URLSearchParams(location.search), id = params.get('id'), moderation = params.has('moderate');
  const ownerToken = new URLSearchParams(location.hash.slice(1)).get('manage');
  const managing = !!ownerToken || params.has('manage');
  return <div className="catalog-page"><header className="catalog-nav"><Brand/><nav><a href={EDITOR_PATH}>Мои файлы<Icon name="arrow"/></a><AccountButton/></nav></header><main className="catalog-main">{moderation ? <Moderation/> : id ? <WorkDetail id={id} ownerToken={ownerToken} managing={managing}/> : <Gallery/>}</main><footer className="catalog-footer"><span>GridStudio</span><span>Сетки проходят проверку перед публикацией</span><a href="https://github.com/linsisss/dota2-grid-toolkit">GitHub</a></footer></div>;
}
