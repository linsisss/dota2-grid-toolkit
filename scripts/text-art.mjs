// «Текст в ASCII»: a text in lettering made of symbols, in two kinds of styles.
//
// Letter styles are FIGlet fonts (figlet.js, MIT, with the fonts FIGlet and its contributors made). They
// were picked to be safe in Dota: only printable ASCII symbols, nothing Dota does not draw (blocks, box
// drawing), and no letters a–z, which Dota would upper-case into other shapes — except Larry 3D's «w»,
// whose «x» turns into an «X» that looks the same (Script and Mini draw with «o» and were left out).
// Only Banner and Graceful have Cyrillic (fonts with placeholder Cyrillic, like Bigfig's X blocks, were
// left out). The art is placed glyph by glyph on a monospace grid of 7 × 13 units (TEXT_ART_CELL):
// Dota's font is proportional, so a whole line as one label would drift off FIGlet's columns. Each
// glyph's ink is centred across its cell and set in it by its kind (TEXT_ART_ROLE) — lines and letters
// in the middle, «_ . ,» on the bottom, «' " ^» on top — as a terminal shows them: a 13-unit row lets
// Dota's 12–15-unit «| / \ ( )» meet the next row's, and FIGlet's one-column-per-row diagonals have the
// slope of Dota's «/».
//
// Dot styles draw the text with a system font and set symbols on it, free of any grid. The letters'
// centre lines (thinned, traced into smooth curves, spurs cut) or outlines (contours of the anti-aliased
// letters) get a symbol every `gap` units along their length, so strokes stay even instead of following
// the pixels. «Жирные точки» is the lettering of the workshop's «Seijūrō Akashi» (anesthesia): «•» about
// 1.7 units apart along the centre lines, overlapping into bold round strokes; its «4» and «RAKUZAN»
// are outlines in sparser dots. Dot styles write any script and take a size (`scale`). «Пиксели»
// writes # for the pixels of a small bitmap of the text.
//
// A style that lacks a letter of the text is offered as unavailable, not half-drawn. The download joins
// the glyphs into rows where it can (core.mjs pickSafeCategories).
import figlet from 'figlet';

export const TEXT_ART_CELL = Object.freeze({ w: 7, h: 13 });
export const TEXT_ART_LIMITS = Object.freeze({ text: 120, columns: 160, dots: 6000, scale: [0.3, 8] });

