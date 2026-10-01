import C from './core.mjs';
import { t } from './i18n.mjs';
import { simplifiableItems } from './artwork-optimization.mjs';
import { planCategoryRows, compactCategoryRows, textWidth } from './export-rows.mjs';
import { packPlan, applyPacking } from './dot-packing.mjs';

// Fewer categories with the least visible loss. What costs a category is a row — the glyphs
// the download joins (export-rows.mjs), or with «Упаковать точки» the packed rows — so rows
// are removed whole; taking one dot out of a row saves nothing.
//
// Which row goes next follows weighted sample elimination (Yuksel, «Sample Elimination for
// Generating Poisson Disk Sample Sets», 2015): a glyph is redundant when its neighbourhood
// is crowded, Σ (1 − d/R)^8 over glyphs closer than R. A row's loss is the sum over its
// glyphs of how unique each is, and the row with the smallest loss goes; its neighbours
// become less crowded. So glyphs on top of each other go first, then dense fills lose every
// other row (the hatching stays), then lines lose every other dot, evenly — never a random
// hole. When no row is crowded any more, R doubles. Details are kept longer: rare glyphs (not
// the layer's usual dot) and small separate shapes — a mouth, an eye, a button — found by
// joining glyphs closer than two typical spacings. Long lines thin out first. Every layer
// keeps at least one row.

const UNIQUE = 20; // uniqueness 1 / (1 + UNIQUE·crowding): an isolated glyph 1, a dot on a line ≈ 0.4, in a fill ≈ 0.2
const RARE = 0.6;
const SHAPE = 0.25, SHAPE_SIZE = 70, SHAPE_GLYPHS = 60; // a separate shape up to 70 px across and 60 glyphs is a detail

// Marks glyphs of small separate shapes. Glyphs closer than twice the typical spacing
// (median nearest-neighbour distance) belong to one shape.
function smallShapes(dots) {
  const n = dots.length, detail = new Uint8Array(n);
  if (n < 2) return detail;
  const xs = dots.map((d) => d.x), ys = dots.map((d) => d.y);
  const guess = Math.max(1, Math.sqrt(Math.max(1, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / n));
  const grid = new Map(), cellOf = (v, size) => Math.floor(v / size);
  for (let i = 0; i < n; i++) { const key = `${cellOf(dots[i].x, guess)},${cellOf(dots[i].y, guess)}`; (grid.get(key) || grid.set(key, []).get(key)).push(i); }
  const nearest = [];
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 2000))) {
    let best = Infinity;
    const cx = cellOf(dots[i].x, guess), cy = cellOf(dots[i].y, guess);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
      for (const j of grid.get(`${gx},${gy}`) || []) {
        const d = Math.hypot(dots[j].x - dots[i].x, dots[j].y - dots[i].y);
        if (j !== i && d > 0.25 && d < best) best = d;
      }
    if (best < Infinity) nearest.push(best);
  }
  if (!nearest.length) return detail;
  nearest.sort((a, b) => a - b);
  const link = 2 * nearest[nearest.length >> 1], cells = new Map();
  for (let i = 0; i < n; i++) { const key = `${cellOf(dots[i].x, link)},${cellOf(dots[i].y, link)}`; (cells.get(key) || cells.set(key, []).get(key)).push(i); }
  const shape = new Int32Array(n).fill(-1);
  for (let start = 0; start < n; start++) {
    if (shape[start] >= 0) continue;
    const members = [start];
    shape[start] = start;
    for (let k = 0; k < members.length; k++) {
      const d = dots[members[k]], cx = cellOf(d.x, link), cy = cellOf(d.y, link);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
        for (const j of cells.get(`${gx},${gy}`) || [])
          if (shape[j] < 0 && Math.hypot(dots[j].x - d.x, dots[j].y - d.y) <= link) { shape[j] = start; members.push(j); }
    }
    const mx = members.map((i) => dots[i].x), my = members.map((i) => dots[i].y);
    const size = Math.hypot(Math.max(...mx) - Math.min(...mx), Math.max(...my) - Math.min(...my));
    if (members.length > 1 && members.length <= SHAPE_GLYPHS && size <= SHAPE_SIZE) for (const i of members) detail[i] = 1;
  }
  return detail;
}

