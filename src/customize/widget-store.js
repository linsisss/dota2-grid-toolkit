// The main menu's widgets on the page (scripts/menu-widgets.mjs, 2026-10-31): one list for the whole page,
// kept in localStorage gridstudio.widgets like every section's key (look-state.js), their pictures and videos
// in IndexedDB by hash (look-store.js keepMedia). Any component reads it with useWidgets(); the menu pack
// (background-pack.js) reads it with getWidgets() when it is built.
import { useSyncExternalStore } from 'react';
import { cleanWidgets, widgetMedia } from '../../scripts/menu-widgets.mjs';

export const WIDGETS_KEY = 'gridstudio.widgets';
const read = () => { try { return cleanWidgets(JSON.parse(localStorage.getItem(WIDGETS_KEY) || '[]')); } catch { return []; } };
let list = read();
const listeners = new Set();
const notify = () => { for (const listener of listeners) listener(); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

export const getWidgets = () => list;
// `next`: a list or a function of the list; it is checked (cleanWidgets) before it is kept.
export function setWidgets(next) {
  const value = cleanWidgets(typeof next === 'function' ? next(list) : next);
  if (JSON.stringify(value) === JSON.stringify(list)) return list;
  list = value;
  try { if (list.length) localStorage.setItem(WIDGETS_KEY, JSON.stringify(list)); else localStorage.removeItem(WIDGETS_KEY); } catch { /* no room: the page keeps it for now */ }
  notify();
  return list;
}
// Another tab changed it, or a document was applied (look-state.js writes the key and the page mounts again).
export function reloadWidgets() { list = read(); notify(); }
if (typeof addEventListener === 'function') addEventListener('storage', (event) => { if (event.key === WIDGETS_KEY) reloadWidgets(); });

export const useWidgets = () => [useSyncExternalStore(subscribe, getWidgets), setWidgets];
// The hashes of the widgets' files (kept when unused files are cleared: look-store.js pruneMedia).
export const widgetsMedia = () => widgetMedia(list);
