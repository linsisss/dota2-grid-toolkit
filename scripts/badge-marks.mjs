// How a profile badge looks (scripts/profile-badges.mjs): «Медали Dota», picked by the owner on 2026-10-18
// from four hand-drawn directions (mockups: dev /mockups/badges/v2/). Small struck medallions in the spirit
// of Dota's rank medals and Crownfall seals, each with its own silhouette — Разработчик: a gold octagon
// with lilac enamel; Модератор: a silver shield; Ловец багов: a milled bronze coin; Автор идей: a silver
// star; Поддержавший: a wax seal; 100 лайков: a bronze medal on a ribbon; 500 лайков: a gold one in a
// laurel wreath; Dotadle: a silver diamond «7», a crowned gold diamond «21». Bronze, silver and gold by
// tier, engravings with a light lower lip so they read as cut into the metal. The numbers are our own
// paths (no font needed, so the server's link preview draws them too). Drawn on a 32-unit square, crisp
// from 18 px. Shared by the pages (src/catalog/BadgeMark.jsx) and the server (server/link-preview.mjs).
const f = (n) => +n.toFixed(2);
const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
// A star or a milled edge: `n` points between radii r1 and r2.
const ring = (n, r1, r2) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? r2 : r1; return [16 + r * Math.cos(a), 16 + r * Math.sin(a)]; }));
// A wax seal's wavy edge.
const blob = (n, r, amp) => poly(Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2, k = r + amp * Math.cos(n * a) + 0.35 * Math.sin(3 * a + 1); return [16 + k * Math.cos(a), 16 + k * Math.sin(a)]; }));
const circle = (cx, cy, r) => `M${cx} ${f(cy - r)}A${r} ${r} 0 1 1 ${f(cx - 0.01)} ${f(cy - r)}Z`;

