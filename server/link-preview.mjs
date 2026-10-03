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
  guide: 'Гайд на GridStudio: как оформить Dota 2 под себя.',
  profile: 'Сетки, фоны и гайды автора на GridStudio.',
};
let fonts = false;
// Libre Franklin Bold (SIL OFL, one of the font page's catalogue, scripts/fetch-dota-fonts.mjs); until
// 1.8.2 Montserrat, which left the catalogue in 1.8.0, and the previews fell back to a plain font.
const font = () => { if (!fonts) { GlobalFonts.registerFromPath(new URL('../assets/dota-fonts/libre-franklin/libre-franklin-700.ttf', import.meta.url).pathname, 'PreviewMontserrat'); fonts = true; } };
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

// A guide (server/guides.mjs): its cover darkened under the title, or the site's lilac without one;
// «Гайд» and its section above the title. Also the picture of its Telegram moderation card.
export async function guidePreviewImage({ title, section, author, cover: coverFile }) {
  const picture = coverFile ? await loadImage(readFileSync(coverFile)).catch(() => null) : null;
  return jpeg((context, width, height) => {
    if (picture) {
      cover(context, picture, width, height);
      const shade = context.createLinearGradient(0, height * 0.25, 0, height);
      shade.addColorStop(0, '#0f0e1300'); shade.addColorStop(1, '#0f0e13f2');
      context.fillStyle = shade; context.fillRect(0, 0, width, height);
    } else {
      const glow = context.createRadialGradient(width * 0.15, 0, 0, width * 0.15, 0, width);
      glow.addColorStop(0, '#c4b5ed55'); glow.addColorStop(1, '#0f0e1300');
      context.fillStyle = glow; context.fillRect(0, 0, width, height);
    }
    font();
    context.textBaseline = 'alphabetic'; context.textAlign = 'left';
    // The title on at most two lines, cut with «…».
    context.fillStyle = '#f4f1fa'; context.font = '58px PreviewMontserrat';
    const words = String(title || '').split(/\s+/), lines = [''];
    for (const word of words) {
      const next = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
      if (context.measureText(next).width <= width - 128 || !lines.at(-1)) lines[lines.length - 1] = next;
      else if (lines.length < 2) lines.push(word);
      else { lines[1] = `${lines[1]}…`; break; }
    }
    while (context.measureText(lines.at(-1)).width > width - 128 && lines.at(-1).length > 2) lines[lines.length - 1] = `${lines.at(-1).slice(0, -2)}…`;
    // From the bottom: the author, the title's last line above it, «ГАЙД · раздел» over the first.
    const last = height - (author ? 112 : 64), first = last - (lines.length - 1) * 70;
    lines.forEach((line, i) => context.fillText(line, 64, first + i * 70));
    context.fillStyle = '#c4b5ed'; context.font = '28px PreviewMontserrat';
    context.fillText(`Гайд${section ? ` · ${section}` : ''}`.toUpperCase(), 64, first - 74);
    if (author) { context.fillStyle = '#afa7bf'; context.font = '28px PreviewMontserrat'; context.fillText(author, 64, height - 56); }
  });
}


// A creator's profile (server/profiles.mjs, asked for on 2026-10-03): the avatar in a ring, the nickname,
// the badges as pills, and the counts; the site's lilac glow behind. `avatar`: the picture's bytes.
export async function profilePreviewImage({ nickname, avatar, badges, stats }) {
  const picture = avatar ? await loadImage(Buffer.from(avatar)).catch(() => null) : null;
  return jpeg((context, width, height) => {
    const glow = context.createRadialGradient(width * 0.2, height * 0.1, 0, width * 0.2, height * 0.1, width);
    glow.addColorStop(0, '#c4b5ed40'); glow.addColorStop(1, '#0f0e1300');
    context.fillStyle = glow; context.fillRect(0, 0, width, height);
    const size = 240, x = 96, y = (height - size) / 2 - 20;
    context.save(); context.beginPath(); context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); context.clip();
    if (picture) context.drawImage(picture, x, y, size, size); else { context.fillStyle = '#2a2633'; context.fillRect(x, y, size, size); }
    context.restore();
    context.strokeStyle = '#ffffff30'; context.lineWidth = 3; context.beginPath(); context.arc(x + size / 2, y + size / 2, size / 2 + 1.5, 0, Math.PI * 2); context.stroke();
    font();
    const left = x + size + 64, room = width - left - 72;
    context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    let nameSize = 76;
    context.font = `${nameSize}px PreviewMontserrat`;
    while (context.measureText(nickname).width > room && nameSize > 40) context.font = `${(nameSize -= 4)}px PreviewMontserrat`;
    context.fillStyle = '#f4f1fa'; context.fillText(nickname, left, y + 92);
    // Badges as pills, as many as fit on one line.
    let pillX = left;
    context.font = '24px PreviewMontserrat';
    for (const badge of badges) {
      const w = context.measureText(badge.label).width + 36;
      if (pillX + w > width - 72) break;
      context.fillStyle = `${badge.color}26`; context.strokeStyle = `${badge.color}99`; context.lineWidth = 2;
      context.beginPath(); context.roundRect(pillX, y + 122, w, 44, 22); context.fill(); context.stroke();
      context.fillStyle = badge.color; context.fillText(badge.label, pillX + 18, y + 152);
      pillX += w + 12;
    }
    context.fillStyle = '#afa7bf'; context.font = '30px PreviewMontserrat';
    context.fillText(stats, left, y + (badges.length ? 222 : 160));
    context.fillStyle = '#c4b5ed'; context.font = '26px PreviewMontserrat';
    context.fillText('gridstudio.me', 96, height - 56);
  });
}
