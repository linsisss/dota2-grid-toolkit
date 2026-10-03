// The site's link preview pictures (Open Graph, 1200 × 630), one per page (scripts/og-pages.mjs): the
// brand, the section, what the page does and a screenshot of it. The home page's shows the editor
// without a section.
//   node scripts/make-og-image.mjs            → assets/og/<page>.jpg
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { OG_PAGES, OG_SIZE } from './og-pages.mjs';
import { iconSVG } from './icons.mjs';

const root = new URL('../', import.meta.url).pathname;
// Libre Franklin from the font catalogue (Montserrat left it in 1.8.0), under the old family names.
for (const weight of [400, 700]) GlobalFonts.registerFromPath(`${root}assets/dota-fonts/libre-franklin/libre-franklin-${weight}.ttf`, `Montserrat${weight}`);
const [W, H] = OG_SIZE;
const INK = '#efeaf5', MUTED = '#afa7bf', ACCENT = '#c4b5ed', GROUND = '#15141a';
const TEXT_WIDTH = 456;

// A screenshot running off the right edge, `crop` of it (16:9) in a frame of `w` × `h`.
function screenshot(c, image, crop, x, y, w, h) {
  const r = 18;
  c.save(); c.shadowColor = '#00000099'; c.shadowBlur = 50; c.shadowOffsetY = 18; c.fillStyle = '#000'; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); c.restore();
  c.save(); c.beginPath(); c.roundRect(x, y, w, h, r); c.clip(); c.imageSmoothingQuality = 'high'; c.drawImage(image, ...crop, x, y, w, h); c.restore();
  c.strokeStyle = '#ffffff1f'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); c.stroke();
  const fade = c.createLinearGradient(x - 10, 0, x + 120, 0); fade.addColorStop(0, GROUND); fade.addColorStop(1, '#15141a00'); c.fillStyle = fade; c.fillRect(x - 10, 0, 130, H);
}

async function picture(draw) {
  const canvas = createCanvas(W, H), c = canvas.getContext('2d');
  c.fillStyle = GROUND; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W * 0.78, H * 0.45, 40, W * 0.78, H * 0.45, 620);
  glow.addColorStop(0, '#3b2f5a66'); glow.addColorStop(1, '#15141a00'); c.fillStyle = glow; c.fillRect(0, 0, W, H);
  await draw(c);
  // The brand and the address.
  c.drawImage(await loadImage(readFileSync(`${root}assets/favicon.svg`)), 64, 74, 52, 52);
  c.fillStyle = INK; c.font = '28px Montserrat700'; c.textBaseline = 'middle'; c.fillText('GridStudio', 130, 101);
  c.textBaseline = 'alphabetic'; c.fillStyle = ACCENT; c.font = '24px Montserrat700'; c.fillText('gridstudio.me', 64, 562);
  return canvas.encode('jpeg', 88);
}

// The home page: what the whole site does, the editor.
const home = () => picture(async (c) => {
  const shot = await loadImage(readFileSync(`${root}assets/design/editor-readme.webp`));
  screenshot(c, shot, [0, 0, shot.width, shot.height], 540, 86, 860, Math.round(860 * shot.height / shot.width));
  c.fillStyle = INK; c.font = '50px Montserrat700';
  ['Сетки героев,', 'фоны и шрифты', 'для Dota 2'].forEach((line, i) => c.fillText(line, 64, 238 + i * 62));
  c.fillStyle = MUTED; c.font = '23px Montserrat400';
  ['Собери своё в студии или возьми', 'готовое в мастерской — бесплатно,', 'прямо в браузере.'].forEach((line, i) => c.fillText(line, 64, 420 + i * 33));
});

// A section's page: the section with its icon, the headline, the text, its screenshot.
const section = (page) => picture(async (c) => {
  screenshot(c, await loadImage(readFileSync(root + page.shot.file)), page.shot.crop, 540, 73, 860, 484);
  const icon = await loadImage(Buffer.from(iconSVG(page.icon).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"').replaceAll('currentColor', ACCENT)));
  c.font = '20px Montserrat700';
  const chip = 14 + 20 + 9 + c.measureText(page.label).width + 16;
  c.fillStyle = '#c4b5ed1c'; c.strokeStyle = '#c4b5ed47'; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(64, 150, chip, 40, 20); c.fill(); c.stroke();
  c.drawImage(icon, 78, 160, 20, 20);
  c.fillStyle = ACCENT; c.textBaseline = 'middle'; c.fillText(page.label, 107, 171); c.textBaseline = 'alphabetic';
  // The headline and the text in the middle between the section and the address; a long line makes
  // the headline smaller.
  c.font = '48px Montserrat700';
  const size = Math.min(48, Math.floor(48 * TEXT_WIDTH / Math.max(...page.headline.map((line) => c.measureText(line).width))));
  const step = Math.round(size * 1.21), cap = Math.round(size * 0.72), gap = 50, line = 32;
  const block = cap + (page.headline.length - 1) * step + gap + (page.text.length - 1) * line + 6;
  const top = Math.round(190 + (350 - block) / 2 + cap);
  c.fillStyle = INK; c.font = `${size}px Montserrat700`;
  page.headline.forEach((text, i) => c.fillText(text, 64, top + i * step));
  c.fillStyle = MUTED; c.font = '23px Montserrat400';
  const below = top + (page.headline.length - 1) * step + gap;
  page.text.forEach((text, i) => c.fillText(text, 64, below + i * line));
});

mkdirSync(`${root}assets/og`, { recursive: true });
for (const [key, page] of Object.entries(OG_PAGES)) {
  if (page.image) continue;
  writeFileSync(`${root}assets/og/${key}.jpg`, await (key === 'home' ? home() : section(page)));
  console.log(`Готово: assets/og/${key}.jpg`);
}
