// The in-game test of the interface builder (2026-10-16): one pak03_dir.vpk for game/dota_russian that
// answers, by what shows on the screen, what scripts/interface-modules.mjs is to be built on:
//   1. HUD: does Valve's small panorama/styles/custom_ui.css (included by hud_reborn.xml, the
//      scoreboard and others), given back as Valve's text plus our rules, reach the HUD's parts?
//      Each part gets a frame of its own colour (MARKS).
//   2. Loading screen: does a MoviePanel added to loading_screen_background_image.xml play?
//   3. A Valve stylesheet given back as text (so far only layouts and new styles were): chat.css with
//      a magenta frame round every chat — the party chat in the main menu shows it without a match.
//   4. Texts: is an extra resource/localization/gridstudio_russian.txt with only some tokens loaded,
//      and does it win over dota_russian.txt? «ИГРАТЬ» becomes «ТЕСТ GS».
//   5. Cursor: are resource/cursor/*.bmp taken from a VPK? The default cursor becomes a magenta arrow.
//   6. Two packs: this pak03 gives our menu background's style (pak02) a red tint. Red menu video —
//      pak03 wins; as before — pak02 wins.
// Valve's files come fresh from spirit-bear-productions/dota_vpk_updates; the video is made by ffmpeg.
//   node scripts/make-interface-test.mjs <out.zip> [--round2]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { buildZip } from './zip.mjs';
import { MENU_STYLE, menuStyleText } from './menu-background.mjs';

