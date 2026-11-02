import { MENU_SIZES } from '../../scripts/menu-background.mjs';
import { WIDGET_SCREEN, WIDGET_TYPES } from '../../scripts/menu-widgets.mjs';

// The constructor's screen (2026-10-31): Dota lays its menu out in 1080p pixels and scales it by
// min(width / 1920, height / 1080) (DotaMenu.jsx), so a screen of another shape is wider (21:9) or taller
// (16:10, 4:3) than 1920 × 1080 in those pixels. Widgets are kept in 1920 × 1080 pixels with an anchor
// (scripts/menu-widgets.mjs); on another shape a widget keeps its distance to its anchor's edge.
export function screenOf(aspect) {
  const [width, height] = MENU_SIZES[aspect] || MENU_SIZES['16:9'], scale = Math.min(width / 1920, height / 1080);
  return { W: Math.round(width / scale), H: Math.round(height / scale) };
}
const AX = { l: 0, c: 0.5, r: 1 }, AY = { t: 0, m: 0.5, b: 1 };
export const shiftOf = (anchor, { W, H }) => ({ dx: (W - WIDGET_SCREEN.width) * AX[anchor[1]], dy: (H - WIDGET_SCREEN.height) * AY[anchor[0]] });
// Where a widget is on this screen, and back: a rect on the screen → the widget's own x, y (kept inside the
// 1920 × 1080 frame under the top bar, as cleanWidget keeps them).
export function rectOf(widget, dims) {
  const { dx, dy } = shiftOf(widget.anchor, dims);
  return { x: widget.x + dx, y: widget.y + dy, w: widget.w, h: widget.h };
}
export function placeOf(rect, anchor, dims) {
  const { dx, dy } = shiftOf(anchor, dims);
  return { x: Math.round(rect.x - dx), y: Math.round(rect.y - dy), w: Math.round(rect.w), h: Math.round(rect.h) };
}
// The anchor a rect gets by where it is: the screen in thirds.
export function autoAnchor(rect, { W, H }) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return (cy < H / 3 ? 't' : cy > (H * 2) / 3 ? 'b' : 'm') + (cx < W / 3 ? 'l' : cx > (W * 2) / 3 ? 'r' : 'c');
}
// The rect clamped to where this anchor lets it be. When the frame stops it (a wide screen's far side), the
// anchor follows the place, so a widget can go anywhere on the screen.
export function fitRect(rect, anchor, dims) {
  const clampWith = (a) => {
    const { dx, dy } = shiftOf(a, dims);
    const x = Math.min(Math.max(rect.x, dx), dx + WIDGET_SCREEN.width - rect.w), y = Math.min(Math.max(rect.y, dy + WIDGET_SCREEN.top), dy + WIDGET_SCREEN.height - rect.h);
    return { ...rect, x, y };
  };
  const off = (q) => Math.abs(q.x - rect.x) + Math.abs(q.y - rect.y);
  const kept = clampWith(anchor);
  if (off(kept) < 0.5) return { rect: kept, anchor };
  const other = autoAnchor(rect, dims), moved = clampWith(other);
  return off(moved) < off(kept) - 0.5 ? { rect: moved, anchor: other } : { rect: kept, anchor };
}
// The smallest and largest a widget of this type may be.
export const minOf = (type) => WIDGET_TYPES[type]?.min || [24, 24];
export const fixedOf = (type) => !!WIDGET_TYPES[type]?.fixed;

