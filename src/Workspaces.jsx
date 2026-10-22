import { useEffect, useRef, useState } from 'react';
import { AccountButton, AccountAvatar, accountLabel, useAccount } from './catalog/Account.jsx';
import { Brand, Icon, Modal, Notice, SegmentSwitch, rich } from './catalog/Common.jsx';
import WorkspacePreview from './WorkspacePreview.jsx';
import { catalogAPI, CATALOG_PATH, CUSTOMIZE_PATH, FONT_PATH, GUIDES_PATH } from './catalog/api.js';
import { createProjectStorage } from '../scripts/project-storage.mjs';
import { readGridFiles } from '../scripts/grid-import.mjs';
import C from '../scripts/core.mjs';
import { APP_VERSION } from '../scripts/version.mjs';
import { cloudWorkspaceId, SPACE_REQUEST_BYTES } from '../scripts/workspaces.mjs';
import { deleteBackground, listBackgrounds, staleBuilt, updateBackground } from '../scripts/background-library.mjs';
import { OLD_VIDEO, refreshBackground } from './studio-rebuild.js';
import { dropRecipe, publicationStatus, pullRecipes, pushRecipe, remotePoster } from './studio-backgrounds.js';
import { duplicateLookItem, lookFromBackground, lookPosterURL, removeLookItem, renameLookItem, syncLooks } from './studio-looks.js';
import { LOOK_PARTS } from '../scripts/customize-look.mjs';
import LanguageSwitch from './LanguageSwitch.jsx';
import { CommunityCard, CommunityLink } from './Community.jsx';
import { t, locale, translateMessage } from '../scripts/i18n.mjs';
import { BackgroundSteps } from './customize/BackgroundSteps.jsx';
import { packOf, track } from './site-stats.js';

// What the studio lists: everything, hero grids (files), menu backgrounds or «Оформление» (the whole of
// /background, 2026-10-22). ?show=backgrounds / ?show=looks opens on them (the page links there after saving).
const SHOWS = [['all', 'Все'], ['grids', 'Сетки'], ['backgrounds', 'Фоны'], ['looks', 'Оформление']];
const initialShow = () => { const value = new URLSearchParams(location.search).get('show'); return SHOWS.some(([id]) => id === value) ? value : 'all'; };
const seconds = (value) => t('{value} с', { value: (Math.round(value * 10) / 10).toLocaleString(locale) });
// Rebuilt with no file to choose: every video in it (the menu's and the pages' own) is from the workshop.
const fromWorkshop = (recipe) => [recipe.source, recipe.hero?.mode === 'own' && recipe.hero.source, recipe.grid?.mode === 'own' && recipe.grid.source, recipe.loading?.mode === 'own' && recipe.loading.source].filter(Boolean).every((source) => source.kind === 'workshop');
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
function BackgroundFile({ item, status, disabled, onDownload, onRename, onDelete, onLook }) {
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
    <div className="workspace-background-caption"><Icon name="brush"/><span>{t('Фон меню')} · {item.recipe.aspect}{item.seconds ? ` · ${seconds(item.seconds)}` : ''}</span><Publication status={status}/>{!here && <span className="workspace-background-away">{item.cloud ? t('в аккаунте') : t('нужно собрать')}</span>}
      {here && staleBuilt(item) && <span className="workspace-background-away" title={t('Видео собрано до исправления плавности: при скачивании фон соберётся заново')}>{t('пересоберётся')}</span>}</div>
    <div className="workspace-file-info"><a href={href}><h2>{item.name}</h2></a><time dateTime={new Date(item.updated).toISOString()}>{day(item.updated)}</time>
          {item.gone && <p className="workspace-file-gone" title={t('Копия из этого браузера не сохраняется в аккаунт. Создай из неё копию, если она нужна, или убери файл в архив.')}><Icon name="alert" size={14}/>{t('Удалён в аккаунте на другом устройстве')}</p>}</div>
    <div className="workspace-file-actions">
      {here ? <button className="catalog-icon" aria-label={t('Скачать {name}', { name: item.name })} title={t('Скачать для Dota')} disabled={disabled} onClick={onDownload}><Icon name="download"/></button>
        : <a className="catalog-link" href={href}>{fromWorkshop(item.recipe) ? t('Собрать заново') : t('Выбрать файл и собрать')}</a>}
      <button className="catalog-icon" aria-label={t('Открыть {name} как оформление', { name: item.name })} title={t('Открыть как оформление: фон и всё остальное на одной странице')} disabled={disabled} onClick={onLook}><Icon name="template"/></button>
      <button className="catalog-icon" aria-label={t('Переименовать {name}', { name: item.name })} disabled={disabled} onClick={onRename}><Icon name="edit"/></button>
      <button className="catalog-icon" aria-label={t('Удалить {name}', { name: item.name })} disabled={disabled} onClick={onDelete}><Icon name="trash"/></button>
    </div>
  </article>;
}

