import { STYLE, counter, escape } from './seo-pages.mjs';

// Answers to what people search (asked for on 2026-10-08: «создать сетку дота 2» and the like found only
// articles and forums): a page per question, drawn here as plain HTML like the workshop's search pages
// (server/seo-pages.mjs) — what the tool does, the steps, the answers to the usual questions (FAQ and HowTo
// structured data) and a big button into the tool. The texts say only what the site really does
// (the install guides: src/catalog/InstallGuide.jsx, src/customize/BackgroundSteps.jsx, FontPicker.jsx).
const SAFE = 'Valve формально не разрешает менять файлы игры, но банов за то, что видишь только ты — фон меню, шрифт, интерфейс, — не известно: это ничего не даёт в игре. Сетка героев — вообще встроенная функция Dota 2, это не мод.';
export const SEO_GUIDES = {
  'sozdat-setku-geroev': {
    title: 'Редактор сетки героев Dota 2 онлайн — создать свою сетку бесплатно',
    h1: 'Создать сетку героев Dota 2 онлайн',
    lead: 'GridStudio — бесплатный редактор сеток героев Dota 2 прямо в браузере. Расставь героев по группам, нарисуй арт из символов или преврати картинку в ASCII-арт, собери сетку по текущей мете — и поставь её в игру одним файлом.',
    image: 'editor', cta: { href: '/editor', text: 'Открыть редактор' }, more: { href: '/grids', text: 'Готовые сетки' },
    features: [
      ['Холст как в игре', 'Размер 1193 × 593 и те же портреты: что видишь в редакторе, то и будет на экране выбора героя.'],
      ['Группы героев', 'Создавай категории — «Керри», «Мид», «Мои мейны» — и перетаскивай героев мышью.'],
      ['Арты из символов', 'Рисуй прямо на сетке символами, которые Dota действительно показывает, или вставь готовый арт из библиотеки.'],
      ['Картинка в ASCII-арт', 'Загрузи любую картинку — редактор сам переведёт её в символы для сетки.'],
      ['Сетка «По мете»', 'Герои по ролям и винрейту текущего патча по данным STRATZ — за один клик.'],
      ['Без установки', 'Всё работает в браузере, файлы сохраняются в «Студии», а со входом — в аккаунте на любом устройстве.'],
    ],
    steps: ['Открой редактор и создай файл в «Студии» (или открой готовую сетку из мастерской).', 'Добавь группы, перетащи героев, при желании — арт из символов.', 'Нажми «Экспортировать» — скачается файл hero_grid_config.json. Как положить его в игру — в инструкции «Как поставить сетку героев в Dota 2».', 'В Dota 2 открой «Герои» и выбери свою сетку в списке «Сортировка» внизу слева.'],
    faq: [
      ['Это бесплатно?', 'Да, полностью: редактор, мастерская и установка — без оплаты и без регистрации. Вход нужен только чтобы публиковать работы и хранить файлы в аккаунте.'],
      ['Нужно что-то скачивать?', 'Нет, редактор работает в браузере. Скачивается только сам файл сетки hero_grid_config.json.'],
      ['Можно ли сделать несколько сеток?', 'Да: в одном файле может быть сколько угодно сеток, в игре они переключаются в списке «Сортировка».'],
      ['Забанят ли за свою сетку?', 'Нет. Сетка героев — встроенная функция Dota 2, редактор лишь собирает тот же файл, который игра пишет сама.'],
      ['Где взять готовые сетки?', 'В мастерской GridStudio сотни сеток от пользователей: любую можно скачать или открыть в редакторе и переделать под себя.'],
    ],
  },
  'kak-postavit-setku-geroev': {
    title: 'Как поставить сетку героев в Dota 2 — папка, файл и команда',
    h1: 'Как поставить сетку героев в Dota 2',
    lead: 'Сетка героев хранится в одном файле — hero_grid_config.json в папке твоего аккаунта Steam. Поставить её можно вручную или одной командой PowerShell, которая всё сделает сама.',
    image: 'workshop', cta: { href: '/grids', text: 'Выбрать сетку' }, more: { href: '/editor', text: 'Сделать свою' },
    sections: [
      ['Способ 1. Командой PowerShell (Windows)', ['На странице сетки нажми «Как поставить в Dota» → «Командой PowerShell» и скопируй команду.', 'Нажми Win, набери PowerShell и нажми Enter.', 'Вставь команду и нажми Enter. Она сама найдёт папку аккаунта, открытого сейчас в Steam, попросит закрыть Dota 2 и заменит сетки, а прежние сохранит копией.']],
      ['Способ 2. Файлом вручную', ['Скачай сетку — браузер сохранит файл hero_grid_config.json в «Загрузки».', 'Открой папку Steam\\userdata\\<ID аккаунта>\\570\\remote\\cfg. ID аккаунта — это код друга в Dota 2; на сайте можно вставить ссылку на профиль Steam, и он покажет точный путь.', 'Закрой Dota 2 и положи файл в эту папку с заменой. Имя должно быть ровно hero_grid_config.json — если браузер назвал его «hero_grid_config (1).json», убери « (1)».']],
      ['После установки', ['Запусти Dota 2, открой «Герои» и выбери сетку в списке «Сортировка» внизу слева.']],
    ],
    faq: [
      ['Сетка не появилась — что делать?', 'Проверь, что Dota 2 была закрыта, когда ты клал файл, что файл называется ровно hero_grid_config.json и что он лежит в папке того аккаунта Steam, под которым ты играешь.'],
      ['Пропадут ли мои старые сетки?', 'Файл заменяется целиком. Команда PowerShell сохраняет прежний файл копией и даёт команду, чтобы вернуть его. Чтобы оставить свои сетки, открой новую в редакторе: она добавится к твоему файлу.'],
      ['Где найти ID аккаунта?', 'Это код друга в Dota 2 (вкладка «Друзья»). Или вставь на сайте ссылку на свой профиль Steam — путь к папке найдётся сам.'],
      ['Это безопасно?', 'Да: сетка героев — встроенная функция игры, файл тот же, что Dota 2 создаёт сама.'],
    ],
  },
  'fon-glavnogo-menyu-dota-2': {
    title: 'Как сделать свой фон главного меню Dota 2 — живые обои из видео и GIF',
    h1: 'Свой фон главного меню Dota 2',
    lead: 'В Dota 2 нет настройки фона меню, но его можно заменить своим: картинкой, GIF или видео. GridStudio собирает готовый файл для игры прямо в браузере — ничего не загружается на сервер.',
    image: 'background', cta: { href: '/background', text: 'Сделать фон' }, more: { href: '/backgrounds', text: 'Готовые фоны' },
    features: [
      ['Картинка, GIF или видео', 'PNG, JPEG, WebP, GIF, MP4 и WebM до 50 МБ. Из видео выбираешь отрезок до 30 секунд, звук убирается.'],
      ['Превью как в игре', 'Видно меню Dota с твоим фоном: кадр можно двигать, масштабировать, размыть и затемнить.'],
      ['За героем и под сеткой', 'Можно заменить фон и на странице героя, и под сеткой героев — в том же файле.'],
      ['Готовые фоны', 'В мастерской сотни фонов от пользователей: аниме, Dota 2, природа, космос.'],
    ],
    steps: ['Открой конструктор и перетащи картинку, GIF или видео (или выбери готовый фон в мастерской).', 'Выбери пропорции экрана и кадр, при желании — размытие и затемнение.', 'Нажми «Собрать фон»: скачается файл pak02_dir.vpk.', 'Поставь его командой PowerShell — или вручную: в папке Dota 2 зайди в game, создай там dota_russian (если её нет) и положи файл туда.', 'Поставь в Dota русский язык озвучки и перезапусти игру.'],
    faq: [
      ['Почему нужна русская озвучка?', 'Моды Dota 2 читает только из папки языка озвучки, а папку для английского не читает. Интерфейс при этом может остаться английским.'],
      ['Как убрать фон?', 'Удали файл pak02_dir.vpk из папки game\\dota_russian и перезапусти игру.'],
      ['Фон пропал после обновления', 'После крупного обновления Dota меню иногда меняется: удали файл и собери фон заново — настройки сохранены в «Студии».'],
      ['Это безопасно?', SAFE],
    ],
  },
  'shrift-dota-2': {
    title: 'Как поменять шрифт в Dota 2 — любой шрифт с кириллицей',
    h1: 'Поменять шрифт в Dota 2',
    lead: 'Шрифт чата, меню и сетки героев в Dota 2 можно заменить своим. GridStudio показывает, как он будет выглядеть в игре, и собирает архив под имена файлов Dota — в браузере, бесплатно.',
    image: 'font', cta: { href: '/background?tab=font', text: 'Выбрать шрифт' }, more: { href: '/guides', text: 'Гайды по оформлению' },
    features: [
      ['Готовые шрифты с кириллицей', 'Подборка свободных шрифтов, которые нормально выглядят в Dota.'],
      ['Свой шрифт', 'Загрузи любой TTF или OTF — подойдут статичные шрифты (вариативные Dota не понимает).'],
      ['Превью в игре', 'Видно чат, меню и сетку героев с выбранным шрифтом до установки.'],
    ],
    steps: ['Открой страницу шрифта и выбери шрифт или загрузи свой.', 'Нажми «Скачать шрифт для Dota» — или получи команду PowerShell, которая поставит шрифт сама.', 'Вручную: в Steam открой Dota 2 → «Свойства» → «Установленные файлы» → «Обзор», зайди в game\\dota\\panorama\\fonts, сохрани копию папки и скопируй туда файлы из архива с заменой.', 'Если есть папка %TEMP%\\fontconfig — удали её, затем перезапусти Dota 2.'],
    faq: [
      ['Как вернуть стандартный шрифт?', 'В Steam: Dota 2 → «Свойства» → «Установленные файлы» → «Проверить целостность файлов игры». Или вставь в PowerShell команду возврата с сайта.'],
      ['Шрифт не поменялся', 'Удали папку %TEMP%\\fontconfig (вставь %TEMP% в адресную строку проводника) и перезапусти игру.'],
      ['Это безопасно?', SAFE],
    ],
  },
};
export const seoGuidePaths = () => Object.keys(SEO_GUIDES).map((slug) => `/${slug}`);

