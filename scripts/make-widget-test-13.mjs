// The thirteenth in-game test (2026-11-02): «Мета героев» (scripts/meta-widget.mjs) on the «Герои» page and on the pick
// screen, with the data from the dev API (server/meta-widget.mjs, /api/catalog/w/meta and /w/build). Two folders:
//   1-meta         the «Герои» page with our script, and the pick screen's script replaced by Valve's + ours
//                  (panorama/scripts/hud/dota_hud_pregame.vts_c) — the way the site would ship it;
//   2-pick-layout  only if the pick screen showed no tab in 1: the pick screen's layout replaced instead (Valve's of
//                  27.10.2026 from dota_vpk_updates + an include of our own script), Valve's script left alone.
//   node scripts/make-widget-test-13.mjs <out.zip> [--origin https://dev.gridstudio.me] [--pregame-layout <dota_hud_pregame.xml>]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { newScript } from './panorama-laco.mjs';
import { GRID_PAGE } from './menu-background.mjs';
import { META_SCRIPT, PREGAME_SCRIPT, heroesPageMeta, metaWidgetScript, pregameScript } from './meta-widget.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-13.zip';
const origin = option('--origin') || 'https://dev.gridstudio.me';
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII: ${text.match(/[^\x00-\x7f]/)[0]}`); return text; };

const heroes = [
  { path: GRID_PAGE, data: panoramaResource(GRID_PAGE, ascii(heroesPageMeta(read('dashboard_page_heroes.xml')))) },
  { path: META_SCRIPT, data: newScript(META_SCRIPT, ascii(metaWidgetScript({ origin, where: 'heroes' }))) }
];
const one = buildVPK([...heroes, { path: PREGAME_SCRIPT, data: newScript(PREGAME_SCRIPT, ascii(pregameScript(read('dota_hud_pregame.js'), { origin }))) }], { version: 2, md5 });

const parts = [['1-meta', one]];
const layoutFile = option('--pregame-layout');
if (layoutFile) {
  const LAYOUT = 'panorama/layout/hud/dota_hud_pregame.vxml_c', PICK = 'panorama/scripts/gridstudio_pick.vjs_c';
  const valve = readFileSync(layoutFile, 'utf8').replace(/^<!--[^\n]*-->\r?\n/, '').replace(/(s2r:\/\/[^"]+\.(?:vcss|vxml|vjs))"/g, '$1_c"');
  const include = '<include src="s2r://panorama/scripts/hud/dota_hud_pregame.vts" />';
  if (valve.split(include).length !== 2) throw new Error('В dota_hud_pregame.xml нет скрипта экрана выбора.');
  const layout = valve.replace(include, `${include}\n\t\t<include src="s2r://${PICK.replace(/_c$/, '')}" />`);
  parts.push(['2-pick-layout', buildVPK([...heroes, { path: LAYOUT, data: panoramaResource(LAYOUT, ascii(layout)) },
    { path: PICK, data: newScript(PICK, ascii(metaWidgetScript({ origin, where: 'pick' }))) }], { version: 2, md5 })]);
}

const README = `Тест 13 GridStudio — ${new Date().toISOString().slice(0, 10)}: «Мета героев» в «Героях» и на выборе героя

Ставь как обычно: Dota закрыта, папку game из 1-meta — в "dota 2 beta" с заменой, запусти Dota.
Фон меню на время теста пропадёт: в конце вставь команду с сайта ещё раз.

1. Открой вкладку «ГЕРОИ». У левого края — маленькая вкладка «МЕТА» с тремя столбиками. Нажми:
   окно «Мета недели», пять позиций, по 10 героев с процентом побед. Переключи позиции.
   Нажми на героя — его сборка: старт, обувь, основные (с минутой), по ситуации. Наведи на предмет — подсказка?
   Закрой крестиком, открой снова.
2. Запусти игру с ботами (любую, где есть выбор героя). На экране выбора героя слева та же вкладка «МЕТА»:
   открой, посмотри, нажми на героя. Выбери героя как обычно — всё ли работает (выбор, время стратегии,
   загрузка)? После выбора окно меты должно исчезнуть вместе с экраном выбора.
3. Только если на экране выбора вкладки НЕ было: поставь вместо 1-meta папку 2-pick-layout и повтори пункт 2.

Скриншоты: «Герои» с открытым окном, сборка героя, экран выбора с окном.
Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = parts.map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.map((e) => `${e.name.split('/')[0]} ${(e.data.length / 1024).toFixed(0)} КБ`).join(', ')}`);
