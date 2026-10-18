import C from './core.mjs';
import { DOTA, drawCategoryLabel, portraitSourceRect } from './dota-rendering.mjs';
import { GAME_SCREEN } from './game-preview.mjs';

// How a grid is painted: the editor's canvas (scripts/app.mjs) and «Экспортировать PNG» share these, so
// the picture is the editor's layout — drawCategoryLabel's per-glyph advances, C.heroLayout cards,
// metaLabels — in the font the canvas uses (StudioRadiance, or the canvas font that replaced it).
//
// Two looks. The game's: grey labels with the soft shadow, portraits on dark cards. The sketch («Режим
// эскиза», asked for on 2026-10-18 by a tattoo artist): black glyphs without a shadow on white; hero
// cards as light outlines or left out (the file's choice, core cleanSketch).
export const GAME_LOOK = Object.freeze({ sketch: false, text: DOTA.labelColor, shadow: true, heroes: 'portraits', card: '#202831', paper: null });
const SKETCH_LOOKS = Object.fromEntries(C.SKETCH_HEROES.map((heroes) => [heroes,
  Object.freeze({ sketch: true, text: '#000000', shadow: false, heroes, card: '#c6c6c6', paper: '#ffffff' })]));
export const sketchLook = (heroes = 'outline') => SKETCH_LOOKS[heroes] || SKETCH_LOOKS.outline;
// The file's look: the sketch when it is on (doc.sketch), else the game's.
export function lookOf(doc) {
  const sketch = C.cleanSketch(doc?.sketch);
  return sketch ? sketchLook(sketch.heroes) : GAME_LOOK;
}
// Outlined cards: a thin line just inside the card, so neighbours never merge.
const OUTLINE = 0.75;

export function drawText(ctx, text, x, y, look = GAME_LOOK) {
  drawCategoryLabel(ctx, text, x, y, look.text, look.shadow);
}
// One hero card: the portrait as the editor shows it (`image` once loaded, `crop` the hero's
// portraitCrop) or, sketched, its outline. Nothing when the sketch leaves heroes out.
export function drawHeroCard(ctx, x, y, w, h, look = GAME_LOOK, image = null, crop = null) {
  if (look.heroes === 'hidden') return;
  if (look.heroes === 'outline') {
    ctx.save();
    ctx.strokeStyle = look.card;
    ctx.lineWidth = OUTLINE;
    ctx.strokeRect(x + OUTLINE / 2, y + OUTLINE / 2, Math.max(0, w - OUTLINE), Math.max(0, h - OUTLINE));
    ctx.restore();
    return;
  }
  ctx.fillStyle = look.card;
  ctx.fillRect(x, y, w, h);
  if (image) {
    ctx.filter = 'saturate(0.7)';
    ctx.drawImage(image, ...portraitSourceRect(image, w, h, crop), x, y, w, h);
    ctx.filter = 'none';
  }
}

// What the picture holds, cropped as the Dota export crops it (core categoryEntries): a glyph whose
// middle is past the canvas is left out, the rest of its text stays. Hidden layers are left out.
function* pictureItems(doc, look) {
  const visible = new Set(doc.layers.filter((layer) => layer.visible).map((layer) => layer.id)), size = C.canvasSize(doc);
  for (const layer of doc.layers) {
    if (!visible.has(layer.id)) continue;
    for (const item of doc.entities) {
      if (item.layer !== layer.id) continue;
      if (item.type === 'heroes') { if (look.heroes !== 'hidden') yield { group: item }; continue; }
      for (const glyph of C.insideGlyphs(item, size) ?? C.textGlyphs(item)) yield { glyph };
    }
  }
}

// The part of the canvas the picture shows: all of it, or (`content`) the drawing's ink with a margin.
// `measure(text)` is the glyph ink (dota-rendering measureCategoryInk). Whole grid units, inside the canvas.
export const CONTENT_MARGIN = 16;
export function pictureArea(doc, { area = 'canvas', look = lookOf(doc), measure = null, margin = CONTENT_MARGIN } = {}) {
  const size = C.canvasSize(doc), whole = { x: 0, y: 0, w: size.w, h: size.h };
  if (area !== 'content' || !measure) return whole;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const add = (x, y, w, h) => { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + w); bottom = Math.max(bottom, y + h); };
  for (const { group, glyph } of pictureItems(doc, look)) {
    if (group) {
      add(group.x, group.y, group.w, C.visualHeight(group));
      if (group.meta) for (const label of C.metaLabels(group)) { const ink = measure(label.text); add(label.x + ink.x, label.y + ink.y, ink.w, ink.h); }
    } else {
      const ink = measure(glyph.text);
      add(glyph.x + ink.x, glyph.y + ink.y, ink.w, ink.h);
    }
  }
  if (!Number.isFinite(left)) return whole;
  const x = Math.max(0, Math.floor(left - margin)), y = Math.max(0, Math.floor(top - margin));
  const r = Math.min(size.w, Math.ceil(right + margin)), b = Math.min(size.h, Math.ceil(bottom + margin));
  return r - x >= 1 && b - y >= 1 ? { x, y, w: r - x, h: b - y } : whole;
}

