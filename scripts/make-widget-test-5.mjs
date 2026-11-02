// The fifth in-game test of the main menu's widgets (2026-11-02, the owner: «давай расширяй блоки, делай тест 5»).
// One ZIP with a separate pak02_dir.vpk per part, so one that fails does not hide the others:
//   1. proverki — the ways Valve's own layouts do each thing, side by side, each with a name to tell from the screenshot:
//      the avatar and the user's name (DOTAUserName with steamid / accountid / from the script), Dota's hero pictures
//      (DOTAHeroImage, DOTAHeroMovie by name and by id), tooltips (from the layout, from the script: plain, with a
//      title, Dota's own), sounds (a style's `sound` on press and under the cursor, PlaySoundEffect from the layout and
//      from the script), the new pages a button may open, and whether the menu may ask the internet ($.AsyncWebRequest:
//      no Valve script of the menu uses it).
//   2. 3d — a hero as a 3D model (DOTAScenePanel unit=…), four ways Valve's layouts set one up.
//   3. bloki — widgets of one's own with the new blocks exactly as the site builds them (scripts/menu-widgets.mjs).
// The panels go into our copy of the home page as the widgets do (menuBackgroundPack), so the place is the same.
//   node scripts/make-widget-test-5.mjs <out.zip> [--data <url of a small JSON>]
import { readFileSync, writeFileSync } from 'node:fs';
import { menuBackgroundPack } from './menu-background.mjs';
import { cleanDesign, designWidget, newBlock, widgetsPanorama, WIDGET_ACTIONS } from './menu-widgets.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-5.zip';
const DATA = option('--data') || 'https://dev.gridstudio.me/tests/widget-data.json';
const read = (file) => readFileSync(new URL(`../assets/dota-menu/${file}`, import.meta.url), 'utf8');
const dashboard = read('dashboard.xml'), home = read('dashboard_page_home.xml');
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII: ${text.match(/[^\x00-\x7f]/)[0]}`); return text; };
// Russian words for the script: \u escapes (our classic files stay ASCII).
const js = (text) => `'${text.replace(/[\\']/g, '\\$&').replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;
const pack = (made) => menuBackgroundPack({ video: null, dashboard, home, news: { carnival: true, season: true }, widgets: { made, media: [] }, md5 });

