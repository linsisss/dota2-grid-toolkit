// English for messages the server sends (API errors) and the scripts' validation messages; patterns for those made with numbers: 'Русский текст': 'English text' (scripts/i18n.mjs, docs/i18n.md).
// Not here: the Telegram bot's texts and what only admins see (moderation, the admin panel).
const messages = {
  // server/catalog-api.mjs: requests.
  'Нужен Content-Type application/json.': 'Content-Type application/json is required.',
  'Файл слишком большой.': 'The file is too large.',
  'Не удалось прочитать JSON.': 'Couldn’t read the JSON.',
  'Не найдено.': 'Not found.',
  'Отправка разрешена только с сайта GridStudio.': 'Sending is only allowed from the GridStudio website.',
  'Начни вход в этом браузере.': 'Start signing in from this browser.',
  'Фото профиля недоступно.': 'The profile photo is unavailable.',
  'В другой вкладке начат новый вход. Начни заново.': 'A new sign-in was started in another tab. Start again.',
  'Попытка входа изменилась.': 'The sign-in attempt has changed.',
  'Неверная настройка архива.': 'Invalid archive setting.',
  'Проверка доступна только на GridStudio.': 'The check only works on GridStudio.',
  'Неизвестный тег.': 'Unknown tag.',
  'Неверное значение лайка.': 'Invalid like value.',
  'Неверное значение подписки.': 'Invalid subscription value.',
  'Страница временно недоступна.': 'The page is temporarily unavailable.',
  'Этой сетки нет на главной.': 'This grid isn’t on the home page.',
  'Нет такого размера.': 'No such size.',
  'Для изменения опубликованной сетки войди через Telegram и привяжи её к аккаунту.': 'To change a published grid, sign in with Telegram and link the grid to your account.',
  'Не удалось сохранить данные. Попробуй ещё раз.': 'Couldn’t save the data. Try again.',

  // server/catalog-store.mjs: grids in the Workshop.
  'Слишком много запросов.': 'Too many requests.',
  'Приём сеток временно приостановлен. Мастерская и редактор доступны.': 'Grid submissions are paused for now. The Workshop and the editor still work.',
  'Отправка с этого источника временно ограничена.': 'Sending from this source is temporarily restricted.',
  'Достигнут общий лимит отправок из этой сети за 24 часа.': 'This network has reached its shared limit of submissions for 24 hours.',
  'Очередь проверки заполнена. Попробуй позже.': 'The review queue is full. Try again later.',
  'Публикация не найдена в этом аккаунте или ссылка недействительна.': 'The submission isn’t in this account, or the link is invalid.',
  'Публикация удалена.': 'The submission was deleted.',
  'Публикация заблокирована модератором.': 'The submission was blocked by a moderator.',
  'Версия уже изменилась. Обнови страницу перед сохранением.': 'This version has already changed. Reload the page before saving.',
  'Такая сетка уже отправлена. Новая карточка не создана.': 'This grid has already been sent. No new card was created.',
  'Некорректный ключ новой публикации.': 'Invalid key for the new submission.',
  'Сетка не найдена или ещё не опубликована.': 'The grid wasn’t found or isn’t published yet.',
  'Автор этой сетки не входил через Telegram, поэтому подписаться на него пока нельзя.': 'This grid’s author hasn’t signed in with Telegram, so you can’t follow them yet.',
  'Это твоя сетка.': 'This is your grid.',
  'Войди через Telegram, чтобы поставить лайк.': 'Sign in with Telegram to like.',
  'Свою работу лайкнуть нельзя.': 'You can’t like your own work.',

  // server/accounts.mjs: signing in and the Studio's files in an account.
  'Войди через Telegram.': 'Sign in with Telegram.',
  'Ссылка входа истекла. Начни вход заново на сайте.': 'The sign-in link has expired. Start signing in again on the website.',
  'Попытка входа не найдена в этом браузере.': 'No sign-in attempt was found in this browser.',
  'Вход ещё не подтверждён в Telegram.': 'The sign-in isn’t confirmed in Telegram yet.',
  'Рабочее пространство не найдено в этом аккаунте.': 'This file isn’t in this account.',
  'Аккаунт или версия рабочего пространства изменились. Открой его заново.': 'The account or the file’s version has changed. Open it again.',
  'Не удалось прочитать файл GridStudio. Локальная копия сохранена.': 'Couldn’t read the GridStudio file. The local copy is kept.',
  'Файл больше 8 МБ. Скачай его для резервной копии или уменьши размер подложки.': 'The file is larger than 8 MB. Download it as a backup or make the reference image smaller.',
  'Рабочее пространство не найдено.': 'File not found.',
  'Файл изменён на другом устройстве. Твои правки остались локально; сохрани их отдельной копией.': 'The file was changed on another device. Your edits stayed on this device; save them as a separate copy.',
  'Серверная копия не найдена. Локальные данные сохранены.': 'The server copy wasn’t found. The local data is kept.',
  'Лимит аккаунта: 100 файлов или 200 МБ. Сохрани резервную копию на устройство.': 'Account limit: 100 files or 200 MB. Save a backup to your device.',
  'Не удалось прочитать файл для превью.': 'Couldn’t read the file for the preview.',
  'Сетка не найдена.': 'Grid not found.',
  'Файл изменился. Обнови список.': 'The file has changed. Refresh the list.',

  // server/catalog-arts.mjs: ready-made arts offered by users.
  'Приём временно приостановлен. Мастерская и редактор доступны.': 'Submissions are paused for now. The Workshop and the editor still work.',
  'Этот арт уже есть в «Готовых артах».': 'This art is already among the ready-made arts.',
  'Такой арт уже ждёт проверки.': 'This art is already waiting for review.',
  'Достигнут общий лимит отправки артов из этой сети за 24 часа.': 'This network has reached its shared limit of art submissions for 24 hours.',
  'Очередь проверки артов заполнена. Попробуй позже.': 'The art review queue is full. Try again later.',

  // server/catalog-backgrounds.mjs and server/studio-backgrounds.mjs: menu backgrounds.
  'Обложка слишком большая.': 'The cover is too large.',
  'Нужен WebM, собранный на этой странице.': 'A WebM built on this page is needed.',
  'Этот фон уже есть в галерее.': 'This background is already in the gallery.',
  'Такой фон уже ждёт проверки.': 'This background is already waiting for review.',
  'Очередь проверки фонов заполнена. Попробуй позже.': 'The background review queue is full. Try again later.',
  'Галерея фонов заполнена. Попробуй позже.': 'The background gallery is full. Try again later.',
  'Видео не читается. Собери фон на этой странице заново.': 'The video can’t be read. Build the background on this page again.',
  'В файле должен быть один видеопоток без звука.': 'The file must have one video stream and no sound.',
  'Нужен WebM VP8 или VP9.': 'A VP8 or VP9 WebM is needed.',
  'Обложка не читается.': 'The cover can’t be read.',
  'Достигнут общий лимит отправки фонов из этой сети за 24 часа.': 'This network has reached its shared limit of background submissions for 24 hours.',
  'Фон не найден.': 'Background not found.',
  'Файл фона не найден.': 'The background’s file wasn’t found.',
  'Обложка должна быть JPEG.': 'The cover must be a JPEG.',
  'Обложки нет.': 'There is no cover.',
  // Reasons the Telegram moderators' buttons give: authors see them on their cards.
  'Отклонено участником команды в Telegram.': 'Rejected by a team member in Telegram.',
  'Скрыто после жалобы в Telegram.': 'Hidden after a report in Telegram.',

  // server/catalog-captcha.mjs.
  'Неизвестная проверка.': 'Unknown check.',
  'Проверка не пройдена или истекла. Повтори её.': 'The check failed or expired. Do it again.',

  // server/steam-profile.mjs and scripts/steam-profile.mjs.
  'Steam сейчас не отвечает. Попробуй позже или введи код друга.': 'Steam isn’t responding right now. Try later or enter the friend code.',
  'Профиль не найден. Проверь ссылку или введи код друга.': 'Profile not found. Check the link or enter the friend code.',
  'Вставь ссылку на профиль steamcommunity.com или числовой код друга.': 'Paste a steamcommunity.com profile link or a numeric friend code.',
  'Укажи полный путь к папке Steam, например D:\\Steam.': 'Enter the full path to the Steam folder, for example D:\\Steam.',

  // scripts/catalog-document.mjs: a grid for the Workshop.
  'Для публикации нужна одна сетка Dota JSON версии 3.': 'Publishing needs a single Dota JSON grid, version 3.',
  'В сетке некорректные ID героев.': 'The grid has invalid hero IDs.',
  'Координаты и размеры категорий должны быть положительными и не больше 10 000.': 'Category positions and sizes must be positive and at most 10,000.',
  'В сетке пока нет героев или символов.': 'The grid has no heroes or symbols yet.',
  'Выбери до трёх тегов из списка.': 'Pick up to three tags from the list.',

  // scripts/art-document.mjs: an art for the ready-made arts.
  'Выбери категорию из списка.': 'Pick a category from the list.',
  'В арте есть служебные символы. Скопируй его заново как обычный текст.': 'The art has control characters. Copy it again as plain text.',
  'Вставь арт: в нём пока нет символов.': 'Paste the art: it has no symbols yet.',

  // scripts/background-document.mjs and scripts/studio-background.mjs: backgrounds.
  'Неизвестный формат экрана.': 'Unknown screen format.',
  'Не удалось прочитать загрузку. Собери фон заново.': 'Couldn’t read the upload. Build the background again.',
  'Настройки фона не читаются.': 'The background’s settings can’t be read.',
  'Укажи название фона.': 'Enter a name for the background.',
  // The moderators' quick reasons (src/catalog/ModerationQueue.jsx quickReasons), shown to authors.
  "В вашей сетке недостаточно деталей для публикации. Это не значит, что она плохая, просто мы не можем пропускать каждую заявку в мастерскую.": "Your grid doesn’t have enough detail to be published. It doesn’t mean your grid is bad, we just can’t let every submission into the Workshop.",
  "Ваша сетка слишком низкого качества. Попробуйте найти качество лучше, либо загрузите другую.": "Your grid is too low in quality. Try to find a better quality one, or upload another one.",
  "В вашем арте недостаточно деталей для публикации. Это не значит, что он плохой, просто мы не можем пропускать каждую заявку в библиотеку.": "Your art doesn’t have enough detail to be published. It doesn’t mean your art is bad, we just can’t let every submission into the library.",
  "Ваш арт слишком низкого качества. Попробуйте найти качество лучше, либо загрузите другой.": "Your art is too low in quality. Try to find a better quality one, or upload another one.",
  "В вашем фоне недостаточно деталей для публикации. Это не значит, что он плохой, просто мы не можем пропускать каждую заявку в мастерскую.": "Your background doesn’t have enough detail to be published. It doesn’t mean your background is bad, we just can’t let every submission into the Workshop.",
  "Ваш фон слишком низкого качества. Попробуйте найти качество лучше, либо загрузите другой.": "Your background is too low in quality. Try to find a better quality one, or upload another one.",
  'Нарушение правил': 'Breaks the rules',
};
export default messages;