// Browsers refuse bigger canvases (Safari: 16.7 megapixels; every one: 16384 px a side).
export const PNG_LIMITS = Object.freeze({ side: 16384, pixels: 16777216 });
export const PNG_SCALES = Object.freeze([1, 2, 4]);
export const pictureSize = (area, scale) => ({ width: Math.max(1, Math.round(area.w * scale)), height: Math.max(1, Math.round(area.h * scale)) });
export function scaleFits(area, scale) {
  const { width, height } = pictureSize(area, scale);
  return width <= PNG_LIMITS.side && height <= PNG_LIMITS.side && width * height <= PNG_LIMITS.pixels;
}
// «Name.png», the name cleaned as for the project file (app.mjs downloadProject); `suffix` — « (эскиз)».
export function pictureFileName(name, suffix = '') {
  const base = String(name ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80) || 'grid';
  return `${base}${suffix}.png`;
}

// Paints the picture onto `ctx`, whose canvas is pictureSize(area, scale). `background`: 'dota' (the
// hero page's backdrop: `backdrop.grid` is fitted to the 1193 × 593 grid, `backdrop.screen` the whole
// 1080p screen for canvases larger than it), 'transparent', or — always for the sketch — white.
// `portrait(id, height)` gives { image, crop } of a loaded portrait for a card `height` pixels tall.
export function renderPicture(ctx, doc, { area = pictureArea(doc), scale = 1, look = lookOf(doc), background = 'dota', backdrop = {}, portrait = null } = {}) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
  ctx.clearRect(area.x, area.y, area.w, area.h);
  if (look.paper) {
    ctx.fillStyle = look.paper;
    ctx.fillRect(area.x, area.y, area.w, area.h);
  } else if (background === 'dota') {
    ctx.fillStyle = '#0c0d11';
    ctx.fillRect(area.x, area.y, area.w, area.h);
    // The screen where Dota draws it: the grid at GAME_SCREEN.gridX/Y, DOTA.screenScale px a unit.
    if (backdrop.screen) ctx.drawImage(backdrop.screen, -GAME_SCREEN.gridX / DOTA.screenScale, -GAME_SCREEN.gridY / DOTA.screenScale, GAME_SCREEN.width / DOTA.screenScale, GAME_SCREEN.height / DOTA.screenScale);
    if (backdrop.grid) ctx.drawImage(backdrop.grid, 0, 0, C.WIDTH, C.HEIGHT);
  }
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  for (const { group, glyph } of pictureItems(doc, look)) {
    if (glyph) { drawText(ctx, glyph.text, glyph.x, glyph.y, look); continue; }
    drawText(ctx, group.name, group.x, group.y, look);
    const layout = C.heroLayout(group);
    if (layout) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(group.x, group.y + DOTA.header, group.w, group.h);
      ctx.clip();
      group.heroIds.forEach((id, i) => {
        const x = group.x + layout.left + (i % layout.cols) * layout.stepX, y = group.y + layout.top + Math.floor(i / layout.cols) * layout.stepY;
        const shown = look.heroes === 'portraits' ? portrait?.(id, layout.cardH * scale) : null;
        drawHeroCard(ctx, x, y, layout.cardW, layout.cardH, look, shown?.image || null, shown?.crop || null);
      });
      ctx.restore();
    }
    if (group.meta) for (const label of C.metaLabels(group)) drawText(ctx, label.text, label.x, label.y, look);
  }
  ctx.restore();
}
// The heroes whose portraits the picture shows (to load them before rendering).
export function pictureHeroes(doc, look = lookOf(doc)) {
  if (look.heroes !== 'portraits') return [];
  const ids = new Set();
  for (const { group } of pictureItems(doc, look)) if (group) for (const id of group.heroIds) ids.add(id);
  return [...ids];
}
