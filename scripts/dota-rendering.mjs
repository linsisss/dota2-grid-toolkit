import { t } from './i18n.mjs';
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
// Names are translated when a warning is made (this module also loads on the server).
const INVISIBLE_GROUPS = [[/[\u2800-\u28ff]/u, 'брайль'], [/[\u2500-\u257f]/u, 'символы рамок'], [/[\u2580-\u259f]/u, 'блоки ▀█░']];
export const invisibleGlyphs = (text) => [...new Set(Array.from(String(text ?? '')).filter((char) => INVISIBLE.test(char)))];
// '' when everything is visible; otherwise one sentence naming what the game will not show.
export function invisibleWarning(text) {
  const found = invisibleGlyphs(text);
  if (!found.length) return '';
  const names = INVISIBLE_GROUPS.filter(([range]) => found.some((char) => range.test(char))).map(([, name]) => t(name));
  const single = found.filter((char) => !INVISIBLE_GROUPS.some(([range]) => range.test(char)));
  return t('Dota не показывает: {glyphs} — в игре этого не будет видно.', { glyphs: [...names, ...single].join(', ') });
}
// The characters of Radiance, the font of category names (its cmap, the same in every weight; read
// with fc-query from the game's radiance-*.otf, 01.10.2026). Dota draws any other character with a
// fallback font of the user's system, as it did U+2006: its shape and width differ from the site's
// preview and from one computer to another (report 01.10.2026: on a 1440p screen ⁜ came out as a
// little grid and ⁕ as a blot). Two thirds of the workshop's grids have a few such characters, the
// backtick ` most of all; a third use them for 5 % of their glyphs or more.
const RADIANCE = '20-5f 61-7e a1-a7 a9-ac ae b0-b3 b5-b7 b9-107 10a-113 116-11b 11e-123 126-12b 12e-131 136-137 139-148 14a-14d 150-15b 15e-16b 16e-17e 192 1a0-1a1 1af-1b0 218-21b 237 300-304 306-30c 312 31b 323 326-328 384-38a 38c 38e-3a1 3a3-3ce 401-40c 40e-44f 451-45c 45e-45f 4bb 4c0 4cf 4e2-4e3 4ef 1e80-1e85 1ea0-1ef9 2013-2015 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 20ac 2116-2117 2122 2126 212e 2153-2154 2202 2206 220f 2211-2212 221a 221e 222b 2248 2260 2264-2265 25ca f6be fb01-fb02';
const RADIANCE_CODES = new Set(RADIANCE.split(' ').flatMap((range) => {
  const [from, to = from] = range.split('-').map((hex) => parseInt(hex, 16));
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}));
// The game writes category names in capitals, so a letter is drawn by its capital.
export const inDotaFont = (char) => Array.from(char.toUpperCase()).every((c) => RADIANCE_CODES.has(c.codePointAt(0)));
// The characters of the names that Radiance lacks: whitespace and what the game shows nothing for
// (invisibleWarning) are left out. { total, count, chars: [[char, n], …] most frequent first }.
export function foreignGlyphs(texts) {
  const seen = new Map(); let total = 0, count = 0;
  for (const text of texts) for (const char of Array.from(String(text ?? ''))) {
    if (/\s/u.test(char) || INVISIBLE.test(char)) continue;
    total++;
    if (inDotaFont(char)) continue;
    count++; seen.set(char, (seen.get(char) || 0) + 1);
  }
  return { total, count, chars: [...seen].sort((a, b) => b[1] - a[1]) };
}
// Worth a word when they are a noticeable part of the picture: at least FOREIGN_LIMITS.count glyphs
// and FOREIGN_LIMITS.share of all.
export const FOREIGN_LIMITS = Object.freeze({ count: 20, share: 0.05 });
export const foreignNoticeable = ({ total, count }) => count >= FOREIGN_LIMITS.count && count >= total * FOREIGN_LIMITS.share;
// The same for a hero_grid_config grid (the workshop): category names, hero lists left out.
export const gridForeignGlyphs = (grid) => foreignGlyphs((grid?.configs || []).flatMap((config) => config.categories || []).filter((category) => !category.hero_ids?.length).map((category) => category.category_name));
export const foreignSample = ({ chars }, size = 6) => chars.slice(0, size).map(([char]) => char).join(' ') + (chars.length > size ? ' …' : '');

