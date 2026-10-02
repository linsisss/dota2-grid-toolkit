// Near copies for the moderators (asked for on 2026-10-02): a grid or a menu background that looks like
// one already in the workshop is shown to them as «похожа» with the original beside it. Exact copies
// are refused earlier by their hash (server/catalog-store.mjs duplicate, catalog-backgrounds.mjs).
//
// Grids: each category is one token — its name, its box (10 px steps) and its heroes — and two grids
// are as similar as the share of tokens they have in common (Jaccard), estimated from MinHash signatures
// of GRID_HASHES numbers. A signature is made twice: with the boxes as they are, and moved so the grid
// starts at its top left corner (a copy moved as a whole); the closer of the two pairs counts (one stray
// category in a corner moves the second kind, so the first is kept). Measured on the staging copy of
// the workshop (89 versions, 2026-10-02): different grids, ASCII arts too, stay under 0.21; versions of
// one grid and a re-upload under another name reach 0.42–0.89.
// Backgrounds: difference hashes (64 bits) of frames spread over the video and of the poster; two
// backgrounds are as similar as the share of frames of one that have a close frame (≤ FRAME_BITS
// differing bits) in the other. A dark veil or a light blur keeps the hash; another crop does not.
export const GRID_HASHES = 128;
export const GRID_SIMILAR = 0.35;
export const FRAME_BITS = 10;
export const FRAMES = 8;
export const BACKGROUND_SIMILAR = 0.5;

const normal = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const step = (value) => Math.round((Number(value) || 0) / 10);
// The tokens of a hero_grid_config grid (its first config), a repeated one counted as many times;
// `moved`: the boxes from the grid's top left corner.
export function gridTokens(grid, moved = false) {
  const categories = grid?.configs?.[0]?.categories || [];
  let left = 0, top = 0;
  if (moved && categories.length) {
    left = Infinity; top = Infinity;
    for (const category of categories) { left = Math.min(left, Number(category.x_position) || 0); top = Math.min(top, Number(category.y_position) || 0); }
  }
  const counts = new Map(), tokens = [];
  for (const category of categories) {
    const box = [category.x_position - left, category.y_position - top, category.width, category.height].map(step).join(',');
    const heroes = [...(category.hero_ids || [])].sort((a, b) => a - b).join('.');
    const token = `${normal(category.category_name)}|${box}|${heroes}`, n = counts.get(token) || 0;
    counts.set(token, n + 1);
    tokens.push(`${token}#${n}`);
  }
  return tokens;
}
// 32-bit FNV-1a of a string, then MurmurHash3's finaliser per seed: GRID_HASHES independent hashes.
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const SEEDS = Array.from({ length: GRID_HASHES }, (_, i) => mix(0x9e3779b9 * (i + 1)));
function minhash(tokens) {
  const mins = new Uint32Array(GRID_HASHES).fill(0xffffffff);
  for (const token of tokens) {
    const base = fnv(token);
    for (let i = 0; i < GRID_HASHES; i++) { const h = mix(base ^ SEEDS[i]); if (h < mins[i]) mins[i] = h; }
  }
  return Array.from(mins, (n) => n.toString(16).padStart(8, '0')).join('');
}
// The grid's signature: the MinHash of its boxes as they are, then of the moved ones, as hex
// (8 characters a number, GRID_HASHES numbers each); '' for an empty grid.
export function gridSignature(grid) {
  const tokens = gridTokens(grid);
  return tokens.length ? minhash(tokens) + minhash(gridTokens(grid, true)) : '';
}
const share = (a, b) => {
  let same = 0;
  for (let i = 0; i < a.length; i += 8) if (a.slice(i, i + 8) === b.slice(i, i + 8)) same++;
  return same / (a.length / 8);
};
// The estimated Jaccard similarity of two grids' signatures, 0…1: as they are, or both moved.
export function gridSimilarity(a, b) {
  const half = GRID_HASHES * 8;
  if (!a || !b || a.length !== half * 2 || b.length !== half * 2) return 0;
  return Math.max(share(a.slice(0, half), b.slice(0, half)), share(a.slice(half), b.slice(half)));
}

// A frame's difference hash: `gray` is 9 × 8 brightness values (rows of 9); each bit says whether a
// pixel is brighter than its right neighbour. Hex, 16 characters; null for a flat frame (nothing to
// compare: black, one colour).
export function frameHash(gray) {
  let min = 255, max = 0;
  for (const v of gray) { if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 8) return null;
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}
export function hammingHex(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}
// The share of frames of the shorter list that have a close frame in the other, 0…1.
export function framesSimilarity(a, b) {
  const one = (a || []).filter(Boolean), two = (b || []).filter(Boolean);
  if (!one.length || !two.length) return 0;
  const [few, many] = one.length <= two.length ? [one, two] : [two, one];
  return few.filter((hash) => many.some((other) => hammingHex(hash, other) <= FRAME_BITS)).length / few.length;
}
