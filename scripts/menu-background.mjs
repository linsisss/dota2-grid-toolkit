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
// Turned and mirrored (asked for on 2026-10-05, as the editor turns and mirrors objects): `rotate` in
// degrees (−180 to 180, clockwise), `flipX` / `flipY` mirror it left to right / top to bottom.
export const MENU_FRAME = Object.freeze({ zoom: 1, x: 0.5, y: 0.5, rotate: 0, flipX: false, flipY: false });
export const MENU_FRAME_ZOOM = 3;
// Any angle into −180…180, a tenth of a degree at most.
export const frameAngle = (degrees) => { const a = ((Math.round((Number(degrees) || 0) * 10) / 10 % 360) + 540) % 360 - 180; return a === -180 ? 180 : a || 0; };
export function menuFrame(frame) {
  const value = (v, low, high, fallback) => (Number.isFinite(v) ? Math.min(high, Math.max(low, Math.round(v * 1000) / 1000)) : fallback);
  return { zoom: value(frame?.zoom, 1, MENU_FRAME_ZOOM, 1), x: value(frame?.x, 0, 1, 0.5), y: value(frame?.y, 0, 1, 0.5),
    rotate: Number.isFinite(frame?.rotate) ? frameAngle(frame.rotate) : 0, flipX: frame?.flipX === true, flipY: frame?.flipY === true };
}
// Where the picture lies on the screen, in fractions of the screen's width and height: filling it
// (cover) or whole in it (contain), enlarged by the look's zoom (menuLook) and the frame's, placed by
// the frame. The builder draws the video's frames and shows its preview with the same numbers.
// x, y, w, h: the picture's own rectangle before it is turned, about its centre, by `rotate`; turned,
// «Заполнить» still covers the whole screen and «Целиком» shows the whole picture. bw, bh: the turned
// picture's bounding box, which x and y of the frame move inside the screen.
export function framePlacement(screenRatio, pictureRatio, fit, zoom = 1, frame = MENU_FRAME) {
  const { zoom: enlarge, x, y, rotate, flipX, flipY } = menuFrame(frame), a = rotate * Math.PI / 180;
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)) < 1e-12 ? 0 : Math.abs(Math.sin(a));
  // In the screen's height: the screen is screenRatio × 1, the picture pictureRatio × 1 before scaling.
  const W = screenRatio, scale = fit === 'cover' ? Math.max((W * c + s) / pictureRatio, W * s + c) : Math.min(W / (pictureRatio * c + s), 1 / (pictureRatio * s + c));
  const k = scale * zoom * enlarge, w = pictureRatio * k / W, h = k;
  const bw = (pictureRatio * k * c + k * s) / W, bh = pictureRatio * k * s + k * c;
  const cx = (1 - bw) * x + bw / 2, cy = (1 - bh) * y + bh / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h, bw, bh, rotate, flipX, flipY };
}
export const menuBitrate = (seconds) => Math.min(MENU_LIMITS.bitrate, Math.floor(MENU_LIMITS.videoBytes * 8 / Math.max(1, seconds)));

