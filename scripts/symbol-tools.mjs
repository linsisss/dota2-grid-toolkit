import C from './core.mjs';
import { DOTA } from './dota-rendering.mjs';

export const MAX_BRUSH_CHARS = 1000;
const names = [
  ['.·:;•◉○●☉', 'точка точки круг круги dot circle'],
  ['★☆✪', 'звезда звезды star'], ['♡', 'сердце heart'],
  ['←↑→↓⇒⇔', 'стрелка стрелки arrow'], ['■□', 'квадрат square'],
  ['▲△▼▽', 'треугольник triangle'], ['◆◇', 'ромб diamond'],
  ['♩♪♫♬♭♯', 'ноты музыка music'], ['♤♧', 'карты card'],
  ['☉☼', 'солнце sun'], ['#', 'решетка хеш hash'], ['*', 'звездочка asterisk'],
  ['✦✧✩✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾', 'звезда звезды искра star sparkle'],
  ['✿❀❁❂❃❊❋', 'цветок цветы flower'], ['❄❅❆', 'снежинка снег snow'],
  ['♠♣♥♦♢❤❥❦❧', 'карты масть сердце card heart'], ['✓✔☑', 'галочка check'], ['✕✖✗✘☒', 'крестик cross'],
  ['✝✞✟✠☦☨', 'крест cross'], ['☠', 'череп skull'], ['☯', 'инь янь yin yang'],
  ['♔♕♖♗♘♙♚♛♜♝♞♟', 'шахматы chess'], ['☀☁☂☃☽☾', 'погода солнце луна weather moon'],
  ['⚔', 'меч мечи sword'], ['⚡', 'молния lightning'], ['∞', 'бесконечность infinity'],
  ['😀😂🐱☺', 'эмодзи смайл лицо emoji smile']
];
export function searchSymbols(library, query = '', category = Object.keys(library)[0]) {
  const q = query.trim().toLowerCase();
  if (!q) return Array.from(library[category] || '');
  const code = /^(?:u\+|0x)([0-9a-f]{2,6})$/i.exec(q);
  return [...new Set(Object.entries(library).flatMap(([name, chars]) =>
    Array.from(chars).filter((ch) => code ? ch.codePointAt(0) === parseInt(code[1], 16) :
      ch.toLowerCase() === q || name.toLowerCase().includes(q) ||
      names.some(([glyphs, label]) => glyphs.includes(ch) && label.includes(q)))))];
}
export const symbols = (value) => [
  ...new Set(Array.from(value || '').filter((ch) => !/\s/u.test(ch)))
];
export function categorySelection(value, category) {
  const chosen = new Set(symbols(value)),
    chars = symbols(category);
  const count = chars.filter((ch) => chosen.has(ch)).length;
  return {
    all: !!chars.length && count === chars.length,
    partial: count > 0 && count < chars.length
  };
}
export function toggleCategory(value, category, checked) {
  const chars = symbols(category),
    set = new Set(chars);
  return checked
    ? value + chars.filter((ch) => !value.includes(ch)).join('')
    : Array.from(value)
        .filter((ch) => !set.has(ch))
        .join('');
}
export function toggleSymbol(value, char) {
  return value.includes(char)
    ? Array.from(value)
        .filter((ch) => ch !== char)
        .join('')
    : value + char;
}
export function rememberSymbols(recent, used) {
  // Newest first, unique, at most eight. Unicode symbols are never split into UTF-16 halves.
  let result = [...recent];
  for (const ch of Array.from(used || '').filter((ch) => !/\s/u.test(ch)))
    result = [ch, ...result.filter((old) => old !== ch)].slice(0, 8);
  return result;
}
export function pickSymbol(doc, point, measure) {
  for (const layer of [...doc.layers].reverse()) {
    if (!layer.visible) continue;
    for (const item of [...doc.entities].reverse()) {
      if (item.layer !== layer.id || item.type === 'heroes') continue;
      let hit = null,
        distance = Infinity;
      for (const glyph of C.textGlyphs(item, true)) {
        if (/\s/u.test(glyph.text)) continue;
        const width = Math.max(
          4,
          measure(glyph.text).advances.reduce((a, b) => a + b, 0)
        );
        const x = glyph.x + DOTA.listPadding,
          y = glyph.y;
        if (
          point.x < x - 3 ||
          point.x > x + width + 3 ||
          point.y < y - 3 ||
          point.y > y + DOTA.header + 3
        )
          continue;
        const d = Math.hypot(point.x - x - width / 2, point.y - y - DOTA.fontSize / 2);
        if (d < distance) {
          hit = glyph.text;
          distance = d;
        }
      }
      if (hit) return hit;
    }
  }
  return null;
}
