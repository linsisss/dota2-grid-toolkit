import { lang, t, translateMessage } from '../../scripts/i18n.mjs';
import { installCommand } from '../../scripts/installer.mjs';
import { GRID_NOTE, withGridNote } from '../../scripts/grid-note.mjs';
// The workshop lives at /workshop; nginx sends the former /catalog links there with their query and #hash.
export const CATALOG_PATH = `./${import.meta.env.VITE_EDITOR_ENTRY ? 'catalog.html' : 'workshop'}`;
export const RULES_PATH = `${CATALOG_PATH}?rules`;
// Dota customization (menu background, font): /background (/customize until 1.6.3, which now
// redirects), customize.html on static hosting.
export const CUSTOMIZE_PATH = `./${import.meta.env.VITE_EDITOR_ENTRY ? 'customize.html' : 'background'}`;
export const FONT_PATH = `${CUSTOMIZE_PATH}?tab=font`;
export const EDITOR_PATH = `./${import.meta.env.VITE_EDITOR_ENTRY || 'editor'}`;
// The file list itself; plain EDITOR_PATH reopens the file this tab last edited.
export const STUDIO_PATH = `${EDITOR_PATH}?files=1`;
// «Гайды» (src/guides/), guides.html on static hosting.
export const GUIDES_PATH = `./${import.meta.env.VITE_EDITOR_ENTRY ? 'guides.html' : 'guides'}`;
const TOO_LARGE = 'Файл больше 20 МБ и не помещается в аккаунт. Изменения сохранены на этом устройстве — скачай резервную копию.';
// `raw`: a file sent as it is (application/octet-stream), e.g. a profile picture.
// `maxBytes`: a body larger than that fails here (status 413) instead of being uploaded to be refused.
export async function catalogAPI(path, { method = 'GET', body, raw, token, signal, maxBytes } = {}) {
  const json = body ? JSON.stringify(body) : null;
  if (maxBytes && json && new Blob([json]).size > maxBytes) throw Object.assign(new Error(t(TOO_LARGE)), { status: 413 });
  let response;
  try { response = await fetch(`/api/catalog${path}`, { method, credentials: 'same-origin', referrerPolicy: 'no-referrer',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : raw ? { 'Content-Type': 'application/octet-stream' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(json ? { body: json } : raw ? { body: raw } : {}), signal: signal || AbortSignal.timeout(raw ? 60000 : 15000) }); }
  catch (error) { if (signal?.aborted) throw error; throw new Error(t('Нет связи с мастерской. Проверь подключение и попробуй ещё раз.')); }
  let value;
  // Not JSON: nginx itself answered (body over its limit, API restarting).
  try { value = await response.json(); } catch { throw Object.assign(new Error(t(response.status === 413 ? TOO_LARGE : 'Мастерская сейчас недоступна. Редактор и скачивание файла продолжают работать.')), { status: response.status }); }
  if (!response.ok) throw Object.assign(new Error(value.error ? translateMessage(value.error) : t('Не удалось выполнить запрос.')), { status: response.status, duplicateId: value.duplicateId });
  return value;
}
const OWNERS_KEY = 'gridstudio.catalog.ownership.v1';
export function ownedWorks() {
  try { const value = JSON.parse(localStorage.getItem(OWNERS_KEY) || '[]'); return Array.isArray(value) ? value.filter(x => /^[a-f0-9-]{36}$/.test(x.id) && /^[\w-]{43}$/.test(x.token)).slice(0, 100) : []; } catch { return []; }
}
export function rememberWork(item) {
  try { localStorage.setItem(OWNERS_KEY, JSON.stringify([item, ...ownedWorks().filter(x => x.id !== item.id)].slice(0, 100))); return true; } catch { return false; }
}
export function forgetWork(id) { try { localStorage.setItem(OWNERS_KEY, JSON.stringify(ownedWorks().filter(x => x.id !== id))); } catch {} }
export function managementLink(id, token) {
  const url = new URL(CATALOG_PATH, location.href); url.searchParams.set('id', id); url.hash = `manage=${token}`; return url.href;
}
// Made to hold on the hero-pick screen first (pick-safe.js, loaded on the first download).
export async function downloadGrid(grid) {
  const safe = await import('./pick-safe.js').then(({ pickSafeGrid }) => pickSafeGrid(grid)).catch(() => grid);
  const url = URL.createObjectURL(new Blob([JSON.stringify(withGridNote(safe, t(GRID_NOTE)), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'hero_grid_config.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// The same grid by a PowerShell command (server/grid-installs.mjs, scripts/installer.mjs): stored on
// the site for a week; → the command that puts it into the folder of the account signed in to Steam.
// A workshop grid ('work') or background downloaded: the counter on its card (server: one a visitor a day).
export function countDownload(kind, id) {
  if (!id) return;
  fetch(`/api/catalog/${kind === 'background' ? 'backgrounds' : 'works'}/${id}/downloaded`, { method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
}
export async function gridInstallCommand(grid) {
  const safe = await import('./pick-safe.js').then(({ pickSafeGrid }) => pickSafeGrid(grid)).catch(() => grid);
  const result = await catalogAPI('/install', { method: 'POST', body: { grid: withGridNote(safe, t(GRID_NOTE)), lang } });
  return installCommand(result.address);
}
export const gridRestoreCommand = () => installCommand(`${location.origin}/api/catalog/install/${lang === 'en' ? 'restore-en' : 'restore'}`);
// Which own submission this tab opened in the editor, so publishing can update it in place.
const EDITING_KEY = 'gridstudio.catalog.editing.v1';
export function rememberEditing(id) { try { sessionStorage.setItem(EDITING_KEY, id); } catch { /* Only the preselection is lost. */ } }
export function editingWork() { try { return sessionStorage.getItem(EDITING_KEY) || ''; } catch { return ''; } }
export function forgetEditing() { try { sessionStorage.removeItem(EDITING_KEY); } catch { /* Nothing to forget. */ } }
export const ownedToken = id => ownedWorks().find(item => item.id === id)?.token;
