// Half-size hero portraits (asked for on 2026-10-03: the portraits were the largest part of a page's
// traffic): assets/portraits/md/<id>.webp, 142 × 188, half of the 284 × 376 in assets/portraits, drawn
// with high-quality smoothing. Previews, «Студия» pictures, the meta window and the editor at a usual
// zoom take these (scripts/portraits.mjs). A hero with a `portraitCrop` keeps only its full picture.
//   node scripts/make-portraits-md.mjs
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import D from './data.mjs';
const root = new URL('../', import.meta.url).pathname;
mkdirSync(`${root}assets/portraits/md`, { recursive: true });
let before = 0, after = 0;
for (const hero of D.heroes.filter((hero) => !hero.portraitCrop)) {
  const bytes = readFileSync(root + hero.portrait), image = await loadImage(bytes);
  const canvas = createCanvas(Math.round(image.width / 2), Math.round(image.height / 2)), context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const small = await canvas.encode('webp', 82);
  writeFileSync(`${root}${hero.portrait.replace('assets/portraits/', 'assets/portraits/md/')}`, small); before += bytes.length; after += small.length;
}
console.log(`assets/portraits/md: ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
