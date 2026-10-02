import { useEffect, useRef, useState } from 'react';
import { AccountButton, AccountAvatar, accountLabel, useAccount } from './catalog/Account.jsx';
import { Brand, Icon, Modal, Notice, SegmentSwitch, rich } from './catalog/Common.jsx';
import WorkspacePreview from './WorkspacePreview.jsx';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, FONT_PATH, GUIDES_PATH } from './catalog/api.js';
import { createProjectStorage } from '../scripts/project-storage.mjs';
import { readGridFiles } from '../scripts/grid-import.mjs';
import C from '../scripts/core.mjs';
import { APP_VERSION } from '../scripts/version.mjs';
import { cloudWorkspaceId } from '../scripts/workspaces.mjs';
import { deleteBackground, listBackgrounds, updateBackground } from '../scripts/background-library.mjs';
import { dropRecipe, publicationStatus, pullRecipes, pushRecipe, remotePoster } from './studio-backgrounds.js';
import LanguageSwitch from './LanguageSwitch.jsx';
import { CommunityCard, CommunityLink } from './Community.jsx';
import { t, locale, translateMessage } from '../scripts/i18n.mjs';
import { BackgroundSteps } from './customize/BackgroundSteps.jsx';

// What the studio lists: everything, hero grids (files) or menu backgrounds. ?show=backgrounds
// opens on the backgrounds (the builder links there after saving one).
const SHOWS = [['all', 'Все'], ['grids', 'Сетки'], ['backgrounds', 'Фоны']];
const initialShow = () => { const value = new URLSearchParams(location.search).get('show'); return SHOWS.some(([id]) => id === value) ? value : 'all'; };
const seconds = (value) => t('{value} с', { value: (Math.round(value * 10) / 10).toLocaleString(locale) });
const day = (time) => new Date(time).toLocaleDateString(locale);

// A menu background in the studio (docs/customize.md «Фоны в студии»): its poster, the video
// while the pointer is on it (when this browser has it), a download in one click. Without the
// video here (built on another device) it can be built again in the builder.
// The workshop submission's status on the card; a rejection shows its reason.
const PUBLICATION = { pending: ['На проверке', 'is-pending'], approved: ['В мастерской', 'is-approved'], rejected: ['Отклонён', 'is-rejected'], hidden: ['Скрыт модератором', 'is-rejected'] };
function Publication({ status }) {
  const [key, tone] = PUBLICATION[status?.status] || [];
  if (!key) return null;
  const label = t(key), text = status.reason ? `${label}: ${status.reason}` : label;
  return status.status === 'approved' ? <a className={`workspace-publication ${tone}`} href={`${CATALOG_PATH}?backgrounds`} title={t('Открыть мастерскую')}>{text}</a>
    : <span className={`workspace-publication ${tone}`} title={text}>{text}</span>;
}
// A PowerShell command to copy (a background saved «Командой PowerShell», customize/background-pack.js).
function CommandCopy({ text, small = false }) {
  const [copied, setCopied] = useState(false);
  return <div className="workspace-command"><code className={`catalog-install-command${small ? ' is-small' : ''}`}>{text}</code>
    <button type="button" className="catalog-icon" aria-label={t('Скопировать команду')} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* It stays visible to copy by hand. */ }
    }}><Icon name={copied ? 'check' : 'copy'}/></button></div>;
}
function BackgroundFile({ item, status, disabled, onDownload, onRename, onDelete }) {
  const [poster, setPoster] = useState(''), video = useRef(null), clip = useRef('');
  useEffect(() => {
    if (item.cloud || !(item.poster instanceof Blob)) { setPoster(item.cloud && item.poster ? remotePoster(item.id) : ''); return; }
    const url = URL.createObjectURL(item.poster); setPoster(url);
    return () => URL.revokeObjectURL(url);
  }, [item.id, item.updated, item.cloud]);
  useEffect(() => () => { if (clip.current) URL.revokeObjectURL(clip.current); }, [item.id]);
  const play = () => { const node = video.current; if (!node || !(item.video instanceof Blob)) return; if (!clip.current) { clip.current = URL.createObjectURL(item.video); node.src = clip.current; } node.play().catch(() => {}); };
  const stop = () => video.current?.pause();
  const href = `${CUSTOMIZE_PATH}?item=${item.id}`, here = item.video instanceof Blob;
  return <article className="workspace-file workspace-background" onPointerEnter={play} onPointerLeave={stop}>
    <a className="workspace-background-picture" href={href} aria-label={t('Изменить фон {name}', { name: item.name })}>{poster ? <img src={poster} alt=""/> : <span className="workspace-file-empty"><Icon name="brush"/></span>}<video ref={video} muted loop playsInline onPlaying={(event) => event.currentTarget.classList.add('is-playing')}/></a>
    <div className="workspace-background-caption"><Icon name="brush"/><span>{t('Фон меню')} · {item.recipe.aspect}{item.seconds ? ` · ${seconds(item.seconds)}` : ''}</span><Publication status={status}/>{!here && <span className="workspace-background-away">{item.cloud ? t('в аккаунте') : t('нужно собрать')}</span>}</div>
    <div className="workspace-file-info"><a href={href}><h2>{item.name}</h2></a><time dateTime={new Date(item.updated).toISOString()}>{day(item.updated)}</time></div>
    <div className="workspace-file-actions">
      {here ? <button className="catalog-icon" aria-label={t('Скачать {name}', { name: item.name })} title={t('Скачать для Dota')} disabled={disabled} onClick={onDownload}><Icon name="download"/></button>
        : <a className="catalog-link" href={href}>{item.recipe.source.kind === 'workshop' ? t('Собрать заново') : t('Выбрать файл и собрать')}</a>}
      <button className="catalog-icon" aria-label={t('Переименовать {name}', { name: item.name })} disabled={disabled} onClick={onRename}><Icon name="edit"/></button>
      <button className="catalog-icon" aria-label={t('Удалить {name}', { name: item.name })} disabled={disabled} onClick={onDelete}><Icon name="trash"/></button>
    </div>
  </article>;
}

