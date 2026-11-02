// The tenth in-game test (2026-11-02), as the site builds it:
//   1. dvizhenie — Valve's panels dragged: the friends rail with the party bar (right 120), the news column (left 160, down 60);
//      «Играть» no longer moves (test 10: its search window went under the top bar);
//   2. vidzhety — the ready widgets' new looks: a clock with hands on a dial (with its ground, and without), the one-line timer,
//      «Последний матч» as GridStudio's card and as Dota's, «Мой профиль» (the script's way, test 9 P6) as a shortcut.
//   node scripts/make-widget-test-10.mjs <out.zip>
import { readFileSync, writeFileSync } from 'node:fs';
import { menuBackgroundPack } from './menu-background.mjs';
import { newWidget, widgetsPanorama } from './menu-widgets.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const out = process.argv[2] || 'gridstudio-widget-test-10.zip';
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const base = { video: null, dashboard: read('dashboard.xml'), home: read('dashboard_page_home.xml'), frontpage: read('frontpage_contents.css'), contents: read('frontpage_contents.xml'),
  banners: { carnival: read('front_page_dark_carnival.xml'), season: read('front_page_seasonal_reward_line.xml') }, lastmatch: read('frontpage_lastmatch.css'), news: { carnival: true, season: true }, md5 };
const one = menuBackgroundPack({ ...base, valve: { friends: { x: 120, y: 0 }, news: { x: -160, y: 60 } } });

const pad = (n) => String(n).padStart(2, '0'), soon = new Date(Date.now() + 3 * 86400_000 + 5 * 3600_000);
const until = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
const place = (type, x, y, w, h, props) => { const widget = newWidget(type); return { ...widget, x, y, ...(w ? { w, h } : {}), props: { ...widget.props, ...props } }; };
const widgets = [
  place('clock', 440, 110, 220, 220, { look: 'round', seconds: true, date: true, panel: true, color: '#e8c66a' }),
  place('clock', 680, 110, 180, 180, { look: 'round', seconds: false, date: false, panel: false, color: '#7cc4f2' }),
  place('timer', 880, 110, 320, 100, { look: 'line', title: 'До The International', until, color: '#e8c66a' }),
  place('lastMatch', 440, 360, 0, 0, { look: 'gridstudio' }),
  place('lastMatch', 800, 360, 0, 0, { look: 'dota' }),
  place('shortcut', 1160, 360, 260, 52, { label: 'Мой профиль', action: 'profile', style: 'panel', color: '#e8c66a' })
];
const two = menuBackgroundPack({ ...base, widgets: { made: widgetsPanorama(widgets, { lang: 'ru' }), media: [] } });

const README = `Тест 10 главного меню GridStudio — ${new Date().toISOString().slice(0, 10)}

Две папки, ставь по одной: Dota закрыта, папку game из папки проверки — в "dota 2 beta" с заменой, запусти Dota.
Фон меню на время теста пропадёт: в конце вставь команду с сайта ещё раз.

1-dvizhenie — панели Valve перетащены: друзья вместе с группой внизу правее на 120, колонка новостей левее на 160 и
   ниже на 60. «Играть» на месте (её больше не двигаем). Открой «Играть» и мини-профиль — всё ли на своих местах?
2-vidzhety — «Последний матч» слева в виде GridStudio, справа — как в Dota (должны отличаться); часы со стрелками,
   таймер строкой; кнопка «Мой профиль» (должна открыть твой профиль).

Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = [['1-dvizhenie', one], ['2-vidzhety', two]].map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.map((e) => `${e.name.split('/')[0]} ${(e.data.length / 1024).toFixed(0)} КБ`).join(', ')}`);