// Each font is its own small chunk, loaded when the dialog opens (Vite needs the paths spelt out).
const FONTS = {
  'Standard': () => import('figlet/fonts/Standard'),
  'Slant': () => import('figlet/fonts/Slant'),
  'Big': () => import('figlet/fonts/Big'),
  'Doom': () => import('figlet/fonts/Doom'),
  'Banner': () => import('figlet/fonts/Banner'),
  'Graceful': () => import('figlet/fonts/Graceful'),
  'Star Wars': () => import('figlet/fonts/Star Wars'),
  'Epic': () => import('figlet/fonts/Epic'),
  'Alligator2': () => import('figlet/fonts/Alligator2'),
  'Larry 3D': () => import('figlet/fonts/Larry 3D'),
  '3D-ASCII': () => import('figlet/fonts/3D-ASCII'),
  'Graffiti': () => import('figlet/fonts/Graffiti'),
  'Big Money-ne': () => import('figlet/fonts/Big Money-ne'),
  'Merlin1': () => import('figlet/fonts/Merlin1'),
  'Fire Font-k': () => import('figlet/fonts/Fire Font-k'),
  'Modular': () => import('figlet/fonts/Modular'),
  'Rounded': () => import('figlet/fonts/Rounded'),
  'Speed': () => import('figlet/fonts/Speed'),
  'Ogre': () => import('figlet/fonts/Ogre'),
  'Fender': () => import('figlet/fonts/Fender'),
  'Shadow': () => import('figlet/fonts/Shadow'),
  'Small': () => import('figlet/fonts/Small'),
  'Small Slant': () => import('figlet/fonts/Small Slant'),
  'Small Shadow': () => import('figlet/fonts/Small Shadow'),
  'Rectangles': () => import('figlet/fonts/Rectangles'),
  'Cyberlarge': () => import('figlet/fonts/Cyberlarge'),
};
const figletStyle = (id, name, font, extra = {}) => ({ id, name, font, load: FONTS[font], ...extra });
// Condensed sans for the traced letters (Bahnschrift comes with Windows 10 and 11), heavy sans for outlines.
const NARROW = '"Bahnschrift SemiCondensed", Bahnschrift, "Arial Narrow", "Roboto Condensed", "DejaVu Sans Condensed", Arial, sans-serif';
const ROUND = '"Arial Rounded MT Bold", "Bahnschrift", "Segoe UI", Arial, sans-serif';
const HEAVY = 'Impact, "Arial Black", "Segoe UI Black", "DejaVu Sans", sans-serif';
const line = (id, name, glyph, gap, height, family = NARROW, extra = {}) => ({ id, name, dots: 'line', glyph, gap, height, family, weight: 400, ...extra });
const edge = (id, name, glyph, gap, height, extra = {}) => ({ id, name, dots: 'outline', glyph, gap, height, family: HEAVY, weight: 400, ...extra });
export const TEXT_ART_STYLES = Object.freeze([
  // Dot styles first: they write any language, Cyrillic too.
  line('dots-bold', 'Жирные точки', '•', 1.7, 17),
  line('dots', 'Точки', '•', 3.6, 22),
  line('dots-thin', 'Тонкие точки', '·', 2.1, 17),
  line('dots-round', 'Круглые точки', '•', 2.6, 26, ROUND),
  line('stars', 'Звёздочки', '*', 5.5, 34),
  line('pluses', 'Плюсики', '+', 6, 34),
  line('hashes', 'Решётки', '#', 6, 34),
  line('rings', 'Колечки', 'O', 11.5, 56),
  edge('dots-outline', 'Контур точками', '•', 4.5, 40),
  edge('dots-italic', 'Контур, курсив', '.', 4, 40, { italic: true }),
  edge('outline-thin', 'Контур тонкий', '·', 2.6, 34),
  { id: 'dots-fill', name: 'Заливка точками', dots: 'fill', glyph: '•', gap: 3.2, height: 30, family: HEAVY, weight: 400 },
  { id: 'pixel', name: 'Пиксели', pixel: true },
  figletStyle('standard', 'Standard', 'Standard'),
  figletStyle('slant', 'Slant', 'Slant'),
  figletStyle('big', 'Big', 'Big'),
  figletStyle('doom', 'Doom', 'Doom'),
  figletStyle('banner', 'Banner', 'Banner', { cyrillic: true }),
  figletStyle('graceful', 'Graceful', 'Graceful', { cyrillic: true }),
  figletStyle('starwars', 'Star Wars', 'Star Wars'),
  figletStyle('epic', 'Epic', 'Epic'),
  figletStyle('alligator', 'Alligator', 'Alligator2'),
  figletStyle('larry3d', 'Larry 3D', 'Larry 3D'),
  figletStyle('3d', '3D', '3D-ASCII'),
  figletStyle('graffiti', 'Graffiti', 'Graffiti'),
  figletStyle('money', 'Big Money', 'Big Money-ne'),
  figletStyle('merlin', 'Merlin', 'Merlin1'),
  figletStyle('fire', 'Fire', 'Fire Font-k'),
  figletStyle('modular', 'Modular', 'Modular'),
  figletStyle('rounded', 'Rounded', 'Rounded'),
  figletStyle('speed', 'Speed', 'Speed'),
  figletStyle('ogre', 'Ogre', 'Ogre'),
  figletStyle('fender', 'Fender', 'Fender'),
  figletStyle('shadow', 'Shadow', 'Shadow'),
  figletStyle('small', 'Small', 'Small'),
  figletStyle('small-slant', 'Small Slant', 'Small Slant'),
  figletStyle('small-shadow', 'Small Shadow', 'Small Shadow'),
  figletStyle('rectangles', 'Rectangles', 'Rectangles'),
  figletStyle('cyberlarge', 'Cyberlarge', 'Cyberlarge')
].map((style) => (style.dots || style.pixel ? { ...style, cyrillic: true, sized: true } : style)));

