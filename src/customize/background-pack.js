import { GRID_DIM, menuBackgroundPack, menuEvent } from '../../scripts/menu-background.mjs';
import { md5 } from '../../scripts/md5.mjs';
import { backgroundInstaller } from '../../scripts/installer.mjs';
import { buildZip } from '../../scripts/zip.mjs';
import dashboard from '../../assets/dota-menu/dashboard.xml?raw';
import home from '../../assets/dota-menu/dashboard_page_home.xml?raw';
import heroPage from '../../assets/dota-menu/dashboard_page_hero_new_v2.xml?raw';
import season from '../../assets/dota-menu/event.json';
import showcase from '../../assets/dota-menu/dashboard_page_showcase.xml?raw';
import heroesPage from '../../assets/dota-menu/dashboard_page_heroes.xml?raw';
import stratz from '../../assets/dota-menu/icons/stratz.svg?raw';
import dotabuff from '../../assets/dota-menu/icons/dotabuff.svg?raw';

// From a built WebM to the file the user saves: the pack (scripts/menu-background.mjs) for the
// chosen Dota folder, alone or zipped with «Установить фон.bat». Shared by the builder and «Студия»
// (which keeps the WebM and packs it again in a moment instead of building).
// Dota reads pak*_dir.vpk only from the folder of a real language, the one of its audio language
// (game/dota_<language>): dota_english is never read, and invented ones (-language 123, the old
// guides' dota_123) are not since the update of 23.07.2026 (docs/customize.md). So the pack always
// goes to dota_russian, beside the Russian voice-over (pak01_dir.vpk), and the installer makes
// Russian the audio language (scripts/installer.mjs). `client` is the language of the user's Dota:
// only the steps differ — an English Dota keeps its interface, and without the Russian voice pack
// its heroes keep English voices. A key from before 1.7 ('custom', dota_123) reads as Russian.
export const FOLDERS = {
  russian: { file: 'pak02_dir.vpk', folder: 'dota_russian', client: 'russian' },
  english: { file: 'pak02_dir.vpk', folder: 'dota_russian', client: 'english' }
};
export const folderOf = (key) => FOLDERS[key] || FOLDERS.russian;
export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// recipe.hero: the menu video behind the hero (default), `heroVideo` (mode 'own'; without it, the
// menu video again), or Valve's picture ('off'). recipe.event: the button to the season event
// (1.6.4; on for recipes before it), when Valve's menu still has the event of event.json.
// recipe.profile: Stratz and Dotabuff buttons in players' profiles (1.6.4; on for recipes before it).
// recipe.grid: the «Герои» page under the hero grid (1.6.4): the menu's background (default), darker
// (dim, a percent of GRID_DIM.max), or `gridVideo` (mode 'own'; without it, as in the menu).
export const SEASON_EVENT = menuEvent(dashboard, season);
const gridOption = (grid, gridVideo) => grid?.mode === 'dim' ? { page: heroesPage, dim: (grid.dim / 100) * GRID_DIM.max }
  : grid?.mode === 'own' && gridVideo ? { page: heroesPage, video: gridVideo } : null;
export const packBackground = (video, { clean, hero = { mode: 'menu' }, event = true, profile = true, grid = { mode: 'menu' } }, heroVideo = null, gridVideo = null) => new Blob([menuBackgroundPack({ video, dashboard, home: clean ? home : null,
  hero: hero?.mode === 'off' ? null : { page: heroPage, video: hero?.mode === 'own' ? heroVideo : null }, event: event ? season : null,
  profile: profile ? { page: showcase, icons: { stratz, dotabuff } } : null, grid: gridOption(grid, gridVideo), md5 })], { type: 'application/octet-stream' });
export async function downloadPack(pack, { folder, delivery }) {
  const target = folderOf(folder);
  if (delivery !== 'installer') return saveFile(pack, target.file);
  const files = [{ name: target.file, data: new Uint8Array(await pack.arrayBuffer()) }, ...backgroundInstaller(target)];
  saveFile(await buildZip(files), 'gridstudio-background.zip');
}
