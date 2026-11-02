// The sixth in-game test of the main menu's widgets (2026-11-02). In test 5 no script of our home page ran after Dota's
// update of early November (layouts and styles in the classic format still load): the texts of the widgets, the
// tooltips from the script, the sound from the script, the user's name and the internet stayed empty. Every d2pfx
// mod ships its scripts in Valve's new compiled format (resource version 4, scripts/panorama-laco.mjs newScript),
// which ran in our test 4 on 2026-10-31. Two folders:
//   1. skripty — one home page, four scripts side by side: A classic format named `.vjs_c` (as ours were), B the new
//      format named `.vjs_c`, C classic named `.vjs`, D new named `.vjs` (as Valve's layouts name theirs); each writes its
//      lines finding the panels from the page and from the top of the menu, and repeats test 5's script parts
//      (tooltips T2–T4, sound S4, the name N3, the internet). The friends list is closed on the home page.
//   2. bloki — test 5's widgets as the site builds them now (the script in the new format, panels looked for from the
//      top of the menu too), with the friends list closed.
//   node scripts/make-widget-test-6.mjs <out.zip> [--data <url of a small JSON>]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { newScript } from './panorama-laco.mjs';
import { friendsClosedPage, menuBackgroundPack } from './menu-background.mjs';
import { cleanDesign, designWidget, newBlock, widgetsPanorama } from './menu-widgets.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-6.zip';
const DATA = option('--data') || 'https://dev.gridstudio.me/tests/widget-data.json';
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const dashboard = read('dashboard.xml'), home = read('dashboard_page_home.xml');
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII: ${text.match(/[^\x00-\x7f]/)[0]}`); return text; };
const js = (text) => `'${text.replace(/[\\']/g, '\\$&').replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;

