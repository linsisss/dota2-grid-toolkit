// Eraser diameter in canvas pixels, shared by the editor canvas and the drawing window
// and remembered in this browser. The default matches the former fixed 22 px radius.
export const ERASER = Object.freeze({ min: 6, max: 400, initial: 44 });
const KEY = 'gridstudio.eraser-size';

export const clampEraser = (value) =>
  Math.min(ERASER.max, Math.max(ERASER.min, Number.isFinite(Number(value)) ? Number(value) : ERASER.initial));

export function readEraserSize(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(KEY);
    return stored === null || stored === undefined ? ERASER.initial : Math.round(clampEraser(stored));
  } catch {
    return ERASER.initial;
  }
}

export function storeEraserSize(value, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, String(Math.round(clampEraser(value))));
  } catch {
    /* Blocked storage only forgets the size after reload. */
  }
}

// Proportional change: one wheel notch (~100 px) is about 16 %, so a 10 px and a 300 px
// eraser both feel responsive, and a trackpad's many small deltas add up smoothly.
export function wheelEraserSize(size, deltaY, deltaMode = 0) {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return clampEraser(size * Math.exp(-pixels * 0.0015));
}

// [ and ] like Photoshop: at least 2 px per press so small sizes still move.
export const stepEraserSize = (size, direction) =>
  clampEraser(direction > 0 ? Math.max(size * 1.15, size + 2) : Math.min(size / 1.15, size - 2));
