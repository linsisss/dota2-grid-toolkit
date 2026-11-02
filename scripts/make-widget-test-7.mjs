// The seventh in-game test of the main menu's widgets (2026-11-02). Test 6: $.AsyncWebRequest is there but no request of
// it left Dota (the site's logs had none). Other ways the menu could reach the internet, each with its own mark in the
// address (?v=…) so the server's log tells which one came, and the redesigned ready widgets and the editor's templates:
//   1. internet — a picture by address (https, http, set from the script), Valve's web panels (HTML and DOTAHTMLPanel by
//      their url, HTML by SetURL from the script), and $.AsyncWebRequest again over https and http, with `complete`.
//   2. gotovye — the ready widgets' new look (clocks, timers, the three shortcuts), as the site builds them.
//   3. shablony — the four templates of «Редактор виджета», as the site builds them. Parts 2 and 3 close the friends list.
//   node scripts/make-widget-test-7.mjs <out.zip> [--base https://dev.gridstudio.me/tests/t7/]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { newScript } from './panorama-laco.mjs';
import { menuBackgroundPack } from './menu-background.mjs';
import { designWidget, newWidget, widgetsPanorama } from './menu-widgets.mjs';
import { WIDGET_TEMPLATES, templateDesign } from '../src/constructor/widget-templates.js';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-7.zip';
const BASE = option('--base') || 'https://dev.gridstudio.me/tests/t7/', HTTP = BASE.replace(/^https:/, 'http:');
const DATA = new URL('../widget-data.json', BASE).href, DATA_HTTP = DATA.replace(/^https:/, 'http:');
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const dashboard = read('dashboard.xml'), home = read('dashboard_page_home.xml');
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII: ${text.match(/[^\x00-\x7f]/)[0]}`); return text; };

// ——— 1. The internet.
const HOME = 'panorama/layout/dashboard_page_home.vxml_c', STYLE = 'panorama/styles/gridstudio_t7.vcss_c', SCRIPT = 'panorama/scripts/gridstudio_t7.vjs_c';
const cell = (title, inner, cls = '') => `<Panel class="T7Cell${cls}"><Label class="T7Title" text="${title}" />${inner}</Panel>`;
const line = (id, text = '...') => `<Label id="${id}" class="T7Line" text="${text}" />`;
const panels = `<Panel id="T7Frame">
${cell('I1 picture https', `<Image class="T7Pic" src="${BASE}pic.png?v=img-https" scaling="stretch-to-fit-preserve-aspect" />`)}
${cell('I2 picture http', `<Image class="T7Pic" src="${HTTP}pic.png?v=img-http" scaling="stretch-to-fit-preserve-aspect" />`)}
${cell('I3 picture from the script', `<Image id="T7Pic3" class="T7Pic" scaling="stretch-to-fit-preserve-aspect" />${line('T7Pic3Status')}`)}
${cell('H1 HTML url', `<HTML id="T7Html1" class="T7Web" url="${BASE}page.html?v=html-attr" />`, ' is-web')}
${cell('H2 DOTAHTMLPanel url', `<DOTAHTMLPanel id="T7Html2" class="T7Web" url="${BASE}page.html?v=dotahtml-attr" />`, ' is-web')}
${cell('H3 HTML SetURL', `<HTML id="T7Html3" class="T7Web" />${line('T7Html3Status')}`, ' is-web')}
${cell('A requests', ['T7Api', 'T7Net1', 'T7Net2', 'T7Net3'].map((id) => line(id)).join(''), ' is-wide')}
${cell('script', line('T7Beat', 'NO SCRIPT'))}
</Panel>`;
const style = `#T7Frame
{
	x: 24px;
	y: 16px;
	width: 1440px;
	flow-children: right-wrap;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #40ff80;
}

.T7Cell
{
	width: 340px;
	height: 190px;
	margin: 4px;
	padding: 8px;
	flow-children: down;
	border: 1px solid #ffffff40;
	background-color: #00000066;
}

