// «Интерфейс» — the groundwork of a Dota UI builder (asked for on 2026-10-16: «если есть вайб добавлять
// разделы по внешнему моддингу доты — сделай заготовку под конструктор интерфейса»). It works like the
// menu background (scripts/menu-background.mjs): a pakNN_dir.vpk (scripts/vpk.mjs) whose files take
// the place of Valve's Panorama files. Each module names the files it replaces and, once it is made,
// builds them from its settings; the builder (src/customize/InterfaceBuilder.jsx) lists the modules,
// and the pack is every chosen module's files together.
// Rules learnt on the background (docs/customize.md, «Фон меню»): a replaced layout keeps Valve's
// structure and only points elsewhere; a layout in a new path is ASCII-only and has no event handlers,
// or Panorama refuses it; every replaced file is watched by scripts/check-dota-menu.mjs, since a Dota
// update that changes it breaks the pack.
import { t } from './i18n.mjs';
import { buildVPK, panoramaResource } from './vpk.mjs';
import { HUD_STYLE, chatSettings, hudChanged, hudStyle, CHAT_DEFAULTS } from './hud-style.mjs';
import { ABILITIES_PATH, TEXTS_PATH, applyHeroNames, applyTexts, splitTexts, textsBytes } from './dota-texts.mjs';

// `status`: 'planned' (shown with «Скоро», nothing to build yet), 'ready' (has `build`), 'loose' (files
// beside the VPK, made by the page) or 'builder':
// made in the menu background's pack (scripts/menu-background.mjs), since it shares the menu's files or is
// a background itself — the module links there (`href`); one pack, so two never fight over a file.
// `files`: the game paths the module takes over (checked against spirit-bear-productions/dota_vpk_updates
// on 2026-10-16; the cursor is loose files, like the font); `build(settings)` → { path: Uint8Array }.
export const INTERFACE_MODULES = Object.freeze([
  { id: 'loading', icon: 'image', status: 'builder', href: '/customize?part=loading', title: () => t('Экран загрузки'), text: () => t('Своя картинка или видео, пока грузится матч.'),
    files: ['panorama/layout/loading_screen_background_image.vxml_c'] },
  // valve: { 'custom_ui.css': Valve's text } (assets/dota-menu/custom_ui.css).
  { id: 'hud', icon: 'sliders', status: 'ready', title: () => t('Вид HUD'), text: () => t('Прозрачность и цвет подложек, без лишних украшений, размер панелей.'),
    files: [HUD_STYLE], changed: hudChanged,
    build: (settings, valve) => ({ [HUD_STYLE]: panoramaResource(HUD_STYLE, ascii(HUD_STYLE, hudStyle(valve['custom_ui.css'], settings))) }) },
  { id: 'menu-buttons', icon: 'layers', status: 'builder', href: '/customize?part=buttons', title: () => t('Кнопки меню'), text: () => t('Спрятать лишние кнопки и вкладки главного меню.'),
    files: ['panorama/layout/dashboard.vxml_c'] },
  // Built with the HUD into the same file (`partOf`): its settings are hud.chat.
  { id: 'chat', icon: 'chat', status: 'ready', partOf: 'hud', title: () => t('Чат'), text: () => t('Место и ширина чата в матче.'),
    files: [HUD_STYLE], changed: (chat) => JSON.stringify(chatSettings(chat)) !== JSON.stringify(CHAT_DEFAULTS) },
  // valve: Valve's latest 'dota_russian.txt' and, for hero names, 'abilities_russian.txt'
  // (GET /api/catalog/dota-texts/russian, …/abilities); splitTexts tells which edit goes where.
  { id: 'texts', icon: 'text', status: 'ready', title: () => t('Тексты'), text: () => t('Свои названия героев, вкладок, кнопок и надписей.'),
    files: [TEXTS_PATH, ABILITIES_PATH], changed: (settings) => { const { dota, abilities } = splitTexts(settings?.edits); return Object.keys(dota).length + Object.keys(abilities).length > 0; },
    build: (settings, valve) => {
      const { dota, abilities } = splitTexts(settings.edits), files = {};
      if (Object.keys(dota).length) files[TEXTS_PATH] = textsBytes(applyTexts(valve['dota_russian.txt'], dota).text);
      if (Object.keys(abilities).length) files[ABILITIES_PATH] = textsBytes(applyHeroNames(valve['abilities_russian.txt'], abilities).text);
      return files;
    } },
  // Loose files, not in the VPK (scripts/dota-cursor.mjs): the builder zips them beside pak03.
  { id: 'cursor', icon: 'cursor', status: 'loose', title: () => t('Курсор'), text: () => t('Свой курсор в меню и в матче.'),
    files: ['resource/cursor/'] }
]);
const ascii = (path, text) => { if (/[^\x00-\x7f]/.test(text)) throw new Error(`Не-ASCII в ${path}: Dota не загрузит интерфейс.`); return text; };
export const interfaceModule = (id) => INTERFACE_MODULES.find((module) => module.id === id) || null;

// The pack from the chosen modules and their settings ({ id: settings }); null while nothing chosen
// can be built or changes anything. Two modules must not take the same file. `valve`: Valve's texts the
// modules build on. It is pak03_dir.vpk for game/dota_russian, beside the background's pak02.
export const INTERFACE_PACK_FILE = 'pak03_dir.vpk';
export function interfacePack(chosen, { md5 = null, valve = {} } = {}) {
  const files = {};
  for (const [id, settings] of Object.entries(chosen)) {
    const module = interfaceModule(id);
    if (!module || module.status !== 'ready' || typeof module.build !== 'function' || (module.changed && !module.changed(settings))) continue;
    for (const [path, bytes] of Object.entries(module.build(settings, valve))) {
      if (path in files) throw new Error(t('Два раздела меняют один файл: {path}.', { path }));
      files[path] = bytes;
    }
  }
  const list = Object.entries(files).map(([path, data]) => ({ path, data }));
  return list.length ? buildVPK(list, { version: 2, md5 }) : null;
}