// An «Оформление» in the studio (src/studio-looks.js): the menu as it will look (the poster) and what it changes.
const PART_NAMES = Object.fromEntries(LOOK_PARTS);
function LookFile({ item, disabled, onRename, onCopy, onDelete }) {
  const [poster, setPoster] = useState('');
  useEffect(() => {
    if (item.cloud || !(item.poster instanceof Blob)) { setPoster(item.cloud && item.poster ? lookPosterURL(item.id) : ''); return undefined; }
    const url = URL.createObjectURL(item.poster); setPoster(url);
    return () => URL.revokeObjectURL(url);
  }, [item.id, item.updated, item.cloud]);
  const href = `${CUSTOMIZE_PATH}?look=${item.id}`, parts = item.parts || [], shown = parts.slice(0, 4);
  return <article className="workspace-file workspace-background workspace-look">
    <a className="workspace-background-picture" href={href} aria-label={t('Открыть оформление {name}', { name: item.name })}>{poster ? <img src={poster} alt=""/> : <span className="workspace-file-empty"><Icon name="template"/></span>}</a>
    <div className="workspace-background-caption"><Icon name="template"/><span>{t('Оформление')} · {parts.length ? t('изменений: {count}', { count: parts.length }) : t('как в Dota')}</span>{item.cloud && <span className="workspace-background-away">{t('в аккаунте')}</span>}</div>
    <ul className="workspace-look-parts" aria-label={t('Что меняет')}>{shown.map((id) => <li key={id}>{t(PART_NAMES[id] || id)}</li>)}{parts.length > shown.length && <li className="is-more">{t('ещё {count}', { count: parts.length - shown.length })}</li>}</ul>
    <div className="workspace-file-info"><a href={href}><h2>{item.name}</h2></a><time dateTime={new Date(item.updated).toISOString()}>{day(item.updated)}</time></div>
    <div className="workspace-file-actions">
      <a className="catalog-link" href={href}>{t('Открыть')}</a>
      <button className="catalog-icon" aria-label={t('Переименовать {name}', { name: item.name })} disabled={disabled} onClick={onRename}><Icon name="edit"/></button>
      <button className="catalog-icon" aria-label={t('Создать копию {name}', { name: item.name })} disabled={disabled} onClick={onCopy}><Icon name="copy"/></button>
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
      <a role="menuitem" href={CUSTOMIZE_PATH}><Icon name="template"/><span><b>{t('Оформление Dota')}</b><small>{t('Фоны, кнопки, HUD, курсор, шрифт — и «Сохранить в Студию»')}</small></span></a>
    </div>}
  </div>;
}

