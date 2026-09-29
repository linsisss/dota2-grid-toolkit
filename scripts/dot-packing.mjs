// Dot packing for the editor: single symbols of a document become text rows (packGlyphs in
// export-rows.mjs), at most PACK_DEFAULTS.tol px from where they stood — invisible to the
// eye, and a dot art needs 2–3.5× fewer categories.
import C from './core.mjs';
import { simplifiableItems } from './artwork-optimization.mjs';
import { PACK_DEFAULTS, glyphRole, packGlyphs, textWidth } from './export-rows.mjs';

export { PACK_DEFAULTS, packGlyphs };

// Imported categories may carry fields the editor does not know; such glyphs stay single.
const KNOWN = new Set(['category_name', 'x_position', 'y_position', 'width', 'height', 'hero_ids']);
export function packableItems(doc) {
  return simplifiableItems(doc).filter((e) => glyphRole(e.text) && !C.normalizeAngle(e.rotation || 0) &&
    !Object.keys(e.extra || {}).some((key) => !KNOWN.has(key)));
}

// The rows packing would make, layer by layer: [{ text, x, y, members: [entities] }].
export function packPlan(doc, measure, options = PACK_DEFAULTS) {
  const items = packableItems(doc), byLayer = new Map(), rows = [];
  for (const item of items) (byLayer.get(item.layer) || byLayer.set(item.layer, []).get(item.layer)).push(item);
  for (const group of byLayer.values())
    for (const row of packGlyphs(group.map((e) => ({ ch: e.text, x: e.x, y: e.y })), measure, options))
      rows.push({ ...row, members: row.members.map((i) => group[i]) });
  return { items, rows };
}

// A copy of doc with each planned row of two or more glyphs as one text entity in place of
// its glyphs. rows: id of each new row → how many glyphs it holds.
export function applyPacking(doc, planned, measure) {
  const width = textWidth(measure), next = C.clone(doc), replace = new Map(), remove = new Set(), rows = new Map();
  const order = new Map(doc.entities.map((e, i) => [e.id, i]));
  let packed = 0;
  // In drawing order, so the new ids do not depend on the order rows were chosen in.
  const start = (row) => Math.min(...row.members.map((e) => order.get(e.id) ?? Infinity));
  for (const row of [...planned].sort((a, b) => start(a) - start(b))) {
    if (row.members.length < 2) continue;
    const members = row.members.filter((e) => order.has(e.id));
    if (members.length !== row.members.length) throw new Error('Packed glyph is missing from the document.');
    const entity = C.entity(next, { type: 'text', name: row.text, text: row.text, x: +row.x.toFixed(2), y: +row.y.toFixed(2),
      w: Math.max(30, (row.width ?? width(row.text)) + 8), h: 30, layer: members[0].layer });
    // The row takes the place of its earliest glyph in the drawing order.
    const first = members.reduce((a, b) => (order.get(a.id) <= order.get(b.id) ? a : b));
    replace.set(first.id, entity);
    for (const member of members) if (member !== first) remove.add(member.id);
    rows.set(entity.id, members.length);
    packed += members.length;
  }
  next.entities = next.entities.filter((e) => !remove.has(e.id)).map((e) => replace.get(e.id) || e);
  return { doc: next, rows, packed };
}

// The document with every packable symbol packed into text rows.
export function packSymbols(doc, measure, options) {
  const { items, rows } = packPlan(doc, measure, options), result = applyPacking(doc, rows, measure);
  return { ...result, before: items.length, after: items.length - result.packed + result.rows.size };
}
