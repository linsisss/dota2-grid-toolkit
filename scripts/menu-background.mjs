import { buildVPK, panoramaResource } from './vpk.mjs';

// A Dota 2 main-menu background pack: pakNN_dir.vpk for a game/dota_<language>/ folder.
// The dashboard's background manager loads whatever layout its override-background names (Valve
// itself points it at a seasonal layout file). The pack replaces dashboard.vxml_c with Valve's
// current layout (assets/dota-menu/dashboard.xml) naming our layout instead, and our layout plays
// the user's video full screen. With `clean`, the home page loses its right-hand news/event
// column (Valve's dashboard_page_home.xml without #TodayPages), so nothing covers the video.
// With `event` (1.6.4), Valve's own background, the season event where rewards are claimed, stays
// one click away: see menuEvent below. With `profile` (1.6.4), players' profiles get buttons to their
// Stratz and Dotabuff pages: see profilePage below. With `grid` (1.6.4), the «Герои» page (the hero
// grid) gets a background of its own or a darker one: see gridPage below.
// The browser converts the upload (src/customize/menu-video.js); these are its bounds. Dota shows
// a black menu for very big videos, so the WebM aims at videoBytes whatever the input size, and one
// over maxVideoBytes (noise and grain make the encoder overshoot its target) is encoded again.
export const MENU_LIMITS = Object.freeze({ bytes: 50_000_000, seconds: 30, videoBytes: 12_000_000, maxVideoBytes: 14_000_000, bitrate: 4_000_000 });
export const MENU_SIZES = Object.freeze({ '16:9': [1920, 1080], '16:10': [1920, 1200], '21:9': [2560, 1080], '4:3': [1440, 1080] });
// A video's piece (seconds from its first frame): inside the video, at most MENU_LIMITS.seconds,
// at least MIN_PIECE; `moved` is the edge the user moved, the other one gives way.
export const MIN_PIECE = 1;
export function fitPiece({ start, end }, duration, moved) {
  const limit = Math.min(MENU_LIMITS.seconds, duration);
  start = Math.max(0, Math.min(start, duration - MIN_PIECE)); end = Math.min(duration, Math.max(end, start + MIN_PIECE));
  if (end - start > limit) moved === 'start' ? end = start + limit : start = end - limit;
  return { start, end };
}
// How long the clip in the pack is: a crossfade of f seconds takes f off (at most a third).
export const pieceLength = ({ start, end }, crossfade) => Math.max(0, end - start - Math.min(crossfade, (end - start) / 3));
// Blur and dim over the background, baked into the video (and shown the same way in the preview).
// Blur is a Gaussian σ of up to MENU_EFFECTS.blur pixels at 1080 lines, so it looks the same on
// every screen; dim is a black veil of up to MENU_EFFECTS.dim. A blurred picture is enlarged by
// 2.5σ on each side, so the blur does not pull black in at the edges.
export const MENU_EFFECTS = Object.freeze({ blur: 24, dim: 0.8 });
export function menuLook({ blur = 0, dim = 0 } = {}, height = 1080) {
  const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const sigma = clamp(blur) * MENU_EFFECTS.blur * height / 1080;
  return { sigma, veil: clamp(dim) * MENU_EFFECTS.dim, zoom: 1 + 5 * sigma / height };
}
// Framing (1.6.1): which part of the picture shows. `zoom` (1 to MENU_FRAME_ZOOM) enlarges it after
// it is fitted, `x` and `y` (0 to 1, 0.5 the middle) place it: 0 puts its left (top) edge at the
// screen's, 1 its right (bottom) edge; a picture smaller than the screen moves inside it.
export const MENU_FRAME = Object.freeze({ zoom: 1, x: 0.5, y: 0.5 });
export const MENU_FRAME_ZOOM = 3;
export function menuFrame(frame) {
  const value = (v, low, high, fallback) => (Number.isFinite(v) ? Math.min(high, Math.max(low, Math.round(v * 1000) / 1000)) : fallback);
  return { zoom: value(frame?.zoom, 1, MENU_FRAME_ZOOM, 1), x: value(frame?.x, 0, 1, 0.5), y: value(frame?.y, 0, 1, 0.5) };
}
// Where the picture lies on the screen, in fractions of the screen's width and height: filling it
// (cover) or whole in it (contain), enlarged by the look's zoom (menuLook) and the frame's, placed by
// the frame. The builder draws the video's frames and shows its preview with the same numbers.
export function framePlacement(screenRatio, pictureRatio, fit, zoom = 1, frame = MENU_FRAME) {
  const { zoom: enlarge, x, y } = menuFrame(frame), r = pictureRatio / screenRatio, pick = fit === 'cover' ? Math.max : Math.min;
  const w = pick(1, r) * zoom * enlarge, h = pick(1, 1 / r) * zoom * enlarge;
  return { x: (1 - w) * x, y: (1 - h) * y, w, h };
}
export const menuBitrate = (seconds) => Math.min(MENU_LIMITS.bitrate, Math.floor(MENU_LIMITS.videoBytes * 8 / Math.max(1, seconds)));

