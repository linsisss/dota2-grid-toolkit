// The eighth in-game test (2026-11-02): Valve's own panels set by hand, as the site builds them (menu-background.mjs
// menuValve; the owner: «передвинуть чат, руками выбрать размеры блоков квортеро, карнавала, драгать ГЕРОИ, АРСЕНАЛ,
// ПРОСМОТР между собой»; a user's idea: the cards as small icons). Four folders, a menu pack each:
//   1. chat-vkladki — the chat moved left and up, the tabs in another order (ИГРОТЕКА, ГЕРОИ, АРСЕНАЛ, ПРОСМОТР, БАЗА ЗНАНИЙ);
//   2. znachki — both news cards as small square icons (Dark Carnival's emblem, Quartero's level shield);
//   3. razmery — the cards smaller: Dark Carnival at 60 %, Quartero at 75 %;
//   4. shablony — test 7's templates fixed: their link buttons with real addresses, «Мой профиль» by DOTAShowProfilePage,
//      the name on one line; and a ready «Мой профиль» shortcut.
//   node scripts/make-widget-test-8.mjs <out.zip>
import { readFileSync, writeFileSync } from 'node:fs';
import { menuBackgroundPack } from './menu-background.mjs';
import { designWidget, newWidget, widgetsPanorama } from './menu-widgets.mjs';
import { WIDGET_TEMPLATES, templateDesign } from '../src/constructor/widget-templates.js';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const out = process.argv[2] || 'gridstudio-widget-test-8.zip';
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const base = { video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), frontpage: read('frontpage_contents.css'), contents: read('frontpage_contents.xml'),
  banners: { carnival: read('front_page_dark_carnival.xml'), season: read('front_page_seasonal_reward_line.xml') }, news: { carnival: true, season: true }, md5 };
const pack = (valve) => menuBackgroundPack({ ...base, valve });
const parts = [
  ['1-chat-vkladki', pack({ chat: { x: -320, y: -80 }, tabs: ['mods', 'heroes', 'collection', 'watch', 'learn'] })],
  ['2-znachki', pack({ cards: { carnival: { icon: true, size: 96 }, season: { icon: true, size: 110 } } })],
  ['3-razmery', pack({ cards: { carnival: { scale: 60 }, season: { scale: 75 } } })]
];
const [stream, profile, countdown, links] = WIDGET_TEMPLATES().map((template) => designWidget(templateDesign(template)));
const shortcut = { ...newWidget('shortcut'), x: 1250, y: 380, w: 260, h: 52, props: { ...newWidget('shortcut').props, label: 'Мой профиль', action: 'profile' } };
const made = widgetsPanorama([{ ...stream, x: 430, y: 110 }, { ...profile, x: 790, y: 110 }, { ...links, x: 1250, y: 110 }, { ...countdown, x: 790, y: 400 }, shortcut], { lang: 'ru' });
parts.push(['4-shablony', menuBackgroundPack({ ...base, widgets: { made, media: [] }, md5 })]);
const README = `Тест 8 главного меню GridStudio — ${new Date().toISOString().slice(0, 10)}: панели Valve, настроенные руками

Четыре папки, ставь по одной, как раньше: Dota закрыта, папку game из папки проверки — в "dota 2 beta" с заменой, запусти Dota.
Твой фон меню на время теста пропадёт: в конце вставь команду с сайта ещё раз.

1-chat-vkladki — чат внизу сдвинут влево и чуть вверх; вкладки сверху в порядке ИГРОТЕКА, ГЕРОИ, АРСЕНАЛ, ПРОСМОТР,
   БАЗА ЗНАНИЙ. Понажимай вкладки (открывается то, что написано?) и открой «Играть» — чат должен уехать как обычно.
2-znachki — вместо двух карточек справа два квадратика: эмблема Dark Carnival и щит уровня Квортеро. Нажми на каждый —
   открывается ли событие и награды, как от карточек.
3-razmery — карточки справа меньше: Dark Carnival на 60 %, Квортеро на 75 % и сразу под ней.
4-shablony — шаблоны из теста 7 с исправлениями: «Смотреть на Twitch» и «Смотреть» открывают ссылки, «Мой профиль» —
   твой профиль (и в шаблоне, и отдельная кнопка-ярлык справа), ник в одну строку.

Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = parts.map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.map((e) => `${e.name.split('/')[0]} ${(e.data.length / 1024).toFixed(0)} КБ`).join(', ')}`);
