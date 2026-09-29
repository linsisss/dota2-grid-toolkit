// Panorama hero_grid_new: HeroCategoryName and HeroCard / HeroImage.
// Coordinates stay in the JSON's unscaled 1193 × 593 space.
export const DOTA = Object.freeze({
  header: 20,
  listPadding: 4,
  cellWidth: 51,
  cellHeight: 83,
  imageMargin: 4,
  // Measured in the game (1920 × 1080, September 2026, eleven calibration rows): labels use
  // Radiance at about 15.15 grid units, not 16; the grid is drawn at 1.1497 screen px per
  // unit and every glyph advance lands on a whole screen pixel. The model below reproduces
  // those rows within a pixel, where the former 16px model was off by up to 34.
  fontSize: 15.15,
  fontWeight: 600,
  letterSpacing: 2,
  screenScale: 1.1497,
  labelColor: '#808fa6',
  fontFamily:
    'StudioRadiance, StudioDotaKorean, "Malgun Gothic", "Noto Sans CJK KR", Arial, sans-serif'
});
// Checked in the game (symbol test grid, 1920 × 1080, 29.09.2026): Dota shows nothing for
// Braille, box drawing, block elements and these few symbols and emoji. Everything else
// tested — including every glyph of the symbol library — is visible.
const INVISIBLE = /[\u2500-\u259f\u2800-\u28ff\u30fb\u2b1b\u2b1c\u2b50\u2b55\u3036\u2728\u26bd]|\u{1f525}|\u{1f480}|\u{1f451}|\u{1f3ae}|\u{1f338}/u;
const INVISIBLE_GROUPS = [[/[\u2800-\u28ff]/u, 'брайль'], [/[\u2500-\u257f]/u, 'символы рамок'], [/[\u2580-\u259f]/u, 'блоки ▀█░']];
export const invisibleGlyphs = (text) => [...new Set(Array.from(String(text ?? '')).filter((char) => INVISIBLE.test(char)))];
// '' when everything is visible; otherwise one sentence naming what the game will not show.
export function invisibleWarning(text) {
  const found = invisibleGlyphs(text);
  if (!found.length) return '';
  const names = INVISIBLE_GROUPS.filter(([range]) => found.some((char) => range.test(char))).map(([, name]) => name);
  const single = found.filter((char) => !INVISIBLE_GROUPS.some(([range]) => range.test(char)));
  return `Dota не показывает: ${[...names, ...single].join(', ')} — в игре этого не будет видно.`;
}
// Stored with measured advances, so metrics taken with an older model are measured again.
export const TEXT_MODEL = 2;
const FONT = `${DOTA.fontWeight} ${DOTA.fontSize}px ${DOTA.fontFamily}`;
const BASELINE = DOTA.fontSize * 0.857;

// The game's advance of every glyph in a line: its kerned width snapped to whole screen pixels
// at the size the grid is drawn, plus the letter spacing, which scales with the grid (measured
// in the game, 29.09.2026: 1920 × 1080 and 1680 × 1050, the «Герои» page and the hero-pick screen,
// within 0.01 px). The editor shows the «Герои» page at 1080p; at any other size — the hero-pick
// screen draws the grid at 0.87 of the page, other resolutions at their own scale — the same
// line snaps differently, so glyphs of one category drift apart (export-rows.mjs packPickRows).
// En, em, ⅓ em and ⅙ em spaces are not in Radiance and Dota draws them with no width: they
// advance by the letter spacing alone, exactly 2 units at every size.
export const ZERO_WIDTH_SPACE = '\u2006';
const ZERO_WIDTH = /[\u2002-\u2004\u2006]/u;
export const advanceAt = (width, scale = DOTA.screenScale) => Math.max(0, Math.round(width * scale) / scale + DOTA.letterSpacing);
// Cached per context once fonts have loaded: { widths (raw, grid units), advances (1080p page) }.
const lineCaches = new WeakMap();
function lineMetrics(ctx, line) {
  const settled = typeof document === 'undefined' || document.fonts?.status !== 'loading';
  let cache = lineCaches.get(ctx);
  if (!cache) lineCaches.set(ctx, (cache = new Map()));
  if (settled && cache.has(line)) return cache.get(line);
  ctx.save();
  ctx.font = FONT;
  ctx.letterSpacing = '0px';
  let prefix = '', width = 0;
  const widths = Array.from(line, (char) => {
    prefix += char;
    const next = ctx.measureText(prefix).width, advance = next - width;
    width = next;
    return ZERO_WIDTH.test(char) ? 0 : advance;
  });
  ctx.restore();
  const metrics = { widths, advances: widths.map((value) => advanceAt(value)) };
  if (settled) {
    if (cache.size > 4000) cache.clear();
    cache.set(line, metrics);
  }
  return metrics;
}
const lineAdvances = (ctx, line) => lineMetrics(ctx, line).advances;
// Raw kerned glyph widths of an upper-cased line, for placing it at another size (advanceAt).
export const glyphWidths = (ctx, line) => lineMetrics(ctx, line).widths;

