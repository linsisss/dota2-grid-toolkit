// The main-menu capture (plan of 2026-10-17): Dota renders every pixel of the site's main-menu preview,
// the way the HUD capture did the match HUD (docs/hud-capture/README.md). The menu background builder's
// own route (scripts/menu-background.mjs: dashboard.xml's override-background names our layout) puts a
// full-screen panel of ours under the whole dashboard; here it cycles black / white / grey, and opacity
// tracks make each part of the menu («Кнопки меню» buttons, the top bar, the friends rail, the profile
// card, the party bar, the chat, ИГРАТЬ, the news cards) show alone, all together or not at all, in a
// fixed schedule. Probe squares on our backdrop panel carry the schedule's state as a binary code, so
// every frame says which state it was taken in. A watcher (tools/menu-capture/gs-menu-capture.ps1)
// grabs Dota's window itself (tools/capture-common; Steam's F12 only with -Steam); the solver
// (scripts/menu-capture-solve.mjs) takes per-part K/W plates.
// Two packs, one Dota launch each, both pak02_dir.vpk (the menu builder's pack; pak02 beats pak03):
//   M1  the parts one by one (23 states of 6 s, a 138-s cycle, run twice: ~4.6 min of F12);
//   V1  production's own «Кнопки меню» rules (visibility: collapse via menuBackgroundPack) for one set of
//       hidden buttons and one hidden news card: the closed-up bar and column as Dota lays them out (~1.3 min).
// Lessons of the HUD capture kept here: only properties Valve animates go into @keyframes
// (VALVE_KEYFRAME_PROPS; Dota fatal-crashes otherwise), one animation per panel, no comma lists; colours
// other than 0 and 255 are not exact on the screen (Panorama decodes CSS colours with gamma 2.2: #808080
// shows as 129), so the probe code uses 0/255 channels only; the grab (like Steam's screenshots) has no cursor.
import {
  COL, EPS, VALVE_KEYFRAME_PROPS, auditSelectors, checkCss, keyframes, layoutIndex, merge, num, parseKeyframes, parseRules, rule, selectorTokens, styleIndex
} from '../hud-capture/plan.mjs';

export { VALVE_KEYFRAME_PROPS, checkCss, parseKeyframes, parseRules, selectorTokens, layoutIndex, styleIndex, auditSelectors };

const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export const PLAN_ID = 'menu-capture 2026-10-17 r1';
export const SCREEN = freeze({ width: 1920, height: 1080 });

// ---- Files ----
// Our capture style, included at the end of the <styles> of each layout that declares a toggled panel.
export const CAPTURE_STYLE = 'panorama/styles/gridstudio_menu_capture.vcss_c';
// The background's layout and style: the very paths the menu background builder uses (MENU_LAYOUT /
// MENU_STYLE), so the dashboard loads them the way it loads the owner's own background.
import { MENU_LAYOUT, MENU_STYLE, MENU_HIDE, MENU_HIDE_STYLE, HOME_STYLE } from '../menu-background.mjs';
export { MENU_LAYOUT, MENU_STYLE, MENU_HIDE, MENU_HIDE_STYLE, HOME_STYLE };
export const DASHBOARD = 'panorama/layout/dashboard.vxml_c';
export const HOME = 'panorama/layout/dashboard_page_home.vxml_c';
export const FRIENDS = 'panorama/layout/friend_menu.vxml_c';
// Valve's text files a pack starts from (dota_vpk_updates paths; repo copies in assets/dota-menu).
export const VALVE_LAYOUTS = freeze({
  dashboard: 'panorama/layout/dashboard.xml', home: 'panorama/layout/dashboard_page_home.xml', friends: 'panorama/layout/friend_menu.xml',
  // Read only, for the selector audit (not replaced: it includes .vts scripts, which no replaced layout of
  // ours has had yet, so it stays Valve's).
  frontpage: 'panorama/layout/frontpage_contents.xml'
});
export const SCOPE_FILE = freeze({ dashboard: DASHBOARD, home: HOME, friends: FRIENDS });

// ---- Timing ----
// The backdrop: K, W, G, 1.5 s each (a 4.5-s cycle), on its own panel's clock.
export const SLOT = 1.5;
export const BACKDROP = freeze(['K', 'W', 'G']);
export const BACKDROP_PERIOD = BACKDROP.length * SLOT;
// One schedule state: g1 guard, core, g2 guard. The probe code marks the part; the solver decides every
// frame's parts from its pixels anyway (each toggled panel runs its own clock).
export const GUARD = 0.75, CORE = 4.5, HOLD = GUARD + CORE + GUARD;
export const PARTS = freeze(['core', 'g1', 'g2']);

