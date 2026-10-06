// Pages for search engines (1.8.18; nearly all visitors come from Google and Yandex): /backgrounds and
// /grids with a page per workshop tag, drawn here as plain HTML — a title, a paragraph, the most liked
// items with their pictures and links — so a crawler reads them without JavaScript. Also robots.txt
// and sitemap.xml (the site had neither: both answered with the home page). Nothing 18+ is listed.
// nginx sends /backgrounds, /grids, /robots.txt and /sitemap.xml to /api/catalog/seo/….
const ADULT = '18+';
const BACKGROUND_COPY = {
  '': { tag: '', h1: 'Фоны для главного меню Dota 2', title: 'Живые фоны для меню Dota 2 — скачать бесплатно',
    text: 'Видео и картинки для главного меню Dota 2 от пользователей GridStudio. Выбери фон, и сайт соберёт файл для Dota прямо в браузере. Поставить его можно командой PowerShell или вручную. Можно сделать и свой фон из любого видео, GIF или картинки.' },
  anime: { tag: 'Аниме', h1: 'Аниме фоны для Dota 2', title: 'Аниме фоны для меню Dota 2 — живые обои',
    text: 'Аниме-обои для главного меню Dota 2: живые видео и картинки с персонажами из аниме. Любой фон ставится в игру за пару минут, а свой можно собрать из ролика с MoeWalls или MotionBGs.' },
  'dota-2': { tag: 'Dota 2', h1: 'Фоны с героями Dota 2', title: 'Фоны с героями Dota 2 для главного меню',
    text: 'Фоны главного меню с героями и артами Dota 2: арканы, персоны, сцены из трейлеров. Сайт собирает файл в браузере, и фон появляется в меню после перезапуска игры.' },
  games: { tag: 'Игры', h1: 'Фоны из других игр для Dota 2', title: 'Фоны из игр для меню Dota 2',
    text: 'Фоны главного меню Dota 2 из других игр. Выбери понравившийся и поставь его в Dota за пару минут или собери свой из любого видео.' },
  cute: { tag: 'Милота', h1: 'Милые фоны для Dota 2', title: 'Милые фоны для меню Dota 2',
    text: 'Уютные и милые фоны для главного меню Dota 2: котики, пиксель-арт, спокойные анимации. Все бесплатно, ставятся в игру за пару минут.' },
  memes: { tag: 'Мемы', h1: 'Мемные фоны для Dota 2', title: 'Мемные фоны для меню Dota 2',
    text: 'Мемы на главном экране Dota 2: смешные видео и картинки от пользователей GridStudio. Выбери фон и поставь его в игру.' },
  'dead-inside': { tag: 'Dead inside', h1: 'Dead inside фоны для Dota 2', title: 'Dead inside фоны для меню Dota 2',
    text: 'Мрачные dead inside фоны для главного меню Dota 2: тёмные аниме-сцены, дождь, одиночество. Ставятся в игру за пару минут.' },
  nature: { tag: 'Природа', h1: 'Фоны с природой для Dota 2', title: 'Фоны с природой для меню Dota 2',
    text: 'Спокойные фоны с природой для главного меню Dota 2: лес, трава, вода, закаты. Живые обои, которые не отвлекают от поиска игры.' },
  space: { tag: 'Космос', h1: 'Космические фоны для Dota 2', title: 'Космические фоны для меню Dota 2',
    text: 'Космос в главном меню Dota 2: звёзды, туманности и планеты. Выбери фон или собери свой из любого видео.' },
  abstract: { tag: 'Абстракция', h1: 'Абстрактные фоны для Dota 2', title: 'Абстрактные фоны для меню Dota 2',
    text: 'Абстрактные живые фоны для главного меню Dota 2: градиенты, волны, геометрия. Не перебивают интерфейс и ставятся за пару минут.' },
};
const GRID_COPY = {
  '': { tag: '', h1: 'Сетки героев для Dota 2', title: 'Сетки героев Dota 2 — готовые и свои',
    text: 'Готовые сетки героев Dota 2 от пользователей GridStudio: с артами из символов, рамками и удобной раскладкой героев. Любую можно скачать и поставить в игру или открыть в редакторе и переделать под себя.' },
  anime: { tag: 'Аниме', h1: 'Аниме сетки героев для Dota 2', title: 'Аниме сетки героев Dota 2',
    text: 'Сетки героев Dota 2 с аниме-артами из символов. Скачай готовую или открой её в редакторе и поменяй героев под себя.' },
  cute: { tag: 'Милота', h1: 'Милые сетки героев для Dota 2', title: 'Милые сетки героев Dota 2',
    text: 'Милые сетки героев для Dota 2: котики, сердечки и рисунки из символов прямо на экране выбора героя.' },
  frames: { tag: 'Рамки', h1: 'Сетки героев с рамками для Dota 2', title: 'Сетки героев с рамками для Dota 2',
    text: 'Сетки героев Dota 2, где герои разложены по аккуратным рамкам. Удобно искать нужного героя на пике, а сетка смотрится чисто.' },
  'hero-focused': { tag: 'С упором на героя', h1: 'Сетки с упором на героя для Dota 2', title: 'Сетки героев Dota 2 с упором на героя',
    text: 'Сетки героев Dota 2, собранные вокруг одного героя: большой арт и герои под рукой. Для тех, кто играет на любимом персонаже.' },
  memes: { tag: 'Мемы', h1: 'Мемные сетки героев для Dota 2', title: 'Мемные сетки героев Dota 2',
    text: 'Смешные сетки героев для Dota 2 с мемами из символов. Удиви тиммейтов на экране выбора героя.' },
  'dead-inside': { tag: 'Dead inside', h1: 'Dead inside сетки героев для Dota 2', title: 'Dead inside сетки героев Dota 2',
    text: 'Мрачные dead inside сетки героев для Dota 2: тёмные арты из символов на экране выбора героя.' },
};
export const SEO_SECTIONS = {
  backgrounds: { copy: BACKGROUND_COPY, label: 'Фоны', more: { href: '/workshop?backgrounds', text: 'Все фоны в мастерской' }, make: { href: '/background', text: 'Сделать свой фон' },
    steps: ['Открой фон и нажми «Скачать»: файл для Dota соберётся прямо в браузере.', 'Поставь его командой PowerShell (она сама найдёт Dota) или вручную по инструкции на сайте.', 'Перезапусти Dota 2: фон появится в главном меню.'] },
  grids: { copy: GRID_COPY, label: 'Сетки героев', more: { href: '/workshop', text: 'Все сетки в мастерской' }, make: { href: '/editor', text: 'Собрать свою сетку' },
    steps: ['Открой сетку и нажми «Скачать грид».', 'Положи файл в папку Dota по инструкции на странице сетки (сайт подскажет путь для твоего Steam).', 'Перезапусти Dota 2: сетка появится на экране выбора героя.'] },
};

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const adult = (item) => (item.tags || []).includes(ADULT);
const authorName = (item) => item.creator?.name || item.author || '';
const count = (n) => Number(n || 0).toLocaleString('ru-RU');

