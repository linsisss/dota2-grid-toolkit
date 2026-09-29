import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drawCatalogGrid } from '../scripts/catalog-rendering.mjs';
import { normalizeCatalogGrid } from '../scripts/catalog-document.mjs';
import { heroImages, loadFonts } from './catalog-preview.mjs';

// The landing's stage screen: the grid opened in the editor. Two captures of the real editor
// (scripts/capture-editor-template.cjs: a 1440 × 760 window like the stage's 1280:675, at density 2) supply everything
// that is not the grid: editor-rows.webp has the enabled controls and one sample of every layer
// row, editor-template.webp an empty canvas and list. On top go the grid itself, its name, the
// counters and the layer list built from the grid — what the editor would show after opening it.
const asset = (name) => fileURLToPath(new URL(`../assets/landing/${name}`, import.meta.url));
let layout = null, pictures = null;
const measures = () => (layout ||= JSON.parse(readFileSync(asset('editor-template.json'), 'utf8')));
function captures() {
  pictures ||= Promise.all([loadImage(asset('editor-rows.webp')), loadImage(asset('editor-template.webp'))]).then(([rows, blank]) => {
    const probe = createCanvas(rows.width, rows.height).getContext('2d'), dpr = measures().dpr || 1;
    probe.drawImage(rows, 0, 0);
    const at = (v, max) => Math.max(0, Math.min(max - 1, Math.round(v * dpr)));
    const color = (x, y) => { const [r, g, b] = probe.getImageData(at(x, rows.width), at(y, rows.height), 1, 1).data; return `rgb(${r}, ${g}, ${b})`; };
    return { rows, blank, color };
  });
  return pictures;
}
const UI = (size, weight = 400) => `${weight} ${size}px Inter, "Segoe UI", Arial, "DejaVu Sans", sans-serif`;
function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let chars = Array.from(text);
  while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
  return chars.join('').trimEnd() + '…';
}

