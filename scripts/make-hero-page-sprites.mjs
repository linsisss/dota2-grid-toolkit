// The Dota 2 hero page («Герои» → «Снаряжение») for the /customize preview of the background behind
// the hero (src/customize/DotaHeroPage.jsx), made the way the main menu's is (make-menu-sprites.mjs,
// make-menu-rail.mjs):
//   node scripts/make-hero-page-sprites.mjs <screenshot 1920×1080> <panorama dir> [out dir] [second screenshot]
// <screenshot>: the page in the game, Shadow Fiend (supplied by the user on 2026-09-30; not in the
// repository). Only its opaque pieces are cut: the top bar with «ГЕРОИ» open (the shards count
// painted over as in the menu), ability icons, the set's item slots, the health and mana bars, the
// buttons; the level badge and the notes button are lifted off the ground around them by colour.
// <panorama dir>: the user's export of the game's pak01_dir.vpk (panorama/images/…: .vtex_c
// textures and .vsvg_c icons, decoded here). Text is rendered with Dota's own fonts; sizes, spacing,
// places, icon sizes and colours were matched to the screenshot pixel by pixel. Nothing is drawn by
// hand. The screenshot's client shows the colour-blind agility icon (yellow); the default green one is used.
// [second screenshot]: the same page with «Переодеть» at rest (on the first one the cursor lit it up,
// supplied by the user on 2026-09-30); the button is cut from it.
import { createCanvas, GlobalFonts, ImageData, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [source, panorama, out = new URL('../assets/dota-menu/ui/', import.meta.url).pathname, rest] = process.argv.slice(2);
if (!source || !panorama) throw new Error('Укажи скриншот страницы героя 1920×1080 и папку panorama из pak01_dir.vpk.');
const shot = await loadImage(source);
if (shot.width !== 1920 || shot.height !== 1080) throw new Error('Нужен скриншот ровно 1920×1080.');
const restShot = rest ? await loadImage(rest) : shot;
if (restShot.width !== 1920 || restShot.height !== 1080) throw new Error('Второй скриншот тоже должен быть 1920×1080.');
mkdirSync(out, { recursive: true });
const fonts = new URL('../assets/fonts/', import.meta.url).pathname;
for (const [family, file] of [['Reaver600', 'reaver-semibold'], ['Reaver400', 'reaver-regular'], ['Radiance400', 'radiance-regular'], ['Radiance600', 'radiance-semibold'], ['Radiance700', 'radiance-bold']])
  GlobalFonts.registerFromPath(`${fonts}${file}.otf`, family);

// Panorama images: a .vtex_c holds BGRA8888 pixels right after its DATA block (format 28) or a
// plain PNG there (format 16); a .vsvg_c holds the SVG text. `tint` recolours the image as
// Panorama's wash-color does (the role icons, the control icons).
async function texture(name, tint = null) {
  const bytes = readFileSync(`${panorama}/images/${name}.vtex_c`), view = new DataView(bytes.buffer, bytes.byteOffset);
  let data = 0, end = 0;
  for (let i = 0, at = 8 + view.getUint32(8, true); i < view.getUint32(12, true); i++, at += 12)
    if (bytes.toString('latin1', at, at + 4) === 'DATA') { data = at + 4 + view.getUint32(at + 4, true); end = data + view.getUint32(at + 8, true); }
  const width = view.getUint16(data + 20, true), height = view.getUint16(data + 22, true), format = bytes[data + 26];
  let image;
  if (format === 16) image = await loadImage(bytes.subarray(bytes.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]), end)));
  else if (format === 28) {
    const pixels = new Uint8ClampedArray(bytes.subarray(end, end + width * height * 4));
    for (let i = 0; i < pixels.length; i += 4) [pixels[i], pixels[i + 2]] = [pixels[i + 2], pixels[i]];
    image = createCanvas(width, height); image.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
  } else throw new Error(`${name}: формат ${format} не поддерживается.`);
  return tint ? tinted(image, tint) : image;
}
async function icon(name, tint) {
  const text = readFileSync(`${panorama}/images/${name}.vsvg_c`, 'latin1');
  return tinted(await loadImage(Buffer.from(text.slice(text.indexOf('<svg'), text.lastIndexOf('</svg>') + 6), 'latin1')), tint, 96);
}
function tinted(image, colour, size = null) {
  const canvas = createCanvas(size || image.width, size || image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-in'; context.fillStyle = colour; context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// A text style fitted to the ink box one sample has on the screenshot: the size from its height,
// the letter spacing from its width. `at` places another text of the same style by its ink box.
function style(family, sample, box) {
  const probe = createCanvas(8, 8).getContext('2d'), height = box[3] - box[1] + 1;
  const ink = (size, spacing) => { probe.font = `${size}px ${family}`; probe.letterSpacing = `${spacing}px`; return probe.measureText(sample); };
  let size = 20, m;
  for (let i = 0; i < 4; i++) { m = ink(size, 0); size *= height / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent); }
  m = ink(size, 0);
  const spacing = Math.max(0, ((box[2] - box[0] + 1) - (m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) / Math.max(1, [...sample].length - 1));
  // The ink's left edge from the origin is measured without spacing: @napi-rs/canvas adds the
  // letter spacing to actualBoundingBoxLeft although the first glyph does not move.
  const measure = (text) => {
    probe.font = `${size}px ${family}`; probe.letterSpacing = '0px'; const bearing = probe.measureText(text).actualBoundingBoxLeft;
    probe.letterSpacing = `${spacing}px`; const m = probe.measureText(text);
    return { bearing, width: bearing + m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent };
  };
  // (context, text, colour, left ink edge or { centre }, top of the capitals)
  const at = (context, text, colour, x, top) => {
    const t = measure(text), left = typeof x === 'object' ? x.centre - t.width / 2 : x;
    context.save(); context.font = `${size}px ${family}`; context.letterSpacing = `${spacing}px`; context.fillStyle = colour;
    context.fillText(text, left + t.bearing, top + measure('Н').ascent); context.restore();
  };
  return { at, sample: (context, colour) => at(context, sample, colour, box[0], box[1]) };
}
// A piece of the screenshot, optionally round (the talent tree, the Aghanim's upgrades button).
function cut(context, x, y, width, height, round = false, from = shot) {
  context.save();
  if (round) { context.beginPath(); context.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2); context.clip(); }
  context.drawImage(from, x, y, width, height, x, y, width, height); context.restore();
}
// A piece lifted off the page's ground: `alpha(r, g, b)` (0–1) keeps what belongs to it; `colour`
// replaces the pixels' own (for grey marks, whose edges would keep the red ground).
function lift(context, x, y, width, height, alpha, colour = null) {
  const canvas = createCanvas(width, height), piece = canvas.getContext('2d');
  piece.drawImage(shot, x, y, width, height, 0, 0, width, height);
  const pixels = piece.getImageData(0, 0, width, height), d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = Math.round(255 * Math.max(0, Math.min(1, alpha(d[i], d[i + 1], d[i + 2]))));
    if (colour) [d[i], d[i + 1], d[i + 2]] = colour;
  }
  piece.putImageData(pixels, 0, 0); context.drawImage(canvas, x, y);
}
const step = (value, from, to) => (value - from) / (to - from);
// Unlike the dark red ground: its distance from `ground`.
const apart = (ground, threshold = 22) => (r, g, b) => (Math.hypot(r - ground[0], g - ground[1], b - ground[2]) - threshold) / 64;
// A divider: white at 14%, fading out towards the hero.
function divider(context, x, y, width, height, fade) {
  const gradient = context.createLinearGradient(x, 0, x + width, 0);
  gradient.addColorStop(0, '#ffffff24'); gradient.addColorStop(fade, '#ffffff24'); gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient; context.fillRect(x, y, width, height);
}
// A picture of the page's area, in 1080p pixels.
async function sprite(name, left, top, width, height, draw) {
  const canvas = createCanvas(width, height), context = canvas.getContext('2d');
  context.translate(-left, -top); context.imageSmoothingQuality = 'high';
  await draw(context);
  writeFileSync(`${out}/${name}.webp`, await canvas.encode('webp', 100));
}

