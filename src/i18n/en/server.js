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

  // server/hero-meta.mjs: the hero meta from STRATZ.
  'STRATZ вернул пустой ответ.': 'STRATZ returned an empty answer.',
  'STRATZ не отвечает. Попробуй позже.': 'STRATZ is not answering. Try again later.',
  'Неизвестная группа рангов.': 'Unknown rank group.',
  'Мета пока недоступна.': 'The meta is not available yet.',

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
  // server/grid-installs.mjs
  'Это не файл сеток Dota.': 'This is not a Dota grid file.',
  'Сетка слишком большая для команды. Скачай её файлом.': 'The grid is too big for the command. Download it as a file.',
  // «Гайды» (server/guides.mjs, scripts/guide-document.mjs)
  'В гайде до 20 роликов YouTube.': 'A guide can have up to 20 YouTube videos.',
  'В гайде до 60 картинок, видео и файлов.': 'A guide can have up to 60 pictures, videos and files.',
  'В гайде пока почти ничего нет: добавь текст или картинки.': 'There’s almost nothing in the guide yet: add text or pictures.',
  'В тексте есть элемент, который гайд не поддерживает.': 'The text has an element guides don’t support.',
  'В файле нет видео.': 'The file has no video.',
  'Версия гайда не найдена.': 'Guide version not found.',
  'Видео больше 4K.': 'The video is larger than 4K.',
  'Видео длиннее 15 минут.': 'The video is longer than 15 minutes.',
  'Видео в H.265 браузеры не показывают. Сохрани его в H.264 (MP4) или WebM.': 'Browsers don’t show H.265 video. Save it as H.264 (MP4) or WebM.',
  'Браузеры не покажут это видео. Сохрани его в H.264 (MP4) или WebM.': 'Browsers won’t show this video. Save it as H.264 (MP4) or WebM.',
  'Вложение вставлено не тем блоком.': 'The attachment is in the wrong kind of block.',
  'Вложение гайда повреждено.': 'A guide attachment is damaged.',
  'Гайд изменён в другой вкладке. Обнови страницу.': 'The guide was changed in another tab. Reload the page.',
  'Гайд не найден.': 'Guide not found.',
  'Гайд скрыт модератором.': 'The guide was hidden by a moderator.',
  'Гайд слишком большой: раздели его на несколько.': 'The guide is too big: split it into several.',
  'Гайд слишком длинный: до 60 000 символов.': 'The guide is too long: up to 60,000 characters.',
  'Гайд уже проверен или изменён. Обнови список.': 'The guide was already reviewed or changed. Refresh the list.',
  'Жалоба уже рассмотрена.': 'The report was already handled.',
  'Загрузка не найдена.': 'Upload not found.',
  'Картинка слишком большая: до 60 мегапикселей.': 'The picture is too big: up to 60 megapixels.',
  'Комментарии для тебя временно ограничены.': 'Commenting is temporarily restricted for you.',
  'Комментарий до 2000 символов.': 'A comment can be up to 2,000 characters.',
  'Ссылки в комментариях запрещены — так мы защищаем аккаунты от фишинга.': 'Links are not allowed in comments — this protects accounts from phishing.',
  'Комментарий не найден.': 'Comment not found.',
  'Комментарий, на который ты отвечаешь, удалён.': 'The comment you’re replying to was deleted.',
  'Место для твоих вложений закончилось (1 ГБ). Удали ненужные черновики.': 'You’re out of space for attachments (1 GB). Delete drafts you don’t need.',
  'На сегодня жалоб достаточно.': 'That’s enough reports for today.',
  'На сегодня комментариев достаточно.': 'That’s enough comments for today.',
  'Назови гайд: от 3 символов.': 'Give the guide a title: 3 characters or more.',
  'Напиши комментарий.': 'Write a comment.',
  'Напиши, что не так.': 'Say what’s wrong.',
  'Не удалось прочитать видео.': 'Couldn’t read the video.',
  'Не удалось прочитать картинку.': 'Couldn’t read the picture.',
  'Неверная часть файла.': 'Wrong part of the file.',
  'Неверное оформление текста.': 'Wrong text formatting.',
  'Неверный лайк.': 'Invalid like.',
  'Неизвестный тип вложения.': 'Unknown attachment type.',
  'Нет изменений для проверки.': 'Nothing new to review.',
  'Нет фото.': 'No photo.',
  'Одно из вложений не загружено или удалено. Добавь его ещё раз.': 'One of the attachments isn’t uploaded or was deleted. Add it again.',
  'Отправка временно ограничена.': 'Sending is temporarily restricted.',
  'Очередь проверки заполнена. Попробуй позже.': 'The review queue is full. Try again later.',
  'Причина до 500 символов.': 'The reason can be up to 500 characters.',
  'Приём временно приостановлен. Попробуй позже.': 'Submissions are paused for now. Try again later.',
  'Свой гайд лайкнуть нельзя.': 'You can’t like your own guide.',
  'Слишком глубокая вложенность списков и цитат.': 'Lists and quotes are nested too deep.',
  'Слишком часто. Подожди минуту.': 'Too often. Wait a minute.',
  'Ссылка на YouTube повреждена.': 'The YouTube link is damaged.',
  'Такой файл в гайд не добавить: программы и скрипты нельзя.': 'This file can’t go into a guide: no programs or scripts.',
  'Текст гайда повреждён.': 'The guide’s text is damaged.',
  'Удалить можно свой комментарий или комментарий к своему гайду.': 'You can delete your own comments and comments on your guide.',
  'Файл больше, чем было заявлено.': 'The file is bigger than stated.',
  'Файл загружен не до конца.': 'The file isn’t fully uploaded.',
  'Файл не найден.': 'File not found.',
  'Файл пустой.': 'The file is empty.',
  'Файл уже загружен.': 'The file is already uploaded.',
  'Хранилище гайдов заполнено. Попробуй позже.': 'Guide storage is full. Try again later.',
  'Части файла пришли не по порядку. Загрузи его ещё раз.': 'Parts of the file arrived out of order. Upload it again.',
  'Это не видео MP4 или WebM.': 'This isn’t an MP4 or WebM video.',
  'Это не картинка PNG, JPEG, WebP или GIF.': 'This isn’t a PNG, JPEG, WebP or GIF picture.',
  // Creator profiles (server/profiles.mjs).
  'В нике можно буквы, цифры и знаки _ . -, без пробелов.': 'A nickname may have letters, digits and _ . -, no spaces.',
  'В нике нужна хотя бы одна буква.': 'A nickname needs at least one letter.',
  'Ник не может начинаться или заканчиваться знаком.': 'A nickname can’t start or end with a sign.',
  'Такой ник занят сайтом. Выбери другой.': 'This nickname is reserved by the site. Pick another one.',
  'Этот ник уже занят.': 'This nickname is already taken.',
  'Не удалось создать профиль. Попробуй ещё раз.': 'Couldn’t create the profile. Try again.',
  'Профиль не найден.': 'Profile not found.',
  'Выбери картинку.': 'Pick a picture.',
  'Картинка больше 5 МБ.': 'The picture is larger than 5 MB.',
  'Картинка слишком большая.': 'The picture is too large.',
  'Фото из Telegram нет: оно появится после следующего входа, если в Telegram есть фото профиля.': 'There’s no Telegram photo: it appears after your next sign-in if your Telegram profile has one.',
  'Неизвестная аватарка.': 'Unknown avatar.',
  'Такой значок не выдаётся вручную.': 'This badge isn’t given by hand.',
  'Фото профиля недоступно.': 'The profile photo isn’t available.',
};
export default messages;