class Heap {
  constructor() { this.items = []; }
  push(item) {
    const a = this.items; a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] < item[0] || (a[parent][0] === item[0] && a[parent][1] <= item[1])) break;
      a[i] = a[parent]; a[parent] = item; i = parent;
    }
  }
  pop() {
    const a = this.items, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        for (const c of [l, r]) if (c < a.length && (a[c][0] < a[m][0] || (a[c][0] === a[m][0] && a[c][1] < a[m][1]))) m = c;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.items.length; }
}

// units: [{ layer, dots: [{ x, y, rare }] }]. Returns unit indices, most important first.
export function eliminationOrder(units) {
  const dots = [];
  units.forEach((unit, k) => unit.dots.forEach((d) => dots.push({ x: d.x, y: d.y, bias: d.rare ? RARE : 1, unit: k })));
  smallShapes(dots).forEach((small, i) => { if (small) dots[i].bias *= SHAPE; });
  const alive = new Uint8Array(units.length).fill(1), removed = [], layerAlive = new Map();
  for (const unit of units) layerAlive.set(unit.layer, (layerAlive.get(unit.layer) || 0) + 1);
  let aliveCount = units.length;
  const remove = (k) => { alive[k] = 0; aliveCount--; layerAlive.set(units[k].layer, layerAlive.get(units[k].layer) - 1); removed.push(k); };
  const removable = (k) => alive[k] && layerAlive.get(units[k].layer) > 1;
  // A unit whose every glyph sits on a glyph of an earlier unit adds nothing: it goes first.
  const seen = new Set(), copies = [];
  units.forEach((unit, k) => {
    const keys = unit.dots.map((d) => `${Math.round(d.x * 4)},${Math.round(d.y * 4)}`);
    if (keys.length && keys.every((key) => seen.has(key))) copies.push(k);
    for (const key of keys) seen.add(key);
  });
  for (const k of copies.reverse()) if (removable(k)) remove(k);
  if (!dots.length) return [...units.keys()];
  // The starting radius: three typical glyph spacings.
  const xs = dots.map((d) => d.x), ys = dots.map((d) => d.y);
  const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys), diagonal = Math.hypot(spanX, spanY);
  let R = Math.max(3, 3 * Math.sqrt(Math.max(1, spanX * spanY) / dots.length));
  const w = new Float64Array(dots.length);
  while (aliveCount > layerAlive.size) {
    const live = dots.map((_, i) => i).filter((i) => alive[dots[i].unit]), grid = new Map();
    const cell = (v) => Math.floor(v / R);
    for (const i of live) { const key = `${cell(dots[i].x)},${cell(dots[i].y)}`; (grid.get(key) || grid.set(key, []).get(key)).push(i); }
    const around = (i, visit) => {
      const d = dots[i], cx = cell(d.x), cy = cell(d.y);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
        for (const j of grid.get(`${gx},${gy}`) || []) {
          if (j === i || !alive[dots[j].unit]) continue;
          const distance = Math.hypot(dots[j].x - d.x, dots[j].y - d.y);
          if (distance < R) visit(j, (1 - distance / R) ** 8);
        }
    };
    for (const i of live) { w[i] = 0; around(i, (_, v) => { w[i] += v; }); }
    const members = new Map();
    for (const i of live) (members.get(dots[i].unit) || members.set(dots[i].unit, []).get(dots[i].unit)).push(i);
    const loss = (k) => members.get(k).reduce((sum, i) => sum + 1 / (1 + UNIQUE * w[i] * dots[i].bias), 0);
    const crowded = (k) => members.get(k).some((i) => w[i] > 1e-9);
    const heap = new Heap(), version = new Map();
    for (const k of members.keys()) if (crowded(k)) heap.push([loss(k), k, 0]);
    let progress = false;
    while (heap.size && aliveCount > layerAlive.size) {
      const [, k, v] = heap.pop();
      if ((version.get(k) || 0) !== v || !removable(k) || !crowded(k)) continue;
      const touched = new Set();
      for (const i of members.get(k)) around(i, (j, value) => { w[j] -= value; touched.add(dots[j].unit); });
      remove(k); progress = true;
      for (const t of touched) {
        if (t === k || !alive[t]) continue;
        const next = (version.get(t) || 0) + 1;
        version.set(t, next);
        if (crowded(t)) heap.push([loss(t), t, next]);
      }
    }
    if (!progress && R > diagonal * 2) break;
    R *= 2;
  }
  const kept = [...units.keys()].filter((k) => alive[k]);
  return [...kept, ...removed.reverse()];
}

