import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { drawCatalogGrid, drawGridGround } from '../scripts/catalog-rendering.mjs';
import { normalizeCatalogGrid } from '../scripts/catalog-document.mjs';
import D from '../scripts/data.mjs';
import { layoutAsciiArt } from '../scripts/ascii-library.mjs';
import { drawCategoryLabel, glyphWidths, measureCategoryText } from '../scripts/dota-rendering.mjs';
import C from '../scripts/core.mjs';

let ready = false, background = null;
// Telegram cards always use the Dota 2 backdrop, the site's default.
function gridBackground() {
  background ||= loadImage(fileURLToPath(new URL('../assets/backgrounds/dota-grid.webp', import.meta.url))).catch(() => null);
  return background;
}
const portraits = new Map(), knownHeroes = new Map(D.heroes.map(hero => [hero.id, hero.portrait]));
export function loadFonts() {
  if (ready) return;
  for (const [file, family] of [['radiance-semibold.otf', 'StudioRadiance'], ['ydygo540.ttf', 'StudioDotaKorean']]) {
    if (!GlobalFonts.registerFromPath(fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url)), family))
      throw new Error('Не удалось загрузить шрифт превью.');
  }
  // Radiance lacks many symbols and the server has no Arial; DejaVu Sans stands in for the
  // stack's Arial the way a system font does in the browser.
  const families = new Set(GlobalFonts.families.map(font => font.family));
  if (!families.has('Arial') && families.has('DejaVu Sans')) GlobalFonts.setAlias('DejaVu Sans', 'Arial');
  ready = true;
}
// A stored grid as the API's download link gives it: made to hold on the hero-pick screen and
// at every resolution, as the workshop page's download is (src/catalog/pick-safe.js).
let measuring = null;
export function pickSafeGrid(grid) {
  loadFonts();
  measuring ||= createCanvas(8, 8).getContext('2d');
  const widths = (line) => glyphWidths(measuring, line);
  return { ...grid, configs: grid.configs.map((config) => ({ ...config, categories: C.pickSafeCategories(config.categories, widths, { singles: false }) })) };
}
export async function renderCatalogPreview(source) {
  const { grid } = normalizeCatalogGrid(source);
  loadFonts();
  const canvas = createCanvas(1193, 593);
  drawCatalogGrid(canvas.getContext('2d'), grid, await heroImages(grid), 1193, await gridBackground());
  return canvas.encode('png');
}
export async function heroImages(grid) {
  const ids = [...new Set(grid.configs[0].categories.flatMap(c => c.hero_ids))];
  return new Map(await Promise.all(ids.map(async id => {
    // No URLs or filesystem paths from a submission are ever opened.
    if (!knownHeroes.has(id)) return [id, null];
    if (!portraits.has(id)) portraits.set(id, loadImage(fileURLToPath(new URL(`../${knownHeroes.get(id)}`, import.meta.url))).catch(() => null));
    return [id, await portraits.get(id)];
  })));
}
// A submitted art on the card: rows laid out as on insertion, scaled to fit the Dota grid frame.
export async function renderArtPreview(text) {
  loadFonts();
  const canvas = createCanvas(1193, 593), ctx = canvas.getContext('2d');
  drawGridGround(ctx, await gridBackground());
  const layout = layoutAsciiArt(text, line => measureCategoryText(ctx, line).advances.reduce((a, b) => a + b, 0));
  const scale = Math.min(1.5, (1193 - 60) / layout.width, (593 - 60) / layout.height);
  ctx.translate((1193 - layout.width * scale) / 2, (593 - layout.height * scale) / 2); ctx.scale(scale, scale);
  for (const row of layout.rows) drawCategoryLabel(ctx, row.text, row.x, row.y, '#d6c8f7');
  return canvas.encode('png');
}

