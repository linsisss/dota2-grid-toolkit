// «Мета героев» in Dota (2026-11-02, the owner: «мету … в "Героях" и в момент пика в игре. По умолчанию скрытый
// виджет, который можно будет открыть, посмотреть топ 10 героев на каждую позицию, а так же нажать на него чтобы
// увидеть сборки»; 11-03: more heroes, sorted by win rate or by pick rate, the language switched in the widget, an
// accent of the presets, the hero on STRATZ, the tab on either side at any height, «by gridstudio.me»). A tab at the
// edge of the «Герои» page and of the pick screen opens a window: the five positions, their heroes (STRATZ's week,
// server/meta-widget.mjs), and a hero's build on a click — starting items, boots, the core by the minute it is done,
// the situational ones, the skill order and the talents — drawn with Dota's own panels.
// How it gets the data (tests 11–12b): a collapsed web panel (HTML) opens /api/catalog/w/meta or /w/build, the server
// redirects to /w/ok?…&d=<text>, and the script reads the text off that address (HTMLURLChanged). Nothing is asked
// before the window is opened; the meta and the builds are kept for an hour in GameUI.CustomUIConfig(), which the menu
// and the match share, so the pick screen opens at once when the «Герои» page loaded it (and keeps the language,
// the position and the order chosen there).
// Where it runs: the «Герои» page includes our script (heroesPageMeta); the pick screen's own script,
// panorama/scripts/hud/dota_hud_pregame.vts_c, is Valve's (assets/dota-menu/dota_hud_pregame.js, functions the game
// calls) with ours after it (pregameScript) — the pick screen's layout itself stays Valve's (test 13).
// Panels are made by the script with inline styles (no stylesheet reaches the pick screen); texts are ASCII through
// \u escapes (asciiJSON), as everything Panorama reads.
import { META_BRACKETS, META_BRACKET_NAMES, META_POSITION_TITLES } from './hero-meta.mjs';
import { newScript, readResource } from './panorama-laco.mjs';

export const META_SCRIPT = 'panorama/scripts/gridstudio_meta.vjs_c';
export const PREGAME_SCRIPT = 'panorama/scripts/hud/dota_hud_pregame.vts_c';
export const META_PLACES = Object.freeze(['heroes', 'pick']);
// The sites a widget may ask: the one it was built on (a page served elsewhere, as on a developer's machine, asks GridStudio).
export const META_ORIGINS = Object.freeze(['https://gridstudio.me', 'https://dev.gridstudio.me']);
export const metaOrigin = (origin) => (META_ORIGINS.includes(origin) ? origin : META_ORIGINS[0]);
export const META_LANGS = Object.freeze(['ru', 'en']);
// The accents to choose from (the owner: «цвет акцента из пресетов»): Dota's gold first.
export const META_ACCENTS = Object.freeze(['#e8c66a', '#ff8a4c', '#ff5d73', '#c38bff', '#5aa9ff', '#36d1c4', '#7fdc8a', '#dfe6ee']);
export const META_ACCENT_NAMES = Object.freeze({ '#e8c66a': 'Золото', '#ff8a4c': 'Пламя', '#ff5d73': 'Рубин', '#c38bff': 'Аметист', '#5aa9ff': 'Сапфир', '#36d1c4': 'Бирюза', '#7fdc8a': 'Изумруд', '#dfe6ee': 'Серебро' });
export const META_SIDES = Object.freeze(['left', 'right']);
// How many heroes a position lists (the most played, with at least 0.5 % of its games, i.e. a 1 % pick rate there).
export const META_LIST = 40;
export const META_WIDGET_DEFAULTS = Object.freeze({ heroes: true, pick: true, bracket: 'all', accent: META_ACCENTS[0], side: 'left', top: 8, lang: 'ru' });

// «Мета героев» of a look or a recipe: where it shows, for which ranks, how it looks and where its tab is; null when
// nowhere (as in Dota). `lang`: the widget's language until switched in it (the site's by default).
export function metaSettings(value) {
  if (!value || typeof value !== 'object') return null;
  const heroes = value.heroes === true, pick = value.pick === true;
  if (!heroes && !pick) return null;
  const d = META_WIDGET_DEFAULTS;
  return { heroes, pick, bracket: Object.hasOwn(META_BRACKETS, value.bracket) ? value.bracket : d.bracket,
    accent: META_ACCENTS.includes(value.accent) ? value.accent : d.accent, side: META_SIDES.includes(value.side) ? value.side : d.side,
    top: Number.isInteger(value.top) && value.top >= 0 && value.top <= 100 ? value.top : d.top, lang: META_LANGS.includes(value.lang) ? value.lang : d.lang };
}

// The settings a user changes in the widget itself (2026-11-03, the owner: «разве мы не можем сделать сразу в игре смену
// акцента, позиции?»): accent, side, height, language and order, kept by the widget's web panel as a cookie of
// GridStudio's (/api/catalog/w/prefs; Dota's Panorama keeps nothing between games, Steam's browser keeps its cookies).
// The text: accent (hex, no #).side.top.lang.sort.sig — sig the file's own look (metaSignature), so a file built anew
// on the site starts from its own settings; what does not fit is dropped, an empty text is the file's own.
export const META_SORTS = Object.freeze(['wins', 'pick']);
export function metaPrefs(text) {
  const [accent, side, top, lang, sort, sig] = String(text || '').split('.');
  const value = { accent: `#${accent}`, side, top: /^\d{1,3}$/.test(top || '') ? Number(top) : -1, lang, sort, sig };
  if (!META_ACCENTS.includes(value.accent) || !META_SIDES.includes(side) || value.top < 0 || value.top > 100 || !META_LANGS.includes(lang) || !META_SORTS.includes(sort) || !/^[a-z0-9]{1,16}$/.test(sig || '')) return null;
  return value;
}
export const metaPrefsText = (value) => [value.accent.slice(1), value.side, value.top, value.lang, value.sort, value.sig].join('.');

const TEXTS = {
  ru: {
    tab: 'МЕТА', tabTip: 'Мета героев — топ и сборки. Вкладку можно перетащить', title: 'Мета', roles: ['Керри', 'Мид', 'Оффлейн', 'Подд. 4', 'Подд. 5'], positions: [...META_POSITION_TITLES],
    error: 'Нет связи с GridStudio', retry: 'Ещё раз', empty: 'Нет данных', hero: 'Герой', pick: 'Пикрейт', wins: 'Винрейт',
    back: 'К списку', stratz: 'Открыть на STRATZ', items: 'Предметы', skills: 'Прокачка',
    start: 'Старт', boots: 'Обувь', early: 'Ранние', mid: 'Середина', late: 'Поздние', earlyNote: '0–15 мин', midNote: '15–35 мин', lateNote: '35+ мин',
    talents: 'Таланты', skillsNote: 'частый порядок сильных игроков', week: 'Неделя с', ranks: { ...META_BRACKET_NAMES },
    settings: 'Настройки', accent: 'Акцент', place: 'Вкладка', placeHint: 'Нажми на экран выше, где ей быть, — или перетащи саму вкладку мышью.',
    left: 'Слева', right: 'Справа', language: 'Язык', reset: 'Как в файле с сайта', saved: 'Сохраняется на этом компьютере'
  },
  en: {
    tab: 'META', tabTip: 'Hero meta — top heroes and builds. The tab can be dragged', title: 'Meta', roles: ['Carry', 'Mid', 'Offlane', 'Soft sup.', 'Hard sup.'], positions: ['Carry', 'Mid', 'Offlane', 'Soft support', 'Hard support'],
    error: 'No connection to GridStudio', retry: 'Retry', empty: 'No data', hero: 'Hero', pick: 'Pick rate', wins: 'Win rate',
    back: 'Back', stratz: 'Open on STRATZ', items: 'Items', skills: 'Skills',
    start: 'Starting', boots: 'Boots', early: 'Early', mid: 'Mid game', late: 'Late', earlyNote: '0–15 min', midNote: '15–35 min', lateNote: '35+ min',
    talents: 'Talents', skillsNote: 'most common order of strong players', week: 'Week of',
    ranks: { herald_guardian: 'Herald–Guardian', crusader_archon: 'Crusader–Archon', legend_ancient: 'Legend–Ancient', divine_immortal: 'Divine–Immortal', all: 'All ranks' },
    settings: 'Settings', accent: 'Accent', place: 'Tab', placeHint: 'Click the screen above where it should be — or drag the tab itself.',
    left: 'Left', right: 'Right', language: 'Language', reset: 'As in the file from the site', saved: 'Kept on this computer'
  }
};
// Where the tab may sit (px from the top of the page, `top` 0…100 % of min…max: the «Герои» page starts under the
// menu's bar, the pick screen at the top of the screen, its hero grid from 112 px) and the window (wMin…wMax, `lead`
// above the tab). Both pages are 1080 high in Panorama's units, whatever the screen.
const PLACES = { heroes: { min: 40, max: 820, wMin: 16, wMax: 200, lead: 56 }, pick: { min: 140, max: 860, wMin: 112, wMax: 320, lead: 70 } };
export const META_LOGO = 'panorama/images/gridstudio/stratz.vsvg_c';