// ---- The parts (groups) ----
// id, Russian title, lane (where on the screen), selectors (each runs the group's one track), scope (the
// layout that declares the panels: our style is included there), hide (the MENU_HIDE key it answers to),
// parent (a group that must be on for this one to show), rect (expected footprint at 1920 × 1080 from the
// preview's geometry, x1/y1 exclusive; only a hint for the report — the solver measures).
export const GROUPS = freeze([
  // The top bar. #TopBarBackground is one picture with the tab separators painted in (dashboard.css), so
  // it is its own part; each button above it is another.
  { id: 'bar', title: 'Верхняя панель (подложка)', lane: 'top', scope: 'dashboard', selectors: ['#TopBarBackground'], rect: [0, 0, 1920, 112] },
  { id: 'home', title: 'Логотип Dota (вкладка «Главная»)', lane: 'top', scope: 'dashboard', selectors: ['#TopBarHome', '#HomeButtonMap'], rect: [180, 0, 600, 200] },
  { id: 'left', title: 'Настройки и стрелки', lane: 'top', scope: 'dashboard', selectors: ['#TopBarLeftButtons'], rect: [0, 0, 200, 64] },
  { id: 'heroes', title: 'Герои', lane: 'top', scope: 'dashboard', selectors: ['#TopBarHeroes'], rect: [380, 0, 560, 64] },
  { id: 'collection', title: 'Арсенал', lane: 'top', scope: 'dashboard', hide: 'collection', selectors: ['#TopBarCollection'], rect: [540, 0, 725, 64] },
  { id: 'watch', title: 'Просмотр', lane: 'top', scope: 'dashboard', hide: 'watch', selectors: ['#TopBarWatch'], rect: [705, 0, 890, 64] },
  { id: 'learn', title: 'База знаний', lane: 'top', scope: 'dashboard', hide: 'learn', selectors: ['#TopBarLearn'], rect: [870, 0, 1056, 64] },
  { id: 'mods', title: 'Игротека', lane: 'top', scope: 'dashboard', hide: 'mods', selectors: ['#TopBarMods'], rect: [1036, 0, 1220, 64] },
  { id: 'shards', title: 'Осколки', lane: 'top', scope: 'dashboard', hide: 'shards', selectors: ['#ShardsButton'], rect: [1478, 0, 1639, 64] },
  { id: 'mail', title: 'Уведомления (конверт)', lane: 'top', scope: 'dashboard', selectors: ['#DOTANotificationButton'], rect: [1619, 0, 1714, 64] },
  { id: 'armory', title: 'Сокровищница', lane: 'top', scope: 'dashboard', hide: 'armory', selectors: ['#TopBarArmory'], rect: [1694, 0, 1788, 64] },
  { id: 'plus', title: 'Dota Plus', lane: 'top', scope: 'dashboard', hide: 'plus', selectors: ['#TopBarPlus', '#PlusButtonParticlesOverlay'], rect: [1460, 0, 1861, 72] },
  { id: 'quit', title: 'Выход', lane: 'top', scope: 'dashboard', selectors: ['#DOTAQuitButton'], rect: [1841, 0, 1920, 64] },
  // The left rail: the whole friends menu (its translucent ground), then the profile card and the list
  // inside it (friend_menu.xml, a layout of its own: our style is included there too).
  { id: 'rail', title: 'Панель друзей (подложка)', lane: 'left', scope: 'dashboard', selectors: ['#FriendMenuContainer'], rect: [8, 76, 422, 1014] },
  { id: 'profile', title: 'Карточка профиля', lane: 'left', scope: 'friends', parent: 'rail', selectors: ['.MiniShowcaseContainer'], rect: [32, 100, 398, 300] },
  { id: 'friends', title: 'Список друзей и поиск', lane: 'left', scope: 'friends', parent: 'rail', selectors: ['#FriendsPanelHeader', '#FriendPanelFriendsList', '#RecentTreasures', '#FriendsPanelOverwatchNotification'], rect: [32, 280, 398, 990] },
  { id: 'social', title: 'Группа (внизу слева)', lane: 'left', scope: 'dashboard', selectors: ['#SocialControls'], rect: [32, 989, 420, 1059] },
  // The bottom and the right.
  { id: 'chat', title: 'Строка чата', lane: 'bottom', scope: 'dashboard', selectors: ['#Chat'], rect: [590, 990, 1330, 1066] },
  { id: 'play', title: 'ИГРАТЬ', lane: 'bottom', scope: 'dashboard', selectors: ['#Play'], rect: [1520, 995, 1875, 1066] },
  // The news column's two cells (frontpage_contents.xml inside the home page; our style is included in the
  // home page, as production's own news toggle is).
  { id: 'carnival', title: 'Новости: Dark Carnival', lane: 'right', scope: 'home', hide: 'news.carnival', selectors: ['#FrontpageContents DOTAFrontpageCellDarkCarnival'], rect: [1484, 52, 1910, 632] },
  { id: 'season', title: 'Новости: Диковинки Квортеро', lane: 'right', scope: 'home', hide: 'news.season', selectors: ['#FrontpageContents #QuarteroCell'], rect: [1484, 552, 1910, 882] }
]);
export const GROUP_IDS = freeze(GROUPS.map((g) => g.id));
export const group = (id) => GROUPS.find((g) => g.id === id) || null;
// A group and the parents it needs on.
export const withParents = (id) => { const out = []; for (let g = group(id); g; g = g.parent ? group(g.parent) : null) out.unshift(g.id); return out; };

