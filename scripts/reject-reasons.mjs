// The quick reasons for turning a submission down, the same on the site (src/catalog/AdminReview.jsx)
// and on the Telegram moderation card (server/catalog-telegram.mjs, asked for on 2026-10-03: a
// rejection from Telegram reached the author as a faceless «Отклонено участником команды»). The author
// sees the text word for word in «Мои публикации» and, signed in with Telegram, in the bot's message.
// `kind`: works, arts, backgrounds or guides. `original`: the link to the published work this one repeats
// (the closest near copy, server/similarity.mjs), if any.
const NOUNS = {
  works: { inside: 'В вашей сетке', bad: 'она плохая', yours: 'Ваша сетка', other: 'другую', place: 'мастерскую', same: 'Такая работа' },
  arts: { inside: 'В вашем арте', bad: 'он плохой', yours: 'Ваш арт', other: 'другой', place: 'библиотеку' },
  backgrounds: { inside: 'В вашем фоне', bad: 'он плохой', yours: 'Ваш фон', other: 'другой', place: 'мастерскую', same: 'Такой фон' },
  guides: { inside: 'В вашем гайде', bad: 'он плохой', yours: 'Ваш гайд', other: 'другой', place: 'гайды' }
};
export const TELEGRAM_REASON = 'Отклонено участником команды в Telegram.';
// [{ code, name, text }]: `code` — one letter, for a Telegram button's data.
export function rejectReasons(kind, { original = '' } = {}) {
  const n = NOUNS[kind] || NOUNS.works;
  return [
    { code: 'd', name: 'Не хватает деталей', text: `${n.inside} недостаточно деталей для публикации. Это не значит, что ${n.bad}, просто мы не можем пропускать каждую заявку в ${n.place}.` },
    { code: 'q', name: 'Плохое качество', text: `${n.yours} слишком низкого качества. Попробуйте найти качество лучше, либо загрузите ${n.other}.` },
    ...(n.same ? [{ code: 'c', name: 'Уже есть в мастерской', text: `${n.same} уже есть в мастерской${original ? ` — ${original}` : ''}` }] : []),
    ...(kind === 'works' ? [{ code: 'a', name: 'Это арт, а не сетка', text: 'Это арт, а не полноценная сетка. Отправьте его в «ASCII-арты» в редакторе: «Готовые арты» → «Предложить свой арт».' }] : []),
    { code: 'r', name: 'Нарушение правил', text: 'Нарушение правил' }
  ];
}