const asciiJSON = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

// The look (11-02, «менее слопный дизайн и при этом красивый с анимациями»): Dota's own parts — its title font
// (Reaver) and numbers (RadianceM), the party finder's role icons, the hero's living portrait (DOTAHeroMovie), ability
// and item pictures with the game's tooltips — on a dark glass with one accent; motion by transitions only (inline
// styles cannot hold keyframes): the window slides in, rows and items come in one after another, the bars grow, the
// role marker and the tabs' underline slide, the skill grid fills point by point. Marks (chevrons, the cross, the
// talent's diamond, the gear's sliders) are panels: Dota's font may lack the signs.
// 11-03: the order by a click on «Пикрейт» or «Винрейт» (the columns, the items' too); the items by the game's phases
// as STRATZ shows them; the accent, the tab's side and height and the language changed in the widget («Настройки», or
// the tab dragged) and kept as GridStudio's cookie in Steam's browser (/w/prefs), unless the file from the site changed.
const RUNTIME = String.raw`(function ()
{
	var ctx = $.GetContextPanel();
	if ( !ctx || ctx.FindChildTraverse( 'GSMetaTab' ) ) return;
	// A file made without the site (d2pfx's): the game's own language.
	if ( C.lang === 'auto' ) { var game = ''; try { game = $.Language(); } catch ( e ) {} C.lang = /^(russian|ukrainian|belarusian)/.test( game ) ? 'ru' : 'en'; }
	var shared = {};
	try { var all = GameUI.CustomUIConfig(); shared = all.gridstudioMeta || ( all.gridstudioMeta = {} ); } catch ( e ) {}
	shared.builds = shared.builds || {};
	if ( shared.position === undefined ) shared.position = 0;
	var WHITE = '#eef2f6', INK = '#c3ccd6', MUTED = '#7c8796', DIM = '#4d5662', UP = '#86d98f';
	var TITLE = 'Reaver, Radiance', NUM = 'RadianceM, Radiance';
	var ROLE = [ 'safelaneicon', 'midlaneicon', 'offlaneicon', 'softsupporticon', 'hardsupporticon' ];
	var LEVELS = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 25 ];
	var HOUR = 3600000, range = C.place;
	// The settings in force: the file's, then the user's own from the cookie (while the file is the same).
	var P = { accent: C.accent, side: C.side, top: C.top, lang: C.lang, sort: 'wins' };
	function adopt( prefs ) { if ( prefs && prefs.sig === C.sig ) { P.accent = prefs.accent; P.side = prefs.side; P.top = prefs.top; P.lang = prefs.lang; P.sort = prefs.sort; } }
	adopt( shared.prefs );
	if ( shared.lang && C.texts[ shared.lang ] ) P.lang = shared.lang;
	if ( shared.sort ) P.sort = shared.sort;
	function T() { return C.texts[ P.lang ]; }
	var ACCENT, ACCENT_DEEP, ON_ACCENT, RIGHT, DIR;
	function rgb( c ) { var n = parseInt( c.slice( 1 ), 16 ); return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ]; }
	function shade( c, k ) { return '#' + rgb( c ).map( function ( x ) { var s = Math.round( x * k ).toString( 16 ); return s.length < 2 ? '0' + s : s; } ).join( '' ); }
	function paint()
	{
		ACCENT = P.accent; ACCENT_DEEP = shade( ACCENT, 0.66 ); RIGHT = P.side === 'right'; DIR = RIGHT ? 1 : -1;
		var v = rgb( ACCENT );
		ON_ACCENT = 0.299 * v[ 0 ] + 0.587 * v[ 1 ] + 0.114 * v[ 2 ] > 150 ? '#15120a' : '#ffffff';
	}
	paint();
	function tabTop() { return Math.round( range.min + ( range.max - range.min ) * P.top / 100 ); }

	function css( panel, s ) { for ( var k in s ) panel.style[ k ] = s[ k ]; return panel; }
	function merge( a, b ) { for ( var k in b ) a[ k ] = b[ k ]; return a; }
	function make( type, parent, s, props ) { return css( $.CreatePanel( type, parent, '', props || {} ), s || {} ); }
	function text( parent, value, s ) { var label = make( 'Label', parent, s ); label.text = value; return label; }
	function hover( panel, on, off ) { panel.SetPanelEvent( 'onmouseover', on ); panel.SetPanelEvent( 'onmouseout', off ); }
	function clean( value ) { return String( value || '' ).replace( /[^a-z0-9_]/g, '' ); }
	function heroTitle( name ) { var title = $.Localize( '#npc_dota_hero_' + name ); return title && title.charAt( 0 ) !== '#' ? title : name; }
	function later( seconds, fn ) { $.Schedule( seconds, function () { try { fn(); } catch ( e ) { $.Msg( 'GridStudio meta: ' + e ); } } ); }
	function open( url ) { $.DispatchEvent( 'ExternalBrowserGoToURL', url ); }
	function xy( v ) { return v && v.x !== undefined ? v : { x: v ? v[ 0 ] : 0, y: v ? v[ 1 ] : 0 }; }
	function motion( panel, props, duration, delay )
	{
		return css( panel, { transitionProperty: props, transitionDuration: ( duration || 0.2 ) + 's', transitionTimingFunction: 'ease-out', transitionDelay: ( delay || 0 ) + 's' } );
	}
	// A panel comes in: from 'from' (opacity 0) to 'to', after 'delay'.
	function appear( panel, delay, from, to )
	{
		css( panel, { opacity: '0', transform: from || 'translateX( ' + ( DIR * 12 ) + 'px )' } );
		motion( panel, 'opacity, transform', 0.26, delay || 0 );
		later( 0.03, function () { if ( panel.IsValid() ) css( panel, { opacity: '1', transform: to || 'translateX( 0px )' } ); } );
		return panel;
	}
	function role( parent, position, size, color )
	{
		return make( 'Image', parent, { width: size + 'px', height: size + 'px', washColor: color }, { src: 's2r://panorama/images/rank_tier_icons/handicap/' + ROLE[ position ] + '_psd.vtex', scaling: 'stretch-to-fit-preserve-aspect' } );
	}
	function caption( parent, value, s )
	{
		return text( parent, value, merge( { fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 'bold', color: MUTED }, s || {} ) );
	}
	// Small marks drawn with panels: a chevron pointing right (45), left (-135) or down (135); a cross; a gear's sliders.
	function chevron( parent, color, angle, s )
	{
		var box = make( 'Panel', parent, merge( { width: '14px', height: '14px' }, s || {} ) );
		// The strokes' weight sits 2.5 px from the box's middle the way the corner points (the top and right edges of a
		// 7 px square, turned): moved back by as much, the chevron stands in the middle of its box.
		var a = ( angle - 45 ) * Math.PI / 180, dx = -Math.round( Math.cos( a ) * 25 ) / 10 || 0, dy = -Math.round( Math.sin( a ) * 25 ) / 10 || 0;
		make( 'Panel', box, { width: '7px', height: '7px', horizontalAlign: 'center', verticalAlign: 'center', borderTop: '2px solid ' + color, borderRight: '2px solid ' + color,
			transform: 'translateX( ' + dx + 'px ) translateY( ' + dy + 'px ) rotateZ( ' + angle + 'deg )' } );
		return box;
	}
	function cross( parent, color, size )
	{
		var box = make( 'Panel', parent, { width: size + 'px', height: size + 'px', horizontalAlign: 'center', verticalAlign: 'center' } );
		[ 45, -45 ].forEach( function ( angle ) { make( 'Panel', box, { width: '100%', height: '2px', verticalAlign: 'center', borderRadius: '1px', backgroundColor: color, transform: 'rotateZ( ' + angle + 'deg )' } ); } );
		return box;
	}
	function sliders( parent, color )
	{
		var box = make( 'Panel', parent, { width: '14px', height: '12px', horizontalAlign: 'center', verticalAlign: 'center', flowChildren: 'down' } );
		[ 9, 3, 7 ].forEach( function ( at, i )
		{
			var line = make( 'Panel', box, { width: '100%', height: '2px', marginTop: i ? '3px' : '0px', borderRadius: '1px', backgroundColor: color + '99' } );
			make( 'Panel', line, { width: '4px', height: '4px', marginTop: '-1px', marginLeft: at + 'px', borderRadius: '2px', backgroundColor: color } );
		} );
		return box;
	}
	// A small pill button; 'on' lights it with the accent.
	function pill( parent, value, on, act, s )
	{
		var b = motion( make( 'Button', parent, merge( { height: '24px', padding: '0px 10px', borderRadius: '12px', backgroundColor: on ? ACCENT + '26' : '#ffffff0a',
			border: '1px solid ' + ( on ? ACCENT + '99' : '#ffffff12' ) }, s || {} ) ), 'background-color', 0.15 );
		text( b, value, { verticalAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: on ? WHITE : MUTED } );
		if ( !on ) hover( b, function () { b.style.backgroundColor = '#ffffff16'; }, function () { b.style.backgroundColor = '#ffffff0a'; } );
		b.SetPanelEvent( 'onactivate', act );
		return b;
	}
	function link( parent, value, url, s )
	{
		var b = make( 'Button', parent, merge( { verticalAlign: 'center' }, s || {} ) );
		var label = motion( text( b, value, { fontSize: '11px', color: DIM } ), 'color', 0.15 );
		hover( b, function () { label.style.color = INK; }, function () { label.style.color = DIM; } );
		b.SetPanelEvent( 'onactivate', function () { open( url ); } );
		return b;
	}
	// A sortable column head: the active one in the accent with its arrow; a click orders by it.
	function sortHead( parent, value, key, width, after )
	{
		var on = P.sort === key;
		var b = make( 'Button', parent, { width: width + 'px', height: '100%', flowChildren: 'right' } );
		make( 'Panel', b, { width: 'fill-parent-flow( 1 )' } );
		var label = motion( caption( b, value, { color: on ? ACCENT : MUTED } ), 'color', 0.15 );
		chevron( b, on ? ACCENT : '#00000000', 135, { width: '12px', height: '12px', marginLeft: '2px', marginTop: '-1px' } );
		if ( !on ) hover( b, function () { label.style.color = INK; }, function () { label.style.color = MUTED; } );
		b.SetPanelEvent( 'onactivate', function () { if ( P.sort !== key ) { P.sort = shared.sort = key; save(); after(); } } );
		return b;
	}

	// --- The data: a collapsed web panel asks GridStudio, the answer comes back in the address it lands on.
	var net = null, queue = [], current = null, round = 0;
	function param( url, name )
	{
		var m = new RegExp( '[?&]' + name + '=([^&#]*)' ).exec( url || '' );
		if ( !m ) return null;
		try { return decodeURIComponent( m[ 1 ].replace( /\+/g, ' ' ) ); } catch ( e ) { return null; }
	}
	function netPanel()
	{
		if ( net && net.IsValid() ) return net;
		net = css( $.CreatePanel( 'HTML', ctx, 'GSMetaNet' ), { width: '8px', height: '8px', visibility: 'collapse' } );
		$.RegisterEventHandler( 'HTMLURLChanged', net, function ()
		{
			for ( var i = 0; i < arguments.length; i++ )
			{
				var url = arguments[ i ];
				if ( typeof url === 'string' && url.indexOf( C.api + '/w/ok?' ) === 0 && current && param( url, 'k' ) === current.kind && param( url, 't' ) === String( current.round ) )
					return finish( param( url, 'd' ), param( url, 'e' ) );
			}
		} );
		return net;
	}
	function ask( kind, query, done ) { queue.push( { kind: kind, query: query, done: done } ); next(); }
	function next()
	{
		if ( current || !queue.length ) return;
		current = queue.shift();
		current.round = ++round;
		var mine = current.round;
		netPanel().SetURL( C.api + '/w/' + current.kind + '?' + current.query + ( current.query ? '&' : '' ) + 't=' + mine );
		later( 20, function () { if ( current && current.round === mine ) finish( null, 'timeout' ); } );
	}
	function finish( data, error )
	{
		var job = current;
		current = null;
		try { job.done( error || data === null ? null : data ); } catch ( e ) { $.Msg( 'GridStudio meta: ' + e ); }
		next();
	}
	// The user's own settings: read once a game, written on every change ('' = the file's again).
	function readPrefs( data )
	{
		var f = String( data || '' ).split( '.' );
		if ( f.length < 6 ) return null;
		return { accent: '#' + f[ 0 ], side: f[ 1 ], top: parseInt( f[ 2 ], 10 ), lang: f[ 3 ], sort: f[ 4 ], sig: f[ 5 ] };
	}
	function save()
	{
		var value = [ P.accent.slice( 1 ), P.side, P.top, P.lang, P.sort, C.sig ].join( '.' );
		shared.prefs = readPrefs( value );
		ask( 'prefs', 'set=' + value, function () {} );
	}
	function forget()
	{
		shared.prefs = null; shared.lang = null; shared.sort = null;
		P.accent = C.accent; P.side = C.side; P.top = C.top; P.lang = C.lang; P.sort = 'wins';
		ask( 'prefs', 'set=', function () {} );
		paint(); drawTab(); frame();
	}
	function loadMeta( done )
	{
		var kept = shared.meta;
		if ( kept && kept.bracket === C.bracket && kept.size === C.list && Date.now() - kept.at < HOUR ) return done( kept.value );
		ask( 'meta', 'b=' + C.bracket + '&n=' + C.list, function ( data )
		{
			if ( data === null ) return done( null );
			var parts = data.split( '|' ), value = { week: parts[ 0 ], positions: [] };
			for ( var p = 1; p <= 5; p++ )
				value.positions.push( ( parts[ p ] || '' ).split( ',' ).filter( Boolean ).map( function ( one )
				{
					var f = one.split( ':' );
					return { id: parseInt( f[ 0 ], 10 ) || 0, name: clean( f[ 1 ] ), wins: parseFloat( f[ 2 ] ) || 0, pick: ( parseFloat( f[ 3 ] ) || 0 ) * 2 };
				} ).filter( function ( hero ) { return hero.id && hero.name; } ) );
			shared.meta = { bracket: C.bracket, size: C.list, at: Date.now(), value: value };
			done( value );
		} );
	}
	function loadBuild( hero, position, done )
	{
		var key = hero.id + ':' + position + ':' + C.bracket + ':' + P.lang + ':2', kept = shared.builds[ key ];
		if ( kept && Date.now() - kept.at < HOUR ) return done( kept.value );
		ask( 'build', 'v=2&b=' + C.bracket + '&h=' + hero.id + '&p=' + position + '&l=' + P.lang, function ( data )
		{
			if ( data === null ) return done( null );
			var g = data.split( '|' ), value = {};
			[ 'start', 'boots', 'early', 'mid', 'late' ].forEach( function ( name, i )
			{
				value[ name ] = ( g[ i ] || '' ).split( ',' ).filter( Boolean ).map( function ( one )
				{
					var f = one.split( '@' );
					return { name: clean( f[ 0 ] ), pick: parseFloat( f[ 1 ] ) || 0, wins: parseFloat( f[ 2 ] ) || 0 };
				} ).filter( function ( item ) { return item.name; } );
			} );
			value.abilities = ( g[ 5 ] || '' ).split( ',' ).map( clean ).filter( Boolean );
			value.skills = ( g[ 6 ] || '' ).split( ',' ).filter( Boolean ).map( function ( one ) { return one === 't' ? 't' : parseInt( one, 10 ) || 0; } );
			value.talents = ( g[ 7 ] || '' ).split( ',' ).filter( Boolean ).map( function ( one )
			{
				var f = one.split( '~' ), read = function ( s ) { try { return decodeURIComponent( s || '' ); } catch ( e ) { return ''; } };
				return { side: f[ 0 ] === '1' ? 1 : f[ 0 ] === '0' ? 0 : -1, left: read( f[ 1 ] ), right: read( f[ 2 ] ) };
			} );
			shared.builds[ key ] = { at: Date.now(), value: value };
			done( value );
		} );
	}

	// --- The tab at the edge: three bars that rise on hover, the word, a chevron; dragged, it moves along the edge
	// and to the other side past the middle of the screen.
	var tab = null, barPanels = [], arrowOut = null, tabWord = null, REST = [ 9, 16, 12 ], LIFT = [ 16, 10, 18 ];
	var hovering = false, drag = null, dragged = false, watching = false, wasDown = false;
	function drawTab()
	{
		if ( tab && tab.IsValid() ) tab.DeleteAsync( 0 );
		tab = css( $.CreatePanel( 'Button', ctx, 'GSMetaTab' ), { width: '56px', height: '92px', verticalAlign: 'top', marginTop: tabTop() + 'px', flowChildren: 'down',
			boxShadow: '0px 6px 18px #000000a0', opacity: opened ? '0' : '1' } );
		sideTab();
		motion( tab, 'transform, opacity, box-shadow', 0.18 );
		var bars = make( 'Panel', tab, { horizontalAlign: 'center', marginTop: '14px', height: '20px', flowChildren: 'right' } );
		barPanels = REST.map( function ( h, i )
		{
			return motion( make( 'Panel', bars, { width: '5px', height: h + 'px', marginLeft: i ? '3px' : '0px', verticalAlign: 'bottom', borderRadius: '2px',
				backgroundColor: 'gradient( linear, 0% 0%, 0% 100%, from( ' + ACCENT + ' ), to( ' + ACCENT_DEEP + ' ) )' } ), 'height', 0.2, i * 0.04 );
		} );
		tabWord = text( tab, T().tab, { width: '100%', textAlign: 'center', marginTop: '9px', paddingLeft: '1px', fontFamily: TITLE, fontSize: '12px', letterSpacing: '1px', color: WHITE } );
		arrowOut = motion( chevron( tab, ACCENT, RIGHT ? -135 : 45, { horizontalAlign: 'center', marginTop: '6px' } ), 'transform', 0.18 );
		hover( tab, function ()
		{
			hovering = true;
			if ( !drag ) lift( true );
			$.DispatchEvent( 'UIShowTextTooltip', tab, T().tabTip );
			watch();
		}, function ()
		{
			hovering = false;
			if ( !drag ) lift( false );
			$.DispatchEvent( 'UIHideTextTooltip', tab );
		} );
		tab.SetPanelEvent( 'onactivate', function ()
		{
			$.DispatchEvent( 'UIHideTextTooltip', tab );
			if ( dragged ) { dragged = false; return; }
			if ( !opened ) toggle( true );
		} );
	}
	// The side's look: the edge it leans on, its corners, the light along it.
	function sideTab()
	{
		css( tab, { horizontalAlign: RIGHT ? 'right' : 'left', borderRadius: RIGHT ? '10px 0px 0px 10px' : '0px 10px 10px 0px',
			backgroundColor: 'gradient( linear, ' + ( RIGHT ? '100% 0%, 0% 0%' : '0% 0%, 100% 0%' ) + ', from( #0e1217f4 ), to( #1a2029f4 ) )',
			borderLeft: RIGHT ? '0px solid #00000000' : '3px solid ' + ACCENT, borderRight: RIGHT ? '3px solid ' + ACCENT : '0px solid #00000000' } );
	}
	function lift( up )
	{
		css( tab, { transform: 'translateX( ' + ( up ? -DIR * 4 : 0 ) + 'px )', boxShadow: up ? '0px 6px 22px ' + ACCENT + '40' : '0px 6px 18px #000000a0' } );
		( up ? LIFT : REST ).forEach( function ( h, i ) { barPanels[ i ].style.height = h + 'px'; } );
		arrowOut.style.transform = 'translateX( ' + ( up ? -DIR * 3 : 0 ) + 'px )';
	}
	// The mouse, while it is over the tab or drags it (Panorama has no drag of its own for this; the game's cursor).
	function watch()
	{
		if ( watching ) return;
		watching = true;
		var step = function ()
		{
			if ( !tab || !tab.IsValid() ) { watching = false; return; }
			var down = false, c = { x: 0, y: 0 };
			try { down = GameUI.IsMouseDown( 0 ); c = xy( GameUI.GetCursorPosition() ); } catch ( e ) { watching = false; return; }
			var scale = ctx.actualuiscale_y || 1, at = xy( ctx.GetPositionWithinWindow() );
			if ( down && !wasDown && !drag && hovering ) drag = { y: c.y, x: c.x, top: tabTop(), moved: false };
			wasDown = down;
			if ( drag && down )
			{
				var dy = ( c.y - drag.y ) / scale;
				if ( !drag.moved && Math.abs( dy ) + Math.abs( c.x - drag.x ) / scale > 6 ) { drag.moved = true; $.DispatchEvent( 'UIHideTextTooltip', tab ); }
				if ( drag.moved )
				{
					var y = Math.max( range.min, Math.min( range.max, drag.top + dy ) );
					P.top = Math.round( ( y - range.min ) / ( range.max - range.min ) * 100 );
					tab.style.marginTop = Math.round( y ) + 'px';
					var right = c.x > at.x + ctx.actuallayoutwidth / 2;
					if ( right !== RIGHT ) { P.side = right ? 'right' : 'left'; paint(); drawTab(); hovering = true; }
				}
			}
			if ( drag && !down )
			{
				if ( drag.moved ) { dragged = true; save(); later( 0.3, function () { dragged = false; } ); lift( hovering ); }
				drag = null;
			}
			if ( hovering || drag ) $.Schedule( 1 / 60, step ); else { watching = false; wasDown = false; }
		};
		step();
	}

	// --- The window: a light along its top, the head, the stage (the list, a build or the settings), the foot.
	var win = make( 'Panel', ctx, { width: '480px', height: '736px', verticalAlign: 'top', flowChildren: 'down', border: '1px solid #ffffff14', borderRadius: '12px',
		backgroundColor: 'gradient( linear, 0% 0%, 0% 100%, from( #181d25f8 ), to( #0a0d11fa ) )', boxShadow: '0px 22px 56px #000000c8' } );
	win.visible = false;
	motion( win, 'opacity, transform', 0.22 );
	var shown = { view: 'list' }, sub = null, listView = null, buildView = null, setView = null, opened = false;
	function placeWindow()
	{
		css( win, { horizontalAlign: RIGHT ? 'right' : 'left', marginTop: Math.max( range.wMin, Math.min( range.wMax, tabTop() - range.lead ) ) + 'px',
			marginLeft: RIGHT ? '0px' : '14px', marginRight: RIGHT ? '14px' : '0px' } );
	}
	function frame()
	{
		placeWindow();
		win.RemoveAndDeleteChildren();
		if ( tabWord && tabWord.IsValid() ) tabWord.text = T().tab;
		make( 'Panel', win, { width: '100%', height: '2px', backgroundColor: 'gradient( linear, 0% 0%, 100% 0%, from( ' + ACCENT + '00 ), color-stop( 0.3, ' + ACCENT + 'cc ), color-stop( 0.7, ' + ACCENT + 'cc ), to( ' + ACCENT + '00 ) )' } );
		var head = make( 'Panel', win, { width: '100%', height: '64px', padding: '14px 14px 0px 20px', flowChildren: 'right' } );
		var titles = make( 'Panel', head, { width: 'fill-parent-flow( 1 )', flowChildren: 'down' } );
		text( titles, shown.view === 'settings' ? T().settings : T().title, { fontFamily: TITLE, fontSize: '24px', letterSpacing: '4px', color: WHITE, textTransform: 'uppercase' } );
		sub = text( titles, T().ranks[ C.bracket ] || '', { fontSize: '12px', color: MUTED } );
		// The language, here as well as in the settings.
		var langs = make( 'Panel', head, { flowChildren: 'right', marginTop: '4px', marginRight: '8px' } );
		[ 'ru', 'en' ].forEach( function ( lang, i ) { pill( langs, lang.toUpperCase(), P.lang === lang, function () { setLang( lang ); }, { marginLeft: i ? '4px' : '0px' } ); } );
		var circle = function ( act, draw, on )
		{
			var b = make( 'Button', head, { width: '32px', height: '32px', marginLeft: '6px', borderRadius: '16px', backgroundColor: on ? ACCENT + '26' : '#ffffff0a', border: '1px solid ' + ( on ? ACCENT + '99' : '#00000000' ) } );
			motion( b, 'background-color', 0.15 );
			var mark = motion( draw( b ), 'transform', 0.2 );
			hover( b, function () { b.style.backgroundColor = on ? ACCENT + '3a' : '#ffffff1c'; mark.style.transform = 'rotateZ( 90deg )'; },
				function () { b.style.backgroundColor = on ? ACCENT + '26' : '#ffffff0a'; mark.style.transform = 'rotateZ( 0deg )'; } );
			b.SetPanelEvent( 'onactivate', act );
		};
		circle( function () { if ( shown.view === 'settings' ) { shown = shown.back || { view: 'list' }; frame(); } else { shown = { view: 'settings', back: shown }; frame(); } },
			function ( b ) { return sliders( b, shown.view === 'settings' ? ACCENT : INK ); }, shown.view === 'settings' );
		circle( function () { toggle( false ); }, function ( b ) { return cross( b, INK, 12 ); }, false );
		var stage = make( 'Panel', win, { width: '100%', height: 'fill-parent-flow( 1 )' } );
		listView = make( 'Panel', stage, { width: '100%', height: '100%', flowChildren: 'down' } );
		buildView = make( 'Panel', stage, { width: '100%', height: '100%', flowChildren: 'down' } );
		setView = make( 'Panel', stage, { width: '100%', height: '100%', flowChildren: 'down', padding: '6px 20px' } );
		[ listView, buildView ].forEach( function ( one ) { motion( one, 'opacity, transform', 0.24 ); } );
		// The source by STRATZ's rule ("Powered by STRATZ", a link), and ours.
		var foot = make( 'Panel', win, { width: '100%', height: '34px', padding: '0px 20px', flowChildren: 'right', borderTop: '1px solid #ffffff0d' } );
		link( foot, 'Powered by STRATZ', 'https://stratz.com' );
		make( 'Panel', foot, { width: 'fill-parent-flow( 1 )' } );
		link( foot, 'by gridstudio.me', 'https://gridstudio.me' );
		listView.visible = shown.view === 'list'; buildView.visible = shown.view === 'build'; setView.visible = shown.view === 'settings';
		if ( shown.view === 'settings' ) showSettings();
		else if ( shown.view === 'build' ) showBuild( shown.hero, shown.position, true );
		else { listFrame(); showList(); }
	}
	function setLang( lang ) { if ( P.lang === lang ) return; P.lang = shared.lang = lang; save(); frame(); }
	// Two views on the stage, slid in and out.
	function view( one )
	{
		var other = one === listView ? buildView : listView, back = one === listView;
		css( other, { opacity: '0', transform: 'translateX( ' + ( back ? 40 : -40 ) + 'px )' } );
		later( 0.24, function () { if ( other.IsValid() && ( shown.view === 'list' ) !== ( other === listView ) ) other.visible = false; } );
		one.visible = true;
		css( one, { opacity: '0', transform: 'translateX( ' + ( back ? -40 : 40 ) + 'px )' } );
		later( 0.03, function () { if ( one.IsValid() ) css( one, { opacity: '1', transform: 'translateX( 0px )' } ); } );
	}

	// --- The list: the five roles, the columns (a click orders), the heroes.
	var marker = null, roleButtons = [], columns = null, rows = null;
	function listFrame()
	{
		listView.RemoveAndDeleteChildren();
		var roles = make( 'Panel', listView, { width: '100%', height: '66px', padding: '0px 10px' } );
		var roleRow = make( 'Panel', roles, { width: '100%', height: '100%', flowChildren: 'right' } );
		marker = motion( make( 'Panel', roles, { width: '46px', height: '3px', verticalAlign: 'bottom', borderRadius: '2px', backgroundColor: ACCENT,
			boxShadow: '0px 0px 10px ' + ACCENT + '99', transform: 'translateX( ' + ( 23 + shared.position * 92 ) + 'px )' } ), 'transform', 0.26 );
		roleButtons = T().roles.map( function ( name, i )
		{
			var b = make( 'Button', roleRow, { width: '92px', height: '100%', flowChildren: 'down' } );
			var icon = css( motion( role( b, i, 28, DIM ), 'wash-color, transform', 0.2 ), { horizontalAlign: 'center', marginTop: '6px' } );
			var label = motion( text( b, name, { horizontalAlign: 'center', marginTop: '5px', fontSize: '12px', color: MUTED } ), 'color', 0.2 );
			b.SetPanelEvent( 'onactivate', function () { if ( shared.position !== i ) { shared.position = i; showList(); } } );
			hover( b, function () { if ( shared.position !== i ) icon.style.washColor = INK; icon.style.transform = 'translateY( -2px )'; },
				function () { if ( shared.position !== i ) icon.style.washColor = DIM; icon.style.transform = 'translateY( 0px )'; } );
			return { icon: icon, label: label };
		} );
		columns = make( 'Panel', listView, { width: '100%', height: '34px', padding: '10px 30px 0px 20px', flowChildren: 'right', borderTop: '1px solid #ffffff0a' } );
		rows = make( 'Panel', listView, { width: '100%', height: 'fill-parent-flow( 1 )', flowChildren: 'down', padding: '2px 10px 6px 10px', overflow: 'squish scroll' } );
	}
	function markColumns()
	{
		columns.RemoveAndDeleteChildren();
		caption( columns, '#', { width: '28px' } );
		caption( columns, T().hero, { width: 'fill-parent-flow( 1 )' } );
		sortHead( columns, T().pick, 'pick', 78, showList );
		sortHead( columns, T().wins, 'wins', 80, showList );
	}
	function markRole()
	{
		marker.style.transform = 'translateX( ' + ( 23 + shared.position * 92 ) + 'px )';
		roleButtons.forEach( function ( one, i )
		{
			var on = i === shared.position;
			one.icon.style.washColor = on ? ACCENT : DIM;
			one.label.style.color = on ? WHITE : MUTED;
		} );
	}

	// Grey bars that breathe while the data comes.
	function skeleton( parent, count, height )
	{
		parent.RemoveAndDeleteChildren();
		var bones = [];
		for ( var i = 0; i < count; i++ )
			bones.push( motion( make( 'Panel', parent, { width: '100%', height: height + 'px', marginTop: '6px', borderRadius: '6px',
				backgroundColor: 'gradient( linear, 0% 0%, 100% 0%, from( #ffffff10 ), to( #ffffff04 ) )' } ), 'opacity', 0.7, i * 0.05 ) );
		var up = false;
		var breathe = function () { if ( !bones[ 0 ].IsValid() ) return; up = !up; bones.forEach( function ( b ) { b.style.opacity = up ? '1' : '0.35'; } ); later( 0.75, breathe ); };
		breathe();
	}
	function trouble( parent, retry, value )
	{
		parent.RemoveAndDeleteChildren();
		var box = appear( make( 'Panel', parent, { horizontalAlign: 'center', marginTop: '150px', flowChildren: 'down' } ), 0, 'translateY( 8px )', 'translateY( 0px )' );
		text( box, value || T().error, { horizontalAlign: 'center', fontSize: '16px', color: INK } );
		if ( retry ) pill( box, T().retry, true, retry, { horizontalAlign: 'center', marginTop: '14px', height: '30px', padding: '0px 18px', borderRadius: '15px' } );
	}
	function showList()
	{
		shown = { view: 'list' };
		markRole();
		markColumns();
		skeleton( rows, 10, 44 );
		loadMeta( function ( meta )
		{
			if ( !rows.IsValid() || shown.view !== 'list' ) return;
			if ( !meta ) return trouble( rows, showList );
			var w = /^(\d{4})-(\d\d)-(\d\d)$/.exec( meta.week || '' );
			sub.text = ( w ? T().week + ' ' + w[ 3 ] + '.' + w[ 2 ] + '  \u00b7  ' : '' ) + ( T().ranks[ C.bracket ] || '' );
			var key = P.sort, heroes = ( meta.positions[ shared.position ] || [] ).slice();
			heroes.sort( function ( a, b ) { return b[ key ] - a[ key ]; } );
			rows.RemoveAndDeleteChildren();
			if ( !heroes.length ) return trouble( rows, null, T().empty );
			var top = heroes.reduce( function ( m, h ) { return Math.max( m, h[ key ] ); }, 0 ), low = key === 'wins' ? Math.min( 44, top - 6 ) : 0;
			heroes.forEach( function ( hero, i ) { heroRow( hero, i, key, top, low ); } );
		} );
	}
	function heroRow( hero, i, key, top, low )
	{
		var wait = Math.min( i, 12 ) * 0.032;
		var row = appear( make( 'Button', rows, { width: '100%', height: '50px', marginTop: '2px', borderRadius: '8px', flowChildren: 'right', padding: '0px 10px 0px 0px' } ), wait );
		var edge = motion( make( 'Panel', row, { width: '3px', height: '0px', verticalAlign: 'center', borderRadius: '2px', backgroundColor: ACCENT } ), 'height', 0.18 );
		text( row, ( i < 9 ? '0' : '' ) + ( i + 1 ), { width: '25px', marginLeft: '7px', verticalAlign: 'center', fontFamily: NUM, fontSize: '13px', color: DIM } );
		var frameBox = make( 'Panel', row, { width: '74px', height: '42px', verticalAlign: 'center', borderRadius: '5px', border: '1px solid #ffffff14' } );
		var picture = motion( make( 'DOTAHeroImage', frameBox, { width: '100%', height: '100%' }, { heroname: hero.name, heroimagestyle: 'landscape', scaling: 'stretch-to-cover-preserve-aspect' } ), 'transform', 0.2 );
		var name = motion( text( row, heroTitle( hero.name ), { width: 'fill-parent-flow( 1 )', verticalAlign: 'center', marginLeft: '12px', fontSize: '16px', color: INK, textOverflow: 'ellipsis', whiteSpace: 'nowrap' } ), 'color', 0.15 );
		var cell = function ( value, active, good, width )
		{
			var box = make( 'Panel', row, { width: width + 'px', verticalAlign: 'center', flowChildren: 'down' } );
			text( box, value.toFixed( 1 ) + '%', { width: '100%', textAlign: 'right', fontFamily: NUM, fontSize: active ? '16px' : '13px', fontWeight: active ? 'bold' : 'normal', color: active ? ( good ? UP : WHITE ) : MUTED } );
			if ( !active ) return;
			var track = make( 'Panel', box, { width: '60px', height: '3px', horizontalAlign: 'right', marginTop: '4px', borderRadius: '2px', backgroundColor: '#ffffff12' } );
			var fill = motion( make( 'Panel', track, { width: '0px', height: '100%', borderRadius: '2px', backgroundColor: good ? UP : ACCENT } ), 'width', 0.6, 0.15 + wait );
			later( 0.05, function () { if ( fill.IsValid() ) fill.style.width = Math.round( 6 + 54 * Math.max( 0, Math.min( 1, ( hero[ key ] - low ) / Math.max( 0.1, top - low ) ) ) ) + 'px'; } );
		};
		cell( hero.pick, key === 'pick', false, 78 );
		cell( hero.wins, key === 'wins', hero.wins >= 50, 80 );
		motion( row, 'opacity, transform, background-color', 0.26, wait );
		hover( row, function ()
		{
			row.style.backgroundColor = 'gradient( linear, 0% 0%, 100% 0%, from( #ffffff12 ), to( #ffffff03 ) )';
			edge.style.height = '30px'; name.style.color = WHITE; picture.style.transform = 'scale3d( 1.08, 1.08, 1 )';
		}, function ()
		{
			row.style.backgroundColor = '#00000000';
			edge.style.height = '0px'; name.style.color = INK; picture.style.transform = 'scale3d( 1, 1, 1 )';
		} );
		row.SetPanelEvent( 'onactivate', function () { view( buildView ); showBuild( hero, shared.position + 1 ); } );
	}

	// --- A hero's build: his living portrait, then items or skills.
	var sheetTab = 'items';
	function showBuild( hero, position, again )
	{
		shown = { view: 'build', hero: hero, position: position };
		buildView.RemoveAndDeleteChildren();
		var banner = make( 'Panel', buildView, { width: '100%', height: '118px', padding: '0px 16px' } );
		var movieFrame = appear( make( 'Panel', banner, { width: '96px', height: '108px', verticalAlign: 'center', borderRadius: '8px', border: '1px solid #ffffff1c',
			boxShadow: '0px 6px 18px #00000090' } ), again ? 0 : 0.05, 'scale3d( 0.92, 0.92, 1 )', 'scale3d( 1, 1, 1 )' );
		make( 'DOTAHeroMovie', movieFrame, { width: '100%', height: '100%' }, { heroname: hero.name, autoplay: 'onload' } );
		var facts = appear( make( 'Panel', banner, { marginLeft: '114px', marginTop: '14px', flowChildren: 'down' } ), 0.1 );
		text( facts, heroTitle( hero.name ), { fontFamily: TITLE, fontSize: '22px', letterSpacing: '1px', color: WHITE } );
		var line = make( 'Panel', facts, { flowChildren: 'right', marginTop: '6px' } );
		role( line, position - 1, 18, ACCENT );
		text( line, T().positions[ position - 1 ], { marginLeft: '6px', verticalAlign: 'center', fontSize: '13px', color: INK } );
		text( line, hero.wins.toFixed( 1 ) + '%', { marginLeft: '14px', verticalAlign: 'center', fontFamily: NUM, fontSize: '13px', fontWeight: 'bold', color: hero.wins >= 50 ? UP : INK } );
		text( line, T().wins.toLowerCase(), { marginLeft: '4px', verticalAlign: 'center', fontSize: '12px', color: MUTED } );
		text( line, hero.pick.toFixed( 1 ) + '%', { marginLeft: '12px', verticalAlign: 'center', fontFamily: NUM, fontSize: '13px', color: INK } );
		text( line, T().pick.toLowerCase(), { marginLeft: '4px', verticalAlign: 'center', fontSize: '12px', color: MUTED } );
		// Back to the list, and the hero's page on STRATZ (its logo, the words, the arrow out).
		var actions = appear( make( 'Panel', banner, { marginLeft: '114px', marginTop: '78px', flowChildren: 'right' } ), 0.14 );
		var back = make( 'Button', actions, { height: '28px', padding: '0px 12px 0px 8px', borderRadius: '14px', backgroundColor: '#ffffff0c', flowChildren: 'right' } );
		motion( back, 'background-color', 0.15 );
		var arrow = motion( chevron( back, ACCENT, -135, { verticalAlign: 'center' } ), 'transform', 0.15 );
		text( back, T().back, { marginLeft: '4px', verticalAlign: 'center', fontSize: '12px', color: INK } );
		hover( back, function () { back.style.backgroundColor = '#ffffff1a'; arrow.style.transform = 'translateX( -3px )'; },
			function () { back.style.backgroundColor = '#ffffff0c'; arrow.style.transform = 'translateX( 0px )'; } );
		back.SetPanelEvent( 'onactivate', function () { view( listView ); listFrame(); showList(); } );
		var site = make( 'Button', actions, { height: '28px', marginLeft: '8px', padding: '0px 10px 0px 6px', borderRadius: '14px', backgroundColor: '#0bafd01a', border: '1px solid #0bafd055', flowChildren: 'right' } );
		motion( site, 'background-color', 0.15 );
		make( 'Image', site, { width: '18px', height: '18px', verticalAlign: 'center' }, { src: 's2r://' + C.logo, texturewidth: '48px', textureheight: '48px', scaling: 'stretch-to-fit-preserve-aspect' } );
		text( site, T().stratz, { marginLeft: '6px', verticalAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: WHITE } );
		var out = motion( chevron( site, '#0bafd0', 45, { verticalAlign: 'center', marginLeft: '2px' } ), 'transform', 0.15 );
		hover( site, function () { site.style.backgroundColor = '#0bafd033'; out.style.transform = 'translateX( 3px )'; },
			function () { site.style.backgroundColor = '#0bafd01a'; out.style.transform = 'translateX( 0px )'; } );
		site.SetPanelEvent( 'onactivate', function () { open( 'https://stratz.com/heroes/' + hero.id ); } );

		// Two tabs under a sliding line; on the items' one, the rate they show and are ordered by.
		var bar = make( 'Panel', buildView, { width: '100%', height: '40px', padding: '0px 16px 0px 16px', borderBottom: '1px solid #ffffff0d' } );
		var tabsRow = make( 'Panel', bar, { width: '100%', height: '100%', flowChildren: 'right' } );
		var underline = motion( make( 'Panel', bar, { width: '72px', height: '2px', verticalAlign: 'bottom', backgroundColor: ACCENT } ), 'transform, width', 0.24 );
		var sheet = make( 'Panel', buildView, { width: '100%', height: 'fill-parent-flow( 1 )', flowChildren: 'down', padding: '4px 20px 6px 20px', overflow: 'squish scroll' } );
		var labels = {};
		[ [ 'items', T().items ], [ 'skills', T().skills ] ].forEach( function ( pair )
		{
			var b = make( 'Button', tabsRow, { height: '100%', marginRight: '26px' } );
			labels[ pair[ 0 ] ] = motion( text( b, pair[ 1 ], { verticalAlign: 'center', fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px', color: MUTED } ), 'color', 0.15 );
			b.SetPanelEvent( 'onactivate', function () { if ( sheetTab !== pair[ 0 ] ) { sheetTab = pair[ 0 ]; fillSheet(); } } );
		} );
		make( 'Panel', tabsRow, { width: 'fill-parent-flow( 1 )' } );
		var rates = make( 'Panel', tabsRow, { height: '100%', flowChildren: 'right' } );
		var build = null;
		var width = function ( label ) { return Math.round( label.actuallayoutwidth / ( label.actualuiscale_x || 1 ) ) || 64; };
		var slide = function ()
		{
			if ( !underline.IsValid() ) return;
			labels.items.style.color = sheetTab === 'items' ? WHITE : MUTED;
			labels.skills.style.color = sheetTab === 'skills' ? WHITE : MUTED;
			css( underline, { transform: 'translateX( ' + ( sheetTab === 'items' ? 0 : width( labels.items ) + 26 ) + 'px )', width: width( labels[ sheetTab ] ) + 'px' } );
		};
		function fillSheet()
		{
			slide();
			rates.RemoveAndDeleteChildren();
			if ( sheetTab === 'items' ) { sortHead( rates, T().pick, 'pick', 86, fillSheet ); sortHead( rates, T().wins, 'wins', 86, fillSheet ); }
			if ( !build ) return skeleton( sheet, 6, 40 );
			sheet.RemoveAndDeleteChildren();
			if ( sheetTab === 'items' ) itemsSheet( sheet, build ); else skillsSheet( sheet, build );
		}
		fillSheet();
		later( 0.05, slide );
		loadBuild( hero, position, function ( value )
		{
			if ( !sheet.IsValid() ) return;
			if ( !value ) return trouble( sheet, function () { showBuild( hero, position ); } );
			build = value;
			fillSheet();
		} );
	}

	function section( parent, title, note, delay )
	{
		var head = appear( make( 'Panel', parent, { width: '100%', flowChildren: 'right', marginTop: '12px', marginBottom: '7px' } ), delay );
		caption( head, title, { color: ACCENT } );
		if ( note ) caption( head, note, { marginLeft: '10px', letterSpacing: '1px', color: DIM, fontWeight: 'normal', textTransform: 'none' } );
		return make( 'Panel', parent, { width: '100%', flowChildren: 'right-wrap' } );
	}
	// The items as STRATZ shows them: the start, the boots and the game's phases, each ordered by the rate chosen
	// (by win rate among the ones bought often enough), the rate under each.
	var ITEM_GROUPS = [ [ 'start', 6, 10 ], [ 'boots', 3, 5 ], [ 'early', 6, 5 ], [ 'mid', 6, 5 ], [ 'late', 6, 5 ] ];
	function itemsSheet( sheet, build )
	{
		var order = 0, key = P.sort;
		ITEM_GROUPS.forEach( function ( group, g )
		{
			var list = build[ group[ 0 ] ].filter( function ( item ) { return key === 'pick' || item.pick >= group[ 2 ]; } ).slice();
			list.sort( function ( a, b ) { return b[ key ] - a[ key ]; } );
			list = list.slice( 0, group[ 1 ] );
			if ( !list.length ) return;
			var row = section( sheet, T()[ group[ 0 ] ], T()[ group[ 0 ] + 'Note' ] || '', g * 0.05 );
			list.forEach( function ( item )
			{
				var cell = appear( make( 'Panel', row, { width: '62px', flowChildren: 'down', marginBottom: '4px' } ), 0.06 + Math.min( order++, 18 ) * 0.022, 'scale3d( 0.86, 0.86, 1 )', 'scale3d( 1, 1, 1 )' );
				var box = motion( make( 'Panel', cell, { width: '56px', height: '41px', borderRadius: '5px', border: '1px solid #ffffff1c', boxShadow: '0px 3px 8px #00000080' } ), 'transform, border', 0.15 );
				make( 'DOTAItemImage', box, { width: '100%', height: '100%' }, { itemname: 'item_' + item.name } );
				hover( box, function () { box.style.transform = 'translateY( -2px )'; box.style.border = '1px solid ' + ACCENT + 'aa'; $.DispatchEvent( 'DOTAShowAbilityTooltip', box, 'item_' + item.name ); },
					function () { box.style.transform = 'translateY( 0px )'; box.style.border = '1px solid #ffffff1c'; $.DispatchEvent( 'DOTAHideAbilityTooltip', box ); } );
				var good = key === 'wins' && item.wins >= 55;
				text( cell, item[ key ].toFixed( key === 'pick' && item.pick >= 10 ? 0 : 1 ) + '%', { width: '56px', textAlign: 'center', marginTop: '3px', fontFamily: NUM, fontSize: '12px', color: good ? UP : key === 'wins' ? INK : MUTED } );
			} );
		} );
	}
	function skillsSheet( sheet, build )
	{
		if ( !build.skills.length ) return trouble( sheet, null, T().empty );
		// The grid: the hero's abilities by rows, the points by columns (levels 1-16, 18, 20, 25), talents in the last row.
		var grid = section( sheet, T().skills, T().skillsNote, 0 );
		grid.style.flowChildren = 'down';
		var levels = make( 'Panel', grid, { flowChildren: 'right', marginLeft: '34px', marginBottom: '3px' } );
		build.skills.forEach( function ( _, i ) { text( levels, String( LEVELS[ i ] || '' ), { width: '21px', textAlign: 'center', fontFamily: NUM, fontSize: '10px', color: DIM } ); } );
		build.abilities.concat( [ 't' ] ).forEach( function ( ability, r )
		{
			var line = make( 'Panel', grid, { flowChildren: 'right', height: '25px', marginBottom: '2px' } );
			if ( ability === 't' )
			{
				var mark = make( 'Panel', line, { width: '24px', height: '24px', marginRight: '10px' } );
				make( 'Panel', mark, { width: '11px', height: '11px', horizontalAlign: 'center', verticalAlign: 'center', border: '2px solid ' + ACCENT, transform: 'rotateZ( 45deg )' } );
			}
			else
			{
				var icon = make( 'DOTAAbilityImage', line, { width: '24px', height: '24px', borderRadius: '4px', marginRight: '10px' }, { abilityname: ability } );
				hover( icon, function () { $.DispatchEvent( 'DOTAShowAbilityTooltip', icon, ability ); }, function () { $.DispatchEvent( 'DOTAHideAbilityTooltip', icon ); } );
			}
			build.skills.forEach( function ( point, i )
			{
				var on = ability === 't' ? point === 't' : point === r + 1, corner = ability === 't' ? '10px' : '4px';
				var cell = make( 'Panel', line, { width: '19px', height: '19px', marginRight: '2px', verticalAlign: 'center', borderRadius: corner, backgroundColor: '#ffffff08' } );
				if ( !on ) return;
				var fill = make( 'Panel', cell, { width: '100%', height: '100%', borderRadius: corner,
					backgroundColor: 'gradient( linear, 0% 0%, 0% 100%, from( ' + ACCENT + ' ), to( ' + ACCENT_DEEP + ' ) )' } );
				text( fill, String( LEVELS[ i ] || '' ), { horizontalAlign: 'center', verticalAlign: 'center', fontFamily: NUM, fontSize: '10px', fontWeight: 'bold', color: ON_ACCENT } );
				appear( fill, 0.05 + i * 0.03, 'scale3d( 0.4, 0.4, 1 )', 'scale3d( 1, 1, 1 )' );
			} );
		} );
		// The talents as Dota shows them: 25 at the top, the side most players take lit.
		if ( !build.talents.length ) return;
		var tree = section( sheet, T().talents, '', 0.2 );
		tree.style.flowChildren = 'down';
		[ 3, 2, 1, 0 ].forEach( function ( tier, k )
		{
			var pick = build.talents[ tier ];
			if ( !pick ) return;
			var line = appear( make( 'Panel', tree, { width: '100%', height: '42px', flowChildren: 'right', marginBottom: '4px' } ), 0.25 + k * 0.05 );
			var side = function ( value, chosen, right )
			{
				var box = make( 'Panel', line, { width: '178px', height: '100%', borderRadius: '6px', padding: '0px 8px',
					backgroundColor: chosen ? 'gradient( linear, ' + ( right ? '100% 0%, 0% 0%' : '0% 0%, 100% 0%' ) + ', from( ' + ACCENT + '2e ), to( ' + ACCENT + '08 ) )' : '#ffffff06',
					border: '1px solid ' + ( chosen ? ACCENT + '88' : '#ffffff0d' ) } );
				text( box, value || '-', { width: '100%', verticalAlign: 'center', textAlign: right ? 'left' : 'right', fontSize: '12px', color: chosen ? WHITE : MUTED } );
			};
			side( pick.left, pick.side === 0, false );
			var badge = make( 'Panel', line, { width: '36px', height: '36px', margin: '0px 7px', verticalAlign: 'center', borderRadius: '18px', border: '1px solid ' + ACCENT + '99',
				backgroundColor: 'gradient( radial, 50% 50%, 0% 0%, 18px 18px, from( #24262c ), to( #101114 ) )' } );
			text( badge, String( [ 10, 15, 20, 25 ][ tier ] ), { horizontalAlign: 'center', verticalAlign: 'center', fontFamily: TITLE, fontSize: '14px', color: ACCENT } );
			side( pick.right, pick.side === 1, true );
		} );
	}

	// --- The settings: the accent, where the tab is (a small screen to click on), the language, the file's own again.
	function showSettings()
	{
		setView.RemoveAndDeleteChildren();
		var redo = function () { paint(); drawTab(); save(); frame(); };
		var row = section( setView, T().accent, '', 0 );
		C.accents.forEach( function ( color, i )
		{
			var on = P.accent === color;
			var dot = appear( make( 'Button', row, { width: '34px', height: '34px', marginRight: '8px', marginBottom: '6px', borderRadius: '17px', border: '2px solid ' + ( on ? WHITE : '#00000000' ) } ), i * 0.03, 'scale3d( 0.6, 0.6, 1 )', 'scale3d( 1, 1, 1 )' );
			make( 'Panel', dot, { width: '24px', height: '24px', horizontalAlign: 'center', verticalAlign: 'center', borderRadius: '12px', backgroundColor: color } );
			dot.SetPanelEvent( 'onactivate', function () { if ( P.accent !== color ) { P.accent = color; redo(); } } );
		} );
		// The screen in small: a click puts the tab at that side and height.
		section( setView, T().place, '', 0.05 ).style.flowChildren = 'down';
		var screen = make( 'Button', setView, { width: '256px', height: '144px', borderRadius: '8px', border: '1px solid #ffffff1c', backgroundColor: 'gradient( linear, 0% 0%, 0% 100%, from( #1b212b ), to( #0f1318 ) )' } );
		var spot = make( 'Panel', screen, { width: '8px', height: '22px', verticalAlign: 'top', horizontalAlign: RIGHT ? 'right' : 'left',
			marginTop: Math.round( 8 + ( 144 - 16 - 22 ) * P.top / 100 ) + 'px', borderRadius: RIGHT ? '4px 0px 0px 4px' : '0px 4px 4px 0px', backgroundColor: ACCENT } );
		screen.SetPanelEvent( 'onactivate', function ()
		{
			try
			{
				var c = xy( GameUI.GetCursorPosition() ), at = xy( screen.GetPositionWithinWindow() );
				var x = ( c.x - at.x ) / screen.actuallayoutwidth, y = ( c.y - at.y ) / screen.actuallayoutheight;
				P.side = x > 0.5 ? 'right' : 'left';
				P.top = Math.max( 0, Math.min( 100, Math.round( ( y - 0.1 ) / 0.8 * 100 ) ) );
				redo();
			}
			catch ( e ) { $.Msg( 'GridStudio meta: ' + e ); }
		} );
		var sides = make( 'Panel', setView, { flowChildren: 'right', marginTop: '8px' } );
		pill( sides, T().left, !RIGHT, function () { if ( RIGHT ) { P.side = 'left'; redo(); } } );
		pill( sides, T().right, RIGHT, function () { if ( !RIGHT ) { P.side = 'right'; redo(); } }, { marginLeft: '6px' } );
		text( setView, T().placeHint, { width: '100%', marginTop: '8px', fontSize: '12px', color: MUTED } );
		var langs = section( setView, T().language, '', 0.1 );
		[ 'ru', 'en' ].forEach( function ( lang, i ) { pill( langs, C.languages[ lang ], P.lang === lang, function () { setLang( lang ); }, { marginLeft: i ? '6px' : '0px' } ); } );
		var end = make( 'Panel', setView, { width: '100%', flowChildren: 'right', marginTop: '22px' } );
		pill( end, T().reset, false, forget );
		text( end, T().saved, { marginLeft: '12px', verticalAlign: 'center', fontSize: '11px', color: DIM } );
	}

	// --- Open and close; nothing but the user's own settings is asked before the first opening.
	function toggle( on )
	{
		opened = on;
		if ( on )
		{
			if ( shown.view === 'settings' ) shown = shown.back || { view: 'list' };
			frame();
			win.visible = true;
			css( win, { opacity: '0', transform: 'translateX( ' + ( DIR * 24 ) + 'px )' } );
			later( 0.03, function () { css( win, { opacity: '1', transform: 'translateX( 0px )' } ); } );
			css( tab, { opacity: '0' } );
		}
		else
		{
			css( win, { opacity: '0', transform: 'translateX( ' + ( DIR * 24 ) + 'px )' } );
			later( 0.23, function () { if ( !opened ) win.visible = false; } );
			css( tab, { opacity: '1' } );
		}
	}
	drawTab();
	// The user's own settings, once a game (the pick screen takes them from the menu): until they come, the file's.
	if ( !shared.prefsAsked )
	{
		shared.prefsAsked = true;
		ask( 'prefs', '', function ( data )
		{
			var prefs = readPrefs( data );
			if ( !prefs || prefs.sig !== C.sig ) return;
			shared.prefs = prefs;
			adopt( prefs );
			paint(); drawTab();
			if ( opened ) frame();
		} );
	}

	// The pick screen goes on to the versus screen and the map's loading: the widget leaves with the pick.
	if ( C.where === 'pick' )
	{
		var away = [ 'StrategyVersusTransition', 'VersusVisible', 'VersusOutro', 'MapLoading', 'MapLoadingOutro' ];
		var leave = function ()
		{
			if ( !tab || !tab.IsValid() ) return;
			var gone = away.some( function ( name ) { return ctx.BHasClass( name ); } );
			tab.visible = !gone;
			if ( gone && opened ) toggle( false );
			later( 0.5, leave );
		};
		leave();
	}
})();
`;

