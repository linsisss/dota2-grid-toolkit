// The season-event button and screen for the builder's menu preview (DotaMenu.jsx).
//   node scripts/make-menu-event.mjs <menu with the button> <the event shown> [out dir]
// Two 1920×1080 screenshots of the menu with the event pack installed (supplied by the user on
// 2026-10-01; not in the repository: they show their profile). From them come the event's logo (from
// the first one's button, x 1549–1604, y 610–665, keyed off the button's flat dark ground) and the
// middle of the event screen, between the friends rail and the news column, above the chat line;
// the cursor and the profile are outside these. The button itself is drawn by the page in CSS,
// like the pack's MENU_UI (scripts/menu-background.mjs); its texts are drawn here in Radiance, as in
// the make-menu-rail/notice pictures, white (the page dims them to the game's #cccccc): the event's
// title (Dota's DOTA_Seasonal_Quartero_Title, «Диковинки Квортеро») and UI_BACK («Назад»), in
// upper case, 16 px, 1 px tracking, with the cell title's black shadow. Redo it for each new event
// (assets/dota-menu/event.json).
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const [menu, event, out = `${root}assets/dota-menu/ui`] = process.argv.slice(2);
if (!menu || !event) throw new Error('Укажи два скриншота 1920×1080: меню с кнопкой ивента и открытый ивент.');
mkdirSync(out, { recursive: true });
GlobalFonts.registerFromPath(`${root}assets/fonts/radiance-regular.otf`, 'Radiance400');
const TITLES = { 'event-title': 'Диковинки Квортеро', 'event-back-title': 'Назад' };

async function screen(file) {
  const image = await loadImage(file);
  if (image.width !== 1920 || image.height !== 1080) throw new Error(`${file}: нужен скриншот ровно 1920×1080.`);
  const context = createCanvas(1920, 1080).getContext('2d');
  context.drawImage(image, 0, 0);
  return context;
}
const [withButton, shown] = [await screen(menu), await screen(event)];

// The logo: alpha from how far a pixel is from the button's ground, colour unmixed from it.
{
  const [x, y, size] = [1549, 610, 56], ground = [28, 22, 17], full = 60;
  const pixels = withButton.getImageData(x, y, size, size), data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.hypot(data[i] - ground[0], data[i + 1] - ground[1], data[i + 2] - ground[2]);
    const alpha = Math.min(1, Math.max(0, (distance - 6) / full));
    for (let c = 0; c < 3; c++) data[i + c] = alpha ? Math.round(Math.min(255, Math.max(0, ground[c] + (data[i + c] - ground[c]) / alpha))) : 0;
    data[i + 3] = Math.round(alpha * 255);
  }
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').putImageData(pixels, 0, 0);
  writeFileSync(`${out}/event-logo.webp`, await canvas.encode('webp', 100));
}

// The titles, 2×, on a 250 × 56 label: left-aligned, the capitals centred in its height.
for (const [name, text] of Object.entries(TITLES)) {
  const [width, height, scale] = [250, 56, 2], canvas = createCanvas(width * scale, height * scale), context = canvas.getContext('2d');
  context.scale(scale, scale);
  context.font = '16px Radiance400'; context.letterSpacing = '1px'; context.fillStyle = '#ffffff';
  const caps = context.measureText('Д').actualBoundingBoxAscent, baseline = Math.round((height + caps) / 2);
  // Panorama's «0px 1px 3px 3 #000000»: a 3 px black shadow at strength 3, drawn three times.
  context.shadowColor = '#000000'; context.shadowOffsetY = 1 * scale; context.shadowBlur = 3 * scale;
  for (let pass = 0; pass < 3; pass++) context.fillText(text.toUpperCase(), 0, baseline);
  writeFileSync(`${out}/${name}.webp`, await canvas.encode('webp', 100));
}

const save = async (source, name, x, y, width, height, quality) => {
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(source.canvas, x, y, width, height, 0, 0, width, height);
  writeFileSync(`${out}/${name}.webp`, await canvas.encode('webp', quality));
};
await save(shown, 'event-screen', 398, 61, 1134, 959, 82);
console.log(`Готово: ${out}`);