// The field names of catalogText's messages (scripts/catalog-document.mjs and its users).
const FIELDS = { 'Название': 'Title', 'Автор': 'Author', 'Оригинал': 'Based on', 'Причина жалобы': 'Report reason', 'Причина': 'Reason', 'Название категории': 'Category name', 'Имя сетки': 'Grid name', 'Имя файла': 'File name', 'Арт': 'Art' };
// The groups of symbols Dota does not show (scripts/dota-rendering.mjs invisibleWarning).
const GLYPHS = { 'брайль': 'Braille', 'символы рамок': 'box-drawing characters', 'блоки ▀█░': 'blocks ▀█░' };
// 12 000 (ru-RU, a no-break space) → 12,000.
const number = (text) => Number(text.replace(/\s/g, '')).toLocaleString('en-US');

// «5 октября» (ru-RU, day and month) → «October 5».
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const day = (text) => { const [, d, m] = /^(\d+) (\S+)$/.exec(text) || []; const month = MONTHS.indexOf(m); return month < 0 ? text : new Date(2000, month, Number(d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); };
// Messages made with numbers and names; a replacement is a string with $1… or a function.
const own = [
  [/^Ник — от (\d+) до (\d+) символов\.$/, 'A nickname is $1 to $2 characters long.'],
  [/^Описание — до (\d+) символов\.$/, 'The description is up to $1 characters.'],
  [/^Описание — до (\d+) строк\.$/, 'The description is up to $1 lines.'],
  [/^Ник можно менять раз в неделю\. Следующая смена — (.+)\.$/, (whole, at) => `You can change your nickname once a week. Next change: ${day(at)}.`],
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
  [/^Название до (\d+) символов\.$/, 'The title can be up to $1 characters.'],
  [/^За сутки можно загрузить (\d+) файлов\.$/, 'You can upload $1 files a day.'],
  [/^За сутки можно начать (\d+) гайдов\.$/, 'You can start $1 guides a day.'],
  [/^За сутки можно отправить на проверку (\d+) версий\.$/, 'You can send $1 versions for review a day.'],
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
