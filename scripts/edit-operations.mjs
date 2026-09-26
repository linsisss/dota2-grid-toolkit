import C from './core.mjs';

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
export function transformReference(r, delta, handle, proportional = false) {
  if (handle === 'move')
    return { ...r, x: Math.max(0, r.x + delta.x), y: Math.max(0, r.y + delta.y) };
  // Clamp the scale at the origin, preserving the opposite resize anchor.
  const fit = (d) =>
    C.resizeBounds(
      r,
      {
        x: /[we]/.test(handle) ? d.x : 0,
        y: /[ns]/.test(handle) ? d.y : 0
      },
      handle,
      proportional,
      8
    );
  let bounds = fit(delta);
  if (bounds.x < 0 || bounds.y < 0) {
    let low = 0,
      high = 1;
    for (let i = 0; i < 40; i++) {
      const t = (low + high) / 2,
        b = fit({ x: delta.x * t, y: delta.y * t });
      if (b.x < 0 || b.y < 0) high = t;
      else low = t;
    }
    bounds = fit({ x: delta.x * low, y: delta.y * low });
  }
  return { ...r, ...bounds, x: Math.max(0, bounds.x), y: Math.max(0, bounds.y) };
}
export function eraseSymbols(doc, point, radius = 22) {
  doc.entities = doc.entities.flatMap((item) => {
    const layer = doc.layers.find((l) => l.id === item.layer);
    if (item.type === 'heroes' || !layer?.visible || layer.locked) return [item];
    const glyphs = C.textGlyphs(item, true);
    const keep = glyphs.filter((g) => Math.hypot(g.x - point.x, g.y - point.y) > radius);
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
