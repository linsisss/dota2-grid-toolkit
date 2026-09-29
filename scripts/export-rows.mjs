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
import { DOTA, ZERO_WIDTH_SPACE, advanceAt } from './dota-rendering.mjs';

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
// A category with only Dota's own fields: its glyphs may move into other categories.
export const plainCategory = (c) => Object.keys(c).every((key) => fields.has(key));

// Rows for every screen (docs/zoom-and-optimization.md «Экран выбора героя»). Dota snaps each
// glyph of a category to whole pixels at the size it draws the grid, so a row that is exact on
// the 1080p «Герои» page drifts elsewhere, by up to a unit per glyph. Here gaps are made of zero-
// width spaces, which advance exactly 2 units at every size, and a glyph joins a row only while
// it stays within `drift` units of its place on the page and on the hero-pick screen at every
// common resolution (SCREENS), and within `tol` on the 1080p page. A row never covers a hero card
// (`cards`): Dota's category name is a draggable header, 20 units tall and as wide as its text,
// and one lying on a card takes its clicks.
export const PICK_ROWS = Object.freeze({ py: 0.87, tol: 1, drift: 2.5, spacers: 90 });
// Hero-pick screen: 0.8695 of the page (1680 × 1050, 29.09.2026).
const SCREENS = [768, 900, 1050, 1080, 1200, 1440, 1600, 2160]
  .flatMap((height) => [1, 0.8695].map((pick) => DOTA.screenScale * height / 1080 * pick));
const covers = (cards, left, right, y) => cards.some((c) => left < c.x + c.w && right > c.x && y < c.y + c.h && y + DOTA.header > c.y);
// points: [{ ch, x, y }]; width(before, ch) → raw kerned width of ch after `before` ('' after a gap),
// as glyphWidths gives it. cards: [{ x, y, w, h }]. Returns rows as packGlyphs does.
export function packPickRows(points, width, { cards = [], py = PICK_ROWS.py, tol = PICK_ROWS.tol, drift = PICK_ROWS.drift, spacers = PICK_ROWS.spacers } = {}) {
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
        if (!run.open) continue;
        const target = x - run.x, gaps = Math.max(0, Math.round((target - run.width) / 2));
        const pen = run.width + gaps * 2, error = Math.abs(pen - target);
        if (gaps > spacers || error > tol || run.pens.some((p) => Math.abs(p + gaps * 2 - target) > drift)) continue;
        const raw = width(gaps ? '' : run.last, ch);
        if (covers(cards, run.x, run.x + DOTA.listPadding + pen + advanceAt(raw), y)) continue;
        const cost = error - run.members.length * 0.01;
        if (!best || cost < best.cost) best = { run, gaps, pen, raw, cost };
      }
      if (best) {
        const { run, gaps, pen, raw } = best;
        run.text += ZERO_WIDTH_SPACE.repeat(gaps) + ch;
        run.width = pen + advanceAt(raw);
        run.pens = run.pens.map((p, i) => p + gaps * 2 + advanceAt(raw, SCREENS[i]));
        run.last = ch; run.members.push(index); run.open = role !== 'end';
      } else {
        const raw = width('', ch);
        runs.push({ x, text: ch, width: advanceAt(raw), pens: SCREENS.map((scale) => advanceAt(raw, scale)),
          last: ch, members: [index], open: role === 'lead' });
      }
    }
    for (const run of runs)
      rows.push({ text: run.text, x: run.x, y: run.members.length > 1 ? y : points[run.members[0]].y, width: run.width, members: run.members });
    start = end;
  }
  return rows;
}
export function compactCategoryRows(entries, measure) {
  return planCategoryRows(entries, measure).categories;
}
// groups: for every output category, the entry indices it holds.
export function planCategoryRows(entries, measure) {
  const unchanged = () => ({ categories: entries.map(({ category }) => category), groups: entries.map((_, i) => [i]) });
  if (!measure) return unchanged();
  const layers = new Map();
  entries.forEach(({ category: c, layer }, index) => {
    if (c.hero_ids.length || !glyphRole(c.category_name) || !plainCategory(c)) return;
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