// The widget's script for one place. origin: the site the web panel asks (https://gridstudio.me or dev); the rest
// as metaSettings. `sig`: the file's own look, so a cookie of an older file is not taken for this one's.
export function metaWidgetScript({ origin, where = 'heroes', ...options }) {
  if (!META_PLACES.includes(where)) throw new Error(`Неизвестное место меты: ${where}`);
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error('Адрес GridStudio для меты должен быть https://…');
  const s = metaSettings({ heroes: true, ...options });
  // lang 'auto' (the d2pfx file, scripts/make-d2pfx-meta.mjs): the game's language; the site's files name theirs.
  const config = { api: `${origin}/api/catalog`, where, place: PLACES[where], bracket: s.bracket, lang: options.lang === 'auto' ? 'auto' : s.lang, accent: s.accent, side: s.side, top: s.top, list: META_LIST,
    sig: metaSignature(s), accents: META_ACCENTS, logo: META_LOGO.replace(/_c$/, ''), languages: { ru: 'Русский', en: 'English' }, texts: TEXTS };
  return `// GridStudio: hero meta (scripts/meta-widget.mjs).\nvar C = ${asciiJSON(config)};\n${RUNTIME}`;
}
export const metaSignature = (s) => `${s.accent.slice(1)}${s.side[0]}${s.top}${s.lang}`;