const SOURCE = 'https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/';
const out = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'gridstudio-interface-test.zip';
const fetchText = async (path) => {
  const response = await fetch(SOURCE + path, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.text()).replace(/^<!--[^\n]*-->\r?\n/, '').replace(/\r\n/g, '\n')
    .replace(/(s2r:\/\/[^"')\s]+\.(?:vcss|vxml|vjs|vtex|vsvg))(?!_c)/g, '$1_c');
};
const ascii = (path, text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII в ${path}`); return text; };
const panorama = (path, text) => ({ path, data: panoramaResource(path, ascii(path, text)) });

// 1. The HUD's parts, each its own colour; the photo of a match tells which ones the hook reaches.
const MARKS = [['#topbar', '#ff3030', 'верхняя панель — красная'], ['#minimap_container', '#ffd000', 'миникарта — жёлтая'],
  ['#center_bg', '#30ff60', 'фон нижней панели — зелёный'], ['#portraitHUD', '#30e0ff', 'портрет героя — голубой'],
  ['#abilities', '#ff40ff', 'способности — розовые'], ['#inventory', '#4060ff', 'инвентарь — синий'],
  ['#shop', '#ff9020', 'магазин — оранжевый'], ['#HudChat', '#ffffff', 'чат в матче — белый']];
const hudRules = MARKS.map(([selector, colour]) => `${selector}\n{\n\tborder: 3px solid ${colour};\n}`).join('\n\n');

// 2. The loading screen: a test video over Valve's picture.
const LOADING_VIDEO = 'panorama/videos/gridstudio_loading_test.webm', LOADING_STYLE = 'panorama/styles/gridstudio_loading_test.vcss_c';
function loadingLayout(valve) {
  const added = valve.replace('<include src="s2r://panorama/styles/loading_screen_background_image.vcss_c" />',
    `$&\n\t\t<include src="s2r://${LOADING_STYLE}" />`)
    .replace(/(<Panel id="LoadPanel" \/>)/, `$1\n\t\t<MoviePanel id="GridStudioLoadingMovie" src="s2r://${LOADING_VIDEO}" repeat="true" autoplay="onload" hittest="false" />`);
  if (!added.includes('GridStudioLoadingMovie') || !added.includes(LOADING_STYLE)) throw new Error('loading_screen_background_image.xml изменился: не нашли, куда вставить видео.');
  return added;
}
const LOADING_CSS = '#GridStudioLoadingMovie\n{\n\twidth: 100%;\n\theight: 100%;\n}\n';
function loadingVideo() {
  const dir = mkdtempSync(join(tmpdir(), 'gs-loading-')), file = join(dir, 'test.webm');
  try {
    const made = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=8', '-vf',
      "drawbox=x=0:y=440:w=1920:h=200:color=black@0.7:t=fill", '-c:v', 'libvpx-vp9', '-b:v', '1500k', '-deadline', 'good', '-cpu-used', '4', '-an', file]);
    if (made.status !== 0) throw new Error(`ffmpeg: ${made.stderr}`);
    return new Uint8Array(readFileSync(file));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// 3. Every chat (party chat in the menu, chat in a match) framed in magenta.
const CHAT_RULES = 'DOTAChat\n{\n\tborder: 3px solid #ff00ff;\n}\n';

// 4. A file of our own with a few of dota_russian's tokens.
const TEXTS = `\ufeff"lang"\n{\n\t"Language"\t"russian"\n\t"Tokens"\n\t{\n${['dota_play_matchmaking', 'dota_dashboard_start_playing', 'DOTA_MainMenu_Heroes', 'DOTA_TabName_Heroes']
  .map((token) => `\t\t"${token}"\t"ТЕСТ GS"`).join('\n')}\n\t}\n}\n`;

// 5. A magenta arrow at Valve's four cursor sizes (32-bit BMP, bottom-up, like Valve's).
const ARROW = [[0, 0], [0, 23], [6, 18], [10, 27], [14, 25.5], [10, 16.5], [17, 16.5]];
function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function cursorBMP(size) {
  const scale = size / 32, shape = ARROW.map(([x, y]) => [x * scale + 0.5, y * scale + 0.5]);
  const filled = (x, y) => x >= 0 && y >= 0 && x < size && y < size && inside([x + 0.5, y + 0.5], shape);
  const bmp = new Uint8Array(54 + size * size * 4), view = new DataView(bmp.buffer);
  bmp.set([0x42, 0x4d]); view.setUint32(2, bmp.length, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true);
  view.setInt32(18, size, true); view.setInt32(22, size, true); view.setUint16(26, 1, true); view.setUint16(28, 32, true); view.setUint32(34, size * size * 4, true);
  const edge = Math.max(1, Math.round(scale));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!filled(x, y)) continue;
    let border = false;
    for (let d = 1; d <= edge && !border; d++) border = !filled(x - d, y) || !filled(x + d, y) || !filled(x, y - d) || !filled(x, y + d);
    const at = 54 + ((size - 1 - y) * size + x) * 4;  // bottom-up rows, BGRA
    bmp.set(border ? [0, 0, 0, 255] : [255, 0, 255, 255], at);
  }
  return bmp;
}

// Round 2 (`--round2`, after the first test on 2026-10-16: the HUD hook, the loading video and a Valve
// stylesheet worked; an extra localization file and cursors from a VPK did not; which pack wins was not
// seen, there was no pak02):
//   texts — the whole dota_russian.txt in the VPK with a few tokens changed;
//   cursors — loose BMPs, first in game/dota_russian/resource/cursor (leaves Valve's files alone), else
//   in game/dota/resource/cursor;
//   precedence — pak02 and pak03 both give custom_ui.css: the top bar framed blue by pak02, red by pak03.
if (process.argv.includes('--round2')) {
  const customUI = await fetchText('panorama/styles/custom_ui.css');
  const russian = await (await fetch(SOURCE + 'resource/localization/dota_russian.txt', { signal: AbortSignal.timeout(60_000) })).text();
  let texts = russian, changed = 0;
  for (const token of ['DOTA_MainMenu_Heroes', 'DOTA_MainMenu_Learn', 'DOTA_MainMenu_Watch', 'dota_play_matchmaking'])
    texts = texts.replace(new RegExp(`("${token}"\\s+")[^"]*(")`), (_, a, b) => { changed++; return `${a}ТЕСТ GS${b}`; });
  if (changed < 3) throw new Error(`В dota_russian.txt нашлось только ${changed} токена.`);
  const md5 = (bytes) => new Uint8Array(createHash('md5').update(bytes).digest());
  const frame = (colour) => panorama('panorama/styles/custom_ui.vcss_c', `${customUI.trimEnd()}\n\n/* GridStudio test */\n#topbar\n{\n\tborder: 4px solid ${colour};\n}\n`);
  const pak02 = buildVPK([frame('#3060ff')], { version: 2, md5 });
  const pak03 = buildVPK([frame('#ff3030'), { path: 'resource/localization/dota_russian.txt', data: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(texts.replace(/^\ufeff/, ''))]) }], { version: 2, md5 });
  const cursors = [['', 32], ['_vsz0', 32], ['_vsz1', 48], ['_vsz2', 72], ['_vsz3', 96]].map(([suffix, size]) => ({ name: `cursor/cursor_default${suffix}.bmp`, data: cursorBMP(size) }));
  const README2 = `Тест конструктора интерфейса GridStudio, раунд 2 — ${new Date().toISOString().slice(0, 10)}

1. Закрой Dota 2. Удали pak03_dir.vpk из первого теста.
   Если в game\\dota_russian есть свой pak02_dir.vpk (наш фон меню) — переименуй его на время в pak02_dir.vpk.bak.
2. Положи pak02_dir.vpk и pak03_dir.vpk из архива в Steam\\steamapps\\common\\dota 2 beta\\game\\dota_russian
3. Папку cursor из архива положи в game\\dota_russian\\resource\\ (получится game\\dota_russian\\resource\\cursor\\…).
   Папки resource там может не быть — создай.
4. Запусти Dota и пришли скриншот главного меню и матча:
   - вкладки «Герои», «Просмотр», «База знаний» и кнопка «ИГРАТЬ»: «ТЕСТ GS» — тексты работают;
   - курсор: розовая стрелка — курсор работает из dota_russian;
   - рамка верхней панели в матче: синяя — главнее pak02, красная — главнее pak03.
5. Если курсор обычный: закрой Dota, СКОПИРУЙ папку game\\dota\\resource\\cursor куда-нибудь (это бэкап),
   положи файлы из папки cursor архива в game\\dota\\resource\\cursor с заменой, запусти Dota — розовая стрелка?
   Потом верни свой бэкап на место.
6. Убрать тест: удали pak02_dir.vpk, pak03_dir.vpk и game\\dota_russian\\resource\\cursor, верни свой pak02 (.bak).
`;
  const zip = await buildZip([{ name: 'pak02_dir.vpk', data: pak02 }, { name: 'pak03_dir.vpk', data: pak03 }, ...cursors,
    { name: 'ПРОЧТИ.txt', data: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README2.replace(/\n/g, '\r\n'))]) }]);
  writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
  console.log(`${out}: раунд 2, токенов изменено ${changed}`);
  process.exit(0);
}

