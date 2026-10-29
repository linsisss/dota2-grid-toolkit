// «Портреты героев» (2026-10-22, the owner: «вместо портрета героя ставить своё видео/фото»): the user's
// picture or video in place of a hero's portrait everywhere in Dota (not in one grid: the game's own
// files of that hero are replaced). What Dota draws a hero with (Valve's layouts and styles, checked
// 2026-10-22 against the pak01 of that day; docs/customize.md «Портреты героев»):
//   card  panorama/images/heroes/selection/npc_dota_hero_<name>_png.vtex_c, 142 × 188 — DOTAHeroImage
//         heroimagestyle="portrait": the cards of the hero grid (menu «Герои», the pick screen), the hover
//         card, profiles and match pages;
//   wide  panorama/images/heroes/npc_dota_hero_<name>_png.vtex_c, 128 × 72 — the default style
//         («landscape»): the top bar (66 × 36), the scoreboard (88 × 54), the pick screen's players;
//   icon  panorama/images/heroes/icons/npc_dota_hero_<name>_png.vtex_c, 32 × 32 — the small icons:
//         kill feed, chat, bounties, captain's mode lists;
//   movie panorama/videos/heroes/npc_dota_hero_<name>.webm, 256 × 256 VP8, 30 fps, looped —
//         DOTAHeroMovie over the card when it is hovered (tooltip_hero_card: 151 × 200, centred on the
//         card), and the featured heroes of profiles and match pages. The movie is the card's own frame
//         stretched to the square: Dota stretches the whole 256 × 256 into the 151 × 200 card, it does
//         not cut it (Valve's Juggernaut: his 142 × 188 card is his movie's first frame squeezed back,
//         NCC 0.995; the owner's hover, 22.10.2026: a movie whose middle was the card came out
//         squeezed sideways, with the blurred sides showing, so the card «stretched» on hover).
// Where the card is seen (hero_grid_new.css; the owner's screenshots of 22.10.2026, docs/customize.md):
//   in the grid a card is 43 × 75 of the grid's units (a 51 × 83 cell less 4 px of margin around the
//   image), much narrower than the picture: DOTAHeroImage scaling="stretch-to-cover-preserve-aspect"
//   keeps the picture's whole height and cuts its sides (gridCardRect; 76 % of the width shows), and
//   `saturation: 0.7` greys it (panoramaSaturation); hovered, the tooltip shows the whole picture in
//   colour. So the hover card is wider than the grid's, never the same cut, but with this framing it is
//   the same picture: same middle, same height, nothing stretched.
// The 3D portrait of the HUD's bottom panel (DOTAPortrait renders the hero's model) is not a file of the
// hero, but since 2026-10-24 it can show the user's picture too, on request per hero (HUD_PORTRAIT below:
// our copy of Valve's portrait layout and a style keyed on Dota's per-hero class). Not replaceable: the
// minimap (one sheet of every hero: materials/vgui/hud/minimap_hero_sheet.vtex_c).
// A hero's variants (arcana styles alt1…, personas, event looks: scripts/hero-portraits-data.mjs) get
// the same picture, so equipped items do not bring Valve's back. The pack is pak05_dir.vpk in
// dota_russian (scripts/customize-pack.mjs); every picture is written at Valve's size for its place
// (scripts/dota-vtex.mjs), a still picture also as a still movie (else the hover would play Valve's).
import TABLE from './hero-portraits-data.mjs';
import { buildVPK, panoramaResource, panoramaSource, readVPK } from './vpk.mjs';
import { VTEX_FLAGS, VTEX_FORMATS, pngSize, readVtex, vtexResource } from './dota-vtex.mjs';

