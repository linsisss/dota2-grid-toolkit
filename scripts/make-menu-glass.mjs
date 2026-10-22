// Splits the /customize preview's top bar (assets/dota-menu/ui/bar.webp, cut from a screenshot by
// scripts/make-menu-sprites.mjs) into its ground and what lies on it, for the see-through top bar
// (2026-10-22, MENU_GLASS in scripts/menu-background.mjs): DotaMenu.jsx draws the ground at the chosen
// opacity and the tabs, icons and the logo over it at full strength, as the pack does in the game.
//   node scripts/make-menu-glass.mjs   → assets/dota-menu/ui/bar-ground.webp, bar-glass.webp, party-ground.webp, party-glass.webp
// The ground is Valve's own: #TopBarBackground draws topbar_home_png (the home page's bar, 1920 × 164 at
// the top left) with right_default_psd at the right (.TopBarRightBackground: 350 × 61, right top), both
// in assets/dota-menu-ui. They match the screenshot to a level or two where nothing lies on the bar, so
// the rest comes off it (scripts/color-to-alpha.mjs) and ground + rest give the screenshot back.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { colorToAlpha } from './color-to-alpha.mjs';

const root = new URL('../', import.meta.url).pathname, ui = `${root}assets/dota-menu/ui/`, topbar = `${root}assets/dota-menu-ui/panorama/images/topbar/`;
const bar = await loadImage(`${ui}bar.webp`), { width: W, height: H } = bar;
const ground = createCanvas(W, H), g = ground.getContext('2d');
g.imageSmoothingQuality = 'high';
const home = await loadImage(`${topbar}topbar_home_png.webp`), right = await loadImage(`${topbar}right_default_psd.webp`);
g.drawImage(home, 0, 0, home.width, home.height, 0, 0, 1920, 164);
g.drawImage(right, 1920 - 350, 0, 350, 61);
const groundPixels = g.getImageData(0, 0, W, H).data;
// Where the ground is not opaque (the edges of the logo's plate), what came off it is measured against it over black.
const groundAt = (i) => [0, 1, 2].map((c) => groundPixels[i + c] * groundPixels[i + 3] / 255);

const shot = createCanvas(W, H).getContext('2d');
shot.drawImage(bar, 0, 0);
const pixels = shot.getImageData(0, 0, W, H);
colorToAlpha(pixels.data, groundAt, 16);
const rest = createCanvas(W, H);
rest.getContext('2d').putImageData(pixels, 0, 0);
// The ground in the bar's own shape (the bar and the logo's plate).
g.globalCompositeOperation = 'destination-in';
g.drawImage(bar, 0, 0);
writeFileSync(`${ui}bar-ground.webp`, await ground.encode('webp', 100));
writeFileSync(`${ui}bar-glass.webp`, await rest.encode('webp', 100));
console.log(`bar-ground.webp, bar-glass.webp ${W}×${H}`);

// The party bar (rail-party.webp, the preview's #FriendlistBottom, 366 × 70) the same way, for its see-through
// ground (MENU_GLASS party): on the home page Valve draws miniprofile_rock_psd at 100 % × 256 px, centred, inside a
// 1-px border #3D414490 (dashboard.css). Measured against the screenshot where nothing lies on the bar (right of the
// slots): under half a level off with the picture inside the border, a pixel lower.
{
  const party = await loadImage(`${ui}rail-party.webp`), w = party.width, h = party.height;
  const rock = await loadImage(`${root}assets/dota-menu-ui/panorama/images/textures/miniprofile_rock_psd.webp`);
  const ground = createCanvas(w, h), g = ground.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(rock, 2, (h - 256) / 2 + 1, w - 2, 256);
  g.strokeStyle = '#3D414490'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
  const groundPixels = g.getImageData(0, 0, w, h).data;
  const shot = createCanvas(w, h).getContext('2d');
  shot.drawImage(party, 0, 0);
  const pixels = shot.getImageData(0, 0, w, h);
  colorToAlpha(pixels.data, (i) => [groundPixels[i], groundPixels[i + 1], groundPixels[i + 2]], 4);
  const rest = createCanvas(w, h);
  rest.getContext('2d').putImageData(pixels, 0, 0);
  writeFileSync(`${ui}party-ground.webp`, await ground.encode('webp', 100));
  writeFileSync(`${ui}party-glass.webp`, await rest.encode('webp', 100));
  console.log(`party-ground.webp, party-glass.webp ${w}×${h}`);
}