// The field names of catalogText's messages (scripts/catalog-document.mjs and its users).
const FIELDS = { 'Название': 'Title', 'Автор': 'Author', 'Причина жалобы': 'Report reason', 'Причина': 'Reason', 'Название категории': 'Category name', 'Имя сетки': 'Grid name', 'Имя файла': 'File name', 'Арт': 'Art' };
// The groups of symbols Dota does not show (scripts/dota-rendering.mjs invisibleWarning).
const GLYPHS = { 'брайль': 'Braille', 'символы рамок': 'box-drawing characters', 'блоки ▀█░': 'blocks ▀█░' };
// 12 000 (ru-RU, a no-break space) → 12,000.
const number = (text) => Number(text.replace(/\s/g, '')).toLocaleString('en-US');

// Messages made with numbers and names; a replacement is a string with $1… or a function.
const own = [
  [/^Файл больше ([\d.]+) МБ\.$/, 'The file is larger than $1 MB.'],
  [/^Видео больше ([\d.]+) МБ\.$/, 'The video is larger than $1 MB.'],
  [/^Размер видео (\d+)×(\d+), а для (\S+) нужен (\d+)×(\d+)\.$/, 'The video is $1×$2, but $3 needs $4×$5.'],
  [/^Длина видео ([\d.]+) с, можно до (\d+) с\.$/, 'The video is $1 s long; the limit is $2 s.'],
  [/^Лимит аккаунта — (\d+) отправок за 24 часа, включая обновления сеток\.$/, 'The account limit is $1 submissions per 24 hours, grid updates included.'],
  [/^Без входа можно отправить (\d+) сетки за 24 часа, включая обновления\. С Telegram — до (\d+) отправок\.$/, 'Without signing in, you can send $1 grids per 24 hours, updates included. With Telegram, up to $2.'],
  [/^С Telegram можно предложить (\d+) артов за 24 часа\.$/, 'With Telegram, you can offer $1 arts per 24 hours.'],
  [/^Без входа можно предложить (\d+) артов за 24 часа\. С Telegram — до (\d+)\.$/, 'Without signing in, you can offer $1 arts per 24 hours. With Telegram, up to $2.'],
  [/^С Telegram можно отправить (\d+) фонов за 24 часа\.$/, 'With Telegram, you can send $1 backgrounds per 24 hours.'],
  [/^Без входа можно отправить (\d+) фона за 24 часа\. С Telegram — до (\d+)\.$/, 'Without signing in, you can send $1 backgrounds per 24 hours. With Telegram, up to $2.'],
  [/^В студии уже (\d+) фонов\. Удали ненужные\.$/, 'Your Studio already has $1 backgrounds. Delete the ones you don’t need.'],
  [/^В сетке должно быть от 1 до (\d+) категорий\. Используй оптимизацию перед публикацией\.$/, 'A grid must have 1 to $1 categories. Use optimization before publishing.'],
  [/^Сетка слишком сложная: максимум (\d+) портретов\.$/, 'The grid is too complex: at most $1 portraits.'],
  [/^В арте (\d+) строк, максимум (\d+)\.$/, 'The art has $1 lines; the maximum is $2.'],
  [/^Самая длинная строка — (\d+) символов, максимум (\d+)\.$/, 'The longest line has $1 symbols; the maximum is $2.'],
  [/^(.+): допустимо до ([\d\s]+) символов\.$/, (whole, field, max) => `${FIELDS[field] || field}: up to ${number(max)} characters.`],
  [/^Заполни поле «(.+)»\.$/, (whole, field) => `Fill in the “${FIELDS[field] || field}” field.`],
  [/^Dota не показывает: (.+) — в игре этого не будет видно\. Нарисуй арт другими символами\.$/,
    (whole, list) => `Dota doesn’t show ${list.split(', ').map((name) => GLYPHS[name] || name).join(', ')}: they won’t be visible in the game. Draw the art with other symbols.`]
];
const english = (text) => {
  if (text in messages) return messages[text];
  const found = own.find(([pattern]) => pattern.test(text));
  return found ? text.replace(...found) : text;
};
// A rate limit (server/catalog-store.mjs rateExceeded): its message, then the wait — «30 сек.», «2 ч. 5 мин.».
const wait = (text) => text.replace(/(\d+) сек\./, '$1 s').replace(/(\d+) ч\./, '$1 h').replace(/(\d+) мин\./, '$1 min');
export const patterns = [...own, [/^(.+) Попробуй через (.+)$/, (whole, message, time) => `${english(message)} Try again in ${wait(time)}.`]];
