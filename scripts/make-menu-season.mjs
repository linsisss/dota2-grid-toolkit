// Cuts Valve's «Диковинки Квортеро» cell of the news column, under the Dark Carnival card, out of a
// 1920×1080 screenshot of the main menu after Dota's update of 2026-10-07 (client 6946–6951; supplied
// by the user on 2026-10-08, not in the repository). Since that update the game itself switches to
// the season event from this cell (DOTAShowSeasonalRewardsPage), so the builder's preview shows it
// and the pack no longer adds its own button (assets/dota-menu/event.json no longer matches).
//   node scripts/make-menu-season.mjs <screenshot 1920×1080> [out dir]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const [source, out = new URL('../assets/dota-menu/ui/', import.meta.url).pathname] = process.argv.slice(2);
if (!source) throw new Error('Укажи скриншот главного меню 1920×1080.');
const image = await loadImage(source);
if (image.width !== 1920 || image.height !== 1080) throw new Error('Нужен скриншот ровно 1920×1080.');
// Measured on the screenshot: the cell is x 1532–1861, rows 600–833, 16 px under the news card.
const canvas = createCanvas(330, 234);
canvas.getContext('2d').drawImage(image, 1532, 600, 330, 234, 0, 0, 330, 234);
writeFileSync(`${out}/season.webp`, await canvas.encode('webp', 100));
