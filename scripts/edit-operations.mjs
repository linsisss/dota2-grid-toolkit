import C from './core.mjs';
import { t } from './i18n.mjs';

// Mirror locations, never the glyph or hero image itself. Expanded rows retain
// their measured spacing; the caller can merge horizontal rows afterwards.
export function reflectItems(doc, ids, axis) {
  if (!['horizontal', 'vertical'].includes(axis)) return [];
  const items = doc.entities.filter(
    (item) =>
      ids.has(item.id) &&
      doc.layers.some((layer) => layer.id === item.layer && layer.visible && !layer.locked)
  );
  const glyphs = items.flatMap((item) =>
    item.type === 'heroes' ? [item] : C.textGlyphs(item, true)
  );
  if (!glyphs.length) return [];
  const bounds = C.bounds(glyphs, true);
  const replacements = new Map(),
    result = [];
  for (const item of items) {
    const source = item.type === 'heroes' ? [item] : C.textGlyphs(item, true);
    const reflected = source.map((glyph, index) => {
      const next = { ...glyph, rotation: 0 };
      delete next.rowGlyphs;
      delete next.rowText;
      delete next.textMetrics;
      if (axis === 'horizontal') next.x = bounds.x * 2 + bounds.w - glyph.x - glyph.w;
      else next.y = bounds.y * 2 + bounds.h - glyph.y - C.visualHeight(glyph);
      if (index) return C.entity(doc, next);
      return { ...next, id: item.id };
    });
    replacements.set(item.id, reflected);
    result.push(...reflected);
  }
  doc.entities = doc.entities.flatMap((item) => replacements.get(item.id) || [item]);
  moveItems(result);
  return result;
}