// Widths the landing can ask for (srcset): the stage is ~820–950 CSS px wide on a desktop.
export const SHOWCASE_WIDTHS = Object.freeze([1440, 2160, 2880]);
export async function renderEditorShowcase(source, widths = SHOWCASE_WIDTHS) {
  const { grid } = normalizeCatalogGrid(source);
  loadFonts();
  const { size: [W, H], dpr = 1, template, rows } = measures(), { rows: filled, blank, color } = await captures();
  const config = grid.configs[0], categories = config.categories;
  // Everything below is in the capture's CSS pixels; the canvas has its density.
  const canvas = createCanvas(W * dpr, H * dpr), ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const copy = (image, [x, y, w, h], dx = x, dy = y) => ctx.drawImage(image, x * dpr, y * dpr, w * dpr, h * dpr, dx, dy, w, h);
  const clear = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  const write = (text, x, middle, font, { size, weight = 400, align = 'left', max = 1e4 } = {}) => {
    ctx.font = UI(size, weight); ctx.fillStyle = font.color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    const shown = fit(ctx, text, max); ctx.fillText(shown, x, middle); return ctx.measureText(shown).width;
  };
  ctx.drawImage(filled, 0, 0, W, H);

  // The canvas: the empty editor canvas, then the grid as the editor draws it.
  const [sx, sy, sw, sh] = template.stage;
  copy(blank, [Math.floor(sx) - 1, Math.floor(sy) - 1, Math.ceil(sw) + 2, Math.ceil(sh) + 2]);
  ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip(); ctx.translate(sx, sy);
  drawCatalogGrid(ctx, grid, await heroImages(grid), sw, false, { portraits: 'none' });
  ctx.restore();

  // The grid's name in «Сетки в файле» and above the canvas.
  const name = config.config_name || 'Сетка';
  // Between the name's start and the field's arrow; nothing else in the header is touched.
  const [nx, ny, , nh] = rows.gridName.box, fieldEnd = rows.gridName.arrow ? rows.gridName.arrow[0] - 6 : rows.gridName.field[0] + rows.gridName.field[2] - 30;
  clear(nx - 1, ny - 3, fieldEnd - nx + 1, nh + 6, color(nx - 5, ny + nh / 2));
  write(name, nx, ny + nh / 2, rows.gridName.font, { size: rows.gridName.font.size, max: fieldEnd - nx - 4 });
  const [cx, cy, , ch] = rows.caption.box;
  const captionWidth = Math.min(520, template.stage[0] + template.stage[2] * 0.6 - cx);
  clear(cx - 1, cy - 3, captionWidth, ch + 6, color(cx - 3, cy + ch + 5));
  write(name, cx, cy + ch / 2, rows.caption.font, { size: rows.caption.font.size, max: captionWidth - 20 });

  // «Категорий N» and the «Оптимизация» button after it.
  const [kx, ky, kw, kh] = rows.categories.box, [ox, oy, ow, oh] = rows.optimize, gap = ox - (kx + kw);
  const counterGround = color(kx - 2, ky - 4);
  const optimize = createCanvas(Math.ceil(ow * dpr), Math.ceil(oh * dpr)); optimize.getContext('2d').drawImage(filled, ox * dpr, oy * dpr, ow * dpr, oh * dpr, 0, 0, ow * dpr, oh * dpr);
  clear(kx - 1, oy, ox + ow - kx + 4, oh, counterGround);
  const count = categories.length.toLocaleString('ru-RU');
  const numberWidth = write(count, kx, ky + kh / 2, rows.categories.font, { size: rows.categories.font.size, weight: rows.categories.font.weight });
  ctx.drawImage(optimize, kx + numberWidth + gap, oy, ow, oh);

  // The layer list: Декор (text rows, then «Символы»), Герои (groups), Фон — as imported grids are laid out.
  const [px, , pw, ph] = template.panel, panelBottom = template.panel[1] + ph - 10;
  const [headDecor, headHeroes, headBack] = rows.heads;
  const sample = (name) => rows.items.find((item) => item.name === name);
  const textRow = sample('ЗАГОЛОВОК'), symbolRow = sample('Символы'), heroRow = sample('КЕРРИ');
  const listTop = headDecor.box[1] - 2;
  const panelGround = color(px + 6, listTop + 40); // the panel's padding, left of the rows
  clear(px + 1, listTop, pw - 2, panelBottom - listTop, panelGround);
  const [bx, by, bw, bh] = rows.objectCount.box, objects = categories.length.toLocaleString('ru-RU');
  clear(bx - 40, by - 1, bw + 41, bh + 2, color(bx - 8, by + bh / 2));
  ctx.font = UI(rows.objectCount.font.size); const pad = bw - ctx.measureText('10').width, badgeWidth = ctx.measureText(objects).width + pad;
  ctx.fillStyle = color(bx + 2, by + bh / 2); ctx.beginPath(); ctx.roundRect(bx + bw - badgeWidth, by, badgeWidth, bh, 6); ctx.fill();
  write(objects, bx + bw - badgeWidth / 2, by + bh / 2, rows.objectCount.font, { size: rows.objectCount.font.size, align: 'center' });

  ctx.save(); ctx.beginPath(); ctx.rect(px + 1, listTop, pw - 2, panelBottom - listTop); ctx.clip();
  const decor = categories.filter((c) => !c.hero_ids.length), heroes = categories.filter((c) => c.hero_ids.length);
  const texts = decor.filter((c) => Array.from(c.category_name).length > 1), symbols = decor.length - texts.length;
  const itemGap = textRow.box[1] - (headDecor.box[1] + headDecor.box[3]), layerGap = headHeroes.box[1] - (symbolRow.box[1] + symbolRow.box[3]);
  let y = headDecor.box[1];
  const head = (sample, value) => {
    copy(filled, sample.box, sample.box[0], y);
    if (value !== null) {
      const [x, cy2, w, h] = sample.count.box, top = y + (cy2 - sample.box[1]);
      clear(x - 26, top - 2, w + 27, h + 4, color(x - 30, cy2 + h / 2));
      write(value.toLocaleString('ru-RU'), x + w, top + h / 2, sample.count.font, { size: sample.count.font.size, align: 'right' });
    }
    y += sample.box[3] + itemGap;
  };
  const item = (sample, label, value) => {
    const [ix, iy, iw, ih] = sample.icon, offset = y - sample.box[1];
    copy(filled, [ix, iy, iw, ih], ix, iy + offset);
    const [lx, ly, lw, lh] = sample.label.box, countBox = (sample.count || symbolRow.count).box;
    write(label, lx, ly + offset + lh / 2, sample.label.font, { size: sample.label.font.size, max: value === null ? lw : countBox[0] - lx - 12 });
    if (value !== null) write(value.toLocaleString('ru-RU'), countBox[0] + countBox[2], countBox[1] + offset + countBox[3] / 2, symbolRow.count.font, { size: symbolRow.count.font.size, align: 'right' });
    y += sample.box[3];
  };
  const empty = () => { copy(blank, template.empty.box, template.empty.box[0], y); y += template.empty.box[3]; };
  head(headDecor, decor.length);
  // The list is HTML: runs of spaces in a name show as one.
  for (const text of texts.slice(0, 80)) { if (y > panelBottom) break; item(textRow, text.category_name.replace(/\s+/g, ' ').trim(), null); }
  if (symbols) item(symbolRow, 'Символы', symbols);
  if (!decor.length) empty();
  y += layerGap - itemGap;
  head(headHeroes, heroes.length);
  for (const group of heroes) { if (y > panelBottom) break; item(heroRow, group.category_name, group.hero_ids.length); }
  if (!heroes.length) empty();
  y += layerGap - itemGap;
  const back = y; head(headBack, null);
  // The «Добавить группу героев» button, when the capture caught it.
  if (rows.addGroup && rows.addGroup[1] + rows.addGroup[3] <= H) copy(filled, rows.addGroup, rows.addGroup[0], back + (rows.addGroup[1] - headBack.box[1]));
  ctx.restore();
  // One picture per width, resampled from the full-density render.
  return Promise.all(widths.map(async (width) => {
    if (width >= canvas.width) return [width, await canvas.encode('webp', 86)];
    const small = createCanvas(width, Math.round(width * H / W)), sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high'; sctx.drawImage(canvas, 0, 0, small.width, small.height);
    return [width, await small.encode('webp', 86)];
  })).then((pairs) => new Map(pairs));
}
