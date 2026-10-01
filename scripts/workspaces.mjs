import C from './core.mjs';
import { createProjectStorage, openProjectDatabase } from './project-storage.mjs';
import { APP_VERSION } from './version.mjs';
import { selectedCatalogGrid } from './catalog-document.mjs';
import { t } from './i18n.mjs';

const PREFIX = 'gridstudio.workspace.info.';
const SESSION_KEY = 'gridstudio.workspace-session.v1';
const activeFiles = new Map();
export const cloudWorkspaceId = meta => meta.cloudId || meta.id;
// Navigation belongs to the tab, not to the shared document or its backups.
export function rememberWorkspace(position, session) {
  try {
    const target = session ?? globalThis.sessionStorage;
    if (position) target?.setItem(SESSION_KEY, JSON.stringify({ id: position.id, configIndex: position.configIndex }));
    else target?.removeItem(SESSION_KEY);
  } catch { /* Restricted browser storage must not block opening or leaving a file. */ }
}
export async function resumeWorkspace(registry, user, session) {
  let position;
  try { position = JSON.parse((session ?? globalThis.sessionStorage)?.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
  if (!position || typeof position.id !== 'string') return null;
  const meta = await registry.get(position.id);
  if (!meta || meta.archived || (meta.account && meta.account !== user?.id)) {
    rememberWorkspace(null, session);
    return null;
  }
  return { ...meta, openConfigIndex: Number.isInteger(position.configIndex) && position.configIndex >= 0 ? position.configIndex : undefined };
}
export async function enterWorkspace(registry, user, { url = new URL(globalThis.location.href), history = globalThis.history, session } = {}) {
  // Studio links open the file list even if this tab last edited a file (e.g. a blank one from the landing).
  // The flag is consumed so a reload inside a file opened from the list resumes that file.
  if (url.searchParams.has('files')) {
    rememberWorkspace(null, session);
    url.searchParams.delete('files');
    history.replaceState(history.state, '', url);
    return null;
  }
  if (url.searchParams.get('new') !== '1') return resumeWorkspace(registry, user, session);
  const meta = await registry.create(t('Без названия'), C.demoDocument('blank'), user?.id || null);
  rememberWorkspace({ id: meta.id, configIndex: 0 }, session);
  // Consume the landing action only after the new document is durably saved.
  url.searchParams.delete('new');
  history.replaceState(history.state, '', url);
  return { ...meta, openConfigIndex: 0 };
}
export function registerActiveWorkspace(id, client) {
  activeFiles.set(id, client);
  return () => { if (activeFiles.get(id) === client) activeFiles.delete(id); };
}
export class WorkspaceRegistry {
  constructor(database, local) { this.database = database; this.local = local; }
  async list() {
    const map = new Map();
    try { for (let i = 0; i < this.local.length; i++) { const key = this.local.key(i); if (key.startsWith(PREFIX)) { const item = JSON.parse(this.local.getItem(key)); map.set(item.id, item); } } } catch { /* IDB remains independent. */ }
    try { for (const row of await this.database?.list() || []) { if (!map.has(row.id) || row.touched >= map.get(row.id).touched) map.set(row.id, row); } } catch { /* Browser mirror remains. */ }
    return [...map.values()].filter(v => v.id && v.name).sort((a, b) => b.updated - a.updated);
  }
  async get(id) { return (await this.list()).find(x => x.id === id); }
  async put(item) {
    const value = { ...item, key: item.id, touched: Date.now() }; let saved = false;
    try { await this.database?.archive(value); saved = !!this.database; } catch { /* Mirror fallback. */ }
    try { this.local.setItem(PREFIX + item.id, JSON.stringify(value)); saved = true; } catch { /* IDB fallback. */ }
    if (!saved) throw new Error(t('Не удалось сохранить список файлов. Освободи место или скачай проект.'));
    return value;
  }
  async update(id, changes) { const old = await this.get(id); if (!old) throw new Error(t('Файл не найден.')); return this.put({ ...old, ...changes }); }
  async create(name, document = C.demoDocument('blank'), account = null) {
    const id = crypto.randomUUID(), storage = await createProjectStorage(C.importProject, APP_VERSION, id);
    try {
      await storage.load(); const result = await storage.save(document);
      if (!result.saved || result.recoveryOnly) throw new Error(t('Не удалось сохранить новый файл.'));
      return await this.put({ id, name, account, cloudRevision: 0, dirty: !!account, pendingUpload: !!account, updated: Date.now(), ...describe(document) });
    } finally { storage.database?.close(); }
  }
  async ensureLegacy() {
    if (await this.get('legacy')) return;
    const storage = await createProjectStorage(C.importProject, APP_VERSION);
    try {
      const initial = await storage.load();
      if (initial.hasData) await this.put({ id: 'legacy', name: initial.doc?.name || t('Восстановление прежнего проекта'), account: null,
        cloudRevision: 0, dirty: false, updated: Date.now(), issue: initial.issue, ...(initial.doc ? describe(initial.doc) : {}) });
    } finally { storage.database?.close(); }
  }
}
async function assignAccount(registry, id, user) {
  const current = await registry.get(id);
  if (current.account && current.account !== user.id) throw new Error(t('Файл уже привязан к другому аккаунту.'));
  if (current.account) return current;
  return registry.update(id, { account: user.id, cloudId: current.cloudId || (id === 'legacy' ? crypto.randomUUID() : id), dirty: true, pendingUpload: true });
}

// Assignment is durable before sending. Retrying a lost response uses the same
// remote UUID; the local document and its original backup keys never move.
export async function attachGuestWorkspaces(registry, api, user, isCurrent = () => true) {
  if (!user) return [];
  const transfer = async () => {
    const errors = [];
    for (const entry of await registry.list()) {
      if (!isCurrent()) break;
      if (entry.account && (entry.account !== user.id || !entry.pendingUpload)) continue;
      let storage;
      try {
        const active = activeFiles.get(entry.id);
        if (active) { await active.flush(); if (isCurrent()) await active.attach(user); continue; }
        storage = await createProjectStorage(C.importProject, APP_VERSION, entry.id);
        const initial = await storage.load();
        if (!initial.doc || storage.blocked || storage.conflicted) throw new Error(t('Сначала восстанови сохранённый проект.'));
        if (!isCurrent()) break;
        const meta = await assignAccount(registry, entry.id, user);
        const snapshot = JSON.stringify(initial.doc);
        const result = await api(`/spaces/${cloudWorkspaceId(meta)}`, { method: 'PUT', body: { account: user.id, name: meta.name,
          revision: meta.cloudRevision || 0, archived: !!meta.archived, document: initial.doc } });
        // Another tab may have written during upload. Keep that newer local work dirty.
        const latest = await storage.load();
        await registry.update(meta.id, { cloudRevision: result.revision, pendingUpload: false, dirty: JSON.stringify(latest.doc) !== snapshot });
      } catch (error) { errors.push(`${entry.name}: ${error.message}`); }
      finally { storage?.database?.close(); }
    }
    return errors;
  };
  return globalThis.navigator?.locks?.request ? navigator.locks.request('gridstudio-attach-files', transfer) : transfer();
}
export function describe(doc) {
  let preview = null;
  try { preview = selectedCatalogGrid(doc); if (JSON.stringify(preview).length > 120_000) preview = null; } catch { /* Private files can be larger than public grids. */ }
  return { preview, grids: doc.source.configs.length };
}
export async function openWorkspaceRegistry() {
  let database = null, local = null;
  try { database = await openProjectDatabase(globalThis.indexedDB, 'registry:'); } catch { /* local fallback. */ }
  try { local = globalThis.localStorage; } catch { /* IDB fallback. */ }
  const registry = new WorkspaceRegistry(database, local); await registry.ensureLegacy(); return registry;
}

// Server writes are serialized and compare revisions. Local autosave completes
// independently; a network failure never discards or rolls back local edits.
export async function openWorkspace(meta, registry, api, user, onStatus = () => {}, { retryDelay = 2000 } = {}) {
  if (meta.account && meta.account !== user?.id) throw new Error(t('Войди в Telegram-аккаунт, к которому привязан файл.'));
  const storage = await createProjectStorage(C.importProject, APP_VERSION, meta.id);
  let initial = await storage.load(), cloudRevision = meta.cloudRevision || 0, generation = 0, cloudQueue = Promise.resolve(), paused = false;
  let latestDocument = initial.doc;
  let pending = null, timer = null, deadline = null, retry = null, retries = 0;
  const saveLocal = storage.save.bind(storage);
  if (meta.account) {
    try {
      const remote = await api(`/spaces/${cloudWorkspaceId(meta)}`);
      if (remote.archived) throw new Error(t('Файл находится в архиве. Восстанови его в списке файлов.'));
      if (remote.revision !== cloudRevision && meta.dirty) {
        paused = true; onStatus(t('Конфликт версий. Твоя работа сохранена локально; создай копию в списке файлов.'));
      } else if (!initial.doc || remote.revision !== cloudRevision) {
        if (initial.doc) await storage.prepareRestore(JSON.stringify(remote.document), initial.doc);
        const result = await saveLocal(remote.document);
        if (!result.saved || result.recoveryOnly) throw new Error(t('Не удалось сохранить серверную копию локально.'));
        initial = { doc: remote.document, hasData: true, issue: '' }; cloudRevision = remote.revision;
        latestDocument = remote.document;
        meta = await registry.update(meta.id, { cloudRevision, dirty: false, pendingUpload: false, name: remote.name, ...describe(remote.document) });
      }
    } catch (error) {
      if (!initial.doc) { storage.database?.close(); throw error; }
      if (!(error.status === 404 && cloudRevision === 0)) { paused = true; onStatus(t('{message} Работа продолжается локально.', { message: error.message })); }
    }
  }
  // The progress statuses stay Russian: save-status.mjs knows them by text, and the editor
  // translates what it shows. Errors are in the page's language.
  function sync(doc, revision) {
    cloudQueue = cloudQueue.then(async () => {
      if (!meta.account || paused) return;
      const current = await registry.get(meta.id);
      onStatus('Сохраняем в аккаунт…');
      try {
        const result = await api(`/spaces/${cloudWorkspaceId(meta)}`, { method: 'PUT', body: { name: current.name, account: meta.account, revision: cloudRevision, document: doc } });
        cloudRevision = result.revision; retries = 0;
        await registry.update(meta.id, { cloudRevision, pendingUpload: false, dirty: generation !== revision });
        onStatus(generation === revision ? 'Сохранено в аккаунте' : 'Сохраняем в аккаунт…');
      } catch (error) {
        if ([401, 403, 404, 409].includes(error.status)) paused = true;
        else if (!error.status || error.status >= 500 || error.status === 429) retryLater(doc, revision);
        onStatus(t('{message} Локальная копия сохранена.', { message: error.message }));
      }
    }).catch(() => onStatus(t('Не удалось обновить список файлов. Локальная копия сохранена.')));
  }
  // An API restart or deploy drops requests for a moment. Resend the last edit
  // without waiting for the next change; after ~2 minutes the next edit or
  // reopening the file resumes the upload, as before.
  function retryLater(doc, revision) {
    if (retries >= 6) return;
    clearTimeout(retry);
    retry = setTimeout(() => {
      retry = null;
      // A newer edit already has its own upload scheduled.
      if (revision === generation && !pending) pending = { doc, revision };
      flushCloud();
    }, Math.min(60_000, retryDelay * 2 ** retries++));
  }
  function flushCloud() {
    clearTimeout(timer); clearTimeout(deadline); timer = deadline = null;
    if (pending) { const next = pending; pending = null; sync(next.doc, next.revision); }
    return cloudQueue;
  }
  function scheduleCloud(doc, revision) {
    if (!meta.account || paused) return;
    pending = { doc: C.clone(doc), revision }; retries = 0; clearTimeout(timer);
    timer = setTimeout(flushCloud, 1500); deadline ||= setTimeout(flushCloud, 5000);
    onStatus('Сохранено локально · ждёт синхронизации');
  }
  storage.save = async doc => {
    const snapshot = C.clone(doc);
    const result = await saveLocal(doc);
    if (result.saved && !result.recoveryOnly && !result.conflict && !result.blocked) {
      // A sign-in in another tab can have attached this already-open guest file.
      const current = await registry.get(meta.id);
      if (!meta.account && current.account) { meta = current; cloudRevision = current.cloudRevision || 0; }
      latestDocument = snapshot;
      generation++;
      const updated = Date.now();
      await registry.update(meta.id, { dirty: !!meta.account, updated, ...describe(doc) });
      // The Studio's pictures of this file (workspace-thumbnails.mjs), drawn once edits pause.
      if (typeof document !== 'undefined')
        import('./workspace-thumbnails.mjs').then(({ scheduleThumbnails }) => scheduleThumbnails(meta.id, snapshot, updated)).catch(() => {});
      scheduleCloud(snapshot, generation);
    }
    return result;
  };
  storage.syncPending = flushCloud;
  storage.attachAccount = async user => {
    await storage.queue;
    if (!latestDocument || storage.blocked || storage.conflicted) throw new Error(t('Сначала восстанови сохранённый проект.'));
    meta = await assignAccount(registry, meta.id, user);
    cloudRevision = meta.cloudRevision || 0;
    paused = false;
    scheduleCloud(latestDocument, generation);
    await flushCloud();
    if ((await registry.get(meta.id)).pendingUpload) throw new Error(t('Не удалось отправить файл. Локальная копия сохранена.'));
  };
  if (meta.account && meta.dirty && initial.doc && !paused) scheduleCloud(initial.doc, generation);
  return { storage, initial };
}
