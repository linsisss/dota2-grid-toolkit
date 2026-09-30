import C from './core.mjs';
import { drawCatalogGrid } from './catalog-rendering.mjs';
import { createProjectStorage } from './project-storage.mjs';
import { portrait } from './portraits.mjs';
import { APP_VERSION } from './version.mjs';
import { workspaceGridPreview } from './workspace-preview.mjs';

// «Студия» shows grid files as pictures (1.6.1, docs/accounts-workspaces.md «Превью файлов»): one
// transparent WebP per grid of a file, drawn after the editor saves it and kept in this browser's
// IndexedDB — its own database, not the registry that is mirrored to localStorage. The Studio no
// longer opens documents for its cards: reading each file with all its backups and drawing
// thousands of labels per card froze it for up to 35 s. The ground (Dota backdrop, gradient or
// «Мой фон») is painted under the picture, so the preview switch still applies. Files saved
// before 1.6.1 get their pictures once, one file at a time, from their latest save only.
export const THUMBNAIL_VERSION = 1;
// Cards show about 318 CSS px; 716 keeps them sharp at 2×.
export const THUMBNAIL_WIDTH = 716, THUMBNAIL_HEIGHT = Math.round(593 * THUMBNAIL_WIDTH / 1193);
export const THUMBNAILS_EVENT = 'gridstudio:thumbnails';
const DATABASE = 'gridstudio-thumbnails', STORE = 'files';

let opening = null;
function database() {
  opening ||= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB недоступна.'));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
    request.onerror = () => { opening = null; reject(request.error); };
  });
  return opening;
}
async function transaction(mode, run) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); let result;
    run(tx.objectStore(STORE), (value) => { result = value; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Запись не завершена.'));
  });
}
// { id, updated, version, configIndex, grids: [{ name, image: Blob }] } or null.
export const readThumbnails = (id) => transaction('readonly', (store, done) => { store.get(id).onsuccess = (event) => done(event.target.result || null); }).catch(() => null);
export const dropThumbnails = (id) => transaction('readwrite', (store) => store.delete(id)).catch(() => {});
async function writeThumbnails(record) {
  await transaction('readwrite', (store) => store.put(record));
  globalThis.dispatchEvent?.(new CustomEvent(THUMBNAILS_EVENT, { detail: record.id }));
}
// Pictures of the file as the registry knows it (its `updated` stamp from the last local save).
export const freshThumbnails = (record, item) => !!record && record.version === THUMBNAIL_VERSION && record.updated >= (item.updated || 0);

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
// One picture per grid, each in its own task, so a big file never blocks input for long. A grid
// that has not changed since it was last drawn on this page keeps its picture: an edit usually
// touches one grid of a file.
const drawn = new Map();
export async function renderThumbnails(doc, id = '') {
  await document.fonts.load('600 16px StudioRadiance', 'MID DIFF SUPPORT');
  const grids = [];
  for (let index = 0; index < doc.source.configs.length; index++) {
    const grid = workspaceGridPreview(doc, index), categories = grid.configs[0].categories;
    const key = JSON.stringify(grid), known = drawn.get(`${id}:${index}`);
    if (id && known?.key === key) { grids.push({ name: grid.configs[0].config_name || `Сетка ${index + 1}`, image: known.image }); continue; }
    if (categories.some((category) => HANGUL.test(category.category_name))) await document.fonts.load('600 16px StudioDotaKorean', '멈추지').catch(() => {});
    const ids = [...new Set(categories.flatMap((category) => category.hero_ids))];
    const images = new Map(await Promise.all(ids.map(async (id) => [id, await portrait(id)])));
    await pause();
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH; canvas.height = THUMBNAIL_HEIGHT;
    drawCatalogGrid(canvas.getContext('2d'), grid, images, THUMBNAIL_WIDTH, false);
    const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    grids.push({ name: grid.configs[0].config_name || `Сетка ${index + 1}`, image });
    if (id) {
      drawn.set(`${id}:${index}`, { key, image });
      if (drawn.size > 64) drawn.delete(drawn.keys().next().value);
    }
  }
  return { grids, configIndex: doc.configIndex };
}

// After a save in the editor: a few seconds after the last edit, when the browser is idle.
const timers = new Map();
const idle = (callback) => (globalThis.requestIdleCallback ? requestIdleCallback(callback, { timeout: 4000 }) : setTimeout(callback, 200));
export function scheduleThumbnails(id, doc, updated) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    idle(() => renderThumbnails(doc, id)
      .then((made) => writeThumbnails({ id, updated, version: THUMBNAIL_VERSION, ...made }))
      .catch(() => { /* The Studio makes them later from the saved file. */ }));
  }, 3000));
}

// Files without fresh pictures (saved before 1.6.1, or edited in a tab that closed before the
// pictures were drawn): made one file at a time from the latest save only (ProjectStorage.peek —
// no backups listed, no copies written). Resolves with the record, or null without a save here.
const queue = [], pending = new Map();
let draining = false;
export function makeThumbnails(item) {
  if (!pending.has(item.id)) pending.set(item.id, new Promise((resolve) => { queue.push({ item, resolve }); drain(); }));
  return pending.get(item.id);
}
async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const { item, resolve } = queue.shift();
    let record = null;
    try {
      const saved = await readThumbnails(item.id);
      if (freshThumbnails(saved, item)) record = saved;
      // Just edited: the editor's own drawing is on its way (the card listens for it).
      else if (timers.has(item.id)) record = null;
      else {
        const storage = await createProjectStorage(C.importProject, APP_VERSION, item.id);
        let doc = null;
        try { doc = await storage.peek(); } finally { storage.database?.close(); }
        await pause();
        if (doc) {
          record = { id: item.id, updated: item.updated || 0, version: THUMBNAIL_VERSION, ...await renderThumbnails(doc, item.id) };
          await writeThumbnails(record);
        }
      }
    } catch { record = null; }
    pending.delete(item.id);
    resolve(record);
    await pause();
  }
  draining = false;
}
