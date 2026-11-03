// The twelfth in-game test (2026-11-02). Test 11: a web panel's data reaches Dota only by a new load of the page
// (B4: HTMLURLChanged x16, «Привет из GridStudio» in Dota's label; hash, pushState and replaceState gave nothing), the
// page draws on solid black (T1), a page takes the mouse and the keys with acceptsinput (W1), Twitch plays. Now:
//   META a live widget drawn by Dota itself: the hero meta (our /api/catalog/meta, STRATZ) for the carry, by a page
//        that no one sees — it loads the data and goes to an address with it (?d=lina:53.1,…), the script reads it;
//   M1–M4 that unseen page four ways: 1 px, opacity 0, collapsed, out of the screen — which of them still load;
//   R1–R2 no page at all: nginx answers a redirect with the server's own data (?t=$msec) — a plain request from the
//        script, seen in the address (R1 shown, R2 1 px), again every 15 s;
//   T1–T3 the page's black (or white) taken away by Panorama's blend modes: screen, additive, multiply.
//   node scripts/make-widget-test-12.mjs <out.zip> [--base https://dev.gridstudio.me/tests/t12/] [--pages <dir>]
// R1–R2 need dev nginx: `location = /tests/t12/r { return 302 …/tests/t12/blank.html?t=$msec&$args; }`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { newScript } from './panorama-laco.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';
import HEROES from './hero-portraits-data.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-12.zip';
const BASE = option('--base') || 'https://dev.gridstudio.me/tests/t12/';
const home = readFileSync(new URL('../assets/dota-menu/dashboard_page_home.xml', import.meta.url), 'utf8');
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII: ${text.match(/[^\x00-\x7f]/)[0]}`); return text; };

// ——— The pages (written to --pages, served next to the test).
const NAMES = Object.fromEntries(Object.entries(HEROES).map(([id, hero]) => [id, hero.name]));
const HEAD = (title, css) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<style>${css}</style></head>`;
const PAGES = {
  // The unseen page: the carry meta of the week, the three best by wins (with at least 1 % of the games), into the address.
  'feed.html': `${HEAD('GridStudio test 12: feed', 'html,body{margin:0;background:#0d1014;color:#eef2f6;font:600 13px system-ui,sans-serif}')}
<body><span id="state">...</span>
<script>
const NAMES = ${JSON.stringify(NAMES)};
const q = new URLSearchParams(location.search);
function go(data) { location.replace(location.pathname + '?k=' + encodeURIComponent(q.get('k') || '') + '&r=' + encodeURIComponent(q.get('r') || '') + '&d=' + encodeURIComponent(data)); }
if (!q.has('d')) fetch('/api/catalog/meta?bracket=all').then((r) => r.json()).then((meta) => {
  const carry = meta.positions[0], total = carry.reduce((sum, hero) => sum + hero.matches, 0);
  const best = carry.filter((hero) => hero.matches >= total / 100 && NAMES[hero.id]).sort((a, b) => b.wins / b.matches - a.wins / a.matches).slice(0, 3);
  go(best.map((hero) => NAMES[hero.id] + ':' + (hero.wins / hero.matches * 100).toFixed(1)).join(','));
}).catch((e) => go('error'));
else state.textContent = 'sent: ' + q.get('d');
</script></body></html>
`,
  'blank.html': `${HEAD('GridStudio test 12: redirect', `html,body{margin:0;height:100%;background:#0d1014;color:#eef2f6;font:600 14px system-ui,sans-serif}
main{display:grid;place-content:center;height:100%;text-align:center}`)}
<body><main id="out">...</main>
<script>out.textContent = 'redirect OK, t=' + new URLSearchParams(location.search).get('t');</script></body></html>
`,
  'glow.html': `${HEAD('GridStudio test 12: glow', `html,body{margin:0;height:100%;background:#000;color:#fff;font:800 26px/1.2 system-ui,sans-serif}
html.white,html.white body{background:#fff;color:#111}
main{position:relative;display:grid;place-content:center;height:100%;text-align:center;gap:6px}
i{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px;border-radius:50%;background:radial-gradient(circle,#ff9a3c 0,#ff4fa0 45%,transparent 70%);opacity:.9}
b,small{position:relative}small{font-size:13px;font-weight:600}`)}
<body><main><i></i><b>GRIDSTUDIO</b><small id="note"></small></main>
<script>
if (new URLSearchParams(location.search).get('bg') === 'white') { document.documentElement.className = 'white'; note.textContent = 'белое должно пропасть'; }
else note.textContent = 'чёрное должно пропасть';
</script></body></html>
`
};
const pagesDir = option('--pages');
if (pagesDir) { mkdirSync(pagesDir, { recursive: true }); for (const [name, text] of Object.entries(PAGES)) writeFileSync(join(pagesDir, name), text); }

// ——— The home page with the cells.
const HOME = 'panorama/layout/dashboard_page_home.vxml_c', STYLE = 'panorama/styles/gridstudio_t12.vcss_c', SCRIPT = 'panorama/scripts/gridstudio_t12.vjs_c';
const cell = (title, inner, cls = '') => `<Panel class="T12Cell${cls}"><Label class="T12Title" text="${title}" />${inner}</Panel>`;
const line = (id, text = '...') => `<Label id="${id}" class="T12Line" text="${text}" />`;
const glow = (id, mode, bg = '') => cell(`${id} blend: ${mode}`, `<Panel class="T12Stripes"><HTML id="T12${id}" class="T12Glow is-${mode}" url="${BASE}glow.html?v=t12-${id}${bg ? `&amp;bg=${bg}` : ''}" /></Panel>`, ' is-glow');
const messenger = (id, title, cls) => cell(`${id} ${title}`, `<HTML id="T12${id}" class="T12Messenger ${cls}" />${line(`T12${id}Ev`, 'no URLChanged yet')}`, ' is-small');
const redirect = (id, title, cls) => cell(`${id} ${title}`, `<HTML id="T12${id}" class="${cls}" />${line(`T12${id}Ev`, 'no URLChanged yet')}${line(`T12${id}Args`, '-')}`, ' is-small');
const panels = `<Panel id="T12Frame">
<Panel class="T12Cell is-meta">
	<Label class="T12Kicker" text="META  /  CARRY  /  THIS WEEK" />
	<Panel id="T12Heroes"><Label class="T12Wait" text="waiting for the data..." /></Panel>
	<Label id="T12MetaNote" class="T12Note" text="Powered by STRATZ" />
</Panel>
${glow('T1', 'screen')}
${glow('T2', 'additive')}
${glow('T3', 'multiply', 'white')}
${messenger('M1', '1 px', 'is-dot')}
${messenger('M2', 'opacity 0', 'is-clear')}
${messenger('M3', 'collapsed', 'is-gone')}
${messenger('M4', 'out of the screen', 'is-away')}
${redirect('R1', 'redirect, shown', 'T12Shown')}
${redirect('R2', 'redirect, 1 px', 'T12Messenger is-dot')}
${cell('script', line('T12Beat', 'NO SCRIPT'), ' is-small')}
</Panel>`;
const style = `#T12Frame
{
	x: 24px;
	y: 16px;
	width: 1440px;
	flow-children: right-wrap;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #40c0ff;
}

.T12Cell
{
	margin: 4px;
	padding: 8px;
	flow-children: down;
	border: 1px solid #ffffff40;
	background-color: #00000066;
}

.T12Cell.is-glow
{
	width: 290px;
	height: 250px;
}

.T12Cell.is-small
{
	width: 340px;
	height: 120px;
}

.T12Cell.is-meta
{
	width: 460px;
	height: 250px;
	padding: 14px 16px;
	background-color: gradient( linear, 0% 0%, 0% 100%, from( #1b1f27f2 ), to( #0e1116f2 ) );
	border: 1px solid #ffffff1f;
	border-top: 2px solid #e8c66a;
}

.T12Title
{
	font-size: 17px;
	color: #c0ecff;
	margin-bottom: 6px;
}

.T12Kicker
{
	font-size: 13px;
	letter-spacing: 2px;
	color: #e8c66a;
	margin-bottom: 10px;
}

#T12Heroes
{
	width: 100%;
	height: 168px;
	flow-children: right;
}

.T12Wait
{
	color: #8b96a5;
	font-size: 15px;
}

.T12Hero
{
	width: 132px;
	height: 168px;
	margin-right: 10px;
	flow-children: down;
}

.T12HeroPic
{
	width: 132px;
	height: 136px;
	border: 1px solid #ffffff24;
}

.T12Wr
{
	horizontal-align: center;
	margin-top: 4px;
	font-size: 20px;
	font-weight: bold;
	color: #c9d1db;
}

.T12Wr.is-up
{
	color: #7fdc8a;
}

.T12Note
{
	font-size: 12px;
	color: #8b96a5;
}

.T12Stripes
{
	width: 270px;
	height: 190px;
	background-color: gradient( linear, 0% 0%, 100% 0%, from( #ff4060 ), color-stop( 0.33, #ffd040 ), color-stop( 0.66, #40e080 ), to( #4090ff ) );
}

.T12Glow
{
	width: 100%;
	height: 100%;
}

.T12Glow.is-screen
{
	-s2-mix-blend-mode: screen;
}

.T12Glow.is-additive
{
	-s2-mix-blend-mode: additive;
}

.T12Glow.is-multiply
{
	-s2-mix-blend-mode: multiply;
}

.T12Messenger
{
	width: 320px;
	height: 40px;
}

.T12Messenger.is-dot
{
	width: 1px;
	height: 1px;
}

.T12Messenger.is-clear
{
	opacity: 0;
}

.T12Messenger.is-gone
{
	visibility: collapse;
}

.T12Messenger.is-away
{
	position: -3000px 0px 0px;
}

.T12Shown
{
	width: 320px;
	height: 40px;
}

.T12Line
{
	width: 100%;
	font-size: 14px;
	color: #9fe0ff;
	margin-bottom: 2px;
}
`;
const script = `// GridStudio test 12: data from the internet in Dota's own panels, by a web panel's address.
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
	function strings( list ) { var all = []; for ( var i = 0; i < list.length; i++ ) if ( typeof list[ i ] === 'string' ) all.push( list[ i ] ); return all; }
	function urlOf( list ) { var all = strings( list ); for ( var i = 0; i < all.length; i++ ) if ( /^https?:/.test( all[ i ] ) ) return all[ i ]; return ''; }

	// The meta card: three heroes and their wins, drawn by Dota.
	var shown = '';
	function show( data, from )
	{
		say( 'T12MetaNote', 'Powered by STRATZ   via ' + from + ' at ' + clock() );
		if ( data === shown ) return;
		var list = find( 'T12Heroes' );
		if ( !list ) return;
		shown = data;
		list.RemoveAndDeleteChildren();
		data.split( ',' ).slice( 0, 3 ).forEach( function ( item )
		{
			var parts = item.split( ':' ), name = ( parts[ 0 ] || '' ).replace( /[^a-z_]/g, '' ), wins = parseFloat( parts[ 1 ] );
			if ( !name ) return;
			var hero = $.CreatePanel( 'Panel', list, '' );
			hero.AddClass( 'T12Hero' );
			hero.BCreateChildren( '<DOTAHeroImage class="T12HeroPic" heroname="' + name + '" heroimagestyle="portrait" scaling="stretch-to-cover-preserve-aspect" />' );
			var label = $.CreatePanel( 'Label', hero, '' );
			label.AddClass( 'T12Wr' );
			label.text = isNaN( wins ) ? '-' : wins.toFixed( 1 ) + '%';
			if ( wins >= 50 ) label.AddClass( 'is-up' );
		} );
	}

	// M1-M4: the unseen page, again every 30 s; R1-R2: the redirect, again every 15 s.
	function watch( id, every, onAddress )
	{
		var web = find( 'T12' + id ), events = 0, round = 0;
		if ( !web ) { say( 'T12' + id + 'Ev', 'no panel' ); return; }
		try { $.RegisterEventHandler( 'HTMLURLChanged', web, function () { events++; onAddress( urlOf( arguments ), events, arguments ); } ); }
		catch ( e ) { say( 'T12' + id + 'Ev', 'register error ' + e ); return; }
		function load()
		{
			round++;
			try { web.SetURL( BASE + ( id.charAt( 0 ) === 'R' ? 'r?k=' : 'feed.html?k=' ) + id + '&r=' + round ); }
			catch ( e ) { say( 'T12' + id + 'Ev', 'SetURL error ' + e ); }
			$.Schedule( every, load );
		}
		load();
	}
	[ 'M1', 'M2', 'M3', 'M4' ].forEach( function ( id )
	{
		var got = 0;
		watch( id, 30, function ( url, events )
		{
			var data = param( url, 'd' );
			if ( data === null ) { say( 'T12' + id + 'Ev', 'events ' + events + ', loading...' ); return; }
			got++;
			say( 'T12' + id + 'Ev', 'events ' + events + ', data x' + got + ' at ' + clock() );
			if ( data !== 'error' ) show( data, id );
		} );
	} );
	[ 'R1', 'R2' ].forEach( function ( id )
	{
		var got = 0;
		watch( id, 15, function ( url, events, list )
		{
			var t = param( url, 't' );
			if ( t !== null ) got++;
			say( 'T12' + id + 'Ev', 'events ' + events + ', server t x' + got + ( t !== null ? ': ' + t : '' ) );
			say( 'T12' + id + 'Args', strings( list ).map( function ( s ) { return s.replace( /^https:\\/\\/[^\\/]+/, '' ).slice( 0, 40 ); } ).join( ' | ' ) );
		} );
	} );

	function beat()
	{
		say( 'T12Beat', 'SCRIPT OK ' + clock() );
		$.Schedule( 1, beat );
	}
	beat();
})();
`;
const page = home.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${STYLE}" />$1</styles>\n\t<scripts>\n\t\t<include src="s2r://${SCRIPT.replace(/_c$/, '')}" />\n\t</scripts>`)
  .replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgets" hittest="false">\n${panels}\n\t\t</Panel>`);
if (!page.includes('T12Frame') || !page.includes('gridstudio_t12.vjs"')) throw new Error('Не вышло собрать главную теста.');
const pack = buildVPK([
  { path: HOME, data: panoramaResource(HOME, ascii(page)) },
  { path: STYLE, data: panoramaResource(STYLE, ascii(style)) },
  { path: SCRIPT, data: newScript(SCRIPT, ascii(script)) }
], { version: 2, md5 });

const README = `Тест 12 GridStudio — ${new Date().toISOString().slice(0, 10)}: данные из интернета в панелях самой Dota

Одна папка: Dota закрыта, папку game — в "dota 2 beta" с заменой, запусти Dota. Потом верни свой фон командой с сайта.
Голубая рамка на главной. Подожди минуту и сделай скриншот.

META — карточка, которую рисует сама Dota: три лучших керри недели (STRATZ) с процентом побед. Данные берёт
   невидимая веб-страница. Показались ли герои и проценты? Внизу строка «via M…» — какая из страниц их принесла.
M1–M4 — та же невидимая страница четырьмя способами (1 пиксель, прозрачная, свёрнутая, за экраном): где есть «data x…».
R1–R2 — запрос без страницы, через переадресацию сервера: растёт ли «server t x…» (раз в 15 секунд).
T1–T3 — веб-страница поверх цветных полос: пропал ли чёрный (T1, T2) или белый (T3) фон, видны ли полосы.

Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const zip = await buildZip([{ name: 'game/dota_russian/pak02_dir.vpk', data: pack }, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${(pack.length / 1024).toFixed(0)} КБ`);