// ---- M1: every part alone, all, none ----
// Consecutive solo states sit apart on the screen (their expected places do not touch), so if two panels'
// clocks drift, the overlap of their windows is still two separate regions.
export const M1_ORDER = freeze(['ALL', 'NONE', 'bar', 'play', 'heroes', 'rail', 'collection', 'chat', 'watch', 'profile', 'learn', 'carnival', 'mods',
  'friends', 'shards', 'social', 'mail', 'season', 'armory', 'home', 'plus', 'left', 'quit']);
const stateOf = (id) => (id === 'ALL' ? { id, on: [...GROUP_IDS] } : id === 'NONE' ? { id, on: [] } : { id, on: withParents(id), solo: id });
export const M1_STATES = freeze(M1_ORDER.map((id, index) => ({ index, ...stateOf(id) })));
export const M1_PERIOD = M1_STATES.length * HOLD;

// ---- V1: production's hide rules ----
// Hidden with production's own files (menuBackgroundPack): three top bar buttons and the Dark Carnival
// card. From the closed-up bar: the widths of collection and learn (watch and mods move left by them) and
// of plus (shards, mail and armory move right by it); from the column: where the Quartero card goes.
export const V1_HIDE = freeze(['collection', 'learn', 'plus']);
export const V1_NEWS = freeze({ carnival: false, season: true });
// Its states: everything; the buttons without the bar's picture; nothing; the picture alone. The rest of
// the menu (rail, party, chat, ИГРАТЬ, the pages) shows in all but NONE.
export const V1_TRACKS = freeze({
  bar: ['#TopBarBackground'],
  buttons: GROUPS.filter((g) => g.lane === 'top' && g.id !== 'bar').flatMap((g) => g.selectors),
  rest: ['#FriendMenuContainer', '#SocialControls', '#Chat', '#Play', '#DashboardPages']
});
export const V1_STATES = freeze([
  { index: 0, id: 'ALL', on: ['bar', 'buttons', 'rest'] }, { index: 1, id: 'BUTTONS', on: ['buttons', 'rest'] },
  { index: 2, id: 'NONE', on: [] }, { index: 3, id: 'BAR', on: ['bar', 'rest'] }
]);
export const V1_PERIOD = V1_STATES.length * HOLD;

