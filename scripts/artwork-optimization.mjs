import C from './core.mjs';
import { t } from './i18n.mjs';

// Deterministic, spatially balanced sampling. Coordinates and glyphs never change.
// Text lines, hero groups, hidden and locked layers are deliberately excluded.
export function simplifiableItems(doc) {
  const layers = new Set(doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  return doc.entities.filter((e) => layers.has(e.layer) && e.type === 'symbol' &&
    Array.from(e.text).length === 1 && !/\s/u.test(e.text) && !e.rowGlyphs);
}
function spatialOrder(items, depth = 0) {
  if (items.length < 3) return items;
  const key = depth % 2 ? 'y' : 'x';
  const sorted = [...items].sort((a, b) => a[key] - b[key] || a.id - b.id),
    mid = Math.ceil(sorted.length / 2),
    a = spatialOrder(sorted.slice(0, mid), depth + 1),
    b = spatialOrder(sorted.slice(mid), depth + 1), result = [];
  for (let i = 0; i < a.length; i++) { result.push(a[i]); if (b[i]) result.push(b[i]); }
  return result;
}
export function simplifyArtwork(doc, percent = 100) {
  if (!Number.isFinite(percent)) throw new Error(t('Укажи процент оставшихся символов.'));
  const fraction = C.clamp(percent, 5, 100) / 100, candidates = simplifiableItems(doc);
  const grouped = new Map(), keep = new Set();
  for (const item of candidates) {
    if (!grouped.has(item.layer)) grouped.set(item.layer, []);
    grouped.get(item.layer).push(item);
  }
  for (const items of grouped.values()) {
    const limit = Math.max(1, Math.round(items.length * fraction));
    // Preserve the original extent whenever the budget permits.
    const anchors = new Set();
    for (const [key, direction] of [['x', 1], ['x', -1], ['y', 1], ['y', -1]]) {
      anchors.add(items.reduce((best, item) => item[key] * direction < best[key] * direction ? item : best));
    }
    const ordered = [...anchors, ...spatialOrder(items.filter((e) => !anchors.has(e)))];
    for (const item of ordered.slice(0, limit)) keep.add(item.id);
  }
  const eligible = new Set(candidates.map((e) => e.id));
  const next = C.clone(doc);
  next.entities = next.entities.filter((e) => !eligible.has(e.id) || keep.has(e.id));
  return { doc: next, before: candidates.length, after: keep.size, removed: candidates.length - keep.size };
}