export function mergeRows(doc, measure = null, ids = null) {
  const groups = new Map(),
    replacements = new Map();
  for (const item of doc.entities) {
    if (ids && !ids.has(item.id)) continue;
    if (
      item.type === 'heroes' ||
      C.normalizeAngle(item.rotation || 0) ||
      (!item.rowGlyphs && Array.from(item.text).length !== 1)
    )
      continue;
    const layer = doc.layers.find((l) => l.id === item.layer);
    if (!layer?.visible || layer.locked) continue;
    const key = `${item.layer}:${Math.round(item.y * 1000)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const glyphs = items.flatMap((item) => C.textGlyphs(item)).sort((a, b) => a.x - b.x);
    if (glyphs.map((g) => g.text).join('').length > 5000) continue;
    const x = glyphs[0].x,
      y = glyphs[0].y,
      first = items[0];
    const merged = {
      ...first,
      type: 'text',
      x,
      y,
      w: Math.max(...glyphs.map((g) => g.x + g.w)) - x,
      h: Math.max(...glyphs.map((g) => g.h)),
      text: glyphs.map((g) => g.text).join(''),
      rotation: 0,
      rowGlyphs: glyphs.map((g) => ({
        text: g.text,
        x: g.x - x,
        w: g.w,
        h: g.h,
        ...(g.extra ? { extra: g.extra } : {})
      }))
    };
    merged.name = merged.text;
    delete merged.textMetrics;
    delete merged.rowText;
    delete merged.extra;
    if (measure && !glyphs.some((g) => g.extra && Object.keys(g.extra).length)) {
      let text = glyphs[0].text,
        valid = true;
      const space = measure(' ').advances[0];
      for (let i = 1; i < glyphs.length; i++) {
        const width = measure(text).advances.reduce((a, b) => a + b, 0),
          gap = glyphs[i].x - x - width;
        const spaces = Math.round(gap / space);
        if (!space || spaces < 0 || spaces > 1000 || Math.abs(gap - spaces * space) > 0.01) {
          valid = false;
          break;
        }
        text += ' '.repeat(spaces) + glyphs[i].text;
        if (text.length > 5000) {
          valid = false;
          break;
        }
      }
      if (valid) merged.rowText = text;
    }
    delete first.textMetrics;
    delete first.rowText;
    delete first.extra;
    Object.assign(first, merged);
    for (const item of items) replacements.set(item.id, first.id);
  }
  doc.entities = doc.entities.filter(
    (item) => !replacements.has(item.id) || replacements.get(item.id) === item.id
  );
  return replacements;
}
export function overflow(doc) {
  let count = 0,
    editable = 0;
  for (const item of doc.entities) {
    const layer = doc.layers.find((l) => l.id === item.layer);
    if (item.type === 'heroes' || !layer?.visible) continue;
    for (const glyph of C.textGlyphs(item, true))
      if (C.outside(glyph, C.canvasSize(doc))) {
        count++;
        if (!layer.locked) editable++;
      }
  }
  return { count, editable };
}
export function cropSymbols(doc) {
  const items = [];
  for (const item of doc.entities) {
    const layer = doc.layers.find((l) => l.id === item.layer);
    if (item.type === 'heroes' || !layer?.visible || layer.locked) {
      items.push(item);
      continue;
    }
    const glyphs = C.textGlyphs(item, true),
      inside = glyphs.filter((glyph) => !C.outside(glyph, C.canvasSize(doc)));
    if (inside.length === glyphs.length) {
      items.push(item);
      continue;
    }
    for (const glyph of inside) {
      const clean = { ...glyph, rotation: 0 };
      delete clean.rowGlyphs;
      delete clean.rowText;
      delete clean.textMetrics;
      items.push(C.entity(doc, clean));
    }
  }
  doc.entities = items;
}
export function alignItems(items, side, size = C.canvasSize()) {
  if (!items.length) return;
  const group = C.bounds(items, true);
  const x = side === 'left' ? 0 : side === 'right' ? size.w - group.w : (size.w - group.w) / 2;
  moveItems(items, x - group.x, 0);
}
// Move the selection as one rigid body. Only the top and left canvas edges stop it.
// Imported geometry is left untouched until the user moves or transforms it.
export function moveItems(items, dx = 0, dy = 0) {
  if (!items.length) return;
  const b = C.bounds(items, true);
  dx = Math.max(dx, -b.x);
  dy = Math.max(dy, -b.y);
  for (const item of items) {
    item.x += dx;
    item.y += dy;
  }
  return { x: dx, y: dy };
}

export function referenceHandles(r) {
  return [
    ['nw', 0, 0],
    ['n', 0.5, 0],
    ['ne', 1, 0],
    ['e', 1, 0.5],
    ['se', 1, 1],
    ['s', 0.5, 1],
    ['sw', 0, 1],
    ['w', 0, 0.5]
  ].map(([key, x, y]) => ({ key, x: r.x + r.w * x, y: r.y + r.h * y }));
}
export function referenceHit(r, point, radius) {
  if (!r?.visible) return null;
  const handle = referenceHandles(r).find(
    (p) => Math.abs(p.x - point.x) <= radius && Math.abs(p.y - point.y) <= radius
  );
  if (handle) return handle.key;
  return point.x >= r.x && point.y >= r.y && point.x <= r.x + r.w && point.y <= r.y + r.h
    ? 'move'
    : null;
}
// The reference is only a guide under the drawing: it moves and stretches past every edge of the
// canvas, left and up as well as right and down. A resize keeps the opposite side or corner in place.
export function transformReference(r, delta, handle, proportional = false) {
  if (handle === 'move') return { ...r, x: r.x + delta.x, y: r.y + delta.y };
  const bounds = C.resizeBounds(r, { x: /[we]/.test(handle) ? delta.x : 0, y: /[ns]/.test(handle) ? delta.y : 0 }, handle, proportional, 8);
  return { ...r, ...bounds };
}
// Distance is measured to the middle of each glyph's own ink as it is drawn, not to the category
// corner, so the brush ring on screen removes exactly what it covers. `ink(text)` gives the ink box
// of a text from its category origin (dota-rendering measureCategoryInk, cached by the caller); a
// «.» sits on the baseline, about 9 units below a letter's middle, so one fixed centre for every
// glyph missed dots right under the ring. Without `ink` (tests, no canvas) a letter's middle is used.
const GLYPH_CENTER = { x: 9, y: 8 };
const glyphDistance = (g, point, ink) => {
  const box = ink?.(g.text), cx = box ? box.x + box.w / 2 : GLYPH_CENTER.x, cy = box ? box.y + box.h / 2 : GLYPH_CENTER.y;
  return Math.hypot(g.x + cx - point.x, g.y + cy - point.y);
};
export function eraseSymbols(doc, point, radius = 22, ink = null) {
  doc.entities = doc.entities.flatMap((item) => {
    const layer = doc.layers.find((l) => l.id === item.layer);
    if (item.type === 'heroes' || !layer?.visible || layer.locked) return [item];
    const glyphs = C.textGlyphs(item, true);
    const keep = glyphs.filter((g) => glyphDistance(g, point, ink) > radius);
    if (keep.length === glyphs.length) return [item];
    return keep.map((g) => {
      const clean = { ...g, rotation: 0 };
      delete clean.id;
      delete clean.rowGlyphs;
      delete clean.rowText;
      delete clean.textMetrics;
      return C.entity(doc, clean);
    });
  });
}

// «Распыление»: the glyphs under a round brush fly off along the stroke's direction, each its own
// random way (within `spread` degrees of it) and distance (up to `distance` × the brush's radius,
// most of them short), so the drawing crumbles or melts away there. Rows the brush touches become
// single glyphs, as with the eraser; `thrown` (ids) keeps a glyph from flying twice in one stroke.
// The randomness is a hash of the stroke's seed and the glyph's place: the same stroke gives the
// same result.
export const SCATTER_DEFAULTS = Object.freeze({ distance: 2.5, spread: 35 });
function scatterNoise(seed, x, y, salt) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(x * 16) + salt * 7919, 0xc2b2ae35) ^ Math.imul(Math.round(y * 16) + 1, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function scatterSymbols(doc, point, radius, direction, { distance = SCATTER_DEFAULTS.distance, spread = SCATTER_DEFAULTS.spread, seed = 1, thrown = new Set(), ink = null } = {}) {
  const heading = Math.atan2(direction.y, direction.x), cone = (spread * Math.PI) / 180;
  let changed = false;
  doc.entities = doc.entities.flatMap((item) => {
    const layer = doc.layers.find((l) => l.id === item.layer);
    if (item.type === 'heroes' || !layer?.visible || layer.locked || thrown.has(item.id)) return [item];
    const glyphs = C.textGlyphs(item, true);
    const under = glyphs.map((g) => glyphDistance(g, point, ink) <= radius);
    if (!under.some(Boolean)) return [item];
    changed = true;
    return glyphs.map((g, i) => {
      const clean = { ...g, rotation: 0 };
      delete clean.id; delete clean.rowGlyphs; delete clean.rowText; delete clean.textMetrics;
      if (under[i]) {
        // Most glyphs land near, a few far: the trail thins out like dust.
        const angle = heading + (scatterNoise(seed, g.x, g.y, 1) * 2 - 1) * cone;
        const far = radius * distance * (0.15 + 0.85 * scatterNoise(seed, g.x, g.y, 2) ** 1.6);
        clean.x = g.x + Math.cos(angle) * far;
        clean.y = g.y + Math.sin(angle) * far;
      }
      const made = C.entity(doc, clean);
      if (under[i]) thrown.add(made.id);
      return made;
    });
  });
  return changed;
}

// Replaces characters inside the selected symbol and text objects, keeping every position,
// e.g. a dotted artwork becomes hearts. `from` is one character, or '' for every visible one;
// whitespace is never touched. Returns how many characters changed.
export function replaceGlyphs(items, from, to) {
  const target = Array.from(String(to ?? '').trim())[0];
  if (!target) throw new Error(t('Укажи символ, на который заменить.'));
  const source = from ? Array.from(String(from))[0] : null;
  let count = 0;
  for (const item of items) {
    if (item.type === 'heroes' || typeof item.text !== 'string') continue;
    const chars = Array.from(item.text);
    const next = chars.map((ch) => {
      if (/\s/u.test(ch) || ch === target || (source !== null && ch !== source)) return ch;
      count++;
      return target;
    });
    const text = next.join('');
    if (text === item.text) continue;
    item.text = text;
    item.name = text;
    delete item.textMetrics;
    delete item.rowText;
    if (item.rowGlyphs) next.filter((ch) => !/\s/u.test(ch)).forEach((ch, i) => item.rowGlyphs[i] && (item.rowGlyphs[i].text = ch));
  }
  return count;
}

// Distinct visible characters of a selection, most frequent first, for the replace picker.
export function glyphCounts(items) {
  const counts = new Map();
  for (const item of items) {
    if (item.type === 'heroes' || typeof item.text !== 'string') continue;
    for (const ch of item.text) if (!/\s/u.test(ch)) counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Objects as the player sees them: a whole group or ASCII layer moves as one piece,
// anything else (including glyphs Alt-picked out of an artwork) is its own object.
export function selectionUnits(doc, items) {
  const chosen = new Set(items.map((item) => item.id)), total = new Map(), picked = new Map();
  for (const entity of doc.entities) {
    total.set(entity.layer, (total.get(entity.layer) || 0) + 1);
    if (chosen.has(entity.id)) picked.set(entity.layer, (picked.get(entity.layer) || 0) + 1);
  }
  const artwork = new Set(doc.layers.filter((layer) => layer.kind === 'artwork').map((layer) => layer.id));
  const units = new Map();
  for (const item of items) {
    const key = artwork.has(item.layer) && picked.get(item.layer) === total.get(item.layer) ? `layer:${item.layer}` : `item:${item.id}`;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(item);
  }
  return [...units.values()];
}

// Figma-style alignment: several objects line up with each other inside their common
// bounds; a single object aligns to the canvas. Each object keeps its internal layout.
// frameOf measures an object; the editor passes the visible (ink) frame.
const boxFrame = (items) => C.bounds(items, true);
export function alignUnits(units, side, canvas = C.canvasSize(), frameOf = boxFrame) {
  if (!units.length) return;
  const frame = units.length > 1 ? frameOf(units.flat()) : { x: 0, y: 0, w: canvas.w, h: canvas.h };
  for (const unit of units) {
    const b = frameOf(unit);
    const dx = { left: frame.x - b.x, hcenter: frame.x + (frame.w - b.w) / 2 - b.x, right: frame.x + frame.w - b.w - b.x }[side] || 0;
    const dy = { top: frame.y - b.y, vmiddle: frame.y + (frame.h - b.h) / 2 - b.y, bottom: frame.y + frame.h - b.h - b.y }[side] || 0;
    moveItems(unit, dx, dy);
  }
}

// Equal gaps between three or more objects; the outermost two stay in place.
export function distributeUnits(units, axis = 'x', frameOf = boxFrame) {
  if (units.length < 3) return;
  const [pos, size] = axis === 'y' ? ['y', 'h'] : ['x', 'w'];
  const boxes = units.map((unit) => ({ unit, b: frameOf(unit) }))
    .sort((a, c) => a.b[pos] + a.b[size] / 2 - (c.b[pos] + c.b[size] / 2));
  const first = boxes[0].b, last = boxes.at(-1).b;
  const gap = (last[pos] + last[size] - first[pos] - boxes.reduce((sum, { b }) => sum + b[size], 0)) / (boxes.length - 1);
  let cursor = first[pos];
  for (const { unit, b } of boxes) {
    moveItems(unit, pos === 'x' ? cursor - b.x : 0, pos === 'y' ? cursor - b.y : 0);
    cursor += b[size] + gap;
  }
}