let loading = null;
// Parses every FIGlet font once; the dialog calls it when it opens (about 90 KB gzipped in all).
export function loadTextArtFonts() {
  loading ||= Promise.all(TEXT_ART_STYLES.filter((style) => style.font).map(async (style) => {
    figlet.parseFont(style.font, (await style.load()).default);
  }));
  return loading;
}

// Whether the font has every letter of the text: figlet.js silently leaves out the ones it lacks.
const known = new Map();
function hasGlyph(font, char) {
  const key = `${font}\u0000${char}`;
  if (!known.has(key)) known.set(key, figlet.textSync(char, { font }).trim().length > 0);
  return known.get(key);
}

const clean = (art) => {
  const lines = art.split('\n').map((line) => line.replace(/\s+$/u, ''));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines.at(-1)) lines.pop();
  const indent = Math.min(...lines.filter(Boolean).map((line) => line.match(/^ */u)[0].length));
  return lines.map((line) => line.slice(indent)).join('\n');
};

// Dota draws nothing for «_» (checked in the game, symbol test 29.09.2026) and Radiance's «`» is empty
// too, yet FIGlet letters are mostly underscores: an en dash and a left quote stand in for them.
export const TEXT_ART_STAND_IN = Object.freeze({ _: '–', '`': '‘' });
// Where a glyph sits in its cell, as in a terminal; everything else in the middle.
export const TEXT_ART_ROLE = Object.freeze({ '–': 'bottom', '.': 'bottom', ',': 'bottom', "'": 'top', '"': 'top', '‘': 'top', '^': 'top' });

// A grid art (lines of symbols) as a result: each glyph's cell and role.
function gridResult(art) {
  const lines = art.split('\n'), glyphs = [];
  lines.forEach((text, row) => Array.from(text).forEach((ch, col) => {
    if (/\s/u.test(ch)) return;
    const shown = TEXT_ART_STAND_IN[ch] || ch;
    glyphs.push({ ch: shown, cx: (col + 0.5) * TEXT_ART_CELL.w, cell: { top: row * TEXT_ART_CELL.h, role: TEXT_ART_ROLE[shown] || 'middle' } });
  }));
  return { art, glyphs, w: Math.max(...lines.map((text) => Array.from(text).length)) * TEXT_ART_CELL.w, h: lines.length * TEXT_ART_CELL.h };
}

// ---------------------------------------------------------------- the text as a bitmap
// The text drawn into a bitmap, `scale` pixels per canvas unit, capitals `height` units high (≈ 0.7 of
// the font size), with a one-pixel empty border. `canvas(width, height)` gives a 2D canvas (the
// browser's, or @napi-rs/canvas in tests). Returns { a: Float32Array coverage 0…1, w, h } in pixels.
function raster(text, { family, weight = 400, italic = false, height }, scale, canvas, stretch = 1) {
  const lines = text.split('\n'), size = (height / 0.7) * scale, font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
  const probe = canvas(1, 1).getContext('2d'); probe.font = font;
  const step = Math.round(size * 1.25), pad = Math.ceil(size * 0.3) + 1;
  const w = Math.min(Math.ceil(Math.max(...lines.map((text) => probe.measureText(text).width)) * stretch) + pad * 2, 4800);
  const h = step * lines.length + pad * 2;
  const board = canvas(w, h), ctx = board.getContext('2d', { willReadFrequently: true });
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000';
  if (stretch !== 1) ctx.scale(stretch, 1);
  lines.forEach((text, i) => ctx.fillText(text, pad / stretch, pad + i * step + size * 0.9));
  const data = ctx.getImageData(0, 0, w, h).data, a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3] / 255;
  return { a, w, h };
}