// The section's items: the most liked first, 18+ left out. `list(page)` is the workshop's own list.
function collect(list, want) {
  const items = [];
  for (let page = 0; items.length < want && page < 4; page++) {
    const result = list(page);
    items.push(...result.items.filter((item) => !adult(item)));
    if (result.items.length === 0 || (result.total !== undefined && (page + 1) * result.items.length >= result.total)) break;
  }
  return items.slice(0, want);
}
function card(section, item) {
  const grid = section === 'grids';
  const href = grid ? `/workshop?id=${item.id}` : `/background?background=${item.id}`;
  const image = grid ? `/api/catalog/preview/work/${item.id}.jpg?revision=${item.revision}` : `/api/catalog/backgrounds/${item.id}/poster.jpg`;
  const by = authorName(item);
  return `<li><a href="${href}"><img src="${image}" alt="${escape(`${grid ? 'Сетка героев' : 'Фон'} «${item.title}»`)}" loading="lazy" width="${grid ? 1200 : 640}" height="${grid ? 630 : 360}">`
    + `<b>${escape(item.title)}</b><span>${by ? `${escape(by)} · ` : ''}♥ ${count(item.likes)} · ↓ ${count(item.downloads)}</span></a></li>`;
}

const STYLE = `*{box-sizing:border-box}body{margin:0;background:#15141a;color:#efeaf5;font:15px/1.55 'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
a{color:inherit}header,main,footer{max-width:1180px;margin:0 auto;padding:0 20px}header{display:flex;flex-wrap:wrap;align-items:center;gap:10px 22px;padding-block:16px;border-bottom:1px solid #ffffff1c}
header>a{font-weight:600;font-size:17px;text-decoration:none}nav{display:flex;flex-wrap:wrap;gap:6px 18px;margin-left:auto;font-size:14px}nav a{text-decoration:none;color:#afa7bf}nav a:hover,nav a[aria-current]{color:#c4b5ed}
h1{margin:34px 0 10px;font-size:clamp(26px,4vw,38px);line-height:1.15}.lead{max-width:760px;margin:0 0 18px;color:#afa7bf;font-size:16px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 22px}.cta a{padding:9px 16px;border:1px solid #ffffff1c;border-radius:10px;text-decoration:none;background:#211e29}.cta a:first-child{background:#c4b5ed;color:#15141a;border-color:#c4b5ed;font-weight:600}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px;padding:0;list-style:none}.tags a{display:block;padding:5px 12px;border:1px solid #ffffff1c;border-radius:99px;font-size:13px;text-decoration:none;color:#afa7bf}.tags a[aria-current]{color:#15141a;background:#c4b5ed;border-color:#c4b5ed}
.items{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;margin:0;padding:0;list-style:none}.items a{display:grid;gap:6px;text-decoration:none}
.items img{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:12px;background:#211e29;border:1px solid #ffffff1c}.items b{font-weight:500}.items span{color:#afa7bf;font-size:13px}
h2{margin:40px 0 10px;font-size:22px}ol{margin:0;padding-left:22px;color:#afa7bf}ol li{margin:4px 0}.empty{color:#afa7bf}footer{margin-top:48px;padding-block:20px;border-top:1px solid #ffffff1c;color:#afa7bf;font-size:13px}`;