const { noLod, clampS, clampT, clampU, dilateColor } = VTEX_FLAGS;
// Each place as Valve's file there is: size, format and flags (the formats Valve itself uses there).
export const PORTRAIT_PLACES = Object.freeze({
  card: Object.freeze({ dir: 'panorama/images/heroes/selection/', width: 142, height: 188, format: 'png', flags: noLod | dilateColor }),
  wide: Object.freeze({ dir: 'panorama/images/heroes/', width: 128, height: 72, format: 'png', flags: noLod | dilateColor | clampS | clampT | clampU }),
  icon: Object.freeze({ dir: 'panorama/images/heroes/icons/', width: 32, height: 32, format: 'bgra', flags: noLod | clampS | clampT | clampU })
});
export const PORTRAIT_MOVIE = Object.freeze({ dir: 'panorama/videos/heroes/', side: 256, fps: 30, bitrate: 1_500_000, stillSeconds: 4 });
export const PORTRAIT_LIMITS = Object.freeze({ heroes: 30, seconds: 8, fileBytes: 50_000_000, movieBytes: 4_000_000, zoom: [1, 6] });
// A card of the hero grid (hero_grid_new.css .HeroCard 51 × 83, #HeroImage margin 4px; core.heroLayout),
// at any size the grid gives it, and Valve's greying of it there.
export const GRID_CARD = Object.freeze({ width: 43, height: 75, saturation: 0.7 });
// The hover card (tooltip_hero_card.css #DefaultContents, inside a 2 px black border).
export const HOVER_CARD = Object.freeze({ width: 151, height: 200 });

// ——— Heroes.
export const portraitHeroIds = Object.freeze(Object.keys(TABLE).map(Number));
const hasHero = (id) => Object.hasOwn(TABLE, String(id));
// The game files a hero's portrait replaces: { card: [paths], wide, icon, movie }.
export function portraitPaths(id) {
  const hero = TABLE[id];
  if (!hero) throw new Error(`Нет героя ${id}`);
  const name = `npc_dota_hero_${hero.name}`, names = (kind) => [name, ...(hero.variants?.[kind] || []).map((variant) => `${name}_${variant}`)];
  return {
    ...Object.fromEntries(Object.entries(PORTRAIT_PLACES).map(([kind, place]) => [kind, names(kind).map((file) => `${place.dir}${file}_png.vtex_c`)])),
    movie: names('movie').map((file) => `${PORTRAIT_MOVIE.dir}${file}.webm`)
  };
}
export const portraitName = (id) => TABLE[id]?.name ?? null;
// Every path a pack may hold → { hero, kind }.
export const PORTRAIT_FILES = new Map(portraitHeroIds.flatMap((id) => Object.entries(portraitPaths(id)).flatMap(([kind, paths]) => paths.map((path) => [path, { hero: id, kind }]))));