// Zhang–Suen thinning of the ink (coverage over a half): its one-pixel centre line.
function thin({ a, w, h }) {
  const p = new Uint8Array(w * h);
  for (let i = 0; i < p.length; i++) p[i] = a[i] > 0.5 ? 1 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : p[y * w + x]);
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      const clear = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (!p[y * w + x]) continue;
        const n = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const b = n[0] + n[1] + n[2] + n[3] + n[4] + n[5] + n[6] + n[7];
        if (b < 2 || b > 6) continue;
        let t = 0; for (let i = 0; i < 8; i++) if (!n[i] && n[(i + 1) % 8]) t++;
        if (t !== 1 || (pass === 0 ? n[0] * n[2] * n[4] || n[2] * n[4] * n[6] : n[0] * n[2] * n[6] || n[0] * n[4] * n[6])) continue;
        clear.push(y * w + x);
      }
      for (const i of clear) p[i] = 0;
      if (clear.length) changed = true;
    }
  }
  return { p, w, h };
}

// The centre line as polylines: from every end or fork to the next, then the closed loops («o»). A
// diagonal step counts only where no straight step joins the same pixels, so a staircase is a line,
// not a chain of forks.
function centreLines({ p, w, h }) {
  const around = (i) => {
    const x = i % w, y = (i - x) / w, out = [];
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (p[i + dy * w + dx]) out.push(i + dy * w + dx);
    for (const [dx, dy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) if (p[i + dy * w + dx] && !p[i + dx] && !p[i + dy * w]) out.push(i + dy * w + dx);
    return x > 0 && y > 0 && x < w - 1 && y < h - 1 ? out : [];
  };
  const next = new Map(), seen = new Set(), paths = [], key = (i, j) => (i < j ? `${i},${j}` : `${j},${i}`);
  for (let i = 0; i < p.length; i++) if (p[i]) next.set(i, around(i));
  const walk = (from, to) => {
    const path = [from, to]; seen.add(key(from, to));
    for (let prev = from, cur = to; next.get(cur).length === 2;) {
      const step = next.get(cur).find((j) => j !== prev);
      if (seen.has(key(cur, step))) break;
      seen.add(key(cur, step)); path.push(step); prev = cur; cur = step;
      if (step === from) break;
    }
    return path;
  };
  for (const [i, links] of next) if (links.length !== 2) for (const j of links) if (!seen.has(key(i, j))) paths.push({ path: walk(i, j), ends: true });
  for (const [i, links] of next) if (links.length === 2 && !seen.has(key(i, links[0]))) paths.push({ path: walk(i, links[0]), loop: true });
  // A lone pixel is a dot of its own: the point over «i», «ё», a full stop.
  for (const [i, links] of next) if (!links.length) paths.push({ path: [i], dot: true });
  const degree = (i) => next.get(i)?.length || 0;
  return paths.map(({ path, loop, dot }) => ({ points: path.map((i) => [i % w, Math.floor(i / w)]), loop: !!loop, dot: !!dot, free: [degree(path[0]) === 1, degree(path.at(-1)) === 1] }));
}

// Contours of the letters at half coverage (marching squares, interpolated): smooth closed outlines.
// Edge ids: 2 × pixel for the edge to the right of a pixel, 2 × pixel + 1 for the edge below it.
function outlines({ a, w, h }) {
  const lit = (i) => a[i] > 0.5, coord = (id) => {
    const i = id >> 1, x = i % w, y = (i - x) / w;
    if (id & 1) { const t = (0.5 - a[i]) / (a[i + w] - a[i]); return [x, y + t]; }
    const t = (0.5 - a[i]) / (a[i + 1] - a[i]); return [x + t, y];
  };
  const one = new Int32Array(w * h * 2).fill(-1), two = new Int32Array(w * h * 2).fill(-1), from = [], to = [];
  const link = (id, seg) => { if (one[id] < 0) one[id] = seg; else two[id] = seg; };
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x, c = (lit(i) ? 8 : 0) | (lit(i + 1) ? 4 : 0) | (lit(i + w + 1) ? 2 : 0) | (lit(i + w) ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const top = i * 2, bottom = (i + w) * 2, left = i * 2 + 1, right = (i + 1) * 2 + 1;
    const middle = (a[i] + a[i + 1] + a[i + w + 1] + a[i + w]) / 4 > 0.5;
    const pairs = { 1: [left, bottom], 2: [bottom, right], 3: [left, right], 4: [top, right], 5: middle ? [left, top, bottom, right] : [left, bottom, top, right],
      6: [top, bottom], 7: [left, top], 8: [left, top], 9: [top, bottom], 10: middle ? [top, right, left, bottom] : [left, top, bottom, right],
      11: [top, right], 12: [left, right], 13: [bottom, right], 14: [left, bottom] }[c];
    for (let k = 0; k < pairs.length; k += 2) { const seg = from.length; from.push(pairs[k]); to.push(pairs[k + 1]); link(pairs[k], seg); link(pairs[k + 1], seg); }
  }
  const used = new Uint8Array(from.length), loops = [];
  for (let start = 0; start < from.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const ids = [from[start]];
    for (let at = to[start], guard = 0; guard < from.length; guard++) {
      ids.push(at);
      const seg = !used[one[at]] && one[at] >= 0 ? one[at] : !used[two[at]] && two[at] >= 0 ? two[at] : -1;
      if (seg < 0) break;
      used[seg] = 1; at = from[seg] === at ? to[seg] : from[seg];
    }
    loops.push({ points: ids.map(coord), loop: true, free: [false, false] });
  }
  return loops;
}

// A polyline smoothed by a moving average (ends of open lines stay), then cut into steps `step` apart
// along its length: an open line keeps both ends, a loop gets an even ring.
function smooth(points, loop, radius) {
  const n = points.length; if (n < 3) return points;
  return points.map((p, i) => {
    if (!loop && (i === 0 || i === n - 1)) return p;
    let sx = 0, sy = 0, k = 0;
    for (let d = -radius; d <= radius; d++) { const j = loop ? (i + d + n) % n : Math.min(n - 1, Math.max(0, i + d)); sx += points[j][0]; sy += points[j][1]; k++; }
    return [sx / k, sy / k];
  });
}
function along(points, loop, step) {
  const pts = loop ? [...points, points[0]] : points, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = cum.at(-1); if (!length) return [points[0]];
  const count = loop ? Math.max(3, Math.round(length / step)) : Math.max(1, Math.round(length / step)), out = [];
  for (let k = 0, i = 1; k <= (loop ? count - 1 : count); k++) {
    const at = (length * k) / count;
    while (i < pts.length - 1 && cum[i] < at) i++;
    const t = (at - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
  }
  return out;
}

// Symbols along the lines, `gap` units apart, longest lines first; a symbol closer than 0.6 gap to one
// already set is left out, so forks and joints do not clump.
function placeAlong(lines, scale, gap) {
  const cells = new Map(), points = [], near = 0.6 * gap, cell = (x, y) => `${Math.floor(x / near)},${Math.floor(y / near)}`;
  const free = (x, y) => {
    const gx = Math.floor(x / near), gy = Math.floor(y / near);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const q of cells.get(`${gx + dx},${gy + dy}`) || []) if (Math.hypot(q.x - x, q.y - y) < near) return false;
    return true;
  };
  const add = (x, y) => { const point = { x, y }; points.push(point); const k = cell(x, y); cells.has(k) ? cells.get(k).push(point) : cells.set(k, [point]); };
  const sized = lines.map((l) => ({ ...l, units: l.points.map(([x, y]) => [x / scale, y / scale]) }))
    .map((l) => ({ ...l, length: l.units.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l.units[i - 1][0], p[1] - l.units[i - 1][1]) : 0), 0) }))
    .sort((a, b) => b.length - a.length);
  for (const l of sized) for (const [x, y] of along(l.units, l.loop, gap)) {
    if (free(x, y)) add(x, y);
    if (points.length > TEXT_ART_LIMITS.dots) return null;
  }
  return points;
}