// The pack's files of «Мета героев» (menu-background.mjs menuBackgroundPack): meta = metaSettings + { origin },
// `page` the «Герои» page as the pack has it (Valve's, or with the grid's background), `pregame` Valve's pick screen
// script (assets/dota-menu/dota_hud_pregame.js), `logo` STRATZ's logo (assets/dota-menu/icons/stratz.svg, the same
// picture as the profile's STRATZ button). → [{ path, text } for layouts and the logo, { path, data } for scripts].
const options = (meta) => ({ origin: metaOrigin(meta.origin), bracket: meta.bracket, lang: meta.lang, accent: meta.accent, side: meta.side, top: meta.top });
export function metaWidgetFiles(meta, { page, pregame, logo = null }) {
  const files = logo ? [{ path: META_LOGO, text: logo }] : [];
  if (meta.heroes) files.push({ path: 'panorama/layout/dashboard_page_heroes.vxml_c', text: heroesPageMeta(page) },
    { path: META_SCRIPT, data: newScript(META_SCRIPT, metaWidgetScript({ ...options(meta), where: 'heroes' })) });
  if (meta.pick) files.push({ path: PREGAME_SCRIPT, data: newScript(PREGAME_SCRIPT, pregameScript(pregame, options(meta))) });
  return files;
}
// A pack's meta script, when it is exactly what the site makes (the server's check, server/install-packs.mjs): its
// options, else null. `pregame`: Valve's pick screen script as the site has it.
const CONFIG_LINE = /^\/\/ GridStudio: hero meta \(scripts\/meta-widget\.mjs\)\.\nvar C = (\{[^\n]*\});\n/m;
export function metaScriptOptions(path, bytes, pregame) {
  try {
    const data = readResource(bytes).blocks.find(([name]) => name === 'DATA')?.[1];
    if (!data) return null;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data), config = JSON.parse(CONFIG_LINE.exec(text)?.[1] || 'null');
    const origin = String(config?.api || '').replace(/\/api\/catalog$/, '');
    if (!META_ORIGINS.includes(origin)) return null;
    const settings = metaSettings({ heroes: true, ...config });
    const made = { ...options({ ...settings, origin }) };
    const ours = path === META_SCRIPT ? config.where === 'heroes' && metaWidgetScript({ ...made, where: 'heroes' })
      : path === PREGAME_SCRIPT ? config.where === 'pick' && pregameScript(pregame, made) : null;
    if (ours !== text) return null;
    const again = newScript(path, text);
    return again.length === bytes.length && again.every((byte, i) => byte === bytes[i]) ? made : null;
  } catch { return null; }
}

// The «Герои» page with our script (after its styles; the page has no scripts of its own).
const HEROES_STYLES_END = /(\n[ \t]*)<\/styles>/;
export function heroesPageMeta(page) {
  if (!HEROES_STYLES_END.test(page) || page.includes('<scripts>')) throw new Error('В dashboard_page_heroes.xml не найдено место для скрипта меты.');
  return page.replace(HEROES_STYLES_END, (_, indent) => `${indent}</styles>\n\t<scripts>\n\t\t<include src="s2r://${META_SCRIPT.replace(/_c$/, '')}" />\n\t</scripts>`);
}
// The pick screen's script: Valve's (without its source map) and the widget after it, in its own scope.
export function pregameScript(valve, options) {
  if (!/function OnHeroGridBecameVisible\(/.test(valve)) throw new Error('В dota_hud_pregame.js нет функций экрана выбора героя.');
  return `${valve.replace(/\n\/\/# sourceMappingURL=.*$/m, '').trimEnd()}\n\n${metaWidgetScript({ ...options, where: 'pick' })}`;
}