// ——— 1. The two scripts.
const HOME = 'panorama/layout/dashboard_page_home.vxml_c', STYLE = 'panorama/styles/gridstudio_t6.vcss_c';
const SCRIPTS = { A: 'panorama/scripts/gridstudio_t6_a.vjs_c', B: 'panorama/scripts/gridstudio_t6_b.vjs_c', C: 'panorama/scripts/gridstudio_t6_c.vjs_c', D: 'panorama/scripts/gridstudio_t6_d.vjs_c' };
const NAMED = { A: SCRIPTS.A, B: SCRIPTS.B, C: SCRIPTS.C.replace(/_c$/, ''), D: SCRIPTS.D.replace(/_c$/, '') };
const button = (id, text) => `<Button id="${id}" class="T6Btn"><Label text="${text}" hittest="false" /></Button>`;
const line = (id, text) => `<Label id="${id}" class="T6Line" text="${text}" />`;
const cell = (title, inner, cls = '') => `<Panel class="T6Cell${cls}"><Label class="T6Title" text="${title}" />${inner}</Panel>`;
const panels = `<Panel id="T6Frame">
${cell('1 scripts: A/C classic, B/D new; A/B .vjs_c, C/D .vjs', ['A', 'B', 'C', 'D'].map((tag) => `<Panel class="T6Row">${['1', '2', 'Beat'].map((id) => `<Label id="T6${tag}${id}" class="T6Short" text="${tag}${id === 'Beat' ? ' clock' : id}: -" />`).join('')}</Panel>`).join(''), ' is-wide')}
${cell('2 tooltips: hover each', `<Panel class="T6Row">${button('T6Tip2', 'T2')}${button('T6Tip3', 'T3')}${button('T6Tip4', 'T4')}</Panel>`)}
${cell('3 sound: press S4', `<Panel class="T6Row">${button('T6Snd4', 'S4')}</Panel>`)}
${cell('4 nick from the script', `<DOTAUserName id="T6Nick" />${line('T6NickStatus', 'N3: did not run')}`)}
${cell('5 internet', ['Api', 'Net1', 'Net2', 'Net3'].map((id) => line(`T6${id}`, '...')).join(''), ' is-wide')}
${cell('6 friends list', line('T6Friends', 'Closed when the home page opens?'))}
</Panel>`;
const style = `#T6Frame
{
	x: 24px;
	y: 16px;
	width: 1360px;
	flow-children: right-wrap;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #ffb040;
}

.T6Cell
{
	width: 326px;
	height: 220px;
	margin: 4px;
	padding: 8px;
	flow-children: down;
	border: 1px solid #ffffff40;
	background-color: #00000066;
}

.T6Cell.is-wide
{
	width: 660px;
}

.T6Title
{
	font-size: 18px;
	color: #ffe0b0;
	margin-bottom: 8px;
}

.T6Row
{
	flow-children: right;
}

.T6Line
{
	width: 100%;
	font-size: 16px;
	color: #9fe0ff;
	margin-bottom: 4px;
}

.T6Short
{
	width: 200px;
	font-size: 16px;
	color: #9fe0ff;
	margin-bottom: 4px;
}

.T6Btn
{
	width: 64px;
	height: 44px;
	margin: 4px;
	background-color: #3a3f5a;
	border: 1px solid #ffffff40;
}

.T6Btn:hover
{
	background-color: #5a5f9a;
}

.T6Btn Label
{
	horizontal-align: center;
	vertical-align: center;
	font-size: 18px;
	color: #ffffff;
}

#T6Nick
{
	width: 300px;
	margin-bottom: 6px;
}

#T6Nick Label
{
	font-size: 20px;
	color: #ffffff;
}
`;
const script = (tag) => `// GridStudio test 6, script ${tag}.
(function ()
{
	var tag = '${tag}', root = $.GetContextPanel(), top = root;
	while ( top.GetParent() ) top = top.GetParent();
	function find( id ) { return root.FindChildTraverse( id ) || top.FindChildTraverse( id ); }
	function say( id, text ) { var label = find( id ); if ( label ) label.text = text; }
	function pad( n ) { return ( n < 10 ? '0' : '' ) + n; }
	var mine = root.FindChildTraverse( 'T6' + tag + '1' );
	if ( mine ) mine.text = tag + '1 OK page';
	var far = top.FindChildTraverse( 'T6' + tag + '2' );
	if ( far ) far.text = tag + '2 OK top';
	say( 'T6Friends', tag + ': page = ' + root.id + ' (' + root.paneltype + ')' );
	function tip( id, show )
	{
		var panel = find( id );
		if ( !panel ) return;
		panel.SetPanelEvent( 'onmouseover', function () { show( panel ); } );
		panel.SetPanelEvent( 'onmouseout', function () { $.DispatchEvent( 'UIHideTextTooltip', panel ); $.DispatchEvent( 'UIHideTitleTextTooltip', panel ); $.DispatchEvent( 'DOTAHideTextTooltip', panel ); } );
	}
	tip( 'T6Tip2', function ( panel ) { $.DispatchEvent( 'UIShowTextTooltip', panel, tag + ${js(': Т2, подсказка по-русски')} ); } );
	tip( 'T6Tip3', function ( panel ) { $.DispatchEvent( 'UIShowTitleTextTooltip', panel, tag + ${js(': Т3, заголовок')}, ${js('и текст под ним')} ); } );
	tip( 'T6Tip4', function ( panel ) { $.DispatchEvent( 'DOTAShowTextTooltip', panel, tag + ${js(': Т4, подсказка Dota')} ); } );
	var s4 = find( 'T6Snd4' );
	if ( s4 ) s4.SetPanelEvent( 'onactivate', function () { $.DispatchEvent( 'PlaySoundEffect', 'HeroBadgeLevelUpReward.ShowReward' ); } );
	var nick = find( 'T6Nick' ), nickText = tag + ' N3: ';
	try { if ( nick ) { nick.steamid = 'local'; nickText += 'steamid set'; } else nickText += 'no panel'; } catch ( e ) { nickText += 'error ' + e; }
	say( 'T6NickStatus', nickText );
	say( 'T6Api', tag + ': AsyncWebRequest=' + typeof $.AsyncWebRequest + '  Game=' + ( typeof Game === 'undefined' ? 'undefined' : 'object' ) );
	function ask( id, name, url )
	{
		if ( typeof $.AsyncWebRequest !== 'function' ) { say( id, tag + ' ' + name + ': no AsyncWebRequest' ); return; }
		say( id, tag + ' ' + name + ': asking...' );
		try
		{
			$.AsyncWebRequest( url, { type: 'GET', timeout: 15000,
				success: function ( data ) { var text = typeof data === 'string' ? data : JSON.stringify( data ); say( id, tag + ' ' + name + ': OK ' + String( text ).replace( /\\s+/g, ' ' ).slice( 0, 60 ) ); },
				error: function ( xhr, status, error ) { say( id, tag + ' ' + name + ': ERROR ' + ( xhr && xhr.status ) + ' ' + status + ' ' + ( error || '' ) ); } } );
		}
		catch ( e ) { say( id, tag + ' ' + name + ': THROW ' + e ); }
	}
	ask( 'T6Net1', 'U1 ours', ${js(DATA)} );
	ask( 'T6Net2', 'U2 site', 'https://gridstudio.me/robots.txt' );
	ask( 'T6Net3', 'U3 steam', 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=570' );
	function beat()
	{
		var now = new Date();
		say( 'T6' + tag + 'Beat', tag + ' ' + pad( now.getHours() ) + ':' + pad( now.getMinutes() ) + ':' + pad( now.getSeconds() ) );
		$.Schedule( 1, beat );
	}
	beat();
})();
`;
let page = friendsClosedPage(home).replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${STYLE}" />$1</styles>`);
const scripts = Object.values(NAMED).map((path) => `\n\t\t<include src="s2r://${path}" />`).join('');
page = page.includes('<scripts>') ? page.replace(/(\n[ \t]*)<\/scripts>/, `${scripts}$1</scripts>`) : page.replace('</styles>', `</styles>\n\t<scripts>${scripts}\n\t</scripts>`);
page = page.replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgets" hittest="false">\n${panels}\n\t\t</Panel>`);
if (!page.includes('T6Frame') || !page.includes(`${NAMED.D}"`)) throw new Error('Не вышло собрать главную теста.');
const one = buildVPK([
  { path: HOME, data: panoramaResource(HOME, ascii(page)) },
  { path: STYLE, data: panoramaResource(STYLE, ascii(style)) },
  { path: SCRIPTS.A, data: panoramaResource(SCRIPTS.A, ascii(script('A'))) },
  { path: SCRIPTS.B, data: newScript(SCRIPTS.B, ascii(script('B'))) },
  { path: SCRIPTS.C, data: panoramaResource(SCRIPTS.C, ascii(script('C'))) },
  { path: SCRIPTS.D, data: newScript(SCRIPTS.D, ascii(script('D'))) }
], { version: 2, md5 });