// Stored with measured advances, so metrics taken with an older model are measured again.
// 3 (1.7.1): widths measured at MEASURE_SCALE, see below.
export const TEXT_MODEL = 3;
const FONT = `${DOTA.fontWeight} ${DOTA.fontSize}px ${DOTA.fontFamily}`;
// Glyph widths are measured at MEASURE_SCALE × the label size and scaled back. At 15 px some
// browsers return advances rounded to whole pixels (font hinting; Chrome on Windows with some
// font-smoothing settings): Radiance's space came out 3 px instead of 3.47, so it snapped to 3
// screen pixels instead of 4, and a user's dot art packed with it looked right only on that
// computer — spread apart for everyone else and in the game (01.10.2026). At ×64 that rounding is
// under 0.01 px, and the widths are the font's own on every machine.
const MEASURE_SCALE = 64;
const MEASURE_FONT = `${DOTA.fontWeight} ${DOTA.fontSize * MEASURE_SCALE}px ${DOTA.fontFamily}`;
const BASELINE = DOTA.fontSize * 0.857;

// The game's advance of every glyph in a line: its kerned width snapped to whole screen pixels
// at the size the grid is drawn, plus the letter spacing, which scales with the grid (measured
// in the game, 29.09.2026: 1920 × 1080 and 1680 × 1050, the «Герои» page and the hero-pick screen,
// within 0.01 px). The editor shows the «Герои» page at 1080p; at any other size — the hero-pick
// screen draws the grid at 0.87 of the page, other resolutions at their own scale — the same
// line snaps differently, so glyphs of one category drift apart (export-rows.mjs packPickRows).
// En, em, ⅓ em and ⅙ em spaces are not in Radiance. On the testers' Dota they had no width and
// advanced by the letter spacing alone, exactly 2 units at every size — but Dota draws a missing
// character with a fallback font, and on other systems that font has them with a width, so rows
// made of them spread apart there (reports 01.10.2026). Rows now use plain spaces (export-rows.mjs
// ROW_SPACE); the model below still reads grids that hold these characters as the testers saw them.
export const ZERO_WIDTH_SPACE = '\u2006';
const ZERO_WIDTH = /[\u2002-\u2004\u2006]/u;
export const advanceAt = (width, scale = DOTA.screenScale) => Math.max(0, Math.round(width * scale) / scale + DOTA.letterSpacing);
// Hangul needs Dota's Korean fallback (1.2 MB), so it is requested the first time a line with
// Hangul is measured, not by every page; when it has loaded, `gridstudio:fonts` tells canvases
// to measure and draw again (until then the line is measured without caching).
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/u;
let korean = null;
function requestKorean() {
  if (korean || typeof document === 'undefined' || !document.fonts?.load) return;
  korean = document.fonts.load('600 16px StudioDotaKorean', '멈추지')
    .then(() => typeof dispatchEvent === 'function' && dispatchEvent(new Event('gridstudio:fonts')))
    .catch(() => {});
}
const settled = () => typeof document === 'undefined' || document.fonts?.status !== 'loading';
// A glyph's kerned width after the one before it (at the label size, measured at MEASURE_FONT):
// measured once per pair for the whole page.
// Measuring every prefix of a line cost O(length²) — 2.3 s of the workshop's first paint with
// 178-glyph rows — and gives the same widths (checked on the workshop grids: ≤ 0.00005 px).
// The font is always MEASURE_FONT, so the caches are shared by every canvas.
const pairs = new Map(), lines = new Map();
function pairWidth(ctx, before, char) {
  const key = before + '\u0000' + char;
  let width = pairs.get(key);
  if (width === undefined) {
    width = (before ? ctx.measureText(before + char).width - ctx.measureText(before).width : ctx.measureText(char).width) / MEASURE_SCALE;
    if (settled()) {
      if (pairs.size > 50000) pairs.clear();
      pairs.set(key, width);
    }
  }
  return width;
}
// { widths (raw, grid units), advances (1080p page) } of one line.
function lineMetrics(ctx, line) {
  if (HANGUL.test(line)) requestKorean();
  const cached = lines.get(line);
  if (cached) return cached;
  ctx.save();
  ctx.font = MEASURE_FONT;
  ctx.letterSpacing = '0px';
  let before = '';
  const widths = Array.from(line, (char) => {
    const width = ZERO_WIDTH.test(char) ? 0 : pairWidth(ctx, before, char);
    before = char;
    return width;
  });
  ctx.restore();
  const metrics = { widths, advances: widths.map((value) => advanceAt(value)) };
  if (settled()) {
    if (lines.size > 4000) lines.clear();
    lines.set(line, metrics);
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
