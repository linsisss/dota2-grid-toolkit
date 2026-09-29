import { artLines } from './ascii-library.mjs';
import { catalogText } from './catalog-document.mjs';
import { invisibleWarning } from './dota-rendering.mjs';

// Player-submitted ready-made arts: the same text format as data/ascii-arts.json,
// validated by the same rules in the submission form and on the server.
export const ART_CATEGORIES = ['Орнаменты', 'Существа', 'Космос', 'Персонажи', 'Надписи', 'Предметы', 'Другое'];
// The largest built-in art has 65 rows, 187 columns and 8 521 characters.
export const ART_LIMITS = Object.freeze({ chars: 12_000, rows: 120, width: 250, daily: 5, accountDaily: 15 });

class ValidationError extends Error { constructor(message) { super(message); this.status = 400; } }

export function artMeta(input) {
  const name = catalogText(input?.name, 60, 'Название', true);
  const author = catalogText(input?.author ?? '', 40, 'Автор');
  if (!ART_CATEGORIES.includes(input?.category)) throw new ValidationError('Выбери категорию из списка.');
  return { name, author, category: input.category };
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

export function artSubmission(input) {
  const meta = artMeta(input), { text } = artText(input?.text);
  return { ...meta, text };
}
