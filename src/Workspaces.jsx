import { useEffect, useRef, useState } from 'react';
import { AccountButton, AccountAvatar, accountLabel, useAccount } from './catalog/Account.jsx';
import { Brand, Icon, Modal, Notice, SegmentSwitch } from './catalog/Common.jsx';
import WorkspacePreview from './WorkspacePreview.jsx';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH } from './catalog/api.js';
import { createProjectStorage } from '../scripts/project-storage.mjs';
import { readGridFiles } from '../scripts/grid-import.mjs';
import C from '../scripts/core.mjs';
import { APP_VERSION } from '../scripts/version.mjs';
import { cloudWorkspaceId } from '../scripts/workspaces.mjs';
import { deleteBackground, listBackgrounds, updateBackground } from '../scripts/background-library.mjs';
import { dropRecipe, publicationStatus, pullRecipes, pushRecipe, remotePoster } from './studio-backgrounds.js';

// What the studio lists: everything, hero grids (files) or menu backgrounds. ?show=backgrounds
// opens on the backgrounds (the builder links there after saving one).
const SHOWS = [['all', 'Все'], ['grids', 'Сетки'], ['backgrounds', 'Фоны']];
const initialShow = () => { const value = new URLSearchParams(location.search).get('show'); return SHOWS.some(([id]) => id === value) ? value : 'all'; };
const seconds = (value) => `${String(Math.round(value * 10) / 10).replace('.', ',')} с`;

// A menu background in the studio (docs/customize.md «Фоны в студии»): its poster, the video
// while the pointer is on it (when this browser has it), a download in one click. Without the
// video here (built on another device) it can be built again in the builder.
// The workshop submission's status on the card; a rejection shows its reason.
const PUBLICATION = { pending: ['На проверке', 'is-pending'], approved: ['В мастерской', 'is-approved'], rejected: ['Отклонён', 'is-rejected'], hidden: ['Скрыт модератором', 'is-rejected'] };
function Publication({ status }) {
  const [label, tone] = PUBLICATION[status?.status] || [];
  if (!label) return null;
  const text = status.reason ? `${label}: ${status.reason}` : label;
  return status.status === 'approved' ? <a className={`workspace-publication ${tone}`} href={`${CATALOG_PATH}?backgrounds`} title="Открыть мастерскую">{text}</a>
    : <span className={`workspace-publication ${tone}`} title={text}>{text}</span>;
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
    <a className="workspace-background-picture" href={href} aria-label={`Изменить фон ${item.name}`}>{poster ? <img src={poster} alt=""/> : <span className="workspace-file-empty"><Icon name="brush"/></span>}<video ref={video} muted loop playsInline onPlaying={(event) => event.currentTarget.classList.add('is-playing')}/></a>
    <div className="workspace-background-caption"><Icon name="brush"/><span>Фон меню · {item.recipe.aspect}{item.seconds ? ` · ${seconds(item.seconds)}` : ''}</span><Publication status={status}/>{!here && <span className="workspace-background-away">{item.cloud ? 'в аккаунте' : 'нужно собрать'}</span>}</div>
    <div className="workspace-file-info"><a href={href}><h2>{item.name}</h2></a><time dateTime={new Date(item.updated).toISOString()}>{new Date(item.updated).toLocaleDateString('ru-RU')}</time></div>
    <div className="workspace-file-actions">
      {here ? <button className="catalog-icon" aria-label={`Скачать ${item.name}`} title="Скачать для Dota" disabled={disabled} onClick={onDownload}><Icon name="download"/></button>
        : <a className="catalog-link" href={href}>{item.recipe.source.kind === 'workshop' ? 'Собрать заново' : 'Выбрать файл и собрать'}</a>}
      <button className="catalog-icon" aria-label={`Переименовать ${item.name}`} disabled={disabled} onClick={onRename}><Icon name="edit"/></button>
      <button className="catalog-icon" aria-label={`Удалить ${item.name}`} disabled={disabled} onClick={onDelete}><Icon name="trash"/></button>
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
    <button className="catalog-button primary" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Icon name="plus"/>Создать</button>
    {open && <div className="workspace-create-menu" role="menu">
      <button role="menuitem" onClick={() => { setOpen(false); onGrid(); }}><Icon name="grid"/><span><b>Сетка героев</b><small>Новый файл в редакторе</small></span></button>
      <a role="menuitem" href={CUSTOMIZE_PATH}><Icon name="brush"/><span><b>Фон главного меню</b><small>Картинка, GIF или видео — готовый файл для Dota</small></span></a>
    </div>}
  </div>;
}