// ——— 1. The ways, side by side.
const button = (id, text, extra = '') => `<Button id="${id}" class="T5Btn"${extra}><Label text="${text}" hittest="false" /></Button>`;
const cell = (title, inner, cls = '') => `<Panel class="T5Cell${cls}"><Label class="T5Title" text="${title}" />${inner}</Panel>`;
const status = (id, text = '...') => `<Label id="${id}" class="T5Status" text="${text}" />`;
const PAGES = ['heroes', 'settings', 'plus', 'patches', 'battleReport', 'guild'];
const panels = `<Panel id="T5Frame">
${cell('A avatar + nick', `<Panel class="T5Row"><DOTAAvatarImage id="T5Avatar" steamid="local" nocompendiumborder="true" /><Panel class="T5Col">
<Panel class="T5Line"><Label class="T5Tag" text="N1" /><DOTAUserName id="T5Nick1" steamid="local" /></Panel>
<Panel class="T5Line"><Label class="T5Tag" text="N2" /><DOTAUserName id="T5Nick2" accountid="local" /></Panel>
<Panel class="T5Line"><Label class="T5Tag" text="N3" /><DOTAUserName id="T5Nick3" /></Panel></Panel></Panel>${status('T5NickStatus')}`)}
${cell('B hero pictures (Invoker)', `<Panel class="T5Row">
<Panel class="T5Hero"><DOTAHeroImage class="T5HeroPic" heroname="invoker" heroimagestyle="portrait" scaling="stretch-to-cover-preserve-aspect" /><Label class="T5Tag" text="H1" /></Panel>
<Panel class="T5Hero"><DOTAHeroMovie class="T5HeroPic" heroname="invoker" heroimagestyle="portrait" /><Label class="T5Tag" text="H2" /></Panel>
<Panel class="T5Hero"><DOTAHeroMovie class="T5HeroPic" heroid="74" heroimagestyle="portrait" /><Label class="T5Tag" text="H3" /></Panel>
<Panel class="T5Hero"><DOTAHeroMovie class="T5HeroPic" heroname="npc_dota_hero_invoker" /><Label class="T5Tag" text="H4" /></Panel></Panel>`)}
${cell('C tooltips: hover each', `<Panel class="T5Row">${button('T5Tip1', 'T1', ' onmouseover="UIShowTextTooltip( GridStudioT1 )" onmouseout="UIHideTextTooltip()"')}${button('T5Tip2', 'T2')}${button('T5Tip3', 'T3')}${button('T5Tip4', 'T4')}</Panel>`)}
${cell('D sounds: press, hover', `<Panel class="T5Row">${button('T5Snd1', 'S1')}${button('T5Snd2', 'S2')}${button('T5Snd3', 'S3', ' onactivate="PlaySoundEffect( ui_topmenu_activate )"')}${button('T5Snd4', 'S4')}${button('T5Snd5', 'S5')}</Panel>`)}
${cell('E pages: press each', `<Panel class="T5Row">${PAGES.map((page, i) => button(`T5Page${i + 1}`, `P${i + 1}`, ` onactivate="${WIDGET_ACTIONS[page].call}"`)).join('')}</Panel>`)}
${cell('F internet', `${status('T5Api', 'no script')}${status('T5Net1')}${status('T5Net2')}${status('T5Net3')}`, ' is-wide')}
${cell('G script', status('T5Beat', 'NO SCRIPT'))}
</Panel>`;
const style = `#T5Frame
{
	x: 24px;
	y: 16px;
	width: 1360px;
	flow-children: right-wrap;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #ff40ff;
}

.T5Cell
{
	width: 326px;
	height: 236px;
	margin: 4px;
	padding: 8px;
	flow-children: down;
	border: 1px solid #ffffff40;
	background-color: #00000066;
}

.T5Cell.is-wide
{
	width: 660px;
}

.T5Title
{
	font-size: 18px;
	color: #ffd0ff;
	margin-bottom: 8px;
}

.T5Row
{
	flow-children: right-wrap;
	width: 100%;
}

.T5Col
{
	flow-children: down;
	margin-left: 10px;
}

.T5Line
{
	flow-children: right;
	margin-bottom: 8px;
}

.T5Tag
{
	font-size: 15px;
	color: #ffe066;
	margin-right: 6px;
}

#T5Avatar
{
	width: 96px;
	height: 96px;
}

DOTAUserName
{
	width: 170px;
}

DOTAUserName Label
{
	font-size: 18px;
	color: #ffffff;
}

.T5Hero
{
	width: 72px;
	height: 150px;
	margin-right: 6px;
	flow-children: down;
}

.T5HeroPic
{
	width: 72px;
	height: 120px;
	background-color: #ffffff14;
}

.T5Btn
{
	width: 64px;
	height: 44px;
	margin: 4px;
	background-color: #3a3f5a;
	border: 1px solid #ffffff40;
}

.T5Btn:hover
{
	background-color: #5a5f9a;
}

.T5Btn Label
{
	horizontal-align: center;
	vertical-align: center;
	font-size: 18px;
	color: #ffffff;
}

#T5Snd1:active
{
	sound: "ui_generic_button_click";
}

#T5Snd2:hover
{
	sound: "ui_rollover_micro";
}

#T5Snd5:active
{
	sound: "Relic.Received";
}

.T5Status
{
	font-size: 16px;
	color: #9fe0ff;
	margin-bottom: 6px;
	width: 100%;
}
`;
const script = `// GridStudio test 5: tooltips, sounds, the user's name and the internet from a script of the home page.
(function ()
{
	var root = $.GetContextPanel();
	function find( id ) { return root.FindChildTraverse( id ); }
	function say( id, text ) { var label = find( id ); if ( label ) label.text = text; }
	function pad( n ) { return ( n < 10 ? '0' : '' ) + n; }
	function tip( id, show )
	{
		var panel = find( id );
		if ( !panel ) return;
		panel.SetPanelEvent( 'onmouseover', function () { show( panel ); } );
		panel.SetPanelEvent( 'onmouseout', function () { $.DispatchEvent( 'UIHideTextTooltip', panel ); $.DispatchEvent( 'UIHideTitleTextTooltip', panel ); $.DispatchEvent( 'DOTAHideTextTooltip', panel ); } );
	}
	tip( 'T5Tip2', function ( panel ) { $.DispatchEvent( 'UIShowTextTooltip', panel, ${js('Т2: подсказка из скрипта, по-русски')} ); } );
	tip( 'T5Tip3', function ( panel ) { $.DispatchEvent( 'UIShowTitleTextTooltip', panel, ${js('Т3: заголовок')}, ${js('и текст под ним')} ); } );
	tip( 'T5Tip4', function ( panel ) { $.DispatchEvent( 'DOTAShowTextTooltip', panel, ${js('Т4: подсказка Dota')} ); } );
	var s4 = find( 'T5Snd4' );
	if ( s4 ) s4.SetPanelEvent( 'onactivate', function () { $.DispatchEvent( 'PlaySoundEffect', 'HeroBadgeLevelUpReward.ShowReward' ); } );
	var nick = find( 'T5Nick3' ), nickText = 'N3: ';
	try { if ( nick ) { nick.steamid = 'local'; nickText += 'steamid set'; } else nickText += 'no panel'; } catch ( e ) { nickText += 'error ' + e; }
	say( 'T5NickStatus', nickText );
	function kind( value ) { try { return typeof value; } catch ( e ) { return 'error'; } }
	say( 'T5Api', 'AsyncWebRequest=' + kind( $.AsyncWebRequest ) + '  Game=' + ( typeof Game === 'undefined' ? 'undefined' : 'object' ) + '  GameEvents=' + ( typeof GameEvents === 'undefined' ? 'undefined' : 'object' ) );
	function ask( id, name, url )
	{
		if ( typeof $.AsyncWebRequest !== 'function' ) { say( id, name + ': no AsyncWebRequest' ); return; }
		say( id, name + ': asking...' );
		try
		{
			$.AsyncWebRequest( url, { type: 'GET', timeout: 15000,
				success: function ( data ) { var text = typeof data === 'string' ? data : JSON.stringify( data ); say( id, name + ': OK ' + String( text ).replace( /\\s+/g, ' ' ).slice( 0, 70 ) ); },
				error: function ( xhr, status, error ) { say( id, name + ': ERROR ' + ( xhr && xhr.status ) + ' ' + status + ' ' + ( error || '' ) ); } } );
		}
		catch ( e ) { say( id, name + ': THROW ' + e ); }
	}
	ask( 'T5Net1', 'U1 ours', ${js(DATA)} );
	ask( 'T5Net2', 'U2 site', 'https://gridstudio.me/robots.txt' );
	ask( 'T5Net3', 'U3 steam', 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=570' );
	function beat()
	{
		var now = new Date();
		say( 'T5Beat', 'SCRIPT OK ' + pad( now.getHours() ) + ':' + pad( now.getMinutes() ) + ':' + pad( now.getSeconds() ) );
		$.Schedule( 1, beat );
	}
	beat();
})();
`;
const one = pack({ panels: ascii(panels), style: ascii(style), script: ascii(script) });

