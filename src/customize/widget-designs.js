// The user's own widgets made in «Редактор виджета» (scripts/menu-widgets.mjs cleanDesign, 2026-10-31): a small
// library in localStorage gridstudio.widget-designs, [{ id, updated, design }], newest first; the blocks' pictures
// and videos are kept in IndexedDB by hash (look-store.js keepMedia). A «custom» widget on the menu carries a copy
// of its design: saving a design here updates every widget made of it (widget-store.js).
import { useSyncExternalStore } from 'react';
import { cleanDesign } from '../../scripts/menu-widgets.mjs';
import { setWidgets } from './widget-store.js';

export const DESIGNS_KEY = 'gridstudio.widget-designs';
export const DESIGN_LIMIT = 60;
const read = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DESIGNS_KEY) || '[]');
    return (Array.isArray(value) ? value : []).filter((item) => /^d[a-z0-9]{1,16}$/.test(item?.id)).slice(0, DESIGN_LIMIT)
      .map((item) => ({ id: item.id, updated: Number(item.updated) || 0, design: cleanDesign(item.design) }));
  } catch { return []; }
};
let list = read();
const listeners = new Set();
const notify = () => { for (const listener of listeners) listener(); };
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const keep = () => { try { if (list.length) localStorage.setItem(DESIGNS_KEY, JSON.stringify(list)); else localStorage.removeItem(DESIGNS_KEY); return true; } catch { return false; } };

export const getDesigns = () => list;
export const useDesigns = () => useSyncExternalStore(subscribe, getDesigns);
export const newDesignId = () => `d${Math.random().toString(36).slice(2, 10)}`;
// Saves a design (a new one without `id`) → its id. The menu's widgets made of it take the new design.
export function saveDesign(design, id = null) {
  const clean = cleanDesign(design), key = id && /^d[a-z0-9]{1,16}$/.test(id) ? id : newDesignId();
  list = [{ id: key, updated: Date.now(), design: clean }, ...list.filter((item) => item.id !== key)].slice(0, DESIGN_LIMIT);
  keep(); notify();
  setWidgets((widgets) => widgets.map((widget) => (widget.type === 'custom' && widget.props.designId === key ? { ...widget, props: { ...widget.props, design: clean } } : widget)));
  return key;
}
export function deleteDesign(id) {
  list = list.filter((item) => item.id !== id);
  keep(); notify();
}
if (typeof addEventListener === 'function') addEventListener('storage', (event) => { if (event.key === DESIGNS_KEY) { list = read(); notify(); } });