// ---- Probes (on our backdrop panel, in the free middle of the home page) ----
// Backdrop points: nothing of the menu is ever drawn there on the home page.
// Code rows: four 20-px squares, 0/255 per channel (3 bits each): squares 0–2 hold the word
// state | part << 5 | pack << 7 as v0, v1, v2, square 3 a check (v0 + 3·v1 + 5·v2 + 1) mod 8 (odd weights:
// any one wrong channel fails it). Two rows, so one
// covered row (a popup) does not lose the frame. Toggle points: where the top bar's picture and the
// rail's ground are (both cover them in ALL, neither in NONE), read over white.
export const PROBES = freeze({
  free: [[560, 300], [1350, 300], [700, 600], [1300, 700]],
  size: 20,
  rows: [{ x: 880, y: 290 }, { x: 1080, y: 600 }],
  pitch: 30,
  squares: 4,
  toggles: { bar: [700, 20], rail: [200, 600] }
});
export const PACK_CODES = freeze({ M1: 1, V1: 2 });
export const codeWord = (state, part, pack) => {
  if (!(state >= 0 && state < 32) || !(part >= 0 && part < 3) || !(pack >= 1 && pack < 4)) throw new Error(`code ${state}/${part}/${pack}`);
  return state | (part << 5) | (pack << 7);
};
export const codeCheck = (v0, v1, v2) => (v0 + 3 * v1 + 5 * v2 + 1) % 8;
// The four squares' 3-bit values of a code.
export const codeSquares = (state, part, pack) => { const w = codeWord(state, part, pack), v = [w & 7, (w >> 3) & 7, (w >> 6) & 7]; return [...v, codeCheck(...v)]; };
export const squareColour = (v) => `#${v & 1 ? 'ff' : '00'}${v & 2 ? 'ff' : '00'}${v & 4 ? 'ff' : '00'}ff`;
// Four squares' RGB back to { state, part, pack } (channels within tol of 0 or 255), or null.
export function decodeSquares(rgbs, tol = 8) {
  const vals = [];
  for (const rgb of rgbs) {
    let v = 0;
    for (let c = 0; c < 3; c++) {
      if (rgb[c] >= 255 - tol) v |= 1 << c; else if (rgb[c] > tol) return null;
    }
    vals.push(v);
  }
  const word = vals[0] | (vals[1] << 3) | (vals[2] << 6), state = word & 31, part = (word >> 5) & 3, pack = word >> 7;
  if (part > 2 || pack < 1 || codeCheck(vals[0], vals[1], vals[2]) !== vals[3]) return null;
  return { state, part, pack };
}

// ---- The watcher ----
// F12 every 0.75 s (±0.08). M1 is done when every state's core has K and W frames (ALL and NONE also G)
// after 1.5 cycles, at the latest after two cycles and 10 s; V1 when its four states have K, W and G
// after 48 s, at the latest after 80 s. A frame counts when its probe code is the pack's.
export const WATCHER = freeze({ interval: 0.75, jitter: 0.08, m1: { min: 1.5 * M1_PERIOD, cap: 2 * M1_PERIOD + 10, gRequired: ['ALL', 'NONE'] },
  v1: { min: 48, cap: 80, gRequired: ['ALL', 'BUTTONS', 'NONE', 'BAR'] }, noFrameWarn: 420, toggleAfter: M1_PERIOD + 10 });

// ---- CSS and layouts ----
const BG = 'GridStudioBackground';
// A writer of tracks, as the HUD plan's: one @keyframes per track, one animation per panel.
function packWriter() {
  const tracks = new Map();
  const track = (name, property, segments, period) => {
    const k = keyframes(name, property, segments);
    if (period !== undefined && Math.abs(k.period - period) > 1e-9) throw new Error(`${name}: period ${k.period}s, the plan says ${period}s`);
    if (tracks.has(name)) throw new Error(`${name}: two tracks of one name`);
    tracks.set(name, { ...k, selectors: [] });
    return k;
  };
  const animated = (selectors, a, extra = []) => {
    if (Array.isArray(a)) throw new Error('one animation per panel');
    tracks.get(a.name).selectors.push(...selectors);
    return rule(selectors, [...extra, `animation-name: ${a.name}`, `animation-duration: ${num(a.period)}s`, 'animation-timing-function: linear', 'animation-iteration-count: infinite']);
  };
  const list = () => [...tracks.values()].map(({ name, property, period, segments, selectors }) => ({ name, property, period, segments, selectors }));
  return { track, animated, list };
}
// Per state, three segments (g1, core, g2) of one value, or of three values (the probe code).
const perState = (states, value) => merge(states.flatMap((s) => [[GUARD, value(s, 1)], [CORE, value(s, 0)], [GUARD, value(s, 2)]]));
const trackName = (id) => `GSMenu${id.replace(/(^|[-_.])([a-z])/g, (_, __, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '')}`;