// ——— Framing. One frame per hero: `x`, `y` the centre (0–1 of the picture), `zoom` from 1 (the picture
// covers the place) up. Every place cuts its own shape around that centre at that zoom, inside the picture.
export const DEFAULT_CROP = Object.freeze({ x: 0.5, y: 0.4, zoom: 1 });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export function cropRect(sourceWidth, sourceHeight, width, height, crop = DEFAULT_CROP) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * clamp(crop.zoom, ...PORTRAIT_LIMITS.zoom);
  const w = width / scale, h = height / scale;
  return { x: clamp(crop.x * sourceWidth - w / 2, 0, sourceWidth - w), y: clamp(crop.y * sourceHeight - h / 2, 0, sourceHeight - h), w, h };
}
// The movie: the card's cut (of the picture's pixels), drawn stretched to the whole 256 × 256 square
// as Valve's movies are; Dota stretches it back into the hover card, so the hover shows the card.
export const movieRect = (sourceWidth, sourceHeight, crop = DEFAULT_CROP) => cropRect(sourceWidth, sourceHeight, PORTRAIT_PLACES.card.width, PORTRAIT_PLACES.card.height, crop);
// What a place of `width` × `height` shows of a picture of `sourceWidth` × `sourceHeight` it is given
// (Panorama's stretch-to-cover-preserve-aspect): the picture scaled to cover it, cut in the middle.
export function coverRect(sourceWidth, sourceHeight, width, height) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight), w = width / scale, h = height / scale;
  return { x: (sourceWidth - w) / 2, y: (sourceHeight - h) / 2, w, h };
}
// The part of the 142 × 188 card picture a card of the hero grid shows: its whole height, the middle
// 76 % of its width.
export const gridCardRect = () => coverRect(PORTRAIT_PLACES.card.width, PORTRAIT_PLACES.card.height, GRID_CARD.width, GRID_CARD.height);
// Panorama's `saturation` on RGBA pixels (in place), as the owner's screenshots show it (22.10.2026: his
// card in the grid against the same picture unfiltered, fitted to 3.7 levels RMS with Valve's 0.7 and
// nothing else): in linear light, every channel moves toward the pixel's brightest one, so a red stays
// as bright and turns pink. A CSS saturate() moves toward grey luma instead (the red darkens; 15 levels off).
const toLinear = new Float64Array(256).map((_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const fromLinear = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
export function panoramaSaturation(rgba, amount = GRID_CARD.saturation) {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = toLinear[rgba[i]], g = toLinear[rgba[i + 1]], b = toLinear[rgba[i + 2]], top = Math.max(r, g, b);
    rgba[i] = fromLinear(top - amount * (top - r)); rgba[i + 1] = fromLinear(top - amount * (top - g)); rgba[i + 2] = fromLinear(top - amount * (top - b));
  }
  return rgba;
}
// The frame moved by a drag of (dx, dy) place pixels on a place of `width` × `height`.
export function dragCrop(crop, sourceWidth, sourceHeight, width, height, dx, dy) {
  const rect = cropRect(sourceWidth, sourceHeight, width, height, crop), k = rect.w / width;
  const x = clamp(rect.x - dx * k + rect.w / 2, rect.w / 2, sourceWidth - rect.w / 2) / sourceWidth;
  const y = clamp(rect.y - dy * k + rect.h / 2, rect.h / 2, sourceHeight - rect.h / 2) / sourceHeight;
  return { ...crop, x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
}

// ——— The section's state (kept in localStorage «gridstudio.portraits», CustomizePage's «Портреты героев»;
// the same shape a saved «Оформление» can carry): { heroes: [Entry] }
//   Entry: { hero: id, kind: 'image' | 'video', source: { name, size, type, media? }, crop: { x, y, zoom }, start: seconds,
//            hud?: true, hudCrop?: { x, y, zoom } }
// `media` is the SHA-256 of the user's file (kept in this browser: src/customize/look-store.js «media»).
// `hud` (2026-10-24, «Также использовать свой портрет в игре»): the same file in the HUD's portrait too, framed
// by `hudCrop` (a square); both only when set, so entries without them keep the shape of before.
// Anything unreadable is dropped, not thrown: the section starts as in Dota.
export function portraitsState(input) {
  const list = Array.isArray(input?.heroes) ? input.heroes : [], seen = new Set(), heroes = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !hasHero(item.hero) || seen.has(item.hero) || heroes.length >= PORTRAIT_LIMITS.heroes) continue;
    const source = item.source && typeof item.source === 'object' ? item.source : {};
    const crop = item.crop && typeof item.crop === 'object' ? item.crop : {};
    const number = (value, low, high, fallback) => (Number.isFinite(value) ? Math.round(clamp(value, low, high) * 10_000) / 10_000 : fallback);
    const frame = (value, fallback) => ({ x: number(value?.x, 0, 1, fallback.x), y: number(value?.y, 0, 1, fallback.y), zoom: number(value?.zoom, ...PORTRAIT_LIMITS.zoom, 1) });
    const hudCrop = item.hudCrop && typeof item.hudCrop === 'object' ? frame(item.hudCrop, DEFAULT_CROP) : null;
    seen.add(item.hero);
    heroes.push({
      hero: item.hero, kind: item.kind === 'video' ? 'video' : 'image',
      source: { name: String(source.name ?? '').slice(0, 200), size: Number.isSafeInteger(source.size) && source.size >= 0 ? source.size : 0, type: String(source.type ?? '').slice(0, 60),
        ...(typeof source.media === 'string' && /^[a-f0-9]{64}$/.test(source.media) ? { media: source.media } : {}) },
      crop: frame(crop, DEFAULT_CROP),
      start: number(item.start, 0, 86_400, 0),
      ...(item.hud === true ? { hud: true } : {}),
      ...(hudCrop ? { hudCrop } : {})
    });
  }
  return { heroes };
}