// Crop the display viewport, keeping the original image intact. A supplied
// portrait viewport can exclude screenshot chrome before fitting a hero card.
export function portraitSourceRect(image, width, height, crop) {
  const [x, y, sourceWidth, sourceHeight] = crop || [0, 0, image.naturalWidth || image.width, image.naturalHeight || image.height];
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const w = width / scale, h = height / scale;
  return [x + (sourceWidth - w) / 2, y + (sourceHeight - h) / 2, w, h];
}

export function drawCategoryLabel(ctx, text, x, y, color = DOTA.labelColor) {
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.letterSpacing = '0px';
  ctx.shadowColor = '#00000044';
  const transform = ctx.getTransform();
  const rasterScale = Math.hypot(transform.a, transform.b);
  ctx.shadowOffsetX = 2 * rasterScale;
  ctx.shadowOffsetY = 2 * rasterScale;
  ctx.shadowBlur = 4 * rasterScale;
  // Radiance SemiBold's ascender is 857 / 1000 em. A fixed baseline keeps
  // punctuation, ASCII and fallback glyphs aligned to the same category origin.
  // Glyphs are placed one by one at the game's advances.
  String(text)
    .toUpperCase()
    .split('\n')
    .forEach((line, i) => {
      const chars = Array.from(line);
      if (chars.length === 1) return void ctx.fillText(line, x + DOTA.listPadding, y + BASELINE + i * DOTA.header);
      const advances = lineAdvances(ctx, line);
      let pen = x + DOTA.listPadding;
      chars.forEach((char, k) => {
        if (char !== ' ') ctx.fillText(char, pen, y + BASELINE + i * DOTA.header);
        pen += advances[k];
      });
    });
  ctx.restore();
}

// Keep the measured advances with the text so Dota export uses the same layout
// without depending on a browser or an installed font at export/import time.
export function measureCategoryText(ctx, text) {
  const rendered = String(text).toUpperCase();
  const advances = rendered.split('\n').flatMap((line, i) => [...(i ? [0] : []), ...lineAdvances(ctx, line)]);
  return { text: rendered, advances, model: TEXT_MODEL };
}

export function measureCategoryWidth(ctx, text) {
  const lines = String(text).toUpperCase().split('\n');
  return { width: Math.max(...lines.map((line) => lineAdvances(ctx, line).reduce((a, b) => a + b, 0))) };
}

// Visible ink bounds, relative to a category origin. Used for picking and the
// brush hotspot only; game JSON and its fixed 30px boxes remain unchanged.
export function measureCategoryInk(ctx, text) {
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '0px';
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  String(text).toUpperCase().split('\n').forEach((line, row) => {
    const chars = Array.from(line);
    if (!line.trim()) return;
    const advances = lineAdvances(ctx, line), baseline = BASELINE + row * DOTA.header;
    let pen = DOTA.listPadding;
    chars.forEach((char, k) => {
      if (!/\s/u.test(char)) {
        const m = ctx.measureText(char);
        left = Math.min(left, pen - m.actualBoundingBoxLeft);
        right = Math.max(right, pen + m.actualBoundingBoxRight);
        top = Math.min(top, baseline - m.actualBoundingBoxAscent);
        bottom = Math.max(bottom, baseline + m.actualBoundingBoxDescent);
      }
      pen += advances[k];
    });
  });
  ctx.restore();
  return Number.isFinite(left) ? { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) }
    : { x: DOTA.listPadding, y: 0, w: 8, h: DOTA.fontSize };
}
