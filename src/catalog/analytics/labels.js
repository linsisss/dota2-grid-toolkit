// The words of «Аналитика» for the analytics' ids (scripts/analytics-events.mjs): sections, tools, kinds.
// An id with no word here is shown as it is.
export const SOURCE_LABELS = { telegram: 'Telegram', tiktok: 'TikTok', youtube: 'YouTube', google: 'Google', yandex: 'Яндекс', vk: 'ВКонтакте', discord: 'Discord',
  twitch: 'Twitch', steam: 'Steam', reddit: 'Reddit', bing: 'Bing', duckduckgo: 'DuckDuckGo', other: 'Другой сайт', direct: 'Прямой заход', unknown: 'Неизвестно' };
export const DEVICE_LABELS = { desktop: 'Компьютер', phone: 'Телефон', tablet: 'Планшет', '': 'Неизвестно' };
export const CUSTOMIZE_LABELS = { bg: 'Фон меню', grid: 'Под сеткой героев', hero: 'За героем', loading: 'Экран загрузки', buttons: 'Кнопки меню', menuparts: 'Детали меню',
  hud: 'Вид HUD', hudskin: 'HUD-скин', hudparts: 'Детали HUD', chat: 'Чат', cursor: 'Курсор', click: 'Клик', pings: 'Пинги', deny: 'Денай', font: 'Шрифт', texts: 'Тексты', voice: 'Иконка голоса' };
export const SCENE_LABELS = { menu: 'Главное меню', grid: 'Сетка героев', hero: 'За героем', loading: 'Загрузка', match: 'Матч', font: 'Шрифт' };
export const TOOL_LABELS = { select: 'Выделение', pencil: 'Кисть', eraser: 'Ластик', lasso: 'Лассо', text: 'Текст', rect: 'Прямоугольник', gradient: 'Градиент', eyedropper: 'Пипетка',
  hand: 'Рука', frame: 'Рамка', line: 'Линия', ellipse: 'Эллипс', fill: 'Заливка' };
export const MODE_LABELS = { heroes: 'Герои', draw: 'Рисование', image: 'Картинка' };
export const EXPORT_LABELS = { dota: 'Файл для Dota', command: 'Команда PowerShell', png: 'Картинка PNG', sketch: 'Эскиз PNG', project: 'Файл проекта', optimized: 'Сокращённый файл' };
export const IMPORT_LABELS = { json: 'Файл сеток', project: 'Проект', image: 'Картинка', ascii: 'Текст или ASCII', text: 'Текст-арт', library: 'Арт из библиотеки', art: 'Арт пользователя', workshop: 'Сетка из мастерской' };
export const FILE_LABELS = { create: 'Новый файл', open: 'Открыл файл', template: 'Из шаблона', duplicate: 'Копия файла', workshop: 'Из мастерской' };
export const ASCII_LABELS = { rows: 'Строки символов', points: 'Контуры и точки', trace: 'Точечный рисунок' };
export const KIND_LABELS = { grid: 'Сетки', background: 'Фоны', art: 'Арты', guide: 'Гайды', profile: 'Профили', comment: 'Комментарии', bg: 'Фон', font: 'Шрифт', all: 'Оформление одним файлом' };
export const WAY_LABELS = { file: 'Файлом', command: 'Командой', editor: 'В редактор', builder: 'В оформление' };
export const SECTION_LABELS = { grids: 'Сетки', backgrounds: 'Фоны', arts: 'Арты', guides: 'Гайды' };
export const PLACE_LABELS = { landing: 'Главная', grids: 'Мастерская: сетки', backgrounds: 'Мастерская: фоны', guides: 'Гайды' };
export const DELIVERY_LABELS = { command: 'Командой PowerShell', file: 'Только файл' };
export const RESULT_LABELS = { ok: 'Поставлено', fail: 'Ошибка', removed: 'Убрано' };
export const STEP_LABELS = { download: 'скачивание', find: 'поиск Dota', copy: 'копирование', remove: 'удаление', grid: 'поиск Steam или копирование', '': '—' };
export const FROM_LABELS = { header: 'Кнопка «Войти»', like: 'Лайк', follow: 'Подписка', report: 'Жалоба', comment: 'Комментарий', guide: 'Гайд', dotadle: 'Dotadle', minigames: 'Мини-игры',
  publish: 'Публикация', customize: 'Оформление', admin: 'Админка', page: 'Страница', editor: 'Редактор', workshop: 'Мастерская' };
export const LANGUAGE_LABELS = { ru: 'Русский', en: 'English', uk: 'Українська', be: 'Беларуская', kk: 'Қазақша', de: 'Deutsch', pl: 'Polski', uz: 'Oʻzbek', '': 'Неизвестно' };
const COUNTRY = typeof Intl === 'object' && Intl.DisplayNames ? new Intl.DisplayNames(['ru'], { type: 'region' }) : null;
export const countryLabel = (code) => { if (!code) return 'Неизвестно'; try { return COUNTRY?.of(code) || code; } catch { return code; } };
export const label = (map, key) => (key === '' || key === undefined || key === null ? (map[''] || 'Без значения') : map[key] || key);
