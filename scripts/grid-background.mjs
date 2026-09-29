// Behind grid previews: the Dota 2 hero-grid backdrop («Как в Dota», the default), the old
// gradient, or «Мой фон» — the user's own menu background from «Студия» (src/my-background.js).
// The choice is a per-browser preference, shared by the workshop and the editor preview.
// The backdrop images come from scripts/make-grid-background.mjs (fitted to the game at 1080p).
export const GRID_BACKGROUND_KEY = 'gridstudio.grid-background';
const EVENT = 'gridstudio:grid-background';

const known = (value) => ['gradient', 'mine'].includes(value) ? value : 'dota';
export function gridBackground() {
  try { return known(localStorage.getItem(GRID_BACKGROUND_KEY)); } catch { return 'dota'; }
}
// Pages style their CSS backdrops from <html data-grid-background>.
export function applyGridBackground(value = gridBackground()) {
  if (typeof document !== 'undefined') document.documentElement.dataset.gridBackground = value;
  return value;
}
export function setGridBackground(value) {
  const next = known(value);
  try { localStorage.setItem(GRID_BACKGROUND_KEY, next); } catch { /* Only this page remembers it. */ }
  applyGridBackground(next);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}
// Calls back on every change, in this tab and in others. Returns the unsubscribe function.
export function onGridBackground(callback) {
  const local = (event) => callback(event.detail);
  const other = (event) => { if (event.key === GRID_BACKGROUND_KEY) callback(applyGridBackground()); };
  window.addEventListener(EVENT, local); window.addEventListener('storage', other);
  return () => { window.removeEventListener(EVENT, local); window.removeEventListener('storage', other); };
}

// 2386×1186 for large previews, 1193×593 for cards.
const URLS = {
  large: new URL('../assets/backgrounds/dota-grid.webp', import.meta.url).href,
  small: new URL('../assets/backgrounds/dota-grid-1x.webp', import.meta.url).href
};
const images = new Map();
export function gridBackgroundImage(large = false) {
  const url = large ? URLS.large : URLS.small;
  if (!images.has(url)) images.set(url, new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url;
  }));
  return images.get(url);
}
