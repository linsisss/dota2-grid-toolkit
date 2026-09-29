import { MENU_SIZES } from './menu-background.mjs';

// A menu background kept in «Студия» (docs/customize.md «Фоны в студии»). The browser keeps the
// built WebM with it (scripts/background-library.mjs), so it downloads again at once; an account
// keeps only this recipe and a small poster on the server, so on another device a workshop
// background builds again by itself and a user's own file asks to be chosen again.
export const STUDIO_BACKGROUND_LIMITS = Object.freeze({ name: 100, poster: 60_000, perAccount: 200, fileName: 200 });
export const STUDIO_CROSSFADES = Object.freeze([0, 0.5, 1, 2]);
export const STUDIO_FOLDERS = Object.freeze(['russian', 'custom']);

class ValidationError extends Error { constructor(message) { super(message); this.status = 400; } }
const broken = () => { throw new ValidationError('Настройки фона не читаются.'); };
const percent = (value) => Number.isInteger(value) && value >= 0 && value <= 100 ? value : broken();
const seconds = (value) => Number.isFinite(value) && value >= 0 && value <= 86_400 ? Math.round(value * 1000) / 1000 : broken();

// What was built from: a workshop background (by id) or the user's own file (by name and size).
function studioSource(source) {
  if (source?.kind === 'workshop') {
    if (!Number.isInteger(source.id) || source.id < 1) broken();
    return { kind: 'workshop', id: source.id, title: String(source.title ?? '').slice(0, 60) };
  }
  if (source?.kind === 'file') {
    if (typeof source.name !== 'string' || !source.name || !Number.isInteger(source.size) || source.size < 0 || !['image', 'video'].includes(source.type)) broken();
    return { kind: 'file', name: source.name.slice(0, STUDIO_BACKGROUND_LIMITS.fileName), size: source.size, type: source.type, label: String(source.label ?? '').slice(0, 8) };
  }
  return broken();
}

export function studioRecipe(input) {
  if (!input || typeof input !== 'object') broken();
  if (!MENU_SIZES[input.aspect] || !['cover', 'contain'].includes(input.fit) || !STUDIO_FOLDERS.includes(input.folder)
    || !['file', 'installer'].includes(input.delivery) || typeof input.clean !== 'boolean' || !STUDIO_CROSSFADES.includes(input.crossfade)) broken();
  let piece = null;
  if (input.piece != null) {
    piece = { start: seconds(input.piece.start), end: seconds(input.piece.end) };
    if (piece.end <= piece.start) broken();
  }
  return { aspect: input.aspect, fit: input.fit, blur: percent(input.blur), dim: percent(input.dim), clean: input.clean, folder: input.folder,
    delivery: input.delivery, piece, crossfade: input.crossfade, source: studioSource(input.source) };
}

// A workshop submission of the background: its gallery id and the status token.
export function studioPublished(value) {
  if (value == null) return null;
  if (!Number.isInteger(value.id) || value.id < 1 || typeof value.token !== 'string' || !/^[a-f0-9]{32}$/.test(value.token)) broken();
  return { id: value.id, token: value.token };
}

export function studioName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, STUDIO_BACKGROUND_LIMITS.name);
  if (!name) throw new ValidationError('Укажи название фона.');
  return name;
}
// A name for a new background: the workshop title or the file name without its extension.
export const defaultStudioName = (source) => (source.kind === 'workshop' ? source.title : source.name.replace(/\.[a-z0-9]{2,5}$/i, '')).trim().slice(0, STUDIO_BACKGROUND_LIMITS.name) || 'Фон меню';