// pack: reduce the packed rows of «Упаковать точки» instead of the download's own rows.
// count(entries) → categories the download makes of them (the editor's download: core.mjs
// pickSafeCategories); by default the rows merged for the «Герои» page.
export function planOptimization(doc, measure, { pack = false, count = null } = {}) {
  count ||= (list) => compactCategoryRows(list, measure).length;
  const width = textWidth(measure), candidates = simplifiableItems(doc), ids = new Set(candidates.map((e) => e.id));
  const byId = new Map(candidates.map((e) => [e.id, e]));
  const entries = C.categoryEntries(doc), own = entries.filter((e) => ids.has(e.entityId));
  const protectedCount = count(entries.filter((e) => !ids.has(e.entityId)));
  let units;
  if (pack) {
    const { rows } = packPlan(doc, measure), packed = new Set(rows.flatMap((row) => row.members.map((e) => e.id)));
    units = [...rows.map((row) => ({ items: row.members, row })),
      ...candidates.filter((e) => !packed.has(e.id)).map((e) => ({ items: [e], row: null }))];
  } else {
    units = planCategoryRows(own, measure).groups.map((group) => ({ items: [...new Set(group.map((i) => byId.get(own[i].entityId)))], row: null }));
  }
  // The layer's usual glyph is its dot; any other glyph is a detail.
  const usual = new Map();
  for (const layer of new Set(candidates.map((e) => e.layer))) {
    const counts = new Map();
    for (const e of candidates) if (e.layer === layer) counts.set(e.text, (counts.get(e.text) || 0) + 1);
    usual.set(layer, [...counts].sort((a, b) => b[1] - a[1])[0][0]);
  }
  const order = eliminationOrder(units.map((unit) => ({ layer: unit.items[0].layer,
    dots: unit.items.map((e) => ({ x: e.x + width(e.text) / 2, y: e.y, rare: e.text !== usual.get(e.layer) })) })));
  const plan = { doc, measure, count, pack, units, order, protectedCount, rawCount: entries.length,
    minimumKeep: new Set(units.map((unit) => unit.items[0].layer)).size };
  plan.losslessCount = build(plan, units.length).count;
  plan.minimum = Math.min(plan.losslessCount, build(plan, plan.minimumKeep).count);
  return plan;
}

function build(plan, keep) {
  const kept = plan.order.slice(0, keep).map((k) => plan.units[k]);
  const keepIds = new Set(kept.flatMap((unit) => unit.items.map((e) => e.id)));
  const remove = new Set(plan.units.flatMap((unit) => unit.items.map((e) => e.id)).filter((id) => !keepIds.has(id)));
  let doc = C.clone(plan.doc), packed = 0;
  doc.entities = doc.entities.filter((e) => !remove.has(e.id));
  if (plan.pack) ({ doc, packed } = applyPacking(doc, kept.filter((unit) => unit.row).map((unit) => unit.row), plan.measure));
  const count = plan.count(C.categoryEntries(doc));
  return { doc, count, removed: remove.size, remaining: keepIds.size, packed };
}

export function optimizeCategories(plan, target = plan.losslessCount) {
  if (!Number.isFinite(target)) throw new Error(t('Укажи число категорий.'));
  const budget = Math.max(plan.minimum, Math.min(plan.losslessCount, Math.round(target)));
  const all = plan.units.length, clamp = (k) => Math.max(plan.minimumKeep, Math.min(all, k));
  if (budget >= plan.losslessCount) return { ...build(plan, all), budget };
  // Each kept unit is about one category; the download may join a few more. Step towards
  // the most units that still fit.
  let keep = clamp(budget - plan.protectedCount), best = null;
  const tried = new Set();
  while (!tried.has(keep)) {
    tried.add(keep);
    const result = build(plan, keep);
    if (result.count <= budget) {
      if (!best || keep > best.keep) best = { ...result, keep };
      if (result.count === budget || keep === all) break;
      keep = clamp(keep + budget - result.count);
    } else {
      if (keep === plan.minimumKeep) { best ||= { ...result, keep }; break; }
      keep = clamp(keep - (result.count - budget));
    }
  }
  const { keep: _, ...result } = best;
  return { ...result, budget };
}