export function seoGuide(slug, { origin }) {
  const page = SEO_GUIDES[slug];
  if (!page) return null;
  const url = `${origin}/${slug}`, image = `${origin}/assets/og/${page.image}.jpg`;
  const steps = page.steps || page.sections.flatMap(([, list]) => list);
  const structured = [
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: page.h1, description: page.lead, image, step: steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })) },
  ];
  const others = Object.entries(SEO_GUIDES).filter(([key]) => key !== slug).map(([key, other]) => `<a href="/${key}">${escape(other.h1)}</a>`).join(' · ');
  const body = [
    page.features ? `<ul class="features">${page.features.map(([name, text]) => `<li><b>${escape(name)}</b><span>${escape(text)}</span></li>`).join('')}</ul>` : '',
    page.steps ? `<h2>Как это сделать</h2><ol>${page.steps.map((step) => `<li>${escape(step)}</li>`).join('')}</ol>` : '',
    ...(page.sections || []).map(([title, list]) => `<h2>${escape(title)}</h2><ol>${list.map((step) => `<li>${escape(step)}</li>`).join('')}</ol>`),
    `<h2>Частые вопросы</h2><dl class="faq">${page.faq.map(([q, a]) => `<dt>${escape(q)}</dt><dd>${escape(a)}</dd>`).join('')}</dl>`,
  ].join('\n');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(page.title)} | GridStudio</title><meta name="description" content="${escape(page.lead)}"><link rel="canonical" href="${escape(url)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="GridStudio"><meta property="og:locale" content="ru_RU"><meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.lead)}"><meta property="og:url" content="${escape(url)}"><meta property="og:image" content="${escape(image)}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#15141a"><style>${STYLE}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,520px);gap:32px;align-items:center;margin-top:26px}.hero img{width:100%;height:auto;border-radius:14px;border:1px solid #ffffff1c}
.features{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin:28px 0 0;padding:0;list-style:none}.features li{display:grid;gap:4px;padding:14px 16px;border:1px solid #ffffff1c;border-radius:12px;background:#1b1922}.features span{color:#afa7bf;font-size:14px}
ol li{margin:6px 0}.faq{display:grid;gap:14px;margin:0}.faq dt{font-weight:600}.faq dd{margin:4px 0 0;color:#afa7bf}.others{color:#afa7bf}.others a{color:#c4b5ed}
@media(max-width:860px){.hero{grid-template-columns:1fr}}</style>
${structured.map((item) => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`).join('')}</head><body>
<header><a href="/">GridStudio</a><nav><a href="/editor">Редактор</a><a href="/grids">Сетки героев</a><a href="/backgrounds">Фоны</a><a href="/workshop">Мастерская</a><a href="/guides">Гайды</a><a href="/dotadle">Dotadle</a></nav></header>
<main><div class="hero"><div><h1>${escape(page.h1)}</h1><p class="lead">${escape(page.lead)}</p>
<p class="cta"><a href="${page.cta.href}">${escape(page.cta.text)}</a><a href="${page.more.href}">${escape(page.more.text)}</a></p></div>
<img src="${escape(image)}" alt="${escape(page.h1)}" width="1200" height="630"></div>
${body}
<h2>Ещё о Dota 2 на GridStudio</h2><p class="others">${others}</p>
</main><footer>GridStudio — сетки героев, фоны и шрифты для Dota 2. Бесплатно, в браузере.</footer>${counter(`seo:guide/${slug}`)}</body></html>`;
}
