import { GLASS_KEYS, MENU_FRAME, MENU_HIDE, MENU_SIZES, glassChanged, menuGlass } from './menu-background.mjs';
import { STUDIO_CROSSFADES, STUDIO_FOLDERS, STUDIO_GRID_MODES, STUDIO_HERO_MODES, STUDIO_LOADING_MODES, studioFrame, studioPiece, studioSource } from './studio-background.mjs';
import { CHAT_DEFAULTS, HUD_DEFAULTS, chatSettings, hudChanged, hudSettings } from './hud-style.mjs';
import { TEXT_LIMITS } from './dota-texts.mjs';
import { CURSOR_ROLES } from './dota-cursor.mjs';
import { D2PFX } from './d2pfx.mjs';
import { D2PFX_SECTIONS } from './d2pfx-mods.mjs';
import { portraitsState } from './hero-portraits.mjs';

// «Оформление» (2026-10-22, the owner: «Сделать, чтобы полноценно можно было сохранить кастомизацию в
// Студии»): the whole state of «Оформление Dota» (/background, src/customize/CustomizePage.jsx) as one
// document — every section's settings, the menu's backgrounds by reference. It is what «Студия» keeps
// (src/customize/look-store.js in the browser, server/studio-looks.mjs for an account) and what
// «Скачать файл настроек» writes (.gsdota: the same document plus the user's own files, embedded while
// they fit). docs/customize.md «Оформление в Студии».
//
// Version 1:
//   { format: 'gridstudio-dota', version: 1,
//     menu: { aspect, folder, event, background: Bg | null,
//             buttons: { hide: [MENU_HIDE key], news: { carnival, season }, profile,
//                       glass: { bar, friends, news, header, showcase, party } (percents, MENU_GLASS; a key missing reads as 100) },
//             grid: { mode: menu|dim|own, dim, own: Bg | null }, hero: { mode: menu|off|own, own }, loading: { mode: off|menu|own, own } },
//     hud: hudSettings (with the chat), texts: { token: text },
//     cursor: { mode: dota|d2pfx|own, pack: d2pfx pack | null, own: { id: Role }, packed: { id: Role | { gone } } },
//     pictures: { key: data URL (PNG or WebP) }  — the cursor pictures the roles use,
//     font: { selected: catalog id | null, roles: { Radiance, Reaver, RadianceM }, keepGrid, own: null | { name, faces: [{ media, name, size }] } },
//     d2pfx: { choice: { section: { slot: mod id } } },
//     portraits: { heroes: [{ hero, kind, source: { name, size, type, media? }, crop, start }] } (scripts/hero-portraits.mjs portraitsState) }
//   Bg: { source: { kind: 'workshop', id, title } | { kind: 'file', name, size, type, label, media? }, fit, blur, dim, frame, piece, crossfade }
//   Role: { scale, x, y, rot, hot: [x, y] | null, key?, name? }
// `media` is the SHA-256 of the user's file: the file itself lives in this browser (look-store.js
// «media») or inside a .gsdota; an account keeps only the reference. A section missing from a document
// reads as Dota's, so a later version may add sections without breaking this one.
// Additions within version 1 (old documents read the same, older pages ignore what they do not know):
//   2026-10-22 buttons.glass { bar, friends }; later that day its news, header, showcase and party.
export const LOOK_FORMAT = 'gridstudio-dota';
export const LOOK_VERSION = 1;
export const LOOK_EXTENSION = '.gsdota';
export const LOOK_LIMITS = Object.freeze({
  name: 100, json: 1_500_000, picture: 400_000, pictures: 60, fontFaces: 8, poster: 60_000, perAccount: 100, accountBytes: 50_000_000,
  // A .gsdota: the user's own files go inside while together they stay under `fileMedia`; a bigger one is a reference.
  fileMedia: 25_000_000, file: 40_000_000
});
// The parts of the page (CustomizePage.jsx MODULES), in its order, with their names for «Студия».
export const LOOK_PARTS = Object.freeze([
  ['bg', 'Фон меню'], ['grid', 'Под сеткой героев'], ['hero', 'За героем'], ['loading', 'Экран загрузки'], ['buttons', 'Кнопки меню'], ['menuparts', 'Детали меню'],
  ['hud', 'Вид HUD'], ['hudskin', 'HUD-скин'], ['hudparts', 'Детали HUD'], ['chat', 'Чат'], ['cursor', 'Курсор'], ['click', 'Клик'], ['pings', 'Пинги'], ['deny', 'Денай'],
  ['font', 'Шрифт'], ['texts', 'Тексты'], ['portraits', 'Портреты героев'], ['voice', 'Иконка голоса']
].map((part) => Object.freeze(part)));
export const LOOK_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'font/ttf', 'font/otf', 'application/octet-stream']);

