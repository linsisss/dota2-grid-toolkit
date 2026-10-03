import { InlineKeyboard, InlineQueryResult } from 'puregram';

// Quick answers for the users' chat (asked for on 2026-10-03): `@<бот> вопрос` in any chat lists the
// frequent questions; the chosen one goes as a rich message with a picture and buttons. Telegram drops
// custom emoji from an inline result itself, so the answer leaves with plain emoji and the bot edits
// its own copy in right after (`chosen_inline_result`, needs /setinlinefeedback at 100 % in BotFather):
// an edit is a message the bot sends, and its owner's Premium lets it show them. Without the feedback
// the plain answer stays. Every answer has a button: only a message with an inline keyboard gets an
// `inline_message_id` to edit. A picture can't be a link here (EXTERNAL_MEDIA_NOT_SUPPORTED): the bot
// uploads it once and the answer takes its file_id (`media`: answer id → file_id, catalog-telegram.mjs
// faqMedia); until then the answer goes without it.
const ICONS = Object.freeze({
  file: ['5877332341331857066', '📁'],
  editor: ['5879841310902324730', '✏️'],
  notice: ['5879813604068298387', '❗️'],
  background: ['5775949822993371030', '🖼'],
  site: ['5877465816030515018', '🔗'],
});
const icon = (name, custom) => (custom ? `<tg-emoji emoji-id="${ICONS[name][0]}">${ICONS[name][1]}</tg-emoji>` : ICONS[name][1]);
const button = (name, custom) => (custom ? { iconCustomEmojiId: ICONS[name][0] } : {});

// `keywords`: word starts a question is found by (lower case, ё as е). `thumbnail`: a picture of the
// site's (assets/og). `html(origin, custom)`: the answer; `image`: a picture under it (assets/faq);
// `buttons(origin, custom)`: its keyboard rows.
export const FAQ = Object.freeze([
  {
    id: 'grids-in-file',
    title: 'Несколько сеток в одном файле',
    description: 'Чтобы в игре на выбор было 4–5 сеток',
    keywords: ['несколько', 'сетк', 'файл', 'много', 'добав', '4', '5', 'выбор', 'переключ'],
    thumbnail: 'assets/og/editor.jpg',
    html: (origin, custom) => `<h3>${icon('file', custom)} Несколько сеток в одном файле</h3>
<p>Да, так можно: все сетки из файла появятся в игре списком, и между ними можно переключаться.</p>
<ol>
<li>Откройте редактор и нажмите <b>«+»</b> рядом с «Сетки в файле» — добавится новая сетка.</li>
<li>Переключайтесь между сетками в этом же списке. Готовую сетку из другого файла можно добавить кнопкой «Добавить из файла».</li>
<li>Нажмите «Экспортировать» — все сетки сохранятся в один файл.</li>
</ol>`,
    image: { file: 'assets/faq/grids-in-file.jpg', caption: '«Сетки в файле» в редакторе' },
    buttons: (origin, custom) => [[InlineKeyboard.urlButton({ text: 'Открыть редактор', url: `${origin}/editor`, ...button('editor', custom) })]],
  },
  {
    id: 'not-working',
    title: 'Не работает!!!',
    description: 'Попросить описать, на каком шаге не получается',
    keywords: ['не работ', 'работает', 'помог', 'помощ', 'не получ', 'сломал', 'ошибк', 'почему'],
    thumbnail: 'assets/og/home.jpg',
    html: (origin, custom) => `<h3>${icon('notice', custom)} Уточните, что именно не работает</h3>
<p>Пожалуйста, напишите, на каком именно моменте у вас не получается установить сетку, фон или шрифт, — чтобы пользователи могли вам помочь.</p>
<ul>
<li>что вы ставите: сетку, фон или шрифт;</li>
<li>на каком шаге всё остановилось;</li>
<li>что видно на экране — лучше со скриншотом.</li>
</ul>
<p>Давайте ценить своё и чужое время.</p>`,
    buttons: (origin, custom) => [[InlineKeyboard.urlButton({ text: 'Открыть GridStudio', url: origin, ...button('site', custom) })]],
  },
  {
    id: 'no-background',
    title: 'Всё сделал правильно, но фона нет',
    description: 'Параметр запуска -language russian',
    keywords: ['фон', 'нет фон', 'не появ', 'не видно', 'меню', 'language', 'язык', 'запуск', 'правильно'],
    thumbnail: 'assets/og/background.jpg',
    html: (origin, custom) => `<h3>${icon('background', custom)} Фон не появился</h3>
<p>Поставьте в параметрах запуска Dota 2 параметр <code>-language russian</code>.</p>
<ol>
<li>Steam → Библиотека → правой кнопкой по Dota 2 → <b>Свойства</b>.</li>
<li>Вкладка <b>Общие</b> → поле <b>Параметры запуска</b>.</li>
<li>Впишите <code>-language russian</code> и перезапустите игру.</li>
</ol>`,
    buttons: (origin, custom) => [[InlineKeyboard.copyButton({ text: 'Скопировать параметр', copy: '-language russian' })],
      [InlineKeyboard.urlButton({ text: 'Собрать фон заново', url: `${origin}/background`, ...button('background', custom) })]],
  },
]);

const fold = (text) => String(text || '').toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
// The answers for a query, the closest first: an empty query lists them all, words that match nothing
// still list them all (three answers — better than an empty list).
export function faqMatches(query) {
  const text = fold(query);
  if (!text) return [...FAQ];
  const scored = FAQ.map((entry, index) => ({ entry, index, score: entry.keywords.filter((word) => text.includes(word)).length + (fold(entry.title).includes(text) ? 2 : 0) }));
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ entry }) => entry);
}

// An answer as a rich message: its text, then its picture when the bot has it as a Telegram file.
function richAnswer(entry, origin, custom, media) {
  const file = entry.image && media[entry.id];
  if (!file) return { html: entry.html(origin, custom) };
  return { html: `${entry.html(origin, custom)}\n<figure><img src="tg://photo?id=${entry.id}"/><figcaption>${entry.image.caption}</figcaption></figure>`,
    media: [{ id: entry.id, media: { type: 'photo', media: file } }] };
}

// The inline results (plain emoji: Telegram drops custom ones there).
export const faqResults = (query, origin, media = {}) => faqMatches(query).map((entry) => InlineQueryResult.article({
  id: entry.id, title: entry.title, description: entry.description,
  content: { rich_message: richAnswer(entry, origin, false, media) },
  replyMarkup: InlineKeyboard.keyboard(entry.buttons(origin, false)),
  thumbnail: { url: `${origin}/${entry.thumbnail}` },
}));

// The edit that brings the custom emoji in, for a chosen answer.
export function faqEdit(resultId, origin, media = {}) {
  const entry = FAQ.find((item) => item.id === resultId);
  return entry ? { rich_message: richAnswer(entry, origin, true, media), reply_markup: InlineKeyboard.keyboard(entry.buttons(origin, true)) } : null;
}
