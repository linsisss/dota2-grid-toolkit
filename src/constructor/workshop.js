import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t } from '../../scripts/i18n.mjs';
import { cleanDesign, designMedia, WIDGET_SHARE } from '../../scripts/menu-widgets.mjs';
import { catalogAPI } from '../catalog/api.js';
import { keepMedia, mediaFile } from '../customize/look-store.js';
import { rememberMediaURL } from './live.js';

// «Мастерская виджетов» on the page (2026-10-31; server/menu-widgets.mjs, /api/catalog/widgets): a signed-in
// author publishes a design of «Мои виджеты» (its files first, by their SHA-256, then the design), a moderator
// approves it, and everyone finds it on the shelf «Виджеты» → «Мастерская», drawn live with the server's copies
// of its files (live.js MediaFrom). Adding one downloads its files into this browser (look-store.js keepMedia:
// the same bytes, the same hash), so the design works as one's own: on the menu, in the editor, in the pack.

// A file of a published widget (immutable: its address is its hash).
export const widgetMediaURL = (hash) => `/api/catalog/widget-media/${hash}`;
// What the server takes (server/menu-widgets.mjs WIDGET_SHARE): checked here first, so nothing is sent in vain.
export const SHARE_LIMITS = Object.freeze({ image: WIDGET_SHARE.mediaBytes.image, video: WIDGET_SHARE.mediaBytes.video, widget: WIDGET_SHARE.perWidgetBytes });
const mb = (bytes) => (bytes / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const kindOf = (file) => (/^video\//.test(file.type) ? 'video' : 'image');

// ——— What this browser published: { [designId]: { id, sum, status, reason, at } } (localStorage), so the
// editor's button knows «Отправлен на проверку» or «Опубликован» for the design as it was sent (`sum`).
const PUBLISHED_KEY = 'gridstudio.widget-published';
const readPublished = () => {
  try {
    const value = JSON.parse(localStorage.getItem(PUBLISHED_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key, item]) => /^d[a-z0-9]{1,16}$/.test(key) && Number.isInteger(item?.id))) : {};
  } catch { return {}; }
};
let published = readPublished();
const listeners = new Set();
const notify = () => { for (const listener of listeners) listener(); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const keepPublished = () => { try { localStorage.setItem(PUBLISHED_KEY, JSON.stringify(published)); } catch { /* This visit only. */ } };
if (typeof addEventListener === 'function') addEventListener('storage', (event) => { if (event.key === PUBLISHED_KEY) { published = readPublished(); notify(); } });
export const usePublished = () => useSyncExternalStore(subscribe, () => published);
export function rememberPublished(designId, value) {
  published = value ? { ...published, [designId]: { ...published[designId], ...value } } : Object.fromEntries(Object.entries(published).filter(([key]) => key !== designId));
  keepPublished(); notify();
}
// A widget deleted from the workshop: the editor's button forgets it (its design may be published again).
export function forgetPublished(widgetId) {
  for (const [designId, record] of Object.entries(published)) if (record.id === widgetId) rememberPublished(designId, null);
}
// A short fingerprint of a design as the server keeps it (cleanDesign, JSON): did it change since it was sent?
export function designSum(design) {
  const text = JSON.stringify(cleanDesign(design));
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}
// The state of a design here: null (never sent, or changed since), or its record ({ id, status, reason }).
export function publishedState(record, design) {
  return record && ['pending', 'approved', 'rejected', 'hidden'].includes(record.status) && record.sum === designSum(design) ? record : null;
}
// The author's view of a sent widget: its state now (pending, approved, rejected, hidden), or gone.
export async function refreshPublished(designId, record) {
  try {
    const card = await catalogAPI(`/widgets/${record.id}`);
    rememberPublished(designId, { status: card.status, reason: card.reason || '' });
    return card.status;
  } catch (error) {
    if (error.status === 404) rememberPublished(designId, null);
    return null;
  }
}

// ——— Publishing.
// The design's files as this browser keeps them, and what stands in the way of sending them: → { files, bytes, problem }.
export async function shareFiles(design) {
  const files = [];
  for (const hash of designMedia(design)) {
    const file = await mediaFile(hash);
    if (!file) return { files, bytes: 0, problem: t('Одной картинки или видео виджета нет в этом браузере. Выбери файл в блоке заново и сохрани виджет.') };
    const kind = kindOf(file), limit = SHARE_LIMITS[kind];
    if (file.size > limit) return { files, bytes: 0, problem: kind === 'video' ? t('Видео «{name}» больше {mb} МБ — в мастерскую берём до {mb} МБ.', { name: file.name, mb: mb(limit) })
      : t('Картинка «{name}» больше {mb} МБ — в мастерскую берём до {mb} МБ.', { name: file.name, mb: mb(limit) }) };
    files.push({ hash, file });
  }
  const bytes = files.reduce((sum, item) => sum + item.file.size, 0);
  if (bytes > SHARE_LIMITS.widget) return { files, bytes, problem: t('Картинки и видео одного виджета — до {mb} МБ, а здесь {have} МБ.', { mb: mb(SHARE_LIMITS.widget), have: mb(bytes) }) };
  return { files, bytes, problem: '' };
}
// Files the server has (sent from this browser before): not sent again.
const SENT_KEY = 'gridstudio.widget-media-sent';
const sentFiles = () => { try { const value = JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); return new Set(Array.isArray(value) ? value.filter((hash) => /^[a-f0-9]{64}$/.test(hash)) : []); } catch { return new Set(); } };
const markSent = (hashes, on = true) => {
  const all = sentFiles();
  for (const hash of hashes) { if (on) all.add(hash); else all.delete(hash); }
  try { localStorage.setItem(SENT_KEY, JSON.stringify([...all].slice(-400))); } catch { /* Sent again next time. */ }
};
// Sends a design to the workshop: its files (`onProgress({ done, total, bytes, sent })`), then the design.
// → { id, status }; throws the server's words.
export async function publishDesign(design, { onProgress = () => {}, files: ready = null } = {}) {
  const clean = cleanDesign(design), { files, bytes, problem } = ready || await shareFiles(clean);
  if (problem) throw new Error(problem);
  const send = async (all) => {
    const known = all ? new Set() : sentFiles(), list = files.filter((item) => !known.has(item.hash));
    let sent = 0;
    onProgress({ done: 0, total: list.length, bytes, sent: bytes - list.reduce((sum, item) => sum + item.file.size, 0) });
    for (const [index, item] of list.entries()) {
      try { await catalogAPI(`/widget-media/${item.hash}`, { method: 'PUT', raw: item.file, signal: AbortSignal.timeout(180_000) }); }
      catch (error) { throw error?.name === 'TimeoutError' ? new Error(t('Файл отправляется слишком долго. Проверь подключение и попробуй ещё раз.')) : error; }
      markSent([item.hash]);
      sent += item.file.size;
      onProgress({ done: index + 1, total: list.length, bytes, sent: bytes - list.reduce((sum, one) => sum + one.file.size, 0) + sent });
    }
  };
  await send(false);
  try { return await catalogAPI('/widgets', { method: 'POST', body: { design: clean } }); } catch (error) {
    // The server lost a file this browser thought it had: every file once more, then the design again.
    if (error.status !== 409 || !files.length || (error.code !== 'widget_media_missing' && !/картинки и видео|images and videos/i.test(error.message))) throw error;
    markSent(files.map((item) => item.hash), false);
    await send(true);
    return catalogAPI('/widgets', { method: 'POST', body: { design: clean } });
  }
}

