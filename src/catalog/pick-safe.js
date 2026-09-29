import C from '../../scripts/core.mjs';
import { glyphWidths } from '../../scripts/dota-rendering.mjs';
import { gameFontsReady } from '../typography.js';

// A workshop grid as it is downloaded: made to hold on the hero-pick screen and at every
// resolution, as the editor's download is (core.mjs pickSafeCategories). The workshop stores
// grids as published, rows for the 1080p «Герои» page included; one-glyph categories (grids
// from before 1.5) are exact everywhere and stay as they are.
export async function pickSafeGrid(grid) {
  await gameFontsReady;
  const ctx = document.createElement('canvas').getContext('2d');
  const widths = (line) => glyphWidths(ctx, line);
  return { ...grid, configs: grid.configs.map((config) => ({ ...config, categories: C.pickSafeCategories(config.categories, widths, { singles: false }) })) };
}