class LookError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const broken = () => { throw new LookError('Файл оформления не читается.'); };
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : broken());
const bool = (value, fallback) => (value == null ? fallback : typeof value === 'boolean' ? value : broken());
const percent = (value, fallback = 0) => (value == null ? fallback : Number.isInteger(value) && value >= 0 && value <= 100 ? value : broken());
const number = (value, low, high) => (Number.isFinite(value) && value >= low && value <= high ? Math.round(value * 10_000) / 10_000 : broken());
const text = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : broken());
export const MEDIA_HASH = /^[a-f0-9]{64}$/;
const PICTURE_KEY = /^p[a-z0-9]{4,24}$/;

// A background: the studio recipe's rules (scripts/studio-background.mjs), plus the user's file by hash.
function lookBackground(input) {
  if (input == null) return null;
  object(input);
  if (!['cover', 'contain'].includes(input.fit ?? 'cover') || !STUDIO_CROSSFADES.includes(input.crossfade ?? 0)) broken();
  let source;
  try { source = studioSource(input.source); } catch { broken(); }
  if (source.kind === 'file' && input.source.media != null) source.media = MEDIA_HASH.test(input.source.media) ? input.source.media : broken();
  let frame, piece;
  try { frame = studioFrame(input.frame); piece = studioPiece(input.piece); } catch { broken(); }
  return { source, fit: input.fit ?? 'cover', blur: percent(input.blur), dim: percent(input.dim), frame, piece, crossfade: input.crossfade ?? 0 };
}
function lookPage(input, modes, fallback, extra = {}) {
  const value = input == null ? {} : object(input), mode = value.mode ?? fallback;
  if (!modes.includes(mode)) broken();
  return { mode, ...extra, own: lookBackground(value.own) };
}
function lookButtons(input) {
  const value = input == null ? {} : object(input), news = value.news == null ? {} : object(value.news);
  if (value.hide != null && (!Array.isArray(value.hide) || value.hide.length > Object.keys(MENU_HIDE).length * 2)) broken();
  const hide = [...new Set(value.hide || [])];
  if (hide.some((key) => !Object.hasOwn(MENU_HIDE, key))) broken();
  // The see-through panels (2026-10-22, MENU_GLASS): percents, 100 as in Dota (and for a key a document lacks).
  const glass = value.glass == null ? {} : object(value.glass);
  for (const key of GLASS_KEYS) if (glass[key] != null) percent(glass[key]);
  return { hide, news: { carnival: bool(news.carnival, true), season: bool(news.season, true) }, profile: bool(value.profile, false), glass: menuGlass(glass) };
}
function lookMenu(input) {
  const value = input == null ? {} : object(input);
  if (value.aspect != null && !MENU_SIZES[value.aspect]) broken();
  if (value.folder != null && !STUDIO_FOLDERS.includes(value.folder)) broken();
  const grid = value.grid == null ? {} : object(value.grid);
  return { aspect: value.aspect ?? '16:9', folder: value.folder ?? 'russian', event: bool(value.event, true), background: lookBackground(value.background), buttons: lookButtons(value.buttons),
    grid: lookPage(grid, STUDIO_GRID_MODES, 'menu', { dim: percent(grid.dim, 55) }), hero: lookPage(value.hero, STUDIO_HERO_MODES, 'menu'), loading: lookPage(value.loading, STUDIO_LOADING_MODES, 'off') };
}
function lookTexts(input) {
  const value = input == null ? {} : object(input), entries = Object.entries(value);
  if (entries.length > TEXT_LIMITS.edits) broken();
  return Object.fromEntries(entries.map(([token, line]) => (/^[\w.:#-]{1,160}$/.test(token) && typeof line === 'string' ? [token, line.slice(0, TEXT_LIMITS.value)] : broken())));
}
function lookRole(input, packed) {
  const value = object(input);
  if (packed && value.gone === true) return { gone: true };
  const hot = value.hot == null ? null : Array.isArray(value.hot) && value.hot.length === 2 && value.hot.every((v) => Number.isInteger(v) && v >= 0 && v <= 31) ? [...value.hot] : broken();
  const role = { scale: number(value.scale ?? 1, 0.05, 10), x: number(value.x ?? 0.5, -5, 6), y: number(value.y ?? 0.5, -5, 6), rot: number(value.rot ?? 0, -360, 360), hot };
  if (value.key != null) { role.key = PICTURE_KEY.test(value.key) ? value.key : broken(); role.name = text(value.name ?? '', 200); }
  return role;
}
const roles = (input, packed) => Object.fromEntries(Object.entries(input == null ? {} : object(input)).map(([id, role]) => (CURSOR_ROLES[id] ? [id, lookRole(role, packed)] : broken())));
// A d2pfx cursor pack: only d2pfx's own addresses (the page downloads `file` from there).
function lookPack(input) {
  if (input == null) return null;
  const value = object(input), link = (url, start) => (url === '' || (typeof url === 'string' && url.length <= 500 && url.startsWith(start)) ? url : broken());
  if (!/\.zip$/i.test(value.file || '')) broken();
  const credits = Array.isArray(value.credits) && value.credits.length <= 12 ? value.credits.map((credit) => {
    object(credit);
    if (!['author', 'modded', 'sender', 'source'].includes(credit.kind)) broken();
    return { kind: credit.kind, name: text(credit.name ?? '', 100), url: credit.url === '' ? '' : link(credit.url, 'http'), ...(credit.owner === true ? { owner: true } : {}) };
  }) : broken();
  return { name: text(value.name, 100), preview: link(value.preview ?? '', D2PFX.site), file: link(value.file, `${D2PFX.raw}/assets/files/cursors/`), page: link(value.page ?? '', D2PFX.site),
    date: Number.isSafeInteger(value.date) ? value.date : 0, credits };
}
function lookCursor(input) {
  const value = input == null ? {} : object(input), mode = value.mode ?? 'dota';
  if (!['dota', 'd2pfx', 'own'].includes(mode)) broken();
  return { mode, pack: lookPack(value.pack), own: roles(value.own, false), packed: roles(value.packed, true) };
}
// Only the pictures a role uses, each a PNG or WebP data URL of at most LOOK_LIMITS.picture characters.
function lookPictures(input, cursor) {
  const used = new Set([...Object.values(cursor.own), ...Object.values(cursor.packed)].map((role) => role.key).filter(Boolean));
  const value = input == null ? {} : object(input), out = {};
  for (const [key, url] of Object.entries(value)) {
    if (!used.has(key)) continue;
    if (typeof url !== 'string' || url.length > LOOK_LIMITS.picture || !/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) broken();
    out[key] = url;
  }
  if (Object.keys(out).length > LOOK_LIMITS.pictures) broken();
  return out;
}
function lookFont(input) {
  const value = input == null ? {} : object(input), roles = value.roles == null ? {} : object(value.roles);
  const selected = value.selected == null ? null : /^[a-z0-9-]{1,60}$/.test(value.selected) ? value.selected : broken();
  let own = null;
  if (value.own != null) {
    object(value.own);
    if (!Array.isArray(value.own.faces) || !value.own.faces.length || value.own.faces.length > LOOK_LIMITS.fontFaces) broken();
    own = { name: text(value.own.name, 100), faces: value.own.faces.map((face) => (object(face) && MEDIA_HASH.test(face.media) && Number.isSafeInteger(face.size) && face.size >= 0
      ? { media: face.media, name: text(face.name ?? '', 200), size: face.size } : broken())) };
  }
  return { selected, roles: { Radiance: bool(roles.Radiance, true), Reaver: bool(roles.Reaver, true), RadianceM: bool(roles.RadianceM, true) }, keepGrid: bool(value.keepGrid, false), own };
}
function lookD2pfx(input) {
  const value = input == null ? {} : object(input), choice = value.choice == null ? {} : object(value.choice), out = {};
  for (const [section, slots] of Object.entries(choice)) {
    if (!D2PFX_SECTIONS[section]) broken();
    for (const [slot, id] of Object.entries(object(slots))) {
      if (!Object.hasOwn(D2PFX_SECTIONS[section].slots, slot) || typeof id !== 'string' || !/^[\w.-]{1,120}$/.test(id)) broken();
      (out[section] ||= {})[slot] = id;
    }
  }
  return { choice: out };
}

// The document checked and in its one shape: unknown fields go, missing sections read as Dota's.
// Throws «Файл оформления не читается.» (status 400) or, for a newer version, asks to reload.
export function lookDocument(input) {
  const value = object(input);
  if (value.format !== LOOK_FORMAT) broken();
  if (!Number.isInteger(value.version) || value.version < 1) broken();
  if (value.version > LOOK_VERSION) throw new LookError('Файл сделан в более новой версии GridStudio. Обнови страницу и открой его снова.');
  const cursor = lookCursor(value.cursor);
  const look = { format: LOOK_FORMAT, version: LOOK_VERSION, menu: lookMenu(value.menu), hud: hudSettings(value.hud == null ? HUD_DEFAULTS : object(value.hud)), texts: lookTexts(value.texts),
    cursor, pictures: lookPictures(value.pictures, cursor), font: lookFont(value.font), d2pfx: lookD2pfx(value.d2pfx),
    // «Портреты героев» (2026-10-22, made alongside): the section's own rules.
    portraits: portraitsState(value.portraits == null ? null : object(value.portraits)) };
  if (JSON.stringify(look).length > LOOK_LIMITS.json) throw new LookError('Оформление больше 1,5 МБ: убери лишние картинки курсора.', 413);
  return look;
}
export const emptyLook = () => lookDocument({ format: LOOK_FORMAT, version: LOOK_VERSION });

// The user's files a document names: { hash: { name, size, kind: 'background' | 'font' } }.
export function lookMedia(look) {
  const out = {}, menu = look.menu;
  for (const bg of [menu.background, menu.grid.own, menu.hero.own, menu.loading.own]) if (bg?.source.kind === 'file' && bg.source.media) out[bg.source.media] = { name: bg.source.name, size: bg.source.size, kind: 'background' };
  for (const face of look.font.own?.faces || []) out[face.media] = { name: face.name, size: face.size, kind: 'font' };
  for (const entry of look.portraits?.heroes || []) if (entry.source.media) out[entry.source.media] = { name: entry.source.name, size: entry.source.size, kind: 'portrait' };
  return out;
}

// What a document changes, as the page's chips say «Своё» (CustomizePage.jsx): ids of LOOK_PARTS.
export function lookParts(look) {
  const { menu } = look, b = menu.buttons, has = (page) => page.mode === 'own' && !!page.own;
  const cursorRoles = look.cursor.mode === 'own' ? Object.keys(look.cursor.own).length : look.cursor.mode === 'd2pfx' && look.cursor.pack ? 1 : 0;
  const changed = {
    bg: !!menu.background, grid: menu.grid.mode === 'dim' || has(menu.grid), hero: has(menu.hero), loading: has(menu.loading),
    buttons: b.hide.length > 0 || !b.news.carnival || !b.news.season || b.profile || glassChanged(b.glass),
    hud: hudChanged({ ...look.hud, chat: CHAT_DEFAULTS }), chat: JSON.stringify(chatSettings(look.hud.chat)) !== JSON.stringify(CHAT_DEFAULTS), cursor: cursorRoles > 0,
    font: (!!look.font.own || !!look.font.selected) && Object.values(look.font.roles).some(Boolean), texts: Object.keys(look.texts).length > 0, portraits: (look.portraits?.heroes || []).length > 0,
    ...Object.fromEntries(Object.keys(D2PFX_SECTIONS).map((section) => [section, Object.keys(look.d2pfx.choice[section] || {}).length > 0]))
  };
  return LOOK_PARTS.map(([id]) => id).filter((id) => changed[id]);
}

// A «Студия» background (scripts/studio-background.mjs recipe) as an «Оформление»: its menu, everything
// else as in Dota. `built` ({ bg, hero, grid, loading }: { media, size }) — the background's own
// videos in this browser: a page whose source was the user's file takes the built video instead, as it
// is (filled, no effects, whole), so it comes back without asking for the file. `media` ({ bg, hero, grid,
// loading }: a hash in look-store.js) — the user's own file itself, kept in this browser: it is taken with the
// recipe's settings, to be built again (src/studio-rebuild.js: a video built before 22.10.2026 is jerky).
export function lookFromRecipe(recipe, { built = {}, media = {} } = {}) {
  const neutral = (made, name) => ({ source: { kind: 'file', name: `${String(name || 'GridStudio').replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 180)}.webm`, size: made.size, type: 'video', label: 'WEBM', media: made.media },
    fit: 'cover', blur: 0, dim: 0, frame: { zoom: MENU_FRAME.zoom, x: MENU_FRAME.x, y: MENU_FRAME.y }, piece: null, crossfade: 0 });
  const bgOf = (part, made, hash) => {
    if (!part?.source) return null;
    const settings = { fit: part.fit, blur: part.blur, dim: part.dim, frame: part.frame, piece: part.piece, crossfade: part.crossfade };
    if (part.source.kind === 'file' && hash) return { source: { ...part.source, media: hash }, ...settings };
    if (part.source.kind === 'file' && made?.media) return neutral(made, part.source.name);
    return { source: part.source, ...settings };
  };
  const page = (part, made, hash) => ({ mode: part?.mode || 'menu', own: part?.mode === 'own' ? bgOf(part, made, hash) : null });
  const news = recipe.news || { carnival: !recipe.clean, season: !recipe.clean };
  return lookDocument({ format: LOOK_FORMAT, version: LOOK_VERSION, menu: {
    aspect: recipe.aspect, folder: recipe.folder === 'custom' ? 'russian' : recipe.folder, event: recipe.event ?? true, background: bgOf(recipe, built.bg, media.bg),
    buttons: { hide: recipe.hide || [], news, profile: recipe.profile ?? false, ...(recipe.glass ? { glass: recipe.glass } : {}) },
    grid: { ...page(recipe.grid, built.grid, media.grid), dim: recipe.grid?.dim ?? 55 }, hero: page(recipe.hero, built.hero, media.hero), loading: { ...page(recipe.loading || { mode: 'off' }, built.loading, media.loading), mode: recipe.loading?.mode || 'off' }
  } });
}

// A page's background that is the built video standing in for the recipe's file (lookFromRecipe `built`):
// that WebM, as it is. `recipePart`, when known, must be the part it stands in for (its file's name).
export function builtStandIn(part, recipePart = null) {
  const source = part?.source;
  if (source?.kind !== 'file' || !source.media || source.type !== 'video' || source.label !== 'WEBM') return false;
  if (part.fit !== 'cover' || part.blur || part.dim || part.piece || part.crossfade) return false;
  const frame = part.frame || {};
  if ((frame.zoom ?? MENU_FRAME.zoom) !== MENU_FRAME.zoom || (frame.x ?? MENU_FRAME.x) !== MENU_FRAME.x || (frame.y ?? MENU_FRAME.y) !== MENU_FRAME.y || frame.rotate || frame.flipX || frame.flipY) return false;
  if (!recipePart) return true;
  if (recipePart.source?.kind !== 'file') return false;
  return source.name === `${String(recipePart.source.name || 'GridStudio').replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 180)}.webm`;
}

// ——— The .gsdota file: the document, its name and the user's files (base64), embedded while they fit.
// `files`: { hash: { name, type, data: base64 } } — already chosen to fit (the page picks them).
export function lookFile(look, { name = '', app = '', files = {} } = {}) {
  return JSON.stringify({ ...lookDocument(look), name: String(name).slice(0, LOOK_LIMITS.name), app: String(app).slice(0, 40), saved: new Date().toISOString(), media: files });
}
// → { look, name, media: { hash: { name, type, data } } }; the page checks each file's hash again.
export function readLookFile(textValue) {
  if (typeof textValue !== 'string' || textValue.length > LOOK_LIMITS.file * 1.4) throw new LookError('Файл слишком большой для файла оформления.', 413);
  let value;
  try { value = JSON.parse(textValue.replace(/^﻿/, '')); } catch { broken(); }
  const look = lookDocument(value), wanted = lookMedia(look), media = {};
  for (const [hash, file] of Object.entries(value.media == null ? {} : object(value.media))) {
    if (!wanted[hash]) continue;
    object(file);
    if (!MEDIA_HASH.test(hash) || typeof file.data !== 'string' || !/^[A-Za-z0-9+/=]*$/.test(file.data)) broken();
    media[hash] = { name: text(file.name ?? wanted[hash].name, 200), type: LOOK_MEDIA_TYPES.includes(file.type) ? file.type : 'application/octet-stream', data: file.data };
  }
  return { look, name: typeof value.name === 'string' ? value.name.trim().slice(0, LOOK_LIMITS.name) : '', media };
}
// Which of the user's files go inside a .gsdota: smallest first while the total stays under the limit.
export function fileMediaPlan(sizes, limit = LOOK_LIMITS.fileMedia) {
  let total = 0;
  const inside = [], outside = [];
  for (const [hash, size] of Object.entries(sizes).sort((a, b) => a[1] - b[1])) {
    if (total + size <= limit) { total += size; inside.push(hash); } else outside.push(hash);
  }
  return { inside, outside, total };
}

// A name for an «Оформление»: what was given, trimmed, or «Оформление <date>».
export function lookName(value, fallback = 'Оформление') {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, LOOK_LIMITS.name);
  return name || fallback;
}
export { LookError };
