// The d2pfx mods in the browser (scripts/d2pfx-mods.mjs says what and why): the list made by
// scripts/make-d2pfx-catalog.mjs, each chosen mod downloaded from d2pfx's GitHub at the list's commit
// (raw.githubusercontent.com answers with Access-Control-Allow-Origin: *), its VPK opened, its game files
// checked against their CRC, and all chosen mods put into one pak04_dir.vpk — the first choice in
// D2PFX_PRIORITY keeps a file two of them bring.
import catalog from './d2pfx-mods.json';
import { D2PFX_FILE, d2pfxFiles, d2pfxPlan } from '../../scripts/d2pfx-mods.mjs';
import { buildVPK, crc32, readVPK } from '../../scripts/vpk.mjs';
import { readZip } from '../../scripts/zip.mjs';
import { md5 } from '../../scripts/md5.mjs';
import { t } from '../../scripts/i18n.mjs';

export { catalog };
const loads = new Map();
// A mod's game files: [{ path, data }], once a visit.
export function loadMod(mod) {
  if (!loads.has(mod.id)) {
    loads.set(mod.id, (async () => {
      const response = await fetch(mod.file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let bytes = new Uint8Array(await response.arrayBuffer());
      if (mod.inner) bytes = (await readZip(bytes, { want: (name) => name === mod.inner, limit: 200_000_000 })).find((entry) => entry.name === mod.inner)?.data;
      if (!bytes) throw new Error(t('в архиве нет VPK'));
      const files = readVPK(bytes).files.filter((file) => D2PFX_FILE.test(file.path));
      if (!files.length || files.some((file) => crc32(file.data) !== file.crc)) throw new Error(t('файл мода повреждён'));
      return files.map((file) => ({ path: file.path, data: file.data }));
    })().catch((problem) => { loads.delete(mod.id); throw new Error(t('Не удалось скачать мод «{name}» с Dota2PornFX: {error}', { name: mod.label || mod.name, error: problem.message })); }));
  }
  return loads.get(mod.id);
}

// The pack of the chosen mods → Uint8Array (pak04_dir.vpk), or null with nothing chosen. `onProgress(share)`.
export async function d2pfxPack(choice, onProgress = () => {}) {
  const { picks } = d2pfxPlan(choice, catalog);
  if (!picks.length) return null;
  let done = 0;
  const picked = await Promise.all(picks.map(async (mod) => { const files = await loadMod(mod); onProgress(++done / picks.length); return { mod, files }; }));
  return buildVPK(d2pfxFiles(picked), { md5 });
}
