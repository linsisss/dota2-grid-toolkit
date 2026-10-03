// Grids put into Dota by a PowerShell command (docs/steam-folder.md «Установка командой»): the page
// sends the hero_grid_config.json it would download and gets an address; the command
// `irm <address> | iex` (scripts/installer.mjs installCommand) fetches a script with the grid inside
// (gridScript). Kept GRID_INSTALL_TTL in the catalog database (a restart keeps them); the same grid
// in the same language keeps its address, sending it again only extends the week. Nothing else about
// the sender is stored. A menu background's or font's pack is uploaded by the page (server/install-packs.mjs);
// its command's address carries the pack's SHA-256 and size (bg-<sha256>-<size>, font-<sha256>-<size>),
// and the script downloads it from <restoreAddress>file/<kind>-<sha256> and checks it.
import { createHash, createHmac } from 'node:crypto';
import { CatalogError } from './catalog-store.mjs';
import { ensureGridNote } from '../scripts/grid-note.mjs';
import { backgroundRemoveScript, backgroundScript, fontRemoveScript, fontScript, gridExpiredScript, gridRestoreScript, gridScript } from '../scripts/installer.mjs';

export const GRID_INSTALL_TTL = 7 * 86_400_000;
// nginx takes 9 MB for /api/catalog/ (deploy/nginx*.conf); a grid file of up to 100 grids fits.
export const GRID_INSTALL_BYTES = 8_900_000;
// The file as Dota keeps it: the stored grid, compact, UTF-8 without a BOM.
const gridBytes = (json) => Buffer.from(JSON.stringify(JSON.parse(json)), 'utf8');

// The hero_grid_config.json shape Dota reads, compact, with the site's note first (scripts/grid-note.mjs);
// anything else is refused.
function cleanGrid(grid) {
  const configs = grid?.configs;
  if (!grid || typeof grid !== 'object' || Array.isArray(grid) || !Array.isArray(configs) || !configs.length || configs.length > 100
    || !configs.every((config) => config && typeof config === 'object' && Array.isArray(config.categories)))
    throw new CatalogError(400, 'Это не файл сеток Dota.');
  const json = JSON.stringify(ensureGridNote(grid));
  if (Buffer.byteLength(json) > GRID_INSTALL_BYTES) throw new CatalogError(413, 'Сетка слишком большая для команды. Скачай её файлом.');
  return json;
}

export class GridInstalls {
  constructor(store, salt) {
    this.store = store; this.salt = salt;
    store.db.exec('CREATE TABLE IF NOT EXISTS installs(id TEXT PRIMARY KEY, grid TEXT NOT NULL, lang TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL)');
  }
  // → { id, expires }
  save(grid, language) {
    const json = cleanGrid(grid), lang = language === 'en' ? 'en' : 'ru', now = this.store.now();
    const id = createHmac('sha256', this.salt).update(`install:${lang}:${json}`).digest('base64url').slice(0, 16);
    this.store.run('DELETE FROM installs WHERE expires < ?', now);
    this.store.run('INSERT INTO installs(id,grid,lang,created,expires) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires',
      id, json, lang, now, now + GRID_INSTALL_TTL);
    return { id, expires: now + GRID_INSTALL_TTL };
  }
  // The script an address answers: the grid's, the restore one ('restore', 'restore-en'), or a line
  // that the command is out of date (in the page's language when it was made, else Russian).
  script(id, restoreAddress) {
    if (id === 'restore' || id === 'restore-en') return gridRestoreScript(id === 'restore-en' ? 'en' : 'ru');
    if (id === 'bg-remove' || id === 'bg-remove-en') return backgroundRemoveScript(id === 'bg-remove-en' ? 'en' : 'ru');
    const pack = /^bg-([0-9a-f]{64})-([1-9][0-9]{0,8})(-en)?$/.exec(id);
    if (pack) return backgroundScript({ sha256: pack[1], size: Number(pack[2]), url: `${restoreAddress}file/bg-${pack[1]}` },
      { language: pack[3] ? 'en' : 'ru', remove: `${restoreAddress}${pack[3] ? 'bg-remove-en' : 'bg-remove'}` });
    // The font's archive, the same way (font-<sha256>-<size>, font-remove).
    if (id === 'font-remove' || id === 'font-remove-en') return fontRemoveScript(id === 'font-remove-en' ? 'en' : 'ru');
    const font = /^font-([0-9a-f]{64})-([1-9][0-9]{0,8})(-en)?$/.exec(id);
    if (font) return fontScript({ sha256: font[1], size: Number(font[2]), url: `${restoreAddress}file/font-${font[1]}` },
      { language: font[3] ? 'en' : 'ru', remove: `${restoreAddress}${font[3] ? 'font-remove-en' : 'font-remove'}` });
    const row = /^[A-Za-z0-9_-]{16}$/.test(id) && this.store.get('SELECT grid, lang FROM installs WHERE id=? AND expires>=?', id, this.store.now());
    if (!row) return gridExpiredScript('ru');
    const bytes = gridBytes(row.grid);
    return gridScript({ url: `${restoreAddress}file/grid-${id}`, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length },
      { language: row.lang, restore: `${restoreAddress}${row.lang === 'en' ? 'restore-en' : 'restore'}` });
  }
  // The hero_grid_config.json the script downloads (…/install/file/grid-<id>), while the command lives.
  file(id) {
    const row = /^[A-Za-z0-9_-]{16}$/.test(id) && this.store.get('SELECT grid FROM installs WHERE id=? AND expires>=?', id, this.store.now());
    return row ? gridBytes(row.grid) : null;
  }
}
