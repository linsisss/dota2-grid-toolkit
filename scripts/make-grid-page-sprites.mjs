// The «Герои» page's own parts for the builder's preview of the background under the hero grid
// (src/customize/DotaGridPage.jsx; the top bar is the hero page's hero-bar.webp, the party bar, chat
// and ИГРАТЬ are the menu's).
//   node scripts/make-grid-page-sprites.mjs <1920×1080 screenshot of the «Герои» page> [out dir]
// Source: the user's screenshot of 2026-09-29 (not in the repository: it shows their grid and party),
// taken over Valve's own background. That background is known: assets/backgrounds/dota-screen.webp
// is the same screen without the interface (scripts/make-grid-background.mjs), so the interface is
// lifted off it pixel by pixel: where the screenshot is lighter than the background, a light layer
// (text, icons) of the least opacity that explains it; where darker, a black one (bands, boxes).
// Kept: the sub-navigation «ГЕРОИ / РУКОВОДСТВА / ТРЕНДЫ» and its band, the bans, the sort row
// (the page writes the chosen grid's name into its box) and the filters. All of it lies in the
// 1920-wide middle of the screen, centred like the hero grid.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const [shot, out = `${root}assets/dota-menu/ui`] = process.argv.slice(2);
if (!shot) throw new Error('Укажи скриншот страницы «Герои» 1920×1080.');
mkdirSync(out, { recursive: true });
const read = async (file) => {
  const image = await loadImage(file);
  if (image.width !== 1920 || image.height !== 1080) throw new Error(`${file}: нужно 1920×1080.`);
  const context = createCanvas(1920, 1080).getContext('2d');
  context.drawImage(image, 0, 0);
  return context;
};
const [screen, ground] = [await read(shot), await read(`${root}assets/backgrounds/dota-screen.webp`)];

// One layer over the known ground: alpha and colour per pixel. `floor`: alpha under it is noise.
// `solid`: rectangles (in the piece) that are opaque in the game — portraits, boxes, buttons —
// taken as they are; lifting splits them into light and dark halves that wash out on a bright
// background.
// `band(row)`: a black band the page draws itself (its alpha at a screen row), taken out of the piece.
function lift(x, y, width, height, { floor = 0.05, solid = [], band = null, paint } = {}) {
  const s = screen.getImageData(x, y, width, height).data, b = ground.getImageData(x, y, width, height).data;
  if (band) for (let i = 0; i < b.length; i += 4) { const keep = 1 - band(y + Math.floor(i / 4 / width)); b[i] *= keep; b[i + 1] *= keep; b[i + 2] *= keep; }
  const canvas = createCanvas(width, height), context = canvas.getContext('2d'), out = context.createImageData(width, height), o = out.data;
  const inSolid = (px, py) => solid.some(([sx, sy, sw, sh]) => px >= sx && px < sx + sw && py >= sy && py < sy + sh);
  for (let i = 0; i < s.length; i += 4) {
    if (inSolid((i / 4) % width, Math.floor(i / 4 / width))) { o.set(s.subarray(i, i + 3), i); o[i + 3] = 255; continue; }
    const lighter = s[i] + s[i + 1] + s[i + 2] >= b[i] + b[i + 1] + b[i + 2];
    let alpha = 0;
    for (let c = 0; c < 3; c++) alpha = Math.max(alpha, lighter ? (s[i + c] - b[i + c]) / Math.max(1, 255 - b[i + c]) : (b[i + c] - s[i + c]) / Math.max(1, b[i + c]));
    alpha = Math.min(1, alpha);
    if (alpha < floor) continue;
    for (let c = 0; c < 3; c++) o[i + c] = Math.round(Math.max(0, Math.min(255, (s[i + c] - (1 - alpha) * b[i + c]) / alpha)));
    o[i + 3] = Math.round(alpha * 255);
  }
  context.putImageData(out, 0, 0);
  paint?.(context);
  return canvas;
}
const save = async (name, canvas) => writeFileSync(`${out}/${name}.webp`, await canvas.encode('webp', 92));

// Measured on the screenshot: the band under the top bar is rows 61–112, black at 0.71 fading to
// 0.57 in the middle and to nothing at the bottom (DotaGridPage draws it in CSS: SUBNAV_BAND); its
// text sits at x 425–875.
const SUBNAV_BAND = (row) => (row < 61 || row > 112 ? 0 : row <= 86 ? 0.71 - (0.14 * (row - 61)) / 25 : 0.57 * (1 - (row - 86) / 26));
await save('grid-subnav', lift(420, 70, 470, 36, { band: SUBNAV_BAND }));
// The four ban slots: portraits at x 1346, 1424, 1502, 1580 (68 × 38, rows 127–164).
await save('grid-bans', lift(1236, 120, 420, 52, { solid: [110, 188, 266, 344].map((x) => [x, 7, 68, 38]) }));
// The sort row: «СОРТИРОВКА:», its box (x 360–570, rows 899–937) and the edit button (578–636), both
// solid; the box's old grid name is painted over with its own colour, the page writes the chosen one.
await save('grid-sort', lift(250, 894, 392, 46, { floor: 0.03, solid: [[110, 5, 211, 39], [328, 5, 59, 39]], paint: (context) => {
  const inside = context.getImageData(118, 24, 1, 1).data;
  context.fillStyle = `rgb(${inside[0]}, ${inside[1]}, ${inside[2]})`;
  context.fillRect(116, 10, 174, 28);
} }));
await save('grid-filters', lift(950, 884, 700, 68));
// The band's colour, for the page's CSS: rows 61–112 at a column without text.
const band = lift(1500, 61, 1, 52, { floor: 0 }).getContext('2d').getImageData(0, 0, 1, 52).data;
console.log('band', [0, 25, 51].map((row) => `row ${61 + row}: rgba(${band[row * 4]}, ${band[row * 4 + 1]}, ${band[row * 4 + 2]}, ${(band[row * 4 + 3] / 255).toFixed(2)})`).join('  '));
console.log(`Готово: ${out}`);