// Small separate blobs (the point over «i», «ё», a full stop) which thinning wiped out entirely — it
// clears a 2 × 2 square — come back as a dot at their middle.
function lostSpots({ a, w, h }, { p }) {
  const label = new Int32Array(w * h).fill(-1), spots = [];
  for (let start = 0; start < a.length; start++) {
    if (a[start] <= 0.5 || label[start] >= 0) continue;
    const id = spots.length, queue = [start]; let sx = 0, sy = 0, n = 0, kept = false;
    label[start] = id;
    while (queue.length) {
      const i = queue.pop(), x = i % w, y = (i - x) / w; sx += x; sy += y; n++; if (p[i]) kept = true;
      for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < a.length && a[j] > 0.5 && label[j] < 0) { label[j] = id; queue.push(j); }
    }
    spots.push({ x: sx / n, y: sy / n, kept });
  }
  return spots.filter((spot) => !spot.kept).map((spot) => ({ points: [[spot.x, spot.y]], loop: false, dot: true, free: [true, true] }));
}

// Spurs: short lines from a free end into a fork, which thinning leaves at corners and stroke ends.
const trimSpurs = (lines, limit) => lines.filter((l) => l.loop || l.dot || !(l.free[0] !== l.free[1] && l.points.length < limit));

function dotsOf(text, style, canvas, scale) {
  const height = style.height * scale;
  if (style.dots === 'line') {
    const k = Math.max(2, Math.min(6, 90 / height)), bmp = raster(text, { ...style, height }, k, canvas), skeleton = thin(bmp);
    const lines = [...trimSpurs(centreLines(skeleton), height * k * 0.22), ...lostSpots(bmp, skeleton)].map((l) => ({ ...l, points: smooth(l.points, l.loop, Math.round(k * 0.8)) }));
    return placeAlong(lines, k, style.gap);
  }
  const k = Math.max(1.5, Math.min(4, 120 / height)), bmp = raster(text, { ...style, height }, k, canvas);
  const rings = outlines(bmp).filter((l) => l.points.length > 3).map((l) => ({ ...l, points: smooth(l.points, true, 2) }));
  const edgeDots = placeAlong(rings, k, style.gap);
  if (!edgeDots || style.dots === 'outline') return edgeDots;
  // Fill: the outline, then a lattice inside, rows offset by half a step, away from the outline.
  const out = [...edgeDots], gap = style.gap, near = new Map();
  for (const q of edgeDots) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const k = `${Math.round(q.x / gap) + dx},${Math.round(q.y / gap) + dy}`; near.has(k) ? near.get(k).push(q) : near.set(k, [q]);
  }
  for (let row = 0, y = gap; y * k < bmp.h; row++, y += gap * 0.87)
    for (let x = row % 2 ? gap * 1.5 : gap; x * k < bmp.w; x += gap) {
      if (bmp.a[Math.floor(y * k) * bmp.w + Math.floor(x * k)] < 0.5) continue;
      if ((near.get(`${Math.round(x / gap)},${Math.round(y / gap)}`) || []).some((q) => Math.hypot(q.x - x, q.y - y) < gap * 0.8)) continue;
      out.push({ x, y });
      if (out.length > TEXT_ART_LIMITS.dots) return null;
    }
  return out;
}

