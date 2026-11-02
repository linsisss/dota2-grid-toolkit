// Widgets on Dota's main menu (2026-10-31, the owner: «конструктор главного меню … добавлять виджеты … виджеты
// можно СОЗДАВАТЬ прямо на гридстудио»; the constructor is the mockup's variant B). What a widget is, its
// defaults and the check of a saved list live here, for the page, the «.gsdota» document and the server alike;
// widgetsPanorama turns a list into the files of the menu pack (pak02).
//
// How it reaches Dota (in-game test 2026-10-31, scripts/make-widget-test.mjs, all passed):
// - the widgets are panels of our copy of Valve's home page (dashboard_page_home.xml, a Valve layout given back
//   with our lines, as the Stratz and Dotabuff buttons live in the profile): a replaced Valve layout may carry
//   handlers, so a shortcut is a Button with Valve's own `onactivate` call;
// - Dota's own data panels work there as they are: DOTAMiniShowcase accountid="local" (the mini-profile),
//   DOTAFrontpageLastMatch, DOTAFrontpageTopLive;
// - a script in the classic format, included by that page, runs ($.Schedule ticked a clock): it writes the
//   texts (our layouts and styles must stay ASCII, so any other letter goes through the script as \u escapes)
//   and the clocks and timers.
// The home page lies under Dota's top bar: its (0, 0) is the screen's (0, 57) at 1080 lines (the test's frame
// at y 170 showed at 227–228; Valve's play panel starts at margin-top 57px too). A widget is kept in screen
// pixels of a 1920 × 1080 screen and pinned to one of nine anchors, so on 16:10 and 21:9 it stays by its edge.
//
// No widget acts by itself: a shortcut only opens a page of Dota or a link when it is clicked, and nothing
// runs in a match (the home page is not there). Hero picks, console commands, changing a setting: never (d2pfx's
// «Hero Auto Pick» is a pick bot; docs/customize.md); opening the settings window, as Dota's own button does, is a page.
import HEROES from './hero-portraits-data.mjs';
import { newScript, readResource } from './panorama-laco.mjs';

export const WIDGET_SCREEN = Object.freeze({ width: 1920, height: 1080, top: 57 });
// «Мастерская виджетов»' limits (server/menu-widgets.mjs takes them, the page checks them before sending).
export const WIDGET_SHARE = Object.freeze({
  mediaBytes: { image: 4_000_000, video: 12_000_000 }, perWidgetBytes: 30_000_000, dailyWidgets: 10, dailyMedia: 60,
  accountBytes: 300_000_000, pending: 500, page: 24
});
export const WIDGET_LIMITS = Object.freeze({ count: 24, text: 160, title: 60, label: 40, minSide: 24, media: 8 });
export const WIDGET_ANCHORS = Object.freeze(['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']);
export const WIDGET_SCENES = Object.freeze(['menu']);
export const WIDGET_COLORS = Object.freeze(['#ffffff', '#e8c66a', '#c4b5ed', '#7ed07e', '#7cc4f2', '#f07878', '#000000']);

// Where a shortcut leads: Valve's own calls (from Valve's layouts and the menus d2pfx's «Main Menu 7.00
// Style» builds). `link` opens a web page in Steam's browser — https only, on these sites.
export const WIDGET_ACTIONS = Object.freeze({
  armory: { title: 'Арсенал', call: 'DOTAShowArmory();' },
  learn: { title: 'Обучение', call: 'DOTAShowPrimaryTabPage( TopBarLearn );' },
  watch: { title: 'Просмотр', call: 'DOTAShowPrimaryTabPage( TopBarWatch );' },
  mods: { title: 'Игротека', call: 'DOTAShowPrimaryTabPage( TopBarMods );' },
  // Valve's call opens the profile of the panel's own account (0): from our Button nothing opened (tests 7, 8b). Test 9
  // (2026-11-02): the script reading the account off an avatar with accountid="local" and calling with it opens it — so the
  // button has no call of its own, the script gives it one (WIDGET_RUNTIME `profile`, the avatar GSWAccount).
  profile: { title: 'Мой профиль', call: null },
  heroStats: { title: 'Статистика героев', call: 'DOTAShowProfileHeroStatsPage();' },
  play: { title: 'Играть', call: 'DOTAPlayButtonClicked();' },
  // 2026-11-02 (the owner: «расширяй блоки»): the calls of Valve's top bar, Plus menu, «Обучение» and guilds.
  heroes: { title: 'Герои', call: 'DOTAShowPrimaryTabPage( TopBarHeroes );' },
  settings: { title: 'Настройки', call: 'DOTAShowSettingsRebornPopup();' },
  plus: { title: 'Dota Plus', call: 'DOTAShowPlusHomePage();' },
  patches: { title: 'Обновления игры', call: 'DOTAShowPatchesPage();' },
  battleReport: { title: 'Боевой отчёт', call: 'DOTAShowBattleReportPage();' },
  guild: { title: 'Гильдия', call: 'DOTAShowDefaultGuildPage();' },
  link: { title: 'Ссылка', call: null }
});
export const WIDGET_LINK_SITES = Object.freeze(['twitch.tv', 'youtube.com', 'youtu.be', 'kick.com', 't.me', 'vk.com', 'discord.gg', 'discord.com',
  'steamcommunity.com', 'store.steampowered.com', 'stratz.com', 'dotabuff.com', 'opendota.com', 'gridstudio.me', 'liquipedia.net']);

// The types. `native`: one of Dota's own panels, drawn by the game; `size`: the default in screen pixels;
// `min`: the smallest it may be; `fixed`: Dota draws it at its own size (the frame only places it).
export const WIDGET_TYPES = Object.freeze({
  // `look` (2026-11-02, the owner: «несколько вариантов виджетов сразу, например часы сделать так же круглыми»): a clock in
  // figures or with hands on a dial; a timer in cells or in one line.
  clock: { title: 'Часы', icon: 'clock', size: [300, 132], min: [96, 48],
    props: { format: '24', seconds: false, date: true, color: '#ffffff', align: 'center', panel: false, look: 'digital' } },
  timer: { title: 'Таймер до даты', icon: 'timer', size: [330, 120], min: [160, 60],
    props: { title: 'До события', until: '', color: '#ffffff', panel: true, look: 'cells' } },
  text: { title: 'Текст', icon: 'font', size: [360, 60], min: [40, 24],
    props: { text: 'Текст', size: 28, color: '#ffffff', weight: 'bold', align: 'left', shadow: true, upper: false } },
  shortcut: { title: 'Кнопка-ярлык', icon: 'link', size: [240, 56], min: [100, 36],
    props: { label: 'Арсенал', action: 'armory', url: '', color: '#e8c66a', style: 'panel' } },
  image: { title: 'Картинка', icon: 'image', size: [360, 240], min: [32, 32], props: { media: '', fit: 'cover', radius: 0 } },
  video: { title: 'Видео / GIF', icon: 'film', size: [360, 240], min: [64, 36], props: { media: '', fit: 'cover', radius: 0 } },
  miniProfile: { title: 'Мини-профиль', icon: 'user', size: [340, 300], min: [340, 300], native: 'DOTAMiniShowcase', fixed: true, props: {} },
  // `look`: GridStudio's card (LASTMATCH_RULES, in Valve's frontpage_lastmatch.css) or Dota's own.
  lastMatch: { title: 'Последний матч', icon: 'trophy', size: [340, 300], min: [340, 300], native: 'DOTAFrontpageLastMatch', fixed: true, props: { look: 'gridstudio' } },
  topLive: { title: 'Лайв-матч', icon: 'eye', size: [340, 300], min: [340, 300], native: 'DOTAFrontpageTopLive', fixed: true, props: {} },
  // A widget of one's own (cleanDesign below): placed at its design's proportions.
  custom: { title: 'Свой виджет', icon: 'groupPlus', size: [330, 484], min: [32, 32], props: { designId: '', design: null } }
});
export const WIDGET_TYPE_IDS = Object.freeze(Object.keys(WIDGET_TYPES));

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value) => Math.round(Number(value) || 0);
const color = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : fallback);
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);
const line = (value, limit, fallback = '') => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : fallback);
// A link a shortcut may open: https, one of WIDGET_LINK_SITES (or a subdomain), no user name or port.
export function widgetLink(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!WIDGET_LINK_SITES.some((site) => host === site || host.endsWith(`.${site}`))) return '';
  const text = url.href;
  return /^[\x21-\x7e]+$/.test(text) && !/['"<>\\`]/.test(text) && text.length <= 300 ? text : '';
}

// A new widget of a type, centred at (x, y) in screen pixels (or in the middle of the free space).
export function newWidget(type, { x = 960, y = 540, id = null } = {}) {
  const def = WIDGET_TYPES[type];
  if (!def) throw new Error(`Нет виджета ${type}`);
  const [w, h] = def.size;
  return cleanWidget({ id: id || `w${Math.random().toString(36).slice(2, 8)}`, type, scene: 'menu', x: x - w / 2, y: y - h / 2, w, h, anchor: 'tl', opacity: 100, hidden: false, props: { ...def.props } });
}

