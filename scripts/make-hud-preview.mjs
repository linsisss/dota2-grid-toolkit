// What the HUD preview (src/customize/panorama/hud.mjs) takes from the game's own screen, 2026-10-16:
// the parts Dota draws without Panorama textures — the hero's 3D portrait with its stats, the minimap,
// the hero in the top bar (its picture with the facet's mark),
// the innate ability's icon, and the two icons over the inventory. Cut from the user's 1920 × 1080
// screenshots of Keeper of the Light in demo mode (default HUD); the icons over the inventory sit on the
// game world, so they are lifted off it by comparing three screenshots with different worlds behind.
//   node scripts/make-hud-preview.mjs <22.webp> <16.webp> <13.jpg> [out dir]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [main, second, third, out = 'assets/dota-hud/preview'] = process.argv.slice(2);
if (!third) { console.error('node scripts/make-hud-preview.mjs <22.webp> <16.webp> <13.jpg> [out dir]'); process.exit(1); }
const shots = await Promise.all([main, second, third].map(async (path) => loadImage(readFileSync(path))));
mkdirSync(out, { recursive: true });
const save = (name, canvas) => writeFileSync(`${out}/${name}`, canvas.toBuffer('image/webp', 92));
const cut = ([x, y, w, h], image = shots[0]) => { const canvas = createCanvas(w, h); canvas.getContext('2d').drawImage(image, x, y, w, h, 0, 0, w, h); return canvas; };
// Where they are on the main screenshot (1080p).
const PREVIEW_CUTS = { portrait: [542, 935, 159, 145], minimap: [0, 836, 244, 244], innate: [784, 956, 27, 27], overInventory: [1145, 880, 130, 56], topbarHero: [544, 4, 66, 36] };

save('portrait.webp', cut(PREVIEW_CUTS.portrait));
save('minimap.webp', cut(PREVIEW_CUTS.minimap));
save('topbar-hero.webp', cut(PREVIEW_CUTS.topbarHero));
// The innate icon's dark well, round.
const innate = cut(PREVIEW_CUTS.innate), ring = createCanvas(innate.width, innate.height), g = ring.getContext('2d');
g.beginPath(); g.arc(innate.width / 2, innate.height / 2, innate.width / 2, 0, Math.PI * 2); g.clip(); g.drawImage(innate, 0, 0);
save('innate.webp', ring);
// Over the inventory: the white hand and the red-and-gold banner stand on violet ground in all the
// screenshots, so the icons are keyed out by colour (violet and pink hues are the world), and where the
// three screenshots disagree (the world moved, the banner's sparks) it is the world as well.
const [x, y, w, h] = PREVIEW_CUTS.overInventory, layers = shots.map((image) => cut([x, y, w, h], image).getContext('2d').getImageData(0, 0, w, h).data);
const icons = createCanvas(w, h), data = icons.getContext('2d').createImageData(w, h);
const hsv = (r, g, b) => { const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let hue = 0; if (d) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(hue * 60 + 360) % 360, max ? d / max : 0, max / 255]; };
for (let i = 0; i < data.data.length; i += 4) {
  const [r, g, b] = [layers[0][i], layers[0][i + 1], layers[0][i + 2]], [hue, sat, val] = hsv(r, g, b);
  const violet = hue >= 225 && hue <= 345 ? Math.min(1, Math.max(0, (sat - 0.08) / 0.1)) : 0;
  let spread = 0;
  for (const layer of layers.slice(1)) spread = Math.max(spread, Math.hypot(layer[i] - r, layer[i + 1] - g, layer[i + 2] - b));
  const px = (i / 4) % w, inIcon = (px >= 15 && px <= 46) || (px >= 70 && px <= 126); // the hand, the banner
  const world = !inIcon ? 1 : Math.max(violet * (val > 0.12 ? 1 : 0), Math.min(1, Math.max(0, (spread - 70) / 50)));
  data.data.set([r, g, b, Math.round(255 * (1 - world))], i);
}
icons.getContext('2d').putImageData(data, 0, 0);
save('over-inventory.webp', icons);
console.log(`${out}: portrait, minimap, topbar-hero, innate, over-inventory`);