// The gradients a medal uses; each drawing gets its own ids (`uid`), so many on one page never clash.
const GRADIENTS = {
  bronze: ['0 0 1 1', [[0, '#f1c08f'], [0.45, '#b8743f'], [1, '#6b3a1d']]], bronzeFace: ['0 0 1 1', [[0, '#8a5129'], [1, '#c98a55']]],
  silver: ['0 0 1 1', [[0, '#ffffff'], [0.45, '#b9c0cc'], [1, '#6c7383']]], silverFace: ['0 0 1 1', [[0, '#8e96a6'], [1, '#d5dae3']]],
  gold: ['0 0 1 1', [[0, '#fff0b8'], [0.45, '#e2ac44'], [1, '#8e5f16']]], goldFace: ['0 0 1 1', [[0, '#b9821f'], [1, '#f0c766']]],
  lilac: ['0 0 1 1', [[0, '#5b4596'], [1, '#9f8ae0']]], slate: ['0 0 1 1', [[0, '#2d3e5e'], [1, '#5f7cab']]],
  teal: ['0 0 1 1', [[0, '#1d4746'], [1, '#3f8a83']]], crimson: ['0 0 1 1', [[0, '#5e1424'], [1, '#a8344a']]],
  ribbon: ['0 0 0 1', [[0, '#6d5aa6'], [1, '#43356f']]], ribbonRose: ['0 0 0 1', [[0, '#b8576f'], [1, '#76304a']]],
  wax: ['radial', [[0, '#e0687c'], [0.55, '#a92c45'], [1, '#5e1222']]],
};
function gradientDef(uid, name) {
  const [box, stops] = GRADIENTS[name], s = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  if (box === 'radial') return `<radialGradient id="${uid}-${name}" cx=".38" cy=".32" r=".75">${s}</radialGradient>`;
  const [x1, y1, x2, y2] = box.split(' ');
  return `<linearGradient id="${uid}-${name}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
}

// An engraving: the cut in a dark tone with a light lower lip (a stroke, or a filled shape).
const cut = (d, dark, w = 2, lip = 'rgba(255,255,255,.42)') => `<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${w}"><path d="${d}" stroke="${lip}" transform="translate(0 .7)"/><path d="${d}" stroke="${dark}"/></g>`;
const cutFill = (d, dark, lip = 'rgba(255,255,255,.4)', move = '') => `<g${move ? ` transform="${move}"` : ''}><path d="${d}" fill="${lip}" transform="translate(0 .7)"/><path d="${d}" fill="${dark}"/></g>`;
// Its shadow on the page, then the rim, then the face inset with a thin seam.
const shade = (d) => `<path d="${d}" fill="#000" opacity=".45" transform="translate(0 1.1)"/>`;
const struck = (g, rim, face, metal, faceFill) => `${shade(rim)}<path d="${rim}" fill="${g(metal)}"/><path d="${face}" fill="${faceFill}" stroke="#00000055" stroke-width=".8"/>`;

// Digits on a 10-unit-tall em (a flared, Dota-like serif), drawn as paths: «7», «2», «1».
const DIGITS = {
  7: [7, 'M.4 0H7V1.7L3.9 10H1.6L4.8 1.9H1.9L1.5 2.9H.4Z'],
  2: [6.8, 'M.7 2.9C.9 1.1 2.2 0 3.7 0C5.4 0 6.5 1.1 6.5 2.7C6.5 4.2 5.5 5.3 4 6.6L2.7 7.9H6.8V10H.4V8.6L3.2 5.9C4 5.1 4.3 4.3 4.3 3.2C4.3 2.4 3.9 1.9 3.4 1.9C2.8 1.9 2.4 2.4 2.4 3.5Z'],
  1: [5, 'M.6 1.6L3 0H4.1V8.3H5V10H.9V8.3H1.9V2.6L.6 3.2Z'],
};
// `text` centred on x, its baseline at y, `height` tall.
function number(text, x, y, height, fill, lip) {
  const k = height / 10, gap = 0.6, widths = [...text].map((c) => DIGITS[c][0]), total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let at = x - (total * k) / 2, d = '';
  [...text].forEach((c, i) => { d += `<path d="${DIGITS[c][1]}" transform="translate(${f(at)} ${f(y - height)}) scale(${f(k)})"/>`; at += (widths[i] + gap) * k; });
  return `<g fill="${lip}" transform="translate(0 .7)">${d}</g><g fill="${fill}">${d}</g>`;
}

const HEART = 'M16 22.2C10.2 18.6 10.4 13.2 13.4 13.2C14.8 13.2 15.6 14.1 16 15C16.4 14.1 17.2 13.2 18.6 13.2C21.6 13.2 21.8 18.6 16 22.2Z';
const MEDALS = {
  developer: (g) => struck(g, 'M10 1.5H22L30.5 10V22L22 30.5H10L1.5 22V10Z', 'M11.3 5H20.7L27 11.3V20.7L20.7 27H11.3L5 20.7V11.3Z', 'gold', g('lilac'))
    + cut('M12.4 12.2L8.8 16L12.4 19.8M19.6 12.2L23.2 16L19.6 19.8M17.4 10.6L14.6 21.4', '#ffe7a8', 2.2, 'rgba(30,16,60,.55)'),
  moderator: (g) => struck(g, 'M16 1.5L28.5 5.5V15C28.5 23 23 28 16 30.8C9 28 3.5 23 3.5 15V5.5Z', 'M16 4.7L25.5 7.8V15C25.5 21.2 21.4 25.2 16 27.5C10.6 25.2 6.5 21.2 6.5 15V7.8Z', 'silver', g('slate'))
    + cut('M10.8 15.6L14.6 19.4L21.4 11.6', '#eef3fb', 2.6, 'rgba(0,0,0,.45)'),
  bughunter: (g) => struck(g, ring(20, 15.2, 13.6), circle(16, 16, 11.4), 'bronze', g('bronzeFace'))
    + '<circle cx="16" cy="16" r="9.6" fill="none" stroke="#5a3218" stroke-width=".6" opacity=".6"/>'
    + cutFill('M16 12.4C19 12.4 20 15 20 17.4C20 20.4 18.2 22.4 16 22.4C13.8 22.4 12 20.4 12 17.4C12 15 13 12.4 16 12.4Z', '#4a2812')
    + cutFill(circle(16, 11.3, 1.9), '#4a2812')
    + cut('M12.4 15L9.6 13.4M12 17.8H9.2M12.6 20.4L10 22.4M19.6 15L22.4 13.4M20 17.8H22.8M19.4 20.4L22 22.4', '#4a2812', 1.3)
    + '<path d="M16 13V22" stroke="#c98a55" stroke-width=".8"/>',
  idea: (g) => struck(g, ring(8, 15.6, 11.2), circle(16, 16, 8.6), 'silver', g('silverFace'))
    + cutFill('M16 10.6C19.4 10.6 21.2 12.9 21.2 15.4C21.2 17.4 20 18.4 19 19.4V20.6H13V19.4C12 18.4 10.8 17.4 10.8 15.4C10.8 12.9 12.6 10.6 16 10.6Z', '#4d5566')
    + cut('M13.6 22.6H18.4', '#4d5566', 1.5) + '<path d="M14.2 13.4C14.6 12.8 15.2 12.5 15.9 12.4" stroke="#fff6d0" stroke-width="1.1" stroke-linecap="round" fill="none"/>',
  sponsor: (g) => { const seal = blob(9, 13.8, 0.9);
    return `${shade(seal)}<path d="${seal}" fill="${g('wax')}"/><circle cx="16" cy="16" r="9.4" fill="none" stroke="#5e1222" stroke-width="1.1" opacity=".8"/><circle cx="16" cy="16.6" r="9.4" fill="none" stroke="#f08a9c" stroke-width=".6" opacity=".35"/>`
      + `<path d="${HEART}" fill="#f08a9c" opacity=".45" transform="translate(0 .7)"/><path d="${HEART}" fill="#6a1527"/><path d="M8.6 9.4C10 7.8 12 6.8 14 6.5" stroke="#ffd0d8" stroke-width="1" stroke-linecap="round" fill="none" opacity=".55"/>`; },
  likes100: (g) => `<path d="M11 18L7.6 30.5L10.8 28.6L12.8 31L15.6 20ZM21 18L24.4 30.5L21.2 28.6L19.2 31L16.4 20Z" fill="${g('ribbonRose')}"/>`
    + struck(g, circle(16, 13.4, 11.6), circle(16, 13.4, 8.6), 'bronze', g('bronzeFace')) + cutFill(HEART, '#4a2812', undefined, 'translate(0 -2.6)'),
  likes500: (g) => { let leaves = '';
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) { const t = 90 + side * (30 + i * 21), x = 16 + 12.4 * Math.cos((t * Math.PI) / 180), y = 14 + 12.4 * Math.sin((t * Math.PI) / 180);
      leaves += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="1.15" ry="2.5" transform="rotate(${f(t + side * 28)} ${f(x)} ${f(y)})" fill="#dcaa45" stroke="#6b4510" stroke-width=".35"/>`; }
    return `<path d="M11.4 19L8 31L11.2 29.2L13.2 31.5L15.8 21ZM20.6 19L24 31L20.8 29.2L18.8 31.5L16.2 21Z" fill="${g('ribbon')}"/>${leaves}`
      + struck(g, circle(16, 14, 10.6), circle(16, 14, 7.8), 'gold', g('goldFace')) + cutFill(HEART, '#7a1e34', 'rgba(255,240,200,.55)', 'translate(16 14) scale(.9) translate(-16 -17.6)'); },
  dotadle7: (g) => struck(g, 'M16 1.2L30.8 16L16 30.8L1.2 16Z', 'M16 5.2L26.8 16L16 26.8L5.2 16Z', 'silver', g('teal')) + number('7', 16.2, 21, 10.4, '#e9eef5', 'rgba(0,0,0,.4)'),
  dotadle21: (g) => { const crown = 'M8.6 8.6L9.8 2.4L13 5.8L16 .8L19 5.8L22.2 2.4L23.4 8.6Z';
    return struck(g, 'M16 6.4L28.6 19L16 31.6L3.4 19Z', 'M16 10.2L24.8 19L16 27.8L7.2 19Z', 'gold', g('crimson'))
      + `${shade(crown)}<path d="${crown}" fill="${g('gold')}" stroke="#6b4510" stroke-width=".45"/><circle cx="16" cy="5.6" r="1" fill="#c43a52"/>` + number('21', 16, 22.6, 7, '#ffe39a', 'rgba(0,0,0,.45)'); },
};

// The inside of a medal's 32-unit SVG, with its own gradients (ids start with `uid`). The markup is our
// own constants and numbers, so it is safe to set as HTML.
export function badgeMarkInner(badge, uid = 'bm') {
  const used = new Set(), g = (name) => { used.add(name); return `url(#${uid}-${name})`; };
  const body = (MEDALS[badge.id] || MEDALS.idea)(g);
  return `<defs>${[...used].map((name) => gradientDef(uid, name)).join('')}</defs>${body}`;
}
// The whole medal as an SVG file (the server's link preview, scripts).
export const badgeMarkSVG = (badge, size = 24, uid = `bm-${badge.id}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" overflow="visible">${badgeMarkInner(badge, uid)}</svg>`;
export const BADGE_MEDALS = Object.freeze(Object.keys(MEDALS));
