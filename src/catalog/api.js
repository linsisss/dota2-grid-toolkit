// The workshop lives at /workshop; nginx sends the former /catalog links there with their query and #hash.
export const CATALOG_PATH = `./${import.meta.env.VITE_EDITOR_ENTRY ? 'catalog.html' : 'workshop'}`;
export const RULES_PATH = `${CATALOG_PATH}?rules`;
// Dota customization (menu background, font): /background (/customize until 1.6.3, which now
// redirects), customize.html on static hosting.
export const CUSTOMIZE_PATH = `./${import.meta.env.VITE_EDITOR_ENTRY ? 'customize.html' : 'background'}`;
export const EDITOR_PATH = `./${import.meta.env.VITE_EDITOR_ENTRY || 'editor'}`;
// The file list itself; plain EDITOR_PATH reopens the file this tab last edited.
export const STUDIO_PATH = `${EDITOR_PATH}?files=1`;
export async function catalogAPI(path, { method = 'GET', body, token, signal } = {}) {
  let response;
  try { response = await fetch(`/api/catalog${path}`, { method, credentials: 'same-origin', referrerPolicy: 'no-referrer',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: signal || AbortSignal.timeout(15000) }); }
  catch (error) { if (signal?.aborted) throw error; throw new Error('Нет связи с мастерской. Проверь подключение и попробуй ещё раз.'); }
  let value;
  try { value = await response.json(); } catch { throw new Error('Мастерская сейчас недоступна. Редактор и скачивание файла продолжают работать.'); }
  if (!response.ok) throw Object.assign(new Error(value.error || 'Не удалось выполнить запрос.'), { status: response.status, duplicateId: value.duplicateId });
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
  const url = URL.createObjectURL(new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'hero_grid_config.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Which own submission this tab opened in the editor, so publishing can update it in place.
const EDITING_KEY = 'gridstudio.catalog.editing.v1';
export function rememberEditing(id) { try { sessionStorage.setItem(EDITING_KEY, id); } catch { /* Only the preselection is lost. */ } }
export function editingWork() { try { return sessionStorage.getItem(EDITING_KEY) || ''; } catch { return ''; } }
export function forgetEditing() { try { sessionStorage.removeItem(EDITING_KEY); } catch { /* Nothing to forget. */ } }
export const ownedToken = id => ownedWorks().find(item => item.id === id)?.token;