// ——— The HUD portrait (2026-10-24, the owner: «Также использовать свой портрет в игре (портрет в HUD)»).
// The lower-left portrait of the match HUD is a DOTAPortrait (hud_reborn.xml: #PortraitGroup 159 × 145 >
// #PortraitContainer, which clips, > #portraitHUD and #portraitHUDOverlay). DOTAPortrait renders the selected
// unit's 3D model and loads Valve's layout panorama/layout/hud/dota_hud_portrait.xml into itself (its root is
// <DOTAPortrait>: #LowerOverlay, a gradient to black over the bottom 30 %, and two buttons), so the panels of
// that layout are drawn over the model. Dota marks an ancestor of the portrait with the unit's name as a class:
// hud_reborn.css colours #PortraitBackerColor (a sibling of #PortraitContainer) per hero with 114 rules like
// `.npc_dota_hero_abaddon #PortraitBackerColor`, and the ability panel styles `.npc_dota_hero_rubick #Ability3`
// the same way; Valve's own portrait style reaches past its layout to such ancestors (`#PortraitContainer:hover
// .PortraitButton`, `.IsLocalPlayerSpectating … #ReportUserButton`). So our copy of Valve's portrait layout
// (byte for byte Valve's text plus our lines) puts, under #LowerOverlay and the buttons, one panel of each
// chosen hero's own picture, and our new style shows it only under that hero's class:
//   a video   <MoviePanel id="GridStudioHudMovie_<name>"> of panorama/videos/gridstudio/hud/npc_dota_hero_<name>.webm
//             (square VP8, BT.601 like the hover movies, looped);
//   a picture one <Panel id="GridStudioHudImage"> whose background-image the style sets per hero class
//             (panorama/images/gridstudio/hud/npc_dota_hero_<name>_png.vtex_c), so stills cost no video player.
// The panel covers the whole DOTAPortrait, which keeps rendering the model under it (nothing can stop that
// from a style). Valve's states still act on it (silenced blur, the stun animation, the dead wash: they are
// rules on #portraitHUD), the right edge's blur copy (`<Image src="panel://portraitHUD">`, which copies the
// panel with its children, as Valve's list shadows do) blurs it, and #LowerOverlay darkens its bottom. The
// second portrait, #portraitHUDOverlay (shown at half opacity when stunned or dead), would bring the 3D hero
// back over it, so the style collapses it for these heroes (visibility, which Valve never animates there).
// What of the picture shows (1080p, Valve's sizes): #portraitHUD is 175 × 175, bottom-aligned and moved by
// translate(-16px, 14px) inside the 159 × 145 container, so its window is x 16–175, y 16–161; Valve's stats
// (#stats_container, z-index 5, the same box) lie over its right side on a gradient to black.
export const HUD_PORTRAIT = Object.freeze({
  layout: 'panorama/layout/hud/dota_hud_portrait.vxml_c',
  style: 'panorama/styles/hud/gridstudio_hud_portrait.vcss_c',
  movieDir: 'panorama/videos/gridstudio/hud/',
  imageDir: 'panorama/images/gridstudio/hud/',
  // The media: a square (the panel is square), at more than the panel's 175 px so 1440p and 4K stay sharp.
  side: 256, fps: 30, bitrate: 1_500_000,
  image: Object.freeze({ format: 'png', flags: noLod | dilateColor | clampS | clampT | clampU }),
  // The panel and the part of it that shows (1080p px), #LowerOverlay's share at the bottom, and where Valve's
  // stats gradient starts and turns black (share of the window's width: 0.4 clear, 0.6 #00000088, 1 black).
  panel: 175, view: Object.freeze({ x: 16, y: 16, width: 159, height: 145 }), fade: 0.3, stats: Object.freeze([0.4, 0.6, 0.7, 0.8, 1]),
  // How many heroes' videos one HUD holds (each is a MoviePanel of its own, collapsed but loaded).
  videos: 10
});
const hudName = (id) => { const name = portraitName(id); if (!name) throw new Error(`Нет героя ${id}`); return name; };
export const hudMoviePath = (id) => `${HUD_PORTRAIT.movieDir}npc_dota_hero_${hudName(id)}.webm`;
export const hudImagePath = (id) => `${HUD_PORTRAIT.imageDir}npc_dota_hero_${hudName(id)}_png.vtex_c`;
// Paths in Panorama sources are written as Valve's compiled files write them (with «_c» for resources).
const HUD_STYLE_INCLUDE = '<include src="s2r://panorama/styles/hud/dota_hud_portrait.vcss_c" />';
const HUD_ROOT = /\n(\t*)<DOTAPortrait>\n/;
// heroes: [{ hero, kind: 'image' | 'video' }] → the same, valid, one per hero, in hero order.
const hudHeroes = (heroes) => [...new Map(heroes.filter((item) => hasHero(item?.hero)).map((item) => [item.hero, { hero: item.hero, kind: item.kind === 'video' ? 'video' : 'image' }])).values()]
  .sort((a, b) => a.hero - b.hero);