// ——— 2. A hero in 3D, four ways.
const scene = (title, attrs) => `<Panel class="T5Scene"><Label class="T5Title" text="${title}" /><DOTAScenePanel class="T5Model" ${attrs} /></Panel>`;
const two = pack({ panels: ascii(`<Panel id="T5Frame">
${scene('V1 Invoker: unit, allowrotation (drag it)', 'unit="npc_dota_hero_invoker" particleonly="false" antialias="true" drawbackground="false" allowrotation="true"')}
${scene('V2 Invoker: full_body_loadout', 'unit="npc_dota_hero_invoker" environment="full_body_loadout" drawbackground="0" antialias="true" activity-modifier="PostGameIdle" particleonly="false"')}
${scene('V3 Juggernaut: default_camera', 'unit="npc_dota_hero_juggernaut" camera="default_camera" particleonly="false"')}
${scene('V4 Crystal Maiden: rotate on mouse', 'unit="npc_dota_hero_crystal_maiden" particleonly="false" drawbackground="false" rotateonmousemove="true" yawmin="-30" yawmax="30"')}
</Panel>`), style: ascii(`#T5Frame
{
	x: 24px;
	y: 16px;
	flow-children: right;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #40ffff;
}

.T5Scene
{
	width: 330px;
	height: 480px;
	margin: 4px;
	flow-children: down;
	border: 1px solid #ffffff40;
}

.T5Title
{
	font-size: 16px;
	color: #d0ffff;
	margin: 6px;
	width: 100%;
}

.T5Model
{
	width: 100%;
	height: 430px;
	opacity-mask: none;
}
`), script: null });

