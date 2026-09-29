// Downloads the font catalog of the customization page into assets/dota-fonts/ and writes
// data/dota-fonts.json. Fonts come from Google Fonts (SIL OFL): the CSS API hands static TrueType
// instances to old browsers, which is what Dota's FreeType 2.5 needs. Every face is checked for
// full Latin and Cyrillic; the license file comes from github.com/google/fonts.
//   node scripts/fetch-dota-fonts.mjs
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fontCoverage, readFont } from './dota-font.mjs';

const CATALOG = [
  ['Montserrat', 'Строгий', [300, 400, 600, 700, 900]],
  ['Rubik', 'Строгий', [300, 400, 600, 700, 900]],
  ['Nunito', 'Мягкий', [300, 400, 600, 700, 900]],
  ['Comfortaa', 'Мягкий', [300, 400, 600, 700]],
  ['Exo 2', 'Игровой', [300, 400, 600, 700, 900]],
  ['Oswald', 'Узкий', [300, 400, 600, 700]],
  ['Unbounded', 'Широкий', [300, 400, 600, 700, 900]],
  ['Jura', 'Техно', [300, 400, 600, 700]],
  ['Tektur', 'Техно', [400, 600, 700, 900]],
  ['Russo One', 'Игровой', [400]],
  ['Play', 'Игровой', [400, 700]],
  ['Press Start 2P', 'Пиксельный', [400]],
  ['JetBrains Mono', 'Моноширинный', [300, 400, 600, 700]],
  ['Philosopher', 'Фэнтези', [400, 700]],
  ['Caveat', 'Рукописный', [400, 600, 700]],
  ['Lobster', 'Рукописный', [400]]
];
const UA = 'Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1';
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const root = new URL('../assets/dota-fonts/', import.meta.url);
rmSync(root, { recursive: true, force: true });
const manifest = [];
for (const [family, style, weights] of CATALOG) {
  const id = slug(family), dir = new URL(`${id}/`, root);
  mkdirSync(dir, { recursive: true });
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(';')}`, { headers: { 'User-Agent': UA } })).text();
  const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\((https:[^)]+\.ttf)\)/g)].map(([, weight, url]) => ({ weight: Number(weight), url }));
  if (faces.length !== weights.length) throw new Error(`${family}: ждали ${weights.length} начертаний, пришло ${faces.length}`);
  const files = [];
  for (const face of faces) {
    const bytes = new Uint8Array(await (await fetch(face.url)).arrayBuffer()), font = readFont(bytes), missing = fontCoverage(font);
    if (missing.latin.length || missing.cyrillic.length) throw new Error(`${family} ${face.weight}: нет ${[...missing.latin, ...missing.cyrillic].join('')}`);
    const file = `${id}-${face.weight}.ttf`;
    writeFileSync(new URL(file, dir), bytes);
    files.push({ weight: face.weight, file, bytes: bytes.length });
  }
  const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family.toLowerCase().replace(/ /g, '')}/OFL.txt`);
  if (!license.ok) throw new Error(`${family}: нет OFL.txt`);
  writeFileSync(new URL('OFL.txt', dir), await license.text());
  manifest.push({ id, family, style, license: 'SIL Open Font License 1.1', files });
  console.log(`${family}: ${files.map((f) => f.weight).join(', ')} — ${Math.round(files.reduce((s, f) => s + f.bytes, 0) / 1024)} КБ`);
}
writeFileSync(new URL('../data/dota-fonts.json', import.meta.url), JSON.stringify({ source: 'Google Fonts', fonts: manifest }, null, 2) + '\n');