// Our lines in Valve's layout: the style after Valve's portrait style, the panels first in <DOTAPortrait> (under
// #LowerOverlay and the buttons). `valve`: Valve's text (assets/dota-menu/dota_hud_portrait.xml).
export function hudPortraitLayout(valve, heroes) {
  const list = hudHeroes(heroes);
  if (valve.split(HUD_STYLE_INCLUDE).length !== 2 || (valve.match(new RegExp(HUD_ROOT.source, 'g')) || []).length !== 1) throw new Error('В dota_hud_portrait.xml не найден портрет Valve.');
  const panels = [
    ...(list.some((item) => item.kind === 'image') ? ['<Panel id="GridStudioHudImage" hittest="false" />'] : []),
    ...list.filter((item) => item.kind === 'video').map((item) => `<MoviePanel id="GridStudioHudMovie_${hudName(item.hero)}" class="GridStudioHudMovie" src="s2r://${hudMoviePath(item.hero)}" repeat="true" autoplay="onload" hittest="false" />`)
  ];
  return valve.replace(HUD_STYLE_INCLUDE, `${HUD_STYLE_INCLUDE}\n\t\t<include src="s2r://${HUD_PORTRAIT.style}" />`)
    .replace(HUD_ROOT, (line, indent) => `${line}${panels.map((panel) => `${indent}\t${panel}\n`).join('')}`);
}
export function hudPortraitStyle(heroes) {
  const list = hudHeroes(heroes), images = list.filter((item) => item.kind === 'image'), videos = list.filter((item) => item.kind === 'video');
  const cls = (item) => `.npc_dota_hero_${hudName(item.hero)}`;
  return [
    '/* GridStudio: the user\'s own hero portraits in place of the 3D portrait of the HUD (Hero portraits). */',
    '#GridStudioHudImage,\n.GridStudioHudMovie\n{\n\twidth: 100%;\n\theight: 100%;\n\tvisibility: collapse;\n}\n',
    ...(images.length ? ['#GridStudioHudImage\n{\n\tbackground-size: 100% 100%;\n\tbackground-repeat: no-repeat;\n}\n'] : []),
    ...images.map((item) => `${cls(item)} #GridStudioHudImage\n{\n\tbackground-image: url("s2r://${hudImagePath(item.hero)}");\n\tvisibility: visible;\n}\n`),
    ...videos.map((item) => `${cls(item)} #GridStudioHudMovie_${hudName(item.hero)}\n{\n\tvisibility: visible;\n}\n`),
    '/* Valve\'s second portrait (half opacity when stunned or dead) would show the 3D hero over ours. */',
    `${list.map((item) => `${cls(item)} #portraitHUDOverlay`).join(',\n')}\n{\n\tvisibility: collapse;\n}\n`
  ].join('\n');
}
// The rules every Panorama file of ours keeps (docs/customize.md): ASCII only, and none of our lines carries a
// handler (a layout at a new path with one fails to load, and a failed layout stops Dota).
function hudPanorama(path, source, valve = '') {
  if (/[^\x00-\x7f]/.test(source)) throw new Error(`Не-ASCII в ${path}: Dota не загрузит HUD.`);
  const ours = valve ? source.split('\n').filter((line) => !valve.split('\n').includes(line)).join('\n') : source;
  if (/\son[a-z]+\s*=/.test(ours)) throw new Error(`Обработчик событий в ${path}: Dota не загрузит HUD.`);
  return { path, data: panoramaResource(path, source) };
}
// The layout and the style of `heroes` ([{ hero, kind }]): [{ path, data }], or [] for none.
export function hudPortraitFiles(valve, heroes) {
  if (!hudHeroes(heroes).length) return [];
  return [hudPanorama(HUD_PORTRAIT.layout, hudPortraitLayout(valve, heroes), valve), hudPanorama(HUD_PORTRAIT.style, hudPortraitStyle(heroes))];
}
// The square of the picture the HUD portrait shows, and what of it the window shows (for the preview and the frame).
export const hudRect = (sourceWidth, sourceHeight, crop = DEFAULT_CROP) => cropRect(sourceWidth, sourceHeight, HUD_PORTRAIT.side, HUD_PORTRAIT.side, crop);
// A new HUD frame from the card's: the same centre, the whole square.
export const hudCropFrom = (crop = DEFAULT_CROP) => ({ x: crop.x, y: crop.y, zoom: 1 });
// d2pfx mods that bring their own panorama/layout/hud/dota_hud_portrait.vxml_c (d2pfx's files at the catalog's
// commit, scanned 2026-10-24): only «Fluttershy Hud», whose copy is Valve's layout unchanged. pak04 is read
// before pak05, so with the HUD portrait on the pack leaves that one file out of pak04 (nothing of the skin is lost).
export const D2PFX_HUD_PORTRAIT_MODS = Object.freeze(['fluttershy-hud']);

