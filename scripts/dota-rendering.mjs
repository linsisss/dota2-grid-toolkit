// Panorama hero_grid_new: HeroCategoryName and HeroCard / HeroImage.
// Coordinates stay in the JSON's unscaled 1193 × 593 space.
export const DOTA = Object.freeze({
  header: 20,
  listPadding: 4,
  cellWidth: 51,
  cellHeight: 83,
  imageMargin: 4,
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: 2,
  labelColor: '#808fa6',
  fontFamily:
    'StudioRadiance, StudioDotaKorean, "Malgun Gothic", "Noto Sans CJK KR", Arial, sans-serif'
});

export function drawCategoryLabel(ctx, text, x, y, color = DOTA.labelColor) {
  ctx.save();
  ctx.font = `${DOTA.fontWeight} ${DOTA.fontSize}px ${DOTA.fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.letterSpacing = `${DOTA.letterSpacing}px`;
  ctx.shadowColor = '#00000044';
  const transform = ctx.getTransform();
  const rasterScale = Math.hypot(transform.a, transform.b);
  ctx.shadowOffsetX = 2 * rasterScale;
  ctx.shadowOffsetY = 2 * rasterScale;
  ctx.shadowBlur = 4 * rasterScale;
  // Radiance SemiBold's ascender is 857 / 1000 em. A fixed baseline keeps
  // punctuation, ASCII and fallback glyphs aligned to the same category origin.
  const baseline = DOTA.fontSize * 0.857;
  String(text)
    .toUpperCase()
    .split('\n')
    .forEach((line, i) => ctx.fillText(line, x + DOTA.listPadding, y + baseline + i * DOTA.header));
  ctx.restore();
}

// Keep the measured advances with the text so Dota export uses the same layout
// without depending on a browser or an installed font at export/import time.
export function measureCategoryText(ctx, text) {
  const rendered = String(text).toUpperCase();
  ctx.save();
  ctx.font = `${DOTA.fontWeight} ${DOTA.fontSize}px ${DOTA.fontFamily}`;
  ctx.letterSpacing = `${DOTA.letterSpacing}px`;
  let line = '',
    width = 0;
  const advances = Array.from(rendered, (char) => {
    if (char === '\n') {
      line = '';
      width = 0;
      return 0;
    }
    line += char;
    const next = ctx.measureText(line).width,
      advance = next - width;
    width = next;
    return Math.max(0, advance);
  });
  ctx.restore();
  return { text: rendered, advances };
}