const [loading, customUI, chat] = await Promise.all(['panorama/layout/loading_screen_background_image.xml', 'panorama/styles/custom_ui.css', 'panorama/styles/chat.css'].map(fetchText));
const files = [
  panorama('panorama/styles/custom_ui.vcss_c', `${customUI.trimEnd()}\n\n/* GridStudio test */\n${hudRules}\n`),
  panorama('panorama/layout/loading_screen_background_image.vxml_c', loadingLayout(loading)),
  panorama(LOADING_STYLE, LOADING_CSS),
  { path: LOADING_VIDEO, data: loadingVideo() },
  panorama('panorama/styles/chat.vcss_c', `${chat.trimEnd()}\n\n/* GridStudio test */\n${CHAT_RULES}`),
  { path: 'resource/localization/gridstudio_russian.txt', data: new TextEncoder().encode(TEXTS) },
  ...[['', 32], ['_vsz0', 32], ['_vsz1', 48], ['_vsz2', 72], ['_vsz3', 96]].map(([suffix, size]) => ({ path: `resource/cursor/cursor_default${suffix}.bmp`, data: cursorBMP(size) })),
  panorama(MENU_STYLE, `${menuStyleText()}\n#GridStudioMovie\n{\n\twash-color: #ff000090;\n}\n`)
];
const vpk = buildVPK(files, { version: 2, md5: (bytes) => new Uint8Array(createHash('md5').update(bytes).digest()) });
const README = `Тест конструктора интерфейса GridStudio — ${new Date().toISOString().slice(0, 10)}

1. Закрой Dota 2.
2. Положи pak03_dir.vpk в Steam\\steamapps\\common\\dota 2 beta\\game\\dota_russian
   (если там уже есть pak03_dir.vpk — переименуй его, например в pak03_dir.vpk.bak).
3. Запусти Dota и пришли скриншоты:
   а) главное меню: надпись на кнопке «ИГРАТЬ» и вкладке «Герои» (если «ТЕСТ GS» — тексты работают),
      курсор (розовая стрелка — курсор работает), чат группы в розовой рамке (стили Valve работают),
      видео нашего фона меню — красное или как обычно (какой пак главнее; нужен наш фон в pak02);
   б) экран загрузки матча (бот-матч или демо героя): видео с цветными полосами поверх картинки;
   в) сам матч целиком, с открытым магазином: какие части в цветных рамках —
${MARKS.map(([, , label]) => `      ${label}`).join('\n')}
4. Убрать тест: удали pak03_dir.vpk (и верни свой, если переименовывал).
`;
const zip = await buildZip([{ name: 'pak03_dir.vpk', data: vpk }, { name: 'ПРОЧТИ.txt', data: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(README.replace(/\n/g, '\r\n'))]) }]);
writeFileSync(out, new Uint8Array(await zip.arrayBuffer()));
console.log(`${out}: ${files.length} файлов, VPK ${vpk.length} байт`);