// ——— The pack: pak05_dir.vpk. `items`: [{ hero, card, wide, icon (RGBA of each place's size), movie (WebM bytes),
// hud?: { image: RGBA HUD_PORTRAIT.side² } | { movie: WebM bytes } }]; md5 for the VPK; `hudValve`: Valve's portrait
// layout text (assets/dota-menu/dota_hud_portrait.xml), needed when an item has `hud`. A hero's variants share one
// copy of each file.
export async function heroPortraitsPack(items, { md5, hudValve = null }) {
  const files = [], hud = [];
  for (const item of items) {
    if (item.hud) {
      const side = HUD_PORTRAIT.side;
      if (item.hud.movie) {
        if (!(item.hud.movie instanceof Uint8Array) || !isWebM(item.hud.movie)) throw new Error(`Нет видео HUD для героя ${item.hero}`);
        files.push({ path: hudMoviePath(item.hero), data: item.hud.movie }); hud.push({ hero: item.hero, kind: 'video' });
      } else {
        if (!item.hud.image || item.hud.image.length !== side * side * 4) throw new Error(`Нет картинки HUD для героя ${item.hero}`);
        files.push({ path: hudImagePath(item.hero), data: await vtexResource({ path: hudImagePath(item.hero), rgba: item.hud.image, width: side, height: side, ...HUD_PORTRAIT.image }) });
        hud.push({ hero: item.hero, kind: 'image' });
      }
    }
    const paths = portraitPaths(item.hero);
    for (const [kind, place] of Object.entries(PORTRAIT_PLACES)) {
      const rgba = item[kind];
      if (!rgba || rgba.length !== place.width * place.height * 4) throw new Error(`Нет картинки «${kind}» для героя ${item.hero}`);
      const shared = await vtexResource({ path: paths[kind][0], rgba, width: place.width, height: place.height, format: place.format, flags: place.flags });
      for (const path of paths[kind]) files.push({ path, data: shared });
    }
    if (!(item.movie instanceof Uint8Array) || !isWebM(item.movie)) throw new Error(`Нет видео для героя ${item.hero}`);
    for (const path of paths.movie) files.push({ path, data: item.movie });
  }
  if (hud.length) {
    if (hud.filter((one) => one.kind === 'video').length > HUD_PORTRAIT.videos) throw new Error(`Видео в HUD — не больше ${HUD_PORTRAIT.videos} героев.`);
    if (typeof hudValve !== 'string') throw new Error('Нет разметки портрета Valve для HUD.');
    files.push(...hudPortraitFiles(hudValve, hud));
  }
  return files.length ? buildVPK(files, { version: 2, md5, share: true }) : null;
}
const isWebM = (bytes) => bytes.length > 64 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && new TextDecoder('latin1').decode(bytes.subarray(0, 64)).includes('webm');