function dotResult(points, glyph) {
  if (!points?.length) return null;
  const minX = Math.min(...points.map((p) => p.x)), minY = Math.min(...points.map((p) => p.y)), pad = 3;
  const glyphs = points.map((p) => ({ ch: glyph, cx: p.x - minX + pad, cy: p.y - minY + pad }));
  return { glyphs, w: Math.max(...glyphs.map((g) => g.cx)) + pad, h: Math.max(...glyphs.map((g) => g.cy)) + pad };
}

// Pixel letters: the text about 8 pixels high (× `scale`), drawn twice as wide (a cell is about twice
// as high as it is wide), # where the letters are.
function pixelArt(text, canvas, scale) {
  const { a, w, h } = raster(text, { family: 'Arial, "Segoe UI", sans-serif', weight: 700, height: 5.6 * scale }, 1, canvas, 2), rows = [];
  for (let y = 0; y < h; y++) { let row = ''; for (let x = 0; x < w; x++) row += a[y * w + x] > 0.45 ? '#' : ' '; rows.push(row); }
  const art = clean(rows.join('\n'));
  return art.trim() ? gridResult(art) : null;
}

// The text in `style` at `scale` (dot styles and «Пиксели»; FIGlet sizes are their own) — { glyphs, w,
// h, art? } in canvas units from its top left: a glyph has its ink's middle across (cx) and either its
// cell (grid styles) or its ink's middle down (cy, dot styles) — or null when the style cannot write it.
export function renderTextArt(text, style, { canvas = null, scale = 1 } = {}) {
  const value = String(text).replace(/\r/g, '').slice(0, TEXT_ART_LIMITS.text).replace(/\t/g, ' ').replace(/\s+$/u, '');
  if (!value.trim()) return null;
  const size = Math.min(TEXT_ART_LIMITS.scale[1], Math.max(TEXT_ART_LIMITS.scale[0], scale));
  if (style.pixel) return canvas ? pixelArt(value, canvas, size) : null;
  if (style.dots) return canvas ? dotResult(dotsOf(value, style, canvas, size), style.glyph) : null;
  if (!style.cyrillic && /\p{Script=Cyrillic}/u.test(value)) return null;
  if ([...new Set(value.replace(/\s/gu, ''))].some((char) => !hasGlyph(style.font, char))) return null;
  const art = clean(figlet.textSync(value, { font: style.font, width: TEXT_ART_LIMITS.columns, whitespaceBreak: true }));
  return art.trim() ? gridResult(art) : null;
}

