// The in-game test of «Тема интерфейса» (scripts/menu-theme.mjs, 2026-10-31): a pak02_dir.vpk with every one of
// Valve's menu stylesheets given back recoloured for one accent, our rules after dashboard/play/frontpage_shared.
// Valve's stylesheets come from a checkout of spirit-bear-productions/dota_vpk_updates (panorama/styles).
//   node scripts/make-theme-test.mjs <dota_vpk_updates checkout> <out.zip> [#accent]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { buildZip } from './zip.mjs';
import { md5 } from './md5.mjs';
import { themeFile, themePalette, themeStyle, themeText } from './menu-theme.mjs';

const [checkout, out, accent = '#8b6cff'] = process.argv.slice(2);
const root = join(checkout, 'panorama/styles'), map = themePalette(accent);
const walk = (dir) => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
const files = [];
for (const file of walk(root)) {
  const rel = relative(root, file).split('\\').join('/');
  if (!themeFile(rel) || rel === 'custom_ui.css') continue;
  // Valve's text as it is: its pictures are `s2r://….vtex` (as the compiler writes them); with «_c» added the
  // game finds none of them (the first test, 2026-10-31: every icon of the menu gone).
  const valve = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (!themeStyle(valve, map).changed && !['dashboard.css', 'play.css', 'frontpage_shared.css'].includes(rel)) continue;
  const text = themeText(rel, valve, accent);
  if (/[^\x00-\x7f]/.test(text)) { console.log('skip (not ASCII)', rel); continue; }
  files.push({ path: `panorama/styles/${rel.replace(/\.css$/, '.vcss_c')}`, data: panoramaResource(`panorama/styles/${rel.replace(/\.css$/, '.vcss_c')}`, text) });
}
const pak = buildVPK(files, { version: 2, md5 });
const readme = `Тест «Темы интерфейса» GridStudio — акцент ${accent}, стилей Valve: ${files.length}.

Dota закрыта. Скопируй папку game в папку "dota 2 beta" с заменой (это заменит твой pak02 — фон меню на время теста пропадёт).
Запусти Dota, сделай скриншоты: главная, «Играть» (раскрыть поиск), профиль, настройки, магазин/Арсенал.
Если Dota падает или не запускается — удали game\\dota_russian\\pak02_dir.vpk. В конце вставь команду с сайта ещё раз.
`;
const zip = await buildZip([{ name: 'game/dota_russian/pak02_dir.vpk', data: pak }, { name: 'ПРОЧТИ.txt', data: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(readme.replace(/\n/g, '\r\n'))]) }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${files.length} стилей, ${(pak.length / 1e6).toFixed(1)} МБ`);