// The background layout: the backdrop panel and the probe squares, all ours (ASCII, no handlers).
export function backgroundLayout() {
  const squares = PROBES.rows.flatMap((_, r) => Array.from({ length: PROBES.squares }, (__, i) => `\t\t<Panel id="GSProbe${r}${i}" class="GSProbe" hittest="false" />`));
  return `<root>
	<styles>
		<include src="s2r://panorama/styles/dotastyles.vcss_c" />
		<include src="s2r://${MENU_STYLE}" />
	</styles>
	<Panel class="${BG}" hittest="false">
		<Panel id="GSBackdrop" hittest="false" />
${squares.join('\n')}
	</Panel>
</root>
`;
}
// Its style: the backdrop track and the code tracks (one per square position; both rows run them).
export function backgroundStyle(packId, states) {
  const w = packWriter(), pack = PACK_CODES[packId], period = states.length * HOLD;
  const backdrop = w.track('GSBackdrop', 'background-color', BACKDROP.map((b) => [SLOT, COL[b]]), BACKDROP_PERIOD);
  const css = [`/* GridStudio main-menu capture ${packId} (not for play): the backdrop under the whole menu and the probe code. */`,
    rule([`.${BG}`], ['width: 100%', 'height: 100%', 'background-color: #000000ff']),
    w.animated(['#GSBackdrop'], backdrop, ['width: 100%', 'height: 100%', 'background-color: #000000ff']), backdrop.text,
    rule(['.GSProbe'], [`width: ${PROBES.size}px`, `height: ${PROBES.size}px`, 'horizontal-align: left', 'vertical-align: top', 'background-color: #000000ff'])];
  for (let i = 0; i < PROBES.squares; i++) {
    const k = w.track(`GSCode${i}`, 'background-color', perState(states, (s, part) => squareColour(codeSquares(s.index, part, pack)[i])), period);
    css.push(...PROBES.rows.map((row, r) => w.animated([`#GSProbe${r}${i}`], k, [`margin-left: ${row.x + i * PROBES.pitch}px`, `margin-top: ${row.y}px`])), k.text);
  }
  const text = css.join('\n\n') + '\n';
  checkCss(`${packId} background style`, text);
  return { text, tracks: w.list() };
}

// Panels that could show something by themselves while the owner waits (toasts, tips, tooltips, hover
// menus, the find-match particles): static opacity 0, nothing animated. Popups stay (the owner closes them).
export const NOISE = freeze(['#ToastManager', '#Tooltips', '#HelpTipsManager', '#DashboardBackgroundStatus', '#PlusMenuContainer', '#NotificationsContainer',
  '#RecentArmoryItemsMenuContainer', '#ShardsMenuContainer', '#GuildStatusContainer', '#CoachingMenuContainer', '#SteamNotificationsPlaceholder']);
// Valve's endless loops on the home page, stopped (animation-name: none: the base look), so a part's K
// and W frames match. [our selector, Valve's selector, Valve's animation].
export const FREEZE = freeze([
  ['DOTADashboard #DOTANotificationButton .NotificationButtonAlert', '.NotificationButtonAlert', 'pulsealert'],
  ['DOTADashboard #DOTANotificationButton #NotificationButtonCount', '#NotificationButtonCount', 'pulseglow'],
  ['DOTADashboard #SocialControls #GuildsViolator', '#GuildsViolator', 'GuildsViolatorAnimation'],
  ['DOTADashboard #SocialControls #OpenPartyFrame1', '#OpenPartyFrame1', 'OpenParty1'],
  ['DOTADashboard #SocialControls #OpenPartyFrame2', '#OpenPartyFrame2', 'OpenParty2'],
  ['DOTADashboard #SocialControls #OpenPartyFrame3', '#OpenPartyFrame3', 'OpenParty3']
]);
// Valve's loops on the dashboard and its home page left running, and why.
export const FREEZE_SKIP = freeze({
  CompendiumNavSwipeLeft: 'only on a compendium page', CompendiumNavSwipeRight: 'only on a compendium page',
  NotificationPopup: 'plays once (#OpenPartyNotification)', pulseglow: '.OverwatchLogoIcon too: only with an Overwatch case (#FriendsPanelOverwatchNotification hidden by HideOverwatch)',
  OrbMotion: '.InvokerSceneOrb: not in the current news cells'
});
const freezeCss = () => rule(FREEZE.map(([ours]) => ours), ['animation-name: none']);
const noiseCss = () => rule(NOISE.map((s) => `DOTADashboard ${s}`), ['opacity: 0']);

