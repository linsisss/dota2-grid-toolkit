// Link previews (Open Graph) of the site's pages (asked for on 2026-10-03: «чтобы у всех вкладок сайта
// было своё ОГ оформление»): each page and each tab with an address of its own gets its title,
// description and picture. One list for the three places that use it:
// - scripts/make-og-image.mjs draws assets/og/<image>.jpg from `headline`, `text`, `label` and `shot`;
// - the build (vite.config.mjs) writes the tags into the pages' HTML (`entry`);
// - the API (server/catalog-api.mjs) answers the tabs that share a page with another
//   (/workshop?backgrounds, /workshop?rules, /background?tab=font): nginx sends them there.
// A shared work, guide or profile has its own picture (server/link-preview.mjs).
export const OG_SIZE = [1200, 630];

// `shot`: a screenshot from assets/og-src (or another assets path) and the part of it shown, in its
// pixels, 16:9. `image`: the picture's name when it is another page's.
export const OG_PAGES = {
  home: {
    entry: 'index.html', path: '/',
    title: 'GridStudio — сетки героев, фоны и шрифты для Dota 2',
    description: 'Собери свою сетку героев, фон главного меню или шрифт для Dota 2 в браузере — или возьми готовое в мастерской. Бесплатно.',
    alt: 'GridStudio — редактор сеток героев Dota 2',
  },
  editor: {
    entry: 'editor.html', path: '/editor', label: 'Студия', icon: 'studio',
    title: 'Студия — редактор сеток героев Dota 2',
    description: 'Собери свою сетку героев Dota 2 прямо в браузере: группы героев, рисунки из символов, ASCII-арты из картинок и сетка «По мете». Бесплатно.',
    alt: 'Редактор сеток героев GridStudio',
    headline: ['Редактор', 'сеток героев', 'для Dota 2'],
    text: ['Герои, рисунки из символов', 'и ASCII-арты из картинок —', 'прямо в браузере, бесплатно.'],
    shot: { file: 'assets/readme/editor.webp', crop: [150, 150, 2130, 1198] },
  },
  workshop: {
    entry: 'catalog.html', path: '/workshop', label: 'Мастерская', icon: 'workshop',
    title: 'Мастерская — сетки героев Dota 2',
    description: 'Сетки героев Dota 2 от пользователей. Поставь любую за пару кликов, открой в редакторе и переделай под себя или создай свою.',
    alt: 'Сетки героев в мастерской GridStudio',
    headline: ['Сетки героев', 'от пользователей'],
    text: ['Поставь любую в Dota 2', 'за пару кликов или открой', 'в редакторе и переделай.'],
    shot: { file: 'assets/og-src/workshop.webp', crop: [0, 0, 1720, 968] },
  },
  backgrounds: {
    path: '/workshop?backgrounds', label: 'Мастерская', icon: 'workshop',
    title: 'Мастерская — фоны главного меню Dota 2',
    description: 'Анимированные фоны главного меню Dota 2 от пользователей. Поставь любой за пару кликов или собери свой.',
    alt: 'Фоны главного меню в мастерской GridStudio',
    headline: ['Фоны меню', 'от пользователей'],
    text: ['Живые фоны главного меню', 'Dota 2 — бери готовый', 'или опубликуй свой.'],
    shot: { file: 'assets/og-src/workshop-backgrounds.webp', crop: [0, 0, 1720, 968] },
  },
  rules: {
    path: '/workshop?rules', image: 'workshop',
    title: 'Правила мастерской',
    description: 'Что можно публиковать в мастерской GridStudio и как проверяются сетки и фоны.',
    alt: 'Сетки героев в мастерской GridStudio',
  },
  background: {
    entry: 'customize.html', path: '/background', label: 'Фон меню', icon: 'image',
    title: 'Свой фон главного меню Dota 2',
    description: 'Собери фон главного меню из картинки, GIF или видео, посмотри его в меню игры и поставь в Dota 2 за пару кликов.',
    alt: 'Конструктор фона главного меню GridStudio',
    headline: ['Свой фон', 'главного меню', 'Dota 2'],
    text: ['Из картинки, GIF или видео.', 'Смотри, как он выглядит', 'в меню, и ставь в пару кликов.'],
    shot: { file: 'assets/readme/background.webp', crop: [36, 145, 1144, 643] },
  },
  font: {
    path: '/background?tab=font', label: 'Шрифт', icon: 'font',
    title: 'Свой шрифт в Dota 2',
    description: 'Поменяй шрифт Dota 2: выбери из каталога или загрузи свой .ttf / .otf, посмотри его в меню и в матче и поставь за пару кликов.',
    alt: 'Выбор шрифта для Dota 2 в GridStudio',
    headline: ['Свой шрифт', 'в Dota 2'],
    text: ['Выбери из каталога или загрузи', 'свой .ttf / .otf — и посмотри', 'его в меню и в матче.'],
    shot: { file: 'assets/readme/fonts.webp', crop: [36, 145, 1144, 643] },
  },
  guides: {
    entry: 'guides.html', path: '/guides', label: 'Гайды', icon: 'guides',
    title: 'Гайды по оформлению Dota 2',
    description: 'Как оформить профиль, минипрофиль и всё остальное в Dota 2 — гайды пользователей GridStudio.',
    alt: 'Гайды по оформлению Dota 2 на GridStudio',
    headline: ['Гайды', 'по оформлению', 'Dota 2'],
    text: ['Как оформить профиль,', 'минипрофиль и всё остальное —', 'от тех, кто уже разобрался.'],
    shot: { file: 'assets/og-src/guides.webp', crop: [0, 0, 1720, 968] },
  },
};

// The picture's file name (assets/og/<name>.jpg).
export const ogImage = (key) => OG_PAGES[key].image || key;

// A page's tags: title, description, address, picture.
export function pageMeta(key, origin = 'https://gridstudio.me') {
  const page = OG_PAGES[key];
  return { title: page.title, description: page.description, url: `${origin}${page.path}`, image: `${origin}/assets/og/${ogImage(key)}.jpg`, alt: page.alt };
}

// The tab of a page the API answers (nginx sends only these here, and shared works).
export function tabOf(page, params) {
  if (page === 'workshop') return params.has('backgrounds') ? 'backgrounds' : params.has('rules') ? 'rules' : null;
  if (page === 'customize') return params.get('tab') === 'font' ? 'font' : null;
  return null;
}

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// The page with its Open Graph / Twitter tags and canonical address replaced; `head` also replaces the
// title and the description (a shared work's page, a tab).
export function ogTags(html, { title, description, url, image, alt }, { head = false } = {}) {
  const [width, height] = OG_SIZE;
  const properties = [['og:type', 'website'], ['og:site_name', 'GridStudio'], ['og:locale', 'ru_RU'], ['og:title', title], ['og:description', description],
    ['og:url', url], ['og:image', image], ['og:image:type', 'image/jpeg'], ['og:image:width', width], ['og:image:height', height], ['og:image:alt', alt]];
  const names = [['twitter:card', 'summary_large_image'], ['twitter:title', title], ['twitter:description', description], ['twitter:image', image]];
  const tags = [...properties.map(([p, v]) => `<meta property="${p}" content="${escape(v)}"/>`), ...names.map(([n, v]) => `<meta name="${n}" content="${escape(v)}"/>`), `<link rel="canonical" href="${escape(url)}"/>`];
  let out = html
    .replace(/\n[ \t]*<meta\s+(?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace(/\n[ \t]*<link\s+rel="canonical"[^>]*>/g, '');
  if (head) out = out
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)} — GridStudio</title>`)
    .replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${escape(description)}"/>`);
  return out.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
}