// Top bar: the screenshot's (the «ГЕРОИ» tab open), the shards count painted over like the menu's.
// Unlike the menu's, the logo's plate does not hang below the bar here.
await sprite('hero-bar', 0, 0, 1920, 61, (context) => {
  context.drawImage(shot, 0, 0);
  for (let y = 14; y <= 35; y++) {
    const row = context.getImageData(1617, y, 5, 1).data, rgb = [0, 1, 2].map((c) => Math.round((row[c] + row[4 + c] + row[8 + c] + row[12 + c] + row[16 + c]) / 5));
    context.fillStyle = `rgb(${rgb.join(',')})`; context.fillRect(1538, y, 79, 1);
  }
  context.save(); context.font = '22px Radiance600'; context.fillStyle = '#e6cf88'; context.letterSpacing = '2px';
  context.shadowColor = '#d7a2448c'; context.shadowBlur = 8; context.fillText('10 000', 1540, 33); context.restore();
});

// Sub-tabs: the hero's icon and the tabs (centred on the screen), the neighbours at the edges.
const TABS = [['СНАРЯЖЕНИЕ', 393], ['ПРОГРЕСС', 593], ['ПОКАЗАТЕЛИ', 751], ['РУКОВОДСТВА', 944], ['ТРЕНДЫ', 1152], ['О ГЕРОЕ', 1288], ['ИЗМЕНЕНИЯ', 1427]];
const tabs = style('Radiance400', 'СНАРЯЖЕНИЕ', [393, 80, 542, 92]);
await sprite('hero-tabs', 350, 64, 1220, 44, (context) => {
  lift(context, 355, 74, 32, 26, apart([8, 0, 0], 16));
  TABS.forEach(([text, x], i) => tabs.at(context, text, i ? '#8b989e' : '#eeebf1', x, 80));
  for (const x of [568, 726, 919, 1128, 1264, 1402]) tabs.at(context, '/', '#7c8689', x, 80);
});
const neighbour = style('Radiance600', 'SHADOW SHAMAN', [1686, 81, 1826, 90]);
await sprite('hero-prev', 56, 72, 170, 28, async (context) => {
  context.drawImage(await icon('control_icons/24px/arrow_left', '#5d5d5f'), 58, 73, 24, 24);
  neighbour.at(context, 'SHADOW DEMON', '#5e5d60', 89, 81);
});
await sprite('hero-next', 1680, 72, 186, 28, async (context) => {
  neighbour.sample(context, '#5e5d60');
  context.drawImage(await icon('control_icons/24px/arrow_right', '#5d5d5f'), 1838, 73, 24, 24);
});

