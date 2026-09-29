import { buildVPK, panoramaResource } from './vpk.mjs';

// A Dota 2 main-menu background pack: pakNN_dir.vpk for a game/dota_<language>/ folder.
// The dashboard's background manager loads whatever layout its override-background names (Valve
// itself points it at a seasonal layout file). The pack replaces dashboard.vxml_c with Valve's
// current layout (assets/dota-menu/dashboard.xml) naming our layout instead, and our layout plays
// the user's video full screen. With `clean`, the home page loses its right-hand news/event
// column (Valve's dashboard_page_home.xml without #TodayPages), so nothing covers the video.
// The browser converts the upload (src/customize/menu-video.js); these are its bounds. Dota shows
// a black menu for very big videos, so the WebM aims at ~14 MB whatever the input size.
export const MENU_LIMITS = Object.freeze({ bytes: 50_000_000, seconds: 30, videoBytes: 12_000_000, bitrate: 4_000_000 });
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

const LAYOUT = `<root>
	<styles>
		<include src="s2r://panorama/styles/dotastyles.vcss_c" />
		<include src="s2r://${MENU_STYLE}" />
	</styles>
	<Panel class="GridStudioBackground" hittest="false">
		<MoviePanel id="GridStudioMovie" src="s2r://${MENU_VIDEO}" repeat="true" autoplay="onload" hittest="false" />
	</Panel>
</root>
`;
const STYLE = `.GridStudioBackground
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
`;

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

// video: WebM bytes (VP8/VP9, no Opus audio); dashboard/home: Valve's current layouts as text.
export function menuBackgroundPack({ video, dashboard, home = null, md5 }) {
  const files = [
    { path: 'panorama/layout/dashboard.vxml_c', data: panoramaResource('panorama/layout/dashboard.vxml_c', menuDashboard(dashboard)) },
    { path: MENU_LAYOUT, data: panoramaResource(MENU_LAYOUT, LAYOUT) },
    { path: MENU_STYLE, data: panoramaResource(MENU_STYLE, STYLE) },
    { path: MENU_VIDEO, data: video }
  ];
  if (home) files.splice(1, 0, { path: 'panorama/layout/dashboard_page_home.vxml_c', data: panoramaResource('panorama/layout/dashboard_page_home.vxml_c', cleanHomePage(home)) });
  return buildVPK(files, { version: 2, md5 });
}