// The visit goes into the site's statistics like the other pages' (src/site-stats.js countVisit).
const counter = (page) => `<script>(function(){try{var k='gridstudio.visitor',v=localStorage.getItem(k);if(!/^[A-Za-z0-9_-]{22}$/.test(v||'')){v=btoa(String.fromCharCode.apply(null,crypto.getRandomValues(new Uint8Array(16)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');localStorage.setItem(k,v)}
var r='';try{var h=new URL(document.referrer).hostname;if(h&&h!==location.hostname)r=h}catch(e){}
fetch('/api/catalog/hit',{method:'POST',keepalive:true,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:${JSON.stringify(page)},referrer:r,mobile:matchMedia('(pointer: coarse)').matches,lang:'ru',visitor:v})}).catch(function(){})}catch(e){}})()</script>`;

// The page of a section and a tag's slug ('' for the whole section), or null for one there is none of.
// `list(section, tag, page)` gives the workshop's list (most liked first); `image`: the link preview.
export function seoPage(section, slug, { list, origin, image }) {
  const def = SEO_SECTIONS[section], copy = def?.copy[slug];
  if (!copy) return null;
  const path = `/${section}${slug ? `/${slug}` : ''}`, url = `${origin}${path}`;
  const items = collect((page) => list(section, copy.tag, page), 24);
  const title = `${copy.title} | GridStudio`;
  const tags = Object.entries(def.copy).map(([key, value]) => `<li><a href="/${section}${key ? `/${key}` : ''}"${key === slug ? ' aria-current="page"' : ''}>${escape(key ? value.tag : 'Все')}</a></li>`).join('');
  const other = section === 'grids' ? 'backgrounds' : 'grids';
  const structured = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: copy.h1, description: copy.text, url, inLanguage: 'ru',
    mainEntity: { '@type': 'ItemList', itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.title,
      url: `${origin}${section === 'grids' ? `/workshop?id=${item.id}` : `/background?background=${item.id}`}` })) } };
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="${escape(copy.text)}"><link rel="canonical" href="${escape(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="GridStudio"><meta property="og:locale" content="ru_RU"><meta property="og:title" content="${escape(copy.title)}">
<meta property="og:description" content="${escape(copy.text)}"><meta property="og:url" content="${escape(url)}"><meta property="og:image" content="${escape(image)}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#15141a"><style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script></head><body>
<header><a href="/">GridStudio</a><nav><a href="/backgrounds"${section === 'backgrounds' ? ' aria-current="page"' : ''}>Фоны</a><a href="/grids"${section === 'grids' ? ' aria-current="page"' : ''}>Сетки героев</a><a href="/workshop">Мастерская</a><a href="/guides">Гайды</a><a href="/dotadle">Dotadle</a><a href="/editor">Студия</a></nav></header>
<main><h1>${escape(copy.h1)}</h1><p class="lead">${escape(copy.text)}</p>
<p class="cta"><a href="${def.make.href}">${escape(def.make.text)}</a><a href="${def.more.href}">${escape(def.more.text)}</a></p>
<ul class="tags">${tags}</ul>
${items.length ? `<ul class="items">${items.map((item) => card(section, item)).join('')}</ul>` : '<p class="empty">Здесь пока пусто — загляни в мастерскую.</p>'}
<h2>Как поставить</h2><ol>${def.steps.map((step) => `<li>${escape(step)}</li>`).join('')}</ol>
<h2>Ещё для Dota 2</h2><p class="lead">${section === 'grids' ? 'Фон главного меню и шрифт тоже можно поменять:' : 'Сетку героев и шрифт тоже можно поменять:'} <a href="/${other}">${escape(SEO_SECTIONS[other].label)}</a> · <a href="/background?tab=font">Шрифт для Dota</a> · <a href="/guides">Гайды по оформлению</a></p>
</main><footer>GridStudio — сетки героев, фоны и шрифты для Dota 2. Бесплатно, в браузере.</footer>${counter(`seo:${section}${slug ? `/${slug}` : ''}`)}</body></html>`;
}

// Every SEO page's address, for the sitemap.
export const seoPaths = () => Object.entries(SEO_SECTIONS).flatMap(([section, def]) => Object.keys(def.copy).map((slug) => `/${section}${slug ? `/${slug}` : ''}`));

export const robotsText = (origin) => `User-agent: *\nDisallow: /api/\nAllow: /api/catalog/preview/\nAllow: /api/catalog/backgrounds/\nDisallow: /workshop?moderate\nDisallow: /landing\nDisallow: /design\n\nSitemap: ${origin}/sitemap.xml\n`;

// `entries`: [{ path, updated? (ms) }] beyond the fixed pages.
export function sitemapXML(origin, entries) {
  const fixed = ['/', '/editor', '/workshop', '/workshop?backgrounds', '/background', '/background?tab=font', '/guides', '/dotadle', ...seoPaths()].map((path) => ({ path }));
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const rows = [...fixed, ...entries].map(({ path, updated }) => `<url><loc>${escape(`${origin}${path}`)}</loc>${updated ? `<lastmod>${day(updated)}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}