// What an upload is, from its first bytes.
export function mediaKind(bytes) {
  const has = (at, ...values) => values.every((value, i) => bytes[at + i] === value);
  const ascii = (at, text) => [...text].every((ch, i) => bytes[at + i] === ch.charCodeAt(0));
  // `still`: one picture, no motion (2026-10-16: the workshop takes no still pictures as backgrounds).
  // A GIF counts as moving; a WebP is moving when its VP8X header says «animation» (needs 21 bytes).
  if (has(0, 0x89, 0x50, 0x4e, 0x47)) return { type: 'image', mime: 'image/png', label: 'PNG', still: true };
  if (has(0, 0xff, 0xd8, 0xff)) return { type: 'image', mime: 'image/jpeg', label: 'JPEG', still: true };
  if (ascii(0, 'GIF8')) return { type: 'image', mime: 'image/gif', label: 'GIF', still: false };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { type: 'image', mime: 'image/webp', label: 'WebP', still: !(ascii(12, 'VP8X') && (bytes[20] & 0x02)) };
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
// The menu style's text, for scripts/make-interface-test.mjs (which pack wins on a shared file).
export const menuStyleText = (event = null) => STYLE(event);
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
// The news column's two cards, one by one (asked for on 2026-10-08, after Dota's update of 2026-10-07
// put Valve's own «Диковинки Квортеро» cell under the Dark Carnival card). Both hidden: the column goes
// as before (cleanHomePage). One hidden: the home page keeps the column and takes a style of ours that
// collapses that card's cell (the column's flow moves the other one up); the cells come from Valve's
// banner layouts (banners/front_page_dark_carnival.xml, front_page_seasonal_reward_line.xml) inside the
// home page, so the style reaches them from it.
export const HOME_STYLE = 'panorama/styles/gridstudio_home.vcss_c';
export const NEWS_CELLS = Object.freeze({ carnival: 'FrontPageDarkCarnivalCell', season: 'FrontPageSeasonalRewardLineCell' });
// The same style carries the see-through news column (MENU_GLASS.news, 2026-10-22): `news` is its percent.
const HOME_STYLE_TEXT = (hidden, news = 100) => [hidden.length && `/* GridStudio: news cards hidden on the home page. */\n${hidden.map((cell) => `.${NEWS_CELLS[cell]}\n{\n\tvisibility: collapse;\n}\n`).join('\n')}`,
  news < 100 && GLASS_NEWS_TEXT(news)].filter(Boolean).join('\n');
export function newsHomePage(home) {
  const styled = home.replace(/(\n[ \t]*)<\/styles>/, `$1\t<include src="s2r://${HOME_STYLE}" />$1</styles>`);
  if (styled === home) throw new Error('В dashboard_page_home.xml не найден блок <styles>.');
  return styled;
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
// The menu's own WebM is not played a second time (2026-10-22, a user's report «фоны с грида лагают, а
// с фонами из pornfx всё нормально»): a second MoviePanel of the same file is a second 1080p VP9 decoder,
// and a page stays loaded once opened, so the menu kept two videos going (d2pfx's packs play one). The
// page lets the menu's background show through instead, as the «Герои» page does (Valve's page hides it,
// hidebackground="true"), and a black veil of 1 − HERO_OPACITY over it looks the same as the movie at
// HERO_OPACITY over black. Only a video of its own (mode 'own') still plays on the page.
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
// The menu's video seen through the page (no movie of the page's own): the veil instead of the black ground.
const veilHex = (alpha) => Math.round(alpha * 255).toString(16).padStart(2, '0');
const HERO_SEE_THROUGH_TEXT = `/* GridStudio: the menu's video behind the hero instead of Valve's seasonal picture (seen through the page). */
.DashboardPage #HeroLoadoutBackgroundImageContainer
{
	background-color: #000000${veilHex(1 - HERO_OPACITY)};
	blur: gaussian(0px);
	saturation: 1;
	transition-property: background-color;
	transition-duration: 1s;
	transition-timing-function: cubic-bezier(0, 1, 0, 1);
}

.DashboardPage #HeroLoadoutBackgroundImageContainer #HeroLoadoutBackgroundImage
{
	visibility: collapse;
}

.EnableHeroCustomize #HeroLoadoutBackgroundImageContainer
{
	background-color: #000000${veilHex(0.9)};
}
`;
export const heroStyleText = (own) => (own ? HERO_STYLE_TEXT : HERO_SEE_THROUGH_TEXT);
const HERO_INCLUDE = '<include src="s2r://panorama/styles/hero_loadout_background_images.vcss_c" />';
const HERO_CONTAINER = /(<Panel id="HeroLoadoutBackgroundImageContainer" hittest="false">\n)/;
const HERO_ROOT = /(<DOTAHeroPageNewV2 [^>]*?) hidebackground="true"/;
// Valve's hero page with our style after theirs and, for a video of its own (`video`: its path), the movie
// first in the picture's container (so Valve's vignette stays on top). Without `video` the page no longer
// hides the menu's background, which plays behind it.
export function heroPage(page, video = null) {
  if (page.split(HERO_INCLUDE).length !== 2 || !HERO_CONTAINER.test(page) || (page.match(new RegExp(HERO_ROOT.source, 'g')) || []).length !== 1) throw new Error('В dashboard_page_hero_new_v2.xml не найден фон за героем.');
  const styled = page.replace(HERO_INCLUDE, `${HERO_INCLUDE}\n\t\t<include src="s2r://${HERO_STYLE}" />`);
  return video ? styled.replace(HERO_CONTAINER, `$1\t\t\t<MoviePanel id="GridStudioHeroMovie" src="s2r://${video}" repeat="true" autoplay="onload" hittest="false" />\n`)
    : styled.replace(HERO_ROOT, '$1');
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

// The loading screen of a match (2026-10-16, «Интерфейс»: the first module of the interface builder,
// built into this pack, since it is a background too). Valve's loading_screen_background_image.xml
// (559 bytes, changed once in a year) shows the Dota logo, or the loading screen the user equipped;
// our copy plays a video over them: the menu's own WebM, or one of its own. Not yet checked in game
// (docs/customize.md «Экран загрузки»; scripts/make-interface-test.mjs has the test).
export const LOADING_PAGE = 'panorama/layout/loading_screen_background_image.vxml_c';
export const LOADING_STYLE = 'panorama/styles/gridstudio_loading.vcss_c';
export const LOADING_VIDEO = 'panorama/videos/gridstudio_loading.webm';
const LOADING_INCLUDE = '<include src="s2r://panorama/styles/loading_screen_background_image.vcss_c" />';
const LOADING_LAST = '<Panel id="LoadPanel" />';
const LOADING_STYLE_TEXT = `/* GridStudio: a video on the loading screen. */
#GridStudioLoadingMovie
{
	width: 100%;
	height: 100%;
}
`;
// Valve's layout with our style after theirs and the movie last (over the logo and the equipped
// picture, which Valve shows by classes on the root).
export function loadingPage(page, video) {
  if (page.split(LOADING_INCLUDE).length !== 2 || page.split(LOADING_LAST).length !== 2) throw new Error('В loading_screen_background_image.xml не найден экран загрузки.');
  return page.replace(LOADING_INCLUDE, () => `${LOADING_INCLUDE}\n\t\t<include src="s2r://${LOADING_STYLE}" />`)
    .replace(LOADING_LAST, () => `${LOADING_LAST}\n\t\t<MoviePanel id="GridStudioLoadingMovie" src="s2r://${video}" repeat="true" autoplay="onload" hittest="false" />`);
}

// Buttons of the main menu's top bar the user can hide (2026-10-16, «Интерфейс» → «Главное меню»):
// tabs and the right-hand buttons, never «Играть», the settings, the party, the mail or the exit.
// Valve's dashboard.css sets no visibility on them, so our style after it collapses them and the bar
// closes up: the tabs flow left, the right-hand buttons right (#TopBarRightButtons). The ids are
// Valve's (dashboard.xml); check-dota-menu.mjs watches the file.
export const MENU_HIDE = Object.freeze({
  collection: ['#TopBarCollection'], watch: ['#TopBarWatch'], learn: ['#TopBarLearn'], mods: ['#TopBarMods'],
  shards: ['#ShardsButton'], armory: ['#TopBarArmory'], plus: ['#TopBarPlus', '#PlusButtonParticlesOverlay']
});
export const MENU_HIDE_STYLE = 'panorama/styles/gridstudio_menu_hide.vcss_c';
const MENU_HIDE_TEXT = (hide) => `/* GridStudio: top bar buttons the user hid. */
${hide.flatMap((key) => MENU_HIDE[key]).join(',\n')}
{
	visibility: collapse;
}
`;
const DASHBOARD_STYLES_END = /(\n\t<\/styles>)/;
// Valve's dashboard with our styles (the hidden buttons, the see-through top bar) after all of theirs.
export function styleDashboard(dashboard, styles) {
  if (!DASHBOARD_STYLES_END.test(dashboard)) throw new Error('В dashboard.xml не найдены стили.');
  if (styles.includes(MENU_HIDE_STYLE)) for (const ids of Object.values(MENU_HIDE)) for (const id of ids) if (!dashboard.includes(`id="${id.slice(1)}"`)) throw new Error(`В dashboard.xml нет ${id}.`);
  if (styles.includes(GLASS_STYLE) && !(dashboard.includes('id="TopBarBackground"') && dashboard.includes('class="TopPixelFix"'))) throw new Error('В dashboard.xml нет подложки верхней панели.');
  if (styles.includes(GLASS_STYLE) && !dashboard.includes('<Panel id="FriendlistBottom">')) throw new Error('В dashboard.xml нет панели группы.');
  return dashboard.replace(DASHBOARD_STYLES_END, () => `${styles.map((style) => `\n\t\t<include src="s2r://${style}" />`).join('')}\n\t</styles>`);
}
export const hideDashboard = (dashboard) => styleDashboard(dashboard, [MENU_HIDE_STYLE]);

// See-through panels (2026-10-22, «Кнопки меню» → «Фон панелей»): the user's menu background shows through
// the top bar and the friends rail. Each is a percent, 100 (the default) as in Dota. Only the panels'
// grounds change, never their content (texts, icons, avatars, the mini-profile), and with static rules
// only (nothing animated: Dota crashes on animated properties Valve does not animate).
// The top bar (dashboard.css): its ground is one panel, #TopBarBackground — Valve's picture of the bar
// (topbar_*_png, the tab separators painted in) with the right-hand plates (.TopBarRightBackground) and
// the hover glows inside it — plus .TopPixelFix, a 2-px black line over it. The tabs, the buttons and the
// Dota logo (#HomeButtonMap) are its siblings, so `opacity` on these two leaves them as they are.
// The friends rail is a layout of its own (friend_menu.xml: our style is included there, as Dota's styles
// stay inside the layout that includes them): its ground is .LeftRailContain's background colour with a
// filled shadow (friend_menu.css; another colour on the home page and in two seasons) and the black row
// of the friend search (#FriendsPanelHeader). Its content is inside the same panels, so these colours
// lose alpha instead (the same colour, its alpha × the percent). The mini-profile card is its own layout
// and its own sliders (below).
// More panels (2026-10-22, the owner's second round, from his screenshot): the news column on the right, the
// mini-profile's header row and its picture, the party bar. Each again in the scope of the layout that makes
// it (Panorama styles stay inside the layout that includes them; a layout's root panel also takes the rules
// of the layout it is declared in, as dashboard_page_home.css sizes #FrontpageContents):
// - news (dashboard_page_home.xml, our HOME_STYLE): the cards are artwork through and through (Dark Carnival
//   is a 3D scene with its pictures, Quartero a picture with hero models), with no ground of their own to
//   thin, and each card is a layout of its own inside frontpage_contents.xml (which changes with every event
//   and nests the event's layouts: a stale copy of it would ask Dota for layouts that are gone). So the
//   whole column fades: `opacity` on #RightColumn, a plain panel of the home page that Valve neither fades
//   nor animates (#TodayPages around it has Valve's own opacity transition on the first show).
//   Each card casts Valve's soft shadow (frontpage_shared.css .FrontpageCell: 0 6 48 −4 px, black at 0.5). Under the
//   opaque cards it never showed, but faded the column read as one grey box (the owner's in-game screenshot of
//   2026-10-22): the two shadows fill the 16-px gap between the cards and the column's free right edge. So the
//   column also masks them out with `opacity-brush` (Valve's own property, a gradient of alpha over the panel):
//   #FrontpageContents, the root of frontpage_contents.xml that the home page's style already sizes, gets a
//   fixed height (what its cells give it now) and a vertical brush clear over the gap; #RightColumn around it a
//   horizontal one clear right of the cards. The places are Valve's (NEWS_COLUMN; check-dota-menu.mjs watches
//   them). Where our style reaches the cells themselves, their shadow goes too (#FrontpageContents
//   .FrontpageCell: the cells are frontpage_contents.xml's panels, so likely only the brushes do the work).
// - header and showcase (showcase/mini_showcase.xml, a layout of Valve's own path we replace with our style
//   after theirs, MINI_PROFILE_PAGE): the header row's ground is .Header's black and its rock picture, with
//   the avatar, the name and the status inside it, so the ground thins with `background-img-opacity` (Valve's
//   own property, the picture's alpha only) and alpha on the black; the rank medal is beside it and stays.
//   The picture under it (.ShowcaseData: the rock, the user's showcase background, stickers and texts on it) is
//   artwork, so it fades whole. Both only under .LeftRailContain: the same layout makes the mini-profiles
//   shown elsewhere (context menus, other users'), which stay as Dota draws them.
// - party (dashboard.xml, GLASS_STYLE with the top bar): #FriendlistBottom's rock picture and hairline
//   border; the slots, avatars and buttons are its children and stay.
export const MENU_GLASS = Object.freeze({ bar: 100, friends: 100, news: 100, header: 100, showcase: 100, party: 100 });
export const GLASS_KEYS = Object.freeze(Object.keys(MENU_GLASS));
export const GLASS_STYLE = 'panorama/styles/gridstudio_menu_glass.vcss_c';
export const FRIENDS_PAGE = 'panorama/layout/friend_menu.vxml_c';
export const FRIENDS_STYLE = 'panorama/styles/gridstudio_friends_glass.vcss_c';
export const MINI_PROFILE_PAGE = 'panorama/layout/showcase/mini_showcase.vxml_c';
export const MINI_PROFILE_STYLE = 'panorama/styles/gridstudio_mini_profile_glass.vcss_c';
// A percent from anything: whole, 0 to 100, 100 when it is not a number.
export const glassPercent = (value) => (value == null || value === '' || !Number.isFinite(Number(value)) ? 100 : Math.max(0, Math.min(100, Math.round(Number(value)))));
export const menuGlass = (glass) => Object.fromEntries(GLASS_KEYS.map((key) => [key, glassPercent(glass?.[key])]));
// Whether any panel differs from Dota.
export const glassChanged = (glass) => Object.values(menuGlass(glass)).some((percent) => percent < 100);
// Valve's grounds of the rail (friend_menu.css, client of 2026-10-22): selector, colour, alpha and, where Valve
// writes it otherwise, its own word (scripts/check-dota-menu.mjs looks for them in Valve's file).
export const RAIL_GROUNDS = Object.freeze([
  ['.LeftRailContain', '000000', 0xfe], ['.OnHomePage .LeftRailContain', '000000', 0xee],
  ['.Season_MonsterHunter .LeftRailContain', '0b0c12', 0xf9], ['.Season_Dark_Carnival .LeftRailContain', '090706', 0xf9],
  ['#FriendsPanelHeader', '000000', 0xff, 'black']
].map(Object.freeze));
export const RAIL_SHADOW = 0x33;
const alphaHex = (alpha, percent) => Math.round(alpha * percent / 100).toString(16).padStart(2, '0');
const GLASS_BAR_TEXT = (percent) => `/* GridStudio: the top bar's ground at ${percent} percent, so the menu background shows through. */
#TopBarBackground,
#TopBarContent .TopPixelFix
{
	opacity: ${(percent / 100).toFixed(2)};
}
`;
const GLASS_FRIENDS_TEXT = (percent) => `/* GridStudio: the friends rail's ground at ${percent} percent, so the menu background shows through. */
${RAIL_GROUNDS.map(([selector, colour, alpha], i) => `${selector}
{
	background-color: #${colour}${alphaHex(alpha, percent)};${i ? '' : `
	box-shadow: fill #000000${alphaHex(RAIL_SHADOW, percent)} 0px 0px 24px 0px;`}
}
`).join('\n')}`;
// Valve's party bar (dashboard.css #FriendlistBottom): its border, elsewhere and on the home page (where the
// picture is miniprofile_rock_psd instead of the darker one); the picture loses alpha by background-img-opacity.
export const PARTY_BORDERS = Object.freeze([['#FriendlistBottom', '3D4144', 0x50], ['.OnHomePage #FriendlistBottom', '3D4144', 0x90]].map(Object.freeze));
const GLASS_PARTY_TEXT = (percent) => `/* GridStudio: the party bar's ground at ${percent} percent, so the menu background shows through. */
${PARTY_BORDERS.map(([selector, colour, alpha], i) => `${selector}
{${i ? '' : `
	background-img-opacity: ${(percent / 100).toFixed(2)};`}
	border: 1px solid #${colour}${alphaHex(alpha, percent)};
}
`).join('\n')}`;
// The news column as Valve lays it out (dashboard_page_home.css #FrontpageContents width; frontpage_shared.css
// .FrontpageCell width, .TallCell height, .FrontpageCell height; frontpage_contents.css rows; the shadow): px.
export const NEWS_COLUMN = Object.freeze({ width: 388, cell: 330, top: Object.freeze([0, 484]), bottom: Object.freeze([500, 734]), shadow: '0px 6px 48px -4px rgba(0, 0, 0, 0.5)' });
// A stop at px of the panel's size, 4 decimals, rounded towards `side` (−1 down, 1 up) so a card's edge stays inside its opaque part.
const stop = (px, of, side) => ((side < 0 ? Math.floor : Math.ceil)(px / of * 10_000) / 10_000).toFixed(4);
const GLASS_NEWS_TEXT = (percent) => {
  const { width, cell, top, bottom } = NEWS_COLUMN, height = bottom[1];
  return `/* GridStudio: the news column at ${percent} percent, so the menu background shows through. */
#RightColumn
{
	width: ${width}px;
	opacity: ${(percent / 100).toFixed(2)};
	opacity-brush: gradient( linear, 0% 0%, 100% 0%, from( white ), color-stop( ${stop(cell, width, 1)}, white ), color-stop( ${stop(cell + 1, width, 1)}, #ffffff00 ), to( #ffffff00 ) );
}

/* The cards' shadows stay out of the gap between them (and, on the right, of the column's free edge). */
#FrontpageContents
{
	height: ${height}px;
	opacity-brush: gradient( linear, 0% 0%, 0% 100%, from( white ), color-stop( ${stop(top[1], height, 1)}, white ), color-stop( ${stop(top[1] + 1, height, 1)}, #ffffff00 ), color-stop( ${stop(bottom[0] - 1, height, -1)}, #ffffff00 ), color-stop( ${stop(bottom[0], height, -1)}, white ), to( white ) );
}

#FrontpageContents .FrontpageCell
{
	box-shadow: 0px 6px 48px -4px rgba( 0, 0, 0, 0 );
}
`;
};
// The mini-profile in the friends rail (mini_showcase.css .Header: background-color black, the rock picture,
// a black bottom line; .ShowcaseData: the picture under it).
const GLASS_MINI_PROFILE_TEXT = (header, showcase) => [header < 100 && `/* GridStudio: the mini-profile's header row, its ground at ${header} percent (the avatar, the name and the medal stay). */
.LeftRailContain .Header
{
	background-color: #000000${alphaHex(0xff, header)};
	background-img-opacity: ${(header / 100).toFixed(2)};
	border-bottom: 1px solid #000000${alphaHex(0xff, header)};
}
`, showcase < 100 && `/* GridStudio: the mini-profile's picture at ${showcase} percent, whole, so the menu background shows through. */
.LeftRailContain .ShowcaseData
{
	opacity: ${(showcase / 100).toFixed(2)};
}
`].filter(Boolean).join('\n');
// Each style's text for the panels below 100 (an empty string where none is): `dashboard` (the top bar and the
// party bar), `friends` (the rail), `home` (the news column), `miniProfile` (the header row and the picture).
export const menuGlassText = (glass) => {
  const see = menuGlass(glass);
  return { bar: see.bar < 100 ? GLASS_BAR_TEXT(see.bar) : '', party: see.party < 100 ? GLASS_PARTY_TEXT(see.party) : '',
    dashboard: [see.bar < 100 && GLASS_BAR_TEXT(see.bar), see.party < 100 && GLASS_PARTY_TEXT(see.party)].filter(Boolean).join('\n'),
    friends: see.friends < 100 ? GLASS_FRIENDS_TEXT(see.friends) : '', home: see.news < 100 ? GLASS_NEWS_TEXT(see.news) : '', miniProfile: GLASS_MINI_PROFILE_TEXT(see.header, see.showcase) };
};
const FRIENDS_INCLUDE = '<include src="s2r://panorama/styles/friend_menu_home.vcss_c" />';
// Valve's friends menu with our style after theirs; the rest is theirs.
export function friendsPage(page) {
  if (page.split(FRIENDS_INCLUDE).length !== 2 || !page.includes('<Panel class="LeftRailContain">') || !page.includes('<Panel id="FriendsPanelHeader">')) throw new Error('В friend_menu.xml не найдена панель друзей.');
  return page.replace(FRIENDS_INCLUDE, () => `${FRIENDS_INCLUDE}\n\t\t<include src="s2r://${FRIENDS_STYLE}" />`);
}
const MINI_PROFILE_INCLUDE = '<include src="s2r://panorama/styles/showcase/mini_showcase.vcss_c" />';
// Valve's mini-profile with our style after theirs; the rest is theirs.
export function miniProfilePage(page) {
  if (page.split(MINI_PROFILE_INCLUDE).length !== 2 || !page.includes('<Panel class="Header">') || !page.includes('<AsyncDataPanel class="ShowcaseData"')) throw new Error('В mini_showcase.xml не найден мини-профиль.');
  return page.replace(MINI_PROFILE_INCLUDE, () => `${MINI_PROFILE_INCLUDE}\n\t\t<include src="s2r://${MINI_PROFILE_STYLE}" />`);
}

// Every file menuBackgroundPack may write: the server takes a pack for the PowerShell command only with
// these (server/install-packs.mjs), so nobody can hand out anything else under gridstudio.me.
export const MENU_PACK_PATHS = Object.freeze(['panorama/layout/dashboard.vxml_c', 'panorama/layout/dashboard_page_home.vxml_c', HOME_STYLE, MENU_LAYOUT, MENU_STYLE, MENU_UI_STYLE,
  MENU_VIDEO, HERO_PAGE, HERO_STYLE, HERO_VIDEO, GRID_PAGE, GRID_STYLE, GRID_VIDEO, PROFILE_PAGE, PROFILE_STYLE, ...Object.values(PROFILE_ICONS),
  LOADING_PAGE, LOADING_STYLE, LOADING_VIDEO, MENU_HIDE_STYLE, GLASS_STYLE, FRIENDS_PAGE, FRIENDS_STYLE, MINI_PROFILE_PAGE, MINI_PROFILE_STYLE]);
export const MENU_PACK_VIDEOS = Object.freeze([MENU_VIDEO, HERO_VIDEO, GRID_VIDEO, LOADING_VIDEO]);

// video: WebM bytes (VP8/VP9, no Opus audio); dashboard/home/hero.page: Valve's current layouts as
// text. hero: null keeps Valve's picture behind the hero; { page } shows the menu video there;
// { page, video } a video of its own. event: assets/dota-menu/event.json for the event button, or
// null for none (also none when it is not the dashboard's current event). profile: { page, icons }
// (Valve's showcase layout and the logos' SVG text) for the Stratz and Dotabuff buttons, or null.
// grid: null keeps the «Герои» page as it is; { page, dim } darkens the menu's background there,
// { page, video } shows a video of its own.
// news: { carnival, season } — which news cards stay on the home page (needs `home`); without it, a given
// `home` hides the whole column, as before 2026-10-08.
// loading: null keeps Valve's loading screen; { page } plays the menu video there, { page, video } its own.
// hide: keys of MENU_HIDE, top bar buttons to hide.
// glass: { bar, friends, news, header, showcase, party } — how much of each panel stays, in percent (MENU_GLASS,
// 100 as in Dota); a see-through rail needs `friends`, Valve's friend_menu.xml, the mini-profile `miniProfile`,
// Valve's showcase/mini_showcase.xml, the news column `home` (with no column at all, nothing to fade).
// video: null (the one-page customization, 2026-10-17) keeps Valve's own menu background: the pack then
// carries only the other parts (hidden buttons and news cards, profiles, a page's own video, the darker
// grid page); the dashboard is written only to hide buttons, and nothing may play the menu's video.
export function menuBackgroundPack({ video, dashboard, home = null, news = null, hero = null, event = null, profile = null, grid = null, loading = null, hide = [], glass = null, friends = null, miniProfile = null, md5 }) {
  const hidden = home ? (news ? Object.keys(NEWS_CELLS).filter((cell) => news[cell] === false) : Object.keys(NEWS_CELLS)) : [];
  const clean = hidden.length === Object.keys(NEWS_CELLS).length;
  const off = Object.keys(MENU_HIDE).filter((key) => hide.includes(key));
  const see = menuGlass(glass), glassText = menuGlassText(see);
  if (!video && ((hero && !hero.video) || (loading && !loading.video))) throw new Error('Без фона меню видео меню негде взять.');
  if (see.friends < 100 && !friends) throw new Error('Для прозрачной панели друзей нужен friend_menu.xml.');
  if ((see.header < 100 || see.showcase < 100) && !miniProfile) throw new Error('Для прозрачного мини-профиля нужен mini_showcase.xml.');
  if (see.news < 100 && !home) throw new Error('Для прозрачных новостей нужен dashboard_page_home.xml.');
  const styles = [off.length && MENU_HIDE_STYLE, glassText.dashboard && GLASS_STYLE].filter(Boolean);
  // The news column fades only where it is (both cards hidden: no column).
  const newsGlass = clean ? 100 : see.news;
  const season = video ? menuEvent(dashboard, event) : null, menu = video ? menuDashboard(season ? eventDashboard(dashboard, season) : dashboard) : dashboard, board = styles.length ? styleDashboard(menu, styles) : menu;
  const files = video ? [
    panoramaFile('panorama/layout/dashboard.vxml_c', board, true),
    panoramaFile(MENU_LAYOUT, LAYOUT(season)),
    panoramaFile(MENU_STYLE, STYLE(season)),
    { path: MENU_VIDEO, data: video }
  ] : styles.length ? [panoramaFile('panorama/layout/dashboard.vxml_c', board, true)] : [];
  if (season) files.splice(3, 0, panoramaFile(MENU_UI_STYLE, MENU_UI(season, clean)));
  if (clean) files.splice(1, 0, panoramaFile('panorama/layout/dashboard_page_home.vxml_c', cleanHomePage(home), true));
  else if (hidden.length || newsGlass < 100) files.splice(1, 0, panoramaFile('panorama/layout/dashboard_page_home.vxml_c', newsHomePage(home), true), panoramaFile(HOME_STYLE, HOME_STYLE_TEXT(hidden, newsGlass)));
  if (hero) {
    files.push(panoramaFile(HERO_PAGE, heroPage(hero.page, hero.video ? HERO_VIDEO : null), true), panoramaFile(HERO_STYLE, heroStyleText(!!hero.video)));
    if (hero.video) files.push({ path: HERO_VIDEO, data: hero.video });
  }
  if (grid) {
    files.push(panoramaFile(GRID_PAGE, gridPage(grid.page, !!grid.video), true), panoramaFile(GRID_STYLE, GRID_STYLE_TEXT(grid.video ? null : grid.dim ?? GRID_DIM.default)));
    if (grid.video) files.push({ path: GRID_VIDEO, data: grid.video });
  }
  if (profile) files.push(panoramaFile(PROFILE_PAGE, profilePage(profile.page), true), panoramaFile(PROFILE_STYLE, PROFILE_STYLE_TEXT),
    ...Object.entries(PROFILE_ICONS).map(([name, path]) => panoramaFile(path, profile.icons[name])));
  if (loading) {
    files.push(panoramaFile(LOADING_PAGE, loadingPage(loading.page, loading.video ? LOADING_VIDEO : MENU_VIDEO), true), panoramaFile(LOADING_STYLE, LOADING_STYLE_TEXT));
    if (loading.video) files.push({ path: LOADING_VIDEO, data: loading.video });
  }
  if (off.length) files.push(panoramaFile(MENU_HIDE_STYLE, MENU_HIDE_TEXT(off)));
  if (glassText.dashboard) files.push(panoramaFile(GLASS_STYLE, glassText.dashboard));
  if (glassText.friends) files.push(panoramaFile(FRIENDS_PAGE, friendsPage(friends), true), panoramaFile(FRIENDS_STYLE, glassText.friends));
  if (glassText.miniProfile) files.push(panoramaFile(MINI_PROFILE_PAGE, miniProfilePage(miniProfile), true), panoramaFile(MINI_PROFILE_STYLE, glassText.miniProfile));
  if (!files.length) return null;
  return buildVPK(files, { version: 2, md5 });
}
