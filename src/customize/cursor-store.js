// «Курсор»'s pictures in this browser (IndexedDB «gridstudio-cursors»): each picture the user gave, at
// most MAX_SIDE px (cursor-render.js), as a PNG under a key the roles share («Одна картинка для всех»
// keeps one). The rest of the state is small and sits in localStorage («gridstudio.cursor»,
// CursorSection.jsx). Every call fails softly: without storage the cursor lives for this visit only.
const DATABASE = 'gridstudio-cursors', STORE = 'pictures';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run(mode, action) {
  const database = await open();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode), request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
export const newPictureKey = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export async function savePicture(key, canvas) {
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) await run('readwrite', (store) => store.put(blob, key));
  } catch { /* This visit only. */ }
}
// The pictures of these keys as canvases-to-be (ImageBitmap): { key: bitmap }; missing ones are left out.
export async function loadPictures(keys) {
  const out = {};
  for (const key of new Set(keys)) {
    try {
      const blob = await run('readonly', (store) => store.get(key));
      if (blob) out[key] = await createImageBitmap(blob);
    } catch { /* Gone: that role starts empty. */ }
  }
  return out;
}
// Keeps only these keys (pictures no role uses any more go).
export async function keepPictures(keys) {
  try {
    const all = await run('readonly', (store) => store.getAllKeys());
    const keep = new Set(keys), gone = (all || []).filter((key) => !keep.has(key));
    if (gone.length) await run('readwrite', (store) => { gone.forEach((key) => store.delete(key)); return null; });
  } catch { /* Nothing to clean. */ }
}
// The pictures of these keys as they are kept (PNG blobs), for «Оформление» (look-state.js): { key: Blob }.
export async function pictureBlobs(keys) {
  const out = {};
  for (const key of new Set(keys)) {
    try { const blob = await run('readonly', (store) => store.get(key)); if (blob) out[key] = blob; } catch { /* Gone: left out. */ }
  }
  return out;
}
// A picture that came with an «Оформление» (a .gsdota or a «Студия» item), under its own key.
export async function putPictureBlob(key, blob) {
  await run('readwrite', (store) => store.put(blob, key));
}
