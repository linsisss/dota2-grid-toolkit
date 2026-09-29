// The /customize menu preview's easter egg: the envelope in the top bar opens Dota's notifications
// popup, with one notification from GridStudio. Rendered here, like the friends rail
// (scripts/make-menu-rail.mjs), so Radiance looks as in the game.
//   node scripts/make-menu-notice.mjs  → assets/dota-menu/ui/notice.webp (2×), mail-on.webp
// Sizes and colours are measured on a 1080p screenshot of the popup: it hangs from the bar's
// bottom (row 61), centred under the envelope (x 1665.5), 340 px wide; title Radiance 600 15 px
// with 3 px tracking; a notification card fades from #373e48 to the popup's #1f2630, icon 24 px,
// text Radiance 14.5 px from x 47, date 13 px.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname, out = `${root}assets/dota-menu/ui`;
for (const [family, file] of [['Radiance400', 'radiance-regular'], ['Radiance600', 'radiance-semibold']])
  GlobalFonts.registerFromPath(`${root}assets/fonts/${file}.otf`, family);
const MESSAGE = 'Ты думал, здесь что-то будет?', DATE = '29.09.2026';

// The popup.
{
  const WIDTH = 340, HEIGHT = 105, SCALE = 2, canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE), context = canvas.getContext('2d');
  context.scale(SCALE, SCALE);
  const ground = context.createLinearGradient(0, 0, 0, 20);
  ground.addColorStop(0, 'rgb(12,15,20)'); ground.addColorStop(0.45, 'rgb(25,32,42)'); ground.addColorStop(1, 'rgb(31,38,48)');
  context.fillStyle = ground; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.font = '15px Radiance600'; context.fillStyle = 'rgb(228,230,228)'; context.textBaseline = 'alphabetic';
  context.letterSpacing = '3px';
  const title = 'УВЕДОМЛЕНИЯ', titleWidth = context.measureText(title).width - 3;
  context.fillText(title, (WIDTH - titleWidth) / 2, 34);
  context.letterSpacing = '0px';
  // The card: flat on the left, fading into the popup towards the right.
  const top = 44, left = 10, height = 51, card = context.createLinearGradient(left, 0, WIDTH, 0);
  card.addColorStop(0, 'rgb(55,62,72)'); card.addColorStop(0.35, 'rgb(55,60,71)'); card.addColorStop(0.6, 'rgb(44,48,60)'); card.addColorStop(0.8, 'rgb(37,43,55)'); card.addColorStop(1, 'rgb(31,38,48)');
  context.fillStyle = card; context.fillRect(left, top, WIDTH - left, height);
  // GridStudio's icon in place of the event's: assets/favicon-focus.svg (40-unit box) at 24 px.
  const size = 24, unit = size / 40, x = left + 24 - size / 2, y = top + height / 2 - size / 2;
  context.save(); context.translate(x, y); context.scale(unit, unit);
  context.beginPath(); context.roundRect(0, 0, 40, 40, 9); context.fillStyle = '#211e29'; context.fill();
  context.strokeStyle = '#c4b5ed'; context.lineWidth = 3; context.beginPath();
  context.moveTo(8, 7); context.lineTo(32, 32); context.moveTo(8, 21); context.lineTo(8, 32); context.lineTo(19, 32); context.moveTo(21, 7); context.lineTo(32, 7); context.lineTo(32, 18);
  context.stroke(); context.restore();
  context.font = '14.5px Radiance400'; context.fillStyle = 'rgb(230,233,238)'; context.fillText(MESSAGE, left + 47, top + 19);
  context.font = '13px Radiance400'; context.fillStyle = 'rgb(142,150,169)'; context.fillText(DATE, left + 47, top + 41);
  // The «open» arrow in the card's corner.
  context.strokeStyle = 'rgb(120,129,146)'; context.lineWidth = 1.4; context.lineCap = 'round'; context.beginPath();
  context.moveTo(left + 288, top + 42); context.lineTo(left + 295, top + 35); context.moveTo(left + 290, top + 35); context.lineTo(left + 295, top + 35); context.lineTo(left + 295, top + 40);
  context.stroke();
  writeFileSync(`${out}/notice.webp`, await canvas.encode('webp', 100));
}

// The envelope's tab while the popup is open: a soft blue glow and a lighter envelope, cut from
// bar.webp (x 1630–1702, the envelope is at 1651–1680 × 22–39).
{
  const bar = await loadImage(`${out}/bar.webp`), X = 1630, WIDTH = 72, HEIGHT = 61;
  const canvas = createCanvas(WIDTH, HEIGHT), context = canvas.getContext('2d');
  context.drawImage(bar, X, 0, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
  const original = context.getImageData(0, 0, WIDTH, HEIGHT);
  const glow = context.createRadialGradient(35.5, 30.5, 0, 35.5, 30.5, 27);
  glow.addColorStop(0, 'rgba(110,150,200,0.32)'); glow.addColorStop(0.55, 'rgba(110,150,200,0.12)'); glow.addColorStop(1, 'rgba(110,150,200,0)');
  context.globalCompositeOperation = 'lighter'; context.fillStyle = glow; context.fillRect(0, 0, WIDTH, HEIGHT); context.globalCompositeOperation = 'source-over';
  const image = context.getImageData(0, 0, WIDTH, HEIGHT), d = image.data, o = original.data;
  for (let y = 18; y < 44; y++) for (let x = 18; x < 54; x++) {
    const i = (y * WIDTH + x) * 4, light = (o[i] + o[i + 1] + o[i + 2]) / 3, a = Math.max(0, Math.min(1, (light - 40) / 60));
    if (!a) continue;
    d[i] = Math.min(255, o[i] * (1 + 0.35 * a) + 8 * a); d[i + 1] = Math.min(255, o[i + 1] * (1 + 0.35 * a) + 14 * a); d[i + 2] = Math.min(255, o[i + 2] * (1 + 0.35 * a) + 24 * a);
  }
  context.putImageData(image, 0, 0);
  writeFileSync(`${out}/mail-on.webp`, await canvas.encode('webp', 100));
}
console.log(`Готово: ${out}`);
