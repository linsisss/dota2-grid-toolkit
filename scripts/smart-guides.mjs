// Figma-style smart guides: while a selection is dragged, its left/centre/right and
// top/middle/bottom lines stick to the same lines of other objects and of the canvas.
// Lines are sorted once per gesture, so each pointer move is a few binary searches.
export function guideLines(frames, canvas) {
  const x = [], y = [];
  for (const f of [{ x: 0, y: 0, w: canvas.w, h: canvas.h }, ...frames]) {
    for (const v of [f.x, f.x + f.w / 2, f.x + f.w]) x.push({ v, from: f.y, to: f.y + f.h });
    for (const v of [f.y, f.y + f.h / 2, f.y + f.h]) y.push({ v, from: f.x, to: f.x + f.w });
  }
  const order = (a, b) => a.v - b.v;
  return { x: x.sort(order), y: y.sort(order) };
}
function lowerBound(lines, value) {
  let lo = 0, hi = lines.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (lines[mid].v < value) lo = mid + 1; else hi = mid; }
  return lo;
}
function closest(lines, edges, threshold) {
  let best = null;
  for (const edge of edges) {
    const i = lowerBound(lines, edge);
    for (const line of [lines[i - 1], lines[i]]) {
      const d = line && line.v - edge;
      if (line && Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v: line.v };
    }
  }
  return best;
}
function span(lines, v, from, to) {
  for (let i = lowerBound(lines, v - 1e-6); i < lines.length && lines[i].v <= v + 1e-6; i++) {
    from = Math.min(from, lines[i].from);
    to = Math.max(to, lines[i].to);
  }
  return { from, to };
}
// Returns the correction for a dragged box and the guides to draw after snapping.
export function snapMove(box, lines, threshold) {
  const sx = closest(lines.x, [box.x, box.x + box.w / 2, box.x + box.w], threshold);
  const sy = closest(lines.y, [box.y, box.y + box.h / 2, box.y + box.h], threshold);
  const dx = sx ? sx.d : 0, dy = sy ? sy.d : 0, x = box.x + dx, y = box.y + dy, guides = [];
  if (sx) guides.push({ axis: 'x', v: sx.v, ...span(lines.x, sx.v, y, y + box.h) });
  if (sy) guides.push({ axis: 'y', v: sy.v, ...span(lines.y, sy.v, x, x + box.w) });
  return { dx, dy, guides };
}