// The HUD's files a pack may hold: path → { hero, kind: 'hudMovie' | 'hudImage' }.
const HUD_FILES = new Map(portraitHeroIds.flatMap((id) => [[hudMoviePath(id), { hero: id, kind: 'hudMovie' }], [hudImagePath(id), { hero: id, kind: 'hudImage' }]]));
// What the server lets the PowerShell command install from pak05 (server/install-packs.mjs): only the
// paths of PORTRAIT_FILES; a picture is a texture of exactly its place's size and format with a whole
// PNG (or the raw pixels) after it; a movie is a WebM. The HUD portrait (`hudValve`: Valve's layout text,
// read by the server from assets/dota-menu): its heroes' movies and pictures at our paths, and its layout and
// style exactly as hudPortraitFiles makes them for those heroes — so nothing else can reach the HUD. → '' or why not.
export function portraitsPackProblem(bytes, { hudValve = null } = {}) {
  let files;
  try { files = readVPK(bytes).files; } catch { return 'Это не портреты героев GridStudio.'; }
  if (!files.length || files.length > PORTRAIT_LIMITS.heroes * 42 + 2) return 'Это не портреты героев GridStudio.';
  const seen = new Set(), hud = [], panorama = new Map();
  const texture = (data, place) => {
    let read;
    try { read = readVtex(data); } catch { return 'Картинка портрета повреждена.'; }
    const format = place.format === 'png' ? VTEX_FORMATS.PNG_RGBA8888 : VTEX_FORMATS.BGRA8888;
    if (read.version !== 1 || read.blocks.join() !== 'REDI,DATA' || read.width !== place.width || read.height !== place.height || read.depth !== 1
      || read.format !== format || read.mips !== 1 || read.flags !== place.flags) return 'Картинка портрета не того размера.';
    if (place.format === 'png') {
      const size = pngSize(read.payload);
      if (!size || size.width !== place.width || size.height !== place.height || read.payload.length > 1_000_000) return 'Картинка портрета повреждена.';
    } else if (read.payload.length !== place.width * place.height * 4) return 'Картинка портрета повреждена.';
    return '';
  };
  for (const file of files) {
    if (seen.has(file.path)) return 'В портретах героев есть лишний файл.';
    seen.add(file.path);
    if (file.data.length !== file.length) return 'Файл портрета повреждён.';
    if (file.path === HUD_PORTRAIT.layout || file.path === HUD_PORTRAIT.style) { panorama.set(file.path, file.data); continue; }
    const own = HUD_FILES.get(file.path);
    if (own) {
      hud.push({ hero: own.hero, kind: own.kind === 'hudMovie' ? 'video' : 'image' });
      if (own.kind === 'hudMovie') { if (!isWebM(file.data) || file.data.length > PORTRAIT_LIMITS.movieBytes) return 'Видео портрета повреждено.'; continue; }
      const problem = texture(file.data, { width: HUD_PORTRAIT.side, height: HUD_PORTRAIT.side, ...HUD_PORTRAIT.image });
      if (problem) return problem;
      continue;
    }
    const known = PORTRAIT_FILES.get(file.path);
    if (!known) return 'В портретах героев есть лишний файл.';
    if (known.kind === 'movie') { if (!isWebM(file.data) || file.data.length > PORTRAIT_LIMITS.movieBytes) return 'Видео портрета повреждено.'; continue; }
    const problem = texture(file.data, PORTRAIT_PLACES[known.kind]);
    if (problem) return problem;
  }
  // The HUD: both Panorama files exactly ours for the heroes whose media came, or neither (nor any media).
  if (hud.length || panorama.size) {
    if (new Set(hud.map((item) => item.hero)).size !== hud.length || hud.filter((item) => item.kind === 'video').length > HUD_PORTRAIT.videos || typeof hudValve !== 'string') return 'Портрет HUD повреждён.';
    let expected;
    try { expected = hudPortraitFiles(hudValve, hud); } catch { return 'Портрет HUD повреждён.'; }
    if (expected.length !== panorama.size) return 'Портрет HUD повреждён.';
    for (const { path, data } of expected) {
      const got = panorama.get(path);
      let same = false;
      try { same = !!got && panoramaSource(got) === panoramaSource(data) && got.length === data.length && got.every((byte, i) => byte === data[i]); } catch { same = false; }
      if (!same) return 'Портрет HUD не совпадает с GridStudio.';
    }
  }
  return '';
}
