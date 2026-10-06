// What the bot writes to a signed-in user in Telegram, each kind switchable in «Настройки профиля»
// (asked for on 2026-10-03: «вдруг не хочет»). All are on until switched off; the server keeps the
// switched-off ones (server/profiles.mjs) and the bot checks them before every message
// (server/catalog-telegram.mjs direct). Shared by the server, the settings window and the tests.
export const NOTIFICATIONS = Object.freeze([
  { id: 'review', label: 'Проверка моих работ', hint: 'Сетка, фон, арт или гайд одобрены или отклонены' },
  { id: 'comments', label: 'Комментарии к моим работам', hint: 'Новый комментарий под моим гайдом, сеткой или фоном' },
  { id: 'replies', label: 'Ответы на мои комментарии', hint: 'Ответили на мой комментарий' },
  { id: 'follows', label: 'Новое у авторов из моих подписок', hint: 'Новые сетки, фоны и гайды' },
  { id: 'badges', label: 'Значки', hint: 'Мне выдали значок в профиле' },
  { id: 'milestones', label: 'Успехи моих работ', hint: 'Сетку или фон скачали 100 раз, гайд набрал 50 лайков и так далее' },
]);
export const NOTIFICATION_IDS = Object.freeze(NOTIFICATIONS.map((kind) => kind.id));
