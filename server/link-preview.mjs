import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { renderCatalogPreview } from './catalog-preview.mjs';

// Link previews (Open Graph) for a work shared from the workshop: a grid (/workshop?id=…) or a menu
// background (/background?background=…). Messengers do not run the page's script, so nginx hands
// these two addresses to the API, which returns the built page with the work's title, author,
// a line of text and a 1200 × 630 picture: the grid on Dota's backdrop, or a frame of the
// background's video. 18+ works get a blurred picture. Everything else is the page as built.
export const PREVIEW_SIZE = [1200, 630];
export const PREVIEW_TEXT = {
  grid: 'Переходи и поставь эту сетку в Dota 2 за пару кликов! А ещё можно создать свои, либо отредактировать чужие.',
  background: 'Переходи и поставь этот фон в Dota 2 за пару кликов! А ещё можно создать свои, либо отредактировать чужие.',
};
let fonts = false;
const font = () => { if (!fonts) { GlobalFonts.registerFromPath(new URL('../assets/dota-fonts/montserrat/montserrat-700.ttf', import.meta.url).pathname, 'PreviewMontserrat'); fonts = true; } };
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The work's name and author, as the preview's title.
export const previewTitle = (item) => (item.author ? `${item.title} — ${item.author}` : item.title);

// The page with its title, description and the Open Graph / Twitter tags replaced.
export function withPreview(html, { title, description, url, image, alt }) {
  const [width, height] = PREVIEW_SIZE;
  const properties = [['og:type', 'website'], ['og:site_name', 'GridStudio'], ['og:locale', 'ru_RU'], ['og:title', title], ['og:description', description],
    ['og:url', url], ['og:image', image], ['og:image:type', 'image/jpeg'], ['og:image:width', width], ['og:image:height', height], ['og:image:alt', alt]];
  const names = [['twitter:card', 'summary_large_image'], ['twitter:title', title], ['twitter:description', description], ['twitter:image', image]];
  const tags = [...properties.map(([p, v]) => `<meta property="${p}" content="${escape(v)}"/>`), ...names.map(([n, v]) => `<meta name="${n}" content="${escape(v)}"/>`), `<link rel="canonical" href="${escape(url)}"/>`];
  return html
    .replace(/\n[ \t]*<meta\s+(?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace(/\n[ \t]*<link\s+rel="canonical"[^>]*>/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)} — GridStudio</title>`)
    .replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${escape(description)}"/>`)
    .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
}

// Built pages, reread when a release replaces them.
const pages = new Map();
export function sitePage(dir, name) {
  const file = join(dir, `${name}.html`), time = existsSync(file) ? statSync(file).mtimeMs : 0;
  const cached = pages.get(file);
  if (cached?.time === time) return cached.html;
  const html = time ? readFileSync(file, 'utf8') : null;
  pages.set(file, { time, html });
  return html;
}

async function jpeg(draw) {
  const [width, height] = PREVIEW_SIZE, canvas = createCanvas(width, height), context = canvas.getContext('2d');
  context.fillStyle = '#0f0e13'; context.fillRect(0, 0, width, height);
  await draw(context, width, height);
  return canvas.encode('jpeg', 86);
}
const cover = (context, image, width, height) => {
  const scale = Math.max(width / image.width, height / image.height), w = image.width * scale, h = image.height * scale;
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
};
// 18+: the picture blurred past recognition, like the workshop's cards before the age question.
function adult(context, width, height) {
  const copy = createCanvas(width, height); copy.getContext('2d').drawImage(context.canvas, 0, 0);
  context.filter = 'blur(36px) saturate(0.6)'; context.drawImage(copy, -40, -40, width + 80, height + 80); context.filter = 'none';
  context.fillStyle = '#15141a80'; context.fillRect(0, 0, width, height);
  font(); context.fillStyle = '#ece9f5'; context.font = '96px PreviewMontserrat'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('18+', width / 2, height / 2);
}

// A grid on Dota's backdrop (the workshop card's picture): whole, over a blurred copy of itself.
export async function gridPreviewImage(item) {
  const picture = await loadImage(await renderCatalogPreview(item.grid));
  return jpeg((context, width, height) => {
    context.filter = 'blur(24px) brightness(0.55)'; cover(context, picture, width, height); context.filter = 'none';
    const scale = Math.min(width / picture.width, height / picture.height), w = picture.width * scale, h = picture.height * scale;
    context.drawImage(picture, (width - w) / 2, (height - h) / 2, w, h);
    if (item.tags?.includes('18+')) adult(context, width, height);
  });
}

// A frame from a second into the background's video; the poster if ffmpeg cannot read it.
function frame(video) {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-v', 'error', '-ss', '1', '-i', video, '-frames:v', '1', '-vf', `scale=${PREVIEW_SIZE[0]}:-2`, '-f', 'image2', '-c:v', 'png', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = []; const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null); });
  });
}
export async function backgroundPreviewImage(row, files) {
  const still = await frame(files.video) || readFileSync(files.poster);
  const picture = await loadImage(still);
  return jpeg((context, width, height) => {
    cover(context, picture, width, height);
    if (JSON.parse(row.tags || '[]').includes('18+')) adult(context, width, height);
  });
}
