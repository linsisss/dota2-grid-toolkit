// The d2pfx cursor packs in the browser (scripts/d2pfx.mjs says what and where): the list from d2pfx's
// own index, a pack from its own ZIP on GitHub — fetched straight from there (both answer with
// Access-Control-Allow-Origin: *), unpacked here and turned into the creator's roles.
import { D2PFX_INDEX, d2pfxCursorPacks } from '../../scripts/d2pfx.mjs';
import { CURSOR_SIZES, packCursors } from '../../scripts/dota-cursor.mjs';
import { readZip } from '../../scripts/zip.mjs';
import { t } from '../../scripts/i18n.mjs';
import { canvasFromRGBA } from './cursor-render.js';

async function json(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
let index = null;
// The packs, once a visit: [{ name, preview, file, page, date, credits }].
export function loadPacks() {
  index ||= Promise.all([json(D2PFX_INDEX.mods), json(D2PFX_INDEX.constants)]).then(([mods, constants]) => d2pfxCursorPacks(mods, constants))
    .catch((problem) => { index = null; throw new Error(t('Не удалось загрузить список паков с Dota2PornFX: {error}', { error: problem.message })); });
  return index;
}

const packs = new Map();
// A pack's cursors as the creator's roles: { <id>: { image, frames, scale: 1, x: .5, y: .5, rot: 0, hot, pack: true } }.
// The image the creator moves is the pack's largest picture up to 256 px; its own sizes stay as they are.
export function loadPack(pack) {
  if (!packs.has(pack.file)) {
    packs.set(pack.file, (async () => {
      const response = await fetch(pack.file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const found = packCursors(await readZip(bytes, { want: (name) => /\.(bmp|res)$/i.test(name), limit: 40_000_000 }));
      const roles = {};
      for (const [id, { frames, hot }] of Object.entries(found)) {
        const usable = frames.filter((frame) => frame.width <= 256 && frame.height <= 256);
        if (!usable.length) continue;
        const own = usable.map((frame) => ({ width: frame.width, height: frame.height, canvas: canvasFromRGBA(frame) }));
        // Each of Dota's sizes from the pack's picture of that size, when it has one.
        const exact = own.filter((frame) => frame.width === frame.height && CURSOR_SIZES.includes(frame.width));
        roles[id] = { image: own[0].canvas, frames: exact, scale: 1, x: 0.5, y: 0.5, rot: 0, hot, pack: true, name: pack.name };
      }
      if (!Object.keys(roles).length) throw new Error(t('В паке нет курсоров Dota.'));
      return roles;
    })().catch((problem) => { packs.delete(pack.file); throw new Error(t('Не удалось загрузить пак «{name}»: {error}', { name: pack.name, error: problem.message })); }));
  }
  return packs.get(pack.file);
}