// One widget as it may be kept: known fields only, inside the screen, sizes within the type's limits.
export function cleanWidget(input) {
  const value = input && typeof input === 'object' ? input : {};
  const def = WIDGET_TYPES[value.type];
  if (!def) return null;
  const { width, height, top } = WIDGET_SCREEN;
  const design = value.type === 'custom' ? cleanDesign(value.props?.design) : null;
  let w = def.fixed ? def.size[0] : clamp(round(value.w), def.min[0], width), h = def.fixed ? def.size[1] : clamp(round(value.h), def.min[1], height - top);
  if (design) {   // the design's proportions, the whole of it on the screen
    const ratio = design.size[1] / design.size[0];
    w = clamp(Math.min(w, Math.floor((height - top) / ratio), width), def.min[0], width); h = Math.max(def.min[1], Math.round(w * ratio));
  }
  const p = { ...def.props, ...(value.props && typeof value.props === 'object' ? value.props : {}) }, props = {};
  for (const key of Object.keys(def.props)) props[key] = p[key];
  if ('color' in props) props.color = color(props.color, def.props.color);
  if (value.type === 'clock') Object.assign(props, { format: oneOf(props.format, ['24', '12'], '24'), seconds: !!props.seconds, date: !!props.date, align: oneOf(props.align, ['left', 'center', 'right'], 'center'), panel: !!props.panel,
    look: oneOf(props.look, ['digital', 'round'], 'digital') });
  if (value.type === 'timer') Object.assign(props, { title: line(props.title, WIDGET_LIMITS.title), until: /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(String(props.until)) ? props.until : '', panel: !!props.panel,
    look: oneOf(props.look, ['cells', 'line'], 'cells') });
  if (value.type === 'lastMatch') Object.assign(props, { look: oneOf(props.look, ['gridstudio', 'dota'], 'gridstudio') });
  if (value.type === 'text') Object.assign(props, { text: line(props.text, WIDGET_LIMITS.text), size: clamp(round(props.size), 12, 96), weight: oneOf(props.weight, ['normal', 'bold', 'black'], 'bold'),
    align: oneOf(props.align, ['left', 'center', 'right'], 'left'), shadow: !!props.shadow, upper: !!props.upper });
  if (value.type === 'shortcut') {
    const action = oneOf(props.action, Object.keys(WIDGET_ACTIONS), 'armory');
    Object.assign(props, { label: line(props.label, WIDGET_LIMITS.label) || WIDGET_ACTIONS[action].title, action, url: action === 'link' ? widgetLink(props.url) : '', style: oneOf(props.style, ['panel', 'plain', 'accent'], 'panel') });
  }
  if (value.type === 'image' || value.type === 'video') Object.assign(props, { media: /^[a-z0-9]{1,64}$/.test(String(props.media)) ? props.media : '', fit: oneOf(props.fit, ['cover', 'contain'], 'cover'), radius: clamp(round(props.radius), 0, 64) });
  if (design) Object.assign(props, { designId: /^d[a-z0-9]{1,16}$/.test(String(props.designId)) ? props.designId : '', design });
  return {
    id: /^w[a-z0-9]{1,12}$/.test(String(value.id)) ? value.id : `w${Math.random().toString(36).slice(2, 8)}`,
    type: value.type, scene: oneOf(value.scene, WIDGET_SCENES, 'menu'),
    x: clamp(round(value.x), 0, width - w), y: clamp(round(value.y), top, height - h), w, h,
    anchor: oneOf(value.anchor, WIDGET_ANCHORS, 'tl'), opacity: clamp(round(value.opacity ?? 100), 5, 100), hidden: !!value.hidden, props
  };
}
// A list: known widgets only, unique ids, at most WIDGET_LIMITS.count, in their order (the first is lowest).
export function cleanWidgets(list) {
  const out = [], ids = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const widget = cleanWidget(item);
    if (!widget) continue;
    while (ids.has(widget.id)) widget.id = `w${Math.random().toString(36).slice(2, 8)}`;
    ids.add(widget.id); out.push(widget);
    if (out.length >= WIDGET_LIMITS.count) break;
  }
  return out;
}
// What a widget shows that Dota draws by itself (its own data panels) — the page draws a stand-in.
export const widgetNative = (widget) => WIDGET_TYPES[widget.type]?.native || null;
// The media a list needs (image and video widgets): their keys.
export const widgetMedia = (list) => [...new Set(cleanWidgets(list).flatMap((w) => (w.type === 'custom' ? designMedia(w.props.design)
  : (w.type === 'image' || w.type === 'video') && w.props.media ? [w.props.media] : [])))];
// Every picture and video the widgets need, with the box it is shown in: a widget's own, or a block's of a widget
// of one's own (scaled with the widget) → [{ kind: 'image' | 'video', hash, key: 'kind:hash', w, h, fit }].
export function widgetMediaJobs(list) {
  return cleanWidgets(list).filter((w) => !w.hidden).flatMap((w) => (w.type === 'image' || w.type === 'video') && w.props.media ? [{ kind: w.type, hash: w.props.media, w: w.w, h: w.h, fit: w.props.fit }]
    : w.type === 'custom' ? w.props.design.blocks.filter((b) => (b.type === 'image' || b.type === 'video') && b.props.media)
      .map((b) => { const k = w.w / w.props.design.size[0]; return { kind: b.type, hash: b.props.media, w: b.w * k, h: b.h * k, fit: b.props.fit }; }) : [])
    .map((job) => ({ ...job, key: `${job.kind}:${job.hash}` }));
}
// A widget of a design (the editor's «Добавить в меню»), in the middle of the screen at the design's own size.
export function designWidget(design, { designId = '', x = 960, y = 540 } = {}) {
  const clean = cleanDesign(design), [w, h] = clean.size;
  return cleanWidget({ id: `w${Math.random().toString(36).slice(2, 8)}`, type: 'custom', scene: 'menu', x: x - w / 2, y: y - h / 2, w, h, anchor: 'tl', opacity: 100, hidden: false, props: { designId, design: clean } });
}

// ——— The widgets as files of the menu pack. `widgets`: the list (cleanWidgets); `media`: { ['image:' | 'video:' + hash]: path } of
// each image's .vtex_c / video's .webm in the pack (made in the browser: src/customize/widget-pack.js); `lang`:
// the site's language, for the clock's day and month names. → { panels, style, script } — the panels go into our
// copy of the home page (widgetsHomePage), the style and the script are files of their own; null with no widget.
export const WIDGET_STYLE = 'panorama/styles/gridstudio_widgets.vcss_c';
// «Последний матч» as GridStudio's card (2026-11-02, the owner: «чтобы последний матч сразу был красивым, а можно было вернуть
// стиль доты»): Dota draws the panel from its own layout, which only its own stylesheet reaches, so Valve's
// frontpage_lastmatch.css goes back with these rules after it (assets/dota-menu, watched by check-dota-menu.mjs). The stylesheet
// is every such panel's, so the rules are for the panels our widgets give the class GSWCard (test 10: a widget «как в Dota» beside
// one of GridStudio's came out GridStudio's too).
export const LASTMATCH_STYLE = 'panorama/styles/frontpage_lastmatch.vcss_c';
export const LASTMATCH_RULES = `/* GridStudio: the last match as a card of GridStudio's widgets. */
DOTAFrontpageLastMatch.GSWCard
{
	background-color: gradient( linear, 0% 0%, 0% 100%, from( #181d23f2 ), to( #0c0f12f5 ) );
	border: 1px solid #ffffff12;
	border-top: 2px solid #e8c66acc;
	border-radius: 6px;
	box-shadow: #00000099 0px 12px 32px 0px;
}

DOTAFrontpageLastMatch.GSWCard:hover
{
	background-color: gradient( linear, 0% 0%, 0% 100%, from( #20262d ), to( #0e1115 ) );
}

DOTAFrontpageLastMatch.GSWCard #Header
{
	padding: 14px 16px 0px 16px;
}

DOTAFrontpageLastMatch.GSWCard #Header .FrontpageCellHeader
{
	color: #8b96a5;
	font-size: 12px;
	font-weight: semi-bold;
	letter-spacing: 3px;
	text-transform: uppercase;
}

DOTAFrontpageLastMatch.GSWCard .DateTimeLabel
{
	color: #8b96a5;
	font-size: 11px;
	letter-spacing: 2px;
	margin-top: 1px;
}

DOTAFrontpageLastMatch.GSWCard #Details
{
	margin-left: 16px;
	margin-top: 16px;
}

DOTAFrontpageLastMatch.GSWCard #HeroMovieContainer
{
	width: 92px;
	height: 92px;
	margin-right: 14px;
	border-radius: 8px;
	border: 1px solid #ffffff1f;
	opacity-mask: none;
	box-shadow: none;
}

DOTAFrontpageLastMatch.GSWCard #HeroBlurBackground
{
	visibility: collapse;
}

DOTAFrontpageLastMatch.GSWCard #Hero
{
	width: 138px;
	height: 184px;
	margin-left: -23px;
	margin-top: -36px;
}

DOTAFrontpageLastMatch.GSWCard #HeroName
{
	color: #eef2f6;
	font-size: 20px;
	font-weight: bold;
	letter-spacing: 1px;
	margin-bottom: 6px;
}

DOTAFrontpageLastMatch.GSWCard Label.StatCategory
{
	color: #8b96a5;
	font-size: 11px;
	font-weight: semi-bold;
	letter-spacing: 2px;
	min-width: 92px;
}

DOTAFrontpageLastMatch.GSWCard Label.StatValue
{
	color: #eef2f6;
	font-size: 12px;
	font-weight: semi-bold;
}

DOTAFrontpageLastMatch.GSWCard Label.StatValue.Green
{
	color: #7ed07e;
	text-shadow: none;
}

DOTAFrontpageLastMatch.GSWCard Label.StatValue.Red
{
	color: #f07878;
	text-shadow: none;
}

DOTAFrontpageLastMatch.GSWCard #ItemsHeader
{
	margin-left: 16px;
	margin-top: 14px;
	color: #8b96a5;
	font-size: 11px;
	font-weight: semi-bold;
	letter-spacing: 3px;
}

DOTAFrontpageLastMatch.GSWCard #Items
{
	horizontal-align: left;
	margin-left: 12px;
	margin-top: 6px;
	saturation: 1;
	brightness: 1;
}

DOTAFrontpageLastMatch.GSWCard .ItemImage
{
	width: 42px;
	height: 31px;
	margin: 0px 4px;
	border-radius: 4px;
	border: 1px solid #ffffff1a;
	background-color: #0c0f12;
}

DOTAFrontpageLastMatch.GSWCard #RecentGames Label
{
	color: #e8c66a;
}
`;
export const WIDGET_SCRIPT = 'panorama/scripts/gridstudio_widgets.vjs_c';
export const WIDGET_MEDIA_DIRS = Object.freeze({ image: 'panorama/images/gridstudio/widgets/', video: 'panorama/videos/gridstudio_widgets/' });
// Whether a pack's path is a widget's picture or video (the server takes only these besides MENU_PACK_PATHS).
export const widgetMediaFile = (path) => /^panorama\/images\/gridstudio\/widgets\/[a-f0-9]{16}_png\.vtex_c$/.test(path) || /^panorama\/videos\/gridstudio_widgets\/[a-f0-9]{16}\.webm$/.test(path);
export const widgetMediaPath = (kind, hash) => (kind === 'image' ? `${WIDGET_MEDIA_DIRS.image}${hash.slice(0, 16)}_png.vtex_c` : `${WIDGET_MEDIA_DIRS.video}${hash.slice(0, 16)}.webm`);
const pid = (widget, part = '') => `GSW_${widget.id}${part ? `_${part}` : ''}`;
const px = (n) => `${Math.round(n)}px`;
const alpha = (percent) => Math.round((percent / 100) * 255).toString(16).padStart(2, '0');

