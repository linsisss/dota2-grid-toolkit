import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { renderCatalogPreview } from './catalog-preview.mjs';
import { OG_SIZE, ogTags } from '../scripts/og-pages.mjs';

// Link previews (Open Graph) for a work shared from the workshop: a grid (/workshop?id=…) or a menu
// background (/background?background=…). Messengers do not run the page's script, so nginx hands
// these two addresses to the API, which returns the built page with the work's title, author,
// a line of text and a 1200 × 630 picture: the grid on Dota's backdrop, or a frame of the
// background's video. 18+ works get a blurred picture. The pages and their tabs have their own
// pictures (scripts/og-pages.mjs); everything else is the page as built.
export const PREVIEW_SIZE = OG_SIZE;
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

// The work's name and author, as the preview's title. A signed-in author's work has no signature of its
// own: the author is the profile's nickname (`creator.name`; a background row — the API passes it).
export const authorOf = (item) => item.author || item.creator?.name || '';
export const previewTitle = (item, author = authorOf(item)) => (author ? `${item.title} — ${author}` : item.title);

// The page with its title, description and the Open Graph / Twitter tags replaced (scripts/og-pages.mjs).
export const withPreview = (html, meta) => ogTags(html, meta, { head: true });

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

// The text cut to `room` with «…».
function fit(context, text, room) {
  let line = String(text || '');
  if (context.measureText(line).width <= room) return line;
  while (line.length > 1 && context.measureText(`${line}…`).width > room) line = line.slice(0, -1);
  return `${line.trimEnd()}…`;
}
// A work's caption under its picture (asked for on 2026-10-03: the pictures had no text of their own):
// the bottom darkened, the title on one line, then «СЕТКА ГЕРОЕВ» or «ФОН ГЛАВНОГО МЕНЮ» with the author,
// and the site on the right. CAPTION_TOP: where the caption starts; a grid is drawn whole above it and
// darkened only below itself (`shade`: where the darkening starts).
const CAPTION_TOP = 478;
function caption(context, width, height, { label, title, author, shade: from = height * 0.45 }) {
  const shade = context.createLinearGradient(0, from, 0, height);
  shade.addColorStop(0, '#0f0e1300'); shade.addColorStop(0.5, '#0f0e13c4'); shade.addColorStop(1, '#0f0e13f5');
  context.fillStyle = shade; context.fillRect(0, 0, width, height);
  font(); context.textBaseline = 'alphabetic';
  const bottom = height - 46, room = width - 128;
  context.font = '26px PreviewMontserrat'; context.fillStyle = '#c4b5ed'; context.textAlign = 'right';
  context.fillText('gridstudio.me', width - 64, bottom);
  const site = context.measureText('gridstudio.me').width;
  context.textAlign = 'left'; context.font = '22px PreviewMontserrat'; context.fillText(label, 64, bottom);
  const after = 64 + context.measureText(label).width;
  if (author) { context.fillStyle = '#afa7bf'; context.font = '26px PreviewMontserrat'; context.fillText(fit(context, `·  ${author}`, width - 64 - site - 40 - after - 14), after + 14, bottom); }
  context.fillStyle = '#f4f1fa'; context.font = '54px PreviewMontserrat'; context.fillText(fit(context, title, room), 64, bottom - 52);
}