export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Valve's own panels of the main menu (DotaMenu.jsx and its CSS, in the same 1080p pixels): the top bar, the
// friends rail with the party bar, the news column (its cards as they are shown), the chat line and the play
// button. They cannot move; a widget over one covers it in the game.
// `valve` (menu-background.mjs menuValve, 2026-11-02): the news cards' sizes and icons, the chat's shift.
export function valveZones({ W, H }, { carnival = true, season = true, event = false, valve = null } = {}) {
  const right = W - 58 - 330, news = [], cards = valve?.cards, at = (part) => valve?.[part] || { x: 0, y: 0 }, chat = at('chat'), friends = at('friends'), column = at('news');
  const card = (one, full) => (one?.icon ? one.size : Math.round(full * (one?.scale ?? 100) / 100));
  const top = carnival ? card(cards?.carnival, 484) : 0, gap = carnival ? (cards?.carnival?.icon ? 12 : 16) : 0;
  if (carnival) news.push([100, top]);
  if (season) news.push([100 + top + gap, card(cards?.season, 234)]);
  if (event) news.push([carnival ? 600 : 100, 56]);
  const first = news.length ? Math.min(...news.map(([y]) => y)) : 0, bottom = news.length ? Math.max(...news.map(([y, h]) => y + h)) : 0;
  return [
    { id: 'topbar', x: 0, y: 0, w: W, h: 61 },
    { id: 'friends', x: 32 + friends.x, y: 100 + friends.y, w: 366, h: H - 121 },
    news.length && { id: 'news', x: right + column.x, y: first + column.y, w: 330, h: bottom - first },
    { id: 'chat', x: (W - 688) / 2 + chat.x, y: H - 55 + chat.y, w: 688, h: 34 },
    { id: 'play', x: right, y: H - 71, w: 330, h: 49 }
  ].filter(Boolean);
}
// The lines a widget sticks to besides the screen's edges and centre: Valve's columns.
export function valveLines({ W, H }, zones) {
  const news = zones.find((zone) => zone.id === 'news');
  return {
    x: [[398, 'friends'], [W - 388, 'news'], [W - 58, 'newsEdge'], [(W - 688) / 2, 'chat'], [(W + 688) / 2, 'chat']],
    y: [[61, 'topbar'], [100, 'columns'], news && [news.y + news.h, 'newsEnd'], [H - 71, 'play'], [H - 91, 'party']].filter(Boolean)
  };
}

// Snapping a rect being moved ('move') or resized (a corner: 'nw', 'se'…, or a side: 'n', 'e'…) to the closest
// line within `threshold` (screen pixels): the screen's edges and centre, the other widgets' edges and centres,
// Valve's lines. `top`: where the screen's top edge is (under Dota's top bar; 0 in «Редактор виджета», whose
// lines are its 16 px margins). → { rect, guides: [{ axis: 'v' | 'h', at, label, valve }] }.
export function snapRect(rect, mode, { dims, others, lines, threshold, top = WIDGET_SCREEN.top }) {
  const { W, H } = dims;
  const tx = [[0, 'edge'], [W / 2, 'centre'], [W, 'edge']], ty = [[top, 'edge'], [H / 2, 'centre'], [H, 'edge']];
  for (const q of others) { tx.push([q.x, ''], [q.x + q.w / 2, ''], [q.x + q.w, '']); ty.push([q.y, ''], [q.y + q.h / 2, ''], [q.y + q.h, '']); }
  for (const [at, label] of lines.x) tx.push([at, label, true]);
  for (const [at, label] of lines.y) ty.push([at, label, true]);
  const pick = (edges, targets) => {
    let best = null;
    for (const [edge, side] of edges) for (const [target, label, valve] of targets) {
      const d = target - edge;
      if (Math.abs(d) < threshold && (!best || Math.abs(d) < Math.abs(best.d) - 0.01 || (Math.abs(Math.abs(d) - Math.abs(best.d)) < 0.01 && label && !best.label))) best = { d, target, label, valve, side };
    }
    return best;
  };
  const move = mode === 'move';
  const ex = move ? [[rect.x, 'l'], [rect.x + rect.w / 2, 'c'], [rect.x + rect.w, 'r']] : [mode.includes('w') && [rect.x, 'l'], mode.includes('e') && [rect.x + rect.w, 'r']].filter(Boolean);
  const ey = move ? [[rect.y, 't'], [rect.y + rect.h / 2, 'm'], [rect.y + rect.h, 'b']] : [mode.includes('n') && [rect.y, 't'], mode.includes('s') && [rect.y + rect.h, 'b']].filter(Boolean);
  const bx = pick(ex, tx), by = pick(ey, ty), out = { ...rect }, guides = [];
  if (bx) {
    if (move) out.x += bx.d; else if (bx.side === 'l') { out.x += bx.d; out.w -= bx.d; } else out.w += bx.d;
    guides.push({ axis: 'v', at: bx.target, label: bx.label, valve: !!bx.valve });
  }
  if (by) {
    if (move) out.y += by.d; else if (by.side === 't') { out.y += by.d; out.h -= by.d; } else out.h += by.d;
    guides.push({ axis: 'h', at: by.target, label: by.label, valve: !!by.valve });
  }
  return { rect: out, guides };
}

// The nearest place where the rect covers none of the zones and stays on the screen (under the top bar).
export function freePlace(rect, zones, { W, H }) {
  const free = (q) => q.x >= 0 && q.y >= WIDGET_SCREEN.top && q.x + q.w <= W && q.y + q.h <= H && !zones.some((zone) => overlap(q, zone));
  if (free(rect)) return rect;
  for (let d = 8; d < 1600; d += 8) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) {
      const q = { ...rect, x: rect.x + dx, y: rect.y + dy };
      if (free(q)) return q;
    }
  }
  return null;
}