// Where a widget sits: its anchor's edge of the home page (the screen under the top bar) and the distance to it.
function placement(widget) {
  const { width, height, top } = WIDGET_SCREEN, page = height - top, y = widget.y - top;
  const [v, h] = widget.anchor.split('');
  const rules = [`width: ${px(widget.w)};`, `height: ${px(widget.h)};`];
  let dx = 0, dy = 0;
  if (h === 'l') rules.push('horizontal-align: left;', `margin-left: ${px(widget.x)};`);
  else if (h === 'r') rules.push('horizontal-align: right;', `margin-right: ${px(width - widget.x - widget.w)};`);
  else { rules.push('horizontal-align: center;'); dx = widget.x + widget.w / 2 - width / 2; }
  if (v === 't') rules.push('vertical-align: top;', `margin-top: ${px(y)};`);
  else if (v === 'b') rules.push('vertical-align: bottom;', `margin-bottom: ${px(page - y - widget.h)};`);
  else { rules.push('vertical-align: center;'); dy = y + widget.h / 2 - page / 2; }
  if (dx || dy) rules.push(`transform: translateX( ${px(dx)} ) translateY( ${px(dy)} );`);
  if (widget.opacity < 100) rules.push(`opacity: ${(widget.opacity / 100).toFixed(2)};`);
  return rules;
}
// The look of the ready widgets (2026-11-02, the owner: «более проработанными по дизайну … чтобы не выглядели как
// нейрослоп»): Dota's own, not a neon card — a graphite ground with a light top edge, a thin line of the widget's colour
// along the top, captions in small spaced capitals, one accent (Dota's gold by default). The page's preview draws the
// same (src/constructor/constructor.css .kz-w-card …).
// «Панель» on: the card.
const PANEL = ['background-color: gradient( linear, 0% 0%, 0% 100%, from( #181d23f2 ), to( #0c0f12f5 ) );', 'border: 1px solid #ffffff12;', 'border-top: 1px solid #ffffff26;',
  'border-radius: 6px;', 'box-shadow: #00000099 0px 12px 32px 0px;'];
// The card's top line in the widget's colour, fading to the right.
const EDGE = (tone) => ['width: 100%;', 'height: 2px;', `background-color: gradient( linear, 0% 0%, 100% 0%, from( ${tone} ), to( ${tone}00 ) );`, 'border-radius: 6px 6px 0px 0px;'];
// Captions (a clock's date, a timer's title and units).
const CAPTION = '#8b96a5', INK = '#eef2f6';
const SHADOW = 'text-shadow: 0px 1px 6px 2.0 #000000cc;';
const caps = (size, spacing = 0.16) => [`font-size: ${px(size)};`, 'font-weight: semi-bold;', 'text-transform: uppercase;', `letter-spacing: ${px(size * spacing)};`];
const block = (selector, rules) => `${selector}\n{\n${rules.map((rule) => `\t${rule}`).join('\n')}\n}\n`;

function widgetPanel(widget, media) {
  const id = pid(widget), p = widget.props, label = (part, cls) => `<Label id="${pid(widget, part)}" class="${cls}" text="" hittest="false" />`;
  switch (widget.type) {
    // The time (its seconds smaller and dimmer, AM/PM in capitals) over the weekday and the date, in the middle of the box.
    // A dial: twelve marks and three hands, each a panel as big as the dial turned by the script (Panorama turns a panel
    // about its middle whatever transform-origin says, test 8), its bar in the upper half; the date under the middle.
    case 'clock': if (p.look === 'round') {
      const turn = (part, cls, inner) => `<Panel id="${pid(widget, part)}" class="${cls}" hittest="false">${inner}</Panel>`;
      const marks = Array.from({ length: 12 }, (_, i) => turn(`m${i}`, 'GSWMark', `<Panel class="GSWMarkBar${i % 3 ? '' : ' is-major'}" hittest="false" />`)).join('');
      const hands = ['hh', 'mh', ...(p.seconds ? ['sh'] : [])].map((part) => turn(part, 'GSWHand', `<Panel class="GSWHandBar is-${part}" hittest="false" />`)).join('');
      return `<Panel id="${id}" class="GSW GSWClock GSWDial" hittest="false"><Panel id="${pid(widget, 'face')}" hittest="false">${marks}${p.date ? label('date', 'GSWDialDate') : ''}${hands}<Panel id="${pid(widget, 'pin')}" hittest="false" /></Panel></Panel>`;
    } else return `<Panel id="${id}" class="GSW GSWClock" hittest="false">${p.panel ? `<Panel id="${pid(widget, 'edge')}" hittest="false" />` : ''}<Panel id="${pid(widget, 'box')}" class="GSWStack" hittest="false">`
      + `<Panel id="${pid(widget, 'row')}" hittest="false">${label('time', 'GSWClockTime')}${p.seconds ? label('sec', 'GSWClockSec') : ''}${p.format === '12' ? label('ampm', 'GSWClockAmPm') : ''}</Panel>`
      + `${p.date ? `<Panel id="${pid(widget, 'dates')}" hittest="false">${label('day', 'GSWClockDay')}<Panel id="${pid(widget, 'dot')}" hittest="false" />${label('date', 'GSWClockDate')}</Panel>` : ''}</Panel></Panel>`;
    // The title over four cells — days, hours, minutes, seconds, each a number over its unit — with thin lines between;
    // once the date has come, «Уже началось» in their place (the script sets the class GSWDone).
    case 'timer': {
      // In one line (the look of the first widgets): the title over «3д 04:58:59».
      if (p.look === 'line') return `<Panel id="${id}" class="GSW GSWTimer" hittest="false">${p.panel ? `<Panel id="${pid(widget, 'edge')}" hittest="false" />` : ''}<Panel id="${pid(widget, 'box')}" class="GSWStack" hittest="false">${p.title ? label('title', 'GSWTimerTitle') : ''}${label('time', 'GSWTimerTime')}</Panel></Panel>`;
      const cells = ['d', 'h', 'm', 's'].map((u) => `<Panel class="GSWSeg" hittest="false">${label(`${u}n`, 'GSWNum')}${label(`${u}c`, 'GSWUnit')}</Panel>`).join('<Panel class="GSWSep" hittest="false" />');
      return `<Panel id="${id}" class="GSW GSWTimer" hittest="false">${p.panel ? `<Panel id="${pid(widget, 'edge')}" hittest="false" />` : ''}<Panel id="${pid(widget, 'box')}" class="GSWStack" hittest="false">`
        + `${p.title ? label('title', 'GSWTimerTitle') : ''}<Panel id="${pid(widget, 'segs')}" hittest="false">${cells}</Panel>${label('done', 'GSWTimerDone')}</Panel></Panel>`;
    }
    case 'text': return `<Panel id="${id}" class="GSW GSWTextBox" hittest="false">${label('text', 'GSWText')}</Panel>`;
    case 'shortcut': {
      const call = p.action === 'link' ? (p.url ? `$.DispatchEvent( 'ExternalBrowserGoToURL', '${p.url}' );` : '') : WIDGET_ACTIONS[p.action].call;
      // «Панель»: the strip of the button's colour along its left edge. The words on the left, an arrow on the right (up and
      // to the right for a link: it leaves Dota).
      return `<Button id="${id}" class="GSW GSWShortcut is-${p.style}"${call ? ` onactivate="${call}"` : ''}>${p.style === 'panel' ? `<Panel id="${pid(widget, 'bar')}" hittest="false" />` : ''}${label('label', 'GSWShortcutLabel')}<Panel id="${pid(widget, 'arrow')}" hittest="false" />${p.action === 'link' ? `<Panel id="${pid(widget, 'shaft')}" hittest="false" />` : ''}</Button>`;
    }
    case 'image': return media[`image:${p.media}`] ? `<Image id="${id}" class="GSW GSWImage" src="s2r://${media[`image:${p.media}`].replace(/_c$/, '')}" scaling="${p.fit === 'contain' ? 'stretch-to-fit-preserve-aspect' : 'stretch-to-cover-preserve-aspect'}" hittest="false" />` : '';
    case 'video': return media[`video:${p.media}`] ? `<MoviePanel id="${id}" class="GSW GSWVideo" src="s2r://${media[`video:${p.media}`]}" repeat="true" autoplay="onload" hittest="false" />` : '';
    case 'custom': return `<Panel id="${id}" class="GSW GSWCustom" hittest="false">${p.design.blocks.map((b) => blockPanel(widget, b, media)).join('')}</Panel>`;
    default: return `<Panel id="${id}" class="GSW GSWNative" hittest="false"><${WIDGET_TYPES[widget.type].native}${widget.type === 'miniProfile' ? ' accountid="local"' : ''}${widget.type === 'lastMatch' && p.look !== 'dota' ? ' class="GSWCard"' : ''} /></Panel>`;
  }
}
// A block of a widget of one's own: its panel inside the widget's (texts, clocks and timers get their words from the script).
// A block under the cursor (hover, a tooltip) takes the mouse; the others let it through to the menu.
function blockPanel(widget, block, media) {
  const id = pid(widget, block.id), p = block.props, cls = `GSWB${block.anim !== 'none' ? ` GSWAnim${block.anim[0].toUpperCase()}${block.anim.slice(1)}` : ''}${block.hover ? ' GSWHover' : ''}`;
  const hit = block.hover || !!block.tip;
  switch (block.type) {
    case 'image': return media[`image:${p.media}`] ? `<Image id="${id}" class="${cls}" src="s2r://${media[`image:${p.media}`].replace(/_c$/, '')}" scaling="${p.fit === 'contain' ? 'stretch-to-fit-preserve-aspect' : 'stretch-to-cover-preserve-aspect'}" hittest="${hit}" />` : '';
    case 'video': return media[`video:${p.media}`] ? `<MoviePanel id="${id}" class="${cls}" src="s2r://${media[`video:${p.media}`]}" repeat="true" autoplay="onload" hittest="${hit}" />` : '';
    case 'button': {
      const call = p.action === 'link' ? (p.url ? `$.DispatchEvent( 'ExternalBrowserGoToURL', '${p.url}' );` : '') : WIDGET_ACTIONS[p.action].call;
      return `<Button id="${id}" class="${cls} GSWButton"${call ? ` onactivate="${call}"` : ''}><Label id="${id}_l" text="" hittest="false" /></Button>`;
    }
    case 'progress': return `<Panel id="${id}" class="${cls}" hittest="${hit}"><Panel id="${id}_f" hittest="false" /></Panel>`;
    case 'shape': return `<Panel id="${id}" class="${cls}" hittest="${hit}" />`;
    // Dota's own panels (BLOCK_TYPES below): the user's avatar and name, a hero as a 3D model (one turned with the
    // mouse takes it), Dota's moving portrait or its picture.
    case 'avatar': return `<DOTAAvatarImage id="${id}" class="${cls}" steamid="local" nocompendiumborder="true" hittest="${hit}" />`;
    case 'nickname': return `<Panel id="${id}" class="${cls}" hittest="${hit}"><DOTAUserName id="${id}_n" steamid="local" hittest="false" /></Panel>`;
    case 'hero': return p.view === 'model'
      ? `<DOTAScenePanel id="${id}" class="${cls}" unit="npc_dota_hero_${p.hero}" particleonly="false" antialias="true" drawbackground="false" allowrotation="${p.rotate}" hittest="${hit || p.rotate}" />`
      : p.view === 'movie' ? `<DOTAHeroMovie id="${id}" class="${cls}" heroname="${p.hero}" heroimagestyle="portrait" hittest="${hit}" />`
        : `<DOTAHeroImage id="${id}" class="${cls}" heroname="${p.hero}" heroimagestyle="portrait" scaling="stretch-to-cover-preserve-aspect" hittest="${hit}" />`;
    // Text, clock, timer: the words in the middle of the block's height, as the page draws them.
    default: return `<Panel id="${id}" class="${cls}" hittest="${hit}"><Label id="${id}_t" text="" hittest="false" /></Panel>`;
  }
}

