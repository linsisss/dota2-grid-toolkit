import C from './core.mjs';

// The grid is part of Dota's 1280 × 720 logical picking screen. Resizing a
// document must not shrink heroes: extra canvas is reached by scrolling.
export function gamePreviewLayout(width, height) {
  const scale = Math.min(width / 1280, height / 720);
  return {
    scale,
    x: (width - C.WIDTH * scale) / 2,
    y: (height - 720 * scale) / 2 + 44 * scale,
    w: C.WIDTH * scale,
    h: C.HEIGHT * scale
  };
}