// M1's capture style: one opacity track per group (on in the states that have it).
export function m1CaptureStyle() {
  const w = packWriter(), css = ['/* GridStudio main-menu capture M1 (not for play): each part of the menu alone, all, none. */', noiseCss(), freezeCss()];
  for (const g of GROUPS) {
    const k = w.track(trackName(g.id), 'opacity', perState(M1_STATES, (s) => (s.on.includes(g.id) ? '1' : '0')), M1_PERIOD);
    css.push(w.animated(g.selectors, k), k.text);
  }
  const text = css.join('\n\n') + '\n';
  checkCss('M1 capture style', text);
  return { text, tracks: w.list() };
}
// V1's capture style: three tracks (bar picture, buttons, the rest).
export function v1CaptureStyle() {
  const w = packWriter(), css = ['/* GridStudio main-menu capture V1 (not for play): production\'s hidden buttons and news card, over the backdrop. */', noiseCss(), freezeCss()];
  for (const [id, selectors] of Object.entries(V1_TRACKS)) {
    const k = w.track(trackName(`v-${id}`), 'opacity', perState(V1_STATES, (s) => (s.on.includes(id) ? '1' : '0')), V1_PERIOD);
    css.push(w.animated(selectors, k), k.text);
  }
  const text = css.join('\n\n') + '\n';
  checkCss('V1 capture style', text);
  return { text, tracks: w.list() };
}

// ---- Valve's layouts, edited ----
const once = (text, find, replace, what) => {
  if (text.split(find).length !== 2) throw new Error(`${what}: не найдено место для правки (${find.trim().slice(0, 60)})`);
  return text.replace(find, () => replace);
};
// Our capture style at the end of a layout's <styles> (after Valve's and any production style there).
export function withCaptureStyle(layout, what) {
  const end = /(\n[ \t]*)<\/styles>/;
  if (!end.test(layout)) throw new Error(`${what}: нет блока <styles>`);
  return layout.replace(end, (m, indent) => `${indent}\t<include src="s2r://${CAPTURE_STYLE}" />${indent}</styles>`);
}
// The rules every file of ours keeps (as menuBackgroundPack's panoramaFile): ASCII; no event handlers in
// a layout at a new path; Valve's layouts we give back keep theirs.
export function checkPanoramaFile(path, text, valve = false) {
  if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII в ${path}: Dota не загрузит меню.`);
  if (!valve && path.endsWith('.vxml_c') && /\son[a-z]+="/.test(text)) throw new Error(`Обработчик событий в новой разметке ${path}: Dota не загрузит меню.`);
  if (path.endsWith('.vcss_c')) checkCss(path, text);
  return true;
}

// Selectors of ours, and the tokens only C++ makes (types and runtime ids Valve's styles name).
export function captureSelectors() {
  return [...new Set([...GROUPS.flatMap((g) => g.selectors), ...Object.values(V1_TRACKS).flat(), ...NOISE.map((s) => `DOTADashboard ${s}`), ...FREEZE.map(([ours]) => ours)])];
}
export const RUNTIME_TOKENS = freeze([]);

// ---- What the watcher and the solver read ----
export function planSnapshot(extra = {}) {
  const states = (list) => list.map(({ index, id, on, solo }) => ({ index, id, on, ...(solo ? { solo } : {}) }));
  return {
    plan: PLAN_ID, screen: SCREEN, slot: SLOT, eps: EPS, colours: COL,
    backdrop: { order: BACKDROP, period: BACKDROP_PERIOD, track: 'GSBackdrop' },
    hold: HOLD, guard: GUARD, core: CORE, parts: PARTS,
    groups: GROUPS.map((g) => ({ id: g.id, title: g.title, lane: g.lane, scope: g.scope, selectors: g.selectors, ...(g.hide ? { hide: g.hide } : {}), ...(g.parent ? { parent: g.parent } : {}), rect: g.rect })),
    probes: PROBES, packCodes: PACK_CODES,
    packs: [
      { id: 'M1', code: PACK_CODES.M1, role: 'main', period: M1_PERIOD, states: states(M1_STATES), seconds: [Math.round(WATCHER.m1.min), Math.round(WATCHER.m1.cap)] },
      { id: 'V1', code: PACK_CODES.V1, role: 'hide', period: V1_PERIOD, states: states(V1_STATES), tracks: V1_TRACKS, hide: V1_HIDE, news: V1_NEWS, seconds: [WATCHER.v1.min, WATCHER.v1.cap] }
    ],
    queue: ['M1', 'V1'], watcher: WATCHER, ...extra
  };
}
