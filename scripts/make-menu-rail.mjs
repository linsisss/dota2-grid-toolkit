// Renders the friends rail of the /customize menu preview into one picture, so its text looks the
// same everywhere: browsers on Windows draw Radiance with ClearType and noticeably heavier than
// Dota's grayscale FreeType; Skia here draws it the way the screenshot shows it.
//   node scripts/make-menu-rail.mjs        → assets/dota-menu/ui/rail.webp (2× pixels)
// Everything is placed in rail pixels (the rail's top-left is 32, 100 on a 1080p screen), with the
// positions measured on the menu screenshot: avatar 36 px every 44 px, name baseline +16 px,
// status +33 px, text from x 79. The chrome pieces are cut by scripts/make-menu-sprites.mjs.
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const ui = (name) => loadImage(`${root}assets/dota-menu/ui/${name}`);
const portrait = (id) => loadImage(`${root}assets/portraits/${id}.webp`);
for (const [family, file] of [['Radiance300', 'radiance-light'], ['Radiance400', 'radiance-regular'], ['Radiance600', 'radiance-semibold']])
  GlobalFonts.registerFromPath(`${root}assets/fonts/${file}.otf`, family);

// People. The owner and linsissya are GridStudio's authors, Etokrovь is a user shown on request;
// everyone else is made up.
const OWNER = 'dissonance';
const PARTIES = [[['mid or feed', 74], ['саппорт', 14, true], ['рошан', 5]], [['4 pos', 26], ['ez katka', 11, true]]];
const SOLO = { name: 'linsissya', avatar: 'avatar-linsissya.webp', tag: 'rx', status: 'В главном меню (нет на месте)' };
// A member is [name, hero portrait id or an avatar file in assets/dota-menu/ui].
const GUILD = [['Etokrovь', 'avatar-etokrov.webp'], ['gg wp', 8], ['тинкер', 34], ['Сильфи', 25], ['4 pos enjoyer', 86], ['Axe main', 7], ['рапира', 44], ['инвокер', 17],
  ['сладкий', 99], ['тайд', 29], ['мипо', 80], ['варлок', 37], ['морф', 10], ['лион', 26], ['snapfire', 128]];
// Tall enough for a 4:3 screen, where the rail runs from 100 to 1440 - 91 in 1080p units.
const WIDTH = 366, HEIGHT = 1250, SCALE = 2;
const PARTY_TOP = [396, 464], SOLO_TOP = 532, GUILD_TOP = 608, ROW = 44;

const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE), context = canvas.getContext('2d');
context.scale(SCALE, SCALE);
context.imageSmoothingQuality = 'high';
context.fillStyle = '#0a0806'; context.fillRect(0, 0, WIDTH, HEIGHT);
const cover = (image, x, y, width, height) => {
  const scale = Math.max(width / image.width, height / image.height), w = width / scale, h = height / scale;
  context.drawImage(image, (image.width - w) / 2, (image.height - h) / 2, w, h, x, y, width, height);
};
const text = (value, x, y, font, color, { align = 'left', shadow = null } = {}) => {
  context.save(); context.font = font; context.fillStyle = color; context.textAlign = align; context.textBaseline = 'alphabetic';
  if (shadow) Object.assign(context, shadow);
  context.fillText(value, x, y); const width = context.measureText(value).width; context.restore(); return width;
};
const avatar = (image, x, y) => { context.fillStyle = '#000'; context.fillRect(x, y, 36, 36); context.drawImage(image, 0, 0, image.width, image.width, x + 1, y + 1, 34, 34); };

// The mini-profile: its rock, the owner, the rank medal; an empty showcase.
const rock = await ui('miniprofile-rock.webp');
cover(rock, 0, 0, WIDTH, 74); context.fillStyle = '#000'; context.fillRect(0, 73, WIDTH, 1);
context.save(); context.shadowColor = '#0009'; context.shadowBlur = 16; context.shadowOffsetY = 4;
context.beginPath(); context.roundRect(8, 8, 58, 58, 2); context.clip(); context.drawImage(await ui('avatar.webp'), 8, 8, 58, 58); context.restore();
const shadow = { shadowColor: '#000', shadowBlur: 4, shadowOffsetY: 1 };
text(OWNER, 82, 38, '24px Radiance400', '#feffff', { shadow });
text('В главном меню', 82, 55, '13px Radiance600', '#778f74', { shadow });
context.save(); context.shadowColor = '#000a'; context.shadowBlur = 6; context.shadowOffsetY = 2;
context.drawImage(await ui('rank-medal.webp'), 289, 1, 72, 72); context.restore();
cover(rock, 0, 74, WIDTH, 240);
context.save(); context.letterSpacing = '1px'; text('Здесь будет твой мини-профиль', WIDTH / 2, 74 + 125, '15px Radiance400', '#ffffff26', { align: 'center' }); context.restore();

// Chrome from the screenshot.
context.drawImage(await ui('rail-search.webp'), 0, 314);
context.drawImage(await ui('rail-dota.webp'), 0, 364);
context.fillStyle = '#616262'; context.fillRect(358, 364, 7, 48);
const slot = await ui('rail-slot.webp'), eye = await ui('rail-eye.webp'), crown = await ui('rail-crown.webp'), star = await ui('rail-star.webp');
for (const [row, party] of PARTIES.entries()) {
  const top = PARTY_TOP[row];
  for (let place = party.length; place < 5; place++) context.drawImage(slot, 26 + place * 52, top - 4);
  context.drawImage(eye, 318, top + 1);
  for (const [place, [name, hero]] of party.entries()) {
    avatar(await portrait(hero), 32 + place * 52, top);
    text(name.length > 6 ? `${name.slice(0, 4).trimEnd()}…` : name, 50 + place * 52, top + 51, '14.5px Radiance600', place ? '#6b6a68' : '#d4d7d4', { align: 'center' });
  }
  for (const [place, [, , leader]] of party.entries()) if (leader) context.drawImage(crown, 30 + place * 52, top - 2);
}
// The friend online, then the guild.
const person = (image, name, tag, status, top, online, tagColor = '#b3d6d6') => {
  avatar(image, 32, top);
  const width = text(name, 79, top + 16, '16.5px Radiance300', '#d2d3d2');
  if (tag) text(`[${tag}]`, 79 + width + 4, top + 16, '12px Radiance400', tagColor);
  text(status, 79, top + 33, '13px Radiance600', online ? '#798d73' : '#484644');
};
person(await ui(SOLO.avatar), SOLO.name, SOLO.tag, SOLO.status, SOLO_TOP, true, '#d0896c');
context.drawImage(await ui('rail-guild.webp'), 0, 578);
for (const [row, [name, hero]] of GUILD.entries()) {
  if (row < 2) context.drawImage(star, 11, GUILD_TOP + 7 + row * ROW);
  person(await (typeof hero === 'string' ? ui(hero) : portrait(hero)), name, 'gs', 'Не в сети', GUILD_TOP + row * ROW, false);
}

writeFileSync(`${root}assets/dota-menu/ui/rail.webp`, await canvas.encode('webp', 88));
console.log(`rail.webp ${WIDTH * SCALE}×${HEIGHT * SCALE}`);
