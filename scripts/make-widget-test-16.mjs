// The sixteenth in-game test (2026-11-03): test 15 again after the owner's look at it —: «Мета героев» ready for the release, made the way the site makes it
// (menu-background.mjs menuBackgroundPack with `meta`, scripts/meta-widget.mjs): up to 40 heroes a position sorted by
// win rate or pick rate, RU/EN in the widget, the accent, the tab's side and height, the hero on STRATZ, «Powered by
// STRATZ» and «by gridstudio.me» below. Two folders:
//   1-left-gold       the defaults: left, near the top, gold, Russian;
//   2-right-sapphire  on the right, lower (70 %), sapphire, English.
//   node scripts/make-widget-test-16.mjs <out.zip> [--origin https://dev.gridstudio.me]
import { readFileSync, writeFileSync } from 'node:fs';
import { menuBackgroundPack } from './menu-background.mjs';
import { metaSettings } from './meta-widget.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-16.zip';
const origin = option('--origin') || 'https://dev.gridstudio.me';
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const pack = (settings) => menuBackgroundPack({ video: null, dashboard: read('dashboard.xml'), md5,
  meta: { ...metaSettings({ heroes: true, pick: true, ...settings }), origin, page: read('dashboard_page_heroes.xml'), pregame: read('dota_hud_pregame.js'), logo: read('icons/stratz.svg') } });
const parts = [['1-left-gold', pack({})], ['2-right-sapphire', pack({ side: 'right', top: 70, accent: '#5aa9ff', lang: 'en' })]];
const README = `Тест 16 GridStudio — ${new Date().toISOString().slice(0, 10)}: «Мета героев» — предметы как на STRATZ, настройки в игре

Две папки, ставь по одной: Dota закрыта, папку game — в "dota 2 beta" с заменой, запусти Dota. Потом верни своё командой с сайта.
1-left-gold — как по умолчанию; 2-right-sapphire — справа ниже, синий, английский.

- Сортировка: нажимай на «Пикрейт» / «Винрейт» над колонками (и над предметами героя).
- Предметы героя — как на STRATZ: старт, обувь, ранние 0–15, середина 15–35, поздние 35+, под каждым процент.
- «Открыть на STRATZ» (логотип STRATZ) — страница героя.
- Шестерёнка вверху окна: акцент, место вкладки (нажми на маленький экран), язык, «Как в файле с сайта».
- Вкладку можно перетащить мышью вверх-вниз и на другую сторону экрана.
- Перезапусти Dota: акцент, место, язык и сортировка должны остаться (сохраняются на компьютере).
Скриншоты: список, предметы героя, настройки, вкладка после перетаскивания.

Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = parts.map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.map((e) => `${e.name.split('/')[0]} ${(e.data.length / 1024).toFixed(0)} КБ`).join(', ')}`);
