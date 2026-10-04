import { useSyncExternalStore } from 'react';

// The viewer's «Мне есть 18» for this page only (asked for grids and backgrounds in 1.6.1, for ready-made
// arts on 2026-10-04): it uncovers every 18+ work on the page at once, a reload or «Скрыть 18+» blurs
// them again. Used by the workshop (src/catalog/Sensitive.jsx) and the editor's library (src/AsciiLibrary.jsx).
const listeners = new Set();
let confirmed = false;
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function setAdult(value) {
  confirmed = value;
  listeners.forEach(listener => listener());
}
export const useAdultConfirmed = () => useSyncExternalStore(subscribe, () => confirmed, () => false);
