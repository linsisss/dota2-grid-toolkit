// Dotadle's numbers for an account, apart from server/dotadle.mjs (which draws pictures) so the profiles
// (server/profiles.mjs, the streak badges) can count them without loading the canvas.
export const DOTADLE_TRIES = 6;
// Finished games only: played, won, the current streak (today's game, or up to yesterday while today's
// is not over), the best one, and how many tries the wins took.
export function dotadleStats(store, account, today) {
  const dist = Array(DOTADLE_TRIES).fill(0);
  const rows = store.all('SELECT number, guesses, solved FROM dotadle_plays WHERE account=? ORDER BY number', account)
    .map((row) => ({ number: row.number, tries: JSON.parse(row.guesses).length, solved: !!row.solved })).filter((row) => row.solved || row.tries >= DOTADLE_TRIES);
  let best = 0, run = 0, last = null;
  for (const row of rows) {
    run = row.solved ? (last !== null && row.number === last + 1 && run > 0 ? run + 1 : 1) : 0;
    if (row.solved) dist[row.tries - 1] += 1;
    best = Math.max(best, run); last = row.number;
  }
  const end = rows.at(-1), streak = end && end.solved && end.number >= today - 1 ? run : 0;
  return { played: rows.length, won: rows.filter((row) => row.solved).length, streak, best, dist };
}
// The best streak, 0 before the account ever played (or before the game's tables exist).
export function dotadleBest(store, account) {
  if (!store.get("SELECT 1 x FROM sqlite_master WHERE name='dotadle_plays'")) return 0;
  return dotadleStats(store, account, Infinity).best;
}