// A grid on Dota's backdrop (the workshop card's picture): whole above the caption, over a blurred copy of itself.
export async function gridPreviewImage(item, author = authorOf(item)) {
  const picture = await loadImage(await renderCatalogPreview(item.grid));
  return jpeg((context, width, height) => {
    context.filter = 'blur(24px) brightness(0.55)'; cover(context, picture, width, height); context.filter = 'none';
    const top = 20, scale = Math.min((width - 80) / picture.width, (CAPTION_TOP - top) / picture.height), w = picture.width * scale, h = picture.height * scale;
    const x = (width - w) / 2;
    context.save(); context.shadowColor = '#00000099'; context.shadowBlur = 40; context.shadowOffsetY = 12; context.fillStyle = '#000';
    context.beginPath(); context.roundRect(x, top, w, h, 14); context.fill(); context.restore();
    context.save(); context.beginPath(); context.roundRect(x, top, w, h, 14); context.clip(); context.drawImage(picture, x, top, w, h); context.restore();
    context.strokeStyle = '#ffffff1f'; context.lineWidth = 1.5; context.beginPath(); context.roundRect(x + 0.75, top + 0.75, w - 1.5, h - 1.5, 14); context.stroke();
    if (item.tags?.includes('18+')) adult(context, width, height);
    caption(context, width, height, { label: 'СЕТКА ГЕРОЕВ', title: item.title, author, shade: top + h - 24 });
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
export async function backgroundPreviewImage(row, files, author = authorOf(row)) {
  const still = await frame(files.video) || readFileSync(files.poster);
  const picture = await loadImage(still);
  return jpeg((context, width, height) => {
    cover(context, picture, width, height);
    if (JSON.parse(row.tags || '[]').includes('18+')) adult(context, width, height);
    caption(context, width, height, { label: 'ФОН ГЛАВНОГО МЕНЮ', title: row.title, author });
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

// A shared Dotadle result (server/dotadle.mjs shared): drawn like the site (redone on 2026-10-06 —
// «не в стиле сайта»): its ground and lilac, the GridStudio mark, the site's SF Pro Display (Inter without it), and the squares as the game's hints table — rows of five cells in its own colours under
// the column names, the unused tries as empty rows. `result` null — the game's own picture, a sample.
// SF Pro Display is Apple's and stays out of the repository: the server keeps the same files the site
// loads (fonts.cdnfonts.com) in CATALOG_PREVIEW_FONTS (asked for on 2026-10-06: «делаем SF Pro Display
// все»). Without them — a clone of the repository — Inter (OFL, assets/preview-fonts/inter) stands in.
let previewFonts = false;
const interFonts = () => {
  if (previewFonts) return;
  const dir = process.env.CATALOG_PREVIEW_FONTS || '', sf = ['SFPRODISPLAYMEDIUM', 'SFPRODISPLAYBOLD'].map((name) => join(dir, `${name}.woff`));
  const files = dir && sf.every((file) => existsSync(file)) ? [[sf[0], 'GSInterMedium'], [sf[1], 'GSInterSemi'], [sf[1], 'GSInterBold']]
    : [['Inter-Medium', 'GSInterMedium'], ['Inter-SemiBold', 'GSInterSemi'], ['Inter-Bold', 'GSInterBold']].map(([file, name]) => [new URL(`../assets/preview-fonts/inter/${file}.ttf`, import.meta.url).pathname, name]);
  for (const [file, name] of files) GlobalFonts.registerFromPath(file, name);
  previewFonts = true;
};
const CELL = { 2: '#2f6b45', 1: '#7a6528', 0: '#6b2f37' };
const SAMPLE = { number: null, solved: true, tries: 4, rows: ['00100', '20120', '22122', '22222'] };
function mark(context, x, y, size) {
  const k = size / 32;
  context.save(); context.translate(x, y); context.scale(k, k);
  context.strokeStyle = '#c4b5ed'; context.lineWidth = 2.6; context.lineCap = 'square'; context.lineJoin = 'miter';
  context.beginPath(); context.moveTo(5, 4); context.lineTo(28, 28); context.moveTo(5, 18); context.lineTo(5, 28); context.lineTo(15, 28); context.moveTo(18, 4); context.lineTo(28, 4); context.lineTo(28, 14); context.stroke();
  context.restore();
}
export async function dotadlePreviewImage(result) {
  const shown = result || SAMPLE;
  interFonts();
  return jpeg((context, width, height) => {
    context.fillStyle = '#15141a'; context.fillRect(0, 0, width, height);
    const glow = (x, y, r, color) => { const g = context.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, '#15141a00'); context.fillStyle = g; context.fillRect(0, 0, width, height); };
    glow(160, 60, 620, '#c4b5ed1c'); glow(1080, 640, 520, '#c4b5ed12');
    context.textBaseline = 'alphabetic'; context.textAlign = 'left';
    // The site's mark and name, top left.
    mark(context, 72, 64, 40);
    context.fillStyle = '#efeaf5'; context.font = '28px GSInterBold'; context.fillText('GRID', 126, 95);
    const grid = context.measureText('GRID').width; context.font = '28px GSInterMedium'; context.fillText('STUDIO', 126 + grid, 95);
    // The game and the score.
    context.font = '96px GSInterBold'; context.fillStyle = '#efeaf5'; context.fillText('Dotadle', 68, 268);
    if (result) { const w = context.measureText('Dotadle ').width; context.fillStyle = '#afa7bf'; context.font = '96px GSInterMedium'; context.fillText(`#${result.number}`, 68 + w, 268); }
    if (result) {
      context.font = '44px GSInterSemi'; context.fillStyle = '#efeaf5';
      const lead = result.solved ? 'Угадано за ' : 'Не угадано: ', leadW = context.measureText(lead).width;
      context.fillText(lead, 72, 348); context.fillStyle = result.solved ? '#c4b5ed' : '#e58a96'; context.fillText(`${result.solved ? result.tries : 'X'}/6`, 72 + leadW, 348);
    } else { context.font = '44px GSInterSemi'; context.fillStyle = '#efeaf5'; context.fillText('Угадай героя дня', 72, 348); }
    context.font = '27px GSInterMedium'; context.fillStyle = '#afa7bf';
    context.fillText('Герой Dota 2 по портрету из символов.', 72, 402); context.fillText('Новый каждый день — сможешь быстрее?', 72, 440);
    // The site's main button.
    context.font = '26px GSInterSemi'; const label = 'Играть на gridstudio.me', bw = context.measureText(label).width + 56;
    context.beginPath(); context.roundRect(72, 494, bw, 64, 12); context.fillStyle = '#c4b5ed'; context.fill();
    context.fillStyle = '#231b35'; context.fillText(label, 100, 535);
    // The hints table, right: a panel, the column names, six rows of five cells.
    const panelW = 452, panelX = width - 72 - panelW, rowH = 50, gap = 8, head = 40, panelH = 28 * 2 + head + 6 * rowH + 5 * gap, panelY = (height - panelH) / 2;
    context.beginPath(); context.roundRect(panelX, panelY, panelW, panelH, 18); context.fillStyle = '#211e29'; context.fill();
    context.strokeStyle = '#ffffff1c'; context.lineWidth = 1.5; context.stroke();
    const left = panelX + 28, cellW = (panelW - 56) / 5, top = panelY + 28;
    context.font = '17px GSInterMedium'; context.fillStyle = '#afa7bf'; context.textAlign = 'center';
    ['Атрибут', 'Атака', 'Роли', 'Скорость', 'Дальн.'].forEach((name, i) => context.fillText(name, left + cellW * i + cellW / 2, top + 20));
    for (let row = 0; row < 6; row++) {
      const y = top + head + row * (rowH + gap), marks = shown.rows[row];
      for (let i = 0; i < 5; i++) {
        const x = left + i * cellW, r = [i === 0 ? 10 : 0, i === 4 ? 10 : 0, i === 4 ? 10 : 0, i === 0 ? 10 : 0];
        context.beginPath(); context.roundRect(x, y, cellW + (i < 4 ? 0.5 : 0), rowH, r); context.fillStyle = marks ? CELL[marks[i]] : '#ffffff0a'; context.fill();
      }
    }
    context.textAlign = 'left';
  });
}