// ——— 2. Test 5's widgets as the site builds them now.
const make = (type, place, props = {}, extra = {}) => { const block = newBlock(type); return { ...block, ...place, ...extra, props: { ...block.props, ...props } }; };
const profile = cleanDesign({ name: 'Профиль', size: [440, 250], background: '#0d0f18e6', radius: 14, blocks: [
  make('shape', { x: 0, y: 0, w: 440, h: 90 }, { fill: '#7c5cff', fill2: '#0d0f1800', direction: 'down' }),
  make('avatar', { x: 20, y: 20, w: 96, h: 96 }, { radius: 48, border: '#c4b5ed', borderWidth: 3 }, { tip: 'Это твой аватар Steam' }),
  make('nickname', { x: 132, y: 36, w: 290, h: 40 }, { size: 28 }),
  make('text', { x: 132, y: 78, w: 290, h: 28 }, { text: 'Сегодня только победы', size: 18, color: '#c8cfdb', weight: 'normal' }),
  make('button', { x: 20, y: 140, w: 195, h: 44 }, { label: 'Настройки', action: 'settings', sound: 'click', hoverSound: true }, { hover: true, tip: 'Откроет настройки Dota' }),
  make('button', { x: 225, y: 140, w: 195, h: 44 }, { label: 'Обновления', action: 'patches', sound: 'menu', fill: '#2a3142' }, { hover: true }),
  make('button', { x: 20, y: 194, w: 195, h: 44 }, { label: 'Боевой отчёт', action: 'battleReport', sound: 'reward', fill: '#2a3142' }, { hover: true }),
  make('button', { x: 225, y: 194, w: 195, h: 44 }, { label: 'Герои', action: 'heroes', sound: 'slide', fill: '#2a3142' }, { hover: true, tip: 'Все герои Dota' })] });
