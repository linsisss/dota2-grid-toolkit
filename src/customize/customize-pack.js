import { buildZip } from '../../scripts/zip.mjs';
import { installCommand } from '../../scripts/installer.mjs';
import { CUSTOMIZE_DIRS, CUSTOMIZE_FILE, CUSTOMIZE_PAKS } from '../../scripts/customize-pack.mjs';
import { uploadInstallPack } from '../install-pack.js';
import { lang, t } from '../../scripts/i18n.mjs';
import { saveFile } from './background-pack.js';
import { creditsClosing } from './d2pfx-ui.jsx';

// The one file of the customization page (scripts/customize-pack.mjs): the menu's pak02, the match's pak03
// and cursor, the d2pfx mods' pak04, the font, the licence and a read-me, laid out like the «dota 2 beta» folder.
export const customizeRemoveCommand = () => installCommand(`${location.origin}/api/catalog/install/all-remove${lang === 'en' ? '-en' : ''}`);

// The archive's read-me in the site's language (Windows line ends, with a BOM for Notepad).
function readme({ titles, russian, fonts, credits = [] }) {
  const lines = [t('Оформление Dota от GridStudio — одним файлом.'), t('В сборке: {list}.', { list: titles.join(', ') }), '',
    t('Проще всего — командой PowerShell с сайта (gridstudio.me/background → «Командой PowerShell»): она сама найдёт Dota, поставит всё и запомнит, что вернуть.'), '',
    t('Установка вручную:'), t('1. Закрой Dota 2.'), t('2. В Steam: Dota 2 -> «Свойства» -> «Установленные файлы» -> «Обзор». Откроется папка dota 2 beta.')];
  let step = 3;
  if (fonts) lines.push(t('{n}. На всякий случай скопируй куда-нибудь папку game\\dota\\panorama\\fonts: шрифт из сборки заменит шрифты Dota.', { n: step++ }));
  lines.push(t('{n}. Скопируй папку game из этого архива в dota 2 beta С ЗАМЕНОЙ.', { n: step++ }));
  if (fonts) lines.push(t('{n}. Если есть папка %TEMP%\\fontconfig (вставь %TEMP% в адресную строку проводника), удали её.', { n: step++ }));
  if (russian) lines.push(t('{n}. В Dota должен быть русский язык озвучки: моды Dota читает только из папки dota_russian. Интерфейс можно оставить английским. Если в параметрах запуска Dota есть -language (кроме -language russian), убери его.', { n: step++ }));
  lines.push(t('{n}. Запусти Dota 2.', { n: step++ }), '', t('Вернуть как было:'));
  if (russian) lines.push(t('— удали из game\\dota_russian файлы {files} и папку resource\\cursor, если они из этой сборки;', { files: Object.values(CUSTOMIZE_PAKS).join(', ') }));
  if (fonts) lines.push(t('— шрифты: Steam -> Dota 2 -> «Свойства» -> «Установленные файлы» -> «Проверить целостность файлов игры»;'));
  lines.push(t('— а если ставил командой, вставь в PowerShell: {command}', { command: customizeRemoveCommand() }), '',
    t('После крупного обновления Dota собери файл на сайте заново: меню и тексты в игре меняются.'), '');
  // Whose work is inside (d2pfx's: the cursor pack, the HUD skin, the parts…: each mod, its page and its
  // author), with d2pfx's closing line once at the end.
  const closing = creditsClosing(), own = credits.filter((line) => line !== closing);
  if (own.length) lines.push(t('Чьё внутри:'), ...own, closing, '');
  return new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(lines.join('\r\n'))]);
}

// menu: pak02 (Blob) or null; match: { pak03: Uint8Array | null, cursors: [{ name: 'resource/cursor/…', data }] };
// d2pfx: pak04 (Uint8Array) with the chosen d2pfx mods, or null; fonts: [{ name: 'fonts/<file>.otf' | 'OFL.txt',
// data }]; titles: the modules in it, for the read-me; credits: lines naming whose work is inside (the cursor's
// d2pfx pack and its author); modCredits: the same for the d2pfx mods of pak04.
// → { blob, entries: [{ name, size }] }, or null when nothing differs from Dota.
export async function customizeZip({ menu = null, match = { pak03: null, cursors: [] }, d2pfx = null, fonts = [], titles = [], credits = [], modCredits = [] }) {
  const entries = [];
  if (menu) entries.push({ name: `${CUSTOMIZE_DIRS.russian}${CUSTOMIZE_PAKS.menu}`, data: new Uint8Array(await menu.arrayBuffer()) });
  if (match.pak03) entries.push({ name: `${CUSTOMIZE_DIRS.russian}${CUSTOMIZE_PAKS.match}`, data: match.pak03 });
  if (d2pfx) entries.push({ name: `${CUSTOMIZE_DIRS.russian}${CUSTOMIZE_PAKS.d2pfx}`, data: d2pfx });
  for (const file of match.cursors) entries.push({ name: `${CUSTOMIZE_DIRS.russian}${file.name}`, data: file.data });
  for (const file of fonts) entries.push(file.name.startsWith('fonts/') ? { name: `${CUSTOMIZE_DIRS.fonts}${file.name.slice(6)}`, data: file.data } : file);
  if (!entries.length) return null;
  const russian = entries.some((entry) => entry.name.startsWith(CUSTOMIZE_DIRS.russian)), withFonts = entries.some((entry) => entry.name.startsWith(CUSTOMIZE_DIRS.fonts));
  entries.push({ name: t('ПРОЧТИ.txt'), data: readme({ titles, russian, fonts: withFonts, credits: [...(match.cursors.length ? credits : []), ...(d2pfx ? modCredits : [])] }) });
  return { blob: await buildZip(entries), entries: entries.map((entry) => ({ name: entry.name, size: entry.data.length })) };
}

// «Только файл» saves the zip; «Командой PowerShell» sends it to the site and gives the command that
// downloads exactly it (src/install-pack.js; server/install-packs.mjs 'all') → { command, remove }.
export async function deliverCustomize(blob, { delivery, onProgress }) {
  if (delivery !== 'command') { saveFile(blob, CUSTOMIZE_FILE); return null; }
  return { command: await uploadInstallPack('all', new Uint8Array(await blob.arrayBuffer()), onProgress), remove: customizeRemoveCommand() };
}
export { CUSTOMIZE_FILE };
