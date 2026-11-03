// The eleventh in-game test (2026-11-02): what a web page in the menu can do, after d2pfx's «TikTok Overlay»
// (github.com/BasteArima/dota2-tiktok-overlay) — the same HTML panel (Steam's browser) test 7 proved, but touched:
//   W1 a page that takes the mouse and the keys (acceptsinput, acceptsfocus, focusonhover; the keys given while the
//      cursor is over it, as the overlay does): a button with a counter, a list for the wheel, a text field;
//   W2 the same page without those attributes, to compare;
//   W3 Twitch's player inside our page (player.twitch.tv with parent=), channels to switch;
//   T1 a page with a transparent ground over stripes: does the menu show through?
//   B1–B4 the way back: the page puts its data into its address (hash, pushState, replaceState, a new load) and the
//      script reads it from HTMLURLChanged — a page's data shown by Dota's own labels.
//   node scripts/make-widget-test-11.mjs <out.zip> [--base https://dev.gridstudio.me/tests/t11/] [--pages <dir>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { newScript } from './panorama-laco.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';

const args = process.argv.slice(2), option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'gridstudio-widget-test-11.zip';
const BASE = option('--base') || 'https://dev.gridstudio.me/tests/t11/';
const home = readFileSync(new URL('../assets/dota-menu/dashboard_page_home.xml', import.meta.url), 'utf8');
const ascii = (text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII: ${text.match(/[^\x00-\x7f]/)[0]}`); return text; };

// ——— The pages (written to --pages, served next to the test).
const HEAD = (title, css) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<style>${css}</style></head>`;
const PAGES = {
  'touch.html': `${HEAD('GridStudio test 11: touch', `html,body{margin:0;height:100%;background:#0d1014;color:#eef2f6;font:600 15px/1.3 system-ui,sans-serif}
main{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:8px;gap:6px}
.row{display:flex;gap:8px;align-items:center}
button{font:inherit;padding:6px 14px;border:0;border-radius:6px;background:#e8c66a;color:#14110a;cursor:pointer}
button:active{transform:translateY(1px)}
input{font:inherit;flex:1;min-width:0;padding:5px 8px;border-radius:6px;border:1px solid #3a4250;background:#151a21;color:#eef2f6}
ol{flex:1;overflow:auto;margin:0;padding:4px 4px 4px 30px;background:#151a21;border-radius:6px}
li{padding:2px 0;color:#a9b3c1}
small{color:#8b96a5;font-weight:500}`)}
<body><main>
<div class="row"><button id="press">Нажми</button><span id="count">нажатий: 0</span><small id="mouse">мышь: нет</small></div>
<div class="row"><input id="field" placeholder="Кликни и напиши"><small id="typed">0 симв.</small></div>
<ol id="list"></ol>
<small id="scroll">прокрутка: 0</small>
</main>
<script>
let n = 0;
press.onclick = () => { count.textContent = 'нажатий: ' + (++n); };
document.addEventListener('mousemove', () => { mouse.textContent = 'мышь: есть'; });
field.oninput = () => { typed.textContent = field.value.length + ' симв.'; };
for (let k = 1; k <= 40; k++) { const li = document.createElement('li'); li.textContent = 'Строка ' + k + ' — прокрути колесом'; list.appendChild(li); }
list.onscroll = () => { scroll.textContent = 'прокрутка: ' + Math.round(list.scrollTop); };
</script></body></html>
`,
  'twitch.html': `${HEAD('GridStudio test 11: Twitch', `html,body{margin:0;height:100%;background:#0d1014;color:#eef2f6;font:600 13px/1.2 system-ui,sans-serif}
main{display:flex;flex-direction:column;height:100%}
nav{display:flex;gap:4px;padding:4px}
nav button{font:inherit;padding:4px 8px;border:0;border-radius:5px;background:#26203a;color:#d9ccff;cursor:pointer}
nav button.on{background:#9146ff;color:#fff}
iframe{flex:1;border:0;width:100%}`)}
<body><main><nav id="nav"></nav><iframe id="player" allow="autoplay; fullscreen" allowfullscreen></iframe></main>
<script>
const CHANNELS = ['dota2ti', 'esl_dota2', 'pgl_dota2', 'linsiss'];
function show(channel) {
  player.src = 'https://player.twitch.tv/?channel=' + channel + '&parent=' + location.hostname + '&muted=true&autoplay=true';
  for (const b of nav.children) b.className = b.textContent === channel ? 'on' : '';
}
for (const channel of CHANNELS) { const b = document.createElement('button'); b.textContent = channel; b.onclick = () => show(channel); nav.appendChild(b); }
show(new URLSearchParams(location.search).get('channel') || CHANNELS[0]);
</script></body></html>
`,
  'clear.html': `${HEAD('GridStudio test 11: clear', `html,body{margin:0;height:100%;background:transparent;color:#fff;font:700 22px/1.3 system-ui,sans-serif}
main{display:grid;place-content:center;height:100%;text-align:center;gap:8px}
b{padding:8px 16px;border-radius:999px;background:rgba(0,0,0,.45);text-shadow:0 1px 2px #000}
small{font-size:14px;font-weight:600;text-shadow:0 1px 2px #000}`)}
<body><main><b>ПРОЗРАЧНЫЙ ФОН?</b><small>видишь цветные полосы за этим текстом — прозрачность работает</small></main></body></html>
`,
  'back.html': `${HEAD('GridStudio test 11: back', `html,body{margin:0;height:100%;background:#0d1014;color:#eef2f6;font:600 15px/1.3 system-ui,sans-serif}
main{display:grid;place-content:center;height:100%;text-align:center;gap:4px}
b{color:#e8c66a}small{color:#8b96a5}`)}
<body><main><b id="mode"></b><span id="state">...</span><small id="data">...</small></main>
<script>
const q = new URLSearchParams(location.search), way = q.get('mode') || 'hash';
let n = Number(q.get('n') || 0), text = '';
mode.textContent = way;
fetch('/tests/widget-data.json?v=t11-' + way).then((r) => r.json()).then((d) => { text = d.text; data.textContent = 'fetch OK: ' + text; }).catch((e) => { text = 'fetch error'; data.textContent = String(e); });
// The data into the address: the script in Dota reads it from HTMLURLChanged.
function send() {
  n++;
  const tail = 'n=' + n + '&d=' + encodeURIComponent(text || '...');
  state.textContent = 'отправлено: ' + n;
  if (way === 'hash') location.hash = tail;
  else if (way === 'push') { if (n <= 200) history.pushState(null, '', '?mode=push&' + tail); }
  else if (way === 'replace') history.replaceState(null, '', '?mode=replace&' + tail);
  else if (way === 'nav') { if (n <= 20) location.replace('?mode=nav&' + tail); }
}
setInterval(send, way === 'nav' ? 3000 : 2000);
</script></body></html>
`
};
const pagesDir = option('--pages');
if (pagesDir) { mkdirSync(pagesDir, { recursive: true }); for (const [name, text] of Object.entries(PAGES)) writeFileSync(join(pagesDir, name), text); }

// ——— The home page with the cells.
const HOME = 'panorama/layout/dashboard_page_home.vxml_c', STYLE = 'panorama/styles/gridstudio_t11.vcss_c', SCRIPT = 'panorama/scripts/gridstudio_t11.vjs_c';
const TOUCH = 'acceptsinput="true" acceptsfocus="true" focusonhover="true"';
const cell = (title, inner, cls = '') => `<Panel class="T11Cell${cls}"><Label class="T11Title" text="${title}" />${inner}</Panel>`;
const line = (id, text = '...') => `<Label id="${id}" class="T11Line" text="${text}" />`;
const back = (id, way) => cell(`${id} back: ${way}`, `<HTML id="T11${id}" class="T11Small" url="${BASE}back.html?mode=${way}&amp;v=t11-${way}" />${line(`T11${id}Ev`, 'no URLChanged yet')}${line(`T11${id}Data`, 'data: -')}${line(`T11${id}Fin`, 'no FinishRequest yet')}`, ' is-small');
const panels = `<Panel id="T11Frame">
${cell('W1 touch: mouse + keys', `<HTML id="T11W1" class="T11Web" url="${BASE}touch.html?v=t11-w1" ${TOUCH} />${line('T11W1Focus', 'keys: game')}`, ' is-web')}
${cell('W2 the same, no attributes', `<HTML id="T11W2" class="T11Web" url="${BASE}touch.html?v=t11-w2" />`, ' is-web')}
${cell('W3 Twitch', `<HTML id="T11W3" class="T11Web" url="${BASE}twitch.html?v=t11-w3" ${TOUCH} />`, ' is-web')}
${cell('T1 transparent page', `<Panel class="T11Stripes"><HTML id="T11T1" class="T11Clear" url="${BASE}clear.html?v=t11-t1" /></Panel>`, ' is-web')}
${back('B1', 'hash')}
${back('B2', 'push')}
${back('B3', 'replace')}
${back('B4', 'nav')}
${cell('script', line('T11Beat', 'NO SCRIPT'), ' is-small')}
</Panel>`;
const style = `#T11Frame
{
	x: 24px;
	y: 16px;
	width: 1440px;
	flow-children: right-wrap;
	padding: 10px;
	background-color: #10101ce6;
	border: 3px solid #9146ff;
}

.T11Cell
{
	margin: 4px;
	padding: 8px;
	flow-children: down;
	border: 1px solid #ffffff40;
	background-color: #00000066;
}

.T11Cell.is-web
{
	width: 460px;
	height: 300px;
}

.T11Cell.is-small
{
	width: 340px;
	height: 200px;
}

.T11Title
{
	font-size: 17px;
	color: #e0d0ff;
	margin-bottom: 6px;
}

.T11Web
{
	width: 440px;
	height: 230px;
	background-color: #ffffff14;
}

.T11Small
{
	width: 320px;
	height: 84px;
	background-color: #ffffff14;
	margin-bottom: 4px;
}

.T11Stripes
{
	width: 440px;
	height: 230px;
	background-color: gradient( linear, 0% 0%, 100% 0%, from( #ff4060 ), color-stop( 0.33, #ffd040 ), color-stop( 0.66, #40e080 ), to( #4090ff ) );
}

.T11Clear
{
	width: 100%;
	height: 100%;
}

.T11Line
{
	width: 100%;
	font-size: 15px;
	color: #9fe0ff;
	margin-bottom: 2px;
}
`;
const script = `// GridStudio test 11: web pages in the menu, touched; their data read back from their addresses.
(function ()
{
	var root = $.GetContextPanel(), top = root;
	while ( top.GetParent() ) top = top.GetParent();
	function find( id ) { return root.FindChildTraverse( id ) || top.FindChildTraverse( id ); }
	function say( id, text ) { var label = find( id ); if ( label ) label.text = text; }
	function pad( n ) { return ( n < 10 ? '0' : '' ) + n; }
	function xy( v ) { return v && v.x !== undefined ? v : { x: v ? v[ 0 ] : -1, y: v ? v[ 1 ] : -1 }; }
	function hit( panel, c )
	{
		var p = xy( panel.GetPositionWithinWindow() );
		return c.x >= p.x && c.y >= p.y && c.x <= p.x + panel.actuallayoutwidth && c.y <= p.y + panel.actuallayoutheight;
	}
	function param( url, name )
	{
		var m = new RegExp( '[?#&]' + name + '=([^&#]*)' ).exec( url );
		if ( !m ) return '-';
		try { return decodeURIComponent( m[ 1 ].replace( /\\+/g, ' ' ) ); } catch ( e ) { return '?'; }
	}

	// B1-B4: the address of the page, every time it changes.
	[ 'B1', 'B2', 'B3', 'B4' ].forEach( function ( id )
	{
		var web = find( 'T11' + id ), changed = 0, finished = 0;
		if ( !web ) { say( 'T11' + id + 'Ev', 'no panel' ); return; }
		try
		{
			$.RegisterEventHandler( 'HTMLURLChanged', web, function ()
			{
				changed++;
				var kinds = [], url = '';
				for ( var i = 0; i < arguments.length; i++ )
				{
					var a = arguments[ i ];
					kinds.push( typeof a );
					if ( typeof a === 'string' && /^https?:/.test( a ) ) url = a;
				}
				say( 'T11' + id + 'Ev', 'URLChanged x' + changed + '  n=' + param( url, 'n' ) + '  (' + kinds.join( ',' ) + ')' );
				say( 'T11' + id + 'Data', 'data: ' + param( url, 'd' ) );
			} );
		}
		catch ( e ) { say( 'T11' + id + 'Ev', 'register error ' + e ); }
		try { $.RegisterEventHandler( 'HTMLFinishRequest', web, function () { finished++; say( 'T11' + id + 'Fin', 'FinishRequest x' + finished ); } ); }
		catch ( e ) { say( 'T11' + id + 'Fin', 'register error ' + e ); }
	} );

	// W1, W3: the keys to the page while the cursor is over it (as the overlay does); the panning arrows hidden.
	var touch = [ find( 'T11W1' ), find( 'T11W3' ) ], given = null, ticks = 0;
	function tick()
	{
		try
		{
			var c = xy( GameUI.GetCursorPosition() ), over = null;
			touch.forEach( function ( web ) { if ( web && web.IsValid() && hit( web, c ) ) over = web; } );
			if ( over && ( over !== given || ticks % 10 === 0 ) )
			{
				over.SetFocus();
				$.DispatchEvent( 'SetInputFocus', over );
				given = over;
				say( 'T11W1Focus', 'keys: ' + over.id );
			}
			else if ( !over && given )
			{
				$.DispatchEvent( 'DropInputFocus', given );
				given = null;
				say( 'T11W1Focus', 'keys: game' );
			}
			if ( ticks % 20 === 0 ) touch.forEach( function ( web ) { var arrows = web && web.FindChildTraverse( 'MousePanningImage' ); if ( arrows ) arrows.visible = false; } );
		}
		catch ( e ) { say( 'T11W1Focus', 'keys error ' + e ); }
		ticks++;
		$.Schedule( 0.1, tick );
	}
	tick();

	function beat()
	{
		var now = new Date();
		say( 'T11Beat', 'SCRIPT OK ' + pad( now.getHours() ) + ':' + pad( now.getMinutes() ) + ':' + pad( now.getSeconds() ) );
		$.Schedule( 1, beat );
	}
	beat();
})();
`;
const page = home.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${STYLE}" />$1</styles>\n\t<scripts>\n\t\t<include src="s2r://${SCRIPT.replace(/_c$/, '')}" />\n\t</scripts>`)
  .replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgets" hittest="false">\n${panels}\n\t\t</Panel>`);
if (!page.includes('T11Frame') || !page.includes('gridstudio_t11.vjs"')) throw new Error('Не вышло собрать главную теста.');
const pack = buildVPK([
  { path: HOME, data: panoramaResource(HOME, ascii(page)) },
  { path: STYLE, data: panoramaResource(STYLE, ascii(style)) },
  { path: SCRIPT, data: newScript(SCRIPT, ascii(script)) }
], { version: 2, md5 });

const README = `Тест 11 GridStudio — ${new Date().toISOString().slice(0, 10)}: веб-страницы в меню, как у TikTok Overlay

Одна папка: Dota закрыта, папку game — в "dota 2 beta" с заменой, запусти Dota. Потом верни свой фон командой с сайта.
Фиолетовая рамка на главной. Подожди полминуты и сделай скриншот, потом попробуй руками:

W1 — наведи мышь на окно: нажми «Нажми» (растёт «нажатий»?), покрути список колесом, кликни в поле и напечатай.
     Строка под окном: «keys: T11W1», пока мышь над ним.
W2 — то же самое, но без настроек ввода — для сравнения: что из этого работает здесь.
W3 — Twitch: показался ли плеер? Переключи канал кнопками сверху, включи звук в самом плеере.
     Потом открой вкладку «Герои» — звук продолжает играть? Вернись на главную.
T1 — видны ли цветные полосы за надписью «ПРОЗРАЧНЫЙ ФОН?» (или там тёмный/белый фон).
B1–B4 — строки под окошками: растёт ли «URLChanged x…» и появилась ли «data: Привет из GridStudio».
Ещё напиши, не тормозит ли меню с этими окнами.

Если Dota не запускается — удали game\\dota_russian\\pak02_dir.vpk и вставь команду с сайта ещё раз.
`;
const readme = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]);
const zip = await buildZip([{ name: 'game/dota_russian/pak02_dir.vpk', data: pack }, { name: 'ПРОЧТИ.txt', data: readme }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${(pack.length / 1024).toFixed(0)} КБ`);