export default function Workspaces({ registry, onOpen }) {
  const auth = useAccount();
  const [items, setItems] = useState([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  // How to install a background just downloaded: its command («Командой PowerShell») or, for the file, its folder.
  const [handed, setHanded] = useState(null), [sending, setSending] = useState(null);
  // A background built again before its download (src/studio-rebuild.js): { stage, share }; `oldVideo` — it went out as it was.
  const [rebuilding, setRebuilding] = useState(null), [oldVideo, setOldVideo] = useState(false);
  const [query, setQuery] = useState(''), [archive, setArchive] = useState(false), [rename, setRename] = useState(null), [name, setName] = useState('');
  const [backgrounds, setBackgrounds] = useState([]), [show, setShow] = useState(initialShow), [removing, setRemoving] = useState(null), [statuses, setStatuses] = useState({});
  const [looks, setLooks] = useState([]);
  // «Оформление» items: this browser's and the account's, synced the way backgrounds are (src/studio-looks.js).
  async function loadLooks() {
    const { items: list, error: problem } = await syncLooks(auth.user?.id || null);
    setLooks(list);
    if (problem) setError((now) => now || t('{message} Оформление из этого браузера доступно.', { message: translateMessage(problem) }));
  }
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
            updated: Math.max(row.updated, old?.updated || 0), archived: !!row.archived, cloudRevision: old?.cloudRevision || 0, remoteRevision: row.revision, gone: false };
          if (old && ['name', 'updated', 'archived', 'remoteRevision', 'configIndex'].every((key) => old[key] === next[key]) && !old.gone && JSON.stringify(old.gridNames) === JSON.stringify(next.gridNames)) continue;
          await registry.put(next); changed = true;
        }
        if (changed) setItems(await registry.list());
      } catch (e) { setError(t('{message} Локальные файлы доступны.', { message: translateMessage(e.message) })); }
    }
    await loadBackgrounds();
    await loadLooks();
  }
  useEffect(() => { if (!auth.loading) refresh().catch(e => { setError(translateMessage(e.message)); setLoading(false); }); }, [auth.user?.id, auth.loading, auth.fileSync.revision, archive]);
  async function run(action) { setBusy(true); setError(''); try { await action(); if (auth.user) await auth.syncFiles(); await refresh(); } catch (e) { setError(translateMessage(e.message)); } finally { setBusy(false); } }
  async function read(meta) {
    const storage = await createProjectStorage(C.importProject, APP_VERSION, meta.id);
    try {
      const initial = await storage.load();
      // A file deleted in the account on another device (gone): this browser's copy is all there is.
      const remote = async () => {
        try { return (await catalogAPI(`/spaces/${cloudWorkspaceId(meta)}`)).document; }
        catch (e) {
          if (e.status !== 404) throw e;
          await registry.update(meta.id, { gone: true }).catch(() => {});
          if (initial.doc) return initial.doc;
          throw new Error(t('Этот файл удалён в аккаунте на другом устройстве, а в этом браузере его копии нет.'));
        }
      };
      if (meta.account && !meta.dirty && !meta.gone) return await remote();
      if (initial.doc) return initial.doc;
      if (meta.account && !meta.gone) return await remote();
      throw new Error(initial.issue || t('В файле нет сохранённого проекта.'));
    }
    finally { storage.database?.close(); }
  }
  async function copy(meta) {
    const doc = await read(meta), account = auth.user?.id || null;
    const created = await registry.create(t('{name} — копия', { name: meta.name.slice(0, 88) }), doc, account);
    if (account) {
      const saved = await catalogAPI(`/spaces/${created.id}`, { method: 'PUT', body: { account, name: created.name, revision: 0, document: doc }, maxBytes: SPACE_REQUEST_BYTES });
      await registry.update(created.id, { cloudRevision: saved.revision, dirty: false, pendingUpload: false });
    }
    track('editor.file', { action: 'duplicate' });
    onOpen(await registry.get(created.id));
  }
  async function changeName(event) {
    event.preventDefault(); if (!name.trim()) return;
    if (rename.look || rename.parts) return run(async () => { await renameLookItem(rename, name.trim(), auth.user?.id || null); setRename(null); });
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
        const result = await catalogAPI(`/spaces/${cloudWorkspaceId(rename)}`, { method: 'PUT', body: { account: rename.account, revision: remote?.revision || rename.cloudRevision || 0, name: name.trim(), document: doc }, maxBytes: SPACE_REQUEST_BYTES });
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
  const newGrid = () => run(async () => { const item = await registry.create(t('Без названия'), C.demoDocument('blank'), auth.user?.id || null); track('editor.file', { action: 'create' }); onOpen(item); });
  const openFile = (item) => { track('editor.file', { action: 'open' }); onOpen(item); };
  // The archive holds grid files only; the studio mixes both, newest first.
  const entries = [...(archive || !['backgrounds', 'looks'].includes(show) ? visible : []).map(item => ({ kind: 'grid', item })),
    ...(!archive && ['all', 'backgrounds'].includes(show) ? backgrounds.filter(item => matches(item.name)) : []).map(item => ({ kind: 'background', item })),
    ...(!archive && ['all', 'looks'].includes(show) ? looks.filter(item => matches(item.name)) : []).map(item => ({ kind: 'look', item }))]
    .sort((a, b) => b.item.updated - a.item.updated);
  const choose = (value) => { const url = new URL(location.href); if (value === 'all') url.searchParams.delete('show'); else url.searchParams.set('show', value); history.replaceState(history.state, '', url); setShow(value); };
  async function download(item) {
    const { downloadPack, packBackground, folderOf } = await import('./customize/background-pack.js');
    const bytes = async (blob) => (blob instanceof Blob ? new Uint8Array(await blob.arrayBuffer()) : null);
    // Videos built before the fix of 22.10.2026 are jerky in Dota: built again from their source first, when it is here.
    setOldVideo(false);
    if (staleBuilt(item)) {
      try { const fresh = await refreshBackground(item, { onProgress: (stage, share) => setRebuilding({ stage, share }) }); item = fresh.record; setOldVideo(fresh.old); }
      finally { setRebuilding(null); }
    }
    let given;
    try { given = await downloadPack(packBackground(await bytes(item.video), item.recipe, await bytes(item.heroVideo), await bytes(item.gridVideo), await bytes(item.loadingVideo)), { ...item.recipe, onProgress: setSending }); }
    finally { setSending(null); }
    // A «Студия» background built again: a file saved, or a command made (its pack id links the installer's report).
    if (given?.command) track('customize.build-done', { delivery: 'command', parts: ['bg'], pack: packOf(given.command) });
    else track('customize.download', {});
    // The install window after every download: the command, or the steps by hand for the file.
    setHanded(given || { target: folderOf(item.recipe.folder) });
  }
  const lead = archive ? t('Файлы, убранные из студии. Их можно вернуть.')
    : show === 'grids' ? t('Сетки героев. В одном файле их может быть несколько.')
    : show === 'backgrounds' ? (auth.user ? t('Готовое видео хранится в этом браузере, настройки — в аккаунте: на другом устройстве фон собирается заново.') : t('Фоны хранятся в этом браузере. Войди, чтобы настройки фонов были и на других устройствах.'))
    : show === 'looks' ? (auth.user ? t('Всё оформление Dota целиком. Настройки и картинки курсора — в аккаунте; свои видео и шрифты остаются в этом браузере.') : t('Всё оформление Dota целиком. Хранится в этом браузере — войди, чтобы оно было и на других устройствах.'))
    : t('Сетки героев, фоны главного меню и оформление Dota.');
  const gridCard = (item) => { const locked = working || uploading(item); return <article className="workspace-file" key={item.id}>
        <WorkspacePreview item={item} disabled={archive || locked} onOpen={index => openFile({ ...item, openConfigIndex: index })}/>
        <div className="workspace-file-info"><button disabled={archive || locked} onClick={() => openFile(item)}><h2>{item.name}</h2></button><time dateTime={new Date(item.updated).toISOString()}>{day(item.updated)}</time></div>
        <div className="workspace-file-actions">{!archive && <><button className="catalog-icon" aria-label={t('Переименовать {name}', { name: item.name })} disabled={locked} onClick={() => { setRename(item); setName(item.name); }}><Icon name="edit"/></button><button className="catalog-icon" aria-label={t('Создать копию {name}', { name: item.name })} disabled={locked} onClick={() => run(() => copy(item))}><Icon name="copy"/></button></>}
        <button className="catalog-icon" aria-label={t(archive ? 'Восстановить {name}' : 'В архив {name}', { name: item.name })} disabled={locked} onClick={() => run(async () => {
          let revision = item.cloudRevision;
          if (item.account && !item.gone) { if (item.dirty) throw new Error(t('Сначала открой файл для синхронизации или создай его копию.')); const base = item.remoteRevision || item.cloudRevision; const result = await catalogAPI(`/spaces/${cloudWorkspaceId(item)}`, { method: 'PATCH', body: { revision: base, archived: !archive } }); if (item.cloudRevision === base) revision = result.revision; }
          await registry.update(item.id, { archived: !archive, cloudRevision: revision });
        })}><Icon name={archive ? 'back' : 'archive'}/></button></div>
      </article>; };
  const empty = (query ? ['Ничего не найдено', 'Попробуй другое название.'] : archive ? ['В архиве пока пусто', 'Здесь можно восстановить файлы, убранные из рабочего списка.']
    : show === 'backgrounds' ? ['Здесь будут твои фоны', 'Собери фон главного меню — после сборки он сохранится здесь, и скачать его снова можно будет в один клик.']
    : show === 'looks' ? ['Здесь будет твоё оформление', 'Настрой фоны, кнопки, HUD, курсор и шрифт на странице «Оформление Dota» и нажми «Сохранить в Студию».']
    : show === 'grids' ? ['Создай первую сетку', 'Начни с пустой сетки или импортируй свой JSON. Вход не обязателен.']
    : ['Создай первый файл', 'Начни с пустой сетки, импортируй свой JSON или собери фон главного меню. Вход не обязателен.']).map((text) => t(text));
  return <div className="catalog-page workspace-page"><header className="workspace-topbar"><Brand/><div><CommunityLink/><AccountButton/></div></header>
    <div className="workspace-shell"><aside className="workspace-sidebar"><nav aria-label={t('Студия')}><button aria-current={!archive ? 'page' : undefined} onClick={() => setArchive(false)}><Icon name="grid"/>{t('Студия')}</button><button aria-current={archive ? 'page' : undefined} onClick={() => setArchive(true)}><Icon name="archive"/>{t('Архив')}</button><a href={CUSTOMIZE_PATH}><Icon name="brush"/>{t('Фон меню')}</a><a href={FONT_PATH}><Icon name="font"/>{t('Шрифты')}</a><a href={CATALOG_PATH}><Icon name="workshop"/>{t('Мастерская')}</a><a href={GUIDES_PATH}><Icon name="guides"/>{t('Гайды')}</a></nav>
      <div className="workspace-sidebar-foot"><CommunityCard/><div className="workspace-storage-note"><strong className="account-profile">{auth.user && <AccountAvatar user={auth.user}/>}<span>{auth.user ? accountLabel(auth.user) : t('Без аккаунта')}</span></strong><p>{auth.user ? auth.fileSync.busy ? t('Сохраняем файлы в аккаунте…') : t('Файлы сохраняются в аккаунте автоматически. Локальные копии остаются в браузере.') : t('Файлы хранятся в этом браузере. Очистка данных или освобождение места браузером может удалить прогресс.')}</p>{!auth.user && <button className="catalog-link" onClick={() => auth.requestLogin()}>{t('Привязать к аккаунту')}</button>}
        <div style={{ marginTop: 12 }}><LanguageSwitch className="workspace-language"/></div></div></div>
    </aside><main className="workspace-main"><header className="files-heading"><div><div className="files-title"><span className="win-icon page-icon" aria-hidden="true"><Icon name={archive ? 'archive' : 'studio'}/></span><h1>{archive ? t('Архив') : t('Студия')}</h1>{!archive && <SegmentSwitch label={t('Что показать')} value={show} options={SHOWS.map(([id, label]) => [id, t(label)])} onChange={choose}/>}<span className="workspace-file-count" aria-live="polite">{t(show === 'backgrounds' && !archive ? 'Фонов: {count}' : show === 'looks' && !archive ? 'Оформлений: {count}' : 'Файлов: {count}', { count: entries.length })}</span></div><p>{lead}</p></div><div className="workspace-actions"><div className="workspace-import-actions"><label className="catalog-search workspace-search"><Icon name="search"/><input placeholder={t('Поиск файлов')} aria-label={t('Поиск файлов')} value={query} onChange={e => setQuery(e.target.value)}/></label><label className="catalog-button workspace-import"><Icon name="download"/>{t('Импорт файла')}<input type="file" accept=".json,application/json" multiple className="catalog-file" disabled={working} onChange={event => {
      const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return;
      run(async () => { const imported = await readGridFiles(files); for (const file of imported) await registry.create(file.name.replace(/\.json$/i, '').slice(0, 100), file.doc, auth.user?.id || null);
        for (const kind of new Set(imported.map(file => (file.project ? 'project' : 'json')))) track('editor.import', { kind }); });
    }}/></label></div><CreateMenu disabled={working} onGrid={newGrid}/></div></header>
      {incoming && <Notice>{t('Выбери файл, в который добавить сетку из мастерской, или создай новый.')}</Notice>}
      {rebuilding && <p className="catalog-muted workspace-sending" role="status">{rebuilding.stage === 'build' ? t('Пересобираем фон, чтобы он не дёргался в Dota… {percent}%', { percent: Math.round(rebuilding.share * 100) }) : t('Загружаем исходный файл фона…')}</p>}
      {oldVideo && <Notice>{t(OLD_VIDEO)}.</Notice>}
      {sending !== null && <p className="catalog-muted workspace-sending" role="status">{t('Отправляем фон на GridStudio… {percent}%', { percent: Math.round(sending * 100) })}</p>}
      {error && <Notice error report>{error}</Notice>}
      {auth.fileSync.error && <Notice error report>{auth.fileSync.error}<button className="catalog-link" disabled={working} onClick={() => auth.syncFiles()}>{t('Повторить сохранение')}</button></Notice>}
      {loading ? <p role="status">{t('Открываем файлы…')}</p> : entries.length ? <section className="workspace-files" aria-label={t('Студия')}>{entries.map(({ kind, item }) => kind === 'grid' ? gridCard(item)
        : kind === 'look' ? <LookFile key={item.id} item={item} disabled={working} onRename={() => { setRename(item); setName(item.name); }} onDelete={() => setRemoving(item)}
          onCopy={() => run(async () => { await duplicateLookItem(item, t('{name} — копия', { name: item.name.slice(0, 88) }), auth.user?.id || null); track('customize.look', { action: 'duplicate' }); })}/>
        : <BackgroundFile key={item.id} item={item} status={statuses[item.id]} disabled={working} onDownload={() => run(() => download(item))} onRename={() => { setRename(item); setName(item.name); }} onDelete={() => setRemoving(item)}
          onLook={() => run(async () => { const record = await lookFromBackground(item, auth.user?.id || null); track('customize.look', { action: 'from-background' }); location.href = `${CUSTOMIZE_PATH}?look=${record.id}&from=background`; })}/>)}</section>
        : <section className="workspace-empty"><Icon name={archive ? 'archive' : show === 'backgrounds' ? 'brush' : show === 'looks' ? 'template' : 'grid'}/><h2>{empty[0]}</h2><p>{empty[1]}</p>
        {!query && !archive && <div className="workspace-empty-actions">{show === 'looks' && <a className="catalog-button primary" href={CUSTOMIZE_PATH}><Icon name="template"/>{t('Оформление Dota')}</a>}{!['backgrounds', 'looks'].includes(show) && <><button className="catalog-button primary" disabled={working} onClick={newGrid}><Icon name="grid"/>{t('Пустая сетка')}</button>
          {/* 2026-10-19: most people want a ready grid, not a blank file. */}<a className="catalog-button" href={CATALOG_PATH}><Icon name="workshop"/>{t('Готовая сетка из Мастерской')}</a></>}{['all', 'backgrounds'].includes(show) && <a className={`catalog-button${show === 'backgrounds' ? ' primary' : ''}`} href={CUSTOMIZE_PATH}><Icon name="brush"/>{t('Фон меню')}</a>}</div>}</section>}
    </main></div>{handed && <Modal title={t('Как установить фон')} icon="download" onClose={() => setHanded(null)}><div className="catalog-confirm workspace-install">
      {handed.command ? <><p>{t('Фон сохранён на GridStudio на 7 дней — команда скачает именно его, ничего искать не нужно.')} {rich(t('Открой PowerShell ({key}, набери PowerShell, {enter}), вставь команду и нажми {enter}.'), { key: <kbd>Win</kbd>, enter: <kbd>Enter</kbd> })}</p>
        <CommandCopy text={handed.command}/>
        <p className="catalog-muted">{t('Убрать фон — вставь в PowerShell:')}</p><CommandCopy text={handed.remove} small/></>
        : <BackgroundSteps target={handed.target}/>}
    </div></Modal>}{rename && <Modal title={rename.parts ? t('Название оформления') : rename.recipe ? t('Название фона') : t('Имя файла')} icon="edit" onClose={() => setRename(null)}><form className="catalog-login-flow" onSubmit={changeName}><label>{t('Название')}<input value={name} maxLength={100} autoFocus onChange={e => setName(e.target.value)} required/></label><button className="catalog-button primary" disabled={working || !name.trim()}>{t('Сохранить')}</button>{error && <Notice error>{error}</Notice>}</form></Modal>}
    {removing && <Modal title={removing.parts ? t('Удалить оформление?') : t('Удалить фон?')} icon="trash" tone="danger" onClose={() => setRemoving(null)}><div className="catalog-confirm"><p>{t(removing.account ? '«{name}» исчезнет из студии на всех устройствах.' : '«{name}» исчезнет из студии.', { name: removing.name })} {t('Файлы, которые ты уже скачал, останутся.')}</p>
      <div className="catalog-actions"><button className="catalog-button" onClick={() => setRemoving(null)}>{t('Оставить')}</button><button className="catalog-button danger" disabled={working} onClick={() => run(async () => {
        if (removing.parts) { await removeLookItem(removing, auth.user?.id || null); setRemoving(null); return; }
        if (!removing.cloud) await deleteBackground(removing.id);
        if (auth.user && removing.account === auth.user.id && (removing.synced || removing.cloud)) await dropRecipe(removing.id);
        setRemoving(null);
      })}>{t('Удалить')}</button></div></div></Modal>}</div>
}