// ——— Taking a published widget: its files into this browser (the same bytes keep the same hash).
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
const taking = new Map();
export function takeDesignFiles(design) {
  const hashes = designMedia(design);
  return Promise.all(hashes.map((hash) => {
    if (!taking.has(hash)) taking.set(hash, (async () => {
      if (await mediaFile(hash)) return;
      const response = await fetch(widgetMediaURL(hash), { credentials: 'same-origin' }).catch(() => null);
      if (!response?.ok) throw new Error(t('Не удалось скачать картинки виджета. Проверь подключение и попробуй ещё раз.'));
      const blob = await response.blob(), type = (response.headers.get('content-type') || blob.type || '').split(';')[0];
      const file = new File([blob], `${hash.slice(0, 12)}.${EXTENSIONS[type] || 'bin'}`, { type });
      const kept = await keepMedia(file);
      if (!kept) throw new Error(t('Браузеру не хватило места для файла. Освободи место или выбери файл поменьше.'));
      if (kept !== hash) throw new Error(t('Файл виджета пришёл повреждённым. Попробуй ещё раз.'));
      rememberMediaURL(hash, file);
    })().catch((error) => { taking.delete(hash); throw error; }));
    return taking.get(hash);
  }));
}
// «Добавить в меню» counts once a browser a day (the server decides).
export const countUse = (id) => catalogAPI(`/widgets/${id}/use`, { method: 'POST', body: {} }).catch(() => {});

// ——— The gallery: { items, total, own, loading, error, more(), reload(), patch(id, change), drop(id) }.
// `sort`: 'popular' | 'new'; `query`: a search by name; `user`: the account (its own widgets come first).
export function useWorkshop({ sort, query, user, active }) {
  const [state, setState] = useState({ items: null, total: 0, own: [], page: 0, loading: false, error: '' });
  const [round, setRound] = useState(0), asked = useRef(0);
  const load = useCallback(async (page, replace) => {
    const ticket = ++asked.current;
    setState((value) => ({ ...value, loading: true, error: '' }));
    try {
      const data = await catalogAPI(`/widgets?${new URLSearchParams({ sort, page: String(page), ...(query ? { q: query } : {}) })}`);
      if (ticket !== asked.current) return;
      setState((value) => {
        const seen = new Set(replace ? [] : value.items?.map((item) => item.id));
        return { items: [...(replace ? [] : value.items || []), ...data.items.filter((item) => !seen.has(item.id))], total: data.total, own: page === 0 ? data.own || [] : value.own, page, loading: false, error: '' };
      });
    } catch (error) {
      if (ticket !== asked.current) return;
      setState((value) => ({ ...value, items: value.items || [], loading: false, error: error.message }));
    }
  }, [sort, query]);
  // A pause in typing, then the first page (and again after signing in or out: the own widgets).
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => load(0, true), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, active, user, round]);
  const more = () => { if (!state.loading && state.items && state.items.length < state.total) load(state.page + 1, false); };
  const patch = (id, change) => setState((value) => ({ ...value, items: value.items?.map((item) => (item.id === id ? { ...item, ...change } : item)), own: value.own.map((item) => (item.id === id ? { ...item, ...change } : item)) }));
  const drop = (id) => setState((value) => ({ ...value, items: value.items?.filter((item) => item.id !== id), own: value.own.filter((item) => item.id !== id), total: Math.max(0, value.total - (value.items?.some((item) => item.id === id) ? 1 : 0)) }));
  return { ...state, more, reload: () => setRound((n) => n + 1), patch, drop, hasMore: !!state.items && state.items.length < state.total };
}
