// Test 12b (2026-11-02). Test 12: the unseen page brought the meta every way (1 px, opacity 0, collapsed, out of the
// screen), the server's redirect came back with its data, screen/additive took the page's black away and multiply its
// white — but the META card stayed empty: the heroes made from the script (BCreateChildren of a DOTAHeroImage) did
// not show and said nothing. Now the same data (a collapsed page, test 12's feed.html) drawn two ways, and every way of
// making a hero's picture from a script side by side, each with its error if it throws:
//   A  DOTAHeroImage by $.CreatePanel with its attributes;   B  a plain Image of the hero's card (s2r://…/selection/…);
//   H1 CreatePanel DOTAHeroImage + attributes, H2 CreatePanel then .heroname, H3 BCreateChildren, H4 Image with src,
//   H5 Image + SetImage, H6 DOTAHeroMovie + attributes.
//   node scripts/make-widget-test-12b.mjs <out.zip> [--base https://dev.gridstudio.me/tests/t12/]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { newScript } from './panorama-laco.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-12b.zip';
const BASE = option('--base') || 'https://dev.gridstudio.me/tests/t12/';
const home = readFileSync(new URL('../assets/dota-menu/dashboard_page_home.xml', import.meta.url), 'utf8');
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII: ${text.match(/[^\x00-\x7f]/)[0]}`); return text; };

const HOME = 'panorama/layout/dashboard_page_home.vxml_c', STYLE = 'panorama/styles/gridstudio_t12b.vcss_c', SCRIPT = 'panorama/scripts/gridstudio_t12b.vjs_c';
const card = (id, title) => `<Panel class="T12bCard">
	<Label class="T12bKicker" text="${title}" />
	<Panel id="T12b${id}" class="T12bRow"><Label class="T12bWait" text="waiting for the data..." /></Panel>
	<Label id="T12b${id}Note" class="T12bNote" text="Powered by STRATZ" />
</Panel>`;
const ways = [['H1', 'CreatePanel + attrs'], ['H2', 'CreatePanel, .heroname'], ['H3', 'BCreateChildren'], ['H4', 'Image src'], ['H5', 'Image SetImage'], ['H6', 'DOTAHeroMovie']];
const panels = `<Panel id="T12bFrame">
${card('A', 'META  /  CARRY  /  A: DOTAHeroImage')}
${card('B', 'META  /  CARRY  /  B: IMAGE')}
${ways.map(([id, title]) => `<Panel class="T12bCell"><Label class="T12bTitle" text="${id} ${title}" /><Panel id="T12b${id}" class="T12bSlot" /><Label id="T12b${id}Msg" class="T12bLine" text="..." /></Panel>`).join('\n')}
<Panel class="T12bCell is-wide"><Label class="T12bTitle" text="data" /><HTML id="T12bFeed" class="T12bFeed" /><Label id="T12bEv" class="T12bLine" text="no URLChanged yet" /><Label id="T12bBeat" class="T12bLine" text="NO SCRIPT" /></Panel>
</Panel>`;
const style = `#T12bFrame
{
	x: 24px;
	y: 16px;
	width: 1440px;
	flow-children: right-wrap;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #40ffd0;
}

