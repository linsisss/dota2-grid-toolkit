import { catalogAPI, GUIDES_PATH } from '../catalog/api.js';
import { t, translateMessage } from '../../scripts/i18n.mjs';

// «Гайды» on the server (server/guides.mjs, under /api/catalog/guides). Uploads go in parts of
// UPLOAD_PART bytes, under nginx's limit for the API, so a 50 MB video needs no special route and a
// dropped connection repeats one part, not the whole file.
export { GUIDES_PATH };
export const guidesAPI = (path, options) => catalogAPI(`/guides${path}`, options);
export const UPLOAD_PART = 4 * 1024 * 1024;
export const MEDIA_LIMITS = Object.freeze({ image: 10 * 1024 * 1024, video: 50 * 1024 * 1024, file: 50 * 1024 * 1024 });
// Files to download: Dota and GridStudio files, archives, text, fonts, pictures. No programs or scripts.
export const FILE_EXTENSIONS = Object.freeze(['json', 'txt', 'cfg', 'ini', 'md', 'kv', 'kv3', 'vpk', 'zip', '7z', 'rar', 'ttf', 'otf', 'woff', 'woff2',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'psd', 'mp4', 'webm', 'mp3', 'ogg', 'wav']);
export const MEDIA_ACCEPT = Object.freeze({
  image: 'image/png,image/jpeg,image/webp,image/gif',
  video: 'video/mp4,video/webm',
  file: FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')
});
const extension = (name) => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] || '').toLowerCase();
// Where a file goes: chosen with a button (`preferred`), dropped or pasted (by its type).
export function mediaKind(file, preferred = '') {
  const ext = extension(file.name);
  const image = /^image\/(png|jpeg|webp|gif)$/.test(file.type) || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
  const video = /^video\/(mp4|webm)$/.test(file.type) || ['mp4', 'webm'].includes(ext);
  if (preferred === 'file') return FILE_EXTENSIONS.includes(ext) ? 'file' : '';
  if (preferred === 'image') return image ? 'image' : '';
  if (preferred === 'video') return video ? 'video' : '';
  return image ? 'image' : video ? 'video' : FILE_EXTENSIONS.includes(ext) ? 'file' : '';
}

// → the upload's details { id, kind, url, width, height, name, size }.
export async function uploadMedia(file, kind, onProgress = () => {}) {
  const limit = MEDIA_LIMITS[kind];
  if (file.size > limit) throw new Error(t('Файл больше {size} МБ.', { size: limit / 1024 / 1024 }));
  if (!file.size) throw new Error(t('Файл пустой.'));
  const { id } = await guidesAPI('/uploads', { method: 'POST', body: { kind, name: file.name, size: file.size, type: file.type } });
  for (let offset = 0; offset < file.size; offset += UPLOAD_PART) {
    const part = file.slice(offset, offset + UPLOAD_PART);
    let tries = 0;
    for (;;) {
      try {
        const response = await fetch(`/api/catalog/guides/uploads/${id}?offset=${offset}`, { method: 'PUT', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/octet-stream' }, body: part, signal: AbortSignal.timeout(120_000) });
        const value = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(value.error ? translateMessage(value.error) : t('Не удалось загрузить файл.')), { final: response.status < 500 });
        break;
      } catch (error) {
        if (error.final || ++tries >= 3) throw error.final ? error : new Error(t('Не удалось загрузить файл. Проверь подключение.'));
        await new Promise((resolve) => setTimeout(resolve, 800 * tries));
      }
    }
    onProgress(Math.min(1, (offset + part.size) / file.size) * 0.95);
  }
  const item = await guidesAPI(`/uploads/${id}/done`, { method: 'POST', body: {}, signal: AbortSignal.timeout(120_000) });
  onProgress(1);
  return item;
}