// Left column: name, attribute / complexity / attack type / roles, abilities, stats, bars, buttons.
await sprite('hero-left', 80, 200, 580, 460, async (context) => {
  style('Reaver600', 'SHADOW FIEND', [93, 227, 536, 268]).sample(context, '#ffffff');
  // The notes button: grey dashes and icon on red, read from the blue channel.
  lift(context, 544, 218, 64, 62, (r, g, b) => step(b, 6, 96), [142, 140, 146]);
  context.drawImage(await texture('primary_attribute_icons/primary_attribute_icon_agility_psd'), 90, 291, 32, 32);
  for (let i = 0; i < 3; i++) context.drawImage(await texture(i < 2 ? 'hero_complexity_full_png' : 'hero_complexity_empty_png'), 135 + i * 22, 298, 18, 18);
  const label = style('Radiance600', 'ТИП АТАКИ:', [208, 303, 300, 312]);
  label.sample(context, '#b0b2b3'); label.at(context, 'МЕТКИ:', '#b0b2b3', 351, 303);
  const role = async (name, x) => context.drawImage(await texture(`control_icons/filter_${name}_png`, '#8b989e'), x, 295, 30, 24);
  await role('ranges', 306); await role('carry', 413); await role('nuker', 441);
  for (let i = 0; i < 8; i++) cut(context, 90 + i * 60, 330, 52, 52, i < 2);
  context.drawImage(await texture('hud/reborn/aghs_off_large_png'), 570, 330, 52, 52);
  divider(context, 90, 412, 540, 1, 0.55); divider(context, 90, 582, 540, 1, 0.55);
  context.fillStyle = '#ffffff24'; context.fillRect(217, 413, 1, 169);
  // Attributes: title, icon, value; a group every 48 px.
  const title = style('Radiance400', 'ЛОВКОСТЬ', [90, 482, 159, 489]), value = style('Radiance600', '25 + 3.6', [119, 500, 183, 512]);
  const attributes = [['СИЛА', 'strength', '19 + 2.7', 91], ['ЛОВКОСТЬ', 'agility', '25 + 3.6', 90], ['ИНТЕЛЛЕКТ', 'intelligence', '16 + 2.2', 91]];
  for (const [i, [name, attribute, number, x]] of attributes.entries()) {
    title.at(context, name, '#a39c9a', x, 433 + i * 49);
    context.drawImage(await texture(`primary_attribute_icons/mini_primary_attribute_icon_${attribute}_psd`), 90, 448 + i * 48, 20, 20);
    value.at(context, number, '#ecebf0', 119, 451 + i * 48);
  }
  // Derived stats: an icon over a value, both centred on the column.
  const number = style('Radiance600', '305', [345, 455, 366, 464]);
  const stats = [['damage', '41 - 47', 256, 17], ['armor', '4.2', 305, 17], ['speed', '305', 355, 17], ['attack_speed2', '1.6', 404, 18.5], ['attack_speed3', '125', 454, 18], ['attack_range', '525', 502.5, 20.5]];
  for (const [file, text, centre, size] of stats) {
    context.drawImage(await texture(`hud/reborn/icon_${file}_psd`), centre + 0.5 - size / 2, 438.5 - size / 2, size, size);
    number.at(context, text, '#d6d5dc', { centre }, 455);
  }
  const resource = style('Radiance400', 'ЗАПАС ЗДОРОВЬЯ', [235, 481, 347, 490]);
  resource.sample(context, '#a79ca5'); resource.at(context, 'ЗАПАС МАНЫ', '#a79ca5', 235, 525);
  cut(context, 234, 494, 196, 24); cut(context, 234, 540, 196, 22);
  cut(context, 90, 615, 62, 34); cut(context, 160, 615, 204, 34);
});