.T7Cell.is-web
{
	width: 460px;
	height: 290px;
}

.T7Cell.is-wide
{
	width: 700px;
}

.T7Title
{
	font-size: 17px;
	color: #c0ffd0;
	margin-bottom: 6px;
}

.T7Pic
{
	width: 300px;
	height: 100px;
	background-color: #ffffff14;
}

.T7Web
{
	width: 440px;
	height: 240px;
	background-color: #ffffff14;
}

.T7Line
{
	width: 100%;
	font-size: 15px;
	color: #9fe0ff;
	margin-bottom: 4px;
}
`;
const script = `// GridStudio test 7: the internet from a script of the home page.
(function ()
{
	var root = $.GetContextPanel(), top = root;
	while ( top.GetParent() ) top = top.GetParent();
	function find( id ) { return root.FindChildTraverse( id ) || top.FindChildTraverse( id ); }
	function say( id, text ) { var label = find( id ); if ( label ) label.text = text; }
	function pad( n ) { return ( n < 10 ? '0' : '' ) + n; }
	var pic = find( 'T7Pic3' );
	try { if ( pic ) { pic.SetImage( '${BASE}pic.png?v=img-js' ); say( 'T7Pic3Status', 'SetImage called' ); } } catch ( e ) { say( 'T7Pic3Status', 'SetImage error ' + e ); }
	var web = find( 'T7Html3' );
	try { if ( web ) { say( 'T7Html3Status', 'SetURL=' + typeof web.SetURL ); if ( typeof web.SetURL === 'function' ) web.SetURL( '${BASE}page.html?v=html-js' ); } } catch ( e ) { say( 'T7Html3Status', 'SetURL error ' + e ); }
	say( 'T7Api', 'AsyncWebRequest=' + typeof $.AsyncWebRequest );
	function ask( id, name, url, options )
	{
		if ( typeof $.AsyncWebRequest !== 'function' ) { say( id, name + ': none' ); return; }
		say( id, name + ': asking...' );
		var done = function ( text ) { say( id, name + ': ' + String( text ).replace( /\\s+/g, ' ' ).slice( 0, 70 ) ); };
		options.success = function ( data ) { done( 'OK ' + ( typeof data === 'string' ? data : JSON.stringify( data ) ) ); };
		options.error = function ( xhr, status, error ) { done( 'ERROR ' + ( xhr && xhr.status ) + ' ' + status + ' ' + ( error || '' ) ); };
		options.complete = function ( xhr, status ) { var label = find( id ); if ( label && label.text.indexOf( 'asking' ) >= 0 ) done( 'COMPLETE ' + status + ' ' + ( xhr && xhr.status ) + ' ' + ( xhr && xhr.responseText ) ); };
		try { $.AsyncWebRequest( url, options ); } catch ( e ) { done( 'THROW ' + e ); }
	}
	ask( 'T7Net1', 'A1 https', '${DATA}?v=awr-https', { type: 'GET', timeout: 10000 } );
	ask( 'T7Net2', 'A2 http', '${DATA_HTTP}?v=awr-http', { type: 'GET', timeout: 10000 } );
	ask( 'T7Net3', 'A3 https POST', '${DATA}?v=awr-post', { type: 'POST', data: { a: 1 }, timeout: 10000 } );
	function beat()
	{
		var now = new Date();
		say( 'T7Beat', 'SCRIPT OK ' + pad( now.getHours() ) + ':' + pad( now.getMinutes() ) + ':' + pad( now.getSeconds() ) );
		$.Schedule( 1, beat );
	}
	beat();
})();
`;
const page = home.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${STYLE}" />$1</styles>\n\t<scripts>\n\t\t<include src="s2r://${SCRIPT.replace(/_c$/, '')}" />\n\t</scripts>`)
  .replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgets" hittest="false">\n${panels}\n\t\t</Panel>`);
