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
// Not replaceable: the 3D portrait of the HUD's bottom panel (DOTAPortrait renders the hero's model) and
// the minimap (one sheet of every hero: materials/vgui/hud/minimap_hero_sheet.vtex_c).
// A hero's variants (arcana styles alt1…, personas, event looks: scripts/hero-portraits-data.mjs) get
// the same picture, so equipped items do not bring Valve's back. The pack is pak05_dir.vpk in
// dota_russian (scripts/customize-pack.mjs); every picture is written at Valve's size for its place
// (scripts/dota-vtex.mjs), a still picture also as a still movie (else the hover would play Valve's).
import TABLE from './hero-portraits-data.mjs';
import { buildVPK, readVPK } from './vpk.mjs';
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
//   Entry: { hero: id, kind: 'image' | 'video', source: { name, size, type, media? }, crop: { x, y, zoom }, start: seconds }
// `media` is the SHA-256 of the user's file (kept in this browser: src/customize/look-store.js «media»).
// Anything unreadable is dropped, not thrown: the section starts as in Dota.
export function portraitsState(input) {
  const list = Array.isArray(input?.heroes) ? input.heroes : [], seen = new Set(), heroes = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !hasHero(item.hero) || seen.has(item.hero) || heroes.length >= PORTRAIT_LIMITS.heroes) continue;
    const source = item.source && typeof item.source === 'object' ? item.source : {};
    const crop = item.crop && typeof item.crop === 'object' ? item.crop : {};
    const number = (value, low, high, fallback) => (Number.isFinite(value) ? Math.round(clamp(value, low, high) * 10_000) / 10_000 : fallback);
    seen.add(item.hero);
    heroes.push({
      hero: item.hero, kind: item.kind === 'video' ? 'video' : 'image',
      source: { name: String(source.name ?? '').slice(0, 200), size: Number.isSafeInteger(source.size) && source.size >= 0 ? source.size : 0, type: String(source.type ?? '').slice(0, 60),
        ...(typeof source.media === 'string' && /^[a-f0-9]{64}$/.test(source.media) ? { media: source.media } : {}) },
      crop: { x: number(crop.x, 0, 1, DEFAULT_CROP.x), y: number(crop.y, 0, 1, DEFAULT_CROP.y), zoom: number(crop.zoom, ...PORTRAIT_LIMITS.zoom, 1) },
      start: number(item.start, 0, 86_400, 0)
    });
  }
  return { heroes };
}

// ——— The pack: pak05_dir.vpk. `items`: [{ hero, card, wide, icon (RGBA of each place's size), movie (WebM bytes) }];
// md5 for the VPK. A hero's variants share one copy of each file.
export async function heroPortraitsPack(items, { md5 }) {
  const files = [];
  for (const item of items) {
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
  return files.length ? buildVPK(files, { version: 2, md5, share: true }) : null;
}
const isWebM = (bytes) => bytes.length > 64 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && new TextDecoder('latin1').decode(bytes.subarray(0, 64)).includes('webm');

// What the server lets the PowerShell command install from pak05 (server/install-packs.mjs): only the
// paths of PORTRAIT_FILES; a picture is a texture of exactly its place's size and format with a whole
// PNG (or the raw pixels) after it; a movie is a WebM. → '' or why not.
export function portraitsPackProblem(bytes) {
  let files;
  try { files = readVPK(bytes).files; } catch { return 'Это не портреты героев GridStudio.'; }
  if (!files.length || files.length > PORTRAIT_LIMITS.heroes * 40) return 'Это не портреты героев GridStudio.';
  const seen = new Set();
  for (const file of files) {
    const known = PORTRAIT_FILES.get(file.path);
    if (!known || seen.has(file.path)) return 'В портретах героев есть лишний файл.';
    seen.add(file.path);
    if (file.data.length !== file.length) return 'Файл портрета повреждён.';
    if (known.kind === 'movie') { if (!isWebM(file.data) || file.data.length > PORTRAIT_LIMITS.movieBytes) return 'Видео портрета повреждено.'; continue; }
    const place = PORTRAIT_PLACES[known.kind];
    let texture;
    try { texture = readVtex(file.data); } catch { return 'Картинка портрета повреждена.'; }
    const format = place.format === 'png' ? VTEX_FORMATS.PNG_RGBA8888 : VTEX_FORMATS.BGRA8888;
    if (texture.version !== 1 || texture.blocks.join() !== 'REDI,DATA' || texture.width !== place.width || texture.height !== place.height || texture.depth !== 1
      || texture.format !== format || texture.mips !== 1 || texture.flags !== place.flags) return 'Картинка портрета не того размера.';
    if (place.format === 'png') {
      const size = pngSize(texture.payload);
      if (!size || size.width !== place.width || size.height !== place.height || texture.payload.length > 1_000_000) return 'Картинка портрета повреждена.';
    } else if (texture.payload.length !== place.width * place.height * 4) return 'Картинка портрета повреждена.';
  }
  return '';
}
