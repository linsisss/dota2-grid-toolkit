import { useEffect, useState } from 'react';
import { AccountButton, AccountAvatar, accountLabel, useAccount } from './catalog/Account.jsx';
import { Brand, Icon, Modal, Notice } from './catalog/Common.jsx';
import WorkspacePreview from './WorkspacePreview.jsx';
import { catalogAPI, CATALOG_PATH } from './catalog/api.js';
import { createProjectStorage } from '../scripts/project-storage.mjs';
import { readGridFiles } from '../scripts/grid-import.mjs';
import C from '../scripts/core.mjs';
import { APP_VERSION } from '../scripts/version.mjs';
import { cloudWorkspaceId } from '../scripts/workspaces.mjs';

export default function Workspaces({ registry, onOpen }) {
  const auth = useAccount();
  const [items, setItems] = useState([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [archive, setArchive] = useState(false), [rename, setRename] = useState(null), [name, setName] = useState('');
  async function refresh() {
    setError('');
    if (auth.user) {
      try {
        const result = await catalogAPI(`/spaces?archived=${archive ? '1' : '0'}`);
        const local = await registry.list();
        for (const row of result.items) {
          const old = local.find(item => cloudWorkspaceId(item) === row.id && item.account === row.account);
          await registry.put({ ...row, ...(old || {}), id: old?.id || row.id, cloudId: row.id, account: row.account,
            name: old?.dirty ? old.name : row.name, preview: old?.dirty ? old.preview : row.preview,
            updated: Math.max(row.updated, old?.updated || 0), archived: !!row.archived, cloudRevision: old?.cloudRevision || 0, remoteRevision: row.revision });
        }
      } catch (e) { setError(`${e.message} Локальные файлы доступны.`); }
    }
    setItems(await registry.list()); setLoading(false);
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
  const working = busy || auth.fileSync.busy;
  const visible = items.filter(item => (!item.account || item.account === auth.user?.id) && !!item.archived === archive && item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const incoming = new URLSearchParams(location.search).has('catalog');
  return <div className="catalog-page workspace-page"><header className="workspace-topbar"><Brand/><div><a className="catalog-link" href={CATALOG_PATH}>Мастерская</a><AccountButton/></div></header>
    <div className="workspace-shell"><aside className="workspace-sidebar"><nav aria-label="Файлы"><button aria-current={!archive ? 'page' : undefined} onClick={() => setArchive(false)}><Icon name="grid"/>Мои файлы</button><button aria-current={archive ? 'page' : undefined} onClick={() => setArchive(true)}><Icon name="archive"/>Архив</button><a href={CATALOG_PATH}>Мастерская<Icon name="arrow"/></a></nav>
      <div className="workspace-storage-note"><strong className="account-profile">{auth.user && <AccountAvatar user={auth.user}/>}<span>{auth.user ? accountLabel(auth.user) : 'Без аккаунта'}</span></strong><p>{auth.user ? auth.fileSync.busy ? 'Сохраняем файлы в аккаунте…' : 'Файлы сохраняются в аккаунте автоматически. Локальные копии остаются в браузере.' : 'Файлы хранятся в этом браузере. Очистка данных или освобождение места браузером может удалить прогресс.'}</p>{!auth.user && <button className="catalog-link" onClick={() => auth.requestLogin()}>Привязать Telegram</button>}</div>
    </aside><main className="workspace-main"><header className="files-heading"><div><div className="files-title"><h1>{archive ? 'Архив' : 'Мои файлы'}</h1><span className="workspace-file-count" aria-live="polite">Файлов: {visible.length}</span></div><p>Одно пространство — один файл. Внутри может быть несколько сеток.</p></div><div className="workspace-actions"><div className="workspace-import-actions"><label className="catalog-search workspace-search"><Icon name="search"/><input placeholder="Поиск файлов" aria-label="Поиск файлов" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="catalog-button workspace-import"><Icon name="download"/>Импорт файла<input type="file" accept=".json,application/json" multiple className="catalog-file" disabled={working} onChange={event => {
      const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return;
      run(async () => { const imported = await readGridFiles(files); for (const file of imported) await registry.create(file.name.replace(/\.json$/i, '').slice(0, 100), file.doc, auth.user?.id || null); });
    }}/></label></div><button className="catalog-button primary" disabled={working} onClick={() => run(async () => { const item = await registry.create('Без названия', C.demoDocument('blank'), auth.user?.id || null); onOpen(item); })}><Icon name="plus"/>Новый файл</button></div></header>
      {incoming && <Notice>Выбери файл, в который добавить сетку из мастерской, или создай новый.</Notice>}
      {error && <Notice error>{error}</Notice>}
      {auth.fileSync.error && <Notice error>{auth.fileSync.error}<button className="catalog-link" disabled={working} onClick={() => auth.syncFiles()}>Повторить сохранение</button></Notice>}
      {loading ? <p role="status">Открываем файлы…</p> : visible.length ? <section className="workspace-files" aria-label="Рабочие пространства">{visible.map(item => <article className="workspace-file" key={item.id}>
        <WorkspacePreview item={item} disabled={archive || working} onOpen={index => onOpen({ ...item, openConfigIndex: index })}/>
        <div className="workspace-file-info"><button disabled={archive || working} onClick={() => onOpen(item)}><h2>{item.name}</h2></button><time dateTime={new Date(item.updated).toISOString()}>{new Date(item.updated).toLocaleDateString('ru-RU')}</time></div>
        <div className="workspace-file-actions">{!archive && <><button className="catalog-icon" aria-label={`Переименовать ${item.name}`} disabled={working} onClick={() => { setRename(item); setName(item.name); }}><Icon name="edit"/></button><button className="catalog-icon" aria-label={`Создать копию ${item.name}`} disabled={working} onClick={() => run(() => copy(item))}><Icon name="copy"/></button></>}
        <button className="catalog-icon" aria-label={`${archive ? 'Восстановить' : 'В архив'} ${item.name}`} disabled={working} onClick={() => run(async () => {
          let revision = item.cloudRevision;
          if (item.account) { if (item.dirty) throw new Error('Сначала открой файл для синхронизации или создай его копию.'); const base = item.remoteRevision || item.cloudRevision; const result = await catalogAPI(`/spaces/${cloudWorkspaceId(item)}`, { method: 'PATCH', body: { revision: base, archived: !archive } }); if (item.cloudRevision === base) revision = result.revision; }
          await registry.update(item.id, { archived: !archive, cloudRevision: revision });
        })}><Icon name={archive ? 'back' : 'archive'}/></button></div>
      </article>)}</section> : <section className="workspace-empty"><Icon name={archive ? 'archive' : 'grid'}/><h2>{query ? 'Файлы не найдены' : archive ? 'В архиве пока пусто' : 'Создай первый файл'}</h2><p>{query ? 'Попробуй другое название.' : archive ? 'Здесь можно восстановить файлы, убранные из рабочего списка.' : 'Начни с пустой сетки или импортируй свой JSON. Вход не обязателен.'}</p></section>}
    </main></div>{rename && <Modal title="Имя файла" onClose={() => setRename(null)}><form className="catalog-login-flow" onSubmit={changeName}><label>Название<input value={name} maxLength={100} autoFocus onChange={e => setName(e.target.value)} required/></label><button className="catalog-button primary" disabled={working || !name.trim()}>Сохранить</button>{error && <Notice error>{error}</Notice>}</form></Modal>}</div>;
}
