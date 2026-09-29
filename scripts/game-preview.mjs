import C from './core.mjs';
import { DOTA } from './dota-rendering.mjs';

// Where Dota draws the hero grid, measured on a 1920 × 1080 screenshot: the grid starts at
// (269, 174) and takes DOTA.screenScale pixels per grid unit; the backdrop covers the screen.
// Other sizes scale that 16:9 picture to fit. Resizing a document must not shrink heroes:
// extra canvas is reached by scrolling.
export const GAME_SCREEN = Object.freeze({ width: 1920, height: 1080, gridX: 269, gridY: 174 });
export function gamePreviewLayout(width, height) {
  const s = Math.min(width / GAME_SCREEN.width, height / GAME_SCREEN.height), scale = DOTA.screenScale * s;
  const left = (width - GAME_SCREEN.width * s) / 2, top = (height - GAME_SCREEN.height * s) / 2;
  return { scale, x: left + GAME_SCREEN.gridX * s, y: top + GAME_SCREEN.gridY * s, w: C.WIDTH * scale, h: C.HEIGHT * scale };
}
