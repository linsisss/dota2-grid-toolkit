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

// The brush ring of the eraser and «Распыление» in the site's colours: a soft violet tint inside, the
// accent ring over a dark halo (readable on light pictures too), a small cross at the centre, and
// the size in a chip like the editor's tooltips while it changes. `p` and `radius` are in canvas
// units; `unit` is canvas units per CSS pixel, so lines and text keep their screen size at any zoom.
const RING = Object.freeze({ tint: '#c4b5ed17', halo: '#0c0b10a6', ring: '#c4b5ed', cross: '#e4dcfb', chip: '#393041f2', chipLine: '#655675', text: '#ffffff' });
export function drawBrushRing(ctx, p, radius, unit, label = '') {
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = RING.tint; ctx.fill();
  ctx.lineWidth = 4 * unit; ctx.strokeStyle = RING.halo; ctx.stroke();
  ctx.lineWidth = 1.6 * unit; ctx.strokeStyle = RING.ring; ctx.stroke();
  const arm = 4 * unit;
  ctx.beginPath(); ctx.moveTo(p.x - arm, p.y); ctx.lineTo(p.x + arm, p.y); ctx.moveTo(p.x, p.y - arm); ctx.lineTo(p.x, p.y + arm);
  ctx.lineCap = 'round'; ctx.lineWidth = 3 * unit; ctx.strokeStyle = RING.halo; ctx.stroke();
  ctx.lineWidth = 1.2 * unit; ctx.strokeStyle = RING.cross; ctx.stroke();
  if (label) {
    ctx.font = `600 ${12 * unit}px Inter, 'SF Pro Display', 'Segoe UI', sans-serif`;
    const w = ctx.measureText(label).width + 16 * unit, h = 22 * unit;
    const x = p.x + radius * 0.71 + 6 * unit, y = p.y - radius * 0.71 - 6 * unit - h;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 7 * unit);
    ctx.fillStyle = RING.chip; ctx.fill();
    ctx.lineWidth = unit; ctx.strokeStyle = RING.chipLine; ctx.stroke();
    ctx.fillStyle = RING.text; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 8 * unit, y + h / 2 + 0.5 * unit);
  }
  ctx.restore();
}