// Symbols for the canvas, the result centred on the canvas (or at its top left when it is bigger).
// `ink(char)` is the glyph's ink box from its category origin (dota-rendering measureCategoryInk).
export function placeTextArt(result, canvasSize, ink) {
  const left = Math.max(0, (canvasSize.w - result.w) / 2), top = Math.max(0, (canvasSize.h - result.h) / 2);
  return result.glyphs.map((g) => {
    const box = ink(g.ch);
    let y;
    if (g.cell) {
      const { top: cellTop, role } = g.cell, H = TEXT_ART_CELL.h;
      y = role === 'bottom' ? cellTop + H - (box.y + box.h) : role === 'top' ? cellTop - box.y : cellTop + H / 2 - box.y - box.h / 2;
    } else y = g.cy - box.y - box.h / 2;
    return { type: 'symbol', text: g.ch, name: g.ch, x: +(left + g.cx - box.x - box.w / 2).toFixed(3), y: +(top + y).toFixed(3), w: 30, h: 30 };
  });
}

// Dota categories of the placed symbols once the download joins them into rows (core.mjs
// pickSafeCategories with `widths(line)` = dota-rendering glyphWidths).
export function textArtCategories(items, pickSafe, widths) {
  return pickSafe(items.map((item) => ({ category_name: item.text, x_position: item.x, y_position: item.y, width: item.w, height: item.h, hero_ids: [] })), widths).length;
}
