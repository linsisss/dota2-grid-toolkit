// The in-game test before the main-menu constructor (2026-10-31, the owner: «конструктор главного меню …
// виджеты можно СОЗДАВАТЬ прямо на гридстудио»; d2pfx's Doom widget and Main Menu 7.00 Style showed the ways
// in). One ZIP with a separate pak02_dir.vpk per question, so one that fails does not hide the others:
//   1. News cards one by one: our style rule from the home page (NEWS_CELLS) does not reach the cards — each
//      card is a layout of its own inside frontpage_contents.xml. Here Valve's frontpage_contents.css comes
//      back as Valve's text plus `.TopCell { visibility: collapse; }`: the Dark Carnival card must go, the
//      «Диковинки Квортеро» card stay. (A copy of the layout itself would go stale with every event.)
//   2. Dota's own data panels in our copy of the home page, as 7.00 Style puts them: the mini-profile of the
//      local user (DOTAMiniShowcase accountid="local"), the last match, the top live match.
//   3. A script in the classic format (REDI + the text, as our layouts and styles): a clock on the home page,
//      started from a script included by our copy of the home page.
//   4. (with --laco <dir>) A new layout in Valve's new compiled format (LaCo, scripts/panorama-laco.mjs) with a
//      button handler and Cyrillic text, its style and script, loaded from our home page by a CustomLayoutPanel.
// Valve's files come fresh from spirit-bear-productions/dota_vpk_updates.
//   node scripts/make-widget-test.mjs <out.zip> [--laco <dir with panorama/…_c files>]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const SOURCE = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/';
const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--laco') || 'gridstudio-widget-test.zip';
const fetchText = async (path) => {
  const response = await fetch(SOURCE + path, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.text()).replace(/^(?:<!--[^\n]*-->|\/\*[^\n]*\*\/)\r?\n/, '').replace(/\r\n/g, '\n')
    .replace(/(s2r:\/\/[^"')\s]+\.(?:vcss|vxml|vjs|vts|vtex|vsvg))(?!_c)/g, (match, path) => (path.endsWith('.vts') ? path : `${path}_c`));
};
const ascii = (path, text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII в ${path}`); return text; };
const panorama = (path, text) => ({ path, data: panoramaResource(path, ascii(path, text)) });
const pack = (files) => buildVPK(files, { version: 2, md5 });

const HOME = 'panorama/layout/dashboard_page_home.vxml_c', TEST_STYLE = 'panorama/styles/gridstudio_widget_test.vcss_c';
const valveHome = await fetchText('panorama/layout/dashboard_page_home.xml');
// Valve's home page with our style after theirs and our panels as the page's first children (under the news).
function home(panels, extra = '') {
  const styled = valveHome.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${TEST_STYLE}" />$1</styles>${extra}`);
  const added = styled.replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgetTest" hittest="false">\n${panels}\n\t\t</Panel>`);
  if (styled === valveHome || added === styled) throw new Error('dashboard_page_home.xml изменился: не нашли, куда вставить тест.');
  return added;
}
// A bright frame so the place is found even if a panel inside draws nothing.
const BOX = `#GridStudioWidgetTest
{
	x: 420px;
	y: 170px;
	flow-children: right;
	padding: 12px;
	background-color: #10101cdd;
	border: 3px solid #ff40ff;
}

.GridStudioWidgetTestCell
{
	width: 340px;
	height: 300px;
	margin-right: 12px;
	border: 1px solid #ffffff40;
}

.GridStudioWidgetTestTitle
{
	font-size: 18px;
	color: #ffd0ff;
	margin: 6px;
}
`;

// 1. The news cards.
const frontpageCss = await fetchText('panorama/styles/frontpage_contents.css');
const one = pack([panorama('panorama/styles/frontpage_contents.vcss_c', `${frontpageCss.trimEnd()}\n\n/* GridStudio test: the top news card hidden */\n.TopCell\n{\n\tvisibility: collapse;\n}\n`)]);

// 2. Dota's own data panels.
const cell = (title, inner) => `\t\t\t<Panel class="GridStudioWidgetTestCell">\n\t\t\t\t<Label class="GridStudioWidgetTestTitle" text="${title}" />\n\t\t\t\t${inner}\n\t\t\t</Panel>`;
const two = pack([
  panorama(HOME, home([cell('1 Mini profile', '<DOTAMiniShowcase id="GridStudioTestShowcase" accountid="local" />'),
    cell('2 Last match', '<DOTAFrontpageLastMatch id="GridStudioTestLastMatch" />'), cell('3 Top live', '<DOTAFrontpageTopLive id="GridStudioTestTopLive" />')].join('\n'))),
  panorama(TEST_STYLE, BOX)
]);

// 3. A script in the classic format: the clock ticks if Dota runs it.
const CLOCK = `// GridStudio test: a clock on the home page, from a script in the classic resource format.
var clock = $.GetContextPanel().FindChildTraverse( 'GridStudioClock' );
function pad( n ) { return ( n < 10 ? '0' : '' ) + n; }
function tick()
{
	var now = new Date();
	if ( clock ) clock.text = 'SCRIPT OK ' + pad( now.getHours() ) + ':' + pad( now.getMinutes() ) + ':' + pad( now.getSeconds() );
	$.Schedule( 1, tick );
}
tick();
`;
const SCRIPT = 'panorama/scripts/gridstudio_widget_test.vjs_c';
const three = pack([
  panorama(HOME, home(cell('Clock', '<Label id="GridStudioClock" class="GridStudioWidgetTestTitle" text="NO SCRIPT" />'),
    `\n\t<scripts>\n\t\t<include src="s2r://${SCRIPT}" />\n\t</scripts>`)),
  panorama(TEST_STYLE, `${BOX}\n#GridStudioClock\n{\n\tfont-size: 40px;\n\tcolor: #80ff80;\n}\n`),
  panorama(SCRIPT, CLOCK)
]);

// 4. A layout in Valve's new format, from the files scripts/panorama-laco.mjs wrote.
let four = null;
const lacoDir = option('--laco');
if (lacoDir) {
  const walk = (dir) => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
  const files = walk(lacoDir).map((file) => ({ path: relative(lacoDir, file).split('\\').join('/'), data: new Uint8Array(readFileSync(file)) }));
  const layout = files.find((file) => file.path.endsWith('.vxml_c'));
  if (!layout) throw new Error(`${lacoDir}: нет .vxml_c`);
  four = pack([
    panorama(HOME, home(cell('New format', `<CustomLayoutPanel id="GridStudioLacoTest" layout="s2r://${layout.path}" />`))),
    panorama(TEST_STYLE, BOX), ...files
  ]);
}

const README = `Тест виджетов главного меню GridStudio — ${new Date().toISOString().slice(0, 10)}

Внутри ${four ? 'четыре папки' : 'три папки'}, в каждой своя проверка. Ставь по одной: Dota закрыта, скопируй папку game из
папки проверки в папку "dota 2 beta" (Steam -> Dota 2 -> Свойства -> Установленные файлы -> Обзор), согласись на замену,
запусти Dota, сделай скриншот главного меню. Потом следующая проверка тем же способом.
Твой фон меню на время теста пропадёт: в конце вставь команду с сайта ещё раз, и всё вернётся.

1-kartochki — справа в новостях пропадает карточка Dark Carnival, «Диковинки Квортеро» остаётся.
2-dannye    — в середине меню розовая рамка с тремя окнами: мини-профиль, последний матч, лайв-матч.
              Скриншот: что из трёх показалось, что пустое.
3-skript    — в розовой рамке зелёные часы «SCRIPT OK 12:34:56», секунды идут. «NO SCRIPT» — скрипт не запустился.
${four ? `4-laco      — в розовой рамке окно «Тест GridStudio: кнопки и кириллица» с кнопкой «Открыть Арсенал»;
              нажми её (должен открыться Арсенал), через секунду появится «Скрипт работает».
` : ''}
Если Dota не запускается или падает — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = [['1-kartochki', one], ['2-dannye', two], ['3-skript', three], ...(four ? [['4-laco', four]] : [])]
  .map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.length} проверки`);
