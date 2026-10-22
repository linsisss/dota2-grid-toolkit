// The page's state as an «Оформление» document (scripts/customize-look.mjs) and back (2026-10-22).
// Each section keeps its own key in localStorage, as before: gridstudio.interface (HUD, chat, texts),
// gridstudio.cursor (+ its pictures in IndexedDB gridstudio-cursors), gridstudio.font, gridstudio.d2pfx,
// and now gridstudio.menu (the menu's backgrounds and buttons, which were not kept at all — «тут только
// фоны не сохраняются с прошлого раза»). Applying a document writes those keys and the page is mounted
// again (CustomizeApp.jsx), so every section reads its state the one way it always does.
import { LOOK_FORMAT, LOOK_LIMITS, LOOK_VERSION, emptyLook, lookDocument, lookMedia } from '../../scripts/customize-look.mjs';
import { pictureBlobs, putPictureBlob } from './cursor-store.js';
import { mediaFile, putMediaBlob, readState, writeState } from './look-store.js';

export const KEYS = Object.freeze({ menu: 'gridstudio.menu', interface: 'gridstudio.interface', cursor: 'gridstudio.cursor', font: 'gridstudio.font', d2pfx: 'gridstudio.d2pfx', portraits: 'gridstudio.portraits', link: 'gridstudio.look' });
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value) => { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

// ——— «Фон меню» and the pages after it: kept in gridstudio.menu as the document's `menu` (look-store.js
// keeps the user's files by hash). An unreadable value reads as nothing kept.
export function readMenuState() {
  const value = read(KEYS.menu);
  if (!value) return null;
  try { return lookDocument({ format: LOOK_FORMAT, version: LOOK_VERSION, menu: value }).menu; } catch { return null; }
}
export const writeMenuState = (menu) => write(KEYS.menu, menu);
// The hashes of files the page itself names now (kept when unused files are cleared: look-store.js pruneMedia).
export function namedMedia() {
  const menu = readMenuState(), font = read(KEYS.font);
  const look = { ...emptyLook(), ...(menu ? { menu } : {}) };
  const named = Object.keys(lookMedia(look));
  for (const face of font?.own?.faces || []) if (face?.media) named.push(face.media);
  for (const entry of read(KEYS.portraits)?.heroes || []) if (entry?.source?.media) named.push(entry.source.media);
  return named;
}

// ——— The «Студия» item this page saves into: { id, name } (or none: the page is only a draft here).
export const readLink = () => { const value = read(KEYS.link); return value && /^[a-f0-9-]{36}$/.test(value.id) ? { id: value.id, name: String(value.name || '') } : null; };
export const writeLink = (link) => write(KEYS.link, link ? { id: link.id, name: link.name } : null);

// ——— Cursor pictures for a document: the kept PNG, or the live picture drawn again; a big one becomes a
// WebP of at most 256 px (cursors are 96 px at most), so a document stays small.
async function blobToDataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/png'};base64,${btoa(text)}`;
}
const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
async function compactPicture(source) {
  const side = Math.max(source.width, source.height), k = Math.min(1, 256 / side);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(source.width * k)); canvas.height = Math.max(1, Math.round(source.height * k));
  const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const png = await canvasBlob(canvas, 'image/png'), webp = await canvasBlob(canvas, 'image/webp', 0.92);
  return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : png;
}
export async function cursorPictures(cursor, live = {}) {
  const keys = [...Object.values(cursor.own), ...Object.values(cursor.packed)].map((role) => role?.key).filter(Boolean);
  const kept = await pictureBlobs(keys), out = {};
  for (const key of new Set(keys)) {
    let blob = kept[key];
    try {
      if (!blob && live[key]) blob = await compactPicture(live[key]);
      if (!blob) continue;
      let url = await blobToDataURL(blob);
      if (url.length > LOOK_LIMITS.picture / 2) url = await blobToDataURL(await compactPicture(await createImageBitmap(blob)));
      if (url.length <= LOOK_LIMITS.picture) out[key] = url;
    } catch { /* That cursor goes without its picture. */ }
  }
  return out;
}

// ——— Applying a document: the sections' keys, the cursor pictures and the files that came with it. The
// page is mounted again after this (CustomizeApp.jsx). `files`: { hash: Blob } from a .gsdota.
export async function applyLook(input, { files = {} } = {}) {
  const look = lookDocument(input), remap = {};
  for (const [hash, blob] of Object.entries(files)) {
    const real = await putMediaBlob(blob, blob.name).catch(() => null);
    if (real && real !== hash) remap[hash] = real;
  }
  const fix = (bg) => (bg?.source.kind === 'file' && bg.source.media && remap[bg.source.media] ? { ...bg, source: { ...bg.source, media: remap[bg.source.media] } } : bg);
  const menu = { ...look.menu, background: fix(look.menu.background), grid: { ...look.menu.grid, own: fix(look.menu.grid.own) }, hero: { ...look.menu.hero, own: fix(look.menu.hero.own) }, loading: { ...look.menu.loading, own: fix(look.menu.loading.own) } };
  writeMenuState(menu);
  write(KEYS.interface, { hud: look.hud, texts: look.texts });
  for (const [key, url] of Object.entries(look.pictures)) {
    try { await putPictureBlob(key, await (await fetch(url)).blob()); } catch { /* That cursor comes back without its picture. */ }
  }
  write(KEYS.cursor, look.cursor);
  const font = look.font.own ? { ...look.font, own: { ...look.font.own, faces: look.font.own.faces.map((face) => ({ ...face, media: remap[face.media] || face.media })) } } : look.font;
  write(KEYS.font, font);
  write(KEYS.d2pfx, { choice: look.d2pfx.choice });
  const heroes = look.portraits.heroes.map((entry) => (entry.source.media && remap[entry.source.media] ? { ...entry, source: { ...entry.source, media: remap[entry.source.media] } } : entry));
  write(KEYS.portraits, heroes.length ? { heroes } : null);
  return look;
}

// ——— The state before a file or an item replaced it, to go back to once («Вернуть как было»).
export async function keepPrevious(look, link) {
  try { await writeState('previous', { look, link: link || null, saved: Date.now() }); return true; } catch { return false; }
}
export const readPrevious = () => readState('previous');

// The user's files a document names, as Files from this browser: { hash: File }.
export async function lookFiles(look) {
  const out = {};
  for (const hash of Object.keys(lookMedia(look))) { const file = await mediaFile(hash); if (file) out[hash] = file; }
  return out;
}

// The page's state as its keys hold it (before the page is mounted, e.g. to keep it before an item opens).
// A section that does not read is left as in Dota rather than losing the rest.
export async function storedLook() {
  const menu = readMenuState(), inter = read(KEYS.interface) || {}, cursor = read(KEYS.cursor) || {}, font = read(KEYS.font) || {}, d2pfx = read(KEYS.d2pfx) || {}, portraits = read(KEYS.portraits);
  const parts = { ...(menu ? { menu } : {}), hud: inter.hud, texts: inter.texts, cursor, font, d2pfx: { choice: d2pfx.choice }, ...(portraits ? { portraits } : {}) };
  const base = { format: LOOK_FORMAT, version: LOOK_VERSION };
  let look;
  try { look = lookDocument({ ...base, ...parts }); }
  catch {
    const good = {};
    for (const [key, value] of Object.entries(parts)) { try { lookDocument({ ...base, [key]: value }); good[key] = value; } catch { /* As in Dota. */ } }
    look = lookDocument({ ...base, ...good });
  }
  try { return lookDocument({ ...look, pictures: await cursorPictures(look.cursor) }); } catch { return look; }
}