export default function Workspaces({ registry, onOpen }) {
  const auth = useAccount();
  const [items, setItems] = useState([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
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
      } catch (e) { setError(`${e.message} Фоны из этого браузера доступны.`); }
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
      } catch (e) { setError(`${e.message} Локальные файлы доступны.`); }
    }
    await loadBackgrounds();
  }
  useEffect(() => { if (!auth.loading) refresh().catch(e => { setError(e.message); setLoading(false); }); }, [auth.user?.id, auth.loading, auth.fileSync.revision, archive]);
  async function run(action) { setBusy(true); setError(''); try { await action(); if (auth.user) await auth.syncFiles(); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function read(meta) {
    const storage = await createProjectStorage(C.importProject, APP_VERSION, meta.id);
    try { const initial = await storage.load(); if (meta.account && !meta.dirty) return (await catalogAPI(`/spaces/${cloudWorkspaceId(meta)}`)).document; if (initial.doc) return initial.doc; if (meta.account) return (await catalogAPI(`/spaces/${cloudWorkspaceId(meta)}`)).document; throw new Error(initial.issue || 'В файле нет сохранённого проекта.'); }
    finally { storage.database?.close(); }
  }
  async function copy(meta) {
    const doc = await read(meta), account = auth.user?.id || null;
    const created = await registry.create(`${meta.name.slice(0, 88)} — копия`, doc, account);
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
  const newGrid = () => run(async () => { const item = await registry.create('Без названия', C.demoDocument('blank'), auth.user?.id || null); onOpen(item); });
  // The archive holds grid files only; the studio mixes both, newest first.
  const entries = [...(archive || show !== 'backgrounds' ? visible : []).map(item => ({ kind: 'grid', item })),
    ...(!archive && show !== 'grids' ? backgrounds.filter(item => matches(item.name)) : []).map(item => ({ kind: 'background', item }))]
    .sort((a, b) => b.item.updated - a.item.updated);
  const choose = (value) => { const url = new URL(location.href); if (value === 'all') url.searchParams.delete('show'); else url.searchParams.set('show', value); history.replaceState(history.state, '', url); setShow(value); };
  async function download(item) {
    const { downloadPack, packBackground } = await import('./customize/background-pack.js');
    const hero = item.heroVideo instanceof Blob ? new Uint8Array(await item.heroVideo.arrayBuffer()) : null;
    await downloadPack(packBackground(new Uint8Array(await item.video.arrayBuffer()), item.recipe, hero), item.recipe);
  }
  const lead = archive ? 'Файлы, убранные из студии. Их можно вернуть.'
    : show === 'grids' ? 'Сетки героев. В одном файле их может быть несколько.'
    : show === 'backgrounds' ? (auth.user ? 'Готовое видео хранится в этом браузере, настройки — в аккаунте: на другом устройстве фон собирается заново.' : 'Фоны хранятся в этом браузере. Войди через Telegram, чтобы настройки фонов были и на других устройствах.')
    : 'Сетки героев и фоны главного меню.';
  const gridCard = (item) => { const locked = working || uploading(item); return <article className="workspace-file" key={item.id}>
        <WorkspacePreview item={item} disabled={archive || locked} onOpen={index => onOpen({ ...item, openConfigIndex: index })}/>
        <div className="workspace-file-info"><button disabled={archive || locked} onClick={() => onOpen(item)}><h2>{item.name}</h2></button><time dateTime={new Date(item.updated).toISOString()}>{new Date(item.updated).toLocaleDateString('ru-RU')}</time></div>
        <div className="workspace-file-actions">{!archive && <><button className="catalog-icon" aria-label={`Переименовать ${item.name}`} disabled={locked} onClick={() => { setRename(item); setName(item.name); }}><Icon name="edit"/></button><button className="catalog-icon" aria-label={`Создать копию ${item.name}`} disabled={locked} onClick={() => run(() => copy(item))}><Icon name="copy"/></button></>}
        <button className="catalog-icon" aria-label={`${archive ? 'Восстановить' : 'В архив'} ${item.name}`} disabled={locked} onClick={() => run(async () => {
          let revision = item.cloudRevision;
          if (item.account) { if (item.dirty) throw new Error('Сначала открой файл для синхронизации или создай его копию.'); const base = item.remoteRevision || item.cloudRevision; const result = await catalogAPI(`/spaces/${cloudWorkspaceId(item)}`, { method: 'PATCH', body: { revision: base, archived: !archive } }); if (item.cloudRevision === base) revision = result.revision; }
          await registry.update(item.id, { archived: !archive, cloudRevision: revision });
        })}><Icon name={archive ? 'back' : 'archive'}/></button></div>
      </article>; };
  const empty = query ? ['Ничего не найдено', 'Попробуй другое название.'] : archive ? ['В архиве пока пусто', 'Здесь можно восстановить файлы, убранные из рабочего списка.']
    : show === 'backgrounds' ? ['Здесь будут твои фоны', 'Собери фон главного меню — после сборки он сохранится здесь, и скачать его снова можно будет в один клик.']
    : show === 'grids' ? ['Создай первую сетку', 'Начни с пустой сетки или импортируй свой JSON. Вход не обязателен.']
    : ['Создай первый файл', 'Начни с пустой сетки, импортируй свой JSON или собери фон главного меню. Вход не обязателен.'];
  return <div className="catalog-page workspace-page"><header className="workspace-topbar"><Brand/><div><AccountButton/></div></header>
    <div className="workspace-shell"><aside className="workspace-sidebar"><nav aria-label="Студия"><button aria-current={!archive ? 'page' : undefined} onClick={() => setArchive(false)}><Icon name="grid"/>Студия</button><button aria-current={archive ? 'page' : undefined} onClick={() => setArchive(true)}><Icon name="archive"/>Архив</button><a href={CUSTOMIZE_PATH}><Icon name="brush"/>Фон меню</a><button type="button" className="is-soon" disabled title="Шрифты для Dota — скоро"><Icon name="font"/>Шрифты<small>скоро</small></button><a href={CATALOG_PATH}><Icon name="workshop"/>Мастерская</a></nav>
      <div className="workspace-storage-note"><strong className="account-profile">{auth.user && <AccountAvatar user={auth.user}/>}<span>{auth.user ? accountLabel(auth.user) : 'Без аккаунта'}</span></strong><p>{auth.user ? auth.fileSync.busy ? 'Сохраняем файлы в аккаунте…' : 'Файлы сохраняются в аккаунте автоматически. Локальные копии остаются в браузере.' : 'Файлы хранятся в этом браузере. Очистка данных или освобождение места браузером может удалить прогресс.'}</p>{!auth.user && <button className="catalog-link" onClick={() => auth.requestLogin()}>Привязать Telegram</button>}</div>
    </aside><main className="workspace-main"><header className="files-heading"><div><div className="files-title"><h1>{archive ? 'Архив' : 'Студия'}</h1>{!archive && <SegmentSwitch label="Что показать" value={show} options={SHOWS} onChange={choose}/>}<span className="workspace-file-count" aria-live="polite">{show === 'backgrounds' && !archive ? 'Фонов' : 'Файлов'}: {entries.length}</span></div><p>{lead}</p></div><div className="workspace-actions"><div className="workspace-import-actions"><label className="catalog-search workspace-search"><Icon name="search"/><input placeholder="Поиск файлов" aria-label="Поиск файлов" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="catalog-button workspace-import"><Icon name="download"/>Импорт файла<input type="file" accept=".json,application/json" multiple className="catalog-file" disabled={working} onChange={event => {
      const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return;
      run(async () => { const imported = await readGridFiles(files); for (const file of imported) await registry.create(file.name.replace(/\.json$/i, '').slice(0, 100), file.doc, auth.user?.id || null); });
    }}/></label></div><CreateMenu disabled={working} onGrid={newGrid}/></div></header>
      {incoming && <Notice>Выбери файл, в который добавить сетку из мастерской, или создай новый.</Notice>}
      {error && <Notice error>{error}</Notice>}
      {auth.fileSync.error && <Notice error>{auth.fileSync.error}<button className="catalog-link" disabled={working} onClick={() => auth.syncFiles()}>Повторить сохранение</button></Notice>}
      {loading ? <p role="status">Открываем файлы…</p> : entries.length ? <section className="workspace-files" aria-label="Студия">{entries.map(({ kind, item }) => kind === 'grid' ? gridCard(item)
        : <BackgroundFile key={item.id} item={item} status={statuses[item.id]} disabled={working} onDownload={() => run(() => download(item))} onRename={() => { setRename(item); setName(item.name); }} onDelete={() => setRemoving(item)}/>)}</section>
        : <section className="workspace-empty"><Icon name={archive ? 'archive' : show === 'backgrounds' ? 'brush' : 'grid'}/><h2>{empty[0]}</h2><p>{empty[1]}</p>
        {!query && !archive && <div className="workspace-empty-actions">{show !== 'backgrounds' && <button className="catalog-button primary" disabled={working} onClick={newGrid}><Icon name="grid"/>Пустая сетка</button>}{show !== 'grids' && <a className={`catalog-button${show === 'backgrounds' ? ' primary' : ''}`} href={CUSTOMIZE_PATH}><Icon name="brush"/>Фон меню</a>}</div>}</section>}
    </main></div>{rename && <Modal title={rename.recipe ? 'Название фона' : 'Имя файла'} onClose={() => setRename(null)}><form className="catalog-login-flow" onSubmit={changeName}><label>Название<input value={name} maxLength={100} autoFocus onChange={e => setName(e.target.value)} required/></label><button className="catalog-button primary" disabled={working || !name.trim()}>Сохранить</button>{error && <Notice error>{error}</Notice>}</form></Modal>}
    {removing && <Modal title="Удалить фон?" onClose={() => setRemoving(null)}><div className="catalog-confirm"><p>«{removing.name}» исчезнет из студии{removing.account ? ' на всех устройствах' : ''}. Файлы, которые ты уже скачал, останутся.</p>
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setRemoving(null)}>Оставить</button><button className="catalog-button danger" disabled={working} onClick={() => run(async () => {
        if (!removing.cloud) await deleteBackground(removing.id);
        if (auth.user && removing.account === auth.user.id && (removing.synced || removing.cloud)) await dropRecipe(removing.id);
        setRemoving(null);
      })}>Удалить</button></div></div></Modal>}</div>
}