.T12bCard
{
	width: 460px;
	height: 250px;
	margin: 4px;
	padding: 14px 16px;
	flow-children: down;
	background-color: gradient( linear, 0% 0%, 0% 100%, from( #1b1f27f2 ), to( #0e1116f2 ) );
	border: 1px solid #ffffff1f;
	border-top: 2px solid #e8c66a;
}

.T12bKicker
{
	font-size: 13px;
	letter-spacing: 2px;
	color: #e8c66a;
	margin-bottom: 10px;
}

.T12bRow
{
	width: 100%;
	height: 168px;
	flow-children: right;
}

.T12bWait
{
	color: #8b96a5;
	font-size: 15px;
}

.T12bHero
{
	width: 132px;
	height: 168px;
	margin-right: 10px;
	flow-children: down;
}

.T12bPic
{
	width: 132px;
	height: 136px;
	border: 1px solid #ffffff24;
}

.T12bWr
{
	horizontal-align: center;
	margin-top: 4px;
	font-size: 20px;
	font-weight: bold;
	color: #c9d1db;
}

.T12bWr.is-up
{
	color: #7fdc8a;
}

.T12bNote
{
	font-size: 12px;
	color: #8b96a5;
}

.T12bCell
{
	width: 220px;
	height: 250px;
	margin: 4px;
	padding: 8px;
	flow-children: down;
	border: 1px solid #ffffff40;
	background-color: #00000066;
}

.T12bCell.is-wide
{
	width: 460px;
	height: 120px;
}

.T12bTitle
{
	font-size: 15px;
	color: #c0fff0;
	margin-bottom: 6px;
}

.T12bSlot
{
	width: 100px;
	height: 132px;
	background-color: #ffffff14;
	margin-bottom: 4px;
}

.T12bSlot DOTAHeroImage, .T12bSlot Image, .T12bSlot DOTAHeroMovie
{
	width: 100%;
	height: 100%;
}

.T12bFeed
{
	width: 10px;
	height: 10px;
	visibility: collapse;
}

.T12bLine
{
	width: 100%;
	font-size: 13px;
	color: #9fe0ff;
	margin-bottom: 2px;
}
`;
const script = `// GridStudio test 12b: the meta drawn by Dota, and every way to make a hero's picture from a script.
(function ()
{
	var BASE = '${BASE}';
	var root = $.GetContextPanel(), top = root;
	while ( top.GetParent() ) top = top.GetParent();
	function find( id ) { return root.FindChildTraverse( id ) || top.FindChildTraverse( id ); }
	function say( id, text ) { var label = find( id ); if ( label ) label.text = text; }
	function pad( n ) { return ( n < 10 ? '0' : '' ) + n; }
	function clock() { var d = new Date(); return pad( d.getHours() ) + ':' + pad( d.getMinutes() ) + ':' + pad( d.getSeconds() ); }
	function param( url, name )
	{
		var m = new RegExp( '[?#&]' + name + '=([^&#]*)' ).exec( url || '' );
		if ( !m ) return null;
		try { return decodeURIComponent( m[ 1 ].replace( /\\+/g, ' ' ) ); } catch ( e ) { return '?'; }
	}
	function urlOf( list ) { for ( var i = 0; i < list.length; i++ ) if ( typeof list[ i ] === 'string' && /^https?:/.test( list[ i ] ) ) return list[ i ]; return ''; }
	function card( name ) { return 's2r://panorama/images/heroes/selection/npc_dota_hero_' + name + '_png.vtex'; }
	function attrs( name ) { return { heroname: name, heroimagestyle: 'portrait', scaling: 'stretch-to-cover-preserve-aspect' }; }

	// Every way for one hero, each said OK or its error.
	var WAYS = {
		H1: function ( slot, name ) { return $.CreatePanel( 'DOTAHeroImage', slot, '', attrs( name ) ); },
		H2: function ( slot, name ) { var p = $.CreatePanel( 'DOTAHeroImage', slot, '' ); p.heroimagestyle = 'portrait'; p.heroname = name; return p; },
		H3: function ( slot, name ) { slot.BCreateChildren( '<DOTAHeroImage heroname="' + name + '" heroimagestyle="portrait" scaling="stretch-to-cover-preserve-aspect" />' ); return slot.GetChild( 0 ); },
		H4: function ( slot, name ) { return $.CreatePanel( 'Image', slot, '', { src: card( name ), scaling: 'stretch-to-cover-preserve-aspect' } ); },
		H5: function ( slot, name ) { var p = $.CreatePanel( 'Image', slot, '' ); p.SetScaling( 'stretch-to-cover-preserve-aspect' ); p.SetImage( card( name ) ); return p; },
		H6: function ( slot, name ) { return $.CreatePanel( 'DOTAHeroMovie', slot, '', { heroname: name, autoplay: 'onload' } ); }
	};
	function tryWays( name )
	{
		for ( var id in WAYS )
		{
			var slot = find( 'T12b' + id );
			if ( !slot ) continue;
			try { slot.RemoveAndDeleteChildren(); var made = WAYS[ id ]( slot, name ); say( 'T12b' + id + 'Msg', made ? 'made ' + made.paneltype + ' (' + name + ')' : 'made nothing' ); }
			catch ( e ) { say( 'T12b' + id + 'Msg', 'ERROR ' + e ); }
		}
	}

	// The two cards: A with DOTAHeroImage, B with a plain Image.
	var shown = '';
	function draw( id, data, picture )
	{
		var row = find( 'T12b' + id );
		if ( !row ) return;
		try
		{
			row.RemoveAndDeleteChildren();
			data.split( ',' ).slice( 0, 3 ).forEach( function ( item )
			{
				var parts = item.split( ':' ), name = ( parts[ 0 ] || '' ).replace( /[^a-z_]/g, '' ), wins = parseFloat( parts[ 1 ] );
				if ( !name ) return;
				var hero = $.CreatePanel( 'Panel', row, '' );
				hero.AddClass( 'T12bHero' );
				var pic = picture( hero, name );
				pic.AddClass( 'T12bPic' );
				var label = $.CreatePanel( 'Label', hero, '' );
				label.AddClass( 'T12bWr' );
				label.text = isNaN( wins ) ? '-' : wins.toFixed( 1 ) + '%';
				if ( wins >= 50 ) label.AddClass( 'is-up' );
			} );
			say( 'T12b' + id + 'Note', 'Powered by STRATZ   drawn at ' + clock() );
		}
		catch ( e ) { say( 'T12b' + id + 'Note', 'ERROR ' + e ); }
	}
	function show( data )
	{
		if ( data === shown ) return;
		shown = data;
		draw( 'A', data, function ( hero, name ) { return $.CreatePanel( 'DOTAHeroImage', hero, '', attrs( name ) ); } );
		draw( 'B', data, function ( hero, name ) { return $.CreatePanel( 'Image', hero, '', { src: card( name ), scaling: 'stretch-to-cover-preserve-aspect' } ); } );
		tryWays( ( data.split( ':' )[ 0 ] || 'lina' ).replace( /[^a-z_]/g, '' ) );
	}

	// The data: test 12's page, collapsed, again every 30 s.
	var web = find( 'T12bFeed' ), events = 0, got = 0, round = 0;
	if ( web )
	{
		$.RegisterEventHandler( 'HTMLURLChanged', web, function ()
		{
			events++;
			var data = param( urlOf( arguments ), 'd' );
			if ( data === null ) { say( 'T12bEv', 'events ' + events + ', loading...' ); return; }
			got++;
			say( 'T12bEv', 'events ' + events + ', data x' + got + ' at ' + clock() + ': ' + data.slice( 0, 50 ) );
			if ( data !== 'error' ) show( data );
		} );
		var load = function () { round++; web.SetURL( BASE + 'feed.html?k=b&r=' + round ); $.Schedule( 30, load ); };
		load();
	}
	else say( 'T12bEv', 'no panel' );

	function beat() { say( 'T12bBeat', 'SCRIPT OK ' + clock() ); $.Schedule( 1, beat ); }
	beat();
})();
`;
const page = home.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${STYLE}" />$1</styles>\n\t<scripts>\n\t\t<include src="s2r://${SCRIPT.replace(/_c$/, '')}" />\n\t</scripts>`)
  .replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgets" hittest="false">\n${panels}\n\t\t</Panel>`);
if (!page.includes('T12bFrame') || !page.includes('gridstudio_t12b.vjs"')) throw new Error('Не вышло собрать главную теста.');
const pack = buildVPK([
  { path: HOME, data: panoramaResource(HOME, ascii(page)) },
  { path: STYLE, data: panoramaResource(STYLE, ascii(style)) },
  { path: SCRIPT, data: newScript(SCRIPT, ascii(script)) }
], { version: 2, md5 });

const README = `Тест 12b GridStudio — ${new Date().toISOString().slice(0, 10)}: карточка меты, нарисованная Dota

Одна папка: Dota закрыта, папку game — в "dota 2 beta" с заменой, запусти Dota. Потом верни свой фон командой с сайта.
Бирюзовая рамка на главной. Подожди полминуты и сделай скриншот.

A и B — та же карточка меты двумя способами: в какой появились герои с процентами?
H1–H6 — шесть способов создать портрет героя из скрипта: где есть картинка (или видео), и что написано под окошком.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const zip = await buildZip([{ name: 'game/dota_russian/pak02_dir.vpk', data: pack }, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${(pack.length / 1024).toFixed(0)} КБ`);