// «Создать»: a grid file here, or a menu background in the builder (/customize).
function CreateMenu({ disabled, onGrid }) {
  const [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="workspace-create" ref={box}>
    <button className="catalog-button primary" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Icon name="plus"/>{t('Создать')}</button>
    {open && <div className="workspace-create-menu" role="menu">
      <button role="menuitem" onClick={() => { setOpen(false); onGrid(); }}><Icon name="grid"/><span><b>{t('Сетка героев')}</b><small>{t('Новый файл в редакторе')}</small></span></button>
      <a role="menuitem" href={CUSTOMIZE_PATH}><Icon name="brush"/><span><b>{t('Фон главного меню')}</b><small>{t('Картинка, GIF или видео — готовый файл для Dota')}</small></span></a>
    </div>}
  </div>;
}

export default function Workspaces({ registry, onOpen }) {
  const auth = useAccount();
  const [items, setItems] = useState([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  // How to install a background just downloaded: its command («Командой PowerShell») or, for the file, its folder.
  const [handed, setHanded] = useState(null);
  const [query, setQuery] = useState(''), [archive, setArchive] = useState(false), [rename, setRename] = useState(null), [name, setName] = useState('');
  const [backgrounds, setBackgrounds] = useState([]), [show, setShow] = useState(initialShow), [removing, setRemoving] = useState(null), [statuses, setStatuses] = useState({});
  // Backgrounds: this browser's (the account's or a guest's), merged with the account's recipes. A
  // guest's backgrounds join the account that signs in here; one synced before and gone from the
  // server was deleted on another device; a newer recipe from elsewhere replaces this one and, if
  // the settings changed, drops the stale video.
  async function loadBackgrounds() {
    const mine = (record) => !record.account || record.account === auth.user?.id;
    let local = (await listBackgrounds().catch(() => [])).filter(mine), cloud = [];
    setBackgrounds(local);
    if (auth.user) {
      try {
        const remote = await pullRecipes();
        for (const record of local) {
          const copy = remote.find((row) => row.id === record.id);
          if (copy?.published && !record.published) await updateBackground(record.id, { published: copy.published });
          if (!record.synced) { const saved = await pushRecipe(record); await updateBackground(record.id, { account: auth.user.id, synced: true, updated: saved.updated }); }
          else if (!copy) await deleteBackground(record.id);
          else if (copy.updated > record.updated) {
            const same = JSON.stringify(copy.recipe) === JSON.stringify(record.recipe);
            await updateBackground(record.id, { name: copy.name, recipe: copy.recipe, updated: copy.updated, ...(same ? {} : { video: null, seconds: 0 }) });
          }
        }
        local = (await listBackgrounds()).filter(mine);
        cloud = remote.filter((row) => !local.some((record) => record.id === row.id)).map((row) => ({ ...row, account: auth.user.id, cloud: true }));
      } catch (e) { setError(t('{message} Фоны из этого браузера доступны.', { message: translateMessage(e.message) })); }
    }
    const all = [...local, ...cloud];
    setBackgrounds(all);
    // Moderation results of published backgrounds (a few requests; a missing one shows nothing).
    const published = all.filter((item) => item.published);
    const results = await Promise.allSettled(published.map((item) => publicationStatus(item.published)));
    setStatuses(Object.fromEntries(published.map((item, index) => [item.id, results[index].status === 'fulfilled' ? results[index].value : null])));
  }
  // The list shows this browser's files at once; the account's list and backgrounds join after.
  // A row is written only when the account copy changed something, so cards keep their pictures.
  async function refresh() {
    setError('');
    setItems(await registry.list());
    setLoading(false);
    if (auth.user) {
      try {
        const result = await catalogAPI(`/spaces?archived=${archive ? '1' : '0'}`);
        const local = await registry.list();
        let changed = false;
        for (const row of result.items) {
          const old = local.find(item => cloudWorkspaceId(item) === row.id && item.account === row.account);
          const next = { ...row, ...(old || {}), id: old?.id || row.id, cloudId: row.id, account: row.account,
            name: old?.dirty ? old.name : row.name, preview: old?.dirty ? old.preview : row.preview,
            gridNames: row.gridNames ?? old?.gridNames, configIndex: row.configIndex ?? old?.configIndex,
            updated: Math.max(row.updated, old?.updated || 0), archived: !!row.archived, cloudRevision: old?.cloudRevision || 0, remoteRevision: row.revision };
          if (old && ['name', 'updated', 'archived', 'remoteRevision', 'configIndex'].every((key) => old[key] === next[key]) && JSON.stringify(old.gridNames) === JSON.stringify(next.gridNames)) continue;
          await registry.put(next); changed = true;
        }
        if (changed) setItems(await registry.list());
      } catch (e) { setError(t('{message} Локальные файлы доступны.', { message: translateMessage(e.message) })); }
    }
    await loadBackgrounds();
  }
  useEffect(() => { if (!auth.loading) refresh().catch(e => { setError(translateMessage(e.message)); setLoading(false); }); }, [auth.user?.id, auth.loading, auth.fileSync.revision, archive]);
  async function run(action) { setBusy(true); setError(''); try { await action(); if (auth.user) await auth.syncFiles(); await refresh(); } catch (e) { setError(translateMessage(e.message)); } finally { setBusy(false); } }
  async function read(meta) {
    const storage = await createProjectStorage(C.importProject, APP_VERSION, meta.id);
    try { const initial = await storage.load(); if (meta.account && !meta.dirty) return (await catalogAPI(`/spaces/${cloudWorkspaceId(meta)}`)).document; if (initial.doc) return initial.doc; if (meta.account) return (await catalogAPI(`/spaces/${cloudWorkspaceId(meta)}`)).document; throw new Error(initial.issue || t('В файле нет сохранённого проекта.')); }
    finally { storage.database?.close(); }
  }
  async function copy(meta) {
    const doc = await read(meta), account = auth.user?.id || null;
    const created = await registry.create(t('{name} — копия', { name: meta.name.slice(0, 88) }), doc, account);
    if (account) {
      const saved = await catalogAPI(`/spaces/${created.id}`, { method: 'PUT', body: { account, name: created.name, revision: 0, document: doc } });
      await registry.update(created.id, { cloudRevision: saved.revision, dirty: false, pendingUpload: false });
    }
    onOpen(await registry.get(created.id));
  }
  async function changeName(event) {
    event.preventDefault(); if (!name.trim()) return;
    if (rename.recipe) return run(async () => {
      const next = { ...rename, name: name.trim().slice(0, 100), updated: Date.now() };
      if (!rename.cloud) await updateBackground(rename.id, { name: next.name, updated: next.updated, synced: false });
      if (auth.user && next.account === auth.user.id) { const saved = await pushRecipe(next); if (!rename.cloud) await updateBackground(rename.id, { synced: true, updated: saved.updated }); }
      setRename(null);
    });
    await run(async () => {
      if (rename.account) {
        const remote = rename.dirty ? null : await catalogAPI(`/spaces/${cloudWorkspaceId(rename)}`);
        const doc = remote?.document || await read(rename);
        const result = await catalogAPI(`/spaces/${cloudWorkspaceId(rename)}`, { method: 'PUT', body: { account: rename.account, revision: remote?.revision || rename.cloudRevision || 0, name: name.trim(), document: doc } });
        // Keep the local content revision unchanged until the server copy is hydrated.
        await registry.update(rename.id, { name: name.trim(), cloudRevision: rename.dirty ? result.revision : rename.cloudRevision, dirty: false });
      } else await registry.update(rename.id, { name: name.trim() });
      setRename(null);
    });
  }
  // Account sync runs in the background (the sidebar says so); only a file being uploaded right
  // now keeps its buttons until the upload ends.
  const working = busy;
  const uploading = (item) => auth.fileSync.busy && !!item.pendingUpload;
  const matches = (value) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visible = items.filter(item => (!item.account || item.account === auth.user?.id) && !!item.archived === archive && matches(item.name));
  const incoming = new URLSearchParams(location.search).has('catalog');
  const newGrid = () => run(async () => { const item = await registry.create(t('Без названия'), C.demoDocument('blank'), auth.user?.id || null); onOpen(item); });
  // The archive holds grid files only; the studio mixes both, newest first.
  const entries = [...(archive || show !== 'backgrounds' ? visible : []).map(item => ({ kind: 'grid', item })),
    ...(!archive && show !== 'grids' ? backgrounds.filter(item => matches(item.name)) : []).map(item => ({ kind: 'background', item }))]
    .sort((a, b) => b.item.updated - a.item.updated);
  const choose = (value) => { const url = new URL(location.href); if (value === 'all') url.searchParams.delete('show'); else url.searchParams.set('show', value); history.replaceState(history.state, '', url); setShow(value); };
  async function download(item) {
    const { downloadPack, packBackground, folderOf } = await import('./customize/background-pack.js');
    const bytes = async (blob) => (blob instanceof Blob ? new Uint8Array(await blob.arrayBuffer()) : null);
    const given = await downloadPack(packBackground(await bytes(item.video), item.recipe, await bytes(item.heroVideo), await bytes(item.gridVideo)), item.recipe);
    // The install window after every download: the command, or the steps by hand for the file.
    setHanded(given || { target: folderOf(item.recipe.folder) });
  }
  const lead = archive ? t('Файлы, убранные из студии. Их можно вернуть.')
    : show === 'grids' ? t('Сетки героев. В одном файле их может быть несколько.')
    : show === 'backgrounds' ? (auth.user ? t('Готовое видео хранится в этом браузере, настройки — в аккаунте: на другом устройстве фон собирается заново.') : t('Фоны хранятся в этом браузере. Войди через Telegram, чтобы настройки фонов были и на других устройствах.'))
    : t('Сетки героев и фоны главного меню.');
  const gridCard = (item) => { const locked = working || uploading(item); return <article className="workspace-file" key={item.id}>
        <WorkspacePreview item={item} disabled={archive || locked} onOpen={index => onOpen({ ...item, openConfigIndex: index })}/>
        <div className="workspace-file-info"><button disabled={archive || locked} onClick={() => onOpen(item)}><h2>{item.name}</h2></button><time dateTime={new Date(item.updated).toISOString()}>{day(item.updated)}</time></div>
        <div className="workspace-file-actions">{!archive && <><button className="catalog-icon" aria-label={t('Переименовать {name}', { name: item.name })} disabled={locked} onClick={() => { setRename(item); setName(item.name); }}><Icon name="edit"/></button><button className="catalog-icon" aria-label={t('Создать копию {name}', { name: item.name })} disabled={locked} onClick={() => run(() => copy(item))}><Icon name="copy"/></button></>}
        <button className="catalog-icon" aria-label={t(archive ? 'Восстановить {name}' : 'В архив {name}', { name: item.name })} disabled={locked} onClick={() => run(async () => {
          let revision = item.cloudRevision;
          if (item.account) { if (item.dirty) throw new Error(t('Сначала открой файл для синхронизации или создай его копию.')); const base = item.remoteRevision || item.cloudRevision; const result = await catalogAPI(`/spaces/${cloudWorkspaceId(item)}`, { method: 'PATCH', body: { revision: base, archived: !archive } }); if (item.cloudRevision === base) revision = result.revision; }
          await registry.update(item.id, { archived: !archive, cloudRevision: revision });
        })}><Icon name={archive ? 'back' : 'archive'}/></button></div>
      </article>; };
  const empty = (query ? ['Ничего не найдено', 'Попробуй другое название.'] : archive ? ['В архиве пока пусто', 'Здесь можно восстановить файлы, убранные из рабочего списка.']
    : show === 'backgrounds' ? ['Здесь будут твои фоны', 'Собери фон главного меню — после сборки он сохранится здесь, и скачать его снова можно будет в один клик.']
    : show === 'grids' ? ['Создай первую сетку', 'Начни с пустой сетки или импортируй свой JSON. Вход не обязателен.']
    : ['Создай первый файл', 'Начни с пустой сетки, импортируй свой JSON или собери фон главного меню. Вход не обязателен.']).map((text) => t(text));
  return <div className="catalog-page workspace-page"><header className="workspace-topbar"><Brand/><div><CommunityLink/><AccountButton/></div></header>
    <div className="workspace-shell"><aside className="workspace-sidebar"><nav aria-label={t('Студия')}><button aria-current={!archive ? 'page' : undefined} onClick={() => setArchive(false)}><Icon name="grid"/>{t('Студия')}</button><button aria-current={archive ? 'page' : undefined} onClick={() => setArchive(true)}><Icon name="archive"/>{t('Архив')}</button><a href={CUSTOMIZE_PATH}><Icon name="brush"/>{t('Фон меню')}</a><a href={FONT_PATH}><Icon name="font"/>{t('Шрифты')}</a><a href={CATALOG_PATH}><Icon name="workshop"/>{t('Мастерская')}</a><a href={GUIDES_PATH}><Icon name="guides"/>{t('Гайды')}</a></nav>
      <div className="workspace-sidebar-foot"><CommunityCard/><div className="workspace-storage-note"><strong className="account-profile">{auth.user && <AccountAvatar user={auth.user}/>}<span>{auth.user ? accountLabel(auth.user) : t('Без аккаунта')}</span></strong><p>{auth.user ? auth.fileSync.busy ? t('Сохраняем файлы в аккаунте…') : t('Файлы сохраняются в аккаунте автоматически. Локальные копии остаются в браузере.') : t('Файлы хранятся в этом браузере. Очистка данных или освобождение места браузером может удалить прогресс.')}</p>{!auth.user && <button className="catalog-link" onClick={() => auth.requestLogin()}>{t('Привязать Telegram')}</button>}
        <div style={{ marginTop: 12 }}><LanguageSwitch className="workspace-language"/></div></div></div>
    </aside><main className="workspace-main"><header className="files-heading"><div><div className="files-title"><span className="win-icon page-icon" aria-hidden="true"><Icon name={archive ? 'archive' : 'studio'}/></span><h1>{archive ? t('Архив') : t('Студия')}</h1>{!archive && <SegmentSwitch label={t('Что показать')} value={show} options={SHOWS.map(([id, label]) => [id, t(label)])} onChange={choose}/>}<span className="workspace-file-count" aria-live="polite">{t(show === 'backgrounds' && !archive ? 'Фонов: {count}' : 'Файлов: {count}', { count: entries.length })}</span></div><p>{lead}</p></div><div className="workspace-actions"><div className="workspace-import-actions"><label className="catalog-search workspace-search"><Icon name="search"/><input placeholder={t('Поиск файлов')} aria-label={t('Поиск файлов')} value={query} onChange={e => setQuery(e.target.value)}/></label><label className="catalog-button workspace-import"><Icon name="download"/>{t('Импорт файла')}<input type="file" accept=".json,application/json" multiple className="catalog-file" disabled={working} onChange={event => {
      const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return;
      run(async () => { const imported = await readGridFiles(files); for (const file of imported) await registry.create(file.name.replace(/\.json$/i, '').slice(0, 100), file.doc, auth.user?.id || null); });
    }}/></label></div><CreateMenu disabled={working} onGrid={newGrid}/></div></header>
      {incoming && <Notice>{t('Выбери файл, в который добавить сетку из мастерской, или создай новый.')}</Notice>}
      {error && <Notice error report>{error}</Notice>}
      {auth.fileSync.error && <Notice error report>{auth.fileSync.error}<button className="catalog-link" disabled={working} onClick={() => auth.syncFiles()}>{t('Повторить сохранение')}</button></Notice>}
      {loading ? <p role="status">{t('Открываем файлы…')}</p> : entries.length ? <section className="workspace-files" aria-label={t('Студия')}>{entries.map(({ kind, item }) => kind === 'grid' ? gridCard(item)
        : <BackgroundFile key={item.id} item={item} status={statuses[item.id]} disabled={working} onDownload={() => run(() => download(item))} onRename={() => { setRename(item); setName(item.name); }} onDelete={() => setRemoving(item)}/>)}</section>
        : <section className="workspace-empty"><Icon name={archive ? 'archive' : show === 'backgrounds' ? 'brush' : 'grid'}/><h2>{empty[0]}</h2><p>{empty[1]}</p>
        {!query && !archive && <div className="workspace-empty-actions">{show !== 'backgrounds' && <button className="catalog-button primary" disabled={working} onClick={newGrid}><Icon name="grid"/>{t('Пустая сетка')}</button>}{show !== 'grids' && <a className={`catalog-button${show === 'backgrounds' ? ' primary' : ''}`} href={CUSTOMIZE_PATH}><Icon name="brush"/>{t('Фон меню')}</a>}</div>}</section>}
    </main></div>{handed && <Modal title={t('Как установить фон')} icon="download" onClose={() => setHanded(null)}><div className="catalog-confirm workspace-install">
      {handed.command ? <><p>{rich(t('Фон скачан как {file} — не переименовывай его.'), { file: <code>{handed.name}</code> })} {rich(t('Открой PowerShell ({key}, набери PowerShell, {enter}), вставь команду и нажми {enter}.'), { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd> })}</p>
        <CommandCopy text={handed.command}/>
        <p className="catalog-muted">{t('Убрать фон — вставь в PowerShell:')}</p><CommandCopy text={handed.remove} small/></>
        : <BackgroundSteps target={handed.target}/>}
    </div></Modal>}{rename && <Modal title={rename.recipe ? t('Название фона') : t('Имя файла')} icon="edit" onClose={() => setRename(null)}><form className="catalog-login-flow" onSubmit={changeName}><label>{t('Название')}<input value={name} maxLength={100} autoFocus onChange={e => setName(e.target.value)} required/></label><button className="catalog-button primary" disabled={working || !name.trim()}>{t('Сохранить')}</button>{error && <Notice error>{error}</Notice>}</form></Modal>}
    {removing && <Modal title={t('Удалить фон?')} icon="trash" tone="danger" onClose={() => setRemoving(null)}><div className="catalog-confirm"><p>{t(removing.account ? '«{name}» исчезнет из студии на всех устройствах.' : '«{name}» исчезнет из студии.', { name: removing.name })} {t('Файлы, которые ты уже скачал, останутся.')}</p>
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setRemoving(null)}>{t('Оставить')}</button><button className="catalog-button danger" disabled={working} onClick={() => run(async () => {
        if (!removing.cloud) await deleteBackground(removing.id);
        if (auth.user && removing.account === auth.user.id && (removing.synced || removing.cloud)) await dropRecipe(removing.id);
        setRemoving(null);
      })}>{t('Удалить')}</button></div></div></Modal>}</div>
}
