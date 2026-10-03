// The site's link preview picture (Open Graph, 1200 × 630) for the home page and the pages without
// a work of their own: the brand, what the site does and the editor's screenshot.
//   node scripts/make-og-image.mjs            → assets/og/home.jpg
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
// Libre Franklin from the font catalogue (Montserrat left it in 1.8.0), under the old family names.
for (const weight of [400, 700]) GlobalFonts.registerFromPath(`${root}assets/dota-fonts/libre-franklin/libre-franklin-${weight}.ttf`, `Montserrat${weight}`);
const [W, H] = [1200, 630], canvas = createCanvas(W, H), c = canvas.getContext('2d');
const INK = '#efeaf5', MUTED = '#afa7bf', ACCENT = '#c4b5ed', GROUND = '#15141a';

c.fillStyle = GROUND; c.fillRect(0, 0, W, H);
const glow = c.createRadialGradient(W * 0.78, H * 0.45, 40, W * 0.78, H * 0.45, 620);
glow.addColorStop(0, '#3b2f5a66'); glow.addColorStop(1, '#15141a00'); c.fillStyle = glow; c.fillRect(0, 0, W, H);

// The editor, running off the right edge.
const shot = await loadImage(readFileSync(`${root}assets/design/editor-readme.webp`));
const x = 540, y = 86, w = 860, h = Math.round(w * shot.height / shot.width), r = 18;
c.save(); c.shadowColor = '#00000099'; c.shadowBlur = 50; c.shadowOffsetY = 18; c.fillStyle = '#000'; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); c.restore();
c.save(); c.beginPath(); c.roundRect(x, y, w, h, r); c.clip(); c.drawImage(shot, x, y, w, h); c.restore();
c.strokeStyle = '#ffffff1f'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); c.stroke();
const fade = c.createLinearGradient(x - 10, 0, x + 120, 0); fade.addColorStop(0, '#15141a'); fade.addColorStop(1, '#15141a00'); c.fillStyle = fade; c.fillRect(x - 10, 0, 130, H);

// Brand, headline, what it is.
const logo = await loadImage(readFileSync(`${root}assets/favicon.svg`));
c.drawImage(logo, 64, 74, 52, 52);
c.fillStyle = INK; c.font = '28px Montserrat700'; c.textBaseline = 'middle'; c.fillText('GridStudio', 130, 101);
c.textBaseline = 'alphabetic'; c.font = '50px Montserrat700';
['Сетки героев,', 'фоны и шрифты', 'для Dota 2'].forEach((line, i) => c.fillText(line, 64, 238 + i * 62));
c.fillStyle = MUTED; c.font = '23px Montserrat400';
['Собери своё в студии или возьми', 'готовое в мастерской — бесплатно,', 'прямо в браузере.'].forEach((line, i) => c.fillText(line, 64, 420 + i * 33));
c.fillStyle = ACCENT; c.font = '24px Montserrat700'; c.fillText('gridstudio.me', 64, 562);

mkdirSync(`${root}assets/og`, { recursive: true });
writeFileSync(`${root}assets/og/home.jpg`, await canvas.encode('jpeg', 88));
console.log('Готово: assets/og/home.jpg');
