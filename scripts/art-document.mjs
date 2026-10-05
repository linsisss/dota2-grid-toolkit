import { artLines } from './ascii-library.mjs';
import { catalogText } from './catalog-document.mjs';
import { invisibleWarning } from './dota-rendering.mjs';

// Player-submitted ready-made arts: the same text format as data/ascii-arts.json,
// validated by the same rules in the submission form and on the server.
// «18+» (asked for on 2026-10-04) blurs the art in the editor's library until the viewer confirms their
// age, as for grids and backgrounds (src/AsciiLibrary.jsx). «Рамки» since 2026-10-06.
export const ART_CATEGORIES = ['Орнаменты', 'Рамки', 'Существа', 'Космос', 'Персонажи', 'Надписи', 'Предметы', '18+', 'Другое'];
export const isAdultArt = (art) => art?.category === '18+';
// The largest built-in art has 65 rows, 187 columns and 8 521 characters.
export const ART_LIMITS = Object.freeze({ chars: 12_000, rows: 120, width: 250, daily: 5, accountDaily: 15 });
// An art from the editor (asked for on 2026-10-04: arts drawn in the editor could only be pasted as
// text, and text puts its lines one under another): its rows of glyphs where Dota draws them — the
// categories a grid's download keeps (scripts/core.mjs artRows) — from the art's top left corner, in
// the grid's units. Up to the grid's screen in size; a dotted art has many short rows.
export const ART_ROWS = Object.freeze({ rows: 3000, chars: 30_000, width: 250, w: 1193, h: 593 });

class ValidationError extends Error { constructor(message) { super(message); this.status = 400; } }

// `author` signs a guest's art; a signed-in author is their profile's nickname (the server leaves
// `author` empty for them) and `credit` says whose work it is based on, as for grids.
export function artMeta(input) {
  const name = catalogText(input?.name, 60, 'Название', true);
  const author = catalogText(input?.author ?? '', 40, 'Автор');
  const credit = catalogText(input?.credit ?? '', 60, 'Оригинал');
  if (!ART_CATEGORIES.includes(input?.category)) throw new ValidationError('Выбери категорию из списка.');
  return { name, author, credit, category: input.category };
}

// Trims blank edges and the shared indent exactly like insertion does, so the stored
// text is what everyone gets on the canvas.
export function artText(value) {
  if (typeof value !== 'string' || value.length > ART_LIMITS.chars * 4) throw new ValidationError(`Арт: допустимо до ${ART_LIMITS.chars.toLocaleString('ru-RU')} символов.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new ValidationError('В арте есть служебные символы. Скопируй его заново как обычный текст.');
  const hidden = invisibleWarning(value);
  if (hidden) throw new ValidationError(`${hidden} Нарисуй арт другими символами.`);
  const lines = artLines(value);
  if (!lines.some(line => /\S/u.test(line))) throw new ValidationError('Вставь арт: в нём пока нет символов.');
  if (lines.length > ART_LIMITS.rows) throw new ValidationError(`В арте ${lines.length} строк, максимум ${ART_LIMITS.rows}.`);
  const widest = Math.max(...lines.map(line => Array.from(line).length));
  if (widest > ART_LIMITS.width) throw new ValidationError(`Самая длинная строка — ${widest} символов, максимум ${ART_LIMITS.width}.`);
  const text = lines.join('\n');
  if (Array.from(text).length > ART_LIMITS.chars) throw new ValidationError(`Арт: допустимо до ${ART_LIMITS.chars.toLocaleString('ru-RU')} символов.`);
  return { text, rows: lines.length, width: widest };
}

// An art from the editor: rows [{ text, x, y }], moved to start at 0, 0 and ordered top to bottom, left to
// right. `text` is its rows one per line — for the search, the counts and the moderators' list.
export function artRows(value) {
  const broken = () => new ValidationError('Арт из редактора повреждён. Возьми его из редактора ещё раз.');
  if (!Array.isArray(value) || !value.length) throw new ValidationError('В арте пока нет символов: выдели символы или текст в редакторе.');
  if (value.length > ART_ROWS.rows) throw new ValidationError(`В арте ${value.length.toLocaleString('ru-RU')} строк, максимум ${ART_ROWS.rows.toLocaleString('ru-RU')}. Сократи его «Оптимизацией» в редакторе.`);
  let chars = 0;
  const rows = value.map((row) => {
    if (!row || typeof row.text !== 'string' || row.text.length > ART_ROWS.width * 4) throw broken();
    const text = row.text.replace(/\s+$/u, ''), x = Number(row.x), y = Number(row.y);
    if (!/\S/u.test(text) || !Number.isFinite(x) || !Number.isFinite(y) || /[\u0000-\u001f\u007f]/u.test(text)) throw broken();
    const length = Array.from(text).length;
    if (length > ART_ROWS.width) throw new ValidationError(`Самая длинная строка — ${length} символов, максимум ${ART_ROWS.width}.`);
    chars += length;
    return { text, x, y };
  });
  if (chars > ART_ROWS.chars) throw new ValidationError(`Арт: допустимо до ${ART_ROWS.chars.toLocaleString('ru-RU')} символов.`);
  const hidden = invisibleWarning(rows.map((row) => row.text).join('\n'));
  if (hidden) throw new ValidationError(`${hidden} Нарисуй арт другими символами.`);
  const left = Math.min(...rows.map((row) => row.x)), top = Math.min(...rows.map((row) => row.y));
  const placed = rows.map((row) => ({ text: row.text, x: Math.round((row.x - left) * 1000) / 1000, y: Math.round((row.y - top) * 1000) / 1000 }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (Math.max(...placed.map((row) => row.x)) > ART_ROWS.w || Math.max(...placed.map((row) => row.y)) > ART_ROWS.h)
    throw new ValidationError('Арт больше экрана сетки. Выдели один рисунок, а не всю сетку.');
  return { rows: placed, text: placed.map((row) => row.text).join('\n') };
}

// A text art ({ text }) or one from the editor ({ rows }).
export function artSubmission(input) {
  const meta = artMeta(input);
  if (input?.rows != null) return { ...meta, ...artRows(input.rows) };
  const { text } = artText(input?.text);
  return { ...meta, text, rows: null };
}
