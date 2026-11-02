import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { mediaFile } from '../customize/look-store.js';

// What the constructor's live drawings share (WidgetView.jsx, BlockView.jsx): one ticking second for every
// clock and timer on the page, and the user's pictures and videos (kept in this browser by hash,
// look-store.js) as object URLs, made once per file. A drawing inside <MediaFrom value={hash → address}>
// takes its files from there instead: «Мастерская виджетов» (workshop.js) draws other people's widgets with
// the files the server keeps for them.

// One second for every clock on the page.
let now = Date.now();
const ticking = new Set();
let timer = 0;
const subscribe = (listener) => {
  ticking.add(listener);
  now = Date.now();
  if (!timer) timer = setInterval(() => { now = Date.now(); for (const one of ticking) one(); }, 1000);
  return () => { ticking.delete(listener); if (!ticking.size) { clearInterval(timer); timer = 0; } };
};
export const useNow = () => useSyncExternalStore(subscribe, () => now);
export const pad = (n) => String(n).padStart(2, '0');

// The user's picture or video for a widget, from this browser (look-store.js), as an address; and its type
// (a GIF in a video block is drawn as a picture: a <video> does not play it).
const urls = new Map(), types = new Map();
export const mediaType = (hash) => types.get(hash) || '';
// Where the files come from when not from this browser: a function of the hash → the address, or null.
export const MediaFrom = createContext(null);
export function useMediaURL(hash) {
  const from = useContext(MediaFrom);
  const [url, setUrl] = useState(() => (from ? '' : urls.get(hash) || ''));
  useEffect(() => {
    if (from) return undefined;
    if (!hash) { setUrl(''); return undefined; }
    if (urls.has(hash)) { setUrl(urls.get(hash)); return undefined; }
    let gone = false;
    mediaFile(hash).then((file) => {
      if (!file || gone) return;
      if (!urls.has(hash)) { urls.set(hash, URL.createObjectURL(file)); types.set(hash, file.type || ''); }
      setUrl(urls.get(hash));
    });
    return () => { gone = true; };
  }, [hash, from]);
  return from ? (hash ? from(hash) : '') : url;
}
export const rememberMediaURL = (hash, file) => { if (hash && file && !urls.has(hash)) { urls.set(hash, URL.createObjectURL(file)); types.set(hash, file.type || ''); } };