// What an upload is, from its first bytes.
export function mediaKind(bytes) {
  const has = (at, ...values) => values.every((value, i) => bytes[at + i] === value);
  const ascii = (at, text) => [...text].every((ch, i) => bytes[at + i] === ch.charCodeAt(0));
  if (has(0, 0x89, 0x50, 0x4e, 0x47)) return { type: 'image', mime: 'image/png', label: 'PNG' };
  if (has(0, 0xff, 0xd8, 0xff)) return { type: 'image', mime: 'image/jpeg', label: 'JPEG' };
  if (ascii(0, 'GIF8')) return { type: 'image', mime: 'image/gif', label: 'GIF' };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { type: 'image', mime: 'image/webp', label: 'WebP' };
  if (has(0, 0x1a, 0x45, 0xdf, 0xa3)) return { type: 'video', mime: 'video/webm', label: 'WebM' };
  if (ascii(4, 'ftyp')) return { type: 'video', mime: 'video/mp4', label: 'MP4' };
  return null;
}

export const MENU_VIDEO = 'panorama/videos/gridstudio_background.webm';
export const MENU_LAYOUT = 'panorama/layout/gridstudio_background.vxml_c';
export const MENU_STYLE = 'panorama/styles/gridstudio_background.vcss_c';

const LAYOUT = (event) => `<root>
	<styles>
		<include src="s2r://panorama/styles/dotastyles.vcss_c" />
		<include src="s2r://${MENU_STYLE}" />
	</styles>
	<Panel class="GridStudioBackground" hittest="false">${event ? `
		<CustomLayoutPanel id="GridStudioEvent" layout="${event.layout}" />` : ''}
		<MoviePanel id="GridStudioMovie" src="s2r://${MENU_VIDEO}" repeat="true" autoplay="onload" hittest="false" />
	</Panel>
</root>
`;
const STYLE = (event) => `.GridStudioBackground
{
	width: 100%;
	height: 100%;
	background-color: black;
}

#GridStudioMovie
{
	width: 100%;
	height: 100%;
}
${event ? `
#GridStudioEvent
{
	width: 100%;
	height: 100%;
	z-index: 1;
	visibility: collapse;
	opacity: 0;
	pre-transform-scale2d: 1.04;
	transition-property: opacity, pre-transform-scale2d, visibility;
	transition-duration: 0.25s;
	transition-timing-function: ease-in;
}

.GridStudioShowEvent #GridStudioEvent
{
	visibility: visible;
	opacity: 1;
	pre-transform-scale2d: 1;
	transition-duration: 0.6s;
	transition-timing-function: cubic-bezier( 0.22, 0.8, 0.24, 1 );
}

.GridStudioShowEvent #GridStudioMovie
{
	visibility: collapse;
	transition-property: visibility;
	transition-duration: 0.6s;
}
` : ''}`;

