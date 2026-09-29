import C from './core.mjs';
import D from './data.mjs';
import { drawCategoryLabel, DOTA, portraitSourceRect } from './dota-rendering.mjs';
const portraitCrops = new Map(D.heroes.map(hero => [hero.id, hero.portraitCrop]));

// The 1193×593 grid area: the Dota 2 backdrop image (grid-background.mjs) or, without one, the
// old gradient.
export function drawGridGround(ctx, background = null) {
  if (background) { ctx.drawImage(background, 0, 0, 1193, 593); return; }
  const ground = ctx.createLinearGradient(0, 0, 0, 593);
  ground.addColorStop(0, '#261e12'); ground.addColorStop(1, '#140f0a');
  ctx.fillStyle = ground; ctx.fillRect(0, 0, 1193, 593);
}

// The browser and Telegram render the same validated JSON with the same layout.
export function drawCatalogGrid(ctx, grid, images, width = 1193, background = null) {
  ctx.save(); ctx.scale(width / 1193, width / 1193);
  drawGridGround(ctx, background);
  for (const c of grid.configs[0].categories) {
    drawCategoryLabel(ctx, c.category_name, c.x_position, c.y_position);
    if (!c.hero_ids.length) continue;
    const layout = C.heroLayout({ w: c.width, h: c.height, heroIds: c.hero_ids });
    ctx.save(); ctx.beginPath(); ctx.rect(c.x_position, c.y_position + DOTA.header, c.width, c.height); ctx.clip();
    c.hero_ids.forEach((id, index) => {
      const x = c.x_position + layout.left + index % layout.cols * layout.stepX,
        y = c.y_position + layout.top + Math.floor(index / layout.cols) * layout.stepY, image = images.get(id);
      ctx.fillStyle = '#202831'; ctx.fillRect(x, y, layout.cardW, layout.cardH);
      if (!image) return;
      ctx.filter = 'saturate(0.7)'; ctx.drawImage(image, ...portraitSourceRect(image, layout.cardW, layout.cardH, portraitCrops.get(id)), x, y, layout.cardW, layout.cardH); ctx.filter = 'none';
    }); ctx.restore();
  }
  ctx.restore();
}