function widgetRules(widget) {
  const id = `#${pid(widget)}`, p = widget.props, out = [block(id, placement(widget))];
  if (widget.type === 'clock' && p.look === 'round') {
    // The dial: as big as the box's smaller side, in its middle; its ground the card's, round.
    const d = Math.round(Math.min(widget.w, widget.h)), face = `#${pid(widget, 'face')}`, whole = [`width: ${px(d)};`, `height: ${px(d)};`];
    out.push(block(face, [...whole, 'horizontal-align: center;', 'vertical-align: center;', 'border-radius: 50%;',
      ...(p.panel ? PANEL.filter((rule) => !/border-radius|box-shadow/.test(rule)) : ['background-color: #0c0f1299;', 'border: 1px solid #ffffff1f;'])]));
    out.push(block(`${id} .GSWMark, ${id} .GSWHand`, whole));
    for (let i = 0; i < 12; i++) out.push(block(`#${pid(widget, `m${i}`)}`, [`transform: rotateZ( ${i * 30}deg );`]));
    out.push(block(`${id} .GSWMarkBar`, ['width: 2px;', `height: ${px(d * 0.05)};`, 'horizontal-align: center;', `margin-top: ${px(d * 0.06)};`, 'background-color: #ffffff59;']));
    out.push(block(`${id} .GSWMarkBar.is-major`, ['width: 3px;', `height: ${px(d * 0.08)};`, `background-color: ${p.color};`]));
    const hand = (cls, width, length, colour) => block(`${id} .GSWHandBar.is-${cls}`, [`width: ${px(width)};`, `height: ${px(d * length)};`, 'horizontal-align: center;',
      `margin-top: ${px(d * (0.5 - length))};`, `background-color: ${colour};`, `border-radius: ${px(width / 2)};`]);
    out.push(hand('hh', Math.max(3, d * 0.03), 0.26, INK), hand('mh', Math.max(2, d * 0.02), 0.38, INK), hand('sh', Math.max(1, d * 0.008), 0.42, p.color));
    out.push(block(`#${pid(widget, 'pin')}`, [`width: ${px(d * 0.06)};`, `height: ${px(d * 0.06)};`, 'horizontal-align: center;', 'vertical-align: center;', 'border-radius: 50%;', `background-color: ${p.color};`]));
    if (p.date) out.push(block(`#${pid(widget, 'date')}`, ['horizontal-align: center;', 'vertical-align: bottom;', `margin-bottom: ${px(d * 0.24)};`, `color: ${CAPTION};`, ...caps(Math.max(8, d * 0.06), 0.14), 'white-space: nowrap;']));
  } else if (widget.type === 'clock') {
    // The sizes the page's preview draws (src/constructor/WidgetView.jsx): the time fills the box by its height (less with
    // the date under it) and by its width for the longest time of its format.
    const chars = 5 + (p.seconds ? 1.5 : 0) + (p.format === '12' ? 1.2 : 0), size = Math.max(10, Math.min(widget.h * (p.date ? 0.56 : 0.74), widget.w / (chars * 0.6)));
    const time = Math.round(size), small = Math.round(size * 0.42), date = Math.round(Math.max(9, size * 0.2));
    if (p.panel) out.push(block(id, PANEL), block(`#${pid(widget, 'edge')}`, EDGE(p.color)));
    out.push(block(`#${pid(widget, 'box')}`, ['width: 100%;', 'flow-children: down;', 'vertical-align: center;', 'padding: 0px 14px;']));
    out.push(block(`#${pid(widget, 'row')}, #${pid(widget, 'dates')}`, ['flow-children: right;', `horizontal-align: ${p.align};`]));
    out.push(block(`${id} Label`, ['white-space: nowrap;', ...(p.panel ? [] : [SHADOW])]));
    out.push(block(`#${pid(widget, 'time')}`, [`color: ${p.color};`, `font-size: ${px(time)};`, 'font-weight: light;', 'letter-spacing: 1px;']));
    if (p.seconds) out.push(block(`#${pid(widget, 'sec')}`, [`color: ${p.color};`, 'opacity: 0.5;', `font-size: ${px(small)};`, 'font-weight: light;', 'vertical-align: bottom;', `margin-bottom: ${px(time * 0.13)};`, 'margin-left: 2px;']));
    if (p.format === '12') out.push(block(`#${pid(widget, 'ampm')}`, [`color: ${CAPTION};`, ...caps(Math.max(9, size * 0.24), 0.1), 'vertical-align: bottom;', `margin-bottom: ${px(time * 0.17)};`, `margin-left: ${px(size * 0.12)};`]));
    if (p.date) {
      out.push(block(`#${pid(widget, 'dates')}`, [`margin-top: ${px(Math.max(2, size * 0.06))};`]));
      out.push(block(`#${pid(widget, 'day')}`, [`color: ${p.color};`, ...caps(date)]));
      out.push(block(`#${pid(widget, 'date')}`, [`color: ${CAPTION};`, ...caps(date)]));
      out.push(block(`#${pid(widget, 'dot')}`, ['width: 3px;', 'height: 3px;', 'border-radius: 50%;', `background-color: ${CAPTION};`, 'vertical-align: center;', `margin: 0px ${px(date * 0.6)};`]));
    }
  } else if (widget.type === 'timer' && p.look === 'line') {
    const size = Math.max(10, Math.min(widget.h * 0.36, widget.w / 11)), cap = Math.max(9, size * 0.3);
    if (p.panel) out.push(block(id, PANEL), block(`#${pid(widget, 'edge')}`, EDGE(p.color)));
    out.push(block(`#${pid(widget, 'box')}`, ['width: 100%;', 'flow-children: down;', 'vertical-align: center;', 'padding: 0px 14px;']));
    out.push(block(`${id} Label`, ['horizontal-align: center;', 'text-align: center;', 'white-space: nowrap;', ...(p.panel ? [] : [SHADOW])]));
    if (p.title) out.push(block(`#${pid(widget, 'title')}`, [`color: ${CAPTION};`, ...caps(cap), `margin-bottom: ${px(size * 0.2)};`]));
    out.push(block(`#${pid(widget, 'time')}`, [`color: ${p.color};`, `font-size: ${px(size)};`, 'font-weight: semi-bold;', 'letter-spacing: 1px;']));
  } else if (widget.type === 'timer') {
    // The cells by the box: four numbers of up to two digits side by side, the title and the units under them.
    const num = Math.round(Math.max(10, Math.min(widget.h * (p.title ? 0.38 : 0.46), widget.w / 8.4))), unit = Math.round(Math.max(8, num * 0.26)), title = Math.round(Math.max(9, num * 0.3));
    if (p.panel) out.push(block(id, PANEL), block(`#${pid(widget, 'edge')}`, EDGE(p.color)));
    out.push(block(`#${pid(widget, 'box')}`, ['width: 100%;', 'flow-children: down;', 'vertical-align: center;', 'padding: 0px 14px;']));
    out.push(block(`${id} Label`, ['horizontal-align: center;', 'text-align: center;', 'white-space: nowrap;', ...(p.panel ? [] : [SHADOW])]));
    if (p.title) out.push(block(`#${pid(widget, 'title')}`, [`color: ${CAPTION};`, ...caps(title), `margin-bottom: ${px(num * 0.22)};`]));
    out.push(block(`#${pid(widget, 'segs')}`, ['flow-children: right;', 'horizontal-align: center;']));
    out.push(block(`${id} .GSWSeg`, ['flow-children: down;', `margin: 0px ${px(num * 0.32)};`]));
    out.push(block(`${id} .GSWNum`, [`color: ${INK};`, `font-size: ${px(num)};`, 'font-weight: semi-bold;', 'letter-spacing: 1px;']));
    out.push(block(`#${pid(widget, 'dn')}`, [`color: ${p.color};`]));
    out.push(block(`${id} .GSWUnit`, [`color: ${CAPTION};`, ...caps(unit, 0.18), 'margin-top: 2px;']));
    out.push(block(`${id} .GSWSep`, ['width: 1px;', `height: ${px(num * 0.8)};`, 'background-color: #ffffff1f;', `margin-top: ${px(num * 0.22)};`]));
    out.push(block(`#${pid(widget, 'done')}`, ['visibility: collapse;', `color: ${p.color};`, ...caps(Math.max(10, num * 0.5), 0.12)]));
    out.push(block(`${id}.GSWDone #${pid(widget, 'segs')}`, ['visibility: collapse;']), block(`${id}.GSWDone #${pid(widget, 'done')}`, ['visibility: visible;']));
  } else if (widget.type === 'text') {
    out.push(block(`#${pid(widget, 'text')}`, ['width: 100%;', `font-size: ${px(p.size)};`, `color: ${p.color};`, `font-weight: ${p.weight};`, `text-align: ${p.align};`,
      ...(p.shadow ? ['text-shadow: 0px 1px 6px 2.0 #000000cc;'] : []), ...(p.upper ? ['text-transform: uppercase;', 'letter-spacing: 2px;'] : [])]));
  } else if (widget.type === 'shortcut') {
    // Three looks (the preview's .kz-w-button): «Панель» a graphite plate with the colour's strip, «Акцент» the colour itself,
    // «Текст» the words and the arrow alone. Under the cursor the plate lightens and the arrow steps on.
    const size = Math.max(10, Math.min(widget.h * 0.34, 24)), arrow = Math.round(Math.max(6, size * 0.42)), dark = '#111418';
    const ink = p.style === 'accent' ? dark : p.style === 'panel' ? INK : p.color, mark = p.style === 'accent' ? `${dark}b3` : p.style === 'panel' ? '#ffffff8c' : p.color;
    const ground = p.style === 'accent' ? [`background-color: ${p.color};`, 'border-top: 1px solid #ffffff59;', 'border-radius: 4px;']
      : p.style === 'panel' ? ['background-color: gradient( linear, 0% 0%, 0% 100%, from( #232930 ), to( #161a1f ) );', 'border: 1px solid #ffffff14;', 'border-top: 1px solid #ffffff26;', 'border-radius: 4px;', 'box-shadow: #00000080 0px 6px 18px 0px;'] : [];
    out.push(block(id, [...ground, 'transition-property: brightness, pre-transform-scale2d, background-color;', 'transition-duration: 0.12s;']));
    out.push(block(`${id}:hover`, p.style === 'panel' ? ['background-color: gradient( linear, 0% 0%, 0% 100%, from( #2d343d ), to( #1c2127 ) );'] : ['brightness: 1.15;']), block(`${id}:active`, ['pre-transform-scale2d: 0.98;']));
    if (p.style === 'panel') out.push(block(`#${pid(widget, 'bar')}`, ['width: 3px;', 'height: 100%;', `background-color: ${p.color};`, 'border-radius: 4px 0px 0px 4px;']));
    const lead = p.style === 'plain' ? 2 : Math.round(Math.max(10, size * 0.9));
    out.push(block(`#${pid(widget, 'label')}`, ['horizontal-align: left;', 'vertical-align: center;', 'white-space: nowrap;', 'text-overflow: ellipsis;', `margin-left: ${px(lead)};`,
      `max-width: ${px(widget.w - lead - arrow * 2 - size * 1.4)};`, `font-size: ${px(size)};`, `color: ${ink};`, ...caps(size, 0.14).slice(1), ...(p.style === 'plain' ? [SHADOW] : [])]));
    // The arrow: two sides of a small square turned 45° (a chevron); for a link the square's corner points up and right, and
    // a line from the middle of the square to that corner makes it an arrow out (↗).
    const right = Math.max(8, size * 0.8), shaft = Math.round(arrow * 1.3);
    out.push(block(`#${pid(widget, 'arrow')}`, [`width: ${px(arrow)};`, `height: ${px(arrow)};`, `border-top: 2px solid ${mark};`, `border-right: 2px solid ${mark};`, 'horizontal-align: right;', 'vertical-align: center;',
      `margin-right: ${px(right)};`, `transform: rotateZ( ${p.action === 'link' ? 0 : 45}deg );`, 'transition-property: transform;', 'transition-duration: 0.15s;']));
    out.push(block(`${id}:hover #${pid(widget, 'arrow')}`, [`transform: translateX( 3px ) rotateZ( ${p.action === 'link' ? 0 : 45}deg );`]));
    if (p.action === 'link') {
      out.push(block(`#${pid(widget, 'shaft')}`, [`width: ${px(shaft)};`, 'height: 2px;', `background-color: ${mark};`, 'horizontal-align: right;', 'vertical-align: center;',
        `margin-right: ${px(right + arrow / 2 - shaft / 2)};`, 'transform: rotateZ( -45deg );', 'transition-property: transform;', 'transition-duration: 0.15s;']));
      out.push(block(`${id}:hover #${pid(widget, 'shaft')}`, ['transform: translateX( 3px ) rotateZ( -45deg );']));
    }
  } else if ((widget.type === 'image' || widget.type === 'video') && p.radius) out.push(block(id, [`border-radius: ${px(p.radius)};`]));
  else if (widget.type === 'custom') {
    const d = p.design, k = widget.w / d.size[0];
    if (d.background || d.radius) out.push(block(id, [...(d.background ? [`background-color: ${d.background};`] : []), ...(d.radius ? [`border-radius: ${px(d.radius * k)};`] : [])]));
    for (const b of d.blocks) out.push(blockRules(widget, b, k));
  }
  return out.join('\n');
}
const fontRules = (q, k) => [`font-size: ${px(q.size * k)};`, `color: ${q.color};`, `font-weight: ${q.weight || 'bold'};`, `text-align: ${q.align || 'left'};`];
// A block's rules, its place and size scaled by k (the widget's width over its design's).
function blockRules(widget, b, k) {
  const id = `#${pid(widget, b.id)}`, q = b.props;
  const rules = [`x: ${px(b.x * k)};`, `y: ${px(b.y * k)};`, `width: ${px(b.w * k)};`, `height: ${px(b.h * k)};`, ...(b.opacity < 100 ? [`opacity: ${(b.opacity / 100).toFixed(2)};`] : [])];
  const out = [];
  if (b.type === 'image' || b.type === 'video') { if (q.radius) rules.push(`border-radius: ${px(q.radius * k)};`); }
  else if (b.type === 'text' || b.type === 'clock' || b.type === 'timer') {
    rules.push('overflow: noclip;');
    out.push(block(`${id}_t`, ['width: 100%;', 'vertical-align: center;', ...fontRules(q, k), `line-height: ${px(q.size * k * 1.15)};`,
      ...(b.type === 'text' ? [...(q.shadow ? ['text-shadow: 0px 1px 6px 2.0 #000000cc;'] : []), ...(q.upper ? ['text-transform: uppercase;'] : []), ...(q.spacing ? [`letter-spacing: ${px(q.spacing * k)};`] : [])] : [])]));
  } else if (b.type === 'button') {
    rules.push(`background-color: ${q.fill};`, ...(q.radius ? [`border-radius: ${px(q.radius * k)};`] : []));
    out.push(block(`${id}_l`, [`horizontal-align: ${q.align};`, 'vertical-align: center;', 'white-space: nowrap;', ...(q.align === 'center' ? [] : [`margin-${q.align}: ${px(q.size * k * 0.9)};`]),
      `font-size: ${px(q.size * k)};`, `color: ${q.color};`, 'font-weight: bold;', ...(q.upper ? ['text-transform: uppercase;', 'letter-spacing: 2px;'] : [])]));
    // Sounds as Valve's own buttons have them: a style's `sound` plays when the state begins.
    if (q.sound) out.push(block(`${id}:active`, [`sound: "${BLOCK_SOUNDS[q.sound].sound}";`]));
    if (q.hoverSound) out.push(block(`${id}:hover`, [`sound: "${HOVER_SOUND}";`]));
  } else if (b.type === 'avatar') {
    const round = q.radius ? [`border-radius: ${px(q.radius * k)};`] : [];
    rules.push(...round, ...(q.border && q.borderWidth ? [`border: ${px(q.borderWidth * k)} solid ${q.border};`] : []));
    if (round.length) out.push(block(`${id} #AvatarImage`, round));
  } else if (b.type === 'nickname') {
    // Dota's name is an HTML line with the guild's tag apart (.PersonaGuildTag): one line, what does not fit is cut off
    // (test 7: a narrow block broke the tag onto the text under it).
    rules.push('overflow: clip;');
    out.push(block(`${id}_n`, ['width: 100%;', 'vertical-align: center;']));
    out.push(block(`${id}_n Label`, ['white-space: nowrap;', 'text-overflow: clip;', ...fontRules(q, k), `line-height: ${px(q.size * k * 1.15)};`,
      ...(q.shadow ? ['text-shadow: 0px 1px 6px 2.0 #000000cc;'] : []), ...(q.upper ? ['text-transform: uppercase;'] : [])]));
  } else if (b.type === 'shape') {
    const to = { down: '0% 100%', right: '100% 0%', diagonal: '100% 100%' }[q.direction];
    rules.push(q.fill2 ? `background-color: gradient( linear, 0% 0%, ${to}, from( ${q.fill} ), to( ${q.fill2} ) );` : `background-color: ${q.fill};`,
      ...(q.radius ? [`border-radius: ${px(q.radius * k)};`] : []), ...(q.border && q.borderWidth ? [`border: ${px(q.borderWidth * k)} solid ${q.border};`] : []));
  } else if (b.type === 'progress') {
    rules.push(`background-color: ${q.track};`, ...(q.radius ? [`border-radius: ${px(q.radius * k)};`] : []));
    out.push(block(`${id}_f`, [`width: ${q.value}%;`, 'height: 100%;', `background-color: ${q.fill};`, ...(q.radius ? [`border-radius: ${px(q.radius * k)};`] : [])]));
  }
  return [block(id, rules), ...out].join('\n');
}
// The blocks' animations and hover: only properties Valve animates (opacity, transform, pre-transform-scale2d,
// brightness — scripts/hud-capture/plan.mjs VALVE_KEYFRAME_PROPS), each class one animation.
const BLOCK_MOTION = `@keyframes 'GSWAppearAnim'
{
	0% { opacity: 0; }
	100% { opacity: 1; }
}

@keyframes 'GSWPulseAnim'
{
	0% { pre-transform-scale2d: 1; brightness: 1; }
	50% { pre-transform-scale2d: 1.04; brightness: 1.2; }
	100% { pre-transform-scale2d: 1; brightness: 1; }
}

@keyframes 'GSWSlideAnim'
{
	0% { opacity: 0; transform: translateX( -24px ); }
	100% { opacity: 1; transform: translateX( 0px ); }
}

${block('.GSWAnimAppear', ['animation-name: GSWAppearAnim;', 'animation-duration: 0.4s;', 'animation-timing-function: ease-out;', 'animation-iteration-count: 1;'])}
${block('.GSWAnimPulse', ['animation-name: GSWPulseAnim;', 'animation-duration: 1.6s;', 'animation-timing-function: ease-in-out;', 'animation-iteration-count: infinite;'])}
${block('.GSWAnimSlide', ['animation-name: GSWSlideAnim;', 'animation-duration: 0.5s;', 'animation-timing-function: ease-out;', 'animation-iteration-count: 1;'])}
${block('.GSWHover', ['transition-property: brightness, pre-transform-scale2d;', 'transition-duration: 0.12s;'])}
${block('.GSWHover:hover', ['brightness: 1.25;', 'pre-transform-scale2d: 1.03;'])}
${block('.GSWButton:active', ['pre-transform-scale2d: 0.97;'])}`;

