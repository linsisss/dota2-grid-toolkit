// Export optimization only. Never replace editable objects with row containers.
// Dota has no per-character offsets: single glyphs join a row only where the row's measured
// text puts every glyph back within half a screen pixel of its own position (EXACT_PACK),
// which the game cannot show. Unknown metadata stays intact.
//
// Row packing: single glyphs standing at almost the same height become one row of text —
// «.  . .» — which is one Dota category. Every glyph of a row lands where the game draws it
// (the calibrated label advances with kerning), at most `tol` px sideways and half of `py`
// up or down from where it stood. «Упаковать точки» (dot-packing.mjs) uses PACK_DEFAULTS.
import { ROW_GLYPH_SETS } from './ascii-rows.mjs';

export const PACK_DEFAULTS = Object.freeze({ py: 2, tol: 1.5 });
// One grid unit is 1.1497 screen pixels at 1080p.
export const EXACT_PACK = Object.freeze({ py: 0.87, tol: 0.43 });
const MAX_ROW = 5000;

// Where a glyph may stand in a row. Game-font glyphs anywhere; # never first (a label
// starting with it is a localization key). Dota draws other glyphs (⁎, ★, kana) with
// fallback fonts whose widths are unknown, so they may only end a row. Spaces, right-to-left
// letters and combining marks are never joined.
const GAME_FONT = new Set(Array.from(ROW_GLYPH_SETS.all.replace(' ', '')));
export function glyphRole(ch) {
  if (typeof ch !== 'string' || Array.from(ch).length !== 1 || /[\s֐-ࣿ]|\p{Mark}/u.test(ch)) return null;
  const upper = ch.toUpperCase();
  return upper === '#' ? 'inner' : GAME_FONT.has(upper) ? 'lead' : 'end';
}

// measure(text) → { width } or { advances }, as elsewhere in the editor.
export function textWidth(measure) {
  const cache = new Map();
  return (text) => {
    if (!cache.has(text)) {
      const value = measure(text);
      cache.set(text, value.width ?? value.advances.reduce((sum, advance) => sum + advance, 0));
    }
    return cache.get(text);
  };
}

// points: [{ ch, x, y }] category positions of single glyphs (glyphRole not null).
// Returns rows [{ text, x, y, width, members: [point indices] }]; a glyph that joins no row
// keeps its own position. width is the row's measured advance, from the same pair advances.
export function packGlyphs(points, measure, { py = PACK_DEFAULTS.py, tol = PACK_DEFAULTS.tol } = {}) {
  const width = textWidth(measure), pairs = new Map();
  // The advance of b after a: Dota kerns each glyph against the one before it.
  const after = (a, b) => {
    const key = a + '\u0000' + b;
    if (!pairs.has(key)) pairs.set(key, a ? width(a + b) - width(a) : width(b));
    return pairs.get(key);
  };
  const order = points.map((_, i) => i).sort((a, b) => points[a].y - points[b].y || points[a].x - points[b].x);
  const rows = [];
  for (let start = 0; start < order.length;) {
    let end = start;
    const top = points[order[start]].y;
    while (end < order.length && points[order[end]].y - top <= py) end++;
    const band = order.slice(start, end).sort((a, b) => points[a].x - points[b].x || a - b);
    const y = (top + points[order[end - 1]].y) / 2, runs = [];
    for (const index of band) {
      const { ch, x } = points[index], role = glyphRole(ch);
      let best = null;
      for (const run of role ? runs : []) {
        const target = x - run.x, base = run.pen + run.advance;
        if (!run.open || target < base - tol || run.length + 1 > MAX_ROW) continue;
        const first = after(run.last, ' '), next = after(' ', ' ');
        const counted = Math.max(1, Math.round((target - base - first) / next) + 1);
        for (const n of [0, counted - 1, counted, counted + 1]) {
          if (n < 0 || (n && run.length + n + 1 > MAX_ROW)) continue;
          const pen = n ? base + first + (n - 1) * next : base, error = Math.abs(pen - target);
          if (error <= tol && (!best || error < best.error)) best = { run, n, pen, error };
        }
      }
      if (best) {
        const { run, n, pen } = best;
        run.advance = after(n ? ' ' : run.last, ch);
        run.text += ' '.repeat(n) + ch; run.length += n + 1;
        run.pen = pen; run.last = ch; run.members.push(index);
        run.open = role !== 'end';
      } else runs.push({ x, text: ch, length: 1, pen: 0, advance: after('', ch), last: ch, members: [index], open: role === 'lead' });
    }
    for (const run of runs)
      rows.push({ text: run.text, x: run.x, y: run.members.length > 1 ? y : points[run.members[0]].y,
        width: run.pen + run.advance, members: run.members });
    start = end;
  }
  return rows;
}

const fields = new Set([
  'category_name', 'x_position', 'y_position', 'width', 'height', 'hero_ids'
]);
export function compactCategoryRows(entries, measure) {
  return planCategoryRows(entries, measure).categories;
}
// groups: for every output category, the entry indices it holds.
export function planCategoryRows(entries, measure) {
  const unchanged = () => ({ categories: entries.map(({ category }) => category), groups: entries.map((_, i) => [i]) });
  if (!measure) return unchanged();
  const layers = new Map();
  entries.forEach(({ category: c, layer }, index) => {
    if (c.hero_ids.length || !glyphRole(c.category_name) || Object.keys(c).some((key) => !fields.has(key))) return;
    (layers.get(layer) || layers.set(layer, []).get(layer)).push(index);
  });
  const replacements = new Map(), removed = new Set(), members = new Map();
  for (const indices of layers.values()) {
    const points = indices.map((i) => ({ ch: entries[i].category.category_name, x: entries[i].category.x_position, y: entries[i].category.y_position }));
    for (const row of packGlyphs(points, measure, EXACT_PACK)) {
      if (row.members.length < 2) continue;
      const group = row.members.map((m) => indices[m]).sort((a, b) => a - b), first = group[0];
      replacements.set(first, { ...entries[first].category, category_name: row.text,
        x_position: +row.x.toFixed(6), y_position: +row.y.toFixed(6) });
      for (const index of group.slice(1)) removed.add(index);
      members.set(first, group);
    }
  }
  const categories = [], groups = [];
  entries.forEach(({ category }, index) => {
    if (removed.has(index)) return;
    categories.push(replacements.get(index) || category);
    groups.push(members.get(index) || [index]);
  });
  return { categories, groups };
}
