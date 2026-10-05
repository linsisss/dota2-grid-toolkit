import { MENU_FRAME, MENU_FRAME_ZOOM, MENU_SIZES } from './menu-background.mjs';

// A menu background kept in «Студия» (docs/customize.md «Фоны в студии»). The browser keeps the
// built WebM with it (scripts/background-library.mjs), so it downloads again at once; an account
// keeps only this recipe and a small poster on the server, so on another device a workshop
// background builds again by itself and a user's own file asks to be chosen again.
export const STUDIO_BACKGROUND_LIMITS = Object.freeze({ name: 100, poster: 60_000, perAccount: 200, fileName: 200 });
export const STUDIO_CROSSFADES = Object.freeze([0, 0.5, 1, 2]);
// The language of the user's Dota (src/customize/background-pack.js FOLDERS); 'custom' (dota_123,
// before 1.7; Dota no longer reads it) reads as 'russian'.
export const STUDIO_FOLDERS = Object.freeze(['russian', 'english']);
// Behind the hero on the hero page (1.6.1): the menu's video, a video of its own, or Valve's picture.
export const STUDIO_HERO_MODES = Object.freeze(['menu', 'own', 'off']);
// Under the hero grid on the «Герои» page (1.6.4): the menu's background, darker (dim, a percent of
// GRID_DIM.max), or a video of its own.
export const STUDIO_GRID_MODES = Object.freeze(['menu', 'dim', 'own']);

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

// The framing (1.6.1; recipes before it have none: the middle, not enlarged).
function studioFrame(value) {
  if (value == null) return { zoom: MENU_FRAME.zoom, x: MENU_FRAME.x, y: MENU_FRAME.y };
  const number = (v, low, high) => (Number.isFinite(v) && v >= low && v <= high ? Math.round(v * 1000) / 1000 : broken());
  // Turned and mirrored since 2026-10-05; recipes before have neither.
  const flag = (v) => (v == null ? false : typeof v === 'boolean' ? v : broken());
  const frame = { zoom: number(value.zoom, 1, MENU_FRAME_ZOOM), x: number(value.x, 0, 1), y: number(value.y, 0, 1) };
  const rotate = value.rotate == null ? 0 : number(value.rotate, -180, 180), flipX = flag(value.flipX), flipY = flag(value.flipY);
  // Kept only when set, so recipes without them stay as they were.
  return { ...frame, ...(rotate ? { rotate } : {}), ...(flipX ? { flipX } : {}), ...(flipY ? { flipY } : {}) };
}
function studioPiece(value) {
  if (value == null) return null;
  const piece = { start: seconds(value.start), end: seconds(value.end) };
  if (piece.end <= piece.start) broken();
  return piece;
}
// Recipes saved before 1.6.1 have no `hero`: the hero page shows the menu video, the new default.
function studioHero(input) {
  if (input == null) return { mode: 'menu' };
  if (!STUDIO_HERO_MODES.includes(input.mode)) broken();
  if (input.mode !== 'own') return { mode: input.mode };
  if (!['cover', 'contain'].includes(input.fit) || !STUDIO_CROSSFADES.includes(input.crossfade)) broken();
  return { mode: 'own', fit: input.fit, blur: percent(input.blur), dim: percent(input.dim), frame: studioFrame(input.frame), piece: studioPiece(input.piece), crossfade: input.crossfade, source: studioSource(input.source) };
}

// The button to the season event and the profile buttons (1.6.4); recipes before them get them,
// like new ones by default.
function studioSwitch(value) {
  if (value == null) return true;
  return typeof value === 'boolean' ? value : broken();
}

// Recipes saved before 1.6.4 have no `grid`: the «Герои» page shows the menu's background.
function studioGrid(input) {
  if (input == null) return { mode: 'menu' };
  if (!STUDIO_GRID_MODES.includes(input.mode)) broken();
  if (input.mode === 'menu') return { mode: 'menu' };
  if (input.mode === 'dim') return { mode: 'dim', dim: percent(input.dim) };
  const own = studioHero({ ...input, mode: 'own' });
  return { ...own, mode: 'own' };
}

export function studioRecipe(input) {
  if (!input || typeof input !== 'object') broken();
  if (input.folder === 'custom') input = { ...input, folder: 'russian' };
  if (!MENU_SIZES[input.aspect] || !['cover', 'contain'].includes(input.fit) || !STUDIO_FOLDERS.includes(input.folder)
    || !['file', 'installer'].includes(input.delivery) || typeof input.clean !== 'boolean' || !STUDIO_CROSSFADES.includes(input.crossfade)) broken();
  return { aspect: input.aspect, fit: input.fit, blur: percent(input.blur), dim: percent(input.dim), frame: studioFrame(input.frame), clean: input.clean, folder: input.folder,
    delivery: input.delivery, piece: studioPiece(input.piece), crossfade: input.crossfade, source: studioSource(input.source), hero: studioHero(input.hero), event: studioSwitch(input.event), profile: studioSwitch(input.profile), grid: studioGrid(input.grid) };
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
