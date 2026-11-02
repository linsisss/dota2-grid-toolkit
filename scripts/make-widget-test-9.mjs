// The ninth in-game test (2026-11-02): a widget's button that opens the user's own profile. From our buttons neither
// DOTAShowShowcasePage( 0 ) (test 7) nor DOTAShowProfilePage( 0 ) (test 8b) opened anything; Valve calls the first only
// from the friends rail's mini-profile, which carries accountid="local" — the 0 seems to mean «this panel's account».
// Six ways side by side, each a box with its name:
//   P1 an avatar (DOTAAvatarImage accountid="local") with that call;
//   P2 Valve's mini-profile itself, see-through, over a button of ours (its own call);
//   P3 our Button with accountid="local" and the call;
//   P4 our Button inside an avatar with accountid="local", the call on the button;
//   P5 the call with «local» for 0;
//   P6 from the script: the account read off an avatar (shown under the boxes), then DOTAShowShowcasePage / DOTAShowProfilePage with it.
//   node scripts/make-widget-test-9.mjs <out.zip>
import { readFileSync, writeFileSync } from 'node:fs';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { newScript } from './panorama-laco.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const out = process.argv[2] || 'gridstudio-widget-test-9.zip';
const home = readFileSync(new URL('../assets/dota-menu/dashboard_page_home.xml', import.meta.url), 'utf8');
const HOME = 'panorama/layout/dashboard_page_home.vxml_c', STYLE = 'panorama/styles/gridstudio_t9.vcss_c', SCRIPT = 'panorama/scripts/gridstudio_t9.vjs_c';
const CALL = 'DOTAShowShowcasePage( 0 )';
const cell = (name, inner) => `<Panel class="T9Cell"><Label class="T9Title" text="${name}" />${inner}</Panel>`;
const face = (text) => `<Label class="T9Face" text="${text}" hittest="false" />`;
const panels = `<Panel id="T9Frame">
${cell('P1 avatar, accountid local', `<DOTAAvatarImage class="T9Box" accountid="local" onactivate="${CALL}" />`)}
${cell('P2 mini-profile over a button', `<Panel class="T9Box"><Button class="T9Btn">${face('PROFILE')}</Button><DOTAMiniShowcase class="T9Ghost" accountid="local" onactivate="${CALL}" /></Panel>`)}
${cell('P3 button with accountid', `<Button class="T9Box T9Btn" accountid="local" onactivate="${CALL}">${face('PROFILE')}</Button>`)}
${cell('P4 button inside an avatar', `<DOTAAvatarImage class="T9Box" accountid="local"><Button class="T9Btn T9Fill" onactivate="${CALL}">${face('PROFILE')}</Button></DOTAAvatarImage>`)}
${cell('P5 the call with local', `<Button class="T9Box T9Btn" onactivate="DOTAShowShowcasePage( local )">${face('PROFILE')}</Button>`)}
${cell('P6 from the script', `<Button id="T9Script" class="T9Box T9Btn">${face('PROFILE')}</Button><DOTAAvatarImage id="T9Probe" class="T9Probe" accountid="local" />`)}
<Label id="T9Status" class="T9Status" text="NO SCRIPT" />
</Panel>`;
const style = `#T9Frame
{
	x: 24px;
	y: 16px;
	width: 1300px;
	flow-children: right-wrap;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #ff8040;
}

.T9Cell
{
	width: 200px;
	height: 190px;
	margin: 4px;
	padding: 8px;
	flow-children: down;
	border: 1px solid #ffffff40;
}

.T9Title
{
	font-size: 15px;
	color: #ffd8c0;
	margin-bottom: 6px;
	width: 100%;
}

.T9Box
{
	width: 120px;
	height: 120px;
	horizontal-align: center;
}

.T9Btn
{
	background-color: #3a3f5a;
	border: 1px solid #ffffff40;
}

.T9Btn:hover
{
	background-color: #5a5f9a;
}

.T9Fill
{
	width: 100%;
	height: 100%;
	opacity: 0.85;
}

.T9Face
{
	horizontal-align: center;
	vertical-align: center;
	font-size: 18px;
	color: #ffffff;
}

.T9Ghost
{
	width: 100%;
	height: 100%;
	opacity: 0.02;
}

.T9Probe
{
	width: 1px;
	height: 1px;
	opacity: 0;
}

.T9Status
{
	width: 100%;
	font-size: 16px;
	color: #9fe0ff;
	margin: 6px;
}
`;
const script = `// GridStudio test 9: the account off an avatar, and the profile opened with it.
(function ()
{
	var root = $.GetContextPanel(), top = root;
	while ( top.GetParent() ) top = top.GetParent();
	function find( id ) { return root.FindChildTraverse( id ) || top.FindChildTraverse( id ); }
	var probe = find( 'T9Probe' ), button = find( 'T9Script' ), status = find( 'T9Status' );
	function account()
	{
		var seen = [];
		try { seen.push( 'accountid=' + probe.accountid ); } catch ( e ) { seen.push( 'accountid error' ); }
		try { seen.push( 'steamid=' + probe.steamid ); } catch ( e ) { seen.push( 'steamid error' ); }
		return seen.join( '  ' );
	}
	if ( status ) status.text = 'P6: ' + account();
	if ( button ) button.SetPanelEvent( 'onactivate', function ()
	{
		var id = probe ? probe.accountid : 0;
		if ( status ) status.text = 'P6 pressed: ' + account();
		$.DispatchEvent( 'DOTAShowShowcasePage', id );
		$.Schedule( 0.5, function () { $.DispatchEvent( 'DOTAShowProfilePage', id ); } );
	} );
	$.Schedule( 2, function () { if ( status && status.text.indexOf( 'pressed' ) < 0 ) status.text = 'P6: ' + account(); } );
})();
`;
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error('Не-ASCII'); return text; };
const page = home.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${STYLE}" />$1</styles>\n\t<scripts>\n\t\t<include src="s2r://${SCRIPT.replace(/_c$/, '')}" />\n\t</scripts>`)
  .replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgets" hittest="false">\n${panels}\n\t\t</Panel>`);
if (!page.includes('T9Frame')) throw new Error('Не вышло собрать главную теста.');
const pack = buildVPK([
  { path: HOME, data: panoramaResource(HOME, ascii(page)) },
  { path: STYLE, data: panoramaResource(STYLE, ascii(style)) },
  { path: SCRIPT, data: newScript(SCRIPT, ascii(script)) }
], { version: 2, md5 });
const README = `Тест 9 GridStudio — ${new Date().toISOString().slice(0, 10)}: кнопка «Мой профиль»

Одна папка: Dota закрыта, папку game — в "dota 2 beta" с заменой, запусти Dota. Потом верни свой фон командой с сайта.
Оранжевая рамка, шесть окошек P1–P6. Нажми в каждом на квадрат (после каждого вернись на главную) и напиши,
какие открыли твой профиль. Скриншот строки под окошками тоже нужен (в ней номер аккаунта, который увидел скрипт).
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const zip = await buildZip([{ name: 'game/dota_russian/pak02_dir.vpk', data: pack }, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${(pack.length / 1024).toFixed(0)} КБ`);
