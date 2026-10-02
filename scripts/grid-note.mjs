// Every hero_grid_config.json the site hands out says where it was made (asked for on 02.10.2026):
// downloads from the editor and the workshop, and the file a PowerShell command writes. JSON has no
// comments, so the note is a key of its own, first in the file. Dota reads only version and configs
// (scripts/core.mjs importDota does the same) and drops the key when it saves the file itself.
export const GRID_NOTE_KEY = '_comment';
export const GRID_NOTE = 'Сетка создана и скачана с gridstudio.me';
// The grid with the note first; `note`: the page's language (t(GRID_NOTE)).
export function withGridNote(grid, note = GRID_NOTE) {
  const { [GRID_NOTE_KEY]: _old, ...rest } = grid;
  return { [GRID_NOTE_KEY]: note, ...rest };
}
// The server keeps a note the page put (in its language) and adds one where there is none.
export const ensureGridNote = (grid) => (typeof grid[GRID_NOTE_KEY] === 'string' && grid[GRID_NOTE_KEY].length <= 200 ? withGridNote(grid, grid[GRID_NOTE_KEY]) : withGridNote(grid));
