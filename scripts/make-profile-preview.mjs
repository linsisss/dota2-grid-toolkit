// The builder's hover preview of the profile buttons (MenuBackground.jsx, «Кнопки Stratz и Dotabuff»):
// the head of a Dota profile («Витрина») with the pack's buttons under the status line.
//   node scripts/make-profile-preview.mjs <profile screenshot 1920×1080> → assets/dota-menu/ui/profile-preview.webp (2×)
// Laid out in 1080p pixels as measured on a screenshot of a profile with the test pack (supplied by
// the user on 2026-10-01; not in the repository: it shows their profile): avatar 136 px at (264, 140),
// rank medal beside it, name from x 501 (baseline 172), status line (baseline 198; sizes matched to
// the screenshot's text widths: the game draws Valve's 40 and 16 px about 4 and 7 % narrower), the header's separator at y 220, the buttons 28 px high from y 227 (the pack's
// PROFILE_STYLE_TEXT: 5 px padding, 18 px logo, 7 px gap, 14 px text with 1 px tracking, 10 px
// padding, 8 px apart). Only the Steam icon is taken from the screenshot (keyed off the background);
// the rest is drawn with Valve's Radiance, like the menu preview's friends rail. The profile is the
// menu preview's owner (dissonance, avatar.webp, the Titan medal), with a made-up ID.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname, ui = `${root}assets/dota-menu/ui`;
const [shot] = process.argv.slice(2);
if (!shot) throw new Error('Укажи скриншот профиля 1920×1080 с кнопками.');
for (const [family, file] of [['Radiance400', 'radiance-regular'], ['Radiance600', 'radiance-semibold']])
  GlobalFonts.registerFromPath(`${root}assets/fonts/${file}.otf`, family);
const NAME = 'dissonance', STATUS = 'В главном меню', ID = '104857600';
const CROP = { x: 244, y: 118, w: 580, h: 174 }, SCALE = 2;

// The Steam icon: white on the screenshot's background; alpha from how much lighter than it a pixel is.
const screen = createCanvas(1920, 1080).getContext('2d');
screen.drawImage(await loadImage(shot), 0, 0);
const steam = createCanvas(20, 20);
{
  const pixels = screen.getImageData(644, 184, 20, 20), data = pixels.data, ground = [data[0], data[1], data[2]];
  const groundLight = (ground[0] + ground[1] + ground[2]) / 3;
  for (let i = 0; i < data.length; i += 4) {
    const light = (data[i] + data[i + 1] + data[i + 2]) / 3, alpha = Math.max(0, Math.min(1, (light - groundLight) / (235 - groundLight)));
    data[i] = data[i + 1] = data[i + 2] = 235; data[i + 3] = Math.round(alpha * 255);
  }
  steam.getContext('2d').putImageData(pixels, 0, 0);
}

const canvas = createCanvas(CROP.w * SCALE, CROP.h * SCALE), context = canvas.getContext('2d');
context.scale(SCALE, SCALE); context.translate(-CROP.x, -CROP.y);
// The page's ground: Dota's dark blue profile, lit a little from the top.
const ground = context.createLinearGradient(0, CROP.y, 0, CROP.y + CROP.h);
ground.addColorStop(0, '#222a3b'); ground.addColorStop(1, '#10141d');
context.fillStyle = ground; context.fillRect(CROP.x, CROP.y, CROP.w, CROP.h);
const shadow = (blur, y, color = '#000000') => Object.assign(context, { shadowColor: color, shadowBlur: blur * SCALE, shadowOffsetX: 0, shadowOffsetY: y * SCALE });
const plain = () => Object.assign(context, { shadowColor: 'transparent', shadowBlur: 0, shadowOffsetY: 0 });

// The separator under the status line, from the medal to the right.
context.fillStyle = 'rgba(255, 255, 255, 0.1)'; context.fillRect(408, 220, CROP.x + CROP.w - 408, 1);
// Avatar (4 px corners, a soft shadow) and the medal.
shadow(16, 4, 'rgba(0, 0, 0, 0.8)'); context.fillStyle = '#000'; context.beginPath(); context.roundRect(264, 140, 136, 136, 4); context.fill(); plain();
context.save(); context.beginPath(); context.roundRect(264, 140, 136, 136, 4); context.clip();
context.drawImage(await loadImage(`${ui}/avatar.webp`), 264, 140, 136, 136); context.restore();
context.drawImage(await loadImage(`${ui}/rank-medal.webp`), 414, 136, 76, 76);
// Name and status line.
context.font = '38.5px Radiance400'; context.fillStyle = '#ffffff'; shadow(8, 2); context.fillText(NAME, 501, 172);
context.font = '15px Radiance600'; context.fillStyle = 'rgb(150, 196, 150)'; shadow(5, 1); context.fillText(STATUS.toUpperCase(), 501, 198);
const steamX = 501 + context.measureText(STATUS.toUpperCase()).width + 12;
plain(); context.drawImage(steam, steamX, 184);
context.font = '15px Radiance400'; context.letterSpacing = '1px'; context.fillStyle = 'rgba(176, 188, 194, 0.9)'; shadow(5, 1);
context.fillText(`ID: ${ID}`, steamX + 24, 198); plain();
// The buttons.
const icons = { stratz: readFileSync(`${root}assets/dota-menu/icons/stratz.svg`), dotabuff: readFileSync(`${root}assets/dota-menu/icons/dotabuff.svg`) };
let left = 501;
context.font = '14px Radiance400'; context.letterSpacing = '1px';
for (const [icon, label] of [['stratz', 'STRATZ'], ['dotabuff', 'DOTABUFF']]) {
  const width = 1 + 5 + 18 + 7 + context.measureText(label).width - 1 + 10 + 1, top = 227, height = 28;
  context.fillStyle = 'rgba(13, 15, 24, 0.69)'; context.fillRect(left, top, width, height);
  context.strokeStyle = 'rgba(235, 247, 255, 0.07)'; context.lineWidth = 1; context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
  context.drawImage(await loadImage(icons[icon]), left + 6, top + 5, 18, 18);
  context.fillStyle = '#B0BCC2'; shadow(5, 1); context.fillText(label, left + 31, top + 19); plain();
  left += width + 8;
}
writeFileSync(`${ui}/profile-preview.webp`, await canvas.encode('webp', 92));
console.log(`Готово: ${ui}/profile-preview.webp`);
