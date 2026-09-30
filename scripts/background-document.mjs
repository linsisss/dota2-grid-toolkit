import { catalogText } from './catalog-document.mjs';
import { MENU_SIZES } from './menu-background.mjs';

// Menu backgrounds shared by users (the workshop's «Фоны»). The browser uploads the WebM it
// built (so it is already at a MENU_SIZES resolution and within the size Dota handles) plus a
// poster frame; the server checks both and keeps them for moderation.
// Tags work as the grids' ones (CATALOG_TAGS): up to three, none is fine.
// «18+» blurs the background in the workshop until the viewer confirms their age, as for grids.
export const BACKGROUND_TAGS = ['Аниме', 'Dota 2', 'Игры', 'Милота', '18+', 'Мемы', 'Dead inside', 'Природа', 'Космос', 'Абстракция'];
export const BACKGROUND_LIMITS = Object.freeze({ video: 16_000_000, poster: 800_000, seconds: 31, daily: 3, accountDaily: 10, networkDaily: 20, pending: 300, storage: 10_000_000_000 });

class ValidationError extends Error { constructor(message) { super(message); this.status = 400; } }

export function backgroundMeta(input) {
  const title = catalogText(input?.title, 60, 'Название', true);
  const author = catalogText(input?.author ?? '', 40, 'Автор');
  const tags = input?.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 3 || tags.some((tag) => !BACKGROUND_TAGS.includes(tag))) throw new ValidationError('Выбери до трёх тегов из списка.');
  if (!MENU_SIZES[input?.aspect]) throw new ValidationError('Неизвестный формат экрана.');
  return { title, author, tags: [...new Set(tags)].sort(), aspect: input.aspect };
}

// One request carries everything: [u32 meta length][meta JSON][u32 poster length][poster][video].
export function packBackgroundUpload(meta, poster, video) {
  const json = new TextEncoder().encode(JSON.stringify(meta)), out = new Uint8Array(8 + json.length + poster.length + video.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, json.length, true); out.set(json, 4);
  view.setUint32(4 + json.length, poster.length, true); out.set(poster, 8 + json.length);
  out.set(video, 8 + json.length + poster.length);
  return out;
}
export function unpackBackgroundUpload(bytes) {
  const broken = () => { throw new ValidationError('Не удалось прочитать загрузку. Собери фон заново.'); };
  if (bytes.length < 8) broken();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), metaLength = view.getUint32(0, true);
  if (metaLength > 4000 || 8 + metaLength > bytes.length) broken();
  let meta; try { meta = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + metaLength))); } catch { broken(); }
  const posterLength = view.getUint32(4 + metaLength, true), posterAt = 8 + metaLength;
  if (!posterLength || posterAt + posterLength >= bytes.length) broken();
  return { meta, poster: bytes.subarray(posterAt, posterAt + posterLength), video: bytes.subarray(posterAt + posterLength) };
}