// ——— 3. The new blocks as the site builds them.
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
const place = (design, x, y) => ({ ...designWidget(design), x, y });
const made = widgetsPanorama([place(profile, 40, 120), place(hero3d, 520, 120), place(portraits, 860, 120)], { lang: 'ru' });
const three = pack(made);

const README = `Тест 5 виджетов главного меню GridStudio — ${new Date().toISOString().slice(0, 10)}

Внутри три папки. Ставь по одной: Dota закрыта, скопируй папку game из папки проверки в папку "dota 2 beta"
(Steam -> Dota 2 -> Свойства -> Установленные файлы -> Обзор), согласись на замену, запусти Dota. Потом следующая.
Твой фон меню на время теста пропадёт: в конце вставь команду с сайта ещё раз, и всё вернётся.

1-proverki — розовая рамка, семь окон. Нужны скриншоты (можно два-три, если подсказки нужно ловить отдельно):
   A  аватар и три строки ника N1, N2, N3 — какие показали ник; строка под ними — что сказал скрипт.
   B  четыре картинки Invoker H1–H4 — какие показались и какие двигаются.
   C  наведи курсор по очереди на T1, T2, T3, T4 — у каких появилась подсказка (T2–T4 по-русски).
   D  нажми S1, S3, S4, S5 и наведи на S2 — у каких был звук (S1 щелчок, S2 тихий при наведении,
      S3 вкладка меню, S4 награда, S5 реликвия).
   E  нажми P1–P6 по очереди (после каждой вернись на главную): P1 герои, P2 настройки, P3 Dota Plus,
      P4 обновления, P5 боевой отчёт, P6 гильдия — что открылось.
   F  три строки: U1 наш сайт, U2 gridstudio.me, U3 Steam. Нужен скриншот этих строк через полминуты:
      «OK …» — Dota умеет ходить в интернет из меню, «ERROR»/«no AsyncWebRequest» — нет.
   G  «SCRIPT OK 12:34:56» с идущими секундами — скрипт работает.
2-3d — голубая рамка с четырьмя героями V1–V4: какие показались в 3D, двигаются ли; V1 попробуй
       повернуть мышью, над V4 поводи курсором.
3-bloki — три виджета, собранные как на сайте: «Профиль» (аватар, ник, кнопки со звуком и подсказками),
       3D-Invoker (крутится мышью) и «Портреты» (живой Pudge, картинка Lina, 3D Crystal Maiden, кнопка Dota Plus).
       Скриншот, наведи на аватар и кнопку «Настройки» (подсказки), понажимай кнопки.

Если Dota не запускается или падает — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз;
напиши, на какой папке это случилось.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const entries = [['1-proverki', one], ['2-3d', two], ['3-bloki', three]].map(([dir, data]) => ({ name: `${dir}/game/dota_russian/pak02_dir.vpk`, data }));
const zip = await buildZip([...entries, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${entries.length} проверки, ${entries.map((e) => `${e.name.split('/')[0]} ${(e.data.length / 1024).toFixed(0)} КБ`).join(', ')}`);
