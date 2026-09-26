import C from './core.mjs';

export const DRAWING_TOOLS = [
  ['pencil', '✎', 'Перо'],
  ['eyedropper', '⌾', 'Взять символ'],
  ['gradient', '▨', 'Кисть-градиент'],
  ['smart', '⌁', 'Умная кисть'],
  ['line', '╱', 'Линия'],
  ['hline', '↔', 'Горизонталь'],
  ['vline', '↕', 'Вертикаль'],
  ['rect', '□', 'Прямоугольник'],
  ['ellipse', '○', 'Эллипс'],
  ['triangle', '△', 'Треугольник'],
  ['diamond', '◇', 'Ромб'],
  ['star', '☆', 'Звезда'],
  ['spiral', '◎', 'Спираль'],
  ['wave', '∿', 'Волна'],
  ['frame', '▣', 'Рамка'],
  ['fill', '▦', 'Заливка'],
  ['lasso', '⌕', 'Лассо'],
  ['eraser', '⌫', 'Ластик']
];
export const GRADIENT_CHARS = '.·:;+*#%@';
export const BRUSH_DEFAULTS = {
  chars: '★',
  order: 'sequence',
  step: 16,
  dynamics: 'constant',
  endStep: 40,
  length: 350,
  gradientLength: 350,
  mirrorH: false,
  mirrorV: false
};
export function constrainAxis(start, point) {
  return Math.abs(point.x - start.x) >= Math.abs(point.y - start.y)
    ? { x: point.x, y: start.y }
    : { x: start.x, y: point.y };
}
export function smartCharacter(dx, dy) {
  const angle = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 180) + 180) % 180;
  return angle < 22.5 || angle >= 157.5 ? '-' : angle < 67.5 ? '\\' : angle < 112.5 ? '|' : '/';
}
export function brushCharacter(
  settings,
  index,
  seed = 1,
  dx = 1,
  dy = 0,
  smart = false,
  distance = 0
) {
  if (smart) return smartCharacter(dx, dy);
  const chars = Array.from(settings.chars || '·').filter((char) => !/\s/u.test(char));
  const hash = Math.imul(index + 1, 2654435761) ^ Math.imul(seed, 1597334677);
  const n =
    settings.order === 'gradient'
      ? Math.round(
          C.clamp(distance / Math.max(1, Number(settings.gradientLength) || 350), 0, 1) *
            (chars.length - 1)
        )
      : settings.order === 'random'
        ? (hash >>> 0) % Math.max(1, chars.length)
        : settings.order === 'sequence'
          ? index % Math.max(1, chars.length)
          : 0;
  return chars[n] || '·';
}
export function brushStep(settings, distance) {
  const first = Math.max(3, Number(settings.step) || 16);
  if (settings.dynamics === 'constant') return first;
  const end =
    settings.dynamics === 'denser'
      ? Math.min(first, Math.max(3, Number(settings.endStep) || 5))
      : Math.max(first, Number(settings.endStep) || 40);
  const progress = C.clamp(distance / Math.max(1, Number(settings.length) || 350), 0, 1);
  return first + (end - first) * progress;
}
// Sample by travelled distance, not pointer event rate. Replaying a stroke keeps
// random symbols stable and permits live Shift constraints without stray marks.
export function strokePoints(path, settings = BRUSH_DEFAULTS, seed = 1, smart = false) {
  if (!path.length) return [];
  const result = [];
  let travelled = 0,
    next = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    if (!length) continue;
    while (next <= travelled + length && result.length < C.MAX_ENTITIES) {
      const t = Math.max(0, (next - travelled) / length);
      result.push({
        x: a.x + dx * t,
        y: a.y + dy * t,
        ch: brushCharacter(settings, result.length, seed, dx, dy, smart, next)
      });
      next += brushStep(settings, next);
    }
    travelled += length;
  }
  if (!result.length)
    result.push({ ...path[0], ch: brushCharacter(settings, 0, seed, 1, 0, smart) });
  return result;
}
export function drawingPoints(
  tool,
  path,
  settings,
  seed = 1,
  shift = false,
  frame = null,
  size = C.canvasSize()
) {
  if (!path.length || ['eyedropper', 'lasso', 'eraser'].includes(tool)) return [];
  const first = path[0],
    last = path.at(-1);
  const end = shift ? constrainAxis(first, last) : last;
  let points;
  if (tool === 'pencil' || tool === 'smart' || tool === 'gradient')
    points = strokePoints(shift ? [first, end] : path, settings, seed, tool === 'smart');
  else if (['line', 'hline', 'vline'].includes(tool))
    points = strokePoints(
      [
        first,
        tool === 'hline'
          ? { x: last.x, y: first.y }
          : tool === 'vline'
            ? { x: first.x, y: last.y }
            : end
      ],
      settings,
      seed
    );
  else if (['fill', 'rectfill'].includes(tool)) {
    points = [];
    const minX = Math.min(first.x, last.x),
      maxX = Math.max(first.x, last.x),
      minY = Math.min(first.y, last.y),
      maxY = Math.max(first.y, last.y);
    for (
      let y = minY;
      y <= maxY && points.length < C.MAX_ENTITIES;
      y += Math.max(3, Number(settings.step) || 16)
    )
      for (
        let x = minX;
        x <= maxX && points.length < C.MAX_ENTITIES;
        x += brushStep(settings, x - minX)
      )
        points.push({
          x,
          y,
          ch: brushCharacter(settings, points.length, seed, 1, 0, false, x - minX)
        });
  } else {
    points = C.shapePoints(
      tool === 'frame' ? 'rect' : tool,
      first,
      last,
      Math.max(3, Number(settings.step) || 16)
    );
    // Shape points have consistent contour order; dynamics controls their spacing too.
    if (!['fill'].includes(tool) && settings.dynamics !== 'constant')
      points = strokePoints(points, settings, seed);
    let distance = 0;
    points = points.map((point, index) => {
      if (index)
        distance += Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y);
      return {
        ...point,
        ch: brushCharacter(settings, index, seed, 1, 0, false, distance)
      };
    });
    if (tool === 'frame' && frame) {
      const minX = Math.min(first.x, last.x),
        maxX = Math.max(first.x, last.x),
        minY = Math.min(first.y, last.y),
        maxY = Math.max(first.y, last.y);
      points = points.map((p) => ({
        ...p,
        ch:
          Math.abs(p.y - minY) < 1
            ? Math.abs(p.x - minX) < 1
              ? frame.tl
              : Math.abs(p.x - maxX) < 1
                ? frame.tr
                : frame.h
            : Math.abs(p.y - maxY) < 1
              ? Math.abs(p.x - minX) < 1
                ? frame.bl
                : Math.abs(p.x - maxX) < 1
                  ? frame.br
                  : frame.h
              : frame.v
      }));
    }
  }
  const seen = new Set();
  return points
    .flatMap((point) => {
      const positions = [point];
      if (settings.mirrorH) positions.push({ ...point, x: size.w - 30 - point.x });
      if (settings.mirrorV) positions.push({ ...point, y: size.h - 30 - point.y });
      if (settings.mirrorH && settings.mirrorV)
        positions.push({ ...point, x: size.w - 30 - point.x, y: size.h - 30 - point.y });
      return positions.filter((p) => {
        if (p.x < 0 || p.y < 0) return false;
        const key = `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .slice(0, C.MAX_ENTITIES);
}
export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function lassoContains(item, polygon) {
  return (
    polygon.length >= 3 &&
    C.textGlyphs(item, true).some((glyph) =>
      pointInPolygon({ x: glyph.x + glyph.w / 2, y: glyph.y + C.visualHeight(glyph) / 2 }, polygon)
    )
  );
}
