import { catalogAPI } from './catalog/api.js';
import { getBackground, keepBackgrounds, putBackground, updateBackground } from '../scripts/background-library.mjs';
import { defaultStudioName, studioRecipe } from '../scripts/studio-background.mjs';
import { t } from '../scripts/i18n.mjs';

// «Студия» backgrounds between this browser and a Telegram account: the browser keeps the built
// WebM (scripts/background-library.mjs), the account only the recipe and a poster
// (server/studio-backgrounds.mjs). Used by the builder after a build and by the studio list.
export const remotePoster = (id) => `/api/catalog/studio/backgrounds/${id}/poster.jpg`;

// A frame of the WebM a second in (or halfway through a shorter one), as a JPEG.
// A frame a second (at most 30), 64 × 36 RGB bytes each, one after another: what the server compares
// with the published backgrounds before this one is sent (scripts/similarity.mjs backgroundFrame).
export async function similarityFrames(video, { width = 64, height = 36, max = 30 } = {}) {
  const element = document.createElement('video'), url = URL.createObjectURL(new Blob([video], { type: 'video/webm' }));
  const seek = (time) => new Promise((done) => { element.onseeked = done; element.currentTime = time; });
  try {
    element.muted = true; element.preload = 'auto'; element.src = url;
    await new Promise((done, failed) => { element.onloadeddata = done; element.onerror = () => failed(new Error('video')); });
    let duration = element.duration;
    if (!Number.isFinite(duration)) { await seek(1e9); duration = element.currentTime || 1; }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.imageSmoothingQuality = 'high';
    const count = Math.max(1, Math.min(max, Math.ceil(duration))), out = new Uint8Array(count * width * height * 3);
    for (let i = 0; i < count; i++) {
      await seek(Math.min(i, Math.max(0, duration - 0.05)));
      context.drawImage(element, 0, 0, width, height);
      const rgba = context.getImageData(0, 0, width, height).data;
      for (let p = 0, o = i * width * height * 3; p < width * height; p++) { out[o + p * 3] = rgba[p * 4]; out[o + p * 3 + 1] = rgba[p * 4 + 1]; out[o + p * 3 + 2] = rgba[p * 4 + 2]; }
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
export async function posterFrame(video, width = 640, quality = 0.85) {
  const element = document.createElement('video'), url = URL.createObjectURL(new Blob([video], { type: 'video/webm' }));
  try {
    element.muted = true; element.src = url;
    await new Promise((done, failed) => { element.onloadeddata = done; element.onerror = () => failed(new Error(t('Не удалось сделать обложку.'))); });
    element.currentTime = Math.min(1, (element.duration || 1) / 2);
    await new Promise((done) => { element.onseeked = done; });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width * element.videoHeight / element.videoWidth);
    canvas.getContext('2d').drawImage(element, 0, 0, canvas.width, canvas.height);
    return await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
export async function pushRecipe(record) {
  return catalogAPI(`/studio/backgrounds/${record.id}`, { method: 'PUT', body: { name: record.name, recipe: record.recipe, published: record.published || null, ...(record.poster instanceof Blob ? { poster: await base64(record.poster) } : {}) } });
}
export const pullRecipes = async () => (await catalogAPI('/studio/backgrounds')).items;
export const dropRecipe = (id) => catalogAPI(`/studio/backgrounds/${id}`, { method: 'DELETE' });

let account;
const signedIn = () => (account ||= catalogAPI('/auth/me').then((result) => result.user?.id || null).catch(() => null));

// Signed in on the builder page after a build (1.8.18): the background just built goes into the
// account at once — the studio would take it only when opened.
export async function claimBuiltBackground(id, user) {
  account = Promise.resolve(user);
  const record = await getBackground(id);
  if (!record || (record.account && record.account !== user)) return false;
  const saved = await pushRecipe(record);
  await updateBackground(id, { account: user, synced: true, updated: saved.updated });
  return true;
}

// After a build: the background (new, or the one opened from the studio) is kept in this browser
// with its WebM; a signed-in account gets the recipe. Syncing failures are left to the studio,
// which uploads anything not yet synced when it opens.
export async function saveBuiltBackground({ id = null, recipe, video, heroVideo = null, gridVideo = null, codec, seconds }) {
  const [user, old] = await Promise.all([signedIn(), id ? getBackground(id) : null]);
  const now = Date.now(), checked = studioRecipe(recipe);
  const record = { id: old?.id || id || crypto.randomUUID(), name: old?.name || defaultStudioName(checked.source), account: old?.account || user,
    recipe: checked, poster: await posterFrame(video, 480, 0.8), video: new Blob([video], { type: 'video/webm' }), codec, seconds,
    // The video behind the hero, when it has its own (recipe.hero.mode 'own'); like `video`, this browser only.
    heroVideo: heroVideo ? new Blob([heroVideo], { type: 'video/webm' }) : null,
    // The video under the hero grid (recipe.grid.mode 'own', 1.6.4), the same way.
    gridVideo: gridVideo ? new Blob([gridVideo], { type: 'video/webm' }) : null,
    created: old?.created || now, updated: now, synced: false };
  await putBackground(record);
  keepBackgrounds();
  if (user && record.account === user) {
    try { const saved = await pushRecipe(record); await updateBackground(record.id, { synced: true, updated: saved.updated }); }
    catch { /* the studio retries */ }
  }
  return record;
}

// The folder and the way of download chosen after the build go into the recipe too, so «Скачать»
// in the studio gives the same file.
export async function rememberDownload(id, { folder, delivery }) {
  const record = await getBackground(id);
  if (!record || (record.recipe.folder === folder && record.recipe.delivery === delivery)) return;
  const next = await updateBackground(id, { recipe: { ...record.recipe, folder, delivery }, updated: Date.now(), synced: false });
  if (next.account && next.account === await signedIn()) pushRecipe(next).then((saved) => updateBackground(id, { synced: true, updated: saved.updated })).catch(() => {});
}

// Published to the workshop from the builder: the studio card keeps the submission and shows its
// moderation status (pending, approved, rejected with the reason, hidden).
export async function markPublished(id, published) {
  const next = await updateBackground(id, { published, synced: false });
  if (next?.account && next.account === await signedIn()) pushRecipe(next).then((saved) => updateBackground(id, { synced: true, updated: saved.updated })).catch(() => {});
}
export const publicationStatus = ({ id, token }) => catalogAPI(`/backgrounds/${id}/status?${new URLSearchParams({ token })}`);