const hero3d = cleanDesign({ name: 'Герой', size: [300, 440], background: '#0d0f18cc', radius: 14, blocks: [
  make('hero', { x: 0, y: 0, w: 300, h: 380 }, { hero: 'invoker', view: 'model', rotate: true }, { tip: 'Потяни мышью, чтобы повернуть' }),
  make('text', { x: 0, y: 390, w: 300, h: 40 }, { text: 'Invoker', size: 26, align: 'center', upper: true, spacing: 4 })] });
const portraits = cleanDesign({ name: 'Портреты', size: [380, 250], background: '#0d0f18cc', radius: 14, blocks: [
  make('hero', { x: 14, y: 14, w: 110, h: 170 }, { hero: 'pudge', view: 'movie' }, { tip: 'Живой портрет' }),
  make('hero', { x: 136, y: 14, w: 110, h: 170 }, { hero: 'lina', view: 'image' }, { tip: 'Картинка героя' }),
  make('hero', { x: 258, y: 14, w: 110, h: 170 }, { hero: 'crystal_maiden', view: 'model', rotate: false }),
  make('button', { x: 14, y: 196, w: 354, h: 40 }, { label: 'Dota Plus', action: 'plus', sound: 'relic' }, { hover: true })] });
const clock = cleanDesign({ name: 'Часы', size: [300, 90], background: '#0d0f18cc', radius: 14, blocks: [
  make('clock', { x: 0, y: 10, w: 300, h: 70 }, { seconds: true, size: 48, align: 'center' }, { tip: 'Время на этом компьютере' })] });
const place = (design, x, y) => ({ ...designWidget(design), x, y });
const made = widgetsPanorama([place(profile, 40, 120), place(hero3d, 520, 120), place(portraits, 860, 120), place(clock, 860, 400)], { lang: 'ru' });
const two = menuBackgroundPack({ video: null, dashboard, home, news: { carnival: true, season: true }, widgets: { made, media: [] }, friendsClosed: true, md5 });

const README = `Тест 6 виджетов главного меню GridStudio — ${new Date().toISOString().slice(0, 10)}

В тесте 5 после обновления Dota не запустился ни один наш скрипт (пустые надписи, подсказки T2–T4, звук S4).
Здесь скрипт в старом формате и в новом формате Valve рядом. Две папки, ставь по одной, как раньше:
Dota закрыта, папку game из папки проверки — в "dota 2 beta" с заменой, запусти Dota.
Фон меню на время теста пропадёт: в конце вставь команду с сайта ещё раз.

1-skripty — оранжевая рамка. Нужен скриншот через полминуты после входа:
   окно 1: четыре строки скриптов A, B, C, D — у каких появилось «OK» и идут часы;
   окно 2: наведи на T2, T3, T4 — есть ли подсказки; окно 3: нажми S4 — был ли звук;
   окно 4: ник из скрипта; окно 5: интернет (OK или ERROR);
   окно 6: список друзей должен быть закрыт, когда открывается главная (кнопка друзей его открывает);
   в этом окне строка о том, где запустился скрипт.
2-bloki — виджеты из теста 5 так, как их теперь собирает сайт: должны появиться надписи на кнопках,
   «Сегодня только победы», «Invoker» и часы с секундами; подсказки на аватаре, «Настройки», «Герои»,
   3D-герое и часах. Список друзей тоже закрыт.

Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = [['1-skripty', one], ['2-bloki', two]].map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.map((e) => `${e.name.split('/')[0]} ${(e.data.length / 1024).toFixed(0)} КБ`).join(', ')}`);