// The season event (tested in game 01.10.2026, docs/customize.md «Ивент»). Valve's menu background
// is the event itself (Квортеро: rewards to claim, tiers, a timer), and our override hides it. So the
// pack keeps it nested, collapsed, in our background layout, and a button on the home page, under
// the event card of the news column (at its top when the column is hidden), swaps the video for it
// and back. Dota is strict about layouts: a layout at a path of its own must not have event
// handlers (one with onactivate fails to load, and the client stops with «Unable to load layout
// file»; nested CustomLayoutPanel layouts are required too), and no Valve layout or style has
// non-ASCII text. So the button lives in Valve's dashboard.xml, which keeps all its handlers, and
// toggles a class on #DashboardCore that our layout follows in CSS; its texts are Dota's own
// localization tokens. assets/dota-menu/event.json names the event: its layout (Valve's
// override-background when it was written), its title token and logo. When Valve moves on to the
// next event, the names no longer match and the pack has no button until the file is updated.
export const MENU_UI_STYLE = 'panorama/styles/gridstudio_menu.vcss_c';
export function menuEvent(dashboard, event) {
  const override = /<DOTADashboardBackgroundManager\b[^>]*\boverride-background="([^"]*)"/.exec(dashboard)?.[1];
  return event?.layout && override === event.layout ? event : null;
}
// The button looks like Valve's own cells of the news column (frontpage_shared.css,
// front_page_dark_carnival.css): the card's dark shadow colour, a hairline border, the cell title's
// grey uppercase Radiance; hover brightens the border and the text, like theirs. With the play panel
// open it moves aside and blurs with the dashboard's pages (dashboard.css .PlayTabVisible) inside a
// layer with Valve's own rules for them, so it stays with the event card. It moves like the
// builder's preview (DotaMenu.jsx): it slides in from the right with the home page, the event screen
// fades in over the video settling from a slight zoom (the video collapses once it is covered) and
// fades out faster, the title and «НАЗАД» swap going up and coming from below. Valve's own way of
// animating a panel that collapses (popup_dark_carnival_encounter_slark_jailbreak.css): opacity
// and transform with `visibility` among the transition properties, so it collapses only once the
// fade is over.
export const MENU_UI_LOOK = Object.freeze({ width: 330, height: 56, gap: 16, logo: 40 });
const MENU_UI = (event, clean) => `/* GridStudio: the switch to the season event, under the event card of the home page. */
#GridStudioEventToggle
{
	visibility: collapse;
	opacity: 0;
	transform: translateX( 24px );
	horizontal-align: right;
	vertical-align: top;
	margin-right: 58px;
	margin-top: ${clean ? 100 : 584 + MENU_UI_LOOK.gap}px;
	width: ${MENU_UI_LOOK.width}px;
	height: ${MENU_UI_LOOK.height}px;
	flow-children: right;
	padding: 0px 14px;
	background-color: gradient( linear, 0% 0%, 100% 0%, from( #0d0f18eb ), to( #0d0f18be ) );
	border: 1px solid rgba( 235, 247, 255, 0.07 );
	box-shadow: 0px 6px 48px -4px rgba( 0, 0, 0, 0.5 );
	transition-property: background-color, border, opacity, transform, visibility;
	transition-duration: 0.2s;
	transition-timing-function: ease-in-out;
}

.OnHomePage #GridStudioEventToggle
{
	visibility: visible;
	opacity: 1;
	transform: translateX( 0px );
	transition-duration: 0.4s;
	transition-timing-function: cubic-bezier( 0.22, 0.8, 0.24, 1 );
}

/* The button's layer repeats Valve's rules for the pages (dashboard.css #DashboardPages): with the
   play panel open they move aside and blur, and the layer the same way, on the same transition of
   its own base state, so the button stays with the event card both ways. The button's own
   transitions (sliding in with the home page) stay on the button. */
#GridStudioEventLayer
{
	width: 100%;
	height: 100%;
	wash-color: white;
	transform-origin: 50% 50%;
	transform: none;
	transition-property: transform, blur, saturation, wash-color, opacity, hue-rotation, pre-transform-scale2d;
	transition-duration: 0.45s;
	transition-delay: 0.0s;
	transition-timing-function: ease-in;
}

.Connecting #GridStudioEventLayer
{
	transition-duration: 1s;
}

.PreConnected #GridStudioEventLayer
{
	transform: translateZ(-500px) rotateX(80deg) rotateY(50deg) translateY(-610px) translateX(110px);
	pre-transform-scale2d: .3;
	opacity: 0;
}

DOTADashboard.PlayTabVisible #GridStudioEventLayer
{
	blur: gaussian( 5 );
	wash-color: #657b7baa;
	saturation: 0.25;
	transform: translatex( -120px );
}

DOTADashboard.AspectRatio16x10.PlayTabVisible #GridStudioEventLayer
{
	transform: translatex( -208px );
}

#GridStudioEventToggle:hover
{
	background-color: gradient( linear, 0% 0%, 100% 0%, from( #171b28f2 ), to( #11141ed0 ) );
	border: 1px solid rgba( 235, 247, 255, 0.16 );
}

#GridStudioEventLogo
{
	width: ${MENU_UI_LOOK.logo}px;
	height: ${MENU_UI_LOOK.logo}px;
	vertical-align: center;
	margin-right: 12px;
	saturation: 0.8;
	transition-property: saturation;
	transition-duration: 0.15s;
}

#GridStudioToggleTitles
{
	width: 250px;
	height: 100%;
}

#GridStudioEventToggle:hover #GridStudioEventLogo
{
	saturation: 1;
}

.GridStudioToggleTitle
{
	vertical-align: center;
	width: 100%;
	font-size: 16px;
	color: #cccccc;
	text-transform: uppercase;
	letter-spacing: 1px;
	text-shadow: 0px 1px 3px 3 #000000;
	transition-property: color, opacity, transform, visibility;
	transition-duration: 0.2s;
	transition-timing-function: ease-in-out;
}

#GridStudioEventToggle:hover .GridStudioToggleTitle
{
	color: #ffffff;
}

#GridStudioEventToggle:active #GridStudioToggleTitles
{
	transform: translateY( 1px );
}

.ShowWhenEvent
{
	visibility: collapse;
	opacity: 0;
	transform: translateY( 8px );
}

.GridStudioShowEvent .ShowWhenEvent
{
	visibility: visible;
	opacity: 1;
	transform: translateY( 0px );
}

.GridStudioShowEvent .ShowWhenMovie
{
	visibility: collapse;
	opacity: 0;
	transform: translateY( -8px );
}
`;
const once = (text, find, replace) => {
  if (text.split(find).length !== 2) throw new Error(`В dashboard.xml не найдено место для кнопки ивента: ${find}`);
  return text.replace(find, () => replace);
};
function eventDashboard(dashboard, event) {
  const styles = '<include src="s2r://panorama/styles/dashboard.vcss_c" />', pages = '<PageManager id="DashboardPages" hittest="false" />';
  return once(once(dashboard, styles, `${styles}\n\t\t<include src="s2r://${MENU_UI_STYLE}" />`), pages, `${pages}
					<Panel id="GridStudioEventLayer" hittest="false">
						<Button id="GridStudioEventToggle" onactivate="ToggleStyle( DashboardCore, GridStudioShowEvent ) PlaySoundEffect( ui_rollover_micro )">
							<Image id="GridStudioEventLogo" src="${event.logo}" scaling="stretch-to-fit-preserve-aspect" hittest="false" />
							<Panel id="GridStudioToggleTitles" hittest="false">
								<Label class="GridStudioToggleTitle ShowWhenMovie" html="true" text="${event.title}" hittest="false" />
								<Label class="GridStudioToggleTitle ShowWhenEvent" text="#UI_BACK" hittest="false" />
							</Panel>
						</Button>
					</Panel>`);
}
// The rules above, checked on every file of the pack: ASCII only, and no handlers in our own layouts.
function panoramaFile(path, source, valve = false) {
  if (/[^\x00-\x7f]/.test(source)) throw new Error(`Не-ASCII в ${path}: Dota не загрузит меню.`);
  if (!valve && path.endsWith('.vxml_c') && /\son[a-z]+="/.test(source)) throw new Error(`Обработчик событий в новой разметке ${path}: Dota не загрузит меню.`);
  return { path, data: panoramaResource(path, source) };
}

export function menuDashboard(dashboard) {
  const pattern = /(<DOTADashboardBackgroundManager\b[^>]*\boverride-background=")[^"]*(")/g;
  if ((dashboard.match(pattern) || []).length !== 1) throw new Error('В dashboard.xml не найден DOTADashboardBackgroundManager с override-background.');
  return dashboard.replace(pattern, `$1s2r://${MENU_LAYOUT}$2`);
}
export function cleanHomePage(home) {
  const cleaned = home.replace(/\n?[ \t]*<Panel id="TodayPages"[\s\S]*?\n[ \t]*<\/Panel>(?=\n[ \t]*<\/DOTAHomePage>)/, '');
  if (cleaned === home) throw new Error('В dashboard_page_home.xml не найден блок #TodayPages.');
  return cleaned;
}

// The background behind the hero on the hero page («За героем» in the builder; tested in game
// 30.09.2026, docs/customize.md). It is not a 3D scene: Valve draws a flat seasonal picture
// (#HeroLoadoutBackgroundImage, hero_loadout_background_images.css) at 0.3 opacity with a vignette
// and the hero model transparently over it. Our copy of the page plays a video there instead:
// the menu's own WebM, or one of its own.
export const HERO_PAGE = 'panorama/layout/dashboard_page_hero_new_v2.vxml_c';
export const HERO_STYLE = 'panorama/styles/gridstudio_hero_background.vcss_c';
export const HERO_VIDEO = 'panorama/videos/gridstudio_hero_background.webm';
// How bright the video is behind the hero (Valve's picture: 0.3); the builder's preview matches it.
export const HERO_OPACITY = 0.6;
const HERO_STYLE_TEXT = `/* GridStudio: a video behind the hero instead of Valve's seasonal picture. */
.DashboardPage #HeroLoadoutBackgroundImageContainer
{
	background-color: black;
	blur: gaussian(0px);
	saturation: 1;
}

.DashboardPage #HeroLoadoutBackgroundImageContainer #HeroLoadoutBackgroundImage
{
	visibility: collapse;
}

#GridStudioHeroMovie
{
	width: 100%;
	height: 100%;
	opacity: ${HERO_OPACITY};
	transition-property: opacity, transform;
	transition-duration: 1s;
	transition-timing-function: cubic-bezier(0, 1, 0, 1);
}

.EnableHeroCustomize #GridStudioHeroMovie
{
	opacity: 0.1;
	transform: translateX( -60px );
}
`;
const HERO_INCLUDE = '<include src="s2r://panorama/styles/hero_loadout_background_images.vcss_c" />';
const HERO_CONTAINER = /(<Panel id="HeroLoadoutBackgroundImageContainer" hittest="false">\n)/;
// Valve's hero page with our style after theirs and the movie first in the picture's container
// (so Valve's vignette stays on top).
export function heroPage(page, video) {
  if (page.split(HERO_INCLUDE).length !== 2 || !HERO_CONTAINER.test(page)) throw new Error('В dashboard_page_hero_new_v2.xml не найден фон за героем.');
  return page.replace(HERO_INCLUDE, `${HERO_INCLUDE}\n\t\t<include src="s2r://${HERO_STYLE}" />`)
    .replace(HERO_CONTAINER, `$1\t\t\t<MoviePanel id="GridStudioHeroMovie" src="s2r://${video}" repeat="true" autoplay="onload" hittest="false" />\n`);
}

// The «Герои» page, the hero grid (dashboard_page_heroes.xml; 1.6.4, from a user's report: a menu
// background that suits the menu can swallow a custom grid). Dota marks only the home page on the
// dashboard (.OnHomePage), so the menu's background cannot be styled from this page; the pack
// replaces Valve's page instead. «Темнее» puts a black veil of GRID_DIM.max at most under the grid,
// over the menu's background; «Свой фон» hides the menu's background there (hidebackground, as
// Valve's hero and guild pages do) and plays a video of its own. The page starts 120 px below the
// top of the screen (dashboard_page_heroes.css), so both are raised to cover the sub-navigation too.
export const GRID_PAGE = 'panorama/layout/dashboard_page_heroes.vxml_c';
export const GRID_STYLE = 'panorama/styles/gridstudio_grid.vcss_c';
export const GRID_VIDEO = 'panorama/videos/gridstudio_grid_background.webm';
export const GRID_DIM = Object.freeze({ max: 0.9, default: 0.5 });
const GRID_INCLUDE = '<include src="s2r://panorama/styles/dashboard_page_heroes.vcss_c" />';
const GRID_ROOT = '<DOTAHeroesPage class="DashboardPage" defaultfocus="HeroGrid">';
// grid: { page, dim } (darker) or { page, video } (a video of its own).
export function gridPage(page, own) {
  if (page.split(GRID_INCLUDE).length !== 2 || page.split(GRID_ROOT).length !== 2) throw new Error('В dashboard_page_heroes.xml не найдена страница «Герои».');
  const layer = own ? `<MoviePanel id="GridStudioGridMovie" src="s2r://${GRID_VIDEO}" repeat="true" autoplay="onload" hittest="false" />` : '<Panel id="GridStudioGridVeil" hittest="false" />';
  return page.replace(GRID_INCLUDE, () => `${GRID_INCLUDE}\n\t\t<include src="s2r://${GRID_STYLE}" />`)
    .replace(GRID_ROOT, () => `${own ? GRID_ROOT.replace('>', ' hidebackground="true">') : GRID_ROOT}\n\t\t${layer}`);
}
const gridVeil = (dim) => Math.round(Math.max(0, Math.min(GRID_DIM.max, Number(dim) || 0)) * 255).toString(16).padStart(2, '0');
const GRID_STYLE_TEXT = (dim) => `/* GridStudio: the background under the hero grid. */
#GridStudioGridMovie,
#GridStudioGridVeil
{
	width: 100%;
	height: 1080px;
	margin-top: -120px;
}
${dim == null ? '' : `
#GridStudioGridVeil
{
	background-color: #000000${gridVeil(dim)};
}
`}`;

// Player profiles («Витрина», showcase/dashboard_page_showcase.xml; tested in game 01.10.2026,
// docs/customize.md «Профиль»): under the status line («В главном меню», «ID: …») two buttons open
// the player's page on Stratz and on Dotabuff in the browser. It is Valve's page with its own
// handlers, so ours work there too; Valve's Resolve() (the page's script) localizes only arguments
// that start with «{», so the handler does the same to the id alone and joins the URL itself.
// The logos are Panorama vector images (.vsvg_c, assets/dota-menu/icons/), drawn by the game.
export const PROFILE_PAGE = 'panorama/layout/showcase/dashboard_page_showcase.vxml_c';
export const PROFILE_STYLE = 'panorama/styles/gridstudio_profile.vcss_c';
export const PROFILE_ICONS = Object.freeze({ stratz: 'panorama/images/gridstudio/stratz.vsvg_c', dotabuff: 'panorama/images/gridstudio/dotabuff.vsvg_c' });
export const PROFILE_SITES = Object.freeze([
  { id: 'Stratz', icon: 'stratz', label: 'STRATZ', url: 'https://stratz.com/players/' },
  { id: 'Dotabuff', icon: 'dotabuff', label: 'DOTABUFF', url: 'https://www.dotabuff.com/players/' }
]);
const PROFILE_INCLUDE = '<include src="s2r://panorama/styles/showcase/dashboard_page_showcase.vcss_c" />';
// The end of the status line, then of #ProfileMainCorner: the buttons go between them.
const PROFILE_ROW = `						</Panel>
					</Panel>
				</Panel>
			</Panel>
			<Label id="PendingApprovalLabel"`;
export function profilePage(page) {
  if (page.split(PROFILE_INCLUDE).length !== 2 || page.split(PROFILE_ROW).length !== 2) throw new Error('В dashboard_page_showcase.xml не найдена строка статуса профиля.');
  const buttons = PROFILE_SITES.map(({ id, icon, label, url }) => `						<Button id="GridStudio${id}" class="GridStudioStatsLink" onactivate="$.DispatchEvent( 'ExternalBrowserGoToURL', '${url}' + $.Localize( '{s:account_id}', $.GetContextPanel() ) );">
							<Image src="s2r://${PROFILE_ICONS[icon].replace(/_c$/, '')}" texturewidth="48px" textureheight="48px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />
							<Label text="${label}" hittest="false" />
						</Button>`).join('\n');
  return page.replace(PROFILE_INCLUDE, () => `${PROFILE_INCLUDE}\n\t\t<include src="s2r://${PROFILE_STYLE}" />`)
    .replace(PROFILE_ROW, () => `						</Panel>
					</Panel>
					<Panel id="GridStudioStatsLinks" hittest="false">
${buttons}
					</Panel>
				</Panel>
			</Panel>
			<Label id="PendingApprovalLabel"`);
}
// Like the event button: the dark ground, a hairline border, LighterGrey uppercase text of the
// status line; 22 px down, so the row sits under the header's separator line.
const PROFILE_STYLE_TEXT = `/* GridStudio: buttons to the player's Stratz and Dotabuff pages, under the status line. */
#GridStudioStatsLinks
{
	flow-children: right;
	margin-top: 22px;
}

.GridStudioStatsLink
{
	flow-children: right;
	height: 28px;
	margin-right: 8px;
	padding: 0px 10px 0px 5px;
	background-color: #0d0f18b0;
	border: 1px solid rgba( 235, 247, 255, 0.07 );
	transition-property: background-color, border;
	transition-duration: 0.15s;
	transition-timing-function: ease-in-out;
}

.GridStudioStatsLink:hover
{
	background-color: #171b28e0;
	border: 1px solid rgba( 235, 247, 255, 0.18 );
}

.GridStudioStatsLink Image
{
	width: 18px;
	height: 18px;
	vertical-align: center;
	margin-right: 7px;
	saturation: 0.8;
	transition-property: saturation;
	transition-duration: 0.15s;
}

.GridStudioStatsLink:hover Image
{
	saturation: 1;
}

.GridStudioStatsLink Label
{
	vertical-align: center;
	font-size: 14px;
	color: #B0BCC2;
	text-transform: uppercase;
	letter-spacing: 1px;
	text-shadow: 0px 1px 5px #000000;
	transition-property: color;
	transition-duration: 0.15s;
}

.GridStudioStatsLink:hover Label
{
	color: #ffffff;
}

.GridStudioStatsLink:active Label
{
	transform: translateY( 1px );
}
`;

// video: WebM bytes (VP8/VP9, no Opus audio); dashboard/home/hero.page: Valve's current layouts as
// text. hero: null keeps Valve's picture behind the hero; { page } shows the menu video there;
// { page, video } a video of its own. event: assets/dota-menu/event.json for the event button, or
// null for none (also none when it is not the dashboard's current event). profile: { page, icons }
// (Valve's showcase layout and the logos' SVG text) for the Stratz and Dotabuff buttons, or null.
// grid: null keeps the «Герои» page as it is; { page, dim } darkens the menu's background there,
// { page, video } shows a video of its own.
export function menuBackgroundPack({ video, dashboard, home = null, hero = null, event = null, profile = null, grid = null, md5 }) {
  const season = menuEvent(dashboard, event), board = menuDashboard(season ? eventDashboard(dashboard, season) : dashboard);
  const files = [
    panoramaFile('panorama/layout/dashboard.vxml_c', board, true),
    panoramaFile(MENU_LAYOUT, LAYOUT(season)),
    panoramaFile(MENU_STYLE, STYLE(season)),
    { path: MENU_VIDEO, data: video }
  ];
  if (season) files.splice(3, 0, panoramaFile(MENU_UI_STYLE, MENU_UI(season, !!home)));
  if (home) files.splice(1, 0, panoramaFile('panorama/layout/dashboard_page_home.vxml_c', cleanHomePage(home), true));
  if (hero) {
    files.push(panoramaFile(HERO_PAGE, heroPage(hero.page, hero.video ? HERO_VIDEO : MENU_VIDEO), true), panoramaFile(HERO_STYLE, HERO_STYLE_TEXT));
    if (hero.video) files.push({ path: HERO_VIDEO, data: hero.video });
  }
  if (grid) {
    files.push(panoramaFile(GRID_PAGE, gridPage(grid.page, !!grid.video), true), panoramaFile(GRID_STYLE, GRID_STYLE_TEXT(grid.video ? null : grid.dim ?? GRID_DIM.default)));
    if (grid.video) files.push({ path: GRID_VIDEO, data: grid.video });
  }
  if (profile) files.push(panoramaFile(PROFILE_PAGE, profilePage(profile.page), true), panoramaFile(PROFILE_STYLE, PROFILE_STYLE_TEXT),
    ...Object.entries(PROFILE_ICONS).map(([name, path]) => panoramaFile(path, profile.icons[name])));
  return buildVPK(files, { version: 2, md5 });
}
