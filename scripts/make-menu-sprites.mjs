// Cuts the Dota 2 main-menu chrome for the /customize preview out of a 1920×1080 screenshot of
// the menu (supplied by the user on 2026-09-29; not in the repository: it shows their profile).
//   node scripts/make-menu-sprites.mjs <screenshot 1920×1080> [out dir]
// Only parts without personal data are kept: the top bar (the shards count is painted over with
// the bar's own colour and a neutral 10 000 written in), the ИГРАТЬ button, the chat line and the
// event card of the news column. The friends rail is rendered by scripts/make-menu-rail.mjs.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';

const [source, out = new URL('../assets/dota-menu/ui/', import.meta.url).pathname] = process.argv.slice(2);
if (!source) throw new Error('Укажи скриншот главного меню 1920×1080.');
const image = await loadImage(source);
if (image.width !== 1920 || image.height !== 1080) throw new Error('Нужен скриншот ровно 1920×1080.');
mkdirSync(out, { recursive: true });
const screen = createCanvas(1920, 1080).getContext('2d');
screen.drawImage(image, 0, 0);

// Measured on the screenshot: the bar is rows 0–60, the logo tab's plate hangs to row 72 at x 217–361.
const BAR = 61, TAB = { left: 217, right: 361, bottom: 73 };
// The shards count (x 1538–1616, rows 14–35) becomes the bar's colour of each row, taken just right of it.
for (let y = 14; y <= 35; y++) {
  const row = screen.getImageData(1617, y, 5, 1).data, rgb = [0, 1, 2].map((c) => Math.round((row[c] + row[4 + c] + row[8 + c] + row[12 + c] + row[16 + c]) / 5));
  screen.fillStyle = `rgb(${rgb.join(',')})`; screen.fillRect(1538, y, 79, 1);
}
// …and a neutral count goes in its place, in the game's gold.
GlobalFonts.registerFromPath(new URL('../assets/fonts/radiance-semibold.otf', import.meta.url).pathname, 'Radiance600');
screen.save(); screen.font = '22px Radiance600'; screen.fillStyle = '#e6cf88'; screen.letterSpacing = '2px';
screen.shadowColor = '#d7a2448c'; screen.shadowBlur = 8; screen.fillText('10 000', 1540, 33); screen.restore();
async function save(name, x, y, width, height, mask) {
  const canvas = createCanvas(width, height), context = canvas.getContext('2d');
  context.drawImage(screen.canvas, x, y, width, height, 0, 0, width, height);
  if (mask) { context.globalCompositeOperation = 'destination-in'; mask(context); }
  writeFileSync(`${out}/${name}.webp`, await canvas.encode('webp', 100));
}
// The whole bar with the tab; the page shows its left part, its right part and repeats `bar-mid` between.
// One path: with destination-in, two separate fills would keep only their overlap.
await save('bar', 0, 0, 1920, TAB.bottom, (context) => { context.beginPath(); context.rect(0, 0, 1920, BAR); context.rect(TAB.left, BAR, TAB.right - TAB.left + 1, TAB.bottom - BAR); context.fill(); });
// The part that widens on 21:9: a 4 px slice where the left and right parts meet, repeated, so
// the bar is seamless at any width (a stretched textured piece showed as a darker block).
await save('bar-mid', 1486, 0, 4, BAR);
await save('play', 1532, 1010, 330, 49);
await save('chat', 616, 1025, 688, 34);               // the party chat line, as it reads in the game
await save('news', 1532, 100, 330, 484);
// The friends rail: only its chrome. Names, avatars and the mini-profile are drawn by the page.
await save('rail-search', 32, 414, 366, 48);        // search field, add friend, friend filter
await save('rail-dota', 32, 464, 150, 28);          // ▾ 3 В DOTA 2
await save('rail-guild', 32, 678, 205, 28);         // ▾ ЧЛЕНЫ ГИЛЬДИИ (9)
await save('rail-slot', 214, 492, 54, 52);          // an empty party slot
await save('rail-eye', 350, 497, 34, 34);           // watch the party
await save('rail-star', 43, 715, 14, 15);           // favourite
// The party leader's crown sits on a friend's avatar: keep only its blue pixels.
{
  const canvas = createCanvas(22, 17), context = canvas.getContext('2d');
  context.drawImage(screen.canvas, 114, 494, 22, 17, 0, 0, 22, 17);
  const pixels = context.getImageData(0, 0, 22, 17);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const [r, g, b] = pixels.data.subarray(i, i + 3);
    pixels.data[i + 3] = b > 120 && b > r + 50 ? 255 : b > 90 && b > r + 30 ? 120 : 0;
  }
  context.putImageData(pixels, 0, 0);
  writeFileSync(`${out}/rail-crown.webp`, await canvas.encode('webp', 100));
}
// The party bar without the user: their avatar and its lock become an empty slot (the page puts
// the menu owner's avatar there), the chat square gets GridStudio's avatar under its unread badge.
{
  const top = 989, canvas = createCanvas(366, 70), context = canvas.getContext('2d');
  context.drawImage(screen.canvas, 32, top, 366, 70, 0, 0, 366, 70);
  const badge = createCanvas(20, 20); badge.getContext('2d').drawImage(screen.canvas, 371, 997, 20, 20, 0, 0, 20, 20);
  context.drawImage(screen.canvas, 137, 1000, 5, 48, 89 - 32, 1000 - top, 5, 48);  // the gap between slots, over the lock's edge
  context.drawImage(screen.canvas, 95, 1044, 42, 3, 48 - 32, 1044 - top, 42, 3);
  context.drawImage(screen.canvas, 95, 1002, 42, 42, 48 - 32, 1002 - top, 42, 42);
  // GridStudio's avatar: the logo mark of assets/favicon-focus.svg (40-unit box) on its dark ground.
  const x = 336 - 32, y = 1001 - top, unit = 46 / 40;
  context.save(); context.beginPath(); context.rect(x, y, 46, 46); context.clip();
  context.fillStyle = '#211e29'; context.fillRect(x, y, 46, 46);
  context.translate(x, y); context.scale(unit, unit);
  context.strokeStyle = '#c4b5ed'; context.lineWidth = 3; context.beginPath();
  context.moveTo(8, 7); context.lineTo(32, 32); context.moveTo(8, 21); context.lineTo(8, 32); context.lineTo(19, 32); context.moveTo(21, 7); context.lineTo(32, 7); context.lineTo(32, 18);
  context.stroke(); context.restore();
  context.drawImage(badge, 371 - 32, 997 - top);
  writeFileSync(`${out}/rail-party.webp`, await canvas.encode('webp', 100));
}
console.log(`Готово: ${out}`);