// The script's data: only what it writes (texts, clocks, timers) and the blocks' tooltips; ASCII through JSON with \u escapes.
function scriptItems(widgets) {
  return widgets.flatMap((w) => {
    const p = w.props;
    if (w.type === 'clock') return [{ id: pid(w), type: 'clock', format: p.format, seconds: p.seconds, date: p.date, look: p.look }];
    if (w.type === 'timer') return [{ id: pid(w), type: 'timer', title: p.title, until: p.until, look: p.look }];
    if (w.type === 'text') return [{ id: pid(w), type: 'text', text: p.text }];
    if (w.type === 'shortcut') return [{ id: pid(w), type: 'label', text: p.label }, ...(p.action === 'profile' ? [{ id: pid(w), type: 'profile' }] : [])];
    if (w.type === 'custom') return p.design.blocks.flatMap((b) => {
      const id = pid(w, b.id), q = b.props, tip = b.tip ? [{ id, type: 'tip', text: b.tip }] : [];
      if (b.type === 'text') return [{ id: `${id}_t`, type: 'btext', text: q.text }, ...tip];
      if (b.type === 'button') return [{ id: `${id}_l`, type: 'btext', text: q.label }, ...(q.action === 'profile' ? [{ id, type: 'profile' }] : []), ...tip];
      if (b.type === 'clock') return [{ id: `${id}_t`, type: 'bclock', format: q.format, seconds: q.seconds }, ...tip];
      if (b.type === 'timer') return [{ id: `${id}_t`, type: 'btimer', until: q.until }, ...tip];
      return tip;
    });
    return [];
  });
}
const asciiJSON = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
// The script's own code: the same for everyone (the server checks a pack's script is exactly this and data).
// It looks for its panels from the page and, failing that, from the top of the menu, and keeps trying every second
// for those not there yet (test 5 in Dota, 2026-11-02: after Dota's update no text of the script showed at all).
export const WIDGET_RUNTIME = `(function ()
{
	var root = $.GetContextPanel(), top = root, found = {};
	while ( top.GetParent() ) top = top.GetParent();
	var NAMES = {
		ru: { days: [ '\\u0432\\u043e\\u0441\\u043a\\u0440\\u0435\\u0441\\u0435\\u043d\\u044c\\u0435', '\\u043f\\u043e\\u043d\\u0435\\u0434\\u0435\\u043b\\u044c\\u043d\\u0438\\u043a', '\\u0432\\u0442\\u043e\\u0440\\u043d\\u0438\\u043a', '\\u0441\\u0440\\u0435\\u0434\\u0430', '\\u0447\\u0435\\u0442\\u0432\\u0435\\u0440\\u0433', '\\u043f\\u044f\\u0442\\u043d\\u0438\\u0446\\u0430', '\\u0441\\u0443\\u0431\\u0431\\u043e\\u0442\\u0430' ],
			months: [ '\\u044f\\u043d\\u0432\\u0430\\u0440\\u044f', '\\u0444\\u0435\\u0432\\u0440\\u0430\\u043b\\u044f', '\\u043c\\u0430\\u0440\\u0442\\u0430', '\\u0430\\u043f\\u0440\\u0435\\u043b\\u044f', '\\u043c\\u0430\\u044f', '\\u0438\\u044e\\u043d\\u044f', '\\u0438\\u044e\\u043b\\u044f', '\\u0430\\u0432\\u0433\\u0443\\u0441\\u0442\\u0430', '\\u0441\\u0435\\u043d\\u0442\\u044f\\u0431\\u0440\\u044f', '\\u043e\\u043a\\u0442\\u044f\\u0431\\u0440\\u044f', '\\u043d\\u043e\\u044f\\u0431\\u0440\\u044f', '\\u0434\\u0435\\u043a\\u0430\\u0431\\u0440\\u044f' ],
			day: '\\u0434', done: '\\u0423\\u0436\\u0435 \\u043d\\u0430\\u0447\\u0430\\u043b\\u043e\\u0441\\u044c',
			units: [ '\\u0434\\u043d', '\\u0447', '\\u043c\\u0438\\u043d', '\\u0441\\u0435\\u043a' ] },
		en: { days: [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ],
			months: [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ],
			day: 'd', done: 'Started', units: [ 'days', 'hrs', 'min', 'sec' ] }
	};
	var words = NAMES[ GSW_DATA.lang ] || NAMES.ru;
	function find( id )
	{
		var panel = found[ id ];
		if ( panel && panel.IsValid() ) return panel;
		panel = root.FindChildTraverse( id ) || top.FindChildTraverse( id );
		if ( panel ) found[ id ] = panel;
		return panel;
	}
	function set( id, text ) { var label = find( id ); if ( label && label.text !== text ) label.text = text; }
	function pad( n ) { return ( n < 10 ? '0' : '' ) + n; }
	function clockText( item, now )
	{
		var h = now.getHours(), tail = '';
		if ( item.format === '12' ) { tail = h < 12 ? ' AM' : ' PM'; h = h % 12 || 12; }
		return ( item.format === '12' ? h : pad( h ) ) + ':' + pad( now.getMinutes() ) + ( item.seconds ? ':' + pad( now.getSeconds() ) : '' ) + tail;
	}
	function timerText( item, now )
	{
		var parts = item.until.split( /[-T:]/ ), end = new Date( +parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4] );
		var left = Math.floor( ( end.getTime() - now.getTime() ) / 1000 );
		if ( !item.until || isNaN( left ) ) return '--:--:--';
		if ( left <= 0 ) return words.done;
		var d = Math.floor( left / 86400 ), rest = left % 86400;
		return ( d ? d + words.day + ' ' : '' ) + pad( Math.floor( rest / 3600 ) ) + ':' + pad( Math.floor( rest % 3600 / 60 ) ) + ':' + pad( rest % 60 );
	}
	// A ready clock: the hours and minutes, the seconds and AM/PM apart, the weekday and the date apart.
	function turn( id, degrees ) { var panel = find( id ); if ( panel ) panel.style.transform = 'rotateZ( ' + degrees + 'deg )'; }
	function clock( item, now )
	{
		if ( item.look === 'round' )
		{
			var sec = now.getSeconds(), min = now.getMinutes() + sec / 60;
			turn( item.id + '_hh', ( now.getHours() % 12 + min / 60 ) * 30 );
			turn( item.id + '_mh', min * 6 );
			if ( item.seconds ) turn( item.id + '_sh', sec * 6 );
			if ( item.date ) set( item.id + '_date', GSW_DATA.lang === 'en' ? words.months[ now.getMonth() ].slice( 0, 3 ) + ' ' + now.getDate() : now.getDate() + ' ' + words.months[ now.getMonth() ] );
			return;
		}
		var h = now.getHours(), half = '';
		if ( item.format === '12' ) { half = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; }
		set( item.id + '_time', ( item.format === '12' ? h : pad( h ) ) + ':' + pad( now.getMinutes() ) );
		if ( item.seconds ) set( item.id + '_sec', ':' + pad( now.getSeconds() ) );
		if ( half ) set( item.id + '_ampm', half );
		if ( !item.date ) return;
		set( item.id + '_day', words.days[ now.getDay() ] );
		set( item.id + '_date', GSW_DATA.lang === 'en' ? words.months[ now.getMonth() ] + ' ' + now.getDate() : now.getDate() + ' ' + words.months[ now.getMonth() ] );
	}
	// A ready timer: four cells (days, hours, minutes, seconds); once the date has come, the class GSWDone shows words.done.
	var UNITS = [ 'd', 'h', 'm', 's' ];
	function timer( item, now )
	{
		set( item.id + '_title', item.title );
		if ( item.look === 'line' ) { set( item.id + '_time', timerText( item, now ) ); return; }
		set( item.id + '_done', words.done );
		var parts = item.until.split( /[-T:]/ ), end = new Date( +parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4] );
		var left = Math.floor( ( end.getTime() - now.getTime() ) / 1000 ), known = !!item.until && !isNaN( left );
		var box = find( item.id );
		if ( box ) box.SetHasClass( 'GSWDone', known && left <= 0 );
		left = Math.max( 0, left );
		var values = known ? [ String( Math.floor( left / 86400 ) ), pad( Math.floor( left % 86400 / 3600 ) ), pad( Math.floor( left % 3600 / 60 ) ), pad( left % 60 ) ] : [ '-', '--', '--', '--' ];
		for ( var u = 0; u < 4; u++ ) { set( item.id + '_' + UNITS[ u ] + 'n', values[ u ] ); set( item.id + '_' + UNITS[ u ] + 'c', words.units[ u ] ); }
	}
	// The words and the tooltips, once each: false while the panel is not there.
	function settle( item )
	{
		var panel = find( item.type === 'text' ? item.id + '_text' : item.type === 'label' ? item.id + '_label' : item.id );
		if ( !panel ) return false;
		if ( item.type === 'profile' ) { panel.SetPanelEvent( 'onactivate', profile ); return true; }
		if ( item.type !== 'tip' ) { panel.text = item.text; return true; }
		panel.SetPanelEvent( 'onmouseover', function () { $.DispatchEvent( 'UIShowTextTooltip', panel, item.text ); } );
		panel.SetPanelEvent( 'onmouseout', function () { $.DispatchEvent( 'UIHideTextTooltip', panel ); } );
		return true;
	}
	// The profile button: Valve's calls with the account an avatar of the local user knows (test 9, 2026-11-02, the way P6).
	function profile()
	{
		var avatar = find( 'GSWAccount' ), account = avatar ? avatar.accountid : 0;
		$.DispatchEvent( 'DOTAShowShowcasePage', account );
		$.Schedule( 0.5, function () { $.DispatchEvent( 'DOTAShowProfilePage', account ); } );
	}
	var waiting = [];
	for ( var i = 0; i < GSW_DATA.items.length; i++ )
	{
		var kind = GSW_DATA.items[ i ].type;
		if ( kind === 'text' || kind === 'label' || kind === 'btext' || kind === 'tip' || kind === 'profile' ) waiting.push( GSW_DATA.items[ i ] );
	}
	function tick()
	{
		if ( waiting.length )
		{
			var left = [];
			for ( var w = 0; w < waiting.length; w++ ) if ( !settle( waiting[ w ] ) ) left.push( waiting[ w ] );
			waiting = left;
		}
		var now = new Date();
		for ( var i = 0; i < GSW_DATA.items.length; i++ )
		{
			var item = GSW_DATA.items[ i ];
			if ( item.type === 'clock' ) clock( item, now );
			else if ( item.type === 'timer' ) timer( item, now );
			else if ( item.type === 'bclock' ) set( item.id, clockText( item, now ) );
			else if ( item.type === 'btimer' ) set( item.id, timerText( item, now ) );
		}
		$.Schedule( 1, tick );
	}
	tick();
})();
`;
const SCRIPT_HEAD = '// GridStudio (gridstudio.me): the texts, clocks, timers and tooltips of the main menu\'s widgets.\nvar GSW_DATA = ';
export const widgetScript = (data) => `${SCRIPT_HEAD}${asciiJSON(data)};\n${WIDGET_RUNTIME}`;
// The script's file: Valve's new compiled format (resource version 4, the text alone in DATA; scripts/panorama-laco.mjs).
// Since Dota's update of early November 2026 a script in the classic format (REDI) no longer ran from our home page,
// and every mod of d2pfx ships its scripts this way. widgetScriptText: the text of such a file, when the file is
// exactly what widgetScriptFile makes of it (the server's check), else null.
export const widgetScriptFile = (script) => newScript(WIDGET_SCRIPT, script);
export function widgetScriptText(bytes) {
  try {
    const data = readResource(bytes).blocks.find(([name]) => name === 'DATA')?.[1];
    if (!data) return null;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data), again = widgetScriptFile(text);
    return again.length === bytes.length && again.every((byte, i) => byte === bytes[i]) ? text : null;
  } catch { return null; }
}
// A script of a pack back to its data, when it is exactly ours (the server's check), else null.
export function widgetScriptData(text) {
  if (typeof text !== 'string' || !text.startsWith(SCRIPT_HEAD) || !text.endsWith(`;\n${WIDGET_RUNTIME}`)) return null;
  try {
    const data = JSON.parse(text.slice(SCRIPT_HEAD.length, text.length - WIDGET_RUNTIME.length - 2));
    return widgetScript(data) === text && cleanScriptData(data) ? data : null;
  } catch { return null; }
}
// The data a script may carry: the language and the items of the kinds above, each field of its kind.
function cleanScriptData(data) {
  if (!data || typeof data !== 'object' || !['ru', 'en'].includes(data.lang) || !Array.isArray(data.items) || data.items.length > WIDGET_LIMITS.count * (BLOCK_LIMITS.blocks + 1) || Object.keys(data).length !== 2) return false;
  const shapes = { clock: ['format', 'seconds', 'date', 'look'], timer: ['title', 'until', 'look'], text: ['text'], label: ['text'], btext: ['text'], bclock: ['format', 'seconds'], btimer: ['until'], tip: ['text'], profile: [] };
  return data.items.every((item) => item && /^GSW_w[a-z0-9]{1,12}(?:_b[a-z0-9]{1,12}(?:_[lt])?)?$/.test(item.id) && shapes[item.type]
    && JSON.stringify(Object.keys(item).sort()) === JSON.stringify(['id', 'type', ...shapes[item.type]].sort())
    && shapes[item.type].every((key) => ['format'].includes(key) ? ['12', '24'].includes(item[key]) : key === 'look' ? ['digital', 'round', 'cells', 'line'].includes(item[key]) : ['seconds', 'date'].includes(key) ? typeof item[key] === 'boolean'
      : key === 'until' ? item[key] === '' || /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(item[key]) : typeof item[key] === 'string' && item[key].length <= WIDGET_LIMITS.text));
}

