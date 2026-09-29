import { listBackgrounds } from '../scripts/background-library.mjs';

// «Мой фон» behind grid previews: the menu background built last in this browser («Студия»), laid
// out as Dota lays a menu background on the hero-grid page. The frame covers the 1080p screen, the
// grid area is cut from it where scripts/make-grid-background.mjs found it (x 269, y 174, 1.1497
// screen pixels per grid pixel) and dimmed as the game dims the page under the grid.
const SCREEN = [1920, 1080], GRID = { x: 269, y: 174, scale: 1.1497 }, DIM = 0.45;

// The newest background with a picture here: a frame a second into its video, else its poster.
let latest = null;
function latestScreen() {
  latest ||= (async () => {
    const records = await listBackgrounds().catch(() => []);
    const record = records.find((item) => item.video instanceof Blob || item.poster instanceof Blob);
    if (!record) return null;
    const picture = (record.video instanceof Blob && await videoFrame(record.video).catch(() => null)) || await createImageBitmap(record.poster).catch(() => null);
    if (!picture) return null;
    const [width, height] = SCREEN, screen = document.createElement('canvas'), ctx = screen.getContext('2d');
    screen.width = width; screen.height = height;
    const scale = Math.max(width / picture.width, height / picture.height), w = picture.width * scale, h = picture.height * scale;
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(picture, (width - w) / 2, (height - h) / 2, w, h);
    ctx.fillStyle = `rgba(0,0,0,${DIM})`; ctx.fillRect(0, 0, width, height);
    picture.close?.();
    return { id: record.id, name: record.name, screen };
  })();
  return latest;
}
async function videoFrame(blob) {
  const element = document.createElement('video'), url = URL.createObjectURL(blob);
  try {
    element.muted = true; element.src = url;
    await new Promise((done, failed) => { element.onloadeddata = done; element.onerror = failed; });
    element.currentTime = Math.min(1, (element.duration || 1) / 2);
    await new Promise((done) => { element.onseeked = done; });
    return await createImageBitmap(element);
  } finally { URL.revokeObjectURL(url); }
}

export const hasMyBackground = async () => !!(await latestScreen());
export const myBackgroundName = async () => (await latestScreen())?.name || '';
// The grid area: 1193×593, or 2386×1186 for large previews; null without a background here.
const grounds = new Map();
export function myGridBackground(large = false) {
  const key = large ? 2 : 1;
  if (!grounds.has(key)) grounds.set(key, latestScreen().then((latestOne) => {
    if (!latestOne) return null;
    const canvas = document.createElement('canvas'); canvas.width = 1193 * key; canvas.height = 593 * key;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(latestOne.screen, GRID.x, GRID.y, 1193 * GRID.scale, 593 * GRID.scale, 0, 0, canvas.width, canvas.height);
    return canvas;
  }));
  return grounds.get(key);
}
// The whole screen for CSS backdrops (the editor's game preview): --my-grid-background on <html>.
let screenURL = null;
export async function applyMyBackground() {
  if (screenURL) return true;
  const latestOne = await latestScreen();
  if (!latestOne) return false;
  const blob = await new Promise((done) => latestOne.screen.toBlob(done, 'image/jpeg', 0.9));
  screenURL = URL.createObjectURL(blob);
  document.documentElement.style.setProperty('--my-grid-background', `url("${screenURL}")`);
  return true;
}
