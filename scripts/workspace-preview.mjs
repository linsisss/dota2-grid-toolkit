import C from './core.mjs';
import { createProjectStorage } from './project-storage.mjs';
import { APP_VERSION } from './version.mjs';
import { cloudWorkspaceId } from './workspaces.mjs';
import { t } from './i18n.mjs';

export function workspaceGridPreview(document, index) {
  if (!Number.isInteger(index) || index < 0 || index >= document.source.configs.length) throw new Error(t('Сетка не найдена.'));
  // Read the live state or the saved draft, not the original imported categories.
  const state = index === document.configIndex ? document : document.configDrafts?.[index];
  if (!state) return { version: 3, configs: [C.clone(document.source.configs[index])] };
  const single = { ...state, source: { version: 3, configs: [document.source.configs[index]] }, configIndex: 0, configDrafts: {} };
  // Private previews are not publications: don't apply the catalog's smaller limits.
  return C.exportDota(single, null, { compactRows: false });
}

export async function readWorkspacePreview(meta, api, signal) {
  const storage = await createProjectStorage(C.importProject, APP_VERSION, meta.id);
  let local;
  try { local = await storage.load(); } finally { storage.database?.close(); }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const cloudIsCurrent = !meta.remoteRevision || meta.remoteRevision === meta.cloudRevision;
  if (local.doc && (!meta.account || meta.dirty || cloudIsCurrent)) return { document: local.doc };
  if (meta.account) {
    try { return { document: (await api(`/spaces/${cloudWorkspaceId(meta)}`, { signal })).document }; }
    catch (error) { if (signal?.aborted || !local.doc) throw error; return { document: local.doc, offline: true }; }
  }
  throw new Error(local.issue || t('Не удалось прочитать файл для превью.'));
}
