import { menuBackgroundPack } from '../../scripts/menu-background.mjs';
import { md5 } from '../../scripts/md5.mjs';
import { backgroundInstaller } from '../../scripts/installer.mjs';
import { buildZip } from '../../scripts/zip.mjs';
import dashboard from '../../assets/dota-menu/dashboard.xml?raw';
import home from '../../assets/dota-menu/dashboard_page_home.xml?raw';

// From a built WebM to the file the user saves: the pack (scripts/menu-background.mjs) for the
// chosen Dota folder, alone or zipped with «Установить фон.bat». Shared by the builder and «Студия»
// (which keeps the WebM and packs it again in a moment instead of building).
// Dota mounts pak*_dir.vpk from game/dota_<audio language>/.
export const FOLDERS = {
  russian: { file: 'pak02_dir.vpk', folder: 'dota_russian', launch: '-language russian', hint: 'Для русской озвучки. pak01_dir.vpk в этой папке — сама озвучка, его не трогай.' },
  custom: { file: 'pak01_dir.vpk', folder: 'dota_123', launch: '-language 123', hint: 'Способ из старых гайдов. После обновления Dota 23.07.2026 может не работать.' }
};
export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const packBackground = (video, { clean }) => new Blob([menuBackgroundPack({ video, dashboard, home: clean ? home : null, md5 })], { type: 'application/octet-stream' });
export async function downloadPack(pack, { folder, delivery }) {
  const target = FOLDERS[folder];
  if (delivery !== 'installer') return saveFile(pack, target.file);
  const files = [{ name: target.file, data: new Uint8Array(await pack.arrayBuffer()) }, ...backgroundInstaller(target)];
  saveFile(await buildZip(files), 'gridstudio-background.zip');
}
