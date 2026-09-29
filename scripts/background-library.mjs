// «Студия» backgrounds in this browser (IndexedDB «gridstudio-backgrounds»): the recipe
// (scripts/studio-background.mjs), a JPEG poster and the built WebM, so a background downloads
// again without building. A record:
//   { id, name, account (Telegram account id or null), recipe, poster: Blob, video: Blob | null,
//     codec, seconds, created, updated, synced (the recipe is on the account's server copy) }
// `video` is null when the recipe came from another device and was never built here.
const DATABASE = 'gridstudio-backgrounds', STORE = 'items';

function open() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Этот браузер не умеет хранить фоны.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Хранилище фонов недоступно.'));
  });
}
async function run(mode, action) {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode), request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Не удалось сохранить фон в браузере.'));
    });
  } finally { database.close(); }
}

export const listBackgrounds = async () => (await run('readonly', (store) => store.getAll())).sort((a, b) => b.updated - a.updated);
export const getBackground = (id) => run('readonly', (store) => store.get(id));
export const putBackground = (record) => run('readwrite', (store) => store.put(record));
export const deleteBackground = (id) => run('readwrite', (store) => store.delete(id));
export async function updateBackground(id, patch) {
  const record = await getBackground(id);
  if (!record) return null;
  const next = { ...record, ...patch };
  await putBackground(next);
  return next;
}
// Built WebMs are big; ask the browser not to clear them under storage pressure (it may say no).
export async function keepBackgrounds() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
