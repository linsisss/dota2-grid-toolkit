// Where a minigame's files are (assets/minigames/<id>/, made by scripts/make-minigame-assets.mjs),
// its Valve strings in the page's language, and the best score kept in this browser.
import { lang } from '../../../scripts/i18n.mjs';

export const assetBase = (id) => `./assets/minigames/${id}/`;

const cache = new Map();
export function loadJSON(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${response.status} ${url}`)))));
  return cache.get(url);
}

// Both languages load (a switch must not wait); valve(key, values) picks the current one.
export async function loadStrings(id) {
  const base = assetBase(id);
  const [ru, en] = await Promise.all([loadJSON(`${base}strings.ru.json`), loadJSON(`${base}strings.en.json`).catch(() => ({}))]);
  return (key, values = {}) => fillValve((lang === 'en' ? en[key] : ru[key]) ?? ru[key] ?? key, values);
}

// Valve's dialog variables: {d:name}, {s:name}, {f:1:name}; <br/> becomes a new line.
export function fillValve(text, values = {}) {
  return String(text).replace(/\{(?:[dsg]|f:\d+):(\w+)\}/g, (all, name) => (name in values ? values[name] : all)).replace(/<br\s*\/?>/g, '\n');
}

const BEST_KEY = 'gridstudio.minigames.best';
export function bestScore(id) {
  try { return Number(JSON.parse(localStorage.getItem(BEST_KEY) || '{}')[id]) || 0; } catch { return 0; }
}
// Keeps the score if it is a record; says whether it was.
export function saveScore(id, score) {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    if ((Number(all[id]) || 0) >= score) return false;
    all[id] = score;
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}