// Right column: level, the set (items and «Переодеть»); «Показать в арсенале» sits at the edge.
await sprite('hero-right', 1300, 196, 540, 470, async (context) => {
  // The level badge (a 3D model): gold and the white number, not the orange glow and fire around it.
  lift(context, 1306, 200, 90, 80, (r, g, b) => Math.min(step(g / Math.max(r, 1), 0.66, 0.8), step(g, 60, 110)));
  style('Radiance600', 'ПРОГРЕСС УРОВНЯ', [1410, 231, 1591, 242]).sample(context, '#eeecf3');
  cut(context, 1408, 256, 411, 8);
  const points = style('Radiance400', '125 ОП.', [1410, 277, 1466, 286]);
  points.sample(context, '#e8c78f'); points.at(context, '/', '#b4b1b5', 1475, 277); points.at(context, '2 200 ОП.', '#b4b1b5', 1490, 277);
  context.drawImage(await icon('control_icons/24px/armory', '#dae2e5'), 1376, 337, 24, 24);
  style('Radiance700', 'ВЫБРАНО', [1409, 342, 1503, 353]).sample(context, '#eeedf0');
  style('Reaver400', 'Ваш набор', [1410, 377, 1520, 399]).sample(context, '#e0e6e5');
  for (let i = 0; i < 5; i++) cut(context, 1408 + i * 84, 420, 76, 76);
  cut(context, 1408, 504, 76, 76);
  cut(context, 1408, 604, 221, 56, false, restShot);
});
await sprite('hero-armory', 1631, 137, 229, 34, (context) => cut(context, 1631, 137, 229, 34));
// Bottom left: the menu's party bar is reused (DotaMenu); with the friends list closed, the round
// friends button stands beside it.
{
  const canvas = createCanvas(60, 60), context = canvas.getContext('2d');
  context.beginPath(); context.arc(30, 30, 29, 0, Math.PI * 2); context.clip();
  context.drawImage(shot, 406, 996, 60, 60, 0, 0, 60, 60);
  writeFileSync(`${out}/hero-friends.webp`, await canvas.encode('webp', 100));
}
console.log('Готово:', out);
