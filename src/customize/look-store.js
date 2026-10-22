// «Оформление» in this browser (IndexedDB «gridstudio-looks», 2026-10-22; scripts/customize-look.mjs):
//   items  — «Студия» items: { id, name, account (Telegram id or null), look, parts, poster: Blob | null,
//            created, updated, synced (the account has this version), from (a studio background it was made of) }
//   media  — the user's own files the documents name, by SHA-256: { hash, blob, name, type, size, saved, built }.
//            Backgrounds of «Фон меню», «Под сеткой», «За героем», «Экран загрузки» and own fonts: so the page
//            gets them back on return, and an item opens without asking for the file again. `built`: a WebM
//            the builder made (a «Студия» background's video), the builder's version (VIDEO_ENCODER).
//   items also keep `built` ({ hash: version }) for such videos in their document (src/studio-rebuild.js).
//   state  — 'previous': the page's state before a file or an item replaced it ({ look, link, saved }).
// Nothing here replaces the sections' own keys (gridstudio.interface, .cursor, .font, .d2pfx and, new,
// gridstudio.menu): they stay the page's state; this database holds what «Студия» and the files need.
import { lookMedia } from '../../scripts/customize-look.mjs';
import { t } from '../../scripts/i18n.mjs';

const DATABASE = 'gridstudio-looks';
function open() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(t('Этот браузер не умеет хранить оформление.')));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'hash' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(t('Хранилище оформления недоступно.')));
  });
}
async function run(store, mode, action) {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(store, mode), request = action(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error(t('Не удалось сохранить оформление в браузере.')));
    });
  } finally { database.close(); }
}

export const listLooks = async () => (await run('items', 'readonly', (store) => store.getAll())).sort((a, b) => b.updated - a.updated);
export const getLook = (id) => run('items', 'readonly', (store) => store.get(id));
export const putLook = (record) => run('items', 'readwrite', (store) => store.put(record));
export const deleteLook = (id) => run('items', 'readwrite', (store) => store.delete(id));
export async function updateLook(id, patch) {
  const record = await getLook(id);
  if (!record) return null;
  const next = { ...record, ...patch };
  await putLook(next);
  return next;
}
export const readState = (key) => run('state', 'readonly', (store) => store.get(key)).catch(() => null);
export const writeState = (key, value) => run('state', 'readwrite', (store) => store.put(value, key));

// ——— The user's files, by content: the same file chosen twice is kept once.
const hashes = new WeakMap();
export async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
// The file's hash, once it is kept here (null when the browser has no room: the page then remembers only
// its name and size and asks for it next time). `built`: the builder's version, for a video it made.
export function keepMedia(file, built = null) {
  if (!(file instanceof Blob)) return Promise.resolve(null);
  if (!hashes.has(file)) hashes.set(file, (async () => {
    const hash = await sha256(file);
    try {
      const old = await run('media', 'readonly', (store) => store.getKey(hash));
      if (!old) await run('media', 'readwrite', (store) => store.put({ hash, blob: file, name: file.name || '', type: file.type || '', size: file.size, saved: Date.now(), ...(built ? { built } : {}) }));
      return hash;
    } catch { hashes.delete(file); return null; }
  })());
  return hashes.get(file);
}
// A kept file as a File (its name and type as chosen), or null.
export async function mediaFile(hash) {
  if (!hash) return null;
  try {
    const row = await run('media', 'readonly', (store) => store.get(hash));
    if (!row?.blob) return null;
    const file = new File([row.blob], row.name || 'file', { type: row.type || row.blob.type, lastModified: row.saved });
    hashes.set(file, Promise.resolve(hash));
    return file;
  } catch { return null; }
}
export async function mediaFiles(list) {
  const out = {};
  for (const hash of new Set(list.filter(Boolean))) { const file = await mediaFile(hash); if (file) out[hash] = file; }
  return out;
}
// A file that came inside a .gsdota: kept under its real hash (a wrong one in the file is not trusted).
export async function putMediaBlob(blob, name) {
  const file = new File([blob], name || 'file', { type: blob.type });
  return keepMedia(file);
}
// Files no document names any more go, once they are an hour old (another tab may be about to name one).
// `named`: the hashes the page's own keys name (gridstudio.menu, gridstudio.font).
export async function pruneMedia(named = []) {
  try {
    const keep = new Set(named);
    for (const record of await listLooks()) for (const hash of Object.keys(lookMedia(record.look))) keep.add(hash);
    const previous = await readState('previous');
    if (previous?.look) for (const hash of Object.keys(lookMedia(previous.look))) keep.add(hash);
    const rows = await run('media', 'readonly', (store) => store.getAll());
    const gone = rows.filter((row) => !keep.has(row.hash) && Date.now() - (row.saved || 0) > 3_600_000).map((row) => row.hash);
    if (gone.length) await run('media', 'readwrite', (store) => { gone.forEach((hash) => store.delete(hash)); return null; });
    return gone.length;
  } catch { return 0; }
}
// A kept file by what a «Студия» background recipe remembers of it (name and size), or null.
export async function findMedia(source) {
  if (source?.kind !== 'file') return null;
  try {
    const rows = await run('media', 'readonly', (store) => store.getAll());
    const row = rows.find((item) => item.name === source.name && item.size === source.size);
    return row ? mediaFile(row.hash) : null;
  } catch { return null; }
}