if (!page.includes('T7Frame') || !page.includes('gridstudio_t7.vjs"')) throw new Error('Не вышло собрать главную теста.');
const one = buildVPK([
  { path: HOME, data: panoramaResource(HOME, ascii(page)) },
  { path: STYLE, data: panoramaResource(STYLE, ascii(style)) },
  { path: SCRIPT, data: newScript(SCRIPT, ascii(script)) }
], { version: 2, md5 });

// ——— 2. The ready widgets' new look.
const place = (widget, x, y, w, h, props) => ({ ...widget, x, y, ...(w ? { w, h } : {}), props: { ...widget.props, ...props } });
const pad = (n) => String(n).padStart(2, '0'), soon = new Date(Date.now() + 3 * 86400_000 + 5 * 3600_000);
const until = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
const ready = [
  place(newWidget('clock'), 440, 120, 340, 140, { seconds: true, panel: true }),
  place(newWidget('clock'), 800, 120, 300, 120, { format: '12', color: '#e8c66a', align: 'left', panel: false }),
  place(newWidget('timer'), 440, 280, 360, 130, { title: 'До The International', until, color: '#e8c66a' }),
  place(newWidget('timer'), 820, 280, 300, 110, { title: 'Турнир', until: '2020-01-01T00:00', color: '#7cc4f2' }),
  place(newWidget('shortcut'), 440, 430, 260, 52, { label: 'Арсенал', action: 'armory', style: 'panel', color: '#e8c66a' }),
  place(newWidget('shortcut'), 440, 494, 260, 52, { label: 'Мой Twitch', action: 'link', url: 'https://twitch.tv/dota2ti', style: 'accent', color: '#e8c66a' }),
  place(newWidget('shortcut'), 440, 558, 260, 44, { label: 'Обновления игры', action: 'patches', style: 'plain', color: '#7cc4f2' }),
  place(newWidget('shortcut'), 720, 430, 260, 52, { label: 'Настройки', action: 'settings', style: 'panel', color: '#7cc4f2' })
];
const pack = (widgets) => menuBackgroundPack({ video: null, dashboard, home, news: { carnival: true, season: true }, widgets: { made: widgetsPanorama(widgets, { lang: 'ru' }), media: [] }, friendsClosed: true, md5 });
const two = pack(ready);

// ——— 3. The templates.
const [stream, profile, countdown, links] = WIDGET_TEMPLATES().map((template) => designWidget(templateDesign(template)));
const three = pack([{ ...stream, x: 430, y: 110 }, { ...profile, x: 790, y: 110 }, { ...links, x: 1250, y: 110 }, { ...countdown, x: 790, y: 400 }]);

const README = `Тест 7 виджетов главного меню GridStudio — ${new Date().toISOString().slice(0, 10)}

Три папки, ставь по одной, как раньше: Dota закрыта, папку game из папки проверки — в "dota 2 beta" с заменой, запусти Dota.
Фон меню на время теста пропадёт: в конце вставь команду с сайта ещё раз.

1-internet — зелёная рамка. Подожди полминуты на главной и сделай скриншот:
   I1–I3 — картинка «IMAGE OK» из интернета (https, http, из скрипта): какие показались;
   H1–H3 — встроенная веб-страница «HTML OK» с идущими часами: какие показались;
   A — строки запросов: OK / ERROR / COMPLETE или так и висит «asking...».
   Ещё я сам посмотрю на сервере, какие запросы до него дошли — напиши, когда запустил.
2-gotovye — готовые виджеты в новом виде: часы, таймеры, кнопки-ярлыки. Скриншот, наведи на кнопки.
3-shablony — четыре шаблона «Редактора виджета»: «Стрим», «Мой профиль», «Быстрый доступ», «Отсчёт». Скриншот.
   В 2 и 3 список друзей на главной закрыт.

Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = [['1-internet', one], ['2-gotovye', two], ['3-shablony', three]].map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.map((e) => `${e.name.split('/')[0]} ${(e.data.length / 1024).toFixed(0)} КБ`).join(', ')}`);
