// «Курсор»'s pictures in the browser (CursorCreator.jsx, CursorSection.jsx): a cursor is drawn on a square
// of 32 units (Dota's 32 px), at any size. A role: { image (canvas or ImageBitmap) | null, scale (1 = the
// whole picture fits the square), x, y (its middle, in parts of the square), rot (degrees), hot ([x, y] in
// units, null = Valve's), frames (a d2pfx pack's own pictures by size: drawn as they are while the picture
// is not moved) }. Valve's own pictures (scripts/make-cursor-guides.mjs) are the icons and the faded guide.
import { CURSOR_ROLES } from '../../scripts/dota-cursor.mjs';

const guides = import.meta.glob('../../assets/dota-cursors/*.png', { import: 'default', eager: true });
export const guideURL = (id) => Object.entries(guides).find(([path]) => path.endsWith(`/${id}.png`))?.[1] || '';
const guideImages = new Map();
// Valve's picture of an id as an <img> (loaded once), for the canvas guide.
export function guideImage(id) {
  if (!guideImages.has(id)) {
    const image = new Image();
    image.src = guideURL(id);
    guideImages.set(id, new Promise((resolve) => { image.onload = () => resolve(image); image.onerror = () => resolve(null); }));
  }
  return guideImages.get(id);
}

export const MAX_SIDE = 512;
const canvasOf = (width, height = width) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; };
const sizeOf = (image) => [image.naturalWidth || image.width, image.naturalHeight || image.height];
// A picture the user gives, at most MAX_SIDE on its long side (a GIF gives its first frame).
export async function pictureOf(file) {
  const bitmap = await createImageBitmap(file);
  const [w, h] = sizeOf(bitmap), k = Math.min(1, MAX_SIDE / Math.max(w, h)), canvas = canvasOf(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}
// RGBA from scripts/dota-cursor.mjs decodeCursorBMP → a canvas.
export function canvasFromRGBA({ width, height, rgba }) {
  const canvas = canvasOf(width, height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

export const isCorner = (id) => CURSOR_ROLES[id].hot[0] < 8 && CURSOR_ROLES[id].hot[1] < 8;
// Where a new picture goes: fitted to the square, in its corner for a cursor that clicks with its corner,
// in the middle otherwise (spells, the crosshairs).
export function placed(id, image) {
  const [w, h] = sizeOf(image), k = 1 / Math.max(w, h);
  return isCorner(id) ? { scale: 1, x: (w * k) / 2, y: (h * k) / 2, rot: 0 } : { scale: 1, x: 0.5, y: 0.5, rot: 0 };
}
export const untouched = (role) => role.scale === 1 && role.x === 0.5 && role.y === 0.5 && role.rot === 0;
export const hotOf = (id, role) => role?.hot || CURSOR_ROLES[id].hot;

// Draws the role's picture on ctx's square of `size` px.
export function drawRole(ctx, role, size) {
  if (!role?.image) return;
  const [w, h] = sizeOf(role.image), k = (size / Math.max(w, h)) * role.scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(role.x * size, role.y * size);
  ctx.rotate((role.rot * Math.PI) / 180);
  ctx.drawImage(role.image, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
  ctx.restore();
}
// The role at `size` px, as a canvas: a pack's own picture of that size while untouched; else drawn big
// and halved down to the size (sharper than one big step).
export function roleCanvas(role, size) {
  if (role.frames && untouched(role)) {
    const exact = role.frames.find((frame) => frame.width === size && frame.height === size);
    if (exact) return exact.canvas;
  }
  let canvas = canvasOf(Math.max(size * 4, 128));
  drawRole(canvas.getContext('2d'), role, canvas.width);
  while (canvas.width / 2 >= size) {
    const next = canvasOf(canvas.width / 2), ctx = next.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
  }
  if (canvas.width !== size) {
    const last = canvasOf(size), ctx = last.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, size, size);
    canvas = last;
  }
  return canvas;
}
export const roleRGBA = (role, size) => roleCanvas(role, size).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
// Data URLs of a role by size, kept per role object (roles are replaced, never changed).
const urls = new WeakMap();
export function roleURL(role, size) {
  if (!role?.image) return '';
  let cached = urls.get(role);
  if (!cached) urls.set(role, (cached = {}));
  return (cached[size] ||= roleCanvas(role, size).toDataURL('image/png'));
}
// A CSS cursor of the role at 32 px with its hotspot (the creator's preview, the match preview).
export function cssCursor(id, role) {
  const url = roleURL(role, 32);
  if (!url) return 'auto';
  const [x, y] = hotOf(id, role);
  return `url(${url}) ${Math.min(31, x)} ${Math.min(31, y)}, auto`;
}