export function widgetsPanorama(widgets, { media = {}, lang = 'ru' } = {}) {
  const list = cleanWidgets(widgets).filter((w) => !w.hidden && w.scene === 'menu' && ((w.type !== 'image' && w.type !== 'video') || media[`${w.type}:${w.props.media}`]));
  if (!list.length) return null;
  const panels = list.map((w) => `\t\t\t${widgetPanel(w, media)}`).join('\n');
  const moving = list.some((w) => w.type === 'custom' && w.props.design.blocks.some((b) => b.anim !== 'none' || b.hover || b.type === 'button'));
  // Valve's frontpage_shared.css, which the home page includes, collapses every MoviePanel of the page at low visual
  // quality (`.LowVisualQuality MoviePanel`; the second video test in Dota, 2026-11-01: every widget's video 0 × 0, even
  // Valve's own): a widget's video is the user's own choice, so it stays.
  const videos = list.some((w) => w.type === 'video' || (w.type === 'custom' && w.props.design.blocks.some((b) => b.type === 'video')));
  const style = `/* GridStudio: the main menu's widgets. */\n${block('#GridStudioWidgets', ['width: 100%;', 'height: 100%;'])}\n${block('.GSW', ['overflow: clip;'])}\n`
    + `${videos ? `${block('.LowVisualQuality #GridStudioWidgets MoviePanel', ['visibility: visible;'])}\n` : ''}${moving ? `${BLOCK_MOTION}\n` : ''}${list.map(widgetRules).join('\n')}`;
  const items = scriptItems(list);
  // A «Последний матч» in GridStudio's look: the menu pack gives Valve's stylesheet of the panel back with LASTMATCH_RULES.
  const lastMatch = list.some((w) => w.type === 'lastMatch' && w.props.look !== 'dota');
  // The local user's avatar, unseen, for «Мой профиль»'s account (the runtime's `profile`).
  const account = items.some((item) => item.type === 'profile') ? `\n\t\t\t<DOTAAvatarImage id="GSWAccount" accountid="local" hittest="false" />` : '';
  return { panels: panels + account, style: account ? `${style}\n${block('#GSWAccount', ['width: 1px;', 'height: 1px;', 'opacity: 0;'])}` : style,
    script: items.length ? widgetScript({ lang: lang === 'en' ? 'en' : 'ru', items }) : null, lastMatch };
}
// Valve's home page (or our copy of it) with the widgets: our style and script after Valve's, the widgets'
// panel as the page's first child (under the news column and everything else of the page).
export function widgetsHomePage(home, made) {
  let page = home.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${WIDGET_STYLE}" />$1</styles>`);
  if (page === home) throw new Error('В dashboard_page_home.xml не найден блок <styles>.');
  // The script as Valve's layouts name theirs: `.vjs`, the game finds the compiled `.vjs_c` (152 of their 154 includes).
  const script = `s2r://${WIDGET_SCRIPT.replace(/_c$/, '')}`;
  if (made.script) {
    const withScript = page.includes('<scripts>') ? page.replace(/(\n[ \t]*)<\/scripts>/, `$1\t<include src="${script}" />$1</scripts>`)
      : page.replace(/(<\/styles>)/, `$1\n\t<scripts>\n\t\t<include src="${script}" />\n\t</scripts>`);
    page = withScript;
  }
  const added = page.replace(/(<DOTAHomePage\b[^>]*>)/, `$1\n\t\t<Panel id="GridStudioWidgets" hittest="false">\n${made.panels}\n\t\t</Panel>`);
  if (added === page) throw new Error('В dashboard_page_home.xml не найдена страница DOTAHomePage.');
  return added;
}

// ——— A widget of one's own, made of blocks (2026-10-31, «Редактор виджета»: the owner chose blocks only, no code).
// A design is { name, size: [w, h], blocks: [block] } in its own pixels; a «custom» widget carries a copy of its
// design (props.design, and props.designId of the design in the user's library: src/customize/widget-designs.js)
// and is placed at the design's proportions, its blocks scaled with it. A block is { id, type, x, y, w, h,
// opacity, anim, hover, tip, props }: pictures, videos, texts, buttons, shapes, a progress bar, clocks, timers, and
// (2026-11-02) Dota's own: the user's avatar and name, a hero (a 3D model, the moving portrait or the picture).
// `tip`: a tooltip under the cursor (Valve's UIShowTextTooltip, from the script: the words may be any letters).
// Animations and hover use only properties Valve itself animates (scripts/hud-capture/plan.mjs VALVE_KEYFRAME_PROPS:
// a keyframe of another property is a fatal crash of Dota).
// min: a side of a block; 1 px since the templates' thin lines (2026-11-02).
export const BLOCK_LIMITS = Object.freeze({ blocks: 40, side: [16, 1920], min: 1, name: 60, tip: 100 });
export const BLOCK_ANIMS = Object.freeze(['none', 'appear', 'pulse', 'slide']);
export const BLOCK_TYPES = Object.freeze({
  image: { title: 'Картинка', icon: 'image', size: [160, 120], props: { media: '', fit: 'cover', radius: 0 } },
  video: { title: 'Видео / GIF', icon: 'film', size: [200, 120], props: { media: '', fit: 'cover', radius: 0 } },
  text: { title: 'Текст', icon: 'font', size: [220, 40], props: { text: 'Текст', size: 24, color: '#ffffff', weight: 'bold', align: 'left', shadow: true, upper: false, spacing: 0 } },
  button: { title: 'Кнопка', icon: 'link', size: [220, 48], props: { label: 'Кнопка', action: 'armory', url: '', fill: '#2a3038', color: '#ffffff', radius: 4, size: 16, upper: true, align: 'center', sound: '', hoverSound: false } },
  shape: { title: 'Фигура / градиент', icon: 'rect', size: [200, 120], props: { fill: '#0d0f18', fill2: '', direction: 'down', radius: 0, border: '', borderWidth: 0 } },
  progress: { title: 'Прогресс-бар', icon: 'gauge', size: [260, 12], props: { value: 60, fill: '#e8c66a', track: '#ffffff1a', radius: 6 } },
  clock: { title: 'Часы', icon: 'clock', size: [200, 60], props: { format: '24', seconds: false, size: 40, color: '#ffffff', align: 'left', weight: 'bold' } },
  timer: { title: 'Таймер до даты', icon: 'timer', size: [220, 48], props: { until: '', size: 32, color: '#ffffff', align: 'left', weight: 'bold' } },
  avatar: { title: 'Аватар', icon: 'user', size: [96, 96], props: { radius: 48, border: '', borderWidth: 0 } },
  nickname: { title: 'Ник', icon: 'idCard', size: [260, 40], props: { size: 26, color: '#ffffff', weight: 'bold', align: 'left', shadow: true, upper: false } },
  hero: { title: 'Герой', icon: 'heroes', size: [240, 320], props: { hero: 'lina', view: 'model', rotate: true } }
});
// A button's sound when pressed: Valve's own of its menus (the `sound` of their styles), and the soft one of their tabs under the cursor.
export const BLOCK_SOUNDS = Object.freeze({
  click: { title: 'Щелчок кнопки', sound: 'ui_generic_button_click' },
  menu: { title: 'Вкладка меню', sound: 'ui_topmenu_activate' },
  soft: { title: 'Тихий щелчок', sound: 'ui_rollover_micro' },
  slide: { title: 'Выезд окна', sound: 'ui_custom_lobby_dialog_slide' },
  friends: { title: 'Список друзей', sound: 'ui_friends_slide_in' },
  reward: { title: 'Награда', sound: 'HeroBadgeLevelUpReward.ShowReward' },
  relic: { title: 'Реликвия', sound: 'Relic.Received' },
  card: { title: 'Карточка', sound: 'playercard.dust_to_pack' }
});
const HOVER_SOUND = 'ui_rollover_micro';
// The heroes a hero block may show (Valve's names, as in npc_dota_hero_<name>), and how.
export const BLOCK_HEROES = Object.freeze([...new Set(Object.values(HEROES).map((hero) => hero.name))].sort());
export const HERO_VIEWS = Object.freeze(['model', 'movie', 'image']);
export const BLOCK_TYPE_IDS = Object.freeze(Object.keys(BLOCK_TYPES));
const ALIGNS = ['left', 'center', 'right'], WEIGHTS = ['normal', 'bold', 'black'];
const hexA = (value, fallback) => (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(String(value)) ? String(value).toLowerCase() : fallback);

export function newBlock(type, { x = 0, y = 0, id = null } = {}) {
  const def = BLOCK_TYPES[type];
  if (!def) throw new Error(`Нет блока ${type}`);
  return cleanBlock({ id: id || `b${Math.random().toString(36).slice(2, 8)}`, type, x, y, w: def.size[0], h: def.size[1], opacity: 100, anim: 'none', hover: false, tip: '', props: { ...def.props } }, [1920, 1023]);
}
// One block inside a design of `size`: known fields, inside the design, each prop of its kind.
export function cleanBlock(input, size) {
  const value = input && typeof input === 'object' ? input : {}, def = BLOCK_TYPES[value.type];
  if (!def) return null;
  const [W, H] = size, w = clamp(round(value.w), BLOCK_LIMITS.min, W), h = clamp(round(value.h), BLOCK_LIMITS.min, H);
  const p = { ...def.props, ...(value.props && typeof value.props === 'object' ? value.props : {}) }, props = {};
  for (const key of Object.keys(def.props)) props[key] = p[key];
  if (value.type === 'image' || value.type === 'video') Object.assign(props, { media: /^[a-f0-9]{64}$/.test(String(props.media)) ? props.media : '', fit: oneOf(props.fit, ['cover', 'contain'], 'cover'), radius: clamp(round(props.radius), 0, 256) });
  if (value.type === 'text') Object.assign(props, { text: line(props.text, WIDGET_LIMITS.text), size: clamp(round(props.size), 8, 160), color: hexA(props.color, '#ffffff'), weight: oneOf(props.weight, WEIGHTS, 'bold'),
    align: oneOf(props.align, ALIGNS, 'left'), shadow: !!props.shadow, upper: !!props.upper, spacing: clamp(round(props.spacing), 0, 20) });
  if (value.type === 'button') {
    const action = oneOf(props.action, Object.keys(WIDGET_ACTIONS), 'armory');
    Object.assign(props, { label: line(props.label, WIDGET_LIMITS.label) || WIDGET_ACTIONS[action].title, action, url: action === 'link' ? widgetLink(props.url) : '', fill: hexA(props.fill, '#2a3038'),
      color: hexA(props.color, '#ffffff'), radius: clamp(round(props.radius), 0, 128), size: clamp(round(props.size), 8, 96), upper: !!props.upper,
      align: oneOf(props.align, ALIGNS, 'center'), sound: oneOf(props.sound, Object.keys(BLOCK_SOUNDS), ''), hoverSound: !!props.hoverSound });
  }
  if (value.type === 'shape') Object.assign(props, { fill: hexA(props.fill, '#0d0f18'), fill2: props.fill2 ? hexA(props.fill2, '') : '', direction: oneOf(props.direction, ['down', 'right', 'diagonal'], 'down'),
    radius: clamp(round(props.radius), 0, 512), border: props.border ? hexA(props.border, '') : '', borderWidth: clamp(round(props.borderWidth), 0, 16) });
  if (value.type === 'progress') Object.assign(props, { value: clamp(round(props.value), 0, 100), fill: hexA(props.fill, '#e8c66a'), track: hexA(props.track, '#ffffff1a'), radius: clamp(round(props.radius), 0, 64) });
  if (value.type === 'clock') Object.assign(props, { format: oneOf(props.format, ['24', '12'], '24'), seconds: !!props.seconds, size: clamp(round(props.size), 8, 200), color: hexA(props.color, '#ffffff'),
    align: oneOf(props.align, ALIGNS, 'left'), weight: oneOf(props.weight, WEIGHTS, 'bold') });
  if (value.type === 'timer') Object.assign(props, { until: /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(String(props.until)) ? props.until : '', size: clamp(round(props.size), 8, 200), color: hexA(props.color, '#ffffff'),
    align: oneOf(props.align, ALIGNS, 'left'), weight: oneOf(props.weight, WEIGHTS, 'bold') });
  if (value.type === 'avatar') Object.assign(props, { radius: clamp(round(props.radius), 0, 512), border: props.border ? hexA(props.border, '') : '', borderWidth: clamp(round(props.borderWidth), 0, 16) });
  if (value.type === 'nickname') Object.assign(props, { size: clamp(round(props.size), 8, 160), color: hexA(props.color, '#ffffff'), weight: oneOf(props.weight, WEIGHTS, 'bold'),
    align: oneOf(props.align, ALIGNS, 'left'), shadow: !!props.shadow, upper: !!props.upper });
  if (value.type === 'hero') Object.assign(props, { hero: oneOf(props.hero, BLOCK_HEROES, 'lina'), view: oneOf(props.view, HERO_VIEWS, 'model'), rotate: !!props.rotate });
  return { id: /^b[a-z0-9]{1,12}$/.test(String(value.id)) ? value.id : `b${Math.random().toString(36).slice(2, 8)}`, type: value.type,
    x: clamp(round(value.x), 0, W - w), y: clamp(round(value.y), 0, H - h), w, h, opacity: clamp(round(value.opacity ?? 100), 0, 100),
    anim: oneOf(value.anim, BLOCK_ANIMS, 'none'), hover: !!value.hover, tip: line(value.tip, BLOCK_LIMITS.tip), props };
}
// A design: its name, size and blocks (the first is lowest), each block checked; ids unique.
export function cleanDesign(input) {
  const value = input && typeof input === 'object' ? input : {}, [lo, hi] = BLOCK_LIMITS.side;
  const raw = Array.isArray(value.size) ? value.size : [330, 484], size = [clamp(round(raw[0]), lo, hi), clamp(round(raw[1]), lo, WIDGET_SCREEN.height - WIDGET_SCREEN.top)];
  const blocks = [], ids = new Set();
  for (const item of Array.isArray(value.blocks) ? value.blocks : []) {
    const block = cleanBlock(item, size);
    if (!block) continue;
    while (ids.has(block.id)) block.id = `b${Math.random().toString(36).slice(2, 8)}`;
    ids.add(block.id); blocks.push(block);
    if (blocks.length >= BLOCK_LIMITS.blocks) break;
  }
  return { name: line(value.name, BLOCK_LIMITS.name) || 'Мой виджет', size, background: value.background ? hexA(value.background, '') : '', radius: clamp(round(value.radius), 0, 128), blocks };
}
// The media of a design's blocks (their keys).
export const designMedia = (design) => [...new Set(cleanDesign(design).blocks.filter((b) => (b.type === 'image' || b.type === 'video') && b.props.media).map((b) => b.props.media))];
